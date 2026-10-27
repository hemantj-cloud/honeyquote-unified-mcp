import { z } from '@nitrostack/core';

export const createPaymentLinkSchema = z.object({
  ticketId: z.string().optional().describe('Policy servicing ticket ID (default HQ-DEMO-001)'),
  carrier: z
    .string()
    .optional()
    .describe('Selected insurance carrier (e.g. Citizens Property Insurance, Universal)'),
  premiumAmount: z.number().optional().describe('Selected annual premium amount (e.g. 1842.00)'),
  policyNumber: z.string().optional().describe('Policy number (default HQ-POL-88421)'),
  customerEmail: z.string().optional().describe('Customer email address for checkout receipt'),
});

export type CreatePaymentLinkInput = z.infer<typeof createPaymentLinkSchema>;

export const checkPaymentStatusSchema = z.object({
  checkoutSessionId: z.string().optional().describe('Stripe checkout session ID (cs_test_...)'),
  ticketId: z.string().optional().describe('Policy servicing ticket ID (default HQ-DEMO-001)'),
});

export type CheckPaymentStatusInput = z.infer<typeof checkPaymentStatusSchema>;
