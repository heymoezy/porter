/**
 * Bridge Service — StreamNormalizer
 *
 * Wraps any GatewayAdapter's stream() output with:
 * 1. Abort signal propagation — stops yielding if signal fires
 * 2. Error boundary — swallows abort errors, re-throws real errors
 * 3. Adapter name tagging — wraps errors with adapter context for debugging
 *
 * Downstream code calls StreamNormalizer.normalize() instead of adapter.stream() directly.
 * The output is the same AsyncIterable<string> but with uniform error handling.
 *
 * Each adapter already normalizes its own wire format to AsyncIterable<string> internally.
 * StreamNormalizer's value is the uniform error boundary and abort handling — not format conversion.
 */

import type { GatewayAdapter, BridgeDispatchRequest } from './types.js';

export class StreamNormalizer {
  /**
   * Wraps any adapter's stream() output with abort propagation and an error boundary.
   *
   * @param adapter - Any GatewayAdapter implementation
   * @param req - Dispatch request (messages, model, temperature, etc.)
   * @param signal - AbortSignal for cancellation (e.g. from client disconnect)
   * @yields string tokens from the adapter's stream
   * @throws Error with adapter name prefix on real (non-abort) errors
   */
  static async *normalize(
    adapter: GatewayAdapter,
    req: BridgeDispatchRequest,
    signal: AbortSignal,
  ): AsyncIterable<string> {
    try {
      for await (const token of adapter.stream(req, signal)) {
        if (signal.aborted) return;
        yield token;
      }
    } catch (err) {
      // Normal abort — swallow silently
      if (signal.aborted) return;
      // Real error — re-throw with adapter context for debugging
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`[${adapter.name}] Stream error: ${message}`);
    }
  }
}
