import { z } from '@nitrostack/core';

export const createPaymentLinkSchema = z.object({
  ticketId: z.string().optional().describe('Optional; checkout always uses the verified customer of this chat'),
  carrier: z
    .string()
    .optional()
    .describe('Only when the customer picked a carrier in the quotes widget. Omit for a same-carrier renewal.'),
  premiumAmount: z
    .number()
    .optional()
    .describe('Only when the customer picked a quote in the quotes widget. Omit for a same-carrier renewal.'),
  policyNumber: z.string().optional().describe('Policy number on record (defaults to the ticket policy number)'),
  customerEmail: z.string().optional().describe('Customer email address for checkout receipt'),
});

export type CreatePaymentLinkInput = z.infer<typeof createPaymentLinkSchema>;

export const checkPaymentStatusSchema = z.object({
  checkoutSessionId: z.string().optional().describe('Stripe checkout session ID (cs_test_...)'),
  ticketId: z.string().optional().describe('Ticket ID the checkout was created for'),
});

export type CheckPaymentStatusInput = z.infer<typeof checkPaymentStatusSchema>;
