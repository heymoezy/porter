---
phase: 21-first-run-setup
plan: 02
subsystem: api
tags: [bridge, gateway, setup-wizard, adapter, credential-encryption, fastify, typescript, smoke-test]

# Dependency graph
requires:
  - phase: 21-01
    provides: DetectionReport type, detectAndUpsertGateways returning typed report, GET /bridge/detect
  - phase: 17-provider-adapters
    provides: createAdapter() for live health checks in /setup/validate
  - phase: 16-gateway-foundation
    provides: gateways + gateway_credentials tables, encryptCredential pattern

provides:
  - POST /api/v1/bridge/setup/detect — wizard step 1, runs full detection, returns DetectionReport
  - POST /api/v1/bridge/setup/configure — wizard step 2, saves gateway config + encrypts token credential
  - POST /api/v1/bridge/setup/validate — wizard step 3, live health check via createAdapter().health()
  - POST /api/v1/bridge/setup/save — wizard step 4, enable/disable gateway by type
  - tests/smoke-phase21.sh — smoke test covering FRS-01 through FRS-04

affects:
  - Any frontend setup wizard consuming /bridge/setup/* endpoints
  - Phase 22+ frontend-v2 first-run setup UI

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Setup wizard routes are stateless — each reads from DB directly, no wizard session state"
    - "VALID_GATEWAY_TYPES Set used for O(1) type validation across all 4 routes"
    - "mapRawToGatewayRow duplicated locally in bridge.ts to avoid circular import with startup-detector.ts"
    - "Deterministic SHA-256 credential ID keyed by type:manual:primary for idempotent upserts"
    - "Validate returns ok({valid:false, error, message}) for missing gateways — never throws 500"

key-files:
  created:
    - tests/smoke-phase21.sh
  modified:
    - backend/src/routes/v1/bridge.ts

key-decisions:
  - "mapRawToGatewayRow duplicated in bridge.ts — importing from startup-detector.ts would create circular dep (detector imports pool, bridge imports detector)"
  - "setup/validate returns ok() with valid:false for missing gateways — structured error per FRS research pitfall #2, never 404/500"
  - "setup/configure inserts manual gateway if none exists for that type — handles fresh setup without prior detection"
  - "Smoke test uses moe@askporter.app (platform_admin account) not moe@themozaic.com — admin routes require admin cap"

patterns-established:
  - "Wizard route pattern: validate type, lookup DB, return structured result — no exceptions, no session state"
  - "Smoke test gracefully skips service-dependent tests (Ollama offline, OpenClaw not configured)"

requirements-completed: [FRS-02]

# Metrics
duration: 3min
completed: 2026-03-25
---

# Phase 21 Plan 02: First-Run Setup — Setup Wizard Endpoints Summary

**Four independently callable POST /bridge/setup/* endpoints enabling step-by-step gateway configuration from any frontend or CLI, plus a smoke test covering all four FRS requirements**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-25T11:29:55Z
- **Completed:** 2026-03-25T11:34:00Z
- **Tasks:** 2
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments
- Added POST /setup/detect — runs full gateway detection, returns typed DetectionReport (same as GET /detect but POST for wizard convention)
- Added POST /setup/configure — looks up or inserts gateway, optionally encrypts token via encryptCredential, stores in gateway_credentials
- Added POST /setup/validate — performs live health check via createAdapter().health(), returns structured ok/error, never 500 on missing gateway
- Added POST /setup/save — enables/disables gateway by type, idempotent
- Created smoke-phase21.sh with pass/fail/skip coverage for FRS-01 through FRS-04

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 4 setup wizard POST endpoints to bridge.ts** - `e3c5b67` (feat)
2. **Task 2: Create smoke-phase21.sh covering FRS-01 through FRS-04** - `3c9a026` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `backend/src/routes/v1/bridge.ts` - Added imports (createAdapter, encryptCredential, validatePorterSecret, crypto, GatewayRow), VALID_GATEWAY_TYPES set, mapRawToGatewayRow local helper, and 4 POST /setup/* route handlers
- `tests/smoke-phase21.sh` - New smoke test covering FRS-01 through FRS-04 with pass/fail/skip reporting, executable

## Decisions Made
- mapRawToGatewayRow duplicated locally rather than imported from startup-detector.ts — avoids circular dependency since startup-detector imports pool and bridge.ts already imports from multiple places
- setup/validate returns `ok({valid:false, error:'GATEWAY_NOT_FOUND'})` rather than throwing/404 — consistent with FRS research pitfall note, frontend can branch on `valid` flag
- setup/configure handles both create (no existing gateway) and update (url change) paths in a single endpoint, keeping wizard flow simple
- Smoke test targets moe@askporter.app (platform_admin) — setup routes require admin role

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness
- All 4 setup wizard API endpoints are live and admin-protected
- Each endpoint is independently callable — no wizard session required
- Frontend or CLI can drive users through: detect → configure → validate → save
- Smoke test provides regression coverage for all FRS requirements

## Self-Check: PASSED

- bridge.ts modified: FOUND
- smoke-phase21.sh created: FOUND
- Commit e3c5b67: FOUND
- Commit 3c9a026: FOUND
- TypeScript compiles cleanly: VERIFIED

---
*Phase: 21-first-run-setup*
*Completed: 2026-03-25*
