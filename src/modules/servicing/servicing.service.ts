import { Injectable } from '@nitrostack/core';
import { TicketRepository } from '../persistence/ticket.repository.js';
import { EmailService } from '../integrations/email.service.js';
import type { UploadedDocumentRecord } from '../persistence/seed-data.js';
import type { HqTicketContext } from './servicing.types.js';
import { DOCUSIGN_SIGN_INVITE, POLICY_EXPIRY_RENEWAL_INVITE } from './servicing.messages.js';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg']);
const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'application/octet-stream',
]);

export interface DocumentUploadResult {
  ok: boolean;
  statusCode: number;
  error?: string;
  ticketId: string;
  documentStatus: 'OPEN' | 'COMPLETE';
  missingDocuments: string[];
  uploadedDocuments: UploadedDocumentRecord[];
  upload?: UploadedDocumentRecord;
}

@Injectable({ deps: [TicketRepository, EmailService] })
export class ServicingService {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly emailService: EmailService
  ) {}

  async getTicketContext(ticketId?: string): Promise<HqTicketContext> {
    const id = ticketId || 'HQ-DEMO-001';
    return await this.ticketRepo.getTicketContext(id);
  }

  async appendConversationTurn(
    ticketId: string,
    sender: 'customer' | 'assistant' | 'system',
    body: string
  ): Promise<void> {
    const id = ticketId || 'HQ-DEMO-001';
    await this.ticketRepo.appendConversationTurn(id, sender, body);
  }

  getRenewalInvitation(ctx: HqTicketContext, now = new Date()) {
    const date = String(ctx.renewalDate || '').slice(0, 10);
    const [year, month, day] = date.split('-').map(Number);
    const expiry = new Date(Date.UTC(year, month - 1, day));
    const validDate =
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      Number.isFinite(expiry.getTime()) &&
      expiry.toISOString().slice(0, 10) === date;
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const daysUntilExpiry = validDate ? Math.round((expiry.getTime() - today) / 86400000) : 14;
    // Payment already collected means the term is bound. Do not offer another renewal.
    const isRenewalEligible =
      !this.isPolicyPaid(ctx) &&
      daysUntilExpiry !== undefined &&
      daysUntilExpiry > 0 &&
      daysUntilExpiry <= 30;
    const renewalInvitation = isRenewalEligible
      ? `${POLICY_EXPIRY_RENEWAL_INVITE} Click **Renew Policy**, or type **yes** to continue.`
      : undefined;

    return { daysUntilExpiry, isRenewalEligible, renewalInvitation };
  }

  /** Renewal premium is already collected, so the next step is e-sign, not another renewal. */
  isPolicyPaid(ctx: { status?: string; paymentStatus?: string }): boolean {
    return ctx.status === 'IN_FORCE_RENEWED' || ctx.paymentStatus === 'PAID';
  }

  /**
   * Under-card prompt after payment when the new term still needs a signature.
   * Sign Now on the servicing card opens DocuSign; typing yes generates the link.
   */
  getSigningConsentInvitation(ctx: {
    status?: string;
    paymentStatus?: string;
    signatureStatus?: string;
    customerName?: string;
  }): string | undefined {
    if (!this.isPolicyPaid(ctx) || ctx.signatureStatus === 'signed') return undefined;
    const firstName = ctx.customerName?.trim().split(/\s+/)[0] || 'there';
    return DOCUSIGN_SIGN_INVITE;
  }

  formatPolicySummary(ctx: HqTicketContext): string {
    const carrier = ctx.carrier || 'Citizens';
    const policyNum = ctx.policyNumber || 'HQ-POL-88421';
    const status = ctx.status ? ctx.status.toUpperCase() : 'ACTIVE';
    const effective = ctx.effectiveDate || 'October 15, 2026';
    const renewal = ctx.renewalDate || 'October 15, 2027';

    const dwelling = ctx.coverages?.dwelling
      ? `$${ctx.coverages.dwelling.toLocaleString()}`
      : '$350,000';
    const personal = ctx.coverages?.personalProperty
      ? `$${ctx.coverages.personalProperty.toLocaleString()}`
      : '$175,000';
    const liability = ctx.coverages?.liability
      ? `$${ctx.coverages.liability.toLocaleString()}`
      : '$300,000';

    const hurricane = ctx.deductibles?.hurricane
      ? `$${ctx.deductibles.hurricane.toLocaleString()} (${ctx.deductibles.hurricanePercentage || '2%'})`
      : '$2,500 (2%)';
    const aop = ctx.deductibles?.allOtherPerils
      ? `$${ctx.deductibles.allOtherPerils.toLocaleString()}`
      : '$1,000';

    return (
      `Here are your policy details:\n\n` +
      `• Policy Status: ${status}\n` +
      `• Carrier: ${carrier}\n` +
      `• Policy Number: ${policyNum}\n` +
      `• Term: ${effective} to ${renewal}\n` +
      `• Billing: Direct Homeowner Pay (Stripe)\n\n` +
      `Coverages:\n` +
      `• Dwelling Protection: ${dwelling}\n` +
      `• Personal Property: ${personal}\n` +
      `• Personal Liability: ${liability}\n\n` +
      `Deductibles:\n` +
      `• Hurricane: ${hurricane}\n` +
      `• All Other Perils (AOP): ${aop}`
    );
  }

  formatPendingTasks(ctx: HqTicketContext): string {
    const items: string[] = [];

    if (ctx.signatureRequired && ctx.signatureStatus !== 'signed') {
      items.push(
        ctx.esignSent
          ? '• E-Signature: Request sent; document still awaiting signature.'
          : '• Signature Required: Your policy application requires an electronic signature via DocuSign.'
      );
    } else if (ctx.signatureStatus === 'signed') {
      items.push('• E-Signature: Completed and recorded in file.');
    }

    if (ctx.uploadedDocuments && ctx.uploadedDocuments.length > 0) {
      items.push(
        `• Uploaded documents on file: ${ctx.uploadedDocuments.map((doc) => doc.fileName).join(', ')}`
      );
    }

    if (ctx.missingDocuments && ctx.missingDocuments.length > 0) {
      const labels = ctx.missingDocuments.map((doc) => {
        const text = doc.replace(/[_-]+/g, ' ').trim();
        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
      });
      items.push(`• Supporting Documents: Open until uploaded. Missing: ${labels.join(', ')}`);
    } else {
      items.push('• Supporting Documents: All required documents have been received.');
    }

    if (ctx.paymentStatus === 'PAID') {
      items.push('• Payment: Renewal premium paid via Stripe.');
    }

    if (items.length === 0) {
      return 'All servicing tasks and documentation for your policy are up to date! There are no pending items.';
    }

    return `Here is your current servicing status:\n\n${items.join('\n')}`;
  }

  async sendCertificateOfInsurance(options: {
    ticketId: string;
    email: string;
    name: string;
    policyNumber: string;
    carrier: string;
  }): Promise<{ success: boolean; messageId?: string }> {
    const subject = `Official Certificate of Insurance: Policy #${options.policyNumber} (${options.carrier})`;
    const body =
      `Dear ${options.name || 'Valued Customer'},\n\n` +
      `Attached is your requested Certificate of Insurance (COI) for Homeowners Policy #${options.policyNumber}.\n\n` +
      `Underwriting Carrier: ${options.carrier}\n` +
      `Effective Status: In Force & Verified\n\n` +
      `If you have any questions or require additional mortgage clause updates, please reply directly.\n\n` +
      `Sincerely,\nHoneyQuote Automated Servicing Operations`;

    return await this.emailService.sendEmail({
      to: options.email,
      subject,
      body,
    });
  }

  /** Saves customer corrections to the on-record home details; returns the changed field names. */
  async updatePropertyDetails(
    ticketId: string,
    updates: Partial<HqTicketContext['propertyAttributes']>
  ): Promise<string[]> {
    const changed = Object.entries(updates).filter(([, v]) => v !== undefined && v !== null && v !== '');
    if (!changed.length) return [];

    const ctx = await this.getTicketContext(ticketId);
    const propertyAttributes = {
      ...ctx.propertyAttributes,
      address: ctx.propertyAttributes?.address || ctx.propertyAddress,
      ...Object.fromEntries(changed),
    } as HqTicketContext['propertyAttributes'];

    await this.ticketRepo.updateTicket(ticketId, {
      propertyAttributes,
      propertyAddress: propertyAttributes.address,
    });
    return changed.map(([k]) => k);
  }

  async supportingDocumentStatus(ticketId: string): Promise<DocumentUploadResult> {
    const ticket = await this.getTicketContext(ticketId);
    const missingDocuments = Array.isArray(ticket.missingDocuments) ? ticket.missingDocuments : [];
    const uploadedDocuments = Array.isArray(ticket.uploadedDocuments) ? ticket.uploadedDocuments : [];
    return {
      ok: true,
      statusCode: 200,
      ticketId,
      documentStatus: missingDocuments.length > 0 ? 'OPEN' : 'COMPLETE',
      missingDocuments,
      uploadedDocuments,
    };
  }

  /**
   * Supporting-document intake stays OPEN until the customer uploads a required file.
   * A successful upload is the only path that records the file and advances status.
   */
  async recordSupportingDocument(input: {
    ticketId: string;
    fileName: unknown;
    docType?: unknown;
    contentType?: unknown;
    sizeBytes?: unknown;
  }): Promise<DocumentUploadResult> {
    const ticketId = input.ticketId;
    const ticket = await this.getTicketContext(ticketId);
    const missingDocuments = Array.isArray(ticket.missingDocuments) ? [...ticket.missingDocuments] : [];
    const uploadedDocuments = Array.isArray(ticket.uploadedDocuments) ? [...ticket.uploadedDocuments] : [];
    const documentStatus: 'OPEN' | 'COMPLETE' = missingDocuments.length > 0 ? 'OPEN' : 'COMPLETE';

    const unchanged = (): DocumentUploadResult => ({
      ok: false,
      statusCode: 400,
      ticketId,
      documentStatus,
      missingDocuments,
      uploadedDocuments,
    });

    if (missingDocuments.length === 0) {
      return { ...unchanged(), statusCode: 409, error: 'No supporting document is waiting for upload.' };
    }

    const fileName = cleanFileName(input.fileName);
    if (!fileName) {
      return { ...unchanged(), error: 'A document file name is required.' };
    }

    const extension = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return { ...unchanged(), error: 'Upload a PDF, Word, PNG, or JPEG document.' };
    }

    const contentType = cleanContentType(input.contentType);
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return { ...unchanged(), error: 'That file type cannot be stored.' };
    }

    const sizeBytes = cleanSize(input.sizeBytes);
    if (sizeBytes < 0) {
      return { ...unchanged(), error: 'That document is too large to store.' };
    }

    const requested = String(input.docType || '').trim().toLowerCase();
    const docType = requested
      ? missingDocuments.find((doc) => doc.toLowerCase() === requested)
      : missingDocuments[0];
    if (!docType) {
      return {
        ...unchanged(),
        error: 'That document is not one of the open requirements.',
      };
    }

    const upload: UploadedDocumentRecord = {
      docType,
      fileName,
      contentType,
      sizeBytes,
      uploadedAt: new Date().toISOString(),
      status: 'received',
    };
    const remaining = missingDocuments.filter((doc) => doc !== docType);
    const stored = [...uploadedDocuments, upload];
    const nextStatus: 'OPEN' | 'COMPLETE' = remaining.length > 0 ? 'OPEN' : 'COMPLETE';

    await this.ticketRepo.updateTicket(ticketId, {
      missingDocuments: remaining,
      uploadedDocuments: stored,
      documentStatus: nextStatus,
    });
    await this.appendConversationTurn(
      ticketId,
      'system',
      `Supporting document received: ${fileName} (${docType}). Status ${nextStatus}. Remaining: ${
        remaining.join(', ') || 'none'
      }.`
    );

    return {
      ok: true,
      statusCode: 200,
      ticketId,
      documentStatus: nextStatus,
      missingDocuments: remaining,
      uploadedDocuments: stored,
      upload,
    };
  }
}

function cleanFileName(value: unknown): string | null {
  const name = String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.trim() || '';
  if (!name || name.length > 180 || /[\u0000-\u001f]/.test(name)) return null;
  return name;
}

function cleanContentType(value: unknown): string {
  const raw = String(value || 'application/octet-stream')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!/^[\w.+-]+\/[\w.+-]+$/.test(raw) || raw.length > 120) return 'application/octet-stream';
  return raw;
}

function cleanSize(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const size = Number(value);
  if (!Number.isFinite(size) || size < 0) return 0;
  if (size > MAX_UPLOAD_BYTES) return -1;
  return Math.round(size);
}
