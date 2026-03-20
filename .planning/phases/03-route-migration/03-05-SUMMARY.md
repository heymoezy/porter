---
phase: 03-route-migration
plan: 05
subsystem: frontend-api-wiring + fastify-spa-serving
tags: [frontend, fastify, spa, static-files, deprecation, api-v1, perf-02]
dependency_graph:
  requires: [03-02, 03-03, 03-04]
  provides: [PERF-02-complete, frontend-v1-wired, fastify-spa-serving]
  affects: [frontend/src/lib/api.ts, backend/src/index.ts, porter.py]
tech_stack:
  added: ["@fastify/static v9"]
  patterns:
    - "SPA fallback via GET /v2/* wildcard + fs.readFileSync(index.html)"
    - "@fastify/static with wildcard:false to avoid HEAD route conflict with proxy"
    - "Fastify plugin scoping: decorateReply must be avoided when sendFile needed outside plugin scope"
key_files:
  created: []
  modified:
    - frontend/src/lib/api.ts
    - backend/src/index.ts
    - porter.py
decisions:
  - "wildcard:false on @fastify/static to prevent HEAD route conflict with proxy plugin wildcard registration"
  - "SPA catch-all reads index.html via fs.readFileSync — sendFile is scoped to plugin and unavailable in top-level routes"
  - "porter.py handlers marked deprecated (not deleted) — Playwright tests still target port 8877 embedded HTML"
  - "No internal self-calls found in porter.py for /api/personas, /api/projects, or /login — safe to deprecate"
metrics:
  duration: ~25min
  completed_date: "2026-03-20"
  tasks: 2
  files: 3
---

# Phase 3 Plan 5: Frontend API Wiring + Fastify SPA Serving Summary

**One-liner:** Frontend api.ts wired to /api/v1/* with logout(), Fastify serves React SPA at /v2/* via @fastify/static + fs.readFileSync fallback, porter.py migrated handlers marked deprecated — PERF-02 complete.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update frontend API client + Fastify SPA serving | b2eadda, 031f972 | frontend/src/lib/api.ts, backend/src/index.ts |
| 2 | Verify Fastify v1 routes + mark porter.py deprecated | d1fce7c | porter.py |

## What Was Built

### Task 1: Frontend API Client + SPA Serving

**frontend/src/lib/api.ts changes:**
- `login()` now POSTs to `/api/v1/auth/login` (was `/login`)
- Response check uses `json.data?.username != null` matching v1 envelope format (was `data.ok === true`)
- 401 handler redirects to `/v2/login` (was `/login`) — points to React SPA login page
- New `logout()` function: POSTs to `/api/v1/auth/logout`, then redirects to `/v2/login`
- Fixed `ApiError` class: `status` field declared separately (not as constructor parameter property) — required by `erasableSyntaxOnly: true` tsconfig flag

**backend/src/index.ts changes:**
- Added `@fastify/static` import with `fs` and `path`
- Registers static file serving for `frontend/dist/` at prefix `/v2/` with `wildcard: false`
- SPA catch-all `GET /v2/*` reads `index.html` via `fs.readFileSync` and sends with `text/html` content type

### Task 2: Fastify v1 Route Verification + porter.py Deprecation

**Fastify v1 routes verified:**
- `POST /api/v1/auth/login` — returns `{data: {username, displayName}, meta: {request_id, timestamp}}`
- `GET /api/v1/auth/me` — returns `{data: {username, displayName, role, email}, meta: {...}}`
- `GET /api/v1/projects` — returns `{data: {projects: [...], count: N}, meta: {...}}`
- `GET /api/v1/agents` — returns `{data: {agents: [...], count: N}, meta: {...}}`
- `POST /api/v1/auth/logout` — returns `{data: {loggedOut: true}, meta: {...}}`
- All responses include `meta.request_id` in UUID v4 format

**porter.py deprecation markers added:**
- Line 46569: `POST /login` — "Fastify /api/v1/auth/login owns this"
- Line 46845: `GET /api/personas` — "Fastify /api/v1/agents/* owns this"
- Line 48955: `GET /api/projects` — "Fastify /api/v1/projects/* owns this"
- Line 50440: `POST /logout` — "Fastify /api/v1/auth/logout owns this"
- Line 52346: `POST /api/personas` — "Fastify /api/v1/agents/* owns this"
- Line 55308: `POST /api/projects` — "Fastify /api/v1/projects/* owns this"

**Internal self-call check:** Zero urllib calls to /api/personas, /api/projects, or /login found. Safe to deprecate.

## Verification Results

- `python3 /tmp/test_v1_routes.py` — ALL 5 route checks PASS
- `npx playwright test` — **35/35 tests PASS**
- `grep -c "DEPRECATED Phase 3" porter.py` — returns 7 (6 new + 1 pre-existing from Plan 01)
- `GET http://127.0.0.1:3001/v2/login` — returns HTML (React SPA index.html)
- `GET http://127.0.0.1:3001/v2/assets/*.js` — returns 200 (static assets)
- `POST http://127.0.0.1:3001/api/v1/auth/login` — returns v1 envelope JSON
- `GET http://127.0.0.1:3001/api/anything-else` — proxies to porter.py at 8877

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `erasableSyntaxOnly` TypeScript error in ApiError class**
- **Found during:** Task 1, frontend build
- **Issue:** `constructor(public status: number, message: string)` — parameter properties not allowed with `erasableSyntaxOnly: true` in tsconfig.app.json
- **Fix:** Declared `status: number` as a separate class field, assigned in constructor body
- **Files modified:** frontend/src/lib/api.ts
- **Commit:** b2eadda (included in Task 1 commit)

**2. [Rule 1 - Bug] Fixed @fastify/static HEAD route conflict**
- **Found during:** Task 1, Fastify startup
- **Issue:** `@fastify/static` with prefix `/v2/` registers a wildcard that conflicts with the explicit `GET /v2/*` catch-all (Fastify reports "Method 'HEAD' already declared for route '/v2/*'")
- **Fix:** Added `wildcard: false` to static plugin options to disable its auto-wildcard
- **Files modified:** backend/src/index.ts
- **Commit:** 031f972

**3. [Rule 1 - Bug] Fixed `reply.sendFile is not a function` in SPA catch-all**
- **Found during:** Task 1, first `/v2/login` request
- **Issue:** `reply.sendFile` is decorated by `@fastify/static` within its plugin scope but not accessible from top-level route registrations outside that scope
- **Fix:** Changed SPA catch-all to use `fs.readFileSync(path.join(frontendDist, 'index.html'), 'utf8')` and send directly via `reply.type('text/html').send(html)`
- **Files modified:** backend/src/index.ts, added `import fs from 'fs'`
- **Commit:** 031f972

## Phase 3 Migration State (Final)

After this plan, PERF-02 is complete. The strangler fig has reached its conclusion for auth/projects/agents:

| Layer | Owner | Port | Status |
|-------|-------|------|--------|
| /api/v1/auth/* | Fastify | 3001 | Active |
| /api/v1/projects/* | Fastify | 3001 | Active |
| /api/v1/agents/* | Fastify | 3001 | Active |
| /v2/* (React SPA) | Fastify | 3001 | Active |
| /login, /api/personas/*, /api/projects/* | porter.py | 8877 | Deprecated (alive) |
| All other routes | porter.py (via proxy) | 8877 → proxy | Active |

**Deferred to port-swap phase:** Full deletion of porter.py deprecated handlers requires Fastify to become primary on port 8877. This is a future phase decision.

## Self-Check: PASSED

Files exist:
- frontend/src/lib/api.ts: FOUND
- backend/src/index.ts: FOUND
- porter.py: FOUND (with DEPRECATED Phase 3 markers)

Commits exist:
- b2eadda: feat(03-05): wire frontend to /api/v1/*
- 031f972: fix(03-05): @fastify/static SPA serving fix
- d1fce7c: chore(03-05): mark legacy porter.py handlers deprecated

Tests: 35/35 PASS
