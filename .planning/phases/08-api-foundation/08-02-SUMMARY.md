---
phase: 08-api-foundation
plan: 02
subsystem: api
tags: [openapi, swagger, fastify-zod-openapi, observability, error-capture, migration]

# Dependency graph
requires: ["08-01"]
provides:
  - "GET /api/v1/openapi.json returns valid OpenAPI 3.0.3 document auto-generated from Zod route schemas (61 paths)"
  - "GET /api/v1/docs Swagger UI at development time"
  - "POST /api/v1/errors stores frontend error reports (no auth, returns 201+id)"
  - "GET /api/v1/errors queries stored errors by severity/component/time range (auth required)"
  - "frontend_errors SQLite table with severity/component/created_at indexes"
affects: [all future v1 routes, frontend error observability, API clients consuming openapi.json]

# Tech tracking
tech-stack:
  added:
    - "fastify-zod-openapi@5.5.0 — Zod schema -> OpenAPI 3.x + Fastify validator/serializer compilers"
    - "@fastify/swagger@9.7.0 — OpenAPI spec endpoint and document assembly"
    - "@fastify/swagger-ui@5.2.5 — Interactive Swagger UI at /api/v1/docs"
  patterns:
    - "openapiPlugin registers fastifyZodOpenApiPlugin BEFORE authPlugin and v1Routes — Zod compilers must be set before any route schema compiles"
    - "fastify.swagger() called at /api/v1/openapi.json — public, no auth, served after all routes registered"
    - "frontend_errors table follows migrate-07 idempotent pattern: check schema_migrations, exec, insert migration record"
    - "POST /errors uses Zod safeParse for validation, no auth (fires during login failures)"
    - "GET /errors uses named @params in SQLite prepared statements for injection-safe dynamic WHERE clauses"

key-files:
  created:
    - backend/src/plugins/openapi.ts
    - backend/src/db/migrate-08.ts
    - backend/src/routes/v1/errors.ts
  modified:
    - backend/src/index.ts
    - backend/src/routes/v1/index.ts
    - backend/src/routes/v1/webhooks-whatsapp.ts
    - backend/package.json

key-decisions:
  - "fastifyZodOpenApiPlugin (not fastifyZodOpenApi): actual export name from fastify-zod-openapi@5.5.0 differs from documentation examples — confirmed from .d.ts inspection"
  - "z.record(z.string(), z.unknown()): Zod v4 requires explicit key type for record — single-arg form fails TypeScript even though it works at runtime"
  - "openapiPlugin registered globally (not inside v1Routes encapsulation): swagger plugin must be at root Fastify instance to collect paths from all registered child plugins"
  - "catch (sigErr) renamed from (err): avoid shadowing the imported err() envelope helper in webhooks-whatsapp.ts"

requirements-completed: [API-03, OBS-01, OBS-02]

# Metrics
duration: 5min
completed: 2026-03-21
---

# Phase 08 Plan 02: OpenAPI Spec + Frontend Error Capture Summary

**OpenAPI 3.0.3 spec auto-generated from Zod schemas at /api/v1/openapi.json (61 paths) + unauthenticated POST and authenticated GET /api/v1/errors for frontend error observability**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-21T19:13:27Z
- **Completed:** 2026-03-21T19:18:35Z
- **Tasks:** 2 of 2
- **Files created:** 3
- **Files modified:** 4

## Accomplishments

- Installed `fastify-zod-openapi@5.5.0`, `@fastify/swagger@9.7.0`, `@fastify/swagger-ui@5.2.5`
- Created `plugins/openapi.ts`: registers `fastifyZodOpenApiPlugin` with Zod validator/serializer compilers, wires `@fastify/swagger` with Porter API info and cookieAuth security scheme, exposes Swagger UI at `/api/v1/docs`
- Created `db/migrate-08.ts`: idempotent migration creating `frontend_errors` table with severity, component, and created_at indexes
- Created `routes/v1/errors.ts`: `POST /api/v1/errors` (no auth, validates via Zod safeParse, returns 201 with `{id}`), `GET /api/v1/errors` (auth required, filters by severity/component/since/until with pagination)
- Wired openapiPlugin into `index.ts` BEFORE `authPlugin` and `v1Routes` (Zod compiler order)
- Added `migrate08ApiFoundation()` to `start()` function in index.ts
- Added `GET /api/v1/openapi.json` public endpoint returning `fastify.swagger()`
- Registered `errorV1Routes` with prefix `/errors` in `v1/index.ts`

## Task Commits

Each task was committed atomically:

1. **Task 1: Install OpenAPI packages, create openapi plugin, migration, and errors route** - `ef9a65b` (feat)
2. **Task 2: Wire openapi plugin, migration, errors route, and spec endpoint into index files** - `7a7c251` (feat)

**Plan metadata:** (this commit, docs)

## Verification Results

All success criteria verified against running server:

| Criteria | Result |
|----------|--------|
| `GET /api/v1/openapi.json` returns OpenAPI 3.0.3 | PASS — `openapi: "3.0.3"`, 61 paths, title "Porter API" |
| `POST /api/v1/errors` returns 201 `{ok:true, data:{id:N}}` | PASS — HTTP 201, id: 1 |
| `POST /api/v1/errors` no auth required | PASS — works without session cookie |
| `GET /api/v1/errors?severity=error&component=ChatPanel` returns filtered data | PASS — 1 matching error returned |
| `GET /api/v1/errors` without auth returns 401 | PASS — `{ok: false}`, HTTP 401 |
| openapiPlugin registered before v1Routes | PASS — line 78 < line 84 in index.ts |
| migrate-08 is idempotent | PASS — checks schema_migrations before exec |

## Files Created/Modified

- `backend/src/plugins/openapi.ts` — NEW: fastify-zod-openapi + @fastify/swagger plugin, Swagger UI, cookieAuth security scheme
- `backend/src/db/migrate-08.ts` — NEW: frontend_errors table migration with 3 indexes, idempotent
- `backend/src/routes/v1/errors.ts` — NEW: POST (no auth, 201) and GET (auth, filterable) for frontend error capture
- `backend/src/index.ts` — Add openapiPlugin (before authPlugin), migrate08ApiFoundation() call, /api/v1/openapi.json endpoint
- `backend/src/routes/v1/index.ts` — Register errorV1Routes with prefix /errors
- `backend/src/routes/v1/webhooks-whatsapp.ts` — Fix catch variable name collision (err -> sigErr)
- `backend/package.json` — Add 3 OpenAPI packages

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] fastifyZodOpenApi -> fastifyZodOpenApiPlugin**
- **Found during:** Task 2 TypeScript check
- **Issue:** Plan used `fastifyZodOpenApi` as import name but the actual export from `fastify-zod-openapi@5.5.0` is `fastifyZodOpenApiPlugin`
- **Fix:** Updated import and usage in `plugins/openapi.ts`
- **Files modified:** `backend/src/plugins/openapi.ts`
- **Commit:** `7a7c251`

**2. [Rule 2 - Missing functionality] z.record() requires explicit key type**
- **Found during:** Task 2 TypeScript check
- **Issue:** `z.record(z.unknown())` TypeScript error — Zod v4 types require 2 arguments for record
- **Fix:** Changed to `z.record(z.string(), z.unknown())` in `errors.ts`
- **Files modified:** `backend/src/routes/v1/errors.ts`
- **Commit:** `7a7c251`

**3. [Rule 1 - Bug] catch variable shadows imported err() function**
- **Found during:** Task 2 TypeScript check
- **Issue:** `catch (err: unknown)` in webhooks-whatsapp.ts shadows the `err()` envelope helper, causing TypeScript error TS18046 and broken error response on that code path
- **Fix:** Renamed catch variable to `sigErr` to avoid the collision
- **Files modified:** `backend/src/routes/v1/webhooks-whatsapp.ts`
- **Commit:** `7a7c251`

## Self-Check: PASSED

### File existence

- FOUND: backend/src/plugins/openapi.ts
- FOUND: backend/src/db/migrate-08.ts
- FOUND: backend/src/routes/v1/errors.ts
- FOUND: .planning/phases/08-api-foundation/08-02-SUMMARY.md

### Commit existence

- FOUND: ef9a65b (Task 1)
- FOUND: 7a7c251 (Task 2)
