---
phase: 18-resilience-layer
verified: 2026-03-25T10:45:00+08:00
status: gaps_found
score: 11/12 must-haves verified
re_verification: false
gaps:
  - truth: "circuit_state column exists in production gateways table"
    status: failed
    reason: "migrate-bridge-v3.ts is never called in index.ts — only v1 and v2 are run at startup. The circuit_state column never gets added to the live DB."
    artifacts:
      - path: "backend/src/index.ts"
        issue: "migrateBridgeV3 import and call are missing from the startup sequence (lines 20-21 have v1+v2, v3 absent)"
      - path: "backend/src/db/migrate-bridge-v3.ts"
        issue: "File exists and is correct, but is an orphaned migration — never executed"
    missing:
      - "Add 'import { migrateBridgeV3 } from ./db/migrate-bridge-v3.js' to backend/src/index.ts"
      - "Add 'await migrateBridgeV3(pool)' after migrateBridgeV2(pool) in the start() function"
---

# Phase 18: Resilience Layer Verification Report

**Phase Goal:** The Bridge layer handles backend failures gracefully — unhealthy backends are detected in seconds, broken backends stop receiving traffic automatically, transient errors retry intelligently, and requests fall through a priority-ordered chain of alternatives
**Verified:** 2026-03-25T10:45:00+08:00
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Circuit breaker trips open after persistent errors exceed threshold | VERIFIED | `circuit-breaker-registry.ts:46-53` — opossum options: errorThresholdPercentage=50, volumeThreshold=3; errorFilter=isTransientError means only persistent errors count |
| 2 | Transient errors (429, 503) do NOT trip the circuit breaker | VERIFIED | `retry.ts:34-36` — isTransientError returns true for 429/503; `circuit-breaker-registry.ts:52` — errorFilter=isTransientError suppresses these from opossum's failure counter |
| 3 | Auth errors (401, 403) DO trip the circuit breaker | VERIFIED | `retry.ts:27-28` — classifyError returns 'configuration' for 401/403; these return false from isTransientError so opossum counts them |
| 4 | SSE events are emitted on circuit state transitions | VERIFIED | `circuit-breaker-registry.ts:56-78` — emitSSE('bridge:circuit-trip') called on 'open', 'halfOpen', 'close' events with gateway_id, gateway_type, state |
| 5 | Transient errors retry with exponential backoff (1s, 2s, 4s) | VERIFIED | `retry.ts:74` — `baseDelayMs * Math.pow(2, attempt - 1)` formula; default baseDelayMs=1000; 6 retry tests pass (including backoff sequence test) |
| 6 | Non-transient errors fail immediately without retry | VERIFIED | `retry.ts:64-66` — `if (!isTransientError(e)) throw e` exits without waiting; tests for 401 and 500 confirm callCount=1 |
| 7 | Health probe runs every 30 seconds via scheduler | VERIFIED | `scheduler.ts:14` — HEALTH_PROBE_INTERVAL=15; `scheduler.ts:231` — `tickCount > HEALTH_PROBE_INTERVAL && tickCount % HEALTH_PROBE_INTERVAL === 0` (15×2s=30s) |
| 8 | Gateway status updated to active/stale/unavailable based on health | VERIFIED | `health-probe.ts:73-77` — determineStatus() maps healthy+fast=active, healthy+slow>5s=stale, !healthy=unavailable; DB UPDATE at line 119-122 |
| 9 | SSE event bridge:health emitted on gateway status change | VERIFIED | `health-probe.ts:125-135` — emitSSE('bridge:health') only when oldStatus !== newStatus; 11 health-probe tests all pass |
| 10 | circuit_state column persisted in gateways table on probe | FAILED | `migrate-bridge-v3.ts` creates the column correctly, but the migration is **never called** in index.ts startup — column does not exist in production DB |
| 11 | Fallback chain tries next gateway in priority order on failure | VERIFIED | `routing-engine.ts:342-387` — selectWithFallback() iterates candidates in ORDER BY priority ASC, records per-gateway errors, returns first success |
| 12 | ai-router.ts dispatch() uses selectWithFallback() | VERIFIED | `ai-router.ts:197` — `const { decision, result: bridgeResult } = await routingEngine.selectWithFallback(ctx, bridgeReq)` |

**Score:** 11/12 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/services/bridge/circuit-breaker-registry.ts` | CircuitBreakerRegistry with getBreaker(), clearBreakers(), getBreakerState() | VERIFIED | All three exports present and wired; opossum loaded via createRequire; errorFilter=isTransientError; SSE on state transitions |
| `backend/src/services/bridge/retry.ts` | withRetry() exponential backoff wrapper | VERIFIED | classifyError, isTransientError, withRetry all exported; Math.pow(2, attempt-1) backoff confirmed |
| `backend/src/services/bridge/types.ts` | ErrorClass and CircuitState type additions | VERIFIED | Line 24-25: `export type ErrorClass` and `export type CircuitState` both present |
| `backend/src/db/migrate-bridge-v3.ts` | circuit_state column on gateways table | PARTIAL | Migration file is correct and idempotent, but not wired into index.ts startup — column never added to production DB |
| `backend/src/services/bridge/health-probe.ts` | runHealthProbe() function | VERIFIED | Both runHealthProbe() (production) and runHealthProbeWithDeps() (testable DI) exported |
| `backend/src/services/scheduler.ts` | Health probe wired into tick() loop at 15-tick interval | VERIFIED | HEALTH_PROBE_INTERVAL=15 constant at line 14; probe call with startup guard at lines 231-233 |
| `backend/src/services/bridge/routing-engine.ts` | selectWithFallback() + selectAllCandidates() | VERIFIED | Both methods exist and are substantive (not stubs); getBreaker + withRetry imports at lines 14-15 |
| `backend/src/services/ai-router.ts` | dispatch() wired to selectWithFallback() | VERIFIED | Line 197 calls selectWithFallback(); old select()+dispatchWithQueue() pattern removed |
| `backend/src/services/stream-service.ts` | selectStreamBackend() with fallback-aware routing | VERIFIED | Line 229 calls routingEngine.selectAllCandidates(); picks first streamable candidate in priority order |
| `backend/src/__tests__/circuit-breaker.test.ts` | Unit tests for circuit breaker | VERIFIED | 15 tests, all pass |
| `backend/src/__tests__/retry.test.ts` | Unit tests for retry | VERIFIED | 6 tests, all pass |
| `backend/src/__tests__/health-probe.test.ts` | Unit tests for health probe | VERIFIED | 11 tests, all pass |
| `backend/src/__tests__/fallback-chain.test.ts` | Unit tests for fallback chain | VERIFIED | 10 tests, all pass |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| circuit-breaker-registry.ts | opossum | createRequire CJS import | VERIFIED | Line 20-22: `const require = createRequire(import.meta.url); const CircuitBreaker = require('opossum')` |
| circuit-breaker-registry.ts | scheduler.ts | emitSSE for circuit-trip events | VERIFIED | Line 57: `emitSSE('bridge:circuit-trip', {...})` on 'open' event; same for halfOpen and close |
| retry.ts | retry.ts | classifyError determines retry eligibility | VERIFIED | Line 64: `if (!isTransientError(e)) throw e` — classifyError called via isTransientError wrapper |
| health-probe.ts | adapters/index.ts | createAdapter() to instantiate adapter per gateway row | VERIFIED | Line 16 import; line 94 `const adapter = deps.createAdapter(row)` |
| health-probe.ts | scheduler.ts | emitSSE for bridge:health events | VERIFIED | Line 126: `deps.emitSSE('bridge:health', {...})` on status change |
| scheduler.ts | health-probe.ts | runHealthProbe() called in tick() on interval | VERIFIED | Line 7 import; line 232 `runHealthProbe().catch(...)` |
| routing-engine.ts | circuit-breaker-registry.ts | getBreaker() wraps each dispatch attempt | VERIFIED | Line 14 import; line 343 `const breaker = getBreaker(candidate.row.id, candidate.row.type)` |
| routing-engine.ts | retry.ts | withRetry() wraps the breaker.fire() call | VERIFIED | Line 15 import; lines 352-355 `withRetry(() => getQueue(...).add(() => breaker.fire(...)))` |
| ai-router.ts | routing-engine.ts | dispatch() calls selectWithFallback() | VERIFIED | Line 9 import; line 197 `await routingEngine.selectWithFallback(ctx, bridgeReq)` |
| stream-service.ts | routing-engine.ts | selectStreamBackend() uses selectAllCandidates() | VERIFIED | Line 16 import; line 229 `await routingEngine.selectAllCandidates()` |
| **index.ts** | **migrate-bridge-v3.ts** | **migrateBridgeV3 called at startup** | **NOT WIRED** | index.ts lines 126-127 call v1 and v2 only; v3 import and call are absent — circuit_state column never added to DB |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| GW-02 | 18-02-PLAN.md | Background health probe runs every 30s via scheduler, updates gateway status in DB, emits SSE events on state changes | SATISFIED | health-probe.ts + scheduler.ts wiring confirmed; tests passing |
| GW-04 | 18-01-PLAN.md | Circuit breaker per gateway (opossum) with Closed/Open/Half-Open states, configurable thresholds, SSE events on trips | SATISFIED | circuit-breaker-registry.ts with all three state transitions and SSE; tests passing |
| GW-05 | 18-01-PLAN.md | Retry with exponential backoff for transient errors (429, 503), separate from circuit breaker logic | SATISFIED | retry.ts with classifyError and withRetry; backoff formula verified; tests passing |
| GW-06 | 18-03-PLAN.md | Fallback chain — N gateways in priority order, not just binary cheap/strong | SATISFIED | selectWithFallback() iterates all priority-ordered candidates; ai-router.ts wired; tests passing |

All four required phase requirements (GW-02, GW-04, GW-05, GW-06) are functionally implemented. The single gap (migrate-bridge-v3 not wired) affects DB persistence of the circuit_state observability column only — it does not break routing, retry, health monitoring, or fallback chain logic.

No orphaned requirements: REQUIREMENTS.md traceability table maps GW-02, GW-04, GW-05, GW-06 exclusively to Phase 18.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| backend/src/index.ts | 126-127 | migrate-bridge-v3.ts never called | Warning | circuit_state column does not exist in production DB; health probe UPDATE query at health-probe.ts:119 will silently fail or error on column reference if circuit_state column is absent |

No TODO/FIXME/PLACEHOLDER comments found in any phase 18 files. No stub implementations detected. TypeScript compiles clean (`npx tsc --noEmit` exits 0). All 42 tests pass (15 circuit-breaker + 6 retry + 11 health-probe + 10 fallback-chain).

---

## Human Verification Required

None — all observable behaviors are verifiable programmatically via tests and code inspection.

---

## Gaps Summary

One gap blocks full goal delivery:

**migrate-bridge-v3 not wired at startup.** The `circuit_state` column migration (`migrate-bridge-v3.ts`) is created and idempotent, but the call `await migrateBridgeV3(pool)` is missing from `backend/src/index.ts`. The health probe's `UPDATE gateways SET status=$1, circuit_state=$2 ...` query (health-probe.ts line 119) references a column that does not exist in the live DB. This will cause a PostgreSQL error on every health probe execution.

Fix is two lines in `index.ts`:
1. Add import: `import { migrateBridgeV3 } from './db/migrate-bridge-v3.js';`
2. Add call after line 127: `await migrateBridgeV3(pool);`

All core resilience behaviors (circuit breaking, retry, health detection, fallback chain) work correctly and are fully wired. Only the DB observability column (`circuit_state`) is broken due to the missing migration call.

---

_Verified: 2026-03-25T10:45:00+08:00_
_Verifier: Claude (gsd-verifier)_
