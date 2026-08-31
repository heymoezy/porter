/**
 * Bridge Retry — Exponential backoff wrapper with error classification
 *
 * Transient errors (429, 503) are retried with exponential backoff.
 * Configuration errors (401, 403) fail immediately — no point retrying.
 * Timeouts are retried ONCE, and only when the chain budget can hold another
 * attempt (see withRetry).
 * Persistent errors (500, ECONNREFUSED) fail immediately.
 *
 * Phase 18: Resilience Layer (GW-05)
 */

import type { ErrorClass } from './types.js';
import { BUDGET_TIMEOUT_MARKER } from './failover.js';

// ── Error classification ───────────────────────────────────────────────────────

const TRANSIENT_RE = /429|rate.?limit|too.?many|503|service.?unavailable/i;
const CONFIGURATION_RE = /401|403|unauthorized|forbidden/i;
const TIMEOUT_RE = /timed.?out|timeout|ETIMEDOUT|ESOCKETTIMEDOUT/i;

/**
 * Classify an error into one of four categories:
 * - 'transient'     — temporary, safe to retry (429, 503, rate limits)
 * - 'configuration' — auth/permissions issue, retrying is pointless (401, 403)
 * - 'timeout'       — the attempt ran out of time; worth ONE more try if the
 *                     budget can hold it, which is the caller's call, not ours
 * - 'persistent'    — hard failure, do not retry (500, ECONNREFUSED)
 *
 * Timeout used to fall into 'persistent', so a gateway that timed out was never
 * tried again — the reported symptom behind Tom's timeout failures.
 */
export function classifyError(err: Error): ErrorClass {
  const msg = err.message;

  // A budget timeout is the chain's OWN clock saying there is no time left. It
  // reads as a timeout and must never be retried: retrying is precisely the
  // thing the budget just refused.
  if (msg.includes(BUDGET_TIMEOUT_MARKER)) return 'persistent';

  if (TRANSIENT_RE.test(msg)) return 'transient';
  if (CONFIGURATION_RE.test(msg)) return 'configuration';
  if (TIMEOUT_RE.test(msg)) return 'timeout';
  return 'persistent';
}

/**
 * Returns true if the error is transient and safe to retry.
 *
 * Deliberately false for timeouts. This is also the circuit breaker's
 * errorFilter (circuit-breaker-registry.ts): a `true` here means "do not count
 * this against the gateway". A gateway that times out SHOULD count.
 */
export function isTransientError(err: Error): boolean {
  return classifyError(err) === 'transient';
}

/** Returns true if the attempt ran out of time (not the chain's own budget). */
export function isTimeoutError(err: Error): boolean {
  return classifyError(err) === 'timeout';
}

// ── withRetry ─────────────────────────────────────────────────────────────────

export interface RetryOptions {
  /**
   * Retry a timed-out attempt once. Off by default: a timeout costs the full
   * adapter ceiling, so paying it twice is only ever the caller's decision.
   */
  retryTimeouts?: boolean;
  /**
   * Wall-clock left in the caller's budget, sampled at the moment a retry is
   * being considered. A timeout retry is refused unless the remaining budget
   * can hold an attempt as long as the one that just failed.
   *
   * Omitted means unbounded, so pass this from any caller that has a budget.
   */
  remainingBudgetMs?: () => number;
}

/**
 * Retry `fn` up to `maxAttempts` times with exponential backoff.
 *
 * Retries transient errors. Configuration and persistent errors throw
 * immediately. A timeout is retried at most ONCE, and only when
 * `opts.retryTimeouts` is set AND the remaining budget can hold another attempt
 * of the same length as the one that just timed out.
 *
 * When a timeout retry is refused for lack of budget, the thrown error says so.
 * A ceiling we set ourselves must name itself in the error — a silent one costs
 * days of diagnosis (v6.159.0).
 *
 * Backoff schedule (baseDelayMs = 1000 default):
 *   attempt 1 → fail → wait 1000ms
 *   attempt 2 → fail → wait 2000ms
 *   attempt 3 → fail → throw
 *
 * A timeout retry does NOT back off. The attempt already spent minutes; sleeping
 * on top of that spends budget that the retry itself needs.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000,
  opts: RetryOptions = {},
): Promise<T> {
  let lastError: Error = new Error('withRetry: no attempts made');
  let timeoutRetried = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStart = Date.now();
    try {
      return await fn();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      lastError = e;

      const errorClass = classifyError(e);

      if (errorClass === 'timeout') {
        // One retry, and only one: a second timeout is the gateway telling us
        // something the third attempt would not change.
        if (!opts.retryTimeouts || timeoutRetried || attempt === maxAttempts) {
          throw e;
        }

        const elapsed = Date.now() - attemptStart;
        const remaining = opts.remainingBudgetMs?.() ?? Number.POSITIVE_INFINITY;

        // Require room for an attempt as long as the one that just failed.
        // Anything less buys a second timeout instead of a second answer.
        if (remaining < elapsed) {
          throw new Error(
            `${e.message} [no retry: ${Math.max(0, Math.round(remaining))}ms of budget left, ` +
            `another attempt needs ~${Math.round(elapsed)}ms]`,
            { cause: e },
          );
        }

        timeoutRetried = true;
        continue; // no backoff — see above
      }

      // Non-transient errors fail immediately — no point retrying
      if (errorClass !== 'transient') {
        throw e;
      }

      // Last attempt exhausted — fall through to throw
      if (attempt === maxAttempts) {
        break;
      }

      // Exponential backoff before next attempt: baseDelayMs * 2^(attempt-1)
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise<void>((r) => setTimeout(r, delayMs));
    }
  }

  throw lastError;
}
