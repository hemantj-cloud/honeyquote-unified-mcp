import { createHash, createSign, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Injectable } from '@nitrostack/core';
import { TicketRepository } from '../persistence/ticket.repository.js';
import { MongoService } from '../persistence/mongo.service.js';
import type { SeedTicketContext } from '../persistence/seed-data.js';
import { resolveSigningPublicUrl } from '../../config/app-urls.js';

const DEFAULT_RENEWAL_DOCUMENT_ID = 'policy-2026';
const SIGNING_LINK_TTL_MS = 24 * 60 * 60 * 1000;
const STATUS_CACHE_MS = 5000;
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export type SignatureState = 'signed' | 'pending' | 'declined' | 'voided';

export interface SignatureStatusResult {
  ok: true;
  ticketId: string;
  signed: boolean;
  signatureStatus: SignatureState;
}

interface SigningLink {
  tokenHash: string;
  ticketId: string;
  envelopeId: string;
  documentId: string;
  expiresAt: Date;
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Signing is not configured (${name} missing)`);
  return value;
}

/**
 * Embedded DocuSign signing for the renewal document. The customer is the only
 * signer. Signing links handed to the chat are one-time tokens stored as hashes;
 * /signing/start exchanges one for a DocuSign recipient view, and completion is
 * only ever read back from DocuSign — never taken from the browser.
 */
@Injectable({ deps: [TicketRepository, MongoService] })
export class SigningService {
  private static memoryLinks = new Map<string, SigningLink>();
  private static statusCache = new Map<string, { at: number; result: SignatureStatusResult }>();
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly mongo?: MongoService
  ) {}

  private documentIdOf(ticket: SeedTicketContext): string {
    return ticket.renewalDocumentId || process.env.HQ_RENEWAL_DOCUMENT_ID || DEFAULT_RENEWAL_DOCUMENT_ID;
  }

  private isSigned(ticket: SeedTicketContext, documentId: string): boolean {
    return (
      ticket.signatureStatus === 'signed' &&
      (!ticket.signatureDocumentId || ticket.signatureDocumentId === documentId)
    );
  }

  private chatLink(ticketId: string): string | null {
    const raw = process.env.HQ_CHAT_RETURN_URL?.trim();
    if (!raw) return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:') return null;
      url.searchParams.set('conversationId', `CONV-${ticketId}`);
      return url.href;
    } catch {
      return null;
    }
  }

  private async docusignAccessToken(): Promise<string> {
    if (!process.env.DOCUSIGN_JWT_CLIENT_ID) return required('DOCUSIGN_ACCESS_TOKEN');
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) return this.accessToken;

    const oauth = new URL(process.env.DOCUSIGN_OAUTH_SERVER?.trim() || 'https://account-d.docusign.com');
    if (oauth.protocol !== 'https:' || !/^account(-d)?\.docusign\.com$/.test(oauth.hostname)) {
      throw new Error('Invalid DocuSign OAuth server');
    }
    const now = Math.floor(Date.now() / 1000);
    const encode = (data: object) => Buffer.from(JSON.stringify(data)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
      iss: required('DOCUSIGN_JWT_CLIENT_ID'),
      sub: required('DOCUSIGN_IMPERSONATED_USER_GUID'),
      aud: oauth.hostname,
      iat: now,
      exp: now + 600,
      scope: 'signature impersonation',
    })}`;
    const privateKey = required('DOCUSIGN_PRIVATE_KEY').replace(/\\n/g, '\n');
    const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey).toString('base64url');

    const res = await fetch(new URL('/oauth/token', oauth), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signature}`,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`DocuSign authentication failed (HTTP ${res.status}) ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error('DocuSign did not return an access token');
    this.accessToken = data.access_token;
    this.accessTokenExpiresAt = Date.now() + Math.max(60, Number(data.expires_in) - 60) * 1000;
    return this.accessToken;
  }

  private async docusignRequest(suffix: string, body?: unknown): Promise<any> {
    const base = new URL(required('DOCUSIGN_API_BASE_URL'));
    if (base.protocol !== 'https:' || !/(^|\.)docusign\.(net|com)$/.test(base.hostname)) {
      throw new Error('Invalid DocuSign API base URL');
    }
    const account = encodeURIComponent(required('DOCUSIGN_ACCOUNT_ID'));
    const res = await fetch(`${base.href.replace(/\/$/, '')}/v2.1/accounts/${account}/envelopes${suffix}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${await this.docusignAccessToken()}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`DocuSign request failed (HTTP ${res.status}) ${detail.slice(0, 200)}`);
    }
    return res.json();
  }

  private policyPdfPath(documentId: string): string | null {
    const names = [process.env.HQ_POLICY_PDF_DIR?.trim(), 'policy-documents'].filter((name): name is string =>
      Boolean(name)
    );
    for (const name of names) {
      const dirs = path.isAbsolute(name)
        ? [name]
        : [path.resolve(process.cwd(), name), path.resolve(PROJECT_ROOT, name)];
      const file = dirs.map((dir) => path.join(dir, `${documentId}.pdf`)).find((candidate) => fs.existsSync(candidate));
      if (file) return file;
    }
    return null;
  }

  hasPolicyDocument(documentId = process.env.HQ_RENEWAL_DOCUMENT_ID || DEFAULT_RENEWAL_DOCUMENT_ID): boolean {
    return this.policyPdfPath(documentId) !== null;
  }

  private async readPolicyPdf(documentId: string): Promise<Buffer> {
    if (!/^[a-zA-Z0-9_-]+$/.test(documentId)) throw new Error('Invalid policy document ID');
    const pdfPath = this.policyPdfPath(documentId);
    if (!pdfPath) throw new Error(`Policy document ${documentId}.pdf not found`);
    const pdf = await readFile(pdfPath);
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Policy document is not a PDF');
    return pdf;
  }

  private async createEnvelope(ticket: SeedTicketContext, documentId: string, force: boolean): Promise<string> {
    const email = ticket.recipientEmail;
    if (!email) throw new Error('No customer email on file for signing');
    const pdf = await this.readPolicyPdf(documentId);
    const idempotencyKey = `${ticket.ticketId}:${documentId}:${ticket.receiptId || ''}${force ? `:${Date.now()}` : ''}`;
    const result = await this.docusignRequest('', {
      emailSubject: 'Please sign your policy document',
      status: 'sent',
      transactionId: digest(idempotencyKey).slice(0, 32),
      documents: [
        { documentBase64: pdf.toString('base64'), name: 'Policy document.pdf', fileExtension: 'pdf', documentId: '1' },
      ],
      recipients: {
        signers: [
          {
            email,
            name: ticket.customerName,
            recipientId: '1',
            clientUserId: ticket.ticketId,
            tabs: {
              signHereTabs: [
                { anchorString: required('DOCUSIGN_SIGNATURE_ANCHOR'), anchorUnits: 'pixels', anchorIgnoreIfNotPresent: 'false' },
              ],
            },
          },
        ],
      },
    });
    if (!result?.envelopeId) throw new Error('DocuSign did not return an envelope');
    return result.envelopeId;
  }

  async signatureStatus(ticketId: string): Promise<SignatureStatusResult> {
    const cached = SigningService.statusCache.get(ticketId);
    if (cached && Date.now() - cached.at < STATUS_CACHE_MS) return cached.result;

    const ticket = await this.ticketRepo.getTicketContext(ticketId);
    const documentId = this.documentIdOf(ticket);
    let state: SignatureState = 'pending';

    if (this.isSigned(ticket, documentId)) {
      state = 'signed';
    } else if (ticket.envelopeId && ticket.signatureDocumentId === documentId) {
      const envelope = `/${encodeURIComponent(ticket.envelopeId)}`;
      const [envelopeData, recipients] = await Promise.all([
        this.docusignRequest(envelope),
        this.docusignRequest(`${envelope}/recipients`),
      ]);
      const insured = String(recipients?.signers?.find((s: any) => s.recipientId === '1')?.status || '').toLowerCase();
      const overall = String(envelopeData?.status || '').toLowerCase();
      if (insured === 'completed' || overall === 'completed') state = 'signed';
      else if (insured === 'declined' || overall === 'declined') state = 'declined';
      else if (insured === 'voided' || overall === 'voided') state = 'voided';

      if (state === 'signed') {
        await this.ticketRepo.updateTicket(ticketId, {
          signatureStatus: 'signed',
          signatureRequired: false,
          signatureCompletedAt: ticket.signatureCompletedAt || new Date().toISOString(),
        });
        await this.ticketRepo.appendConversationTurn(ticketId, 'system', `Renewal document signed (envelope ${ticket.envelopeId}).`);
      } else if (state !== 'pending') {
        await this.ticketRepo.updateTicket(ticketId, { signatureStatus: state });
      }
    }

    const result: SignatureStatusResult = { ok: true, ticketId, signed: state === 'signed', signatureStatus: state };
    SigningService.statusCache.set(ticketId, { at: Date.now(), result });
    return result;
  }

  /**
   * Ensures a current envelope exists for the ticket's renewal document and returns
   * a one-time link that opens it. `force` issues a fresh envelope even after signing.
   */
  async prepareSignature(
    ticketId: string,
    { force = false }: { force?: boolean } = {}
  ): Promise<{ ok: true; ticketId: string; signed: boolean; envelopeId?: string; signingUrl?: string }> {
    SigningService.statusCache.delete(ticketId);
    const ticket = await this.ticketRepo.getTicketContext(ticketId);
    const documentId = this.documentIdOf(ticket);

    let envelopeId = !force && ticket.signatureDocumentId === documentId ? ticket.envelopeId || null : null;
    if (envelopeId) {
      const status = await this.signatureStatus(ticketId);
      if (status.signed) return { ok: true, ticketId, signed: true, envelopeId };
      if (status.signatureStatus === 'declined' || status.signatureStatus === 'voided') envelopeId = null;
    } else if (!force && this.isSigned(ticket, documentId)) {
      return { ok: true, ticketId, signed: true };
    }

    if (!envelopeId) {
      envelopeId = await this.createEnvelope(ticket, documentId, force);
      await this.ticketRepo.updateTicket(ticketId, {
        envelopeId,
        signatureDocumentId: documentId,
        signatureStatus: 'PENDING_CUSTOMER_SIGNATURE',
        signatureRequired: true,
        signatureCompletedAt: null,
        esignSent: true,
      });
      SigningService.statusCache.delete(ticketId);
      await this.ticketRepo.appendConversationTurn(ticketId, 'system', `DocuSign envelope ${envelopeId} created for ${documentId}.`);
    }

    const token = randomBytes(32).toString('base64url');
    await this.saveLink({
      tokenHash: digest(token),
      ticketId,
      envelopeId,
      documentId,
      expiresAt: new Date(Date.now() + SIGNING_LINK_TTL_MS),
    });
    const signingUrl = new URL('/signing/start', resolveSigningPublicUrl());
    signingUrl.searchParams.set('token', token);
    return { ok: true, ticketId, signed: false, envelopeId, signingUrl: signingUrl.href };
  }

  private async saveLink(link: SigningLink): Promise<void> {
    const col = this.mongo?.isOnline() ? this.mongo.getCollection('signingLinks') : null;
    if (col) {
      try {
        await col.insertOne({ ...link });
        return;
      } catch (err: any) {
        console.warn(`[signing] Could not persist signing link: ${err.message}. Keeping it in memory.`);
      }
    }
    SigningService.memoryLinks.set(link.tokenHash, link);
  }

  private async linkFor(token: unknown): Promise<SigningLink> {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid signing link');
    const tokenHash = digest(token);
    const col = this.mongo?.isOnline() ? this.mongo.getCollection('signingLinks') : null;
    const link =
      ((col ? await col.findOne({ tokenHash, expiresAt: { $gt: new Date() } }) : null) as SigningLink | null) ||
      SigningService.memoryLinks.get(tokenHash) ||
      null;
    if (!link || new Date(link.expiresAt).getTime() <= Date.now()) throw new Error('Signing link expired');
    const ticket = await this.ticketRepo.getTicketContext(link.ticketId);
    if (ticket.envelopeId !== link.envelopeId || this.documentIdOf(ticket) !== link.documentId) {
      throw new Error('Signing link is no longer current');
    }
    return link;
  }

  /** Exchanges a signing token for the DocuSign embedded-signing URL. */
  async recipientViewUrl(token: unknown): Promise<string> {
    const link = await this.linkFor(token);
    const envelope = `/${encodeURIComponent(link.envelopeId)}`;
    const recipients = await this.docusignRequest(`${envelope}/recipients`);
    const signer = recipients?.signers?.find((s: any) => s.recipientId === '1');
    if (!signer?.clientUserId) throw new Error('Embedded signer is not configured');

    const returnUrl = new URL('/signing/return', resolveSigningPublicUrl());
    returnUrl.searchParams.set('token', String(token));
    const view = await this.docusignRequest(`${envelope}/views/recipient`, {
      returnUrl: returnUrl.href,
      authenticationMethod: 'none',
      email: signer.email,
      userName: signer.name,
      recipientId: signer.recipientId,
      clientUserId: signer.clientUserId,
    });
    const target = new URL(view.url);
    if (target.protocol !== 'https:' || !/(^|\.)docusign\.(net|com)$/.test(target.hostname)) {
      throw new Error('Invalid DocuSign signing URL');
    }
    return target.href;
  }

  /** Status after DocuSign redirects the signer back, plus the chat link to return to. */
  async returnState(token: unknown): Promise<{ state: SignatureState; chatUrl: string | null }> {
    const link = await this.linkFor(token);
    SigningService.statusCache.delete(link.ticketId);
    const status = await this.signatureStatus(link.ticketId);
    return { state: status.signatureStatus, chatUrl: this.chatLink(link.ticketId) };
  }
}

export function signingReturnHtml(state: SignatureState, chatUrl: string | null): string {
  const copy: Record<SignatureState, { icon: string; title: string; msg: string }> = {
    signed: {
      icon: '&#9989;',
      title: 'Document signed',
      msg: 'Your signature was recorded. This tab will close automatically &mdash; your chat already shows the signed document.',
    },
    declined: {
      icon: '&#9888;&#65039;',
      title: 'Signing declined',
      msg: 'The signature request was declined. Return to your chat if you want to try again.',
    },
    voided: {
      icon: '&#9888;&#65039;',
      title: 'Request expired',
      msg: 'This signing request is no longer valid. Return to your chat to request a new one.',
    },
    pending: {
      icon: '&#8987;',
      title: 'Signature pending',
      msg: 'We did not see a completed signature yet. If you finished signing, the chat will update in a moment.',
    },
  };
  const c = copy[state] || copy.pending;
  const link = chatUrl
    ? `<a href="${chatUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">Return to chat</a>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Signing status</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f2ec;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:40px 32px;max-width:400px;text-align:center;box-shadow:0 10px 25px -5px rgba(0,0,0,.08)}
  .icon{font-size:44px;margin-bottom:14px}
  h1{font-size:19px;font-weight:700;color:#0f172a;margin:0 0 8px}
  p{font-size:13px;color:#64748b;line-height:1.55;margin:0}
  a{display:inline-block;margin-top:16px;font-size:13px;color:#2563eb;text-decoration:none;font-weight:600}
</style></head>
<body>
  <div class="card">
    <div class="icon">${c.icon}</div>
    <h1>${c.title}</h1>
    <p>${c.msg}</p>
    ${link}
  </div>
  <script>setTimeout(function () { try { window.close(); } catch (e) {} }, 1200);</script>
</body>
</html>`;
}
