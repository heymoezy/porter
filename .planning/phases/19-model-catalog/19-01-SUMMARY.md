---
phase: 19-model-catalog
plan: 01
subsystem: database
tags: [postgres, drizzle, model-catalog, bridge, cost-calculation, version-tracking]

# Dependency graph
requires:
  - phase: 18-resilience-layer
    provides: bridge_dispatch_log table, circuit breaker infra
  - phase: 17-provider-adapters
    provides: GatewayAdapter interface with listModels(), createAdapter() factory
  - phase: 16-gateway-foundation
    provides: gateways table, schema_migrations pattern, GatewayRow type

provides:
  - models table with capabilities JSONB, pricing columns, context_window, is_active flag
  - model_versions table for append-only version history
  - bridge_dispatch_log.cached_tokens and bridge_dispatch_log.model_version_id columns
  - model-catalog.ts service with refreshModelsForGateway, refreshAllGateways, calculateCostUsd
  - ModelRow and ModelVersionRow TypeScript interfaces
  - BridgeDispatchResult.cachedTokens field for cache-hit attribution

affects: [19-02-wiring, 20-live-dashboard, bridge-dispatch-pipeline, cost-attribution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "bridge_vN idempotent migration pattern — BEGIN/check schema_migrations/CREATE/INSERT guard/COMMIT"
    - "lookupMetadata() exact match → prefix match → Ollama-style default — covers versioned model variants"
    - "Version detection by JSON.stringify sorted capability arrays — guards against ordering differences"
    - "calculateCostUsd() gateway-specific pricing with cross-gateway fallback — avoids cross-gateway ambiguity"
    - "Cached tokens billed at 10% of input price — standard prompt cache discount model"

key-files:
  created:
    - backend/src/db/migrate-bridge-v4.ts
    - backend/src/services/bridge/model-catalog.ts
    - backend/src/__tests__/model-catalog.test.ts
  modified:
    - backend/src/db/schema.ts
    - backend/src/services/bridge/types.ts
    - backend/src/index.ts

key-decisions:
  - "lookupMetadata uses prefix matching so claude-sonnet-4-7 (future) still gets claude-sonnet-4-6 metadata"
  - "refreshModelsForGateway accepts gatewayStatus param — only marks models inactive for 'active' gateways, not 'stale'"
  - "calculateCostUsd uses pool parameter (not singleton import) to be callable from startup-detector.ts context"
  - "ON CONFLICT DO UPDATE pattern used for upsert — handles race conditions safely"

patterns-established:
  - "Model version history: insert on first discovery (version_label=initial) and on capability/context change (ISO timestamp label)"
  - "Cost model: inputCost + outputCost + cachedCost where cachedCost = cached_tokens / 1M * (input_price * 0.1)"

requirements-completed: [MOD-01, MOD-02, MOD-04]

# Metrics
duration: 4min
completed: 2026-03-25
---

# Phase 19 Plan 01: Model Catalog Summary

**PostgreSQL models + model_versions tables with Drizzle schema, static metadata map for 8 known models, and model-catalog.ts service for auto-population, version tracking, and USD cost calculation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-25T10:49:00Z
- **Completed:** 2026-03-25T10:53:14Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- bridge_v4 migration creates models and model_versions tables with all required columns, indexes, and UNIQUE constraint; extends bridge_dispatch_log with cached_tokens and model_version_id
- model-catalog.ts service implements refreshModelsForGateway (listModels upsert + version tracking), refreshAllGateways (all enabled gateways), and calculateCostUsd (gateway-specific pricing with fallback)
- Static MODEL_METADATA covers claude-opus/sonnet/haiku, gpt-5.4, gemini-2.5-pro/flash, qwen2.5-coder with Ollama default for unknown local models
- TDD: test stubs file created with 3 concrete cost math tests (passing) and 27 todos for DB-dependent behavior

## Task Commits

Each task was committed atomically:

1. **RED: model-catalog test stubs** - `17268f6` (test)
2. **Task 1: bridge_v4 migration, schema, types** - `1b53e5d` (feat)
3. **Task 2: model-catalog.ts service** - `5863d73` (feat)

_Note: TDD tasks have test commit (RED) then feat commit (GREEN)_

## Files Created/Modified

- `backend/src/db/migrate-bridge-v4.ts` — bridge_v4 idempotent migration: models + model_versions tables, indexes, bridge_dispatch_log extensions
- `backend/src/services/bridge/model-catalog.ts` — model catalog service: refreshModelsForGateway, refreshAllGateways, calculateCostUsd, MODEL_METADATA static map
- `backend/src/__tests__/model-catalog.test.ts` — TDD test stubs: 3 concrete cost formula tests + 27 todos for MOD-01/02/04/05
- `backend/src/db/schema.ts` — appended models and modelVersions Drizzle table definitions
- `backend/src/services/bridge/types.ts` — added ModelRow, ModelVersionRow interfaces; cachedTokens field on BridgeDispatchResult
- `backend/src/index.ts` — wired migrateBridgeV4 import and boot call after migrateBridgeV3

## Decisions Made

- lookupMetadata() uses prefix matching in both directions (key.startsWith(name) || name.startsWith(key)) so future model version bumps (e.g., claude-sonnet-4-7) still get enriched metadata without needing constant map updates
- refreshModelsForGateway() accepts gatewayStatus as parameter — only marks models inactive for 'active' gateways; stale gateways may return incomplete model lists so inactive marking is skipped
- calculateCostUsd() takes pool as a parameter rather than importing the singleton — matches the pattern used by startup-detector.ts and avoids circular dependency risk
- ON CONFLICT DO UPDATE upsert handles first-run vs restart correctly without needing a prior SELECT for new models

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compiled cleanly on first attempt for both tasks.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 (19-02) can now wire refreshModelsForGateway into the dispatch pipeline and call refreshAllGateways on startup after detectAndUpsertGateways completes
- calculateCostUsd is ready to be called from routing-engine.ts after each dispatch to populate estimatedCostUsd in bridge_dispatch_log
- model_version_id FK on bridge_dispatch_log is ready to be populated in Plan 02

---
*Phase: 19-model-catalog*
*Completed: 2026-03-25*

## Self-Check: PASSED

All files present and commits verified:
- FOUND: backend/src/db/migrate-bridge-v4.ts
- FOUND: backend/src/services/bridge/model-catalog.ts
- FOUND: backend/src/__tests__/model-catalog.test.ts
- FOUND: .planning/phases/19-model-catalog/19-01-SUMMARY.md
- FOUND: commit 17268f6 (test stubs)
- FOUND: commit 1b53e5d (bridge_v4 migration + schema + types)
- FOUND: commit 5863d73 (model-catalog.ts service)
