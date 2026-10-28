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
import { APP_CONNECT_DOMAINS, resolveSigningPublicUrl } from '../../config/app-urls.js';
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

@Injectable({ deps: [ServicingService, ServicingAuthService, SigningService] })
export class ServicingTools {
  constructor(
    private readonly servicingService: ServicingService,
    private readonly authService: ServicingAuthService,
    private readonly signingService: SigningService
  ) {}

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
  async getPolicyDetails(_input: GetPolicyDetailsInput, ctx: ExecutionContext) {
    const ticketId = this.authService.getVerifiedTicketId(sessionKeyOf(ctx));
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

    const introduction = `${
      this.authService.consumePolicyIntroduction(ticketId, sessionKey) ? 'Thank you, your identity is verified. ' : ''
    }Here are your policy details and coverage limits for your home. You can review everything in the card below.`;

    return {
      userFacing: introduction,
      // NitroChat renders this field under the card, after the widget.
      ...(renewal.renewalInvitation ? { renewalInvitation: renewal.renewalInvitation } : {}),
      preventFollowUp: true,
      status: 'WIDGET_MOUNTED',
      internal: {
        presentation: 'renewal',
        paid: context.status === 'IN_FORCE_RENEWED',
        authenticated: true,
        preventFollowUp: true,
        awaitingRenewalConsent: renewal.isRenewalEligible,
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
  async getPendingTasks(_input: GetPendingTasksInput, ctx: ExecutionContext) {
    const ticketId = this.authService.getVerifiedTicketId(sessionKeyOf(ctx));
    if (!ticketId) return unauthenticatedResult();

    const context = await this.servicingService.getTicketContext(ticketId);
    const taskSummary = this.servicingService.formatPendingTasks(context);
    const renewal = this.servicingService.getRenewalInvitation(context);

    await this.servicingService.appendConversationTurn(
      ticketId,
      'assistant',
      `Provided servicing checklist: ${context.missingDocuments?.join(', ') || 'No missing docs'}`
    );

    return {
      userFacing: taskSummary,
      ...(renewal.renewalInvitation ? { renewalInvitation: renewal.renewalInvitation } : {}),
      preventFollowUp: true,
      status: 'WIDGET_MOUNTED',
      internal: {
        authenticated: true,
        preventFollowUp: true,
        awaitingRenewalConsent: renewal.isRenewalEligible,
        customerName: context.customerName,
        presentation: 'servicing',
        paid: context.status === 'IN_FORCE_RENEWED',
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
        missingDocuments: context.missingDocuments,
        insuredEmail: context.recipientEmail,
        signingStatusUrl: signingStatusUrl(),
      },
    };
  }

  @Tool({
    name: 'get_renewal_property_details',
    description:
      'Shows the on-record home details in the policy card for an authenticated renewal. Requires verified session. Call once for typed renewal intent; the Renew Policy widget already invokes it directly. Relay userFacing only — the card lists the details. When the customer then confirms, call hq_stripe_create_payment_link with ticketId only.',
    inputSchema: z.object({
      ticketId: z.string().optional().describe('Verified session ticket ID (e.g. HQ-DEMO-001)'),
    }),
  })
  @Widget(POLICY_WIDGET)
  async getRenewalPropertyDetails(_input: { ticketId?: string }, ctx: ExecutionContext) {
    const ticketId = this.authService.getVerifiedTicketId(sessionKeyOf(ctx));
    if (!ticketId) return unauthenticatedResult();

    await this.servicingService.appendConversationTurn(
      ticketId,
      'assistant',
      'Presented renewal home details reconfirmation.'
    );
    return this.propertyConfirmationResult(
      ticketId,
      "Here are the home details on record for your renewal — please confirm they're still accurate in the card below, then reply yes."
    );
  }

  @Tool({
    name: 'update_renewal_property_details',
    description:
      'Saves customer corrections to the on-record home details during renewal reconfirmation (address, year built, square footage, roof, electrical panel, etc.). Call whenever the customer says ANY displayed detail is wrong or changed, before checkout — never keep a correction only in chat. Pass only the changed fields. It re-shows the updated card; then wait for the customer to confirm before calling hq_stripe_create_payment_link. Add nothing to its message.',
    inputSchema: z.object({
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
    input: { propertyAttributes?: Record<string, string | number | undefined> },
    ctx: ExecutionContext
  ) {
    const ticketId = this.authService.getVerifiedTicketId(sessionKeyOf(ctx));
    if (!ticketId) return unauthenticatedResult();

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
    return this.propertyConfirmationResult(
      ticketId,
      `I've updated your ${joined} on file. Here are the updated home details — please confirm they're accurate so I can prepare your renewal checkout.`,
      changed
    );
  }

  private async propertyConfirmationResult(ticketId: string, userFacing: string, updatedFields: string[] = []) {
    const context = await this.servicingService.getTicketContext(ticketId);
    const attrs = {
      ...context.propertyAttributes,
      address: context.propertyAttributes?.address || context.propertyAddress,
    };

    return {
      userFacing,
      // NitroChat renders this under the card, after the widget.
      renewalInvitation:
        'Are these details still accurate? Reply **yes** in the chat to continue to secure checkout.',
      preventFollowUp: true,
      internal: {
        stage: 'awaiting_property_confirmation',
        awaitingPropertyConfirmation: true,
        authenticated: true,
        preventFollowUp: true,
        presentation: 'renewal',
        nextTool: 'hq_stripe_create_payment_link',
        nextToolArgs: { ticketId },
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
        correctionTool: 'update_renewal_property_details',
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
    const ticketId = this.authService.getVerifiedTicketId(sessionKeyOf(ctx));
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
      'Prepares the DocuSign renewal-document signing link for the verified customer. Call immediately when the customer asks to sign, asks for the signing link, or replies yes after being offered it — do not ask how to deliver it. Its message (with the "Click here to sign" link) is shown automatically; add nothing. Do not call it on your own otherwise.',
    inputSchema: z.object({
      force: z
        .boolean()
        .optional()
        .describe('Issue a fresh signing document even if the current one is already signed'),
    }),
  })
  async docusignSend(input: { force?: boolean }, ctx: ExecutionContext) {
    const ticketId = this.authService.getVerifiedTicketId(sessionKeyOf(ctx));
    if (!ticketId) return { success: false, ...unauthenticatedResult() };

    try {
      const result = await this.signingService.prepareSignature(ticketId, { force: input.force === true });
      return {
        success: true,
        preventFollowUp: true,
        userFacing: result.signed
          ? 'Your renewal document is already signed.'
          : `Your document is ready to sign. [Click here to sign](${result.signingUrl})`,
        internal: { ...result, success: true },
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
        internal: { success: false, ok: false, error: reason },
      };
    }
  }

  @Tool({
    name: 'hq_docusign_status',
    description: 'Check document signature status. NEVER call this tool autonomously or in a loop. Only call when the customer explicitly asks to verify or check signature status.',
    inputSchema: z.object({ ticketId: z.string().optional() }),
  })
  async docusignStatus(_input: { ticketId?: string }, ctx: ExecutionContext) {
    const ticketId = this.authService.getVerifiedTicketId(sessionKeyOf(ctx));
    if (!ticketId) return { success: false, ...unauthenticatedResult() };

    try {
      const result = await this.signingService.signatureStatus(ticketId);
      return {
        success: true,
        preventFollowUp: true,
        internal: { ...result, success: true },
        userFacing: result.signed ? 'Your document has been signed and recorded.' : 'Document signature is still pending.',
      };
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
}
