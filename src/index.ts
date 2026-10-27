/**
 * HoneyQuote Unified Clean MCP Server
 *
 * Single-process, high-performance MCP server built on the NitroStack TypeScript SDK.
 * Consolidates customer quoting, zero-trust servicing inspection, Stripe payments,
 * and HITL underwriting reviews with zero child processes and zero inter-process HTTP hops.
 */

import 'dotenv/config';
import { McpApplicationFactory } from '@nitrostack/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // Prevent EOF on process.stdin from terminating the dual-mode HTTP/SSE daemon
  process.stdin.resume();
  setInterval(() => {}, 60000);

  // Create and start the unified MCP server
  const server = await McpApplicationFactory.create(AppModule);
  await server.start();
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start HoneyQuote Unified MCP server:', error);
  process.exit(1);
});
