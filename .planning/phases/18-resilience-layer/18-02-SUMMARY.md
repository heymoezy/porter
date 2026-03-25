---
phase: 18-resilience-layer
plan: 02
subsystem: api
tags: [health-probe, background-monitoring, scheduler, sse, circuit-breaker, typescript]

# Dependency graph
requires:
  - phase: 18-01
    provides: circuit-breaker-registry.ts (getBreakerState), retry.ts (isTransientError)
  - phase: 17-provider-adapters
    provides: createAdapter() factory, GatewayAdapter.health() interface
  - phase: 16-gateway-foundation
    provides: gateways table with status/circuit_state columns

provides:
  - health-probe.ts with runHealthProbe() (production) and runHealthProbeWithDeps(deps) (testable DI variant)
  - Scheduler wired with HEALTH_PROBE_INTERVAL=15 (30s cadence) + startup guard

affects:
  - 18-03 (fallback-chain — can observe real gateway status from DB, informed by health probe results)
  - Admin bridge dashboard (gateway status kept current every 30s)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Dependency injection pattern for testable async functions (runHealthProbeWithDeps)
    - AbortController 10s timeout wrapping adapter.health() calls
    - Per-gateway try/catch for error isolation in probe loop
    - tickCount > INTERVAL guard for startup thundering herd prevention

key-files:
  created:
    - backend/src/services/bridge/health-probe.ts
    - backend/src/__tests__/health-probe.test.ts
  modified:
    - backend/src/services/scheduler.ts (added import, HEALTH_PROBE_INTERVAL constant, probe call in tick())

key-decisions:
  - "Dependency injection (runHealthProbeWithDeps) chosen over mock.module — mock.module not available in Node v22.22.0's node:test"
  - "Startup guard: tickCount > HEALTH_PROBE_INTERVAL (not >=) skips the first 15-tick window entirely"
  - "circuit_state defaults to 'closed' when getBreakerState returns null (no breaker created yet)"
  - "AbortController timeout set to 10s — generous enough for slow CLI adapters, tight enough to prevent hangs"

patterns-established:
  - "DI pattern: export runHealthProbeWithDeps(deps: HealthProbeDeps) for unit tests, runHealthProbe() wraps with production deps"
  - "Health status thresholds: healthy+latency>5000ms=stale, healthy+fast=active, !healthy=unavailable"

requirements-completed: [GW-02]

# Metrics
duration: 4min
completed: 2026-03-25
---

# Phase 18 Plan 02: Resilience Layer — Health Probe Background Monitor Summary

**Background health probe running every 30s via scheduler tick-counter — 11 tests green, status+circuit_state persisted to DB, bridge:health SSE on transitions**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-25T10:15:42Z
- **Completed:** 2026-03-25T10:19:37Z
- **Tasks:** 1 (TDD: RED -> GREEN, no refactor needed)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- health-probe.ts created with dual export: `runHealthProbeWithDeps(deps)` for tests, `runHealthProbe()` for production
- Queries all enabled gateways (enabled=1) and calls adapter.health() per gateway
- 10s AbortController timeout prevents hung adapters from blocking the probe loop
- Status determination: `active` (healthy+latency<=5000ms), `stale` (healthy+latency>5000ms), `unavailable` (!healthy)
- DB update: `status`, `circuit_state` (from getBreakerState), `last_health_at` written per probe
- SSE emission: `bridge:health` event only when old_status != new_status (reduces noise)
- Per-gateway try/catch ensures one adapter failure does not stop other gateways from being probed
- Scheduler wired: `HEALTH_PROBE_INTERVAL = 15` constant, `tickCount > HEALTH_PROBE_INTERVAL && tickCount % HEALTH_PROBE_INTERVAL === 0` guard
- 11 unit tests covering all behavior

## Task Commits

Each task was committed atomically:

1. **TDD RED: failing tests for health probe** - `90a1578` (test)
2. **TDD GREEN: health-probe.ts + scheduler wiring** - `9ea6078` (feat)

## Files Created/Modified

- `backend/src/services/bridge/health-probe.ts` - Health probe implementation with DI pattern
- `backend/src/__tests__/health-probe.test.ts` - 11 unit tests covering all behavior
- `backend/src/services/scheduler.ts` - Added import, HEALTH_PROBE_INTERVAL constant, probe call in tick()

## Decisions Made

- `mock.module` is not available in Node v22.22.0's `node:test` — used dependency injection instead. This is actually the cleaner design: `runHealthProbeWithDeps(deps)` is exported alongside `runHealthProbe()` which uses real deps. Tests call the DI variant directly.
- Startup guard uses `tickCount > HEALTH_PROBE_INTERVAL` (strictly greater than) so the first 30s window is fully skipped, giving adapters time to stabilize after boot.
- `circuit_state` defaults to `'closed'` when `getBreakerState` returns null — this is correct because if no breaker has been created yet, the circuit is effectively closed.
- AbortController timeout at 10s — generous for CLI adapters (which can be 30-120s for actual requests) but health() calls are just lightweight pings.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] mock.module unavailable in Node v22.22.0**
- **Found during:** TDD RED phase
- **Issue:** `mock.module` from `node:test` returned `undefined` — Node v22.22.0 does not support it
- **Fix:** Used dependency injection pattern (`runHealthProbeWithDeps(deps: HealthProbeDeps)`) instead of module-level mocking. Tests pass deps directly as objects. This is a cleaner architectural choice.
- **Files modified:** `health-probe.test.ts` (test design), `health-probe.ts` (export shape)
- **Commit:** `9ea6078`

## Issues Encountered

None beyond the mock.module deviation above (handled automatically per Rule 1).

## User Setup Required

None — health probe runs automatically via scheduler. No external service configuration required.

## Next Phase Readiness

- Plan 03 (fallback-chain) can now rely on DB gateway status being updated every 30s
- The `bridge:health` SSE event is ready to be consumed by admin dashboard SSE listeners
- `runHealthProbe` is accessible for any future forced-probe endpoint (e.g., POST /api/admin/bridge/probe)

---
*Phase: 18-resilience-layer*
*Completed: 2026-03-25*
