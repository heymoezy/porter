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

// ── Timeout retry (dev #127 / #113) ───────────────────────────────────────────
//
// A timed-out gateway used to be classified 'persistent' and never tried again.
// It is now retried ONCE, and only when the caller's shared budget can hold a
// full further attempt — a timeout costs the whole adapter ceiling, so paying it
// twice has to be affordable, not automatic.

describe('withRetry() — timeouts', () => {
  const timeoutErr = () => new Error('Claude CLI timed out after 300000ms');

  it('does not retry a timeout unless the caller asks — the old behaviour, kept as the default', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(async () => { calls++; throw timeoutErr(); }),
      /timed out/,
    );
    assert.equal(calls, 1);
  });

  it('retries once when the budget has room', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls === 1) throw timeoutErr();
        return 'answered on the second try';
      },
      3, 1000,
      { retryTimeouts: true, remainingBudgetMs: () => 600_000 },
    );
    assert.equal(result, 'answered on the second try');
    assert.equal(calls, 2);
  });

  it('retries a timeout at most once — a second timeout is an answer', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(
        async () => { calls++; throw timeoutErr(); },
        3, 1000,
        { retryTimeouts: true, remainingBudgetMs: () => 600_000 },
      ),
      /timed out/,
    );
    assert.equal(calls, 2, 'expected exactly one retry, not a third attempt');
  });

  it('refuses the retry when the budget cannot hold another attempt, and says so', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(
        async () => {
          calls++;
          await new Promise((r) => setTimeout(r, 30));
          throw timeoutErr();
        },
        3, 1000,
        { retryTimeouts: true, remainingBudgetMs: () => 5 },
      ),
      (e: Error) => {
        // The ceiling has to name itself. A silent one costs days (v6.159.0).
        assert.match(e.message, /timed out/, 'original error is preserved');
        assert.match(e.message, /no retry/, 'the refusal is stated');
        assert.match(e.message, /budget left/, 'the budget that refused it is named');
        return true;
      },
    );
    assert.equal(calls, 1);
  });

  it('does not sleep before a timeout retry — the attempt already spent the time', async () => {
    let calls = 0;
    const started = Date.now();
    await withRetry(
      async () => {
        calls++;
        if (calls === 1) throw timeoutErr();
        return 'ok';
      },
      3,
      5_000, // a backoff this long would be obvious if it were applied
      { retryTimeouts: true, remainingBudgetMs: () => 600_000 },
    );
    assert.ok(Date.now() - started < 1_000, 'timeout retry must not back off');
  });

  it('never retries the chain budget running out — that IS the refusal', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(
        async () => { calls++; throw new Error('[failover:budget-timeout] attempt exceeded 300000ms slice'); },
        3, 1000,
        { retryTimeouts: true, remainingBudgetMs: () => 600_000 },
      ),
      /budget-timeout/,
    );
    assert.equal(calls, 1, 'a budget timeout must never buy another attempt');
  });

  it('still backs off and retries genuine transient errors', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('429 rate limit');
        return 'ok';
      },
      3, 1,
      { retryTimeouts: true, remainingBudgetMs: () => 600_000 },
    );
    assert.equal(result, 'ok');
    assert.equal(calls, 3);
  });
});
