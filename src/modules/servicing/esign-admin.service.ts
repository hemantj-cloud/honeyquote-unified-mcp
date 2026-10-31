import { Injectable } from '@nitrostack/core';
import { TicketRepository } from '../persistence/ticket.repository.js';
import { EmailService } from '../integrations/email.service.js';
import type { SeedTicketContext } from '../persistence/seed-data.js';
import { SigningService } from './signing.service.js';

export type EsignChannel = 'email' | 'sms';

export interface EsignAdminTicket {
  ticketId: string;
  customerName: string;
  policyNumber: string;
  email: string;
  phone: string;
  renewalDate: string;
  daysUntilExpiry: number | null;
  signatureStatus: string;
  esignSent: boolean;
  esignSentAt: string | null;
  esignChannel: EsignChannel | null;
}

export interface EsignAdminSendResult {
  ok: boolean;
  statusCode: number;
  ticketId: string;
  channel?: EsignChannel;
  error?: string;
}

/** Calendar days until YYYY-MM-DD. Null when the date is missing or not a real calendar day. */
export function calendarDaysUntil(yyyyMmDd: string | undefined, now = new Date()): number | null {
  const date = String(yyyyMmDd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const expiry = new Date(Date.UTC(year, month - 1, day));
  if (expiry.toISOString().slice(0, 10) !== date) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((expiry.getTime() - today) / 86400000);
}

function isRenewalComplete(ticket: SeedTicketContext): boolean {
  return ticket.status === 'IN_FORCE_RENEWED' || ticket.paymentStatus === 'PAID';
}

function isSigned(ticket: SeedTicketContext): boolean {
  return String(ticket.signatureStatus || '').toLowerCase() === 'signed';
}

/**
 * Paid renewal whose next renewal date is outside the 1–30 day window and still needs a signature.
 * A missing renewal date is outside that window.
 */
export function isAdminOutreachTicket(ticket: SeedTicketContext, now = new Date()): boolean {
  if (!isRenewalComplete(ticket) || isSigned(ticket)) return false;
  const days = calendarDaysUntil(ticket.renewalDate, now);
  if (days !== null && days > 0 && days <= 30) return false;
  return true;
}

const DEFAULT_ESIGN_CHAT_URL =
  'https://nitrochat-honeyquote-chatapp-chat-6ae1d1b-abhijits-org-33666fb0.app.nitrocloud.ai/try-embed';

/** Outreach chat link. Separate from HQ_CHAT_RETURN_URL, which DocuSign return rewrites off NitroChat. */
function chatReopenUrl(): string | null {
  const raw = process.env.HQ_ESIGN_CHAT_URL?.trim() || DEFAULT_ESIGN_CHAT_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.href;
  } catch {
    return null;
  }
}

function firstNameOf(name: string | undefined): string {
  return name?.trim().split(/\s+/)[0] || 'there';
}

function messageBody(name: string | undefined, signingUrl: string, chatUrl: string): string {
  const firstName = firstNameOf(name);
  return (
    `Hi ${firstName},\n\n` +
    `Your trial e-sign document is ready. Click below to review and sign in DocuSign:\n\n` +
    `${signingUrl}\n\n` +
    `After signing, you can see the policy updates here:\n\n` +
    `${chatUrl}\n\n` +
    `This link expires in 24 hours.\n\n` +
    `— HoneyQuote Servicing`
  );
}

@Injectable({ deps: [TicketRepository, SigningService, EmailService] })
export class EsignAdminService {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly signingService: SigningService,
    private readonly emailService: EmailService
  ) {}

  async listTickets(now = new Date()): Promise<EsignAdminTicket[]> {
    const tickets = await this.ticketRepo.listTickets();
    return tickets
      .filter((ticket) => isAdminOutreachTicket(ticket, now))
      .map((ticket) => this.toRow(ticket, now))
      .sort((a, b) => String(a.renewalDate).localeCompare(String(b.renewalDate)));
  }

  async send(ticketId: string, channel: EsignChannel): Promise<EsignAdminSendResult> {
    const chatUrl = chatReopenUrl();
    if (!chatUrl) {
      return { ok: false, statusCode: 503, ticketId, error: 'Chat link is not configured.' };
    }

    let prepared: Awaited<ReturnType<SigningService['prepareSignature']>>;
    try {
      prepared = await this.signingService.prepareSignature(ticketId);
    } catch (err: any) {
      console.warn('[esign-admin] prepare failed:', err?.message || err);
      return { ok: false, statusCode: 503, ticketId, error: 'Unable to prepare the signing link.' };
    }

    if (prepared.signed || !prepared.signingUrl) {
      return { ok: false, statusCode: 409, ticketId, error: 'This document is already signed.' };
    }

    const ticket = await this.ticketRepo.getTicketContext(ticketId);
    const body = messageBody(ticket.customerName, prepared.signingUrl, chatUrl);

    const delivered =
      channel === 'email'
        ? await this.deliverEmail(ticket.recipientEmail, body)
        : await this.deliverSms(ticket.customerPhone, body);

    if (!delivered.ok) {
      return { ok: false, statusCode: delivered.statusCode, ticketId, channel, error: delivered.error };
    }

    await this.ticketRepo.updateTicket(ticketId, {
      esignSent: true,
      esignSentAt: new Date().toISOString(),
      esignChannel: channel,
    });

    return { ok: true, statusCode: 200, ticketId, channel };
  }

  private toRow(ticket: SeedTicketContext, now: Date): EsignAdminTicket {
    const channel = ticket.esignChannel === 'email' || ticket.esignChannel === 'sms' ? ticket.esignChannel : null;
    return {
      ticketId: ticket.ticketId,
      customerName: ticket.customerName || '',
      policyNumber: ticket.policyNumber || '',
      email: ticket.recipientEmail || '',
      phone: ticket.customerPhone || '',
      renewalDate: String(ticket.renewalDate || '').slice(0, 10),
      daysUntilExpiry: calendarDaysUntil(ticket.renewalDate, now),
      signatureStatus: ticket.signatureStatus || 'pending',
      esignSent: ticket.esignSent === true,
      esignSentAt: ticket.esignSentAt || null,
      esignChannel: channel,
    };
  }

  private async deliverEmail(
    to: string | undefined,
    body: string
  ): Promise<{ ok: true } | { ok: false; statusCode: number; error: string }> {
    const email = String(to || '').trim();
    if (!email) return { ok: false, statusCode: 400, error: 'No email address on this ticket.' };
    const result = await this.emailService.sendEmail({
      to: email,
      subject: 'HoneyQuote: Sign your insurance document',
      body,
    });
    if (!result.success || result.simulated) {
      return { ok: false, statusCode: 503, error: 'Email was not sent.' };
    }
    return { ok: true };
  }

  private async deliverSms(
    to: string | undefined,
    body: string
  ): Promise<{ ok: true } | { ok: false; statusCode: number; error: string }> {
    const phone = String(to || '').trim();
    if (!phone) return { ok: false, statusCode: 400, error: 'No phone number on this ticket.' };

    const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const token = process.env.TWILIO_AUTH_TOKEN?.trim();
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
    const from = process.env.TWILIO_FROM_NUMBER?.trim() || process.env.TWILIO_PHONE_NUMBER?.trim();
    if (!sid || !token || (!messagingServiceSid && !from)) {
      return { ok: false, statusCode: 503, error: 'SMS is not configured.' };
    }

    const params = new URLSearchParams({ To: phone, Body: body });
    if (messagingServiceSid) params.set('MessagingServiceSid', messagingServiceSid);
    else params.set('From', from!);

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
          signal: AbortSignal.timeout(20000),
        }
      );
      if (!response.ok) {
        let code = '';
        let message = '';
        try {
          const errBody = (await response.json()) as { code?: number | string; message?: string };
          if (errBody.code != null) code = String(errBody.code);
          if (typeof errBody.message === 'string') message = errBody.message;
        } catch {
          // Twilio sometimes returns a non-JSON error page.
        }
        console.warn(
          `[esign-admin] SMS failed (HTTP ${response.status}${code ? ` ${code}` : ''}${message ? `: ${message}` : ''})`
        );
        const detail = [code ? `Twilio ${code}` : '', message].filter(Boolean).join(': ');
        return {
          ok: false,
          statusCode: 503,
          error: detail || 'SMS provider could not send the signing links.',
        };
      }
      const data = (await response.json()) as { sid?: string };
      if (!data.sid) return { ok: false, statusCode: 503, error: 'SMS delivery was not accepted.' };
      return { ok: true };
    } catch (err: any) {
      console.warn('[esign-admin] SMS request failed:', err?.message || err);
      return { ok: false, statusCode: 503, error: 'SMS provider could not send the signing links.' };
    }
  }
}
