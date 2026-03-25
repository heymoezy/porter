/**
 * Bridge Retry — Exponential backoff wrapper with error classification
 *
 * Transient errors (429, 503) are retried with exponential backoff.
 * Configuration errors (401, 403) fail immediately — no point retrying.
 * Persistent errors (500, timeout, ECONNREFUSED) fail immediately.
 *
 * Phase 18: Resilience Layer (GW-05)
 */

import type { ErrorClass } from './types.js';

// ── Error classification ───────────────────────────────────────────────────────

const TRANSIENT_RE = /429|rate.?limit|too.?many|503|service.?unavailable/i;
const CONFIGURATION_RE = /401|403|unauthorized|forbidden/i;

/**
 * Classify an error into one of three categories:
 * - 'transient'     — temporary, safe to retry (429, 503, rate limits)
 * - 'configuration' — auth/permissions issue, retrying is pointless (401, 403)
 * - 'persistent'    — hard failure, do not retry (500, timeout, ECONNREFUSED)
 */
export function classifyError(err: Error): ErrorClass {
  const msg = err.message;
  if (TRANSIENT_RE.test(msg)) return 'transient';
  if (CONFIGURATION_RE.test(msg)) return 'configuration';
  return 'persistent';
}

/**
 * Returns true if the error is transient and safe to retry.
 */
export function isTransientError(err: Error): boolean {
  return classifyError(err) === 'transient';
}

// ── withRetry ─────────────────────────────────────────────────────────────────

/**
 * Retry `fn` up to `maxAttempts` times with exponential backoff.
 * Only retries transient errors. Configuration and persistent errors throw immediately.
 *
 * Backoff schedule (baseDelayMs = 1000 default):
 *   attempt 1 → fail → wait 1000ms
 *   attempt 2 → fail → wait 2000ms
 *   attempt 3 → fail → throw
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: Error = new Error('withRetry: no attempts made');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      lastError = e;

      // Non-transient errors fail immediately — no point retrying
      if (!isTransientError(e)) {
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
