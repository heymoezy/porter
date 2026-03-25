/**
 * Tests for circuit-breaker-registry.ts and retry.ts error classification
 * Uses Node.js built-in test runner (node:test) + tsx for TypeScript support.
 * Run with: npx tsx --test backend/src/__tests__/circuit-breaker.test.ts
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { classifyError, isTransientError } from '../services/bridge/retry.js';
import { getBreaker, clearBreakers, getBreakerState } from '../services/bridge/circuit-breaker-registry.js';

// ── classifyError tests ───────────────────────────────────────────────────────

describe('classifyError()', () => {
  it('classifies 429 rate limit as transient', () => {
    assert.equal(classifyError(new Error('429 rate limit')), 'transient');
  });

  it('classifies 503 service unavailable as transient', () => {
    assert.equal(classifyError(new Error('503 service unavailable')), 'transient');
  });

  it('classifies 401 unauthorized as configuration', () => {
    assert.equal(classifyError(new Error('401 unauthorized')), 'configuration');
  });

  it('classifies 403 forbidden as configuration', () => {
    assert.equal(classifyError(new Error('403 forbidden')), 'configuration');
  });

  it('classifies 500 internal server error as persistent', () => {
    assert.equal(classifyError(new Error('500 internal server error')), 'persistent');
  });

  it('classifies timeout as persistent', () => {
    assert.equal(classifyError(new Error('timeout')), 'persistent');
  });
});

// ── isTransientError tests ────────────────────────────────────────────────────

describe('isTransientError()', () => {
  it('returns true for 429 rate limit error', () => {
    assert.equal(isTransientError(new Error('429 rate limit exceeded')), true);
  });

  it('returns false for 401 unauthorized error', () => {
    assert.equal(isTransientError(new Error('401 unauthorized')), false);
  });

  it('returns false for 500 internal server error', () => {
    assert.equal(isTransientError(new Error('500 internal')), false);
  });
});

// ── getBreaker singleton tests ────────────────────────────────────────────────

describe('getBreaker()', () => {
  before(() => clearBreakers());

  it('returns a breaker instance for a new id', () => {
    const breaker = getBreaker('gw-001', 'ollama');
    assert.ok(breaker, 'Expected a truthy breaker instance');
  });

  it('returns the SAME instance for the same id (singleton)', () => {
    const first = getBreaker('gw-002', 'ollama');
    const second = getBreaker('gw-002', 'openclaw');
    assert.equal(first, second, 'Expected identical breaker instances for same gatewayId');
  });

  it('returns DIFFERENT instances for different ids', () => {
    const a = getBreaker('gw-003', 'ollama');
    const b = getBreaker('gw-004', 'ollama');
    assert.notEqual(a, b);
  });
});

// ── getBreakerState tests ─────────────────────────────────────────────────────

describe('getBreakerState()', () => {
  before(() => clearBreakers());

  it('returns null when no breaker exists for an id', () => {
    assert.equal(getBreakerState('nonexistent-gw'), null);
  });

  it('returns "closed" for a freshly created breaker', () => {
    getBreaker('gw-state-01', 'ollama');
    const state = getBreakerState('gw-state-01');
    assert.equal(state, 'closed');
  });
});

// ── clearBreakers tests ───────────────────────────────────────────────────────

describe('clearBreakers()', () => {
  it('empties the registry so previously seen ids return null', () => {
    getBreaker('gw-clear-01', 'ollama');
    clearBreakers();
    assert.equal(getBreakerState('gw-clear-01'), null);
  });
});
