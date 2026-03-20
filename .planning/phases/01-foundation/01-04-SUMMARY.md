---
phase: 01-foundation
plan: 04
subsystem: infra
tags: [fastify, drizzle-orm, better-sqlite3, typescript, proxy, config]

# Dependency graph
requires: []
provides:
  - "Environment-driven config module (config.ts) with 5 feature flag skeleton"
  - "Drizzle ORM DB client (db/client.ts) with WAL mode and 30s busy_timeout"
  - "Extended Drizzle schema (schema.ts) with projects and schemaMigrations tables"
  - "Fastify proxy plugin (plugins/proxy.ts) forwarding unknown routes to porter.py:8877"
  - "Updated index.ts bound to 127.0.0.1 (not 0.0.0.0) using config values"
affects:
  - "01-05 (projects migration) - uses Drizzle projects table"
  - "Phase 3 (route migration) - uses proxy plugin and Fastify infrastructure"
  - "Phase 5 (wizard) - uses feature flag skeleton"

# Tech tracking
tech-stack:
  added: ["@fastify/http-proxy ^11.0.1", "fastify-plugin ^5.1.0 (already installed)"]
  patterns:
    - "All config via process.env with fallback defaults — no hardcoded values"
    - "Feature flags as booleans from FEATURE_* env vars"
    - "Drizzle ORM with raw better-sqlite3 instance exposed for migration scripts"
    - "Fastify plugins registered last = lowest priority (proxy is fallback)"

key-files:
  created:
    - "backend/src/config.ts"
    - "backend/src/db/client.ts"
    - "backend/src/plugins/proxy.ts"
  modified:
    - "backend/src/db/schema.ts"
    - "backend/src/index.ts"
    - "backend/src/routes/admin.ts"
    - "backend/src/routes/events.ts"
    - ".gitignore"

key-decisions:
  - "backend/ removed from .gitignore — TypeScript backend source now tracked; dist/ and node_modules/ remain excluded"
  - "rewriteRequestHeaders dropped from proxy config — not in @fastify/http-proxy v11 API, pass-through is the default behavior"
  - "db/client.ts exports both `db` (Drizzle) and `sqlite` (raw) — migration scripts need the raw instance"

patterns-established:
  - "Pattern: All Fastify routes registered before proxyPlugin — proxy is the fallback of last resort"
  - "Pattern: config.ts is the single source for all env vars — no process.env calls scattered in route files"
  - "Pattern: .js extensions on all local ESM imports in TypeScript source files"

requirements-completed: [FOUND-03]

# Metrics
duration: 5min
completed: 2026-03-20
---

# Phase 01 Plan 04: Fastify Backend Infrastructure Summary

**Fastify backend wired with env-driven config, Drizzle/SQLite client (WAL + 30s busy_timeout), extended schema (projects + schemaMigrations tables), and catch-all proxy to porter.py on port 8877**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-20T10:48:16Z
- **Completed:** 2026-03-20T10:53:34Z
- **Tasks:** 2 of 2
- **Files modified:** 9

## Accomplishments

- Config module reads all values from environment (PORTER_BACKEND_PORT, PORTER_BACKEND_HOST, PORTER_PY_URL, PORTER_DB_PATH, PORTER_DATA_DIR, LOG_LEVEL) with sensible defaults
- Five feature flags (agentScheduling, guidedWizard, eventTriggers, ephemeralAgents, sseRealtime) ready for future phase gating
- Drizzle DB client with WAL mode and 30s busy_timeout eliminates "database is locked" errors under concurrent agent access
- Projects and schemaMigrations tables added to Drizzle schema without touching existing tables
- Fastify now binds to 127.0.0.1 instead of 0.0.0.0, proxy registered last as fallback for all unhandled routes

## Task Commits

Each task was committed atomically:

1. **Task 1: config.ts, db/client.ts, extended schema.ts** - `0c48785` (feat)
2. **Task 2: proxy plugin, index.ts update, pre-existing bug fixes** - `0dfe6ee` (feat)

## Files Created/Modified

- `backend/src/config.ts` - Environment-driven config + 5 feature flags
- `backend/src/db/client.ts` - Drizzle ORM client with WAL + 30s busy_timeout, exports `db` and `sqlite`
- `backend/src/db/schema.ts` - Extended with `projects` and `schemaMigrations` tables
- `backend/src/plugins/proxy.ts` - Fastify proxy plugin forwarding to config.porterPyUrl
- `backend/src/index.ts` - Uses config.host/config.port, registers proxy last, .js ESM imports
- `backend/src/routes/admin.ts` - Pre-existing unterminated string literal bug fixed
- `backend/src/routes/events.ts` - Pre-existing implicit `any` on WebSocket message parameter fixed
- `.gitignore` - Removed `backend/` exclusion; added `backend/dist/` and `backend/node_modules/`

## Decisions Made

- Removed `backend/` from `.gitignore` — it was listed as "Legacy (removed v0.31.81)" but the TypeScript backend is being re-established as the GSD migration target. Source must be tracked; dist and node_modules remain excluded.
- Dropped `rewriteRequestHeaders` from proxy config — this option does not exist in `@fastify/http-proxy` v11. The default behavior (pass-through headers) is exactly what we need.
- Exported `sqlite` raw instance alongside `db` (Drizzle) from client.ts — one-shot migration scripts in plan 05 need direct SQLite access for the projects migration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed backend/ from .gitignore**
- **Found during:** Task 1 (committing config.ts, client.ts, schema.ts)
- **Issue:** `.gitignore` had `backend/` listed under "Legacy" — none of the task files would be tracked or committable
- **Fix:** Replaced `backend/` exclusion with `backend/dist/` and `backend/node_modules/` to track source while ignoring build artifacts
- **Files modified:** `.gitignore`
- **Verification:** `git status` shows backend/src/ files as untracked (visible); package-lock.json still excluded
- **Committed in:** `0c48785` (part of Task 1 commit)

**2. [Rule 1 - Bug] Fixed unterminated string literal in admin.ts line 69**
- **Found during:** Task 2 (TypeScript compilation check)
- **Issue:** `data.trim().split('\n')` had a literal newline between the quotes — caused TS2002 unterminated string literal error
- **Fix:** Replaced literal newline with `\n` escape sequence
- **Files modified:** `backend/src/routes/admin.ts`
- **Verification:** `npx tsc --noEmit` no longer errors on this line
- **Committed in:** `0dfe6ee` (part of Task 2 commit)

**3. [Rule 1 - Bug] Fixed implicit any on WebSocket message handler in events.ts**
- **Found during:** Task 2 (TypeScript compilation check — only remaining error after admin.ts fix)
- **Issue:** `connection.socket.on('message', (message) => {...})` — `message` had implicit `any` type, causing TS7006 error
- **Fix:** Added `Buffer | string` type annotation to the `message` parameter
- **Files modified:** `backend/src/routes/events.ts`
- **Verification:** `npx tsc --noEmit` exits with code 0 (clean)
- **Committed in:** `0dfe6ee` (part of Task 2 commit)

**4. [Rule 1 - Bug] Dropped rewriteRequestHeaders from proxy config**
- **Found during:** Task 2 (TypeScript compilation check — TS2769 no overload matches)
- **Issue:** `rewriteRequestHeaders` option does not exist in `@fastify/http-proxy` v11 API
- **Fix:** Removed the option; default pass-through behavior is correct for our use case
- **Files modified:** `backend/src/plugins/proxy.ts`
- **Verification:** No TypeScript error on proxy plugin options
- **Committed in:** `0dfe6ee` (part of Task 2 commit)

---

**Total deviations:** 4 auto-fixed (1 blocking, 3 bugs)
**Impact on plan:** All auto-fixes essential. gitignore fix unblocked all commits. Three TypeScript errors were pre-existing bugs in unchecked files that surfaced during compilation validation. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None — no external service configuration required beyond environment variables documented in config.ts.

## Next Phase Readiness

- Plan 05 (projects migration): Drizzle projects table ready, `sqlite` raw instance exported for one-shot migration script
- Phase 3 (route migration): Fastify server with proxy fallback ready; routes can be migrated one vertical slice at a time
- Phase 5 (wizard): Feature flag skeleton in place; enable flags via FEATURE_GUIDED_WIZARD=true env var

---
*Phase: 01-foundation*
*Completed: 2026-03-20*
