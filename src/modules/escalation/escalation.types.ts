import { z } from '@nitrostack/core';

export const requestUnderwritingReviewSchema = z.object({
  ticketId: z.string().optional().describe('Policy servicing ticket ID (default HQ-DEMO-001)'),
  requestedCoverageA: z
    .number()
    .describe('Requested Dwelling Coverage A limit (e.g. 650000)'),
  reason: z
    .string()
    .optional()
    .describe('Reason for manual underwriting review request'),
  carrier: z
    .string()
    .optional()
    .describe('Insurance underwriting carrier name (e.g. Citizens)'),
});

export type RequestUnderwritingReviewInput = z.infer<typeof requestUnderwritingReviewSchema>;
