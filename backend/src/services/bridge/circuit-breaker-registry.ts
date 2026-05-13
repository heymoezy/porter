/**
 * Bridge Circuit Breaker Registry — Per-gateway circuit breakers
 *
 * Wraps opossum (CJS) via createRequire. One circuit breaker per gateway ID
 * (not per gateway type — multiple gateways can share a type).
 *
 * errorFilter: isTransientError — rate limits (429) and service-unavailable (503)
 * do NOT count as failures for the circuit. Only persistent errors open the circuit.
 *
 * SSE events are emitted on state transitions for admin observability.
 *
 * Phase 18: Resilience Layer (GW-04)
 */

import { createRequire } from 'node:module';
import { emitSSE } from '../scheduler.js';
import { isTransientError } from './retry.js';
import type { CircuitState } from './types.js';

const require = createRequire(import.meta.url);
// @ts-expect-error CJS default import — opossum has no named ESM export
const CircuitBreaker = require('opossum') as typeof import('opossum').default;

// ── Module-level singleton map ────────────────────────────────────────────────

const _breakers = new Map<string, InstanceType<typeof CircuitBreaker>>();

// ── Factory / accessor ────────────────────────────────────────────────────────

/**
 * Get or create a circuit breaker for the given gateway.
 * Keyed by gatewayId — multiple gateways of the same type each get their own breaker.
 */
export function getBreaker(
  gatewayId: string,
  gatewayType: string
): InstanceType<typeof CircuitBreaker> {
  if (_breakers.has(gatewayId)) {
    return _breakers.get(gatewayId)!;
  }

  // Generic action: the breaker wraps an arbitrary thunk per call.
  // Callers do `breaker.fire(asyncFn)` and `asyncFn` runs through the circuit.
  // Opossum invokes `this.action.apply(ctx, args)` so the wrapped action MUST
  // call its first argument (the caller's fn) — a no-op action would ignore it
  // and resolve to undefined, breaking every non-streaming dispatch. This was
  // dormant until Phase 48.3 Plan 05's dream-worker became the first consumer
  // of selectWithFallback that actually awaits the dispatch result (chat goes
  // through dispatchStream which bypasses breaker.fire entirely).
  const runThunk = async <T>(fn: () => Promise<T>): Promise<T> => fn();

  const breaker = new CircuitBreaker(runThunk, {
    // 180s mirrors dream-worker's BRIDGE_TIMEOUT_MS and the claude_cli adapter's
    // own inner timeout. Streaming chats bypass this breaker entirely (see
    // dispatchStream), so this only governs non-streaming selectWithFallback
    // dispatches (dream-worker, ai-router from scheduler). The prior 30s was
    // a holdover from the pre-Sonnet era — Sonnet refinement runs commonly
    // take 60-120s with a full software-silo corpus.
    timeout: 180_000,
    errorThresholdPercentage: 50,
    resetTimeout: 60_000,
    volumeThreshold: 3,
    rollingCountTimeout: 10_000,
    errorFilter: isTransientError,
  });

  // SSE events on state transitions — for admin observability dashboard
  breaker.on('open', () => {
    emitSSE('bridge:circuit-trip', {
      gateway_id: gatewayId,
      gateway_type: gatewayType,
      state: 'open',
    }).catch(() => {});
  });

  breaker.on('halfOpen', () => {
    emitSSE('bridge:circuit-trip', {
      gateway_id: gatewayId,
      gateway_type: gatewayType,
      state: 'half_open',
    }).catch(() => {});
  });

  breaker.on('close', () => {
    emitSSE('bridge:circuit-trip', {
      gateway_id: gatewayId,
      gateway_type: gatewayType,
      state: 'closed',
    }).catch(() => {});
  });

  _breakers.set(gatewayId, breaker);
  return breaker;
}

/**
 * Get the current circuit state for a gateway, or null if no breaker exists.
 * Useful for admin status endpoints and SSE broadcasting.
 */
export function getBreakerState(gatewayId: string): CircuitState | null {
  const breaker = _breakers.get(gatewayId);
  if (!breaker) return null;

  if (breaker.opened) return 'open';
  if (breaker.halfOpen) return 'half_open';
  return 'closed';
}

/**
 * Clear all circuit breakers from the registry.
 * Used in tests to ensure isolation between test cases.
 */
export function clearBreakers(): void {
  _breakers.clear();
}
