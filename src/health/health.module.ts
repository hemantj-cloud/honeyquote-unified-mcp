import { Module } from '@nitrostack/core';
import { SystemHealthCheck } from './system.health.js';
import { PingTool } from './ping.tool.js';
import { PersistenceModule } from '../modules/persistence/persistence.module.js';

@Module({
  name: 'health',
  description: 'System health monitoring and hq_ping diagnostic tool',
  imports: [PersistenceModule],
  controllers: [PingTool],
  providers: [SystemHealthCheck],
  exports: [SystemHealthCheck],
})
export class HealthModule {}
