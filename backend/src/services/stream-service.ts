/**
 * Stream Service — thin wrapper around Bridge Routing Engine.
 * All chat streams route through Claude CLI.
 */

import { routingEngine } from './bridge/routing-engine.js';
import type { BridgeDispatchRequest, RoutingContext } from './bridge/types.js';

export interface StreamBackend {
  name: string;
  stream(prompt: string, signal: AbortSignal, systemPrompt?: string): AsyncIterable<string>;
}

export async function streamFromBridge(
  prompt: string,
  signal: AbortSignal,
  ctx: RoutingContext,
  systemPrompt?: string,
): Promise<AsyncIterable<string>> {
  const req: BridgeDispatchRequest = {
    messages: [{ role: 'user', content: prompt }],
    systemPrompt,
  };
  const { stream } = await routingEngine.selectStreamWithFallback(ctx, req, signal);
  return stream;
}

/**
 * Legacy selector — maintained for backward compatibility with Chat controllers.
 * Backend param is ignored (always Claude CLI).
 */
export async function selectStreamBackend(
  message: string,
  _backend?: string,
  ctxOverride?: Partial<RoutingContext>,
): Promise<StreamBackend> {
  return {
    name: 'claude_cli',
    async *stream(prompt: string, signal: AbortSignal, systemPrompt?: string): AsyncIterable<string> {
      const ctx: RoutingContext = { message, ...ctxOverride };
      const iterable = await streamFromBridge(prompt, signal, ctx, systemPrompt);
      for await (const token of iterable) {
        yield token;
      }
    },
  };
}
