---
phase: 15-skills-tools-architecture
plan: 02
subsystem: api
tags: [fastify, postgresql, zod, skills, tools, admin, crud]

requires:
  - phase: 15-01
    provides: "skills + tools DB tables seeded with 37 skills and 15 tools via migrate-15.ts"

provides:
  - "Full CRUD API for skills registry at GET|POST /api/admin/skills"
  - "Full CRUD API for tools registry at GET|POST /api/admin/tools"
  - "Category + featured list endpoints for both resources"
  - "Three-state visibility control (enabled/visible/featured) via PUT on both resources"
  - "workspace_connections routes preserved unchanged at /api/admin/tools/connections"

affects:
  - frontend-v2
  - porter-admin
  - agent-forge

tech-stack:
  added: []
  patterns:
    - "Literal routes (/categories, /featured, /connections) registered BEFORE /:id param routes to avoid Fastify conflicts"
    - "Dynamic SET clause for partial updates — only update keys provided in body, always append updated_at"
    - "z.record(z.string(), z.unknown()) for JSONB config_schema fields (Zod v4 two-arg requirement)"
    - "JSON.stringify() before INSERT for JSONB columns (config_schema, requires)"

key-files:
  created: []
  modified:
    - backend/src/routes/v1/admin/skills.ts
    - backend/src/routes/v1/admin/tools.ts

key-decisions:
  - "SKILL_CATALOG constant removed entirely — all skill data now lives in DB, admin is the single source of truth"
  - "environment_tools table queries removed — tools table is the canonical registry going forward"
  - "workspace_connections routes copied verbatim — zero change to connection data shape or query"
  - "PUT /:id/toggle preserved for backward compatibility with any existing callers"
  - "admin/ directory in .gitignore required git add -f to track these route files"

patterns-established:
  - "Literal routes registered before param routes: categories, featured, connections all before /:id"
  - "Dynamic partial update pattern: build SET clause from Object.keys(body), always append updated_at"
  - "409 CONFLICT on duplicate INSERT (pg error code 23505)"
  - "404 NOT_FOUND when rowCount === 0 on DELETE or UPDATE returns no rows"

requirements-completed:
  - SKL-04
  - SKL-05

duration: 3min
completed: 2026-03-24
---

# Phase 15 Plan 02: Skills + Tools Admin API Summary

**Full CRUD admin routes for skills and tools registries, replacing hardcoded SKILL_CATALOG and environment_tools with live PostgreSQL queries, plus preserved workspace_connections endpoints**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-24T10:12:31Z
- **Completed:** 2026-03-24T10:15:11Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- skills.ts rewritten: SKILL_CATALOG constant gone, 7 routes query the skills table, full CRUD with Zod, category + featured endpoints, three-state visibility
- tools.ts rewritten: environment_tools gone, 9 routes (4 literal before param routes), full CRUD with Zod, /connections routes preserved exactly
- Both files use consistent patterns: ok()/err() envelope, dynamic partial-update SET clause, 404 on missing resources

## Task Commits

1. **Task 1: Rewrite admin/skills.ts** - `22cc563` (feat)
2. **Task 2: Rewrite admin/tools.ts** - `697df9d` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `backend/src/routes/v1/admin/skills.ts` - Full CRUD for skills table: GET list, GET /categories, GET /featured, GET /:id, POST /, PUT /:id, DELETE /:id, PUT /:id/toggle
- `backend/src/routes/v1/admin/tools.ts` - Full CRUD for tools table + preserved GET /connections and GET /connections/:id/projects

## Decisions Made

- SKILL_CATALOG constant removed entirely — skills are now admin-controlled DB records, not hardcoded TypeScript
- environment_tools queries replaced by tools table — the old runtime-detection table is no longer the source of truth for the tools registry
- workspace_connections route handlers copied verbatim from old tools.ts — connection data and shape unchanged
- admin/ is in .gitignore (porter-admin is a sibling repo) — used git add -f to force-track the backend route files

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- admin/ directory is in .gitignore (it matches the sibling porter-admin repo pattern). Required `git add -f` to stage the backend route files. This is expected behavior — the backend route files at `backend/src/routes/v1/admin/` are part of Porter Brain, not the admin frontend.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Skills and tools admin APIs are now live and database-backed
- Any frontend (porter-admin, frontend-v2) can call GET /api/admin/skills and GET /api/admin/tools to get the full registry with visual metadata
- PUT /api/admin/skills/:id and PUT /api/admin/tools/:id with { enabled, visible, featured } fields gives admin full "god power" visibility control
- Plan 15-03 (if any) can build on these CRUD foundations for the agent forge skill/tool assignment UI

---
*Phase: 15-skills-tools-architecture*
*Completed: 2026-03-24*
