import {
  ToolDecorator as Tool,
  Injectable,
  ExecutionContext,
} from '@nitrostack/core';
import { EscalationService } from './escalation.service.js';
import {
  requestUnderwritingReviewSchema,
  type RequestUnderwritingReviewInput,
} from './escalation.types.js';

@Injectable({ deps: [EscalationService] })
export class EscalationTools {
  constructor(private readonly escalationService: EscalationService) {}

  @Tool({
    name: 'request_underwriting_review',
    description:
      'Escalates a policy adjustment to Human-in-the-Loop (HITL) underwriting review when dwelling limits exceed automatic approval threshold ($500,000). Pauses AI loop and notifies underwriters via Slack.',
    inputSchema: requestUnderwritingReviewSchema,
  })
  async requestUnderwritingReview(
    input: RequestUnderwritingReviewInput,
    _ctx: ExecutionContext
  ) {
    const result = await this.escalationService.requestUnderwritingReview(input);

    return {
      userFacing: `⚠️ **Underwriting Review Required**: Your request to increase dwelling coverage to **$${input.requestedCoverageA.toLocaleString()}** exceeds our standard automated binding limit ($500,000).\n\nI have paused this workflow and dispatched an expedited approval card to our senior underwriting team in Slack (#honeyquote-servicing). You will receive an instant notification as soon as your policy binder adjustment is evaluated.`,
      preventFollowUp: true,
      internal: {
        ...result,
      },
    };
  }
}
