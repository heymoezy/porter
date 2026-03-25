---
phase: 19-model-catalog
plan: 02
subsystem: bridge
tags: [postgres, model-catalog, routing-engine, cost-calculation, capability-routing, scheduler]

# Dependency graph
requires:
  - phase: 19-01
    provides: model-catalog.ts service with refreshModelsForGateway, refreshAllGateways, calculateCostUsd
  - phase: 18-resilience-layer
    provides: routing-engine.ts with logDispatch, selectAllCandidates, bridge_dispatch_log table
  - phase: 16-gateway-foundation
    provides: startup-detector.ts detectAndUpsertGateways, scheduler.ts tick loop

provides:
  - startup-detector.ts calls refreshAllGateways after detectAndUpsertGateways completes (fire-and-forget)
  - scheduler.ts MODEL_REFRESH_INTERVAL=43200 triggers daily refreshAllGateways via tick
  - bridge_dispatch_log.estimated_cost_usd populated from model pricing metadata (not null)
  - bridge_dispatch_log.cached_tokens written per dispatch
  - bridge_dispatch_log.model_version_id resolved from model_versions table per dispatch (MOD-04)
  - RoutingEngine.filterByCapabilities() capability-aware candidate filtering (MOD-03)
  - select() applies filterByCapabilities when RoutingContext.requiredCapabilities is set

affects: [20-live-dashboard, cost-attribution, capability-routing, dispatch-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget model refresh on startup — detectAndUpsertGateways completes then refreshAllGateways() runs non-blocking"
    - "Scheduler interval pattern — MODEL_REFRESH_INTERVAL follows HEALTH_PROBE_INTERVAL template (constant + tickCount % check)"
    - "logDispatch IIFE extended for pre-INSERT lookups — calculateCostUsd + model_version_id SELECT both run inside the fire-and-forget IIFE"
    - "Capability filter graceful degradation — filterByCapabilities returns full candidate list when no models match required capabilities"
    - "alternatives list uses original candidates (not filtered) — shows all available gateways for observability"

key-files:
  created: []
  modified:
    - backend/src/services/bridge/startup-detector.ts
    - backend/src/services/scheduler.ts
    - backend/src/services/bridge/routing-engine.ts

key-decisions:
  - "refreshAllGateways called once after all gateways detected (not per-gateway) — cleaner, avoids interleaving model refresh with detection loop"
  - "model_version_id SELECT uses ORDER BY detected_at DESC LIMIT 1 — most recent version wins, non-fatal if model not yet cataloged"
  - "filterByCapabilities degrades gracefully to full candidate list — requiredCapabilities is additive preference, never hard blocks dispatch"
  - "alternatives list uses original candidates (not filteredCandidates) — preserve full gateway picture in dispatch log for debugging"

patterns-established:
  - "Scheduler daily tick pattern: tickCount > 0 && tickCount % MODEL_REFRESH_INTERVAL === 0 — skips tick 0 (thundering herd guard)"
  - "Pre-INSERT IIFE pattern: resolve computed values (cost, version ID) inside fire-and-forget IIFE before INSERT — keeps caller non-blocking"

requirements-completed: [MOD-02, MOD-03, MOD-04, MOD-05]

# Metrics
duration: 4min
completed: 2026-03-25
---

# Phase 19 Plan 02: Model Catalog Wiring Summary

**refreshAllGateways wired into startup and daily scheduler tick; logDispatch writes real USD cost + cached_tokens + model_version_id; select() filters candidates by model capabilities via models table**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-25T10:55:54Z
- **Completed:** 2026-03-25T10:59:24Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- startup-detector.ts imports refreshAllGateways and calls it fire-and-forget after detectAndUpsertGateways() — models cataloged on every boot
- scheduler.ts adds MODEL_REFRESH_INTERVAL=43200 constant and daily tick so model catalog refreshes every 24 hours without restart
- routing-engine.ts logDispatch() now calculates and writes estimated_cost_usd using calculateCostUsd() instead of null placeholder; also writes cached_tokens and model_version_id (resolved from model_versions table) — satisfying MOD-04/05
- RoutingEngine.filterByCapabilities() added — queries models table for gateways with all required capabilities; select() invokes it when ctx.requiredCapabilities is set (MOD-03)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire model refresh into startup-detector and scheduler** - `9bcd36b` (feat)
2. **Task 2: Wire cost calculation, model_version_id, and capability filtering into routing engine** - `1764901` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `backend/src/services/bridge/startup-detector.ts` — added refreshAllGateways import and fire-and-forget call after detection complete
- `backend/src/services/scheduler.ts` — added refreshAllGateways import, MODEL_REFRESH_INTERVAL constant, daily refresh tick
- `backend/src/services/bridge/routing-engine.ts` — calculateCostUsd import; logDispatch extended with cost calc + model_version_id lookup + cached_tokens; filterByCapabilities() private method added; select() updated to apply capability filter

## Decisions Made

- refreshAllGateways called once after all gateways are detected (not per-gateway inside the loop) — cleaner and avoids interleaving model refresh with the detection sequence
- model_version_id SELECT uses ORDER BY detected_at DESC LIMIT 1 — most recent version wins; wrapped in inner try/catch so version lookup failure never blocks dispatch logging
- filterByCapabilities degrades gracefully — returns full candidate list when no models match required capabilities so dispatch never hard-fails due to capability filter
- alternatives list uses original unfiltered candidates — preserves the full gateway picture in dispatch logs for observability and debugging

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compiled cleanly on first attempt for both tasks.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 19 is now complete — model catalog is seeded on boot, refreshed daily, costs are logged per dispatch, and capability-based routing is live
- Phase 20 (live dashboard) can consume bridge_dispatch_log.estimated_cost_usd and model_version_id for cost analytics and version attribution charts
- filterByCapabilities enables agent dispatching to route "vision" or "tool_use" requests to capable gateways without manual configuration

---
*Phase: 19-model-catalog*
*Completed: 2026-03-25*
