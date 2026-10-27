import { Injectable } from '@nitrostack/core';

@Injectable()
export class SlackService {
  async postMessage(payload: { text: string; blocks?: any[] }): Promise<{ success: boolean; simulated?: boolean }> {
    const isEnabled = process.env.SLACK_ENABLED === 'true';
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;

    if (!isEnabled || !webhookUrl) {
      console.log(`[slack] Slack webhook simulated: ${payload.text}`);
      return { success: true, simulated: true };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4000),
      });

      if (!response.ok) {
        throw new Error(`Slack webhook HTTP ${response.status}: ${await response.text()}`);
      }

      console.log(`[slack] Successfully posted message to Slack: ${payload.text.slice(0, 60)}`);
      return { success: true };
    } catch (err: any) {
      console.warn(`[slack] Failed to post to Slack: ${err.message}. Gracefully handling.`);
      return { success: true, simulated: true };
    }
  }

  async postHitlApprovalCard(options: {
    taskId: string;
    ticketId: string;
    reason: string;
    carrier?: string;
    coverageA?: number;
    riskTier?: string;
  }): Promise<{ success: boolean; simulated?: boolean }> {
    const formattedCoverage = options.coverageA
      ? `$${Number(options.coverageA).toLocaleString()}`
      : '$650,000';
    const carrier = options.carrier || 'Citizens Property Insurance';
    const riskTier = options.riskTier || 'Tier-B';

    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🚨 Underwriter Approval Required (HITL)', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Task ID:* \`${options.taskId}\` | *Ticket:* \`${options.ticketId || 'HQ-DEMO-001'}\`\n*Reason:* ${options.reason || 'Dwelling replacement value exceeds automatic binding threshold ($500,000)'}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Review Details:*\n• Carrier: *${carrier}*\n• Coverage A (Dwelling): *${formattedCoverage}*\n• Risk Tier: *${riskTier}*`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ Approve Policy Binder', emoji: true },
            style: 'primary',
            value: JSON.stringify({ taskId: options.taskId, decision: 'APPROVED' }),
            action_id: 'hitl_approve_action',
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '❌ Reject / Escalate', emoji: true },
            style: 'danger',
            value: JSON.stringify({ taskId: options.taskId, decision: 'REJECTED' }),
            action_id: 'hitl_reject_action',
          },
        ],
      },
    ];

    return this.postMessage({
      text: `[HITL] Underwriting approval required for ${options.ticketId}: ${options.reason}`,
      blocks,
    });
  }
}
