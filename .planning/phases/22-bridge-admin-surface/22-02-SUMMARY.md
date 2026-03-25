---
phase: 22-bridge-admin-surface
plan: 02
subsystem: api
tags: [fastify, typescript, postgresql, bridge, admin, gateway-crud, routing-rules, sse]

# Dependency graph
requires:
  - phase: 22-01
    provides: admin/bridge.ts with 4 GET endpoints, maskGatewayRow, mapRawToGatewayRow, VALID_GATEWAY_TYPES
  - phase: 16-gateway-foundation
    provides: gateways table, gateway_credentials table, encryptCredential, validatePorterSecret
  - phase: 17-provider-adapters
    provides: createAdapter() factory for gateway health checks
  - phase: 18-resilience-layer
    provides: circuit-breaker-registry with SSE emission (bridge:circuit-trip)
  - phase: 19-model-catalog
    provides: routing_rules table
  - phase: 20-live-dashboard
    provides: routing-engine with SSE emission (bridge:dispatch), health-probe SSE emission (bridge:health)

provides:
  - "POST /api/admin/bridge/gateways — gateway CRUD with actions: add, update, remove, validate"
  - "POST /api/admin/bridge/routing-rules — routing rule management with actions: create, update, delete, list"
  - "GET /api/admin/bridge/sse-status — documents bridge:health, bridge:dispatch, bridge:circuit-trip SSE events"
  - "ADM-05, ADM-06, ADM-07 requirements fulfilled — Phase 22 complete"

affects: [admin-ui-frontend, bridge-agent-dashboard, phase-23-onwards]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "POST handler action dispatch: action field in body routes to named sub-handlers within single Fastify route"
    - "Dynamic SET clause builder: iterate allowedFields dict, skip undefined values, append typed placeholders"
    - "Credential ID deterministic SHA-256: crypto.createHash('sha256').update(api_key).digest('hex').slice(0, 36)"
    - "validatePorterSecret() guard before any encryptCredential() call — consistent with bridge.ts pattern"
    - "Structured ok({ valid: false, error: 'NOT_FOUND' }) for gateway lookup failures — no 500 errors"

key-files:
  created: []
  modified:
    - backend/src/routes/v1/admin/bridge.ts

key-decisions:
  - "Both POST handlers in same file as GET handlers — single admin bridge plugin, no split"
  - "Capability/metadata fields use ::jsonb cast in INSERT for type safety with PostgreSQL jsonb columns"
  - "Routing rule action field: stored as 'action' in DB but accepted as 'action_type' in request body to avoid shadowing the outer 'action' dispatch variable"
  - "GET /sse-status is documentation-only — SSE emission code already working in phases 18-20, no changes needed"

patterns-established:
  - "Pattern 4: POST body action dispatch — single POST route with { action, ...data } body handles all mutations"
  - "Pattern 5: Dynamic SET clause with param array — build setClauses[] and params[] together, skip undefined"

requirements-completed: [ADM-05, ADM-06, ADM-07]

# Metrics
duration: 8min
completed: 2026-03-25
---

# Phase 22 Plan 02: Bridge Admin Surface Summary

**Full gateway CRUD and routing rule management via POST handlers plus SSE event documentation — completing Phase 22 admin Bridge API surface (ADM-05, ADM-06, ADM-07)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-25T11:58:00Z
- **Completed:** 2026-03-25T12:06:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `POST /api/admin/bridge/gateways` with 4 actions: add, update, remove, validate (ADM-05)
  - `add`: validates type against VALID_GATEWAY_TYPES, creates gateway row, optionally encrypts and stores credential
  - `update`: dynamic SET clause from allowed fields, credential upsert on api_key present
  - `remove`: DELETE with FK cascade handling credentials and models
  - `validate`: createAdapter + adapter.health() with structured ok/error response
- Added `POST /api/admin/bridge/routing-rules` with 4 actions: create, update, delete, list (ADM-06)
  - VALID_SCOPES and VALID_RULE_ACTIONS enforce valid inputs with structured err() responses
  - `create` records created_by from sessionUser
  - `list` returns all rules ordered by priority ASC, created_at ASC
- Added `GET /api/admin/bridge/sse-status` documenting all 3 Bridge SSE event types and their emission sources (ADM-07)
- Added imports: `crypto` (node:crypto), `createAdapter`, `encryptCredential`, `validatePorterSecret`, `err`

## Task Commits

Both tasks implemented in a single atomic file edit:

1. **Task 1+2: POST /gateways, POST /routing-rules, GET /sse-status** - `b8be54f` (feat)

**Plan metadata:** committed with docs commit

## Files Created/Modified
- `backend/src/routes/v1/admin/bridge.ts` - Added 2 POST handlers (gateways CRUD + routing rule management) and 1 GET (sse-status); added 4 new imports; 280 lines inserted

## Decisions Made
- Both POST handlers share the same `action` dispatch pattern (single route, body.action routes to sub-handlers) — clean, predictable, and consistent with existing Porter API conventions
- `action_type` field name in request body avoids shadowing the destructured `action` variable; stored as `action` in the DB column (matching schema)
- Capabilities and metadata use `::jsonb` cast in INSERT for type safety — consistent with existing gateway INSERT pattern
- `GET /sse-status` is purely documentation — confirming ADM-07 without touching SSE emission code (already working per phases 18-20)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `git add backend/src/routes/v1/admin/bridge.ts` required `-f` flag due to `.gitignore` `admin/` rule — resolved with `git add -f` per established pattern from Phase 20-02.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 22 is fully complete: all 7 ADM requirements (ADM-01 through ADM-07) and all DS-01/DS-02/DS-03 requirements are fulfilled
- Admin bridge API has 7 endpoints total: 5 GET + 2 POST
- Test stubs in `admin-bridge.test.ts` are ready to be implemented in a future testing phase
- Admin UI frontend can now build full bridge management UI against these endpoints

---
*Phase: 22-bridge-admin-surface*
*Completed: 2026-03-25*
