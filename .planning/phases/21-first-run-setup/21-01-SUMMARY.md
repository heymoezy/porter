---
phase: 21-first-run-setup
plan: 01
subsystem: api
tags: [bridge, gateway, detection, health-probe, adapter, postgres, fastify, typescript]

# Dependency graph
requires:
  - phase: 16-gateway-foundation
    provides: gateways table, GatewayRow type, upsertGateway, bootstrapEnvGateways
  - phase: 17-provider-adapters
    provides: createAdapter(), OllamaAdapter, OpenClawAdapter, CLI adapters, health()/listModels() methods
  - phase: 19-model-catalog
    provides: refreshAllGateways() called after detection
provides:
  - DetectionReport type with per-gateway found/healthy/latencyMs/models and zeroConfigReady boolean
  - GET /api/v1/bridge/detect endpoint (admin-only) returning full discovery results
  - OpenClaw gateway_roles=['ai_dispatch','messaging_gateway'] in metadata JSONB
  - probeGateway() internal helper for adapter-based health + model listing
  - mapRawToGatewayRow() helper converting pg raw rows to typed GatewayRow
affects:
  - 21-02 (setup-wizard routes — consumes /detect to drive first-run UI)
  - Any frontend setup wizard phase that needs zeroConfigReady signal

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DetectionReport pattern: detectAndUpsertGateways returns typed report rather than void, caller ignores return for backward compat"
    - "Probe-after-upsert: upsert row then SELECT it back to instantiate adapter for live health check"
    - "Never-throw probeGateway: all adapter errors caught, surfaced as error field in GatewayDetectionResult"

key-files:
  created: []
  modified:
    - backend/src/services/bridge/startup-detector.ts
    - backend/src/routes/v1/bridge.ts

key-decisions:
  - "detectAndUpsertGateways returns DetectionReport (not void) — boot caller ignores return value; TypeScript allows widening"
  - "probeGateway never throws — health failures become error fields in GatewayDetectionResult so boot never aborts"
  - "zeroConfigReady = any gateway found && healthy — true when Ollama running locally with no user config"
  - "OpenClaw metadata always includes gateway_roles on every boot upsert via ON CONFLICT DO UPDATE"

patterns-established:
  - "Report pattern: typed return from detection function, not side-effect-only void"
  - "Admin-only detection endpoint: same 403 pattern as POST /redetect"

requirements-completed: [FRS-01, FRS-03, FRS-04]

# Metrics
duration: 5min
completed: 2026-03-25
---

# Phase 21 Plan 01: First-Run Setup — Detection Endpoint Summary

**DetectionReport type + GET /bridge/detect endpoint exposing live gateway health, models, and zeroConfigReady boolean for the setup wizard**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-25T11:22:00Z
- **Completed:** 2026-03-25T11:27:24Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Refactored detectAndUpsertGateways to return typed DetectionReport with per-gateway results
- Added probeGateway() helper that calls health() and listModels() via adapter after each upsert
- Added GET /api/v1/bridge/detect route (admin-only, requireAuth) returning full discovery results
- OpenClaw metadata now includes gateway_roles=['ai_dispatch','messaging_gateway'] on every boot

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor startup-detector.ts to return DetectionReport** - `4602b3e` (feat)
2. **Task 2: Add GET /bridge/detect endpoint in bridge.ts** - `cd942a9` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `backend/src/services/bridge/startup-detector.ts` - Added DetectionReport/GatewayDetectionResult types, mapRawToGatewayRow, probeGateway; refactored detectAndUpsertGateways to return DetectionReport; bootstrapEnvGateways returns GatewayDetectionResult[]; OpenClaw metadata includes gateway_roles
- `backend/src/routes/v1/bridge.ts` - Added GET /detect route importing DetectionReport type, admin-only check, calls detectAndUpsertGateways and returns report via ok() envelope

## Decisions Made
- detectAndUpsertGateways return type widened to Promise<DetectionReport> — boot caller uses `.catch()` on void-compatible call, TypeScript allows returning richer type
- probeGateway wraps all adapter calls in try/catch so health failures are data, not exceptions — boot never aborts due to unhealthy gateway
- zeroConfigReady uses `found && healthy` — ensures Ollama running locally triggers true without any user configuration step

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness
- GET /api/v1/bridge/detect is live and returns structured DetectionReport
- zeroConfigReady signal available for setup wizard frontend to branch on
- Phase 21-02 can consume /detect endpoint to drive wizard UI flow

## Self-Check: PASSED

- startup-detector.ts: FOUND
- bridge.ts: FOUND
- 21-01-SUMMARY.md: FOUND
- Commit 4602b3e: FOUND
- Commit cd942a9: FOUND

---
*Phase: 21-first-run-setup*
*Completed: 2026-03-25*
