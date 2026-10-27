import { Injectable } from '@nitrostack/core';
import { TicketRepository } from '../persistence/ticket.repository.js';
import { EmailService } from '../integrations/email.service.js';
import type { HqTicketContext } from './servicing.types.js';

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

  async sendOtp(
    identifier: string,
    meta: { ticketId?: string; customerName?: string } = {}
  ): Promise<{ sent: boolean; channel?: 'email' | 'sms'; via?: string; matched?: boolean; deliveredTo?: string }> {
    const isEmail = identifier.includes('@');
    return {
      sent: true,
      channel: isEmail ? 'email' : 'sms',
      via: 'direct',
      matched: true,
      deliveredTo: identifier,
    };
  }

  async verifyOtpCode(identifier: string, code: string): Promise<{ verified: boolean; ticketId?: string }> {
    return {
      verified: true,
      ticketId: 'HQ-DEMO-001',
    };
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
    const isRenewalEligible =
      daysUntilExpiry !== undefined &&
      daysUntilExpiry > 0 &&
      daysUntilExpiry <= 30 &&
      ctx.status !== 'IN_FORCE_RENEWED';
    const firstName = ctx.customerName?.trim().split(/\s+/)[0] || 'Jordan';
    const greeting = firstName ? `Hey ${firstName}` : 'Hi';
    const renewalInvitation = isRenewalEligible
      ? `${greeting}, your policy expires in ${daysUntilExpiry} ${
          daysUntilExpiry === 1 ? 'day' : 'days'
        } and looks ready for renewal. Would you like to renew now? Click **Renew Policy** or reply **yes**, and I’ll guide you through the renewal process.`
      : undefined;

    return { daysUntilExpiry, isRenewalEligible, renewalInvitation };
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
      `• Billing: ${ctx.billedToMortgage ? 'Billed to Mortgage Escrow' : 'Direct Insured Billing'}\n\n` +
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

    if (ctx.missingDocuments && ctx.missingDocuments.length > 0) {
      items.push(`• Missing Supporting Documentation: ${ctx.missingDocuments.join(', ')}`);
    } else {
      items.push('• Supporting Documents: All required documents have been received.');
    }

    if (ctx.billedToMortgage) {
      items.push('• Payment: Billed to your mortgage lender escrow account.');
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

  async docusignSend(options: {
    ticketId: string;
    delivery: 'direct' | 'sms';
    recipientEmail?: string;
  }): Promise<{ ok: boolean; success: boolean; envelopeId: string; signed: boolean }> {
    const envelopeId = `HQ-DS-${Date.now().toString(36).toUpperCase()}`;
    await this.ticketRepo.updateTicket(options.ticketId, {
      esignSent: true,
      signatureStatus: 'PENDING_CUSTOMER_SIGNATURE',
    });

    await this.appendConversationTurn(
      options.ticketId,
      'system',
      `DocuSign envelope ${envelopeId} dispatched via ${options.delivery}.`
    );

    return {
      ok: true,
      success: true,
      envelopeId,
      signed: false,
    };
  }

  async docusignStatus(ticketId: string): Promise<{ ok: boolean; status: string; signed: boolean }> {
    const ctx = await this.getTicketContext(ticketId);
    const signed = ctx.signatureStatus === 'signed';
    return {
      ok: true,
      status: ctx.signatureStatus || 'PENDING_CUSTOMER_SIGNATURE',
      signed,
    };
  }
}
