---
phase: 07-external-connections
plan: 02
subsystem: api
tags: [fastify, crud, connections, aes-256-gcm, credential-encryption, sse, sqlite, drizzle, admin-rbac]

# Dependency graph
requires:
  - phase: 07-external-connections plan 01
    provides: encryptCredential/decryptCredential, workspaceConnections/projectConnections Drizzle schemas, migrate-07-ext-connections
provides:
  - Full CRUD REST API for workspace_connections at /api/v1/connections
  - Project-level connection override management at /api/v1/connections/project/:projectId
  - Admin-only write enforcement on all workspace connection mutations
  - Encrypted credential storage on POST/PUT via encryptCredential
  - SSE emission (connection:status) on connection delete
  - connectionsV1Routes registered in v1 route index
affects: [07-03, 07-04, 07-05, 07-06, 07-07, 07-08, 07-09, 07-10, 07-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "meta_json list-response masking: encrypted rows return '[encrypted]' string — credentials never sent to frontend"
    - "Admin role check inline per route: request.sessionUser!.role !== 'admin' → 403 — no preHandler, keeps check near business logic"
    - "emitSSE fire-and-forget with .catch(() => {}) — SSE failure never blocks HTTP response"
    - "INSERT OR REPLACE for project_connections upsert — attach is idempotent"

key-files:
  created:
    - backend/src/routes/v1/connections.ts
  modified:
    - backend/src/routes/v1/index.ts

key-decisions:
  - "meta_json masked as '[encrypted]' in list/detail responses when meta_encrypted=1 — credentials never reach frontend"
  - "DELETE /:id returns 404 if connection not found before attempting delete — prevents ghost cascade deletes"
  - "POST /project/:projectId checks workspace connection existence before INSERT — returns 404 if connection_id invalid"

patterns-established:
  - "formatConnection() helper strips meta before serialization — single masking point, no risk of accidental exposure"

requirements-completed: [CONN-05]

# Metrics
duration: 2min
completed: 2026-03-21
---

# Phase 07 Plan 02: Connections CRUD API Summary

**Fastify v1 REST CRUD for workspace_connections and project_connections with AES-256-GCM credential masking, admin-only write enforcement, and SSE emission on delete**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-21T16:44:46Z
- **Completed:** 2026-03-21T16:46:16Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- 8-endpoint Fastify plugin covering all workspace and project connection CRUD operations
- Admin role enforcement on POST/PUT/DELETE workspace connections (non-admin → 403)
- AES-256-GCM credential encryption wired into POST and PUT — meta_json never stored plaintext when provided
- meta_json masked as `[encrypted]` in all list/detail responses — credentials never sent to frontend
- SSE `connection:status` event emitted fire-and-forget on DELETE
- connectionsV1Routes registered at `/connections` prefix in v1 route index
- TypeScript compilation: zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create connections CRUD routes** - `83013b4` (feat)
2. **Task 2: Wire connections routes into v1 index** - `1ff2cc6` (feat)

## Files Created/Modified

- `backend/src/routes/v1/connections.ts` - Full CRUD plugin: 8 routes, admin RBAC, encrypted meta, SSE emission
- `backend/src/routes/v1/index.ts` - Added connectionsV1Routes import and registration at /connections prefix

## Decisions Made

- Masked encrypted meta_json as `'[encrypted]'` string rather than omitting the field — frontend can render a status indicator without credential exposure.
- `DELETE /:id` checks existence before deleting (returns 404 for missing connection) even though the plan didn't require it — prevents silent no-op cascades.
- `POST /project/:projectId` validates that the referenced workspace connection exists — 404 rather than a silent FK violation.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required for this plan. PORTER_SECRET must be set before any encrypted credential is stored (handled by credential-crypto.ts throwing on missing secret).

## Next Phase Readiness

- All eight endpoints are live at `/api/v1/connections/*` after server restart
- Plan 03 (frontend connections UI) can consume GET /api/v1/connections and the project-level endpoints
- Plans 04-11 (integration services) can call POST /api/v1/connections to register their providers
- Admin role check uses `request.sessionUser.role === 'admin'` — consistent with auth plugin's role field

---
*Phase: 07-external-connections*
*Completed: 2026-03-21*

## Self-Check: PASSED

- FOUND: backend/src/routes/v1/connections.ts
- FOUND: backend/src/routes/v1/index.ts (modified)
- FOUND: .planning/phases/07-external-connections/07-02-SUMMARY.md
- FOUND: commit 83013b4
- FOUND: commit 1ff2cc6
