---
phase: 03-route-migration
plan: "02"
subsystem: backend-auth
tags: [fastify, auth, v1-routes, response-envelope, session-cookie, drizzle-orm]
dependency_graph:
  requires: [03-01]
  provides: [auth-plugin, v1-route-infrastructure, response-envelope, request-tracing]
  affects: [03-03, 03-04, 03-05]
tech_stack:
  added: [zod validation, fastify-plugin decorator pattern, crypto.randomUUID request tracing]
  patterns: [response envelope {data,meta}/{error,meta}, shared db/client.ts, requireAuth preHandler]
key_files:
  created:
    - backend/src/lib/envelope.ts
    - backend/src/lib/logger.ts
    - backend/src/plugins/auth.ts
    - backend/src/routes/v1/auth.ts
    - backend/src/routes/v1/index.ts
  modified:
    - backend/src/routes/auth.ts
    - backend/src/index.ts
decisions:
  - "requireAuth is a fastify.decorate() method, not a hook — routes opt in via preHandler array"
  - "v1Routes registered before legacy routes in index.ts — v1 takes priority over proxy fallback"
  - "Legacy auth.ts kept (not deleted) — still handles /login, /logout, /api/session for porter.py compatibility"
  - "better-sqlite3 is synchronous — .run() called explicitly on insert/update/delete, .get() on select"
metrics:
  duration: "4min"
  completed_date: "2026-03-20"
  tasks_completed: 2
  files_created: 5
  files_modified: 2
---

# Phase 03 Plan 02: V1 Auth Routes + Response Envelope Summary

**One-liner:** JWT-less session auth in Fastify with shared db/client.ts, Zod validation, and {data,meta} envelope on all /api/v1/auth/* routes.

## What Was Built

### backend/src/lib/envelope.ts
Response envelope helpers for all /api/v1/* routes. `ok(data)` wraps any payload in `{data, meta}`. `err(code, message)` produces `{error, meta}`. Both inject `meta.request_id` (UUID v4) and `meta.timestamp` for log correlation.

### backend/src/lib/logger.ts
Structured JSON logger with `logEvent(severity, domain, eventType, message, extra?)` mirroring porter.py's `mlog.emit` pattern. `createRequestId()` for standalone request ID generation.

### backend/src/plugins/auth.ts
Fastify plugin (fastify-plugin wrapped) that:
- Decorates `request.sessionUser` on all requests via `preHandler` hook
- Reads `porter_session` cookie, validates against `sessions` table, hydrates user from `users` table
- Exposes `fastify.requireAuth` decorator for routes to opt into auth enforcement
- Uses shared `db` from `db/client.ts` — no per-plugin DB instantiation

### backend/src/routes/v1/auth.ts
Three routes under `/api/v1/auth/`:
- `POST /login` — Zod-validated body, scrypt password verify, session insert, cookie set, `ok({username, displayName})` response
- `POST /logout` — cookie clear, session delete from DB, `ok({loggedOut: true})`
- `GET /me` — `requireAuth` preHandler, returns `ok({username, displayName, role, email})`

### backend/src/routes/v1/index.ts
Route registration hub at `/api/v1` prefix. Auth registered at `/auth` sub-prefix. Pattern established for future route additions (agents, projects, etc.).

## Changes to Existing Files

### backend/src/routes/auth.ts (legacy)
Removed `new Database('../porter.db')` and inline `drizzle()` instantiation. Now imports shared `db` from `../db/client.js`. All query calls converted from `await db.select()...get()` to synchronous `db.select()...get()` (better-sqlite3 is sync). Insert/update/delete calls use `.run()` explicitly.

### backend/src/index.ts
Added imports for `authPlugin` and `v1Routes`. Registration order: cors → cookie → websocket → **authPlugin** → **v1Routes** (`/api/v1` prefix) → legacy routes → proxyPlugin (LAST).

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- TypeScript: `npx tsc --noEmit` exits 0 — no errors
- Playwright: 35/35 tests pass — no regressions from auth plugin registration
- Structural checks: all 5 assertions passed (shared db, envelope usage, v1 index registration, authPlugin registration, legacy auth fixed)

## Self-Check: PASSED

Files verified:
- backend/src/lib/envelope.ts: FOUND
- backend/src/lib/logger.ts: FOUND
- backend/src/plugins/auth.ts: FOUND
- backend/src/routes/v1/auth.ts: FOUND
- backend/src/routes/v1/index.ts: FOUND

Commits verified:
- 7d3137e: Task 1 (envelope, logger, auth plugin)
- a607994: Task 2 (v1 routes, index.ts, legacy auth fix)
