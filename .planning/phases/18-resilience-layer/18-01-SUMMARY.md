---
phase: 18-resilience-layer
plan: 01
subsystem: api
tags: [opossum, circuit-breaker, retry, exponential-backoff, resilience, typescript]

# Dependency graph
requires:
  - phase: 20-live-dashboard
    provides: dispatch-queues singleton pattern (followed for circuit breaker registry)
  - phase: 16-gateway-foundation
    provides: gateways table (circuit_state column added via migrate-bridge-v3)
  - phase: 17-provider-adapters
    provides: GatewayType and error taxonomy context

provides:
  - circuit-breaker-registry.ts with per-gateway opossum circuit breakers (getBreaker/getBreakerState/clearBreakers)
  - retry.ts with classifyError/isTransientError/withRetry exponential backoff
  - migrate-bridge-v3.ts adding circuit_state column to gateways table
  - ErrorClass and CircuitState type aliases in types.ts

affects:
  - 18-02 (health-probe — uses isTransientError for health check error handling)
  - 18-03 (fallback-chain — wraps dispatch calls with withRetry + circuit breakers)

# Tech tracking
tech-stack:
  added:
    - opossum@9 (CJS, per-gateway circuit breaker)
    - "@types/opossum@8 (typings for opossum v9)"
  patterns:
    - createRequire pattern for CJS modules in ESM project
    - Module-level singleton Map keyed by gatewayId (one breaker per gateway, not per type)
    - errorFilter on opossum suppresses transient errors from tripping circuit
    - SSE bridge:circuit-trip event on open/halfOpen/close transitions

key-files:
  created:
    - backend/src/db/migrate-bridge-v3.ts
    - backend/src/services/bridge/circuit-breaker-registry.ts
    - backend/src/services/bridge/retry.ts
    - backend/src/__tests__/circuit-breaker.test.ts
    - backend/src/__tests__/retry.test.ts
  modified:
    - backend/src/services/bridge/types.ts (added ErrorClass, CircuitState)
    - backend/package.json (added opossum, @types/opossum)

key-decisions:
  - "opossum loaded via createRequire (CJS import) — project is type=module ESM, opossum has no ESM export"
  - "Circuit breakers keyed by gatewayId not gatewayType — multiple gateways of same type get independent breakers"
  - "errorFilter=isTransientError suppresses 429/503 from tripping circuit — only persistent errors count"
  - "circuit_state column is admin observability only — routing engine reads from in-memory breaker state, not DB"

patterns-established:
  - "createRequire pattern: import { createRequire } from 'node:module'; const require = createRequire(import.meta.url)"
  - "Error classification regex: transient=/429|503/, configuration=/401|403/, persistent=everything else"
  - "withRetry only retries transient errors; non-transient throw immediately without delay"

requirements-completed: [GW-04, GW-05]

# Metrics
duration: 3min
completed: 2026-03-25
---

# Phase 18 Plan 01: Resilience Layer — Circuit Breaker and Retry Primitives Summary

**Per-gateway opossum circuit breakers with transient-error suppression, plus classifyError/withRetry exponential backoff — 21 tests green**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T10:10:00Z
- **Completed:** 2026-03-25T10:13:00Z
- **Tasks:** 1 (TDD: RED -> GREEN -> clean compile)
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments
- opossum v9 installed via npm with @types/opossum for TypeScript support
- migrate-bridge-v3.ts adds idempotent circuit_state column to gateways table
- circuit-breaker-registry.ts: lazy singleton map keyed by gatewayId, opossum options with errorFilter=isTransientError, SSE emission on open/halfOpen/close transitions
- retry.ts: three-class error taxonomy (transient/configuration/persistent), withRetry with exponential backoff that short-circuits on non-transient errors
- 21 unit tests covering all behavior (15 circuit breaker, 6 retry)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install opossum, add migration, extend types, create circuit-breaker-registry.ts and retry.ts with tests** - `edc4887` (feat)

**Plan metadata:** (pending final commit)

_Note: TDD task — RED (tests written and failing) -> GREEN (implementation passes all tests) -> no refactor needed_

## Files Created/Modified
- `backend/src/db/migrate-bridge-v3.ts` - Idempotent migration adding circuit_state TEXT DEFAULT 'closed' to gateways
- `backend/src/services/bridge/circuit-breaker-registry.ts` - Per-gateway opossum circuit breakers, SSE on state transitions
- `backend/src/services/bridge/retry.ts` - classifyError/isTransientError/withRetry with exponential backoff
- `backend/src/__tests__/circuit-breaker.test.ts` - 15 tests: classifyError, isTransientError, getBreaker singleton, getBreakerState, clearBreakers
- `backend/src/__tests__/retry.test.ts` - 6 tests: success, transient retry, no-retry on 401/500, exhaustion, backoff sequence
- `backend/src/services/bridge/types.ts` - Added ErrorClass and CircuitState type aliases
- `backend/package.json` - Added opossum@9 and @types/opossum@8

## Decisions Made
- opossum is CJS — used `createRequire(import.meta.url)` to load in the ESM project. `@ts-expect-error` suppresses the default import type error.
- Breakers keyed by gatewayId (not gatewayType) — gives independent circuit per gateway instance, matching intent of GW-04.
- errorFilter=isTransientError means rate limits (429) and service-unavailable (503) never count as failures toward the error threshold. Only 500s, timeouts, ECONNREFUSED etc. open the circuit.
- circuit_state column is observability-only — plan explicitly states routing engine uses in-memory breaker state. DB column is for admin dashboards.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — TypeScript compiled clean on first attempt. opossum API (opened/halfOpen boolean properties) matched @types/opossum typings correctly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 02 (health-probe) can now import isTransientError from retry.ts for classifying probe failures
- Plan 03 (fallback-chain) can wrap dispatch calls with withRetry and guard with getBreaker
- migrate-bridge-v3.ts needs to be wired into the startup migration runner before DB circuit_state persistence works

---
*Phase: 18-resilience-layer*
*Completed: 2026-03-25*
