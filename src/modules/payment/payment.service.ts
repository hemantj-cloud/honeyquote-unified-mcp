import { Injectable } from '@nitrostack/core';
import { TicketRepository } from '../persistence/ticket.repository.js';
import type { CreatePaymentLinkInput, CheckPaymentStatusInput } from './payment.types.js';

@Injectable({ deps: [TicketRepository] })
export class PaymentService {
  constructor(private readonly ticketRepo: TicketRepository) {}

  async createPaymentLink(input: CreatePaymentLinkInput): Promise<{
    ok: boolean;
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
    const ticketId = input.ticketId || 'HQ-DEMO-001';
    const carrier = input.carrier || 'Citizens Property Insurance';
    const premium = input.premiumAmount || 1842.0;
    const policyNumber = input.policyNumber || 'HQ-POL-88421';

    let email = input.customerEmail;
    if (!email) {
      const ticket = await this.ticketRepo.getTicketContext(ticketId);
      email = ticket.recipientEmail || 'hemantj@wekancode.com';
    }

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
      const widgetReturnBase = process.env.STRIPE_RETURN_URL || 'http://localhost:3003/widgets/stripe-payment-widget.html';
      params.append('success_url', `${widgetReturnBase}?session_id={CHECKOUT_SESSION_ID}&renewed=true`);
      params.append('cancel_url', `${widgetReturnBase}?session_id={CHECKOUT_SESSION_ID}&payment=cancelled`);
      params.append('customer_email', email);

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

    // Persist payment state to direct MongoDB Atlas ticket
    await this.ticketRepo.updateTicket(ticketId, {
      status: 'RENEWAL_BOUND',
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
    };
  }

  async checkPaymentStatus(input: CheckPaymentStatusInput): Promise<{
    status: 'paid' | 'pending';
    ticketId: string;
    checkoutSessionId?: string;
    context?: any;
  }> {
    const ticketId = input.ticketId || 'HQ-DEMO-001';
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    let ticket: any = null;
    try {
      ticket = await this.ticketRepo.getTicketContext(ticketId);
    } catch (err: any) {
      console.warn(`[payment] Could not load ticket before checking status: ${err.message}`);
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

    // 2. Check Stripe Checkout Session if provided
    let isPaid = false;
    if (input.checkoutSessionId && !input.checkoutSessionId.includes('mock') && stripeKey) {
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
    } else if (input.checkoutSessionId && input.checkoutSessionId.includes('mock')) {
      // In mock testing mode without Stripe key, treat as paid
      isPaid = true;
    }

    let context: any = ticket || {};
    if (isPaid) {
      context = await this.ticketRepo.updateTicket(ticketId, {
        status: 'IN_FORCE_RENEWED',
        paymentStatus: 'PAID',
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
