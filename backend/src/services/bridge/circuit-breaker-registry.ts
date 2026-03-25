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

  // noop function — the breaker wraps external calls, not a specific function.
  // Callers call breaker.fire(fn) with the actual async work.
  const noop = async () => {};

  const breaker = new CircuitBreaker(noop, {
    timeout: 30_000,
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
