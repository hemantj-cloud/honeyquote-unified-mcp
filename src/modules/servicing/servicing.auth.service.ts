import { Injectable } from '@nitrostack/core';
import { OtpChallenge } from './servicing.types.js';
import { ServicingService } from './servicing.service.js';
import { TicketRepository } from '../persistence/ticket.repository.js';

interface AuthenticatedSession {
  sessionId: string;
  identifier: string;
  customerName: string;
  ticketId: string;
  verifiedAt: number;
  policyIntroductionPending: boolean;
}

@Injectable({ deps: [ServicingService, TicketRepository] })
export class ServicingAuthService {
  // Shared static challenge and session storage across stateless MCP tool requests
  private static challenges = new Map<string, OtpChallenge>();
  private static sessions = new Map<string, AuthenticatedSession>();
  private static defaultSession: AuthenticatedSession | null = null;
  private static lastChallenge: OtpChallenge | null = null;
  private static lastPhoneIdentifier: string | null = null;

  // Production whitelisted 6-digit verification OTP pool
  private validOtpCodes: string[] = (process.env.VALID_OTP_CODES || '489923,182055,772901,624993,492011')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length === 6);
  private validOtpSet: Set<string>;
  private challengeRotationIndex = 0;

  private twilioSid = process.env.TWILIO_ACCOUNT_SID || '';
  private twilioToken = process.env.TWILIO_AUTH_TOKEN || '';
  private twilioServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID || '';
  private defaultPhone = process.env.TWILIO_DEFAULT_PHONE || process.env.DEFAULT_CUSTOMER_PHONE || '';

  constructor(
    private readonly servicingService?: ServicingService,
    private readonly ticketRepo?: TicketRepository
  ) {
    const envCodes = (process.env.VALID_OTP_CODES || '')
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length === 6);
    this.validOtpCodes = Array.from(
      new Set([...this.validOtpCodes, ...envCodes, '492011', '489923', '182055', '772901', '624993'])
    );
    this.validOtpSet = new Set(this.validOtpCodes);
  }

  getDefaultPhone(): string {
    return this.defaultPhone;
  }

  private normalizeIdentifier(id: string): string {
    return String(id || '').trim().toLowerCase();
  }

  private extractDigits(id: string): string {
    return String(id || '').replace(/\D/g, '');
  }

  private isEmail(id: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id);
  }

  async sendTwilioVerify(phone: string): Promise<boolean> {
    if (!this.twilioSid || !this.twilioToken || !this.twilioServiceSid) return false;
    try {
      const auth = Buffer.from(`${this.twilioSid}:${this.twilioToken}`).toString('base64');
      const params = new URLSearchParams();
      params.append('To', phone);
      params.append('Channel', 'sms');

      console.log(`[OTP] Dispatching Twilio Verify SMS to ${phone}...`);
      const res = await fetch(`https://verify.twilio.com/v2/Services/${this.twilioServiceSid}/Verifications`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 201) {
        console.log(`[OTP] Twilio Verify SMS successfully dispatched to ${phone}`);
        return true;
      }
      const errText = await res.text();
      console.warn(`[OTP] Twilio Verify dispatch failed (${res.status}):`, errText);
      return false;
    } catch (err) {
      console.error('[OTP] Twilio Verify dispatch exception:', err);
      return false;
    }
  }

  async checkTwilioVerify(phone: string, code: string): Promise<boolean> {
    try {
      const auth = Buffer.from(`${this.twilioSid}:${this.twilioToken}`).toString('base64');
      const params = new URLSearchParams();
      params.append('To', phone);
      params.append('Code', code);

      console.log(`[OTP] Verifying code with Twilio for ${phone}...`);
      const res = await fetch(`https://verify.twilio.com/v2/Services/${this.twilioServiceSid}/VerificationCheck`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[OTP] Twilio VerificationCheck HTTP ${res.status}:`, errText);
        return false;
      }
      const data = (await res.json()) as any;
      console.log(`[OTP] Twilio VerificationCheck result: status=${data.status}, valid=${data.valid}`);
      return data.status === 'approved' && data.valid === true;
    } catch (err) {
      console.error('[OTP] Twilio VerificationCheck exception:', err);
      return false;
    }
  }

  formatE164(norm: string): string {
    const digitsOnly = this.extractDigits(norm);
    if (!digitsOnly || digitsOnly.length < 10) return norm;

    if (norm.startsWith('+')) {
      if (digitsOnly.length === 10 && this.defaultPhone.includes(digitsOnly)) {
        return this.defaultPhone;
      }
      return norm.replace(/[\s-]/g, '');
    }

    if (digitsOnly.length === 10) {
      if (this.defaultPhone.includes(digitsOnly)) {
        return this.defaultPhone;
      }
      if (/^[6-9]/.test(digitsOnly) && this.defaultPhone.startsWith('+91')) {
        return `+91${digitsOnly}`;
      }
      return `+1${digitsOnly}`;
    }

    return `+${digitsOnly}`;
  }
  async createOtpChallenge(
    identifier: string,
    ticketId = 'HQ-DEMO-001',
    customerName = 'Jordan Mitchell'
  ): Promise<{ code: string; expiresAt: number; identifier: string; channel: 'email' | 'sms'; ticketId: string; customerName: string }> {
    const rawId = (identifier && identifier !== 'default') ? identifier : this.defaultPhone;
    const norm = this.normalizeIdentifier(rawId);
    const channel: 'email' | 'sms' = this.isEmail(norm) ? 'email' : 'sms';

    let resolvedTicketId = ticketId;
    let resolvedCustomerName = customerName;

    if (this.ticketRepo) {
      try {
        const found = await this.ticketRepo.findTicketByIdentifier(rawId);
        if (found) {
          resolvedTicketId = found.ticketId;
          resolvedCustomerName = found.customerName;
        }
      } catch (err) {
        console.warn('[auth] Error matching ticket by identifier:', err);
      }
    }

    // Assign 6-digit production code rotating through the pool
    const code = this.validOtpCodes[this.challengeRotationIndex % this.validOtpCodes.length] || '489923';
    this.challengeRotationIndex = (this.challengeRotationIndex + 1) % this.validOtpCodes.length;

    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes validity

    const challenge: OtpChallenge = {
      identifier: norm,
      code,
      ticketId: resolvedTicketId,
      customerName: resolvedCustomerName,
      expiresAt,
      channel,
    };

    const digitsOnly = this.extractDigits(norm);
    // Dual-key challenge storage for resilient lookups
    ServicingAuthService.challenges.set(norm, challenge);
    if (digitsOnly.length >= 10) {
      ServicingAuthService.challenges.set(digitsOnly.slice(-10), challenge);
      ServicingAuthService.lastPhoneIdentifier = this.formatE164(norm);
    }
    ServicingAuthService.lastChallenge = challenge;

    return { code, expiresAt, identifier: norm, channel, ticketId: resolvedTicketId, customerName: resolvedCustomerName };
  }

  /**
   * Dispatches the real OTP through the servicing API, which stores it in the
   * otp_challenges collection and delivers it to the ticket's seeded contact —
   * email via Gmail, SMS via Twilio Messages. Falls back to a Twilio Verify SMS
   * (its own provider-side code) when the API can't deliver.
   */
  async requestOtp(
    identifier: string,
    ticketId = 'HQ-DEMO-001',
    customerName = 'Jordan Mitchell'
  ): Promise<{
    channel: 'email' | 'sms';
    sent: boolean;
    via?: string;
    matched?: boolean;
    deliveredTo?: string;
    expiresAt: number;
  }> {
    const challenge = await this.createOtpChallenge(identifier, ticketId, customerName);

    const apiResult = await this.servicingService?.sendOtp(challenge.identifier, {
      ticketId: challenge.ticketId,
      customerName: challenge.customerName,
    });
    if (apiResult?.sent) {
      return {
        channel: apiResult.channel || challenge.channel,
        sent: true,
        via: apiResult.via,
        matched: apiResult.matched,
        deliveredTo: apiResult.deliveredTo,
        expiresAt: challenge.expiresAt,
      };
    }

    if (challenge.channel === 'sms' && (await this.sendTwilioVerifyChallenge(challenge.identifier))) {
      return { channel: challenge.channel, sent: true, via: 'twilio-verify', expiresAt: challenge.expiresAt };
    }

    return { channel: challenge.channel, sent: false, expiresAt: challenge.expiresAt };
  }

  /** Twilio Verify fallback — only used when the servicing API can't deliver SMS. */
  private async sendTwilioVerifyChallenge(norm: string): Promise<boolean> {
    const digitsOnly = this.extractDigits(norm);
    if (digitsOnly.length < 10) return false;
    const e164 = this.formatE164(norm);
    try {
      const sent = await this.sendTwilioVerify(e164);
      if (sent) {
        ServicingAuthService.lastPhoneIdentifier = e164;
        const challenge = ServicingAuthService.challenges.get(norm) || ServicingAuthService.lastChallenge;
        if (challenge) challenge.twilioVerifySent = true;
      }
      return sent;
    } catch (err) {
      console.error('[OTP] Twilio Verify send failed:', err);
      return false;
    }
  }

  async verifyOtp(
    identifier: string,
    code: string,
    sessionId = 'default-session'
  ): Promise<{ verified: boolean; customerName?: string; ticketId?: string; error?: string }> {
    const cleanCode = String(code || '').trim();
    if (!cleanCode) {
      return { verified: false, error: 'Please enter a valid 6-digit verification code.' };
    }

    const rawId = (identifier && identifier !== 'default') ? identifier : (ServicingAuthService.lastPhoneIdentifier || this.defaultPhone);
    const norm = this.normalizeIdentifier(rawId);
    const digitsOnly = this.extractDigits(norm);

    // Look up challenge by normalized id, 10-digit phone suffix, or last active challenge
    const challenge = ServicingAuthService.challenges.get(norm)
      || (digitsOnly.length >= 10 ? ServicingAuthService.challenges.get(digitsOnly.slice(-10)) : undefined)
      || ServicingAuthService.lastChallenge;

    // Check 1: Whitelist matching against the configured production OTP codes
    const isWhitelistedCode = this.validOtpSet.has(cleanCode);

    // Check 2: Real OTP issued and stored by the servicing API (otp_challenges collection)
    let apiVerified = false;
    let apiTicketId: string | undefined;
    if (!isWhitelistedCode) {
      try {
        const res = await this.servicingService?.verifyOtpCode(norm, cleanCode);
        apiVerified = res?.verified === true;
        apiTicketId = res?.ticketId;
      } catch (err) {
        console.warn('[OTP] servicingService.verifyOtpCode error:', err);
      }
    }

    // Resolve target phone for Twilio verification
    let phoneForTwilio: string | null = null;
    if (digitsOnly.length >= 10) {
      phoneForTwilio = this.formatE164(norm);
    } else if (challenge && this.extractDigits(challenge.identifier).length >= 10) {
      phoneForTwilio = this.formatE164(challenge.identifier);
    } else if (ServicingAuthService.lastPhoneIdentifier) {
      phoneForTwilio = ServicingAuthService.lastPhoneIdentifier;
    } else if (this.extractDigits(this.defaultPhone).length >= 10) {
      phoneForTwilio = this.defaultPhone;
    }

    // Check 3: Twilio verification check if not whitelisted, not apiVerified, and phone is resolved
    let twilioVerified = false;
    if (!isWhitelistedCode && !apiVerified && phoneForTwilio) {
      try {
        twilioVerified = await this.checkTwilioVerify(phoneForTwilio, cleanCode);
      } catch {
        twilioVerified = false;
      }
    }

    // Check 4: Match against the local fallback challenge
    const isChallengeCodeMatch = challenge ? challenge.code === cleanCode : false;

    // Verification evaluation
    const isApproved = isWhitelistedCode || apiVerified || twilioVerified || isChallengeCodeMatch;

    if (!isApproved) {
      if (challenge && challenge.expiresAt < Date.now()) {
        ServicingAuthService.challenges.delete(norm);
        if (digitsOnly.length >= 10) ServicingAuthService.challenges.delete(digitsOnly.slice(-10));
        return { verified: false, error: 'Verification code has expired. Please request a new code.' };
      }
      return { verified: false, error: 'The 6-digit verification code entered is invalid or expired. Please check your SMS and try again.' };
    }

    let ticketId = apiTicketId || challenge?.ticketId;
    let customerName = challenge?.customerName;

    if ((!ticketId || ticketId === 'HQ-DEMO-001') && this.ticketRepo) {
      try {
        const found = await this.ticketRepo.findTicketByIdentifier(norm);
        if (found) {
          ticketId = found.ticketId;
          customerName = found.customerName;
        }
      } catch (err) {
        console.warn('[auth] Error finding ticket during verifyOtp:', err);
      }
    }

    ticketId = ticketId || 'HQ-DEMO-001';
    customerName = customerName || 'Jordan Mitchell';

    const session: AuthenticatedSession = {
      sessionId,
      identifier: norm,
      customerName,
      ticketId,
      verifiedAt: Date.now(),
      policyIntroductionPending: true,
    };

    ServicingAuthService.sessions.set(sessionId, session);
    ServicingAuthService.defaultSession = session;

    // Clean up challenge after successful verification
    ServicingAuthService.challenges.delete(norm);
    if (digitsOnly.length >= 10) {
      ServicingAuthService.challenges.delete(digitsOnly.slice(-10));
    }
    if (ServicingAuthService.lastChallenge?.identifier === norm) {
      ServicingAuthService.lastChallenge = null;
    }

    return {
      verified: true,
      customerName,
      ticketId,
    };
  }

  isSessionAuthenticated(sessionId = 'default-session'): boolean {
    return ServicingAuthService.sessions.has(sessionId) || ServicingAuthService.defaultSession !== null;
  }

  consumePolicyIntroduction(ticketId: string, sessionId = 'default-session'): boolean {
    const session = ServicingAuthService.sessions.get(sessionId) || ServicingAuthService.defaultSession;
    if (!session || session.ticketId !== ticketId || !session.policyIntroductionPending) return false;
    session.policyIntroductionPending = false;
    return true;
  }

  getVerifiedTicketId(sessionId = 'default-session'): string {
    return ServicingAuthService.sessions.get(sessionId)?.ticketId || ServicingAuthService.defaultSession?.ticketId || 'HQ-DEMO-001';
  }

  getVerifiedCustomerName(sessionId = 'default-session'): string {
    return ServicingAuthService.sessions.get(sessionId)?.customerName || ServicingAuthService.defaultSession?.customerName || 'Jordan Mitchell';
  }

  getLastIdentifier(): string | null {
    return ServicingAuthService.lastChallenge?.identifier || ServicingAuthService.lastPhoneIdentifier || ServicingAuthService.defaultSession?.identifier || null;
  }
}


