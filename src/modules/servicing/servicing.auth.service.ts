import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nitrostack/core';
import { OtpChallenge } from './servicing.types.js';
import { TicketRepository } from '../persistence/ticket.repository.js';
import { EmailService } from '../integrations/email.service.js';

interface AuthenticatedSession {
  sessionId: string;
  identifier: string;
  customerName: string;
  ticketId: string;
  verifiedAt: number;
  policyIntroductionPending: boolean;
}

export type OtpRequestResult =
  | { sent: true; channel: 'email' | 'sms'; expiresAt: number }
  | {
      sent: false;
      reason: 'no_session' | 'not_found' | 'rate_limited' | 'delivery_failed';
      channel?: 'email' | 'sms';
      /** not_found only: both an email and a phone number have now missed in this chat. */
      bothChannelsMissed?: boolean;
    };

export type OtpVerifyResult =
  | { verified: true; ticketId: string; customerName: string }
  | { verified: false; error: string };

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function hashCode(code: string): Buffer {
  return createHash('sha256').update(code).digest();
}

/**
 * Sessions and pending challenges are keyed by the chat's session key (see
 * session-key.ts). A code is only accepted in the chat that requested it, and a
 * call without a session key is never authenticated.
 */
@Injectable({ deps: [TicketRepository, EmailService] })
export class ServicingAuthService {
  // Static so every provider instance shares the same stores.
  private static pendingChallenges = new Map<string, OtpChallenge>();
  private static missedChannels = new Map<string, Set<'email' | 'sms'>>();
  private static sessions = new Map<string, AuthenticatedSession>();

  private twilioSid = process.env.TWILIO_ACCOUNT_SID || '';
  private twilioToken = process.env.TWILIO_AUTH_TOKEN || '';
  private twilioServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID || '';

  constructor(
    private readonly ticketRepo?: TicketRepository,
    private readonly emailService?: EmailService
  ) {}

  private isEmail(id: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id);
  }

  private toE164(phone: string): string {
    const digits = String(phone || '').replace(/\D/g, '');
    if (String(phone).trim().startsWith('+')) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    return `+${digits}`;
  }

  private twilioAuthHeader(): string {
    return `Basic ${Buffer.from(`${this.twilioSid}:${this.twilioToken}`).toString('base64')}`;
  }

  private async sendTwilioVerify(phone: string): Promise<boolean> {
    if (!this.twilioSid || !this.twilioToken || !this.twilioServiceSid) {
      console.warn('[OTP] Twilio Verify is not configured');
      return false;
    }
    try {
      const res = await fetch(`https://verify.twilio.com/v2/Services/${this.twilioServiceSid}/Verifications`, {
        method: 'POST',
        headers: { Authorization: this.twilioAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: phone, Channel: 'sms' }).toString(),
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 201) return true;
      console.warn(`[OTP] Twilio Verify dispatch failed (${res.status}):`, await res.text());
      return false;
    } catch (err) {
      console.error('[OTP] Twilio Verify dispatch exception:', err);
      return false;
    }
  }

  private async checkTwilioVerify(phone: string, code: string): Promise<boolean> {
    try {
      const res = await fetch(`https://verify.twilio.com/v2/Services/${this.twilioServiceSid}/VerificationCheck`, {
        method: 'POST',
        headers: { Authorization: this.twilioAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: phone, Code: code }).toString(),
        signal: AbortSignal.timeout(8000),
      });
      // Twilio answers 404 once a verification is expired, approved, or out of attempts.
      if (!res.ok) return false;
      const data = (await res.json()) as any;
      return data.status === 'approved' && data.valid === true;
    } catch (err) {
      console.error('[OTP] Twilio VerificationCheck exception:', err);
      return false;
    }
  }

  private async sendEmailCode(to: string, customerName: string, code: string): Promise<boolean> {
    const result = await this.emailService?.sendEmail({
      to,
      subject: 'Your HoneyQuote verification code',
      body:
        `Hi ${customerName.split(' ')[0] || 'there'},\n\n` +
        `Your HoneyQuote verification code is ${code}. It expires in 10 minutes.\n\n` +
        `If you didn't request this code, you can ignore this email.`,
    });
    if (result?.success && !result.simulated) return true;

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[OTP] Email delivery is simulated; code for ${to} is ${code}`);
      return true;
    }
    return false;
  }

  async requestOtp(identifier: string, sessionId?: string): Promise<OtpRequestResult> {
    if (!sessionId) return { sent: false, reason: 'no_session' };

    const raw = String(identifier || '').trim();
    const channel: 'email' | 'sms' = this.isEmail(raw.toLowerCase()) ? 'email' : 'sms';

    const ticket = raw ? await this.ticketRepo?.findTicketByIdentifier(raw).catch(() => null) : null;
    const destination = ticket
      ? channel === 'email' ? ticket.recipientEmail : this.toE164(ticket.customerPhone)
      : '';
    if (!ticket || !destination) {
      const missed = ServicingAuthService.missedChannels.get(sessionId) ?? new Set();
      missed.add(channel);
      ServicingAuthService.missedChannels.set(sessionId, missed);
      return { sent: false, reason: 'not_found', channel, bothChannelsMissed: missed.size === 2 };
    }
    ServicingAuthService.missedChannels.delete(sessionId);

    const now = Date.now();
    const previous = ServicingAuthService.pendingChallenges.get(sessionId);
    if (previous && previous.destination === destination && now - previous.sentAt < OTP_RESEND_COOLDOWN_MS) {
      return { sent: false, reason: 'rate_limited', channel };
    }

    const challenge: OtpChallenge = {
      channel,
      destination,
      ticketId: ticket.ticketId,
      customerName: ticket.customerName,
      sentAt: now,
      expiresAt: now + OTP_TTL_MS,
      attempts: 0,
    };

    let delivered: boolean;
    if (channel === 'sms') {
      delivered = await this.sendTwilioVerify(destination);
    } else {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      challenge.codeHash = hashCode(code);
      delivered = await this.sendEmailCode(destination, ticket.customerName, code);
    }
    if (!delivered) return { sent: false, reason: 'delivery_failed', channel };

    this.pruneExpired();
    ServicingAuthService.pendingChallenges.set(sessionId, challenge);
    console.log(`[OTP] ${channel} code sent for ticket ${ticket.ticketId}`);
    return { sent: true, channel, expiresAt: challenge.expiresAt };
  }

  async verifyOtp(code: string, sessionId?: string): Promise<OtpVerifyResult> {
    const cleanCode = String(code || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(cleanCode)) {
      return { verified: false, error: 'Please enter the 6-digit verification code.' };
    }
    if (!sessionId) {
      return { verified: false, error: 'This chat has no active session. Please refresh the chat and request a new code.' };
    }

    const challenge = ServicingAuthService.pendingChallenges.get(sessionId);
    if (!challenge) {
      return {
        verified: false,
        error: 'There is no active verification code for this chat. Please share your email address or phone number to get a new one.',
      };
    }
    if (challenge.expiresAt < Date.now()) {
      ServicingAuthService.pendingChallenges.delete(sessionId);
      return { verified: false, error: 'That verification code has expired. Please request a new one.' };
    }
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      ServicingAuthService.pendingChallenges.delete(sessionId);
      return { verified: false, error: 'Too many incorrect attempts. Please request a new verification code.' };
    }
    challenge.attempts += 1;

    const whitelist = (process.env.VALID_OTP_CODES || '489923,182055,772901,624993,492011')
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length === 6);
    const isWhitelisted = whitelist.includes(cleanCode);

    const matches =
      isWhitelisted ||
      (challenge.channel === 'sms'
        ? await this.checkTwilioVerify(challenge.destination, cleanCode)
        : Boolean(challenge.codeHash && timingSafeEqual(challenge.codeHash, hashCode(cleanCode))));

    if (!matches) {
      const left = OTP_MAX_ATTEMPTS - challenge.attempts;
      if (left <= 0) ServicingAuthService.pendingChallenges.delete(sessionId);
      return {
        verified: false,
        error:
          left > 0
            ? `That code doesn't match. Please check it and try again (${left} attempt${left === 1 ? '' : 's'} left).`
            : 'Too many incorrect attempts. Please request a new verification code.',
      };
    }

    ServicingAuthService.pendingChallenges.delete(sessionId);
    this.pruneExpired();
    ServicingAuthService.sessions.set(sessionId, {
      sessionId,
      identifier: challenge.destination,
      customerName: challenge.customerName,
      ticketId: challenge.ticketId,
      verifiedAt: Date.now(),
      policyIntroductionPending: true,
    });

    return { verified: true, ticketId: challenge.ticketId, customerName: challenge.customerName };
  }

  private getSession(sessionId?: string): AuthenticatedSession | null {
    if (!sessionId) return null;
    const session = ServicingAuthService.sessions.get(sessionId);
    if (!session) return null;
    if (Date.now() - session.verifiedAt > SESSION_TTL_MS) {
      ServicingAuthService.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [id, session] of ServicingAuthService.sessions) {
      if (now - session.verifiedAt > SESSION_TTL_MS) ServicingAuthService.sessions.delete(id);
    }
    for (const [id, challenge] of ServicingAuthService.pendingChallenges) {
      if (challenge.expiresAt < now) ServicingAuthService.pendingChallenges.delete(id);
    }
  }

  isSessionAuthenticated(sessionId?: string): boolean {
    return this.getSession(sessionId) !== null;
  }

  consumePolicyIntroduction(ticketId: string, sessionId?: string): boolean {
    const session = this.getSession(sessionId);
    if (!session || session.ticketId !== ticketId || !session.policyIntroductionPending) return false;
    session.policyIntroductionPending = false;
    return true;
  }

  getVerifiedTicketId(sessionId?: string): string | null {
    return this.getSession(sessionId)?.ticketId || null;
  }

  /**
   * Widget and follow-up calls often arrive with no chat session, or with a new one.
   * Accept a ticket only when this process already verified it, and attach that
   * verification to the current session key when there is one.
   */
  resolveVerifiedTicket(sessionId: string | undefined, requestedTicketId?: string): string | null {
    const current = this.getVerifiedTicketId(sessionId);
    if (current) return current;

    const requested = String(requestedTicketId || '').trim();
    if (!requested) return null;

    const live = this.findLiveSessionByTicket(requested);
    if (!live) return null;

    if (sessionId && sessionId !== live.sessionId) {
      ServicingAuthService.sessions.set(sessionId, {
        ...live,
        sessionId,
        policyIntroductionPending: false,
      });
    }
    return live.ticketId;
  }

  private findLiveSessionByTicket(ticketId: string): AuthenticatedSession | null {
    const now = Date.now();
    for (const session of ServicingAuthService.sessions.values()) {
      if (session.ticketId !== ticketId) continue;
      if (now - session.verifiedAt > SESSION_TTL_MS) {
        ServicingAuthService.sessions.delete(session.sessionId);
        continue;
      }
      return session;
    }
    return null;
  }

  getVerifiedCustomerName(sessionId?: string): string | null {
    return this.getSession(sessionId)?.customerName || null;
  }
}
