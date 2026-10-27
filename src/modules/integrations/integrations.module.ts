import { Module } from '@nitrostack/core';
import { EmailService } from './email.service.js';
import { SlackService } from './slack.service.js';

@Module({
  name: 'integrations',
  description: 'Outbound communications and third-party notification integrations (Gmail, Slack)',
  providers: [EmailService, SlackService],
  exports: [EmailService, SlackService],
})
export class IntegrationsModule {}
