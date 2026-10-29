import {
  ToolDecorator as Tool,
  Widget,
  Injectable,
  ExecutionContext,
} from '@nitrostack/core';
import { PaymentService } from './payment.service.js';
import { ServicingAuthService } from '../servicing/servicing.auth.service.js';
import { ServicingService } from '../servicing/servicing.service.js';
import { unauthenticatedResult } from '../servicing/servicing.types.js';
import { sessionKeyOf } from '../servicing/session-key.js';
import {
  createPaymentLinkSchema,
  checkPaymentStatusSchema,
  type CreatePaymentLinkInput,
  type CheckPaymentStatusInput,
} from './payment.types.js';
import { APP_CONNECT_DOMAINS, resolveSigningPublicUrl, resolveWorkflowApiUrl } from '../../config/app-urls.js';

const STRIPE_PAYMENT_WIDGET = {
  route: 'stripe-payment-widget',
  csp: {
    connectDomains: [
      'https://api.stripe.com',
      'https://checkout.stripe.com',
      ...APP_CONNECT_DOMAINS,
    ],
    resourceDomains: [
      'https://images.honeyquote.com',
      'https://honeyquoteproduction.blob.core.windows.net',
      'https://cdn.prod.website-files.com',
    ],
  },
};

const POLICY_WIDGET = {
  route: 'policy-widget-v2',
  csp: {
    connectDomains: APP_CONNECT_DOMAINS,
    resourceDomains: [
      'https://honeyquoteproduction.blob.core.windows.net',
      'https://cdn.prod.website-files.com',
    ],
  },
};

@Injectable({ deps: [PaymentService, ServicingAuthService, ServicingService] })
export class PaymentTools {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly authService: ServicingAuthService,
    private readonly servicingService: ServicingService
  ) {}

  @Tool({
    name: 'hq_stripe_create_payment_link',
    description:
      'Generate the Stripe checkout widget to pay for and bind a policy renewal. Call immediately after the customer confirms their on-record home details (pass only ticketId — the carrier, premium, and policy number come from the policy on record), or when the customer picks a carrier in the quotes widget (pass that carrier and premium).',
    inputSchema: createPaymentLinkSchema,
  })
  @Widget(STRIPE_PAYMENT_WIDGET)
  async createPaymentLink(input: CreatePaymentLinkInput, ctx: ExecutionContext) {
    const ticketId = this.authService.resolveVerifiedTicket(sessionKeyOf(ctx), input.ticketId);
    if (!ticketId) return unauthenticatedResult();

    const result = await this.paymentService.createPaymentLink({
      ...input,
      ticketId,
      policyNumber: undefined,
      customerEmail: undefined,
    });

    if (result.alreadyPaid) {
      const firstName = String(result.customerName || '').trim().split(/\s+/)[0] || 'there';
      const signingInvitation = this.servicingService.getSigningConsentInvitation({
        status: 'IN_FORCE_RENEWED',
        paymentStatus: 'PAID',
        signatureStatus: result.signed ? 'signed' : 'pending',
        customerName: result.customerName,
      });
      return {
        userFacing: result.signed
          ? `Great news, ${firstName} — your ${result.carrier} policy is renewed. And the document is signed.`
          : signingInvitation || `One last step, ${firstName}. Type **yes** or tap **Sign Now** and I'll open the document.`,
        preventFollowUp: true,
        internal: {
          authenticated: false,
          alreadyPaid: true,
          paid: true,
          preventFollowUp: true,
          awaitingRenewalConsent: false,
          awaitingSignatureConsent: !result.signed,
          ...(result.signed ? {} : { nextTool: 'hq_docusign_send' }),
          ticketId,
          carrier: result.carrier,
          policyNumber: result.policyNumber,
        },
      };
    }

    const formattedPremium = `$${result.premiumAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    const firstName = String(result.customerName || '').trim().split(/\s+/)[0] || 'there';

    return {
      userFacing: `${firstName}, your renewal with **${result.carrier}** is **${formattedPremium}/year**. The checkout card is just below.`,
      preventFollowUp: true,
      internal: {
        preventFollowUp: true,
        paymentStatus: 'AWAITING_CHECKOUT',
        checkoutUrl: result.checkoutUrl,
        checkoutSessionId: result.checkoutSessionId,
        clientSecret: result.clientSecret,
        receiptId: result.receiptId,
        carrier: result.carrier,
        premiumAmount: result.premiumAmount,
        policyNumber: result.policyNumber,
        ticketId: result.ticketId,
        workflowApiUrl: resolveWorkflowApiUrl(),
        nextStep: 'post_renewal_verification',
      },
    };
  }

  @Tool({
    name: 'hq_stripe_payment_status',
    description:
      'Internal Stripe checkout status check — invoked automatically by the payment widget. Never narrate a pending/unpaid status to the customer; only report once the result is paid.',
    inputSchema: checkPaymentStatusSchema,
  })
  @Widget(POLICY_WIDGET)
  async checkStripePaymentStatus(input: CheckPaymentStatusInput, ctx: ExecutionContext) {
    // The Stripe return tab polls without a chat session, so the checkout id (bound to
    // the ticket at creation) is what authorizes this call.
    const ticketId = input.ticketId || this.authService.getVerifiedTicketId(sessionKeyOf(ctx)) || '';
    const result = await this.paymentService.checkPaymentStatus({ ...input, ticketId });

    if (result.status !== 'paid') {
      return {
        userFacing: '',
        preventFollowUp: true,
        internal: {
          paid: false,
          status: 'pending',
          checkoutSessionId: input.checkoutSessionId,
          ticketId,
        },
      };
    }

    const context: any = result.context || {};
    const isSigned = context.signatureStatus === 'signed';
    const signingInvitation = this.servicingService.getSigningConsentInvitation({
      status: context.status || 'IN_FORCE_RENEWED',
      paymentStatus: context.paymentStatus || 'PAID',
      signatureStatus: context.signatureStatus,
      customerName: context.customerName,
    });

    const carrierName = context.carrier || 'Citizens';
    const firstName = String(context.customerName || '').trim().split(/\s+/)[0] || 'there';
    const paymentConfirmation = `Great news, ${firstName} — your ${carrierName} policy is renewed.`;

    return {
      userFacing: isSigned
        ? `${paymentConfirmation} And the document is signed.`
        : paymentConfirmation,
      ...(isSigned || !signingInvitation ? {} : { renewalInvitation: signingInvitation }),
      preventFollowUp: true,
      internal: {
        authenticated: true,
        presentation: isSigned ? 'signed' : 'servicing',
        hasNotification: !isSigned,
        awaitingRenewalConsent: false,
        awaitingSignatureConsent: !isSigned,
        ...(isSigned ? {} : { nextTool: 'hq_docusign_send' }),
        paid: true,
        paymentStatus: 'PAID',
        status: 'IN_FORCE_RENEWED',
        ticketId,
        policyNumber: context.policyNumber,
        carrier: context.carrier,
        coverages: context.coverages,
        deductibles: context.deductibles,
        effectiveDate: context.effectiveDate,
        renewalDate: context.renewalDate,
        signatureRequired: context.signatureRequired,
        esignSent: context.esignSent,
        signatureStatus: context.signatureStatus,
        missingDocuments: context.missingDocuments,
        billedToMortgage: context.billedToMortgage,
        uploadedDocuments: context.uploadedDocuments || [],
        documentStatus: context.documentStatus || (context.missingDocuments?.length ? 'OPEN' : 'COMPLETE'),
        documentUploadUrl: `${resolveSigningPublicUrl()}/api/policy/document/upload`,
        insuredEmail: context.recipientEmail,
        workflowApiUrl: resolveWorkflowApiUrl(),
        signingStatusUrl: `${resolveSigningPublicUrl()}/signing/status`,
        checkoutSessionId: input.checkoutSessionId,
        receiptId: context.receiptId,
        amountPaid: context.renewalPremium,
      },
    };
  }
}
