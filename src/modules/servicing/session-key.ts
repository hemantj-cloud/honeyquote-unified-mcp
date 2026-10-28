import { AsyncLocalStorage } from 'node:async_hooks';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { ExecutionContext } from '@nitrostack/core';

// NitroStack 1.1.x builds the tool context for legacy /sse connections without a
// sessionId, so the SSE transport's own (server-generated) id is carried through
// the message handler instead.
const sseSessionStore = new AsyncLocalStorage<string>();

const transportProto = SSEServerTransport.prototype as any;
if (!transportProto.__hqSessionScoped) {
  const handlePostMessage = transportProto.handlePostMessage;
  transportProto.handlePostMessage = function (this: SSEServerTransport, ...args: unknown[]) {
    return sseSessionStore.run(this.sessionId, () => handlePostMessage.apply(this, args));
  };
  transportProto.__hqSessionScoped = true;
}

/** Per-connection key for customer auth state; undefined when the caller has no session. */
export function sessionKeyOf(ctx?: ExecutionContext): string | undefined {
  if (ctx?.sessionId) return ctx.sessionId;
  const sseSessionId = sseSessionStore.getStore();
  return sseSessionId ? `sse:${sseSessionId}` : undefined;
}
