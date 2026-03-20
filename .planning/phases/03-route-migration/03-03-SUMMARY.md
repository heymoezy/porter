---
phase: 03-route-migration
plan: "03"
subsystem: backend-routes
tags: [fastify, routes, projects, agents, personas, drizzle, crud]
dependency_graph:
  requires: ["03-02"]
  provides: ["03-04"]
  affects: [backend/src/db/schema.ts, backend/src/routes/v1/]
tech_stack:
  added: []
  patterns: [drizzle-orm, zod-v4, envelope-pattern, requireAuth-preHandler]
key_files:
  created:
    - backend/src/routes/v1/projects.ts
    - backend/src/routes/v1/agents.ts
  modified:
    - backend/src/db/schema.ts
    - backend/src/routes/v1/index.ts
decisions:
  - "Personas table schema maps real porter.db columns (id, name, role, avatar, preferred_backend, etc.) — not the plan's best-guess list, verified against CREATE TABLE + all ALTER TABLE statements"
  - "Zod v4 uses .issues not .errors — fixed auto per Rule 1"
  - "DELETE /api/v1/agents/:id soft-deletes by setting status='retired' — matches porter.py behavior"
  - "agents.ts sorts by sortOrder in JS after query (ne() from drizzle-orm used for status != 'retired')"
  - "projects links field: porter.py stores as JSON object not array — formatProject returns {} fallback not []"
metrics:
  duration: "5min"
  completed: "2026-03-20T19:50:41Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 2
---

# Phase 03 Plan 03: Projects and Agents CRUD Routes Summary

**One-liner:** Fastify CRUD routes for /api/v1/projects/* and /api/v1/agents/* with Drizzle ORM, personas table in schema, all routes auth-gated and envelope-wrapped.

## What Was Built

### Task 1: Personas Drizzle Schema + Projects Routes
- Added `personas` table to `backend/src/db/schema.ts` with all 28 columns matching the real porter.db schema (CREATE TABLE + all ALTER TABLE statements verified)
- Created `backend/src/routes/v1/projects.ts` with 5 routes: GET /, POST /, GET /:id, PUT /:id, DELETE /:id
- All routes use `requireAuth` preHandler and `ok()`/`err()` envelope
- JSON fields (milestones, artifacts, links, metadata) parsed on read with safe fallbacks

### Task 2: Agents Routes + v1 Index Registration
- Created `backend/src/routes/v1/agents.ts` with 5 routes: GET /, POST /, GET /:id, PUT /:id, DELETE /:id
- Config JSON blob parsed and merged into response (description, skills, tools, awareness_mode)
- `appearance_spec` parsed from JSON, all DB columns reflected in response
- DELETE performs soft-delete (status = 'retired') matching porter.py behavior
- Updated `backend/src/routes/v1/index.ts` to register all three route groups: `/auth`, `/projects`, `/agents`

## Verification Results

- TypeScript: compiles cleanly (0 errors)
- Playwright: 35/35 tests pass
- Runtime tested: login, projects list, agents list, 401 without auth all work correctly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zod v4 uses .issues not .errors**
- **Found during:** Task 1, first tsc run
- **Issue:** `parsed.error.errors` does not exist in Zod v4; it was renamed to `.issues`
- **Fix:** Changed both error access sites in projects.ts (and used correct .issues in agents.ts from the start)
- **Files modified:** backend/src/routes/v1/projects.ts
- **Commit:** 65c1e51

**2. [Rule 1 - Bug] Personas schema columns differ from plan's best-guess**
- **Found during:** Task 1 research (reading actual CREATE TABLE + ALTER TABLE statements)
- **Issue:** Plan documented best-guess column names (personality, communicationStyle, etc.) that don't exist in porter.db. Real schema has: avatar, preferred_backend, fallback_backends, soul_hash, is_system, is_public, is_locked, is_master, orchestrator_only, is_temporary, managed_by_porter, heartbeat_enabled, heartbeat_cron, last_heartbeat, owner
- **Fix:** Built schema from actual porter.py _db_init + all ALTER TABLE statements
- **Files modified:** backend/src/db/schema.ts

## Self-Check: PASSED
