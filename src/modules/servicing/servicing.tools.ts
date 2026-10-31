import {
  ToolDecorator as Tool,
  Widget,
  Injectable,
  ExecutionContext,
  z,
} from '@nitrostack/core';
import { ServicingService } from './servicing.service.js';
import { ServicingAuthService } from './servicing.auth.service.js';
import { sessionKeyOf } from './session-key.js';
import { SigningService } from './signing.service.js';
import { APP_CONNECT_DOMAINS, resolveSigningPublicUrl, resolveWorkflowApiUrl } from '../../config/app-urls.js';
import {
  sendOtpSchema,
  verifyOtpSchema,
  getPolicyDetailsSchema,
  getPendingTasksSchema,
  SendOtpInput,
  VerifyOtpInput,
  GetPolicyDetailsInput,
  GetPendingTasksInput,
  unauthenticatedResult,
} from './servicing.types.js';

const POLICY_WIDGET = {
  route: 'policy-widget-v2',
  csp: {
    connectDomains: [...APP_CONNECT_DOMAINS, 'https://honeyquoteproduction.blob.core.windows.net'],
    resourceDomains: [
      'https://honeyquoteproduction.blob.core.windows.net',
      'https://cdn.prod.website-files.com',
    ],
  },
};

const SIGNING_WIDGET = {
  route: 'signing-widget',
  csp: {
    connectDomains: [...APP_CONNECT_DOMAINS],
    resourceDomains: [
      'https://honeyquoteproduction.blob.core.windows.net',
      'https://cdn.prod.website-files.com',
    ],
  },
};

const PROPERTY_FIELD_LABELS: Record<string, string> = {
  address: 'property address',
  yearBuilt: 'year built',
  squareFootage: 'square footage',
  stories: 'stories',
  constructionType: 'construction type',
  roofType: 'roofing material',
  roofGeometry: 'roof shape',
  roofYear: 'roof replacement year',
  primaryUse: 'primary use',
  primaryHeating: 'heating',
  plumbingSystem: 'plumbing',
  electricalPanel: 'electrical panel',
};

function normalizeElectricalPanel(value: string): string {
  const panel = value.toLowerCase().replace(/[\s_-]/g, '');
  if (panel.includes('fuse')) return 'FuseBox';
  if (panel.includes('breaker') || panel.includes('circuit')) return 'CircuitBreaker';
  return value;
}

const signingStatusUrl = () => `${resolveSigningPublicUrl()}/signing/status`;
const documentUploadUrl = () => `${resolveSigningPublicUrl()}/api/policy/document/upload`;

@Injectable({ deps: [ServicingService, ServicingAuthService, SigningService] })
export class ServicingTools {
  constructor(
    private readonly servicingService: ServicingService,
    private readonly authService: ServicingAuthService,
    private readonly signingService: SigningService
  ) {}

  /** Session key first; a ticket already verified in this process otherwise. */
  private verifiedTicket(ctx: ExecutionContext, requestedTicketId?: string): string | null {
    return this.authService.resolveVerifiedTicket(sessionKeyOf(ctx), requestedTicketId);
  }

  @Tool({
    name: 'send_customer_otp',
    description:
      'Dispatches a 6-digit verification code (OTP) to the customer email or phone number for identity verification. Never returns policy details.',
    inputSchema: sendOtpSchema,
  })
  async sendCustomerOtp(input: SendOtpInput, ctx: ExecutionContext) {
    const result = await this.authService.requestOtp(input.identifier, sessionKeyOf(ctx));
    const destination = input.identifier;

    // NitroChat renders userFacing itself; preventFollowUp stops the model from repeating it.
    if (result.sent) {
      return {
        userFacing: `A verification code has been sent to ${destination}. Please reply with the 6-digit code to continue.`,
        preventFollowUp: true,
        internal: {
          sent: true,
          preventFollowUp: true,
          channel: result.channel,
          expiresAt: result.expiresAt,
          nextTool: 'verify_customer_otp',
        },
      };
    }

    const given = result.channel === 'email' ? 'email address' : 'mobile number';
    const other = result.channel === 'email' ? 'mobile number' : 'email address';
    const failureMessages: Record<typeof result.reason, string> = {
      not_found: result.bothChannelsMissed
        ? "I couldn't find a policy under that email address or mobile number. If you're new to HoneyQuote, I can help you get a quote for a new policy — would you like to start one?"
        : `I couldn't find a policy on file with that ${given}. Could you share the ${other} associated with your policy instead?`,
      rate_limited: `A code was just sent to ${destination}. Please wait a moment before requesting another one.`,
      delivery_failed: `I couldn't send a verification code to ${destination} right now. Please try again in a moment, or use the other contact method on your policy.`,
      no_session: 'This chat has no active session. Please refresh the chat and try again.',
    };
    return {
      userFacing: failureMessages[result.reason],
      preventFollowUp: true,
      internal: {
        sent: false,
        preventFollowUp: true,
        reason: result.reason,
        channel: result.channel,
        ...(result.bothChannelsMissed ? { offerNewQuote: true } : {}),
      },
    };
  }

  @Tool({
    name: 'verify_customer_otp',
    description:
      'Validates the 6-digit verification code (OTP) entered by the customer in chat. Call this tool immediately whenever the customer sends a 6-digit code. On success it shows the policy card itself — do not call get_policy_details afterwards and do not add any reply.',
    inputSchema: verifyOtpSchema,
  })
  @Widget(POLICY_WIDGET)
  async verifyCustomerOtp(input: VerifyOtpInput, ctx: ExecutionContext) {
    const res = await this.authService.verifyOtp(input.code, sessionKeyOf(ctx));

    if (!res.verified) {
      // authenticated:false makes NitroChat show only the text, without an empty card.
      return {
        userFacing: res.error,
        preventFollowUp: true,
        internal: { verified: false, authenticated: false, preventFollowUp: true, error: res.error },
      };
    }

    await this.servicingService.appendConversationTurn(
      res.ticketId,
      'system',
      `Customer ${res.customerName} successfully authenticated via OTP.`
    );

    return this.policyDetailsResult(res.ticketId, sessionKeyOf(ctx));
  }

  @Tool({
    name: 'get_policy_details',
    description:
      'Retrieves active insurance policy details and mounts the interactive policy widget. The interactive widget displays all coverages, deductibles, carrier, and dates directly in the card.',
    inputSchema: getPolicyDetailsSchema,
  })
  @Widget(POLICY_WIDGET)
  async getPolicyDetails(input: GetPolicyDetailsInput, ctx: ExecutionContext) {
    const ticketId = this.verifiedTicket(ctx, input.ticketId);
    if (!ticketId) return unauthenticatedResult();
    return this.policyDetailsResult(ticketId, sessionKeyOf(ctx));
  }

  private async policyDetailsResult(ticketId: string, sessionKey: string | undefined) {
    const context = await this.servicingService.getTicketContext(ticketId);
    const renewal = this.servicingService.getRenewalInvitation(context);

    await this.servicingService.appendConversationTurn(
      ticketId,
      'assistant',
      `Shared policy details for ${context.policyNumber} (${context.carrier})`
    );

    const firstName = context.customerName?.trim().split(/\s+/)[0] || 'there';
    const introduction = this.authService.consumePolicyIntroduction(ticketId, sessionKey)
      ? `Good to see you, ${firstName}. Here's your policy.`
      : 'Your policy is in the card below.';

    // A paid term that still needs a signature shows e-sign, not another renewal.
    // Sign Now on the card opens DocuSign; a yes in chat generates the link.
    const paid = this.servicingService.isPolicyPaid(context);
    const signingInvitation = this.servicingService.getSigningConsentInvitation(context);
    const underCard = signingInvitation || renewal.renewalInvitation;

    return {
      userFacing: introduction,
      // NitroChat renders this field under the card, after the widget.
      ...(underCard ? { renewalInvitation: underCard } : {}),
      preventFollowUp: true,
      status: 'WIDGET_MOUNTED',
      internal: {
        presentation: signingInvitation ? 'servicing' : 'renewal',
        paid,
        paymentStatus: context.paymentStatus,
        hasNotification: Boolean(signingInvitation),
        authenticated: true,
        preventFollowUp: true,
        awaitingRenewalConsent: signingInvitation ? false : renewal.isRenewalEligible,
        awaitingSignatureConsent: Boolean(signingInvitation),
        ...(signingInvitation ? { nextTool: 'hq_docusign_send' } : {}),
        customerName: context.customerName,
        ticketId,
        policyNumber: context.policyNumber,
        carrier: context.carrier,
        status: context.status,
        coverages: context.coverages,
        deductibles: context.deductibles,
        effectiveDate: context.effectiveDate,
        renewalDate: context.renewalDate,
        daysUntilExpiry: renewal.daysUntilExpiry,
        isRenewalEligible: renewal.isRenewalEligible,
        signatureRequired: context.signatureRequired,
        signatureStatus: context.signatureStatus,
        esignSent: context.esignSent,
        missingDocuments: context.missingDocuments || [],
        uploadedDocuments: context.uploadedDocuments || [],
        documentStatus: context.documentStatus || (context.missingDocuments?.length ? 'OPEN' : 'COMPLETE'),
        documentUploadUrl: documentUploadUrl(),
        billedToMortgage: context.billedToMortgage,
        propertyAddress: context.propertyAddress,
        userId: context.userId || '6ad9bd5dcfc164fb5ece28e1',
        insuredEmail: context.recipientEmail,
        signingStatusUrl: signingStatusUrl(),
        verified: true,
      },
    };
  }

  @Tool({
    name: 'get_pending_servicing_tasks',
    description:
      'Checks for any pending servicing checklist items such as missing documents, signatures, or escrow billing. Requires verified session ticketId.',
    inputSchema: getPendingTasksSchema,
  })
  @Widget(POLICY_WIDGET)
  async getPendingTasks(input: GetPendingTasksInput, ctx: ExecutionContext) {
    const ticketId = this.verifiedTicket(ctx, input.ticketId);
    if (!ticketId) return unauthenticatedResult();

    const context = await this.servicingService.getTicketContext(ticketId);
    const taskSummary = this.servicingService.formatPendingTasks(context);
    const renewal = this.servicingService.getRenewalInvitation(context);
    const signingInvitation = this.servicingService.getSigningConsentInvitation(context);
    const underCard = signingInvitation || renewal.renewalInvitation;

    await this.servicingService.appendConversationTurn(
      ticketId,
      'assistant',
      `Provided servicing checklist: ${context.missingDocuments?.join(', ') || 'No missing docs'}`
    );

    return {
      userFacing: taskSummary,
      ...(underCard ? { renewalInvitation: underCard } : {}),
      preventFollowUp: true,
      status: 'WIDGET_MOUNTED',
      internal: {
        authenticated: true,
        preventFollowUp: true,
        awaitingRenewalConsent: signingInvitation ? false : renewal.isRenewalEligible,
        awaitingSignatureConsent: Boolean(signingInvitation),
        ...(signingInvitation ? { nextTool: 'hq_docusign_send', hasNotification: true } : {}),
        customerName: context.customerName,
        presentation: 'servicing',
        paid: this.servicingService.isPolicyPaid(context),
        paymentStatus: context.paymentStatus,
        isRenewalEligible: renewal.isRenewalEligible,
        ticketId,
        policyNumber: context.policyNumber,
        carrier: context.carrier,
        status: context.status,
        effectiveDate: context.effectiveDate,
        renewalDate: context.renewalDate,
        daysUntilExpiry: renewal.daysUntilExpiry,
        coverages: context.coverages,
        deductibles: context.deductibles,
        signatureRequired: context.signatureRequired,
        esignSent: context.esignSent,
        signatureStatus: context.signatureStatus,
        billedToMortgage: context.billedToMortgage,
        missingDocuments: context.missingDocuments,
        uploadedDocuments: context.uploadedDocuments || [],
        documentStatus: context.documentStatus || (context.missingDocuments?.length ? 'OPEN' : 'COMPLETE'),
        documentUploadUrl: documentUploadUrl(),
        insuredEmail: context.recipientEmail,
        signingStatusUrl: signingStatusUrl(),
      },
    };
  }

  @Tool({
    name: 'get_renewal_property_details',
    description:
      'Shows the on-record home details in the policy card. Requires a verified session. Use intent "view" whenever the customer asks to see property or home details, before or after payment. That card is read-only: relay userFacing only, and do not start checkout or signing. Use intent "renew" only to start an unpaid renewal. A yes after a renew card calls hq_stripe_create_payment_link with ticketId only.',
    inputSchema: z.object({
      ticketId: z.string().optional().describe('Verified session ticket ID (e.g. HQ-DEMO-001)'),
      intent: z
        .enum(['view', 'renew'])
        .optional()
        .describe('view shows the home list only. renew starts unpaid renewal confirmation. Defaults to view.'),
    }),
  })
  @Widget(POLICY_WIDGET)
  async getRenewalPropertyDetails(
    input: { ticketId?: string; intent?: 'view' | 'renew' },
    ctx: ExecutionContext
  ) {
    const ticketId = this.verifiedTicket(ctx, input.ticketId);
    if (!ticketId) return unauthenticatedResult();

    const existing = await this.servicingService.getTicketContext(ticketId);
    const renewing = input.intent === 'renew' && !this.servicingService.isPolicyPaid(existing);
    if (!renewing) {
      await this.servicingService.appendConversationTurn(
        ticketId,
        'assistant',
        'Shared on-file property details.'
      );
      return this.propertyConfirmationResult(ticketId, 'Here are the property details on file.', [], true);
    }

    await this.servicingService.appendConversationTurn(
      ticketId,
      'assistant',
      'Presented renewal home details reconfirmation.'
    );
    const firstName = existing.customerName?.trim().split(/\s+/)[0] || 'there';
    return this.propertyConfirmationResult(ticketId, `${firstName}, do these home details still look right?`);
  }

  @Tool({
    name: 'update_renewal_property_details',
    description:
      'Saves customer corrections to the on-record home details during renewal reconfirmation (address, year built, square footage, roof, electrical panel, etc.). Call whenever the customer says ANY displayed detail is wrong or changed, before checkout — never keep a correction only in chat. Pass only the changed fields. It re-shows the updated card. When propertyDetailsUpdated is true, the turn is still open: call show_quote_rates in that same turn with internal.nextToolArgs and add nothing. Do not wait for the customer to reply. Do not call hq_stripe_create_payment_link until the customer clicks Continue on a carrier.',
    inputSchema: z.object({
      ticketId: z.string().optional().describe('Verified session ticket ID (e.g. HQ-DEMO-001)'),
      propertyAttributes: z
        .object({
          address: z.string().optional().describe('Full property address: street, city, state, ZIP'),
          yearBuilt: z.number().optional(),
          squareFootage: z.number().optional(),
          stories: z.number().optional(),
          constructionType: z.string().optional(),
          roofType: z.string().optional().describe('Roofing material, e.g. Concrete Tile'),
          roofGeometry: z.string().optional().describe('Roof shape, e.g. Hip Roof'),
          roofYear: z.number().optional().describe('Year the roof was last replaced'),
          primaryUse: z.string().optional(),
          primaryHeating: z.string().optional(),
          plumbingSystem: z.string().optional(),
          electricalPanel: z.string().optional().describe('CircuitBreaker or FuseBox'),
        })
        .describe('Only the home details the customer is correcting'),
    }),
  })
  @Widget(POLICY_WIDGET)
  async updateRenewalPropertyDetails(
    input: { ticketId?: string; propertyAttributes?: Record<string, string | number | undefined> },
    ctx: ExecutionContext
  ) {
    const ticketId = this.verifiedTicket(ctx, input.ticketId);
    if (!ticketId) return unauthenticatedResult();

    const existing = await this.servicingService.getTicketContext(ticketId);
    if (this.servicingService.isPolicyPaid(existing)) {
      return this.policyDetailsResult(ticketId, sessionKeyOf(ctx));
    }

    const updates = { ...(input.propertyAttributes ?? {}) };
    if (typeof updates.address === 'string') updates.address = updates.address.trim();
    if (typeof updates.electricalPanel === 'string') {
      updates.electricalPanel = normalizeElectricalPanel(updates.electricalPanel);
    }

    const changed = await this.servicingService.updatePropertyDetails(ticketId, updates as any);
    const labels = changed.map((f) => PROPERTY_FIELD_LABELS[f] ?? f);
    if (!labels.length) {
      return {
        userFacing:
          "I didn't catch which detail to change. Tell me what needs updating — for example the property address, year built, square footage, or electrical panel.",
        preventFollowUp: true,
        internal: { authenticated: false, propertyDetailsUpdated: false, preventFollowUp: true },
      };
    }

    await this.servicingService.appendConversationTurn(
      ticketId,
      'assistant',
      `Updated renewal home details on file: ${labels.join(', ')}.`
    );
    const joined = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}` : labels[0];
    const firstName = existing.customerName?.trim().split(/\s+/)[0] || 'there';
    return this.propertyConfirmationResult(
      ticketId,
      `Updated your ${joined}, ${firstName}.`,
      changed
    );
  }

  private async propertyConfirmationResult(
    ticketId: string,
    userFacing: string,
    updatedFields: string[] = [],
    readOnly = false
  ) {
    const context = await this.servicingService.getTicketContext(ticketId);
    const attrs = {
      ...context.propertyAttributes,
      address: context.propertyAttributes?.address || context.propertyAddress,
    };

    const detailsChanged = updatedFields.length > 0;
    const firstName = context.customerName?.trim().split(/\s+/)[0] || 'there';
    const formattedAddress = String(attrs.address || '').trim();
    // A change must keep the turn open so the model can call show_quote_rates immediately.
    const preventFollowUp = readOnly || !detailsChanged;

    return {
      userFacing,
      // NitroChat renders this under the card, after the widget.
      ...(readOnly
        ? {}
        : {
            renewalInvitation: detailsChanged
              ? `Those details changed, ${firstName}. Pick a carrier below to continue to checkout.`
              : "If they do, type **yes** and we'll go to checkout.",
          }),
      preventFollowUp,
      internal: {
        stage: 'awaiting_property_confirmation',
        awaitingPropertyConfirmation: true,
        ...(readOnly ? { propertyDetailsReadOnly: true, paid: true } : {}),
        authenticated: true,
        preventFollowUp,
        presentation: readOnly ? 'servicing' : 'renewal',
        ...(readOnly
          ? {}
          : {
              nextTool: detailsChanged ? 'show_quote_rates' : 'hq_stripe_create_payment_link',
              nextToolArgs: detailsChanged
                ? { quoteId: 1, formattedAddress, ticketId }
                : { ticketId },
            }),
        ticketId,
        policyNumber: context.policyNumber,
        carrier: context.carrier,
        status: context.status,
        effectiveDate: context.effectiveDate,
        renewalDate: context.renewalDate,
        daysUntilExpiry: this.servicingService.getRenewalInvitation(context).daysUntilExpiry,
        coverages: context.coverages,
        deductibles: context.deductibles,
        signatureRequired: context.signatureRequired,
        esignSent: context.esignSent,
        signatureStatus: context.signatureStatus,
        missingDocuments: context.missingDocuments,
        insuredEmail: context.recipientEmail,
        userId: context.userId || '6ad9bd5dcfc164fb5ece28e1',
        formId: 1,
        address: attrs.address,
        propertyAddress: attrs.address,
        propertyAttributes: attrs,
        propertyDetailsUpdated: updatedFields.length > 0,
        updatedFields,
        ...(readOnly ? {} : { correctionTool: 'update_renewal_property_details' }),
      },
    };
  }

  @Tool({
    name: 'send_certificate_of_insurance',
    description:
      'Generates and immediately delivers an official Certificate of Insurance (COI) via Gmail to the customer verified email address.',
    inputSchema: z.object({
      ticketId: z.string().optional().describe('Policy ticket ID (e.g. HQ-DEMO-001)'),
      email: z.string().optional().describe('Recipient email address (defaults to verified email)'),
    }),
  })
  async sendCertificateOfInsurance(
    input: { ticketId?: string; email?: string },
    ctx: ExecutionContext
  ) {
    const ticketId = this.verifiedTicket(ctx, input.ticketId);
    if (!ticketId) return unauthenticatedResult();
    const context = await this.servicingService.getTicketContext(ticketId);
    const targetEmail = input.email || context.recipientEmail || 'hemantj@wekancode.com';

    const result = await this.servicingService.sendCertificateOfInsurance({
      ticketId,
      email: targetEmail,
      name: context.customerName || 'Jordan Mitchell',
      policyNumber: context.policyNumber || 'HQ-POL-88421',
      carrier: context.carrier || 'Citizens Property Insurance',
    });

    await this.servicingService.appendConversationTurn(
      ticketId,
      'assistant',
      `Dispatched Certificate of Insurance to ${targetEmail} via Gmail API.`
    );

    return {
      userFacing: `✅ Your official Certificate of Insurance (COI) for Policy #${
        context.policyNumber || 'HQ-POL-88421'
      } (${context.carrier || 'Citizens'}) has been generated and emailed to **${targetEmail}**. Please check your inbox!`,
      internal: {
        sent: true,
        email: targetEmail,
        ticketId,
        policyNumber: context.policyNumber,
        messageId: result.messageId,
      },
    };
  }

  @Tool({
    name: 'hq_docusign_send',
    description:
      'Prepares the DocuSign renewal-document signing link and shows it in the signing widget. Call immediately when the customer asks to sign, asks for the signing link, or replies yes after the under-card signing invitation — do not ask how to deliver it. Its message and the signing widget are shown automatically; add nothing. Do not call it because the customer clicked Sign Now on the policy card.',
    inputSchema: z.object({
      ticketId: z.string().optional().describe('Verified session ticket ID (e.g. HQ-DEMO-001)'),
      force: z
        .boolean()
        .optional()
        .describe('Issue a fresh signing document even if the current one is already signed'),
    }),
  })
  @Widget(SIGNING_WIDGET)
  async docusignSend(input: { ticketId?: string; force?: boolean }, ctx: ExecutionContext) {
    const ticketId = this.verifiedTicket(ctx, input.ticketId);
    if (!ticketId) return { success: false, ...unauthenticatedResult() };

    try {
      const context = await this.servicingService.getTicketContext(ticketId);
      const result = await this.signingService.prepareSignature(ticketId, { force: input.force === true });
      if (result.signed || !result.signingUrl) {
        return {
          success: true,
          preventFollowUp: true,
          userFacing: 'Your renewal document is already signed.',
          // Host shows the text only — there is no link to put in the signing widget.
          internal: { ...result, success: true, authenticated: false, preventFollowUp: true },
        };
      }
      return {
        success: true,
        preventFollowUp: true,
        status: 'WIDGET_MOUNTED',
        userFacing:
          'Your document is ready to sign.\n\nPlease use the signing widget below to open DocuSign and sign:',
        internal: {
          ...result,
          success: true,
          authenticated: true,
          preventFollowUp: true,
          presentation: 'signing',
          carrier: context.carrier,
          policyNumber: context.policyNumber,
          effectiveDate: context.effectiveDate,
          renewalDate: context.renewalDate,
          customerName: context.customerName,
          ticketId,
          signingStatusUrl: signingStatusUrl(),
          workflowApiUrl: resolveWorkflowApiUrl(),
        },
      };
    } catch (err: any) {
      const reason = String(err?.message || err);
      console.error('[signing] prepareSignature failed:', reason);
      const userFacing = /not found/i.test(reason)
        ? "I couldn't find the renewal document to sign. Please try again in a moment."
        : /not configured/i.test(reason)
          ? "Signing isn't configured on the server yet. Please try again in a moment."
          : /authentication failed/i.test(reason)
            ? "DocuSign didn't accept the signing credentials. Please try again in a moment."
            : "I couldn't prepare your signing document right now. Please try again in a moment.";
      return {
        success: false,
        preventFollowUp: true,
        userFacing,
        internal: { success: false, ok: false, authenticated: false, preventFollowUp: true, error: reason },
      };
    }
  }

  @Tool({
    name: 'hq_docusign_status',
    description:
      'Confirms whether the renewal document is signed. The policy card calls this once after DocuSign finishes; also call it once when the customer asks about signature status. When signed, its success message and the updated policy card are the whole reply — add nothing. Never call it in a loop.',
    inputSchema: z.object({ ticketId: z.string().optional() }),
  })
  @Widget(POLICY_WIDGET)
  async docusignStatus(input: { ticketId?: string }, ctx: ExecutionContext) {
    const ticketId = this.verifiedTicket(ctx, input.ticketId);
    if (!ticketId) return { success: false, ...unauthenticatedResult() };

    try {
      const result = await this.signingService.signatureStatus(ticketId);
      return await this.signatureStatusCard(ticketId, result.signed);
    } catch (err: any) {
      console.error('[signing] signatureStatus failed:', err?.message || err);
      return {
        success: false,
        preventFollowUp: true,
        internal: { success: false, ok: false, error: String(err?.message || err) },
        userFacing: "I couldn't check the signature status right now. Please try again in a moment.",
      };
    }
  }

  /** Chat confirmation plus the policy card. A signed document shows the full renewed term. */
  private async signatureStatusCard(ticketId: string, signed: boolean) {
    const context = await this.servicingService.getTicketContext(ticketId);
    const renewal = this.servicingService.getRenewalInvitation(context);
    const firstName = context.customerName?.trim().split(/\s+/)[0] || 'there';
    const signedNow = signed || context.signatureStatus === 'signed';

    return {
      success: true,
      preventFollowUp: true,
      status: 'WIDGET_MOUNTED',
      userFacing: signedNow
        ? `All set, ${firstName}. Your renewal is signed, and the updated policy is in the card.`
        : 'Document signature is still pending.',
      internal: {
        success: true,
        authenticated: true,
        preventFollowUp: true,
        presentation: signedNow ? 'signed' : 'servicing',
        paid: context.status === 'IN_FORCE_RENEWED' || context.paymentStatus === 'PAID',
        hasNotification: !signedNow,
        customerName: context.customerName,
        ticketId,
        policyNumber: context.policyNumber,
        carrier: context.carrier,
        status: context.status,
        coverages: context.coverages,
        deductibles: context.deductibles,
        effectiveDate: context.effectiveDate,
        renewalDate: context.renewalDate,
        daysUntilExpiry: renewal.daysUntilExpiry,
        signatureRequired: signedNow ? false : Boolean(context.signatureRequired),
        signatureStatus: signedNow ? 'signed' : context.signatureStatus,
        esignSent: context.esignSent,
        missingDocuments: context.missingDocuments || [],
        uploadedDocuments: context.uploadedDocuments || [],
        documentStatus: context.documentStatus || (context.missingDocuments?.length ? 'OPEN' : 'COMPLETE'),
        documentUploadUrl: documentUploadUrl(),
        insuredEmail: context.recipientEmail,
        workflowApiUrl: resolveWorkflowApiUrl(),
        signingStatusUrl: signingStatusUrl(),
      },
    };
  }
}
