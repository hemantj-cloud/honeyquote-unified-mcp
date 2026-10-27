import { Injectable } from '@nitrostack/core';
import { TicketRepository } from '../persistence/ticket.repository.js';
import { SlackService } from '../integrations/slack.service.js';
import type { RequestUnderwritingReviewInput } from './escalation.types.js';

@Injectable({ deps: [TicketRepository, SlackService] })
export class EscalationService {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly slackService: SlackService
  ) {}

  async requestUnderwritingReview(input: RequestUnderwritingReviewInput) {
    const ticketId = input.ticketId || 'HQ-DEMO-001';
    const coverageA = input.requestedCoverageA;
    const carrier = input.carrier || 'Citizens Property Insurance';
    const reason =
      input.reason ||
      `Dwelling replacement value ($${coverageA.toLocaleString()}) exceeds automated binding threshold ($500,000).`;

    const taskId = `HITL-${Date.now().toString(36).toUpperCase()}`;

    // 1. Persist HITL task to MongoDB Atlas
    await this.ticketRepo.createHitlTask({
      taskId,
      ticketId,
      type: 'COVERAGE_A_THRESHOLD_OVERRIDE',
      status: 'PENDING_UNDERWRITER_APPROVAL',
      metadata: {
        coverageA,
        carrier,
        reason,
        requestedAt: new Date().toISOString(),
      },
    });

    // 2. Dispatch Slack Block Kit approval card to #honeyquote-servicing
    await this.slackService.postHitlApprovalCard({
      taskId,
      ticketId,
      reason,
      carrier,
      coverageA,
      riskTier: 'Tier-B (High Value Property)',
    });

    // 3. Log to conversation history
    await this.ticketRepo.appendConversationTurn(
      ticketId,
      'system',
      `Manual underwriting escalation triggered for Coverage A $${coverageA.toLocaleString()} (Task: ${taskId})`
    );

    return {
      status: 'PAUSED_HITL',
      taskId,
      ticketId,
      reason,
      reviewData: {
        coverageA,
        carrier,
        riskTier: 'Tier-B',
      },
      hasHitlPause: true,
    };
  }
}
