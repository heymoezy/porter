---
phase: 25-rpg-engine
plan: "03"
subsystem: api
tags: [rpg, scheduler, bridge, dispatch, xp, background-jobs, postgres]

# Dependency graph
requires:
  - phase: 25-rpg-engine plan 01
    provides: awardXP and recalculateStats functions in rpg-engine.ts
  - phase: 25-rpg-engine plan 02
    provides: regenerateMdFiles and RPG admin endpoints

provides:
  - awardXP called fire-and-forget in logDispatch after every attributed dispatch
  - Background RPG recalculation sweep every 5 minutes via scheduler tick loop

affects: [25-rpg-engine, 26-forge, 28-battle-arena]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget async IIFE hook in logDispatch — awardXP piggybacks on dispatch log, zero latency impact"
    - "Tick-interval background job in scheduler — RPG_RECALC_INTERVAL = 150 ticks × 2s = 300s = 5 minutes"

key-files:
  created: []
  modified:
    - backend/src/services/bridge/routing-engine.ts
    - backend/src/services/scheduler.ts

key-decisions:
  - "logDispatch is only called on successful dispatches (errors throw before reaching it) — so 'dispatch' XP event is always correct, no error-branch needed"
  - "RPG recalculation is infrastructure-level (no agentScheduling flag gate) — runs even when agent scheduling is disabled"

patterns-established:
  - "awardXP hook pattern: guard on ctx.agentId, call inside async IIFE, .catch(() => {})"
  - "Scheduler background job: constant + runXxx() function + tick registration, same pattern as health probe"

requirements-completed: [RPG-01, RPG-02, RPG-03, RPG-04, RPG-05, RPG-06, RPG-07, MD-01, MD-02, MD-03, MD-04, MD-05]

# Metrics
duration: 8min
completed: 2026-03-29
---

# Phase 25 Plan 03: RPG Engine Wiring Summary

**awardXP hooked into every attributed dispatch fire-and-forget in routing-engine.ts, plus background 5-minute recalculation sweep in scheduler**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-29T00:00:00Z
- **Completed:** 2026-03-29T00:08:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- awardXP(ctx.agentId, 'dispatch') is now called fire-and-forget after every successful dispatch attributed to an agent
- Background RPG recalculation sweep runs every 5 minutes over all rpg_enabled agent templates
- Service restarted cleanly — health returns ok v3.4.1

## Task Commits

Each task was committed atomically:

1. **Task 1: Hook awardXP into routing-engine.ts logDispatch** - `b565733` (feat)
2. **Task 2: Add background RPG recalculation sweep to scheduler** - `c134234` (feat)

**Plan metadata:** (see final docs commit)

## Files Created/Modified

- `backend/src/services/bridge/routing-engine.ts` — Added import for awardXP + fire-and-forget call inside async IIFE in logDispatch
- `backend/src/services/scheduler.ts` — Added import for recalculateStats, RPG_RECALC_INTERVAL constant, runRpgRecalculation() function, tick hook

## Decisions Made

- `logDispatch` is only invoked on successful dispatches — the `result.error` field from the plan does not exist on `BridgeDispatchResult`. Since errors cause exceptions before logDispatch is ever reached, the 'failed' XP event branch is unnecessary. Always use 'dispatch'.
- RPG recalculation is placed in the infrastructure probe section of tick() (before the `agentScheduling` feature flag gate) — same level as health probes. This means it runs even when agent scheduling is off, which is correct: RPG stats are a background cache refresh, not an agent job.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] result.error field does not exist on BridgeDispatchResult**
- **Found during:** Task 1 (Hook awardXP into logDispatch)
- **Issue:** Plan specified `result.error ? 'failed' : 'dispatch'` but BridgeDispatchResult has no `error` property — TypeScript error TS2339
- **Fix:** Removed the conditional. logDispatch is only called on success paths (errors throw before reaching it), so 'dispatch' event is always correct. Added clarifying comment.
- **Files modified:** backend/src/services/bridge/routing-engine.ts
- **Verification:** npx tsc --noEmit exits 0
- **Committed in:** b565733 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in plan spec)
**Impact on plan:** Auto-fix required for TypeScript correctness. Functionally equivalent: the 'failed' event path would never have been triggered anyway since errors throw before logDispatch is reached.

## Issues Encountered

None beyond the auto-fixed deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 25 RPG Engine is complete: schema migrated (plan 01), rpg-engine.ts with full XP/level/stars/MD regeneration logic (plans 01+02), admin endpoints (plan 02), dispatch wiring + background sweep (plan 03)
- Phase 26 (Forge) can start — frontend nav merge has no stat dependency (per existing decision)
- GET /api/admin/agents/:id/rpg-stats will now update automatically after any attributed dispatch

---
*Phase: 25-rpg-engine*
*Completed: 2026-03-29*
