---
phase: 40-gateway-capability-registry
plan: 01
subsystem: database
tags: [postgres, jsonb, bridge, gateway, capabilities, migration]

# Dependency graph
requires: []
provides:
  - GatewayCapabilityRecord interface with strengths, cost_tier, context_window, tool_support, agentic fields
  - GATEWAY_CAPABILITY_REGISTRY constant for all 6 gateway types
  - normalizeCapabilities(), getLegacyTags(), filterToolsBySupport() helpers
  - migrate-bridge-v7.ts converting flat capabilities arrays to structured JSONB
  - startup-detector writing structured capabilities from registry on every boot
  - routing-engine backward compat via getLegacyTags
affects: [40-02, routing-engine, dispatch-engine, task-dispatcher]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GATEWAY_CAPABILITY_REGISTRY: static typed record driving both DB migration and boot upserts"
    - "getLegacyTags(): zero-breakage shim — returns string[] from either old array or new structured object"
    - "normalizeCapabilities(): null if old format, typed record if structured — enables consumers to opt in"
    - "filterToolsBySupport<T>(): generic filter by tool_support level, ready for task dispatcher"

key-files:
  created:
    - backend/src/services/bridge/capability-registry.ts
    - backend/src/db/migrate-bridge-v7.ts
  modified:
    - backend/src/services/bridge/types.ts
    - backend/src/services/bridge/startup-detector.ts
    - backend/src/services/bridge/routing-engine.ts
    - backend/src/index.ts

key-decisions:
  - "GatewayRow.capabilities kept as string[] — getLegacyTags() bridges old and new without touching all callers"
  - "capabilityRecord on GatewayRow typed as Record<string,unknown> to avoid circular imports and strict index signature issues"
  - "Migration uses jsonb_typeof = 'array' guard for idempotency — rows already structured by startup-detector are untouched"
  - "filterToolsBySupport uses generic <T extends {function:{name:string}}> — works with any OpenAI-format tools array"

patterns-established:
  - "capability-registry.ts is single source of truth — migration SQL, startup upsert, and routing helpers all derive from it"

requirements-completed:
  - GWC-01

# Metrics
duration: 15min
completed: 2026-04-02
---

# Phase 40 Plan 01: Gateway Capability Registry Foundation Summary

**Structured GatewayCapabilityRecord type + static registry for 6 gateway types, JSONB migration converting flat string[] in gateways table, and startup-detector writing structured capabilities on every boot**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-02T09:30:00Z
- **Completed:** 2026-04-02T09:45:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created capability-registry.ts with GatewayCapabilityRecord interface, GATEWAY_CAPABILITY_REGISTRY for all 6 gateway types, and 3 helper functions
- Created migrate-bridge-v7.ts converting flat string[] capabilities to structured JSONB objects in the gateways table
- Updated startup-detector.ts to write structured capabilities from the registry constant on every gateway upsert
- Updated routing-engine.ts mapGatewayRow to use getLegacyTags() — all existing callers continue to receive string[] with no changes
- Deployed and verified: all 5 detected gateways show structured cost_tier and tool_support in PostgreSQL

## Task Commits

Each task was committed atomically:

1. **Task 1: Create capability-registry.ts with types, constant map, and helpers** - `7f4736a` (feat)
2. **Task 2: Create migration + wire startup-detector + backward compat in routing-engine** - `5fc4f4d` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `backend/src/services/bridge/capability-registry.ts` - GatewayCapabilityRecord, GATEWAY_CAPABILITY_REGISTRY, normalizeCapabilities, getLegacyTags, filterToolsBySupport
- `backend/src/db/migrate-bridge-v7.ts` - Idempotent JSONB migration for gateways.capabilities column
- `backend/src/services/bridge/types.ts` - Added optional capabilityRecord field to GatewayRow
- `backend/src/services/bridge/startup-detector.ts` - Uses GATEWAY_CAPABILITY_REGISTRY on upsert, mapRawToGatewayRow uses getLegacyTags
- `backend/src/services/bridge/routing-engine.ts` - mapGatewayRow uses getLegacyTags for backward compat
- `backend/src/index.ts` - Import and call migrateBridgeV7 after migrateBridgeV6

## Decisions Made
- Kept `GatewayRow.capabilities` as `string[]` — no breakage to any callers; getLegacyTags() bridges old and new transparently
- Typed `capabilityRecord` as `Record<string,unknown>` on GatewayRow to avoid circular imports and TypeScript index signature constraints
- Migration guard `jsonb_typeof(capabilities) = 'array'` ensures rows already written by startup-detector are not double-converted
- filterToolsBySupport uses generic `<T extends {function:{name:string}}>` pattern to stay decoupled from any specific tool array type

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript assignment incompatibility between GatewayCapabilityRecord and Record<string,unknown>**
- **Found during:** Task 2 (startup-detector and routing-engine updates)
- **Issue:** `GatewayCapabilityRecord` lacks an index signature so TypeScript rejected assignment to `capabilityRecord?: Record<string,unknown>`
- **Fix:** Added explicit cast `as Record<string, unknown> | undefined` at both assignment sites
- **Files modified:** backend/src/services/bridge/startup-detector.ts, backend/src/services/bridge/routing-engine.ts
- **Verification:** `npx tsc --noEmit` clean after cast
- **Committed in:** `5fc4f4d` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type incompatibility)
**Impact on plan:** Minimal — single-line cast at two call sites. No behavior change.

## Issues Encountered
None beyond the TypeScript cast deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 can now import GATEWAY_CAPABILITY_REGISTRY, normalizeCapabilities, and filterToolsBySupport for capability-aware dispatch routing
- All gateways in DB have structured JSONB capabilities — queryable with `capabilities->>'cost_tier'`, `capabilities->>'tool_support'`, etc.
- No blockers

## Self-Check: PASSED

- capability-registry.ts: FOUND
- migrate-bridge-v7.ts: FOUND
- 40-01-SUMMARY.md: FOUND
- commit 7f4736a: FOUND
- commit 5fc4f4d: FOUND
- DB bridge_v7 migration: CONFIRMED (1 row in schema_migrations)
- All 5 gateways have structured capabilities: CONFIRMED

---
*Phase: 40-gateway-capability-registry*
*Completed: 2026-04-02*
