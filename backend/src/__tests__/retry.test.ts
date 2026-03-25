/**
 * Tests for retry.ts — withRetry() exponential backoff wrapper
 * Uses Node.js built-in test runner (node:test) + tsx for TypeScript support.
 * Run with: npx tsx --test backend/src/__tests__/retry.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { withRetry } from '../services/bridge/retry.js';

// ── withRetry tests ───────────────────────────────────────────────────────────

describe('withRetry()', () => {
  it('succeeds on the first attempt (no retry needed)', async () => {
    let callCount = 0;
    const result = await withRetry(async () => {
      callCount++;
      return 'ok';
    });
    assert.equal(result, 'ok');
    assert.equal(callCount, 1);
  });

  it('retries on a transient error and succeeds on attempt 2', async () => {
    let callCount = 0;
    const result = await withRetry(async () => {
      callCount++;
      if (callCount === 1) throw new Error('429 rate limit');
      return 'success';
    }, 3, 1); // 1ms base delay for fast test
    assert.equal(result, 'success');
    assert.equal(callCount, 2);
  });

  it('does NOT retry on a non-transient (configuration) error — throws immediately', async () => {
    let callCount = 0;
    await assert.rejects(async () => {
      await withRetry(async () => {
        callCount++;
        throw new Error('401 unauthorized');
      }, 3, 1);
    }, /401/);
    assert.equal(callCount, 1, 'Should only call function once — no retry on auth errors');
  });

  it('does NOT retry on a non-transient (persistent) error — throws immediately', async () => {
    let callCount = 0;
    await assert.rejects(async () => {
      await withRetry(async () => {
        callCount++;
        throw new Error('500 internal server error');
      }, 3, 1);
    }, /500/);
    assert.equal(callCount, 1, 'Should only call function once — no retry on persistent errors');
  });

  it('throws after maxAttempts exhausted for transient errors', async () => {
    let callCount = 0;
    await assert.rejects(async () => {
      await withRetry(async () => {
        callCount++;
        throw new Error('503 service unavailable');
      }, 3, 1);
    }, /503/);
    assert.equal(callCount, 3, 'Should attempt exactly 3 times before giving up');
  });

  it('applies exponential backoff — attempt count increases correctly', async () => {
    // Verify attempts happen in order, not exact timing (setTimeout mocking is fragile)
    const attempts: number[] = [];
    let callCount = 0;
    await assert.rejects(async () => {
      await withRetry(async () => {
        callCount++;
        attempts.push(callCount);
        throw new Error('429 rate limit'); // transient — will retry
      }, 3, 1); // tiny base delay so test is fast
    });
    assert.deepEqual(attempts, [1, 2, 3], 'Should make 3 attempts in sequence');
  });
});
