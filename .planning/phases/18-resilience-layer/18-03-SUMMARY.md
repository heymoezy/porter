---
phase: 18-resilience-layer
plan: 03
subsystem: api
tags: [fallback-chain, circuit-breaker, retry, routing-engine, ai-router, stream-service, resilience, typescript]

# Dependency graph
requires:
  - phase: 18-01
    provides: circuit-breaker-registry (getBreaker/clearBreakers) and retry (withRetry/classifyError)
  - phase: 20-live-dashboard
    provides: dispatch-queues singleton (getQueue), RoutingEngine base class

provides:
  - selectAllCandidates() on RoutingEngine — shared gateway query method (stale+active)
  - selectWithFallback(ctx, req) on RoutingEngine — N-gateway fallback chain (GW-06)
  - ai-router.ts dispatch() wired to selectWithFallback()
  - stream-service.ts selectStreamBackend() wired to selectAllCandidates()

affects:
  - All agent dispatches — now automatically fall through to next healthy gateway on failure
  - Streaming backend selection — now uses priority-ordered candidates from DB

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "selectAllCandidates() extracted from select() — shared query reused by fallback chain"
    - "Fallback chain: for...of candidates, breaker.opened skip, withRetry+breaker.fire+getQueue dispatch"
    - "RoutingDecision.reason distinguishes Primary vs Fallback paths with failure count"
    - "alternatives[] reasonSkipped records per-gateway error or 'lower priority'"

key-files:
  created:
    - backend/src/__tests__/fallback-chain.test.ts
  modified:
    - backend/src/services/bridge/routing-engine.ts
    - backend/src/services/ai-router.ts
    - backend/src/services/stream-service.ts

key-decisions:
  - "selectAllCandidates() includes stale gateways (status IN active,stale) — stale means degraded but functional, unavailable is excluded"
  - "ai-router.ts removes model field from BridgeDispatchRequest — each adapter resolves its model internally"
  - "stream-service.ts uses selectAllCandidates() not selectWithFallback() — streaming uses its own backend classes, not adapter dispatch"
  - "Fallback chain error strings use id.slice(0,8) for concise but identifiable gateway references"

requirements-completed: [GW-06]

# Metrics
duration: 6min
completed: 2026-03-25
---

# Phase 18 Plan 03: Resilience Layer — Fallback Chain Summary

**N-gateway fallback chain with circuit-breaker skip + retry wrapping wired into ai-router.ts and stream-service.ts — 10 tests green**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-25T10:15:29Z
- **Completed:** 2026-03-25T10:21:31Z
- **Tasks:** 2 (Task 1: TDD, Task 2: wiring)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `selectAllCandidates()` extracted from `select()` as reusable public method — queries `status IN ('active', 'stale')` ordered by priority
- `selectWithFallback(ctx, req)` added to RoutingEngine: iterates all candidates in priority order, skips open circuit breakers, wraps each dispatch in `withRetry(() => getQueue().add(() => breaker.fire(() => adapter.dispatch(req))))`, records per-gateway errors, throws descriptive "All N gateways failed: ..." when exhausted
- `RoutingDecision.reason` uses "Primary: type (priority=N)" vs "Fallback: N gateway(s) failed before type" to distinguish paths
- `ai-router.ts dispatch()` replaced `select() + dispatchWithQueue()` with `selectWithFallback()` — single call handles routing + circuit breaker + retry + queue
- `stream-service.ts selectStreamBackend()` replaced `routingEngine.select()` with `routingEngine.selectAllCandidates()` — picks first streamable candidate (ollama/openclaw) in priority order
- 10 unit tests covering: first-gateway success, fallback on persistent error, all-fail error message, id-prefixed error format, circuit open skip, error classification, retry on transient, no-retry on persistent, RoutingDecision shape

## Task Commits

Each task was committed atomically:

1. **TDD RED: fallback-chain.test.ts — 10 tests** - `8029319` (test)
2. **Task 1 GREEN: selectAllCandidates() + selectWithFallback()** - `d38059b` (feat)
3. **Task 2: wire into ai-router.ts and stream-service.ts** - `f2e1aaf` (feat)

## Files Created/Modified

- `backend/src/__tests__/fallback-chain.test.ts` — 10 tests for fallback chain logic, error classification, retry behavior, RoutingDecision shape
- `backend/src/services/bridge/routing-engine.ts` — Added `selectAllCandidates()` + `selectWithFallback()`, imports for `getBreaker` + `withRetry`, refactored `select()` to call `selectAllCandidates()`
- `backend/src/services/ai-router.ts` — `dispatch()` replaced `select()` + `dispatchWithQueue()` with `selectWithFallback()`, removed `model` from `BridgeDispatchRequest`
- `backend/src/services/stream-service.ts` — `selectStreamBackend()` replaced `routingEngine.select()` with `routingEngine.selectAllCandidates()` with priority-ordered streamable lookup

## Decisions Made

- `selectAllCandidates()` includes `stale` gateways because stale means degraded (health check failed) but not decommissioned — they're still worth trying in a fallback chain. Only `unavailable` status means definitively unreachable.
- `ai-router.ts` removes `model: decision.modelName` from `BridgeDispatchRequest` — each adapter knows its own model from its gateway row. The field was redundant.
- `stream-service.ts` uses `selectAllCandidates()` (not `selectWithFallback()`) because streaming needs to pick a backend class (OllamaStreamBackend / OpenClawStreamBackend), not dispatch a request through the adapter chain.
- Error strings format: `type(id.slice(0,8)): reason` — 8-char ID prefix is unique enough for diagnostics without being verbose.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

TypeScript type error in test file: `makeAdapter`'s `dispatch` parameter was typed as `() => Promise<...>` (0 args) but `GatewayAdapter.dispatch` accepts `BridgeDispatchRequest`. Fixed with `as unknown as` cast in the mock helper — test utility code only, not production.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 18-01 (circuit-breakers) + Plan 18-02 (health-probe) + Plan 18-03 (fallback-chain) together complete the Resilience Layer
- Phase 19 (models table, cost estimation) can proceed
- Phase 21 (bridge routes/API) can expose `/api/bridge/dispatch` which calls `dispatch()` — now resilient by default

## Self-Check: PASSED

All files created/modified verified on disk. All commits verified in git log.

---
*Phase: 18-resilience-layer*
*Completed: 2026-03-25*
