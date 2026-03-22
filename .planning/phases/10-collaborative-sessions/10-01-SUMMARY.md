---
phase: 10-collaborative-sessions
plan: 01
subsystem: auth
tags: [sqlite, drizzle-orm, fastify, rbac, collaboration, migration]

# Dependency graph
requires:
  - phase: 09-streaming-chat
    provides: auth plugin with requireAuth preHandler and sessionUser decoration
  - phase: 08-api-foundation
    provides: Fastify plugin architecture, envelope helpers (ok/err), better-sqlite3 client
provides:
  - project_collaborators table (16 columns, 4 indexes) with idempotent migration
  - collaboration_events audit table with 2 indexes
  - Owner backfill for all existing projects
  - ProjectRole type, PROJECT_ROLE_ORDER constant, hasProjectRole() helper (roles.ts)
  - requireProjectAccess(minRole) preHandler factory decorated on FastifyInstance
  - projectRole: ProjectRole | null on FastifyRequest for downstream handlers
affects: [10-02, 10-03, projects-routes, agents-routes, chat-routes, files-routes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "requireProjectAccess(minRole) factory pattern — returns preHandler, platform_admin bypass first"
    - "Drizzle schema definition appended per phase — projectCollaborators, collaborationEvents"
    - "Idempotent migration with legacy table detection — rename _v1_legacy if schema mismatch"

key-files:
  created:
    - backend/src/lib/roles.ts
    - backend/src/db/migrate-10.ts
  modified:
    - backend/src/db/schema.ts
    - backend/src/plugins/auth.ts
    - backend/src/index.ts

key-decisions:
  - "Legacy project_collaborators table (6 columns, created by porter.py) detected and renamed to _v1_legacy before migration creates correct 16-column schema"
  - "platform_admin check executes before any sqlite query — zero DB overhead for platform admins"
  - "status='active' filter in collaborator lookup — revoked/pending users get 403 at query level"

patterns-established:
  - "requireProjectAccess(minRole): factory returns async preHandler — use as route preHandler array element"
  - "request.projectRole exposes caller's effective project role to all downstream handlers"

requirements-completed: [COLLAB-02]

# Metrics
duration: 10min
completed: 2026-03-22
---

# Phase 10 Plan 01: Collaboration Data Layer and RBAC Middleware Summary

**project_collaborators + collaboration_events tables with idempotent migration, role hierarchy module, and requireProjectAccess(minRole) preHandler factory on FastifyInstance**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-22T08:57:00Z
- **Completed:** 2026-03-22T09:07:25Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created `project_collaborators` table (16 cols) with 4 indexes (unique on invite_token and project+email)
- Created `collaboration_events` audit table with 2 indexes
- Backfilled all 4 existing project owners as active collaborator records
- Delivered `roles.ts` with `PROJECT_ROLE_ORDER`, `ProjectRole` type, and `hasProjectRole()` helper covering full view < chat < edit < admin < owner hierarchy
- Implemented `requireProjectAccess(minRole)` factory on Fastify instance — platform_admin bypass, active-only lookup, role hierarchy enforcement, and `request.projectRole` exposure

## Task Commits

Each task was committed atomically:

1. **Task 1: Create migration, Drizzle schema, and role types** - `231bf50` (feat)
2. **Task 2: Implement requireProjectAccess factory in auth plugin** - `da94816` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `backend/src/lib/roles.ts` - PROJECT_ROLE_ORDER, ProjectRole type, hasProjectRole() helper
- `backend/src/db/migrate-10.ts` - migrate10Collaboration() with legacy schema detection, table creation, indexes, owner backfill
- `backend/src/db/schema.ts` - projectCollaborators and collaborationEvents Drizzle table definitions appended
- `backend/src/plugins/auth.ts` - requireProjectAccess factory + projectRole request decoration
- `backend/src/index.ts` - import and call migrate10Collaboration() in boot sequence

## Decisions Made
- **Legacy table handling:** The existing `project_collaborators` table (created by porter.py) had only 6 columns (id, project_id, username, role, added_by, added_at) — incompatible with the 16-column Phase 10 schema. Migration detects the mismatch, renames the old table to `project_collaborators_v1_legacy`, then creates the correct schema. Data migration was skipped as the old records lack required fields (email, status, invite_token).
- **platform_admin check first:** The `requireProjectAccess` handler checks `sessionUser.role === 'platform_admin'` before any sqlite query, ensuring zero DB overhead for platform admins and correct bypass semantics.
- **status='active' filter:** Revoked and pending collaborators are blocked at the query level — no application-level comparison needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Legacy project_collaborators schema mismatch handled in migration**
- **Found during:** Task 1 (running migration verification)
- **Issue:** porter.py had already created a `project_collaborators` table with 6 columns. `CREATE TABLE IF NOT EXISTS` would silently skip, then `CREATE UNIQUE INDEX ... ON project_collaborators(project_id, email)` would fail because the `email` column doesn't exist in the legacy schema.
- **Fix:** Added schema detection at migration start — checks if `email` and `invite_token` columns exist. If missing, renames the old table to `project_collaborators_v1_legacy` before creating the correct schema.
- **Files modified:** backend/src/db/migrate-10.ts
- **Verification:** Migration ran successfully, both tables exist, 4 owner records backfilled matching 4 projects
- **Committed in:** 231bf50 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug/schema mismatch)
**Impact on plan:** Required fix for migration to succeed. No scope creep. Legacy data preserved in renamed table.

## Issues Encountered
- `npx tsx -e` uses CJS mode and cannot resolve ESM project modules — used `node --import tsx/esm -e` for verification commands instead.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Phase 10 Plan 02 prerequisites are met: `requireProjectAccess` factory ready, tables exist, role types exported
- Plan 02 (invite API) can use `requireProjectAccess('edit')` as a preHandler on invite routes
- Plan 03 (route hardening) can apply `requireProjectAccess('view')` to all project-scoped v1 routes
- Concern: `project_collaborators_v1_legacy` table still present in DB — harmless but can be dropped in a future cleanup migration

---
*Phase: 10-collaborative-sessions*
*Completed: 2026-03-22*
