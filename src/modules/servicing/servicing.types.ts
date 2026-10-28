import { z } from '@nitrostack/core';
import type { SeedTicketContext } from '../persistence/seed-data.js';

export type HqTicketContext = SeedTicketContext;

export const VERIFY_IDENTITY_PROMPT =
  "I can help with that. First I need to verify your identity. Please share the email address or phone number on your policy, and I'll send a 6-digit verification code.";

export function unauthenticatedResult() {
  return {
    userFacing: VERIFY_IDENTITY_PROMPT,
    internal: {
      success: false,
      authenticated: false,
      error: 'UNAUTHENTICATED_SESSION',
      nextTool: 'send_customer_otp',
    },
  };
}

export interface OtpChallenge {
  channel: 'sms' | 'email';
  /** Email or E.164 phone from the matched ticket — where the code was delivered. */
  destination: string;
  ticketId: string;
  customerName: string;
  /** Email codes only; SMS codes are issued and checked by Twilio Verify. */
  codeHash?: Buffer;
  sentAt: number;
  expiresAt: number;
  attempts: number;
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
    .describe('Optional; the code is checked against the one sent in this chat'),
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
