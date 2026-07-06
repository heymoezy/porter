/**
 * Bridge Failover — config-driven gateway fallback chain
 *
 * Mandate: "one bridge, many backends". When the target gateway fails
 * (process failure, non-zero exit, timeout, or a quota signature in the
 * error surface), the SAME task is retried on the next gateway in the
 * chain so Bridge consumers (Tom's workers, digests, ops-chat, vault-chat,
 * evolution loop) survive Claude quota exhaustion instead of hard-failing.
 *
 * Chain order (config-driven, never hardcoded):
 *   1. PORTER_BRIDGE_FALLBACK_CHAIN env var — comma-separated gateway types,
 *      strict allowlist when set (types not listed are excluded).
 *   2. Otherwise: the `gateways` table, priority ASC (the DB is the config).
 *      As registered: claude_cli(10) → codex_cli(20) → antigravity_cli(30).
 * A forced gateway (ctx.forceGatewayType / targetGateway) leads the chain;
 * the rest follow in configured order.
 *
 * Time budget: one budget (default 300s) is shared ACROSS the chain — each
 * attempt gets the remaining budget as its adapter timeout, so failover
 * never triples the caller's wait.
 */

import type { GatewayType } from './types.js';

// ── Budget constants ──────────────────────────────────────────────────────────

/** Total wall-clock budget shared across all attempts in one chain run. */
export const DEFAULT_CHAIN_BUDGET_MS = 300_000;
/** Below this remaining budget, another attempt is pointless — stop the chain. */
export const MIN_ATTEMPT_MS = 10_000;

// ── Quota signature detection ─────────────────────────────────────────────────

/**
 * Quota / usage-limit signatures, verified against the installed
 * claude 2.1.201 binary strings (grep of the CLI bundle, 2026-07-06):
 *   "usage limit reached", "You've reached your usage limit",
 *   "hit your fast limit", "monthly spend limit", "out of extra usage",
 *   "usage credits", "rate limit exceeded", "Request rejected (429)".
 * codex/agy surface OpenAI/Google equivalents ("quota", "429",
 * "too many requests", "resource exhausted").
 *
 * SAFETY: this regex is matched ONLY against error surfaces — adapter
 * error messages built from stderr / non-zero-exit output / CLI result
 * events flagged is_error — never against ordinary response content.
 */
export const QUOTA_SIGNATURE_RE =
  /usage.?limit|usage credits?|out of extra usage|monthly spend limit|(?:fast|weekly|5-hour) limit|rate.?limit(?:ed)?(?:\s+(?:already\s+)?exceeded)?|too many requests|quota|resource.?exhausted|insufficient.?(?:credit|quota)|\b429\b|overloaded/i;

/** True when an error message carries a quota/usage-limit signature. */
export function isQuotaSignature(message: string): boolean {
  return QUOTA_SIGNATURE_RE.test(message);
}

// ── Failure classification ────────────────────────────────────────────────────

export type FailoverOutcome =
  | 'ok'              // gateway answered
  | 'quota'           // quota/usage-limit signature in the error surface
  | 'timeout'         // adapter/subprocess timed out
  | 'error'           // process failure, non-zero exit, spawn error, etc.
  | 'circuit_open'    // circuit breaker open — skipped without dispatching
  | 'unavailable'     // gateway not active/enabled in the registry
  | 'budget_exhausted'// chain time budget spent before this gateway ran
  | 'simulated';      // forced failure via the loopback-gated test hook

/** Classify a dispatch failure for the failover record. */
export function classifyFailure(message: string): FailoverOutcome {
  if (isQuotaSignature(message)) return 'quota';
  if (/timed out|timeout/i.test(message)) return 'timeout';
  return 'error';
}

// ── Failover record types (written to bridge_dispatch_log.failover) ──────────

export interface FailoverAttempt {
  gatewayType: string;
  modelName: string;
  outcome: FailoverOutcome;
  /** Failure reason (error message, truncated) — absent for 'ok'. */
  reason?: string;
  latencyMs: number;
}

export interface FailoverRecord {
  /** Gateway types in the order the chain would try them. */
  chain: string[];
  /** Every attempt made (or skipped), in order. */
  attempts: FailoverAttempt[];
  /** Gateway type that produced the answer, or null if all failed. */
  answeredBy: string | null;
  /** false when the caller sent fallback:false (single-gateway hard-fail). */
  fallbackEnabled: boolean;
  budgetMs: number;
}

// ── Chain ordering ────────────────────────────────────────────────────────────

/**
 * Order candidate gateway types into the failover chain.
 *
 * @param candidateTypes gateway types that are active+enabled, priority ASC
 * @param lead           forced gateway type (leads the chain when present)
 */
export function orderChain(candidateTypes: string[], lead?: string): string[] {
  const envRaw = process.env.PORTER_BRIDGE_FALLBACK_CHAIN ?? '';
  const envChain = envRaw.split(',').map((s) => s.trim()).filter(Boolean);

  // Env override is a strict allowlist+ordering; otherwise DB priority order.
  const base = envChain.length > 0
    ? envChain.filter((t) => candidateTypes.includes(t))
    : [...candidateTypes];

  if (!lead) return base;
  return [lead, ...base.filter((t) => t !== lead)];
}

/** Valid gateway types accepted by the simulateFailure test hook. */
export function sanitizeSimulateFailure(input: unknown): GatewayType[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (t): t is GatewayType =>
      t === 'claude_cli' || t === 'codex_cli' || t === 'antigravity_cli',
  );
}

// ── Budget race ────────────────────────────────────────────────────────────────

/** Marker thrown when an attempt exceeds its slice of the chain budget. */
export const BUDGET_TIMEOUT_MARKER = '[failover:budget-timeout]';

/**
 * Race a dispatch attempt against its remaining slice of the shared budget so
 * a hung gateway can't consume the whole chain's wall-clock. The attempt's own
 * subprocess is reaped by the adapter's internal timeout; we just stop WAITING
 * on it and move to the next gateway.
 */
export function raceBudget<T>(p: Promise<T>, remainingMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${BUDGET_TIMEOUT_MARKER} attempt exceeded ${remainingMs}ms slice`)),
      Math.max(1_000, remainingMs),
    );
    // .unref so the timer never keeps the process alive on its own.
    if (typeof (timer as { unref?: () => void }).unref === 'function') {
      (timer as { unref?: () => void }).unref!();
    }
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
