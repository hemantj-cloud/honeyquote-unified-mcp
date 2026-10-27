import {
  ToolDecorator as Tool,
  Injectable,
  ExecutionContext,
  z,
} from '@nitrostack/core';
import { MongoService } from '../modules/persistence/mongo.service.js';

@Injectable({ deps: [MongoService] })
export class PingTool {
  constructor(private readonly mongoService: MongoService) {}

  @Tool({
    name: 'hq_ping',
    description: 'System health probe and readiness check for HoneyQuote Unified Clean MCP.',
    inputSchema: z.object({
      message: z.string().optional().describe('Optional diagnostic message to echo'),
    }),
  })
  async ping(input: { message?: string }, _ctx: ExecutionContext) {
    const isMongoOnline = this.mongoService.isOnline();
    return {
      ok: true,
      tool: 'hq_ping',
      server: 'honeyquote-unified-mcp',
      timestamp: new Date().toISOString(),
      status: 'healthy',
      persistence: {
        mode: isMongoOnline ? 'atlas_live' : 'resilient_memory',
        atlasConnected: isMongoOnline,
      },
      message: input.message || 'pong',
    };
  }
}
