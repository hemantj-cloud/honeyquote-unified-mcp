import { z } from '@nitrostack/core';
import type { SeedTicketContext } from '../persistence/seed-data.js';

export type HqTicketContext = SeedTicketContext;

export interface OtpChallenge {
  code: string;
  identifier: string;
  expiresAt: number;
  ticketId: string;
  customerName?: string;
  channel: 'sms' | 'email';
  twilioVerifySent?: boolean;
}

export const sendOtpSchema = z.object({
  identifier: z
    .string()
    .describe('Customer phone number (+1...) or email address for OTP delivery'),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;

export const verifyOtpSchema = z.object({
  code: z.string().describe('6-digit verification code entered by customer in chat'),
  identifier: z
    .string()
    .optional()
    .describe('Customer phone number or email (optional, defaults to last session identifier)'),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const getPolicyDetailsSchema = z.object({
  ticketId: z
    .string()
    .optional()
    .describe('Verified session ticket ID (e.g. HQ-DEMO-001)'),
});

export type GetPolicyDetailsInput = z.infer<typeof getPolicyDetailsSchema>;

export const getPendingTasksSchema = z.object({
  ticketId: z
    .string()
    .optional()
    .describe('Verified session ticket ID (e.g. HQ-DEMO-001)'),
});

export type GetPendingTasksInput = z.infer<typeof getPendingTasksSchema>;
