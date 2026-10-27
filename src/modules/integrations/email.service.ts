import { Injectable } from '@nitrostack/core';

@Injectable()
export class EmailService {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  async sendEmail(options: {
    to: string;
    subject: string;
    body: string;
    attachments?: Array<{ filename: string; content: string; contentType: string }>;
  }): Promise<{ success: boolean; messageId?: string; simulated?: boolean }> {
    const isEnabled = process.env.GMAIL_ENABLED === 'true';
    if (!isEnabled) {
      console.log(`[email] Gmail dispatch simulated for: ${options.to} (${options.subject})`);
      return { success: true, messageId: `SIM-${Date.now()}`, simulated: true };
    }

    try {
      const token = await this.getAccessToken();
      if (!token) {
        console.warn('[email] Unable to refresh Gmail token; falling back to simulation.');
        return { success: true, messageId: `SIM-${Date.now()}`, simulated: true };
      }

      const from = process.env.GMAIL_FROM || 'navarathinamc@wekancode.com';
      const rawMessage = this.buildRfc822Message(from, options.to, options.subject, options.body);
      const encoded = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encoded }),
      });

      if (!response.ok) {
        throw new Error(`Gmail API HTTP ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as any;
      console.log(`[email] Email sent successfully to ${options.to} (ID: ${data.id})`);
      return { success: true, messageId: data.id };
    } catch (err: any) {
      console.warn(`[email] Dispatch error: ${err.message}. Gracefully handling.`);
      return { success: true, messageId: `FALLBACK-${Date.now()}`, simulated: true };
    }
  }

  private async getAccessToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) return null;

    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!res.ok) return null;
      const data = (await res.json()) as any;
      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
      return this.accessToken;
    } catch {
      return null;
    }
  }

  private buildRfc822Message(from: string, to: string, subject: string, body: string): string {
    const lines = [
      `From: HoneyQuote Servicing <${from}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ];
    return lines.join('\r\n');
  }
}
