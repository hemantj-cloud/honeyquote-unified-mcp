import { Module } from '@nitrostack/core';
import { ServicingService } from './servicing.service.js';
import { ServicingAuthService } from './servicing.auth.service.js';
import { SigningService } from './signing.service.js';
import { EsignAdminService } from './esign-admin.service.js';
import { ServicingTools } from './servicing.tools.js';
import { ServicingPrompts } from './servicing.prompts.js';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';

@Module({
  name: 'servicing',
  description: 'Zero-trust OTP verification, policy inspection, servicing checklist, and COI delivery',
  imports: [PersistenceModule, IntegrationsModule],
  controllers: [ServicingTools, ServicingPrompts],
  providers: [ServicingService, ServicingAuthService, SigningService, EsignAdminService],
  exports: [ServicingService, ServicingAuthService, SigningService, EsignAdminService],
})
export class ServicingModule {}
