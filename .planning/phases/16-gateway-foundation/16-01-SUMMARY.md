---
phase: 16-gateway-foundation
plan: 01
subsystem: database
tags: [postgresql, drizzle-orm, typescript, bridge, gateway, migration]

# Dependency graph
requires: []
provides:
  - gateways PostgreSQL table with full DDL (idempotent migration)
  - gateway_credentials PostgreSQL table with FK cascade to gateways
  - Drizzle ORM exports: gateways, gatewayCredentials
  - GatewayAdapter TypeScript interface with 5 typed methods
  - Type aliases: GatewayType, GatewayStatus, GatewaySource, GatewayAuthMethod
  - Result types: BridgeDispatchRequest, BridgeDispatchResult, DetectResult, HealthResult
  - Row types: GatewayRow, GatewayCredentialRow
affects: [17-ollama-adapter, 18-openclaw-adapter, 19-cli-adapters, 20-gateway-service, 21-bridge-router, 22-health-monitor, 23-gateway-api]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent migration: schema_migrations guard with named key (bridge_v1)"
    - "Nullable url column for CLI gateways (codex_cli, claude_cli, gemini_cli have no URL)"
    - "Partial unique index on (type, source) restricted to auto_detected/env_bootstrap only"
    - "masked_display pre-computed at insert time — reads never need to decrypt"
    - "GatewayAdapter interface as protocol contract for all concrete adapter implementations"

key-files:
  created:
    - backend/src/services/bridge/types.ts
    - backend/src/db/migrate-bridge-v1.ts
  modified:
    - backend/src/db/schema.ts

key-decisions:
  - "url is nullable — CLI gateways use metadata JSONB for binary_path, not a URL"
  - "masked_display stored at insert time so API reads never decrypt credentials"
  - "Partial unique index allows multiple manual gateways of same type, but only one auto/env per type"
  - "GatewayAdapter interface defined independently of ai-router.ts/stream-service.ts — delegation not modification"

patterns-established:
  - "Bridge types pattern: all type aliases match DB column values exactly (no mapping needed)"
  - "Bridge migration pattern: migrate-bridge-v1.ts follows same shape as migrate-15.ts"

requirements-completed: [GW-01, CLI-01]

# Metrics
duration: 2min
completed: 2026-03-25
---

# Phase 16 Plan 01: Gateway Foundation Summary

**PostgreSQL gateways + gateway_credentials tables via idempotent migration, Drizzle ORM exports, and GatewayAdapter TypeScript interface establishing the data substrate for all Bridge phases 16-23**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-25T05:51:46Z
- **Completed:** 2026-03-25T05:54:12Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `backend/src/services/bridge/` directory with `types.ts` defining the GatewayAdapter interface (5 methods), 4 type aliases, 2 result interfaces, 2 request/result interfaces, and 2 DB row types
- Created `backend/src/db/migrate-bridge-v1.ts` with idempotent migration guarded by `bridge_v1` key in schema_migrations — creates gateways + gateway_credentials with 4 indexes
- Appended gateways + gatewayCredentials Drizzle table exports to `backend/src/db/schema.ts` matching DDL column-for-column; TypeScript compiles cleanly with exit 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Bridge types and GatewayAdapter interface** - `fcd5418` (feat)
2. **Task 2: Create migration and Drizzle schema for gateways + gateway_credentials** - `b70be34` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `backend/src/services/bridge/types.ts` - GatewayAdapter interface, all type aliases, result/row types
- `backend/src/db/migrate-bridge-v1.ts` - Idempotent migration creating both tables and 4 indexes
- `backend/src/db/schema.ts` - Added gateways + gatewayCredentials Drizzle exports at bottom

## Decisions Made
- `url` is nullable — CLI gateways (codex_cli, claude_cli, gemini_cli) use metadata JSONB for binary_path rather than a URL field
- `masked_display` stored pre-computed at insert time so API reads never need to decrypt credential values
- Partial unique index `idx_gateways_type_source` restricts uniqueness to `auto_detected` and `env_bootstrap` sources only — manual gateways of the same type can coexist
- GatewayAdapter interface is independent of ai-router.ts and stream-service.ts — the Bridge delegates to them without modifying either

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The migration runs automatically when the backend starts.

## Next Phase Readiness

- All type definitions and DB schema are in place for Phase 17 (Ollama adapter)
- Any concrete adapter can now implement GatewayAdapter interface
- schema_migrations guard ensures bridge_v1 migration is safe to run on existing databases
- Concern: opossum v9 types (@types/opossum v8 typings may not fully cover v9 API) — verify at Phase 17 install time

---

## Self-Check: PASSED

- FOUND: backend/src/services/bridge/types.ts
- FOUND: backend/src/db/migrate-bridge-v1.ts
- FOUND: commit fcd5418
- FOUND: commit b70be34

*Phase: 16-gateway-foundation*
*Completed: 2026-03-25*
