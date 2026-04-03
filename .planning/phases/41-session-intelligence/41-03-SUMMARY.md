---
phase: 41-session-intelligence
plan: 03
subsystem: api
tags: [routing, confidence, outcome-scoring, bridge, postgresql, fastify]

# Dependency graph
requires:
  - phase: 41-session-intelligence/41-01
    provides: outcome_score + outcome_note columns on bridge_dispatch_log (sin_v1 migration)

provides:
  - POST /api/v1/dispatches/:id/outcome — score a dispatch result 1-5
  - routing-confidence.ts — GatewayConfidence aggregation service with 5-min TTL cache
  - GET /api/admin/bridge/confidence — admin visibility into per-gateway confidence scores
  - selectByHeuristic now factors in historical outcome confidence as a gentle routing nudge

affects:
  - 41-session-intelligence
  - bridge routing engine
  - admin bridge panel

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sync cache reader (getGatewayConfidenceSync) for use inside synchronous routing methods"
    - "Fire-and-forget confidence refresh after outcome submission"
    - "Composite score = base priority score + confidence nudge + complexity preference"

key-files:
  created:
    - backend/src/services/bridge/routing-confidence.ts
    - backend/src/routes/v1/dispatch-outcome.ts
  modified:
    - backend/src/services/bridge/routing-engine.ts
    - backend/src/routes/admin/bridge.ts
    - backend/src/routes/v1/index.ts
    - backend/src/index.ts

key-decisions:
  - "Synchronous cache reader (getGatewayConfidenceSync) avoids making selectByHeuristic async — cache is pre-warmed on startup and refreshed asynchronously after each outcome submission"
  - "Confidence nudge formula: (avgScore - 3.0) * confidence * 0.2 — gentle enough that priority still dominates routing"
  - "dispatchOutcomeRoutes registered in v1/index.ts (not index.ts) to match project pattern for all v1 routes"
  - "Confidence cache warmed after fastify.listen() to ensure DB migrations have completed first"

patterns-established:
  - "Pattern 1: Sync cache reader pattern — expose a sync getter from an async-refreshed cache for use in hot synchronous code paths"
  - "Pattern 2: Fire-and-forget refresh on write — outcome submission triggers cache refresh without blocking response"

requirements-completed: [SIN-03]

# Metrics
duration: 20min
completed: 2026-04-03
---

# Phase 41 Plan 03: Session Intelligence — Routing Confidence Summary

**Dispatch outcome scoring (1-5) feeds into a per-gateway confidence cache that gently nudges selectByHeuristic toward historically better-performing gateways**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-03T09:39:00Z
- **Completed:** 2026-04-03T09:59:21Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created `routing-confidence.ts` — aggregates `AVG(outcome_score)` per gateway with trend analysis (improving/declining/stable/unknown), 5-min TTL cache, sync+async getters
- Created `POST /api/v1/dispatches/:id/outcome` — validates score 1-5, persists to DB, triggers async confidence refresh
- Modified `selectByHeuristic` — composite scoring: priority + confidence nudge + complexity preference. Gateways with repeated poor scores are progressively deprioritised
- Added `GET /api/admin/bridge/confidence` admin endpoint — returns full confidence snapshot per gateway
- End-to-end verified: scored a gemini_cli dispatch with score 4, confidence endpoint immediately reflected `avgScore:4, confidence:0.02`

## Task Commits

Each task was committed atomically:

1. **Task 1: Confidence service + outcome scoring endpoint** - `a477024` (feat)
2. **Task 2: Wire confidence into routing engine + admin visibility** - `51edc52` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `backend/src/services/bridge/routing-confidence.ts` - GatewayConfidence interface, in-memory cache with TTL, refresh(), getGatewayConfidenceSync(), initConfidenceCache()
- `backend/src/routes/v1/dispatch-outcome.ts` - POST /api/v1/dispatches/:id/outcome with score validation and async confidence refresh
- `backend/src/services/bridge/routing-engine.ts` - selectByHeuristic rewritten with composite scoring incorporating confidence nudge
- `backend/src/routes/admin/bridge.ts` - Added GET /bridge/confidence endpoint
- `backend/src/routes/v1/index.ts` - Registered dispatchOutcomeRoutes
- `backend/src/index.ts` - Import and call initConfidenceCache() after migrations

## Decisions Made

- Used a synchronous cache reader (`getGatewayConfidenceSync`) to avoid making `selectByHeuristic` async — the method is called in several places and keeping it sync preserves the existing call sites
- Confidence reaches 1.0 after 50 scored dispatches (`Math.min(1.0, totalRated / 50)`) — ensures enough data before strong routing influence
- Confidence nudge scaled to max +/-0.4 to keep it as a gentle influence relative to priority differences (which span ~1-10)
- `dispatchOutcomeRoutes` registered in `v1/index.ts` to follow the project pattern (not directly in `index.ts`)

## Deviations from Plan

None - plan executed exactly as written, with one minor refinement: dispatchOutcomeRoutes was registered in `v1/index.ts` rather than `index.ts` to match the established pattern for all v1 routes (plan was ambiguous on this point, both approaches are equivalent).

## Issues Encountered

- `outcome_score` and `outcome_note` columns did not exist in the DB until the service restarted and ran the `sin_v1` migration — code was written first, then service restart applied the migration. No blocking issue.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Routing confidence is now live and data-driven
- After 10+ scored dispatches to a gateway, its confidence score meaningfully diverges from default
- Admin can monitor per-gateway confidence via GET /api/admin/bridge/confidence
- No blockers for remaining Phase 41 plans
