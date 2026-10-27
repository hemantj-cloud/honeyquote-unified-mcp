import { Module } from '@nitrostack/core';
import { EscalationService } from './escalation.service.js';
import { EscalationTools } from './escalation.tools.js';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';

@Module({
  name: 'escalation',
  description: 'Human-in-the-Loop (HITL) underwriting escalation, AI loop pause, and Slack cards',
  imports: [PersistenceModule, IntegrationsModule],
  controllers: [EscalationTools],
  providers: [EscalationService],
  exports: [EscalationService],
})
export class EscalationModule {}
