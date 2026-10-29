import { Injectable } from '@nitrostack/core';
import { TicketRepository } from '../persistence/ticket.repository.js';
import type { CreatePaymentLinkInput, CheckPaymentStatusInput } from './payment.types.js';

const CARRIER_DISPLAY_NAMES: Record<string, string> = {
  citizens: 'Citizens Property Insurance',
  universal: 'Universal Property & Casualty',
  heritage: 'Heritage Insurance',
};

const DEFAULT_RENEWAL_PREMIUM = 1842.0;

function toCarrierDisplayName(carrier: string | undefined): string {
  const name = String(carrier || '').trim();
  if (!name) return CARRIER_DISPLAY_NAMES.citizens;
  return CARRIER_DISPLAY_NAMES[name.toLowerCase()] || name;
}

function addOneYear(yyyyMmDd: string | undefined): string | undefined {
  const [y, m, d] = String(yyyyMmDd || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10);
}

@Injectable({ deps: [TicketRepository] })
export class PaymentService {
  constructor(private readonly ticketRepo: TicketRepository) {}

  async createPaymentLink(input: CreatePaymentLinkInput): Promise<{
    ok: boolean;
    alreadyPaid?: boolean;
    signed?: boolean;
    customerName?: string;
    checkoutUrl: string;
    checkoutSessionId: string;
    clientSecret?: string;
    receiptId: string;
    carrier: string;
    premiumAmount: number;
    policyNumber: string;
    customerEmail: string;
    ticketId: string;
  }> {
    const ticketId = input.ticketId || 'HQ-DEMO-002';
    const ticket = await this.ticketRepo.getTicketContext(ticketId);

    if (ticket.status === 'IN_FORCE_RENEWED' || ticket.paymentStatus === 'PAID') {
      return {
        ok: false,
        alreadyPaid: true,
        signed: ticket.signatureStatus === 'signed',
        customerName: ticket.customerName,
        carrier: toCarrierDisplayName(ticket.carrier),
        premiumAmount: ticket.renewalPremium || DEFAULT_RENEWAL_PREMIUM,
        policyNumber: ticket.policyNumber || '',
        customerEmail: ticket.recipientEmail || '',
        ticketId,
        checkoutUrl: '',
        checkoutSessionId: ticket.checkoutSessionId || '',
        receiptId: ticket.receiptId || '',
      };
    }

    // A same-carrier renewal passes no carrier/premium: price it from the ticket on record.
    const carrier = toCarrierDisplayName(input.carrier || ticket.carrier);
    const premium =
      input.premiumAmount ||
      (ticket.renewalPremium && toCarrierDisplayName(ticket.renewalCarrier) === carrier
        ? ticket.renewalPremium
        : DEFAULT_RENEWAL_PREMIUM);
    const policyNumber = input.policyNumber || ticket.policyNumber || 'HQ-POL-88422';
    const email = input.customerEmail || ticket.recipientEmail || 'navarathinamc@wekancode.com';

    // The new term starts where the current one ends; applied once payment completes.
    const pendingEffectiveDate = ticket.renewalDate;
    const pendingRenewalDate = addOneYear(ticket.renewalDate);

    const slug = ticketId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const receiptId = `rcpt_renew_${slug}_${Date.now()}`;
    const stripeKey =
      process.env.STRIPE_SECRET_KEY ||
      'sk_test_51SZmEy4UOyOnB5dhTMEiag57dTJp5TtOHulDoeNwyQlglQ7GT1ZtbwWUhW41EvNWfmNBKsAAxgF75qD2JB2V38aG00ulejpfV4';

    let checkoutUrl = `https://checkout.stripe.com/pay/cs_test_mock_${slug}_${Date.now()}`;
    let checkoutSessionId = `cs_test_mock_${slug}_${Date.now()}`;
    let clientSecret = '';

    try {
      const params = new URLSearchParams();
      params.append('line_items[0][price_data][currency]', 'usd');
      params.append('line_items[0][price_data][product_data][name]', `${carrier} Policy Renewal`);
      params.append('line_items[0][price_data][product_data][description]', `Policy #${policyNumber} term renewal`);
      params.append('line_items[0][price_data][unit_amount]', String(Math.round(premium * 100)));
      params.append('line_items[0][quantity]', '1');
      params.append('mode', 'payment');
      const isRunningInCloud = Boolean(process.env.NITRO_APP_URL || process.env.KUBERNETES_SERVICE_HOST || process.env.NITROCLOUD);
      const defaultHost = process.env.APP_URL || (process.env.NITRO_APP_URL ? `https://${process.env.NITRO_APP_URL}` : (isRunningInCloud ? 'https://honeyquote-chatapp-6ae1ced1-abhijits-org-33666fb0.app.nitrocloud.ai' : 'http://localhost:3000'));
      const widgetReturnBase = process.env.STRIPE_RETURN_URL || `${defaultHost.replace(/\/$/, '')}/widgets/stripe-payment-widget.html`;
      const ticketParam = `ticket_id=${encodeURIComponent(ticketId)}`;
      params.append('success_url', `${widgetReturnBase}?session_id={CHECKOUT_SESSION_ID}&renewed=true&${ticketParam}`);
      params.append('cancel_url', `${widgetReturnBase}?session_id={CHECKOUT_SESSION_ID}&payment=cancelled&${ticketParam}`);
      params.append('customer_email', email);
      params.append('metadata[ticket_id]', ticketId);

      const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        if (data.url) {
          checkoutUrl = data.url;
          checkoutSessionId = data.id;
          clientSecret = data.client_secret || '';
        }
      }
    } catch (err: any) {
      console.warn('[payment] Stripe API call failed, using graceful mock link:', err.message);
    }

    // Persist payment state and chosen carrier to direct MongoDB Atlas ticket
    await this.ticketRepo.updateTicket(ticketId, {
      status: 'RENEWAL_BOUND',
      paymentStatus: 'PENDING',
      carrier,
      renewalCarrier: carrier,
      renewalPremium: premium,
      receiptId,
      checkoutSessionId,
      pendingEffectiveDate,
      pendingRenewalDate,
    });

    await this.ticketRepo.appendConversationTurn(
      ticketId,
      'system',
      `Stripe checkout created for ${carrier} ($${premium}/yr). Receipt: ${receiptId}`
    );

    return {
      ok: true,
      checkoutUrl,
      checkoutSessionId,
      clientSecret,
      receiptId,
      carrier,
      premiumAmount: premium,
      policyNumber,
      customerEmail: email,
      ticketId,
      customerName: ticket.customerName,
    };
  }

  async checkPaymentStatus(input: CheckPaymentStatusInput): Promise<{
    status: 'paid' | 'pending';
    ticketId: string;
    checkoutSessionId?: string;
    context?: any;
  }> {
    const ticketId = input.ticketId || '';
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    let ticket: any = null;
    try {
      ticket = ticketId ? await this.ticketRepo.getTicketContext(ticketId) : null;
    } catch (err: any) {
      console.warn(`[payment] Could not load ticket before checking status: ${err.message}`);
    }

    // Only the checkout created for this ticket may read or settle it.
    if (!ticket || !input.checkoutSessionId || ticket.checkoutSessionId !== input.checkoutSessionId) {
      return { status: 'pending', ticketId, checkoutSessionId: input.checkoutSessionId };
    }

    // 1. Direct DB Check: If DB is already marked renewed/paid, return paid immediately
    if (ticket && (ticket.status === 'IN_FORCE_RENEWED' || ticket.paymentStatus === 'PAID')) {
      return {
        status: 'paid',
        ticketId,
        checkoutSessionId: input.checkoutSessionId,
        context: ticket,
      };
    }

    // 2. A new or mock session stays pending until Stripe reports this session paid.
    let isPaid = false;
    const mockSession = input.checkoutSessionId.includes('mock');
    if (!mockSession && stripeKey) {
      try {
        const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${input.checkoutSessionId}`, {
          headers: { Authorization: `Bearer ${stripeKey}` },
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const data = (await res.json()) as any;
          isPaid = data.payment_status === 'paid' || data.status === 'complete';
        }
      } catch (err: any) {
        console.warn(`[payment] Stripe session check failed: ${err.message}`);
        isPaid = false;
      }
    }

    let context: any = ticket || {};
    if (isPaid) {
      // Dates come from the values stored at checkout, so concurrent status checks
      // (return tab + widget poll) write the same term instead of rolling it twice.
      const effectiveDate = ticket?.pendingEffectiveDate || ticket?.renewalDate;
      const renewalDate = ticket?.pendingRenewalDate || addOneYear(ticket?.renewalDate);
      context = await this.ticketRepo.updateTicket(ticketId, {
        status: 'IN_FORCE_RENEWED',
        paymentStatus: 'PAID',
        ...(effectiveDate && renewalDate ? { effectiveDate, renewalDate } : {}),
        // Every renewal produces a new document that must be signed, on a new envelope.
        signatureRequired: true,
        signatureStatus: 'PENDING_CUSTOMER_SIGNATURE',
        esignSent: false,
        envelopeId: null,
        signatureDocumentId: null,
        signatureCompletedAt: null,
      });
      await this.ticketRepo.appendConversationTurn(
        ticketId,
        'system',
        `Policy renewal confirmed and bound in force via Stripe payment.`
      );
    }

    return {
      status: isPaid ? 'paid' : 'pending',
      ticketId,
      checkoutSessionId: input.checkoutSessionId,
      context,
    };
  }
}
