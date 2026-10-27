import {
  ToolDecorator as Tool,
  Widget,
  Injectable,
  ExecutionContext,
  z,
} from '@nitrostack/core';
import { ServicingService } from './servicing.service.js';
import { ServicingAuthService } from './servicing.auth.service.js';
import {
  sendOtpSchema,
  verifyOtpSchema,
  getPolicyDetailsSchema,
  getPendingTasksSchema,
  SendOtpInput,
  VerifyOtpInput,
  GetPolicyDetailsInput,
  GetPendingTasksInput,
} from './servicing.types.js';

const POLICY_WIDGET = {
  route: 'policy-widget-v2',
  csp: {
    connectDomains: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3003',
      'https://honeyquoteproduction.blob.core.windows.net',
    ],
    resourceDomains: [
      'https://honeyquoteproduction.blob.core.windows.net',
      'https://cdn.prod.website-files.com',
    ],
  },
};

@Injectable({ deps: [ServicingService, ServicingAuthService] })
export class ServicingTools {
  constructor(
    private readonly servicingService: ServicingService,
    private readonly authService: ServicingAuthService
  ) {}

  @Tool({
    name: 'send_customer_otp',
    description:
      'Dispatches a 6-digit verification code (OTP) to the customer email or phone number for identity verification. Never returns policy details.',
    inputSchema: sendOtpSchema,
  })
  async sendCustomerOtp(input: SendOtpInput, _ctx: ExecutionContext) {
    const result = await this.authService.requestOtp(input.identifier);

    return {
      internal: {
        sent: result.sent,
        channel: result.channel,
        via: result.via,
        matched: result.matched,
        deliveredTo: result.deliveredTo,
        identifier: input.identifier,
        expiresAt: result.expiresAt,
        nextTool: 'verify_customer_otp',
      },
    };
  }

  @Tool({
    name: 'verify_customer_otp',
    description:
      'Validates the 6-digit verification code (OTP) entered by the customer in chat. Call this tool immediately whenever the customer sends a 6-digit code. After successful verification, immediately call get_policy_details with the ticketId to show the policy card.',
    inputSchema: verifyOtpSchema,
  })
  async verifyCustomerOtp(input: VerifyOtpInput, _ctx: ExecutionContext) {
    const identifier =
      input.identifier || this.authService.getLastIdentifier() || this.authService.getDefaultPhone();
    const res = await this.authService.verifyOtp(identifier, input.code);

    if (!res.verified) {
      return {
        userFacing: `Verification failed: ${
          res.error || 'The verification code entered is invalid or expired'
        }. Please check the code and try again.`,
        internal: {
          verified: false,
          error: res.error,
          nextTool: 'send_customer_otp',
        },
      };
    }

    const ticketId = res.ticketId || 'HQ-DEMO-001';
    let policyNum = 'HQ-POL-88421';
    let carrierName = 'Citizens';
    let customerName = res.customerName || '';

    try {
      const context = await this.servicingService.getTicketContext(ticketId);
      if (context?.policyNumber) policyNum = context.policyNumber;
      if (context?.carrier) carrierName = context.carrier;
      if (!customerName && context?.customerName) customerName = context.customerName;
    } catch {
      // Non-blocking fallback
    }

    if (!customerName) {
      customerName = this.authService.getVerifiedCustomerName() || 'Jordan Mitchell';
    }

    await this.servicingService.appendConversationTurn(
      ticketId,
      'system',
      `Customer ${customerName} successfully authenticated via OTP.`
    );

    return {
      userFacing: 'Identity verified successfully. Fetching your policy details and coverage limits now...',
      internal: {
        verified: true,
        nextTool: 'get_policy_details',
        customerName: customerName || undefined,
        ticketId,
        policyNumber: policyNum || undefined,
        carrier: carrierName,
      },
    };
  }

  @Tool({
    name: 'get_policy_details',
    description:
      'Retrieves active insurance policy details and mounts the interactive policy widget. The interactive widget displays all coverages, deductibles, carrier, and dates directly in the card.',
    inputSchema: getPolicyDetailsSchema,
  })
  @Widget(POLICY_WIDGET)
  async getPolicyDetails(input: GetPolicyDetailsInput, _ctx: ExecutionContext) {
    if (!this.authService.isSessionAuthenticated()) {
      return {
        userFacing:
          'Please provide your mobile number or email address so I can send a verification code.',
        internal: {
          authenticated: false,
          error: 'UNAUTHENTICATED_SESSION',
          nextTool: 'send_customer_otp',
        },
      };
    }

    const ticketId = this.authService.getVerifiedTicketId() || input.ticketId || 'HQ-DEMO-001';
    const context = await this.servicingService.getTicketContext(ticketId);
    const renewal = this.servicingService.getRenewalInvitation(context);

    await this.servicingService.appendConversationTurn(
      ticketId,
      'assistant',
      `Shared policy details for ${context.policyNumber} (${context.carrier})`
    );

    return {
      userFacing: renewal.renewalInvitation || '',
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
  async getPendingTasks(input: GetPendingTasksInput, _ctx: ExecutionContext) {
    if (!this.authService.isSessionAuthenticated()) {
      return {
        userFacing:
          'Please provide your mobile number or email address so I can send a verification code.',
        internal: {
          authenticated: false,
          error: 'UNAUTHENTICATED_SESSION',
          nextTool: 'send_customer_otp',
        },
      };
    }

    const ticketId = this.authService.getVerifiedTicketId() || input.ticketId || 'HQ-DEMO-001';

    const context = await this.servicingService.getTicketContext(ticketId);
    const taskSummary = this.servicingService.formatPendingTasks(context);
    const renewal = this.servicingService.getRenewalInvitation(context);

    await this.servicingService.appendConversationTurn(
      ticketId,
      'assistant',
      `Provided servicing checklist: ${context.missingDocuments?.join(', ') || 'No missing docs'}`
    );

    return {
      userFacing: [taskSummary, renewal.renewalInvitation].filter(Boolean).join('\n\n'),
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
        billedToMortgage: context.billedToMortgage,
        insuredEmail: context.recipientEmail,
      },
    };
  }

  @Tool({
    name: 'get_renewal_property_details',
    description:
      'Retrieves on-record home details for an authenticated renewal. Requires verified session. Call once for typed renewal intent; the Renew Policy widget already invokes it directly.',
    inputSchema: z.object({
      ticketId: z.string().optional().describe('Verified session ticket ID (e.g. HQ-DEMO-001)'),
    }),
  })
  async getRenewalPropertyDetails(input: { ticketId?: string }, _ctx: ExecutionContext) {
    if (!this.authService.isSessionAuthenticated()) {
      return {
        userFacing:
          'Please provide your mobile number or email address so I can send a verification code.',
        internal: {
          authenticated: false,
          error: 'UNAUTHENTICATED_SESSION',
          nextTool: 'send_customer_otp',
        },
      };
    }

    const ticketId = this.authService.getVerifiedTicketId() || input.ticketId || 'HQ-DEMO-001';
    const context = await this.servicingService.getTicketContext(ticketId);

    const attrs = {
      ...context.propertyAttributes,
      address: context.propertyAttributes?.address || context.propertyAddress,
    };

    await this.servicingService.appendConversationTurn(
      ticketId,
      'assistant',
      `Presented renewal home details reconfirmation for ${attrs.address}.`
    );

    const roofDesc = attrs.roofGeometry && attrs.roofType
      ? `${attrs.roofGeometry}, ${attrs.roofType} (Replaced ${attrs.roofYear || 2018})`
      : `${attrs.roofType || 'Concrete Tile'} (Replaced ${attrs.roofYear || 2018})`;

    const sqftFormatted = attrs.squareFootage ? Number(attrs.squareFootage).toLocaleString() : '2,450';

    return {
      userFacing:
        `Home details on record for your renewal:\n\n` +
        `• Property Address: ${attrs.address || '1244 Ocean Drive, Miami Beach, FL 33139'}\n` +
        `• Year Built: ${attrs.yearBuilt || 2018}\n` +
        `• Square Footage: ${sqftFormatted} sq ft\n` +
        `• Construction Type: ${attrs.constructionType || 'Reinforced Masonry / Concrete'}\n` +
        `• Roof Geometry & Age: ${roofDesc}\n` +
        `• Primary Use: ${attrs.primaryUse || 'Single Family Residence (Owner Occupied)'}\n\n` +
        `Are these details still accurate? Reply yes to continue to your renewal quotes.`,
      preventFollowUp: true,
      internal: {
        stage: 'awaiting_property_confirmation',
        awaitingPropertyConfirmation: true,
        authenticated: true,
        preventFollowUp: true,
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
        billedToMortgage: context.billedToMortgage,
        insuredEmail: context.recipientEmail,
        userId: context.userId || '6ad9bd5dcfc164fb5ece28e1',
        formId: 1,
        address: attrs.address,
        propertyAddress: attrs.address,
        propertyAttributes: attrs,
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
    _ctx: ExecutionContext
  ) {
    const ticketId = this.authService.getVerifiedTicketId() || input.ticketId || 'HQ-DEMO-001';
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
      'Sends the DocuSign renewal-document signing request to the customer. NEVER call this tool autonomously. Call only when the customer explicitly asks for the signing link or to sign.',
    inputSchema: z.object({
      ticketId: z.string().optional().describe('Policy servicing ticket ID (default HQ-DEMO-001)'),
      recipientEmail: z.string().optional().describe('Customer email for the signing request'),
      delivery: z
        .enum(['direct', 'sms'])
        .optional()
        .describe('Open signing directly or send signing link by SMS'),
    }),
  })
  async docusignSend(
    input: { ticketId?: string; recipientEmail?: string; delivery?: 'direct' | 'sms' },
    _ctx: ExecutionContext
  ) {
    if (!this.authService.isSessionAuthenticated()) {
      return { success: false, userFacing: 'Please provide your mobile number or email address so I can send a verification code.', internal: { success: false, authenticated: false } };
    }
    const ticketId = this.authService.getVerifiedTicketId() || input.ticketId || 'HQ-DEMO-001';
    const result = await this.servicingService.docusignSend({
      ticketId,
      delivery: input.delivery || 'direct',
      recipientEmail: input.recipientEmail,
    });

    return {
      success: true,
      preventFollowUp: true,
      userFacing:
        input.delivery === 'sms'
          ? 'The signing link and your chatbot link were sent by SMS to your phone on file.'
          : 'Your document is ready to sign. Select Sign Now to open DocuSign.',
      internal: { ...result, ticketId, success: true },
    };
  }

  @Tool({
    name: 'hq_docusign_status',
    description: 'Check document signature status. NEVER call this tool autonomously or in a loop. Only call when the customer explicitly asks to verify or check signature status.',
    inputSchema: z.object({ ticketId: z.string().optional() }),
  })
  async docusignStatus(input: { ticketId?: string }, _ctx: ExecutionContext) {
    if (!this.authService.isSessionAuthenticated()) {
      return { success: false, userFacing: 'Please provide your mobile number or email address so I can send a verification code.', internal: { success: false, authenticated: false } };
    }
    const ticketId = this.authService.getVerifiedTicketId() || input.ticketId || 'HQ-DEMO-001';
    const result = await this.servicingService.docusignStatus(ticketId);
    return {
      success: result.ok,
      preventFollowUp: true,
      internal: { ...result, ticketId },
      userFacing: result.signed ? 'Your document has been signed and recorded.' : 'Document signature is still pending.',
    };
  }
}
