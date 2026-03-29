/**
 * Stream Service
 * Refactored: Now a thin wrapper around the unified Bridge Routing Engine.
 * Ensures all chat streams are subject to DB-driven routing, fallback, and logging.
 *
 * Phase 24: Bridge Unification (GPT-5.4 / Gemini task)
 */

import { routingEngine } from './bridge/routing-engine.js';
import type { BridgeDispatchRequest, RoutingContext } from './bridge/types.js';

// ---------------------------------------------------------------------------
// StreamBackend interface (legacy compatibility)
// ---------------------------------------------------------------------------

export interface StreamBackend {
  name: string;
  stream(prompt: string, signal: AbortSignal, systemPrompt?: string): AsyncIterable<string>;
}

/**
 * Modern replacement for selectStreamBackend.
 * Bridges the legacy chat endpoints to the new Routing Engine.
 */
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
 * Legacy selector — refactored to use RoutingEngine.
 * Maintained for backward compatibility with existing Chat controllers.
 * Accepts optional context for routing rules and dispatch logging.
 */
export async function selectStreamBackend(
  message: string,
  backend?: 'ollama' | 'openclaw' | 'auto',
  ctxOverride?: Partial<RoutingContext>,
): Promise<StreamBackend> {
  // Return an object that satisfies the legacy StreamBackend interface
  // but internally uses the unified routing engine.
  return {
    name: backend === 'ollama' ? 'ollama' : backend === 'openclaw' ? 'openclaw' : 'auto',
    async *stream(prompt: string, signal: AbortSignal, systemPrompt?: string): AsyncIterable<string> {
      const ctx: RoutingContext = {
        message: message, // Use initial message for routing
        ...ctxOverride,
      };

      const iterable = await streamFromBridge(prompt, signal, ctx, systemPrompt);
      for await (const token of iterable) {
        yield token;
      }
    },
  };
}
