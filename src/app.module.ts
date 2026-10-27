import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { configuration } from './config/configuration.js';
import { PersistenceModule } from './modules/persistence/persistence.module.js';
import { IntegrationsModule } from './modules/integrations/integrations.module.js';
import { InsuranceModule } from './modules/insurance/insurance.module.js';
import { ServicingModule } from './modules/servicing/servicing.module.js';
import { PaymentModule } from './modules/payment/payment.module.js';
import { EscalationModule } from './modules/escalation/escalation.module.js';
import { HealthModule } from './health/health.module.js';

@McpApp({
  module: AppModule,
  server: {
    name: 'honeyquote-unified-mcp',
    version: '1.0.0',
  },
  logging: {
    level: 'info',
  },
})
@Module({
  name: 'app',
  description: 'HoneyQuote Unified Production MCP Server',
  imports: [
    ConfigModule.forRoot(),
    PersistenceModule,
    IntegrationsModule,
    InsuranceModule,
    ServicingModule,
    PaymentModule,
    EscalationModule,
    HealthModule,
  ],
})
export class AppModule {}
