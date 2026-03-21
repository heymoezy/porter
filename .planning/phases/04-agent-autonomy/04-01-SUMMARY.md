---
phase: 04-agent-autonomy
plan: 01
subsystem: database
tags: [sqlite, drizzle-orm, scheduler, job-queue, better-sqlite3, fastify]

# Dependency graph
requires:
  - phase: 03-route-migration
    provides: Fastify v1 route infrastructure, Drizzle ORM setup, db/client.ts with sqlite export, featureFlags in config.ts
provides:
  - agent_jobs and agent_activity Drizzle table definitions in schema.ts
  - migrate-04.ts SQL migration (idempotent, schema_migrations guarded)
  - services/scheduler.ts: 2s poll loop, atomic UPDATE...RETURNING job claim, porter.py dispatch proxy, retry backoff, activity logging
  - GET/POST /api/v1/jobs and POST /api/v1/jobs/:id/cancel routes
  - deadline column on projects schema
  - scheduler start/stop lifecycle wired to Fastify server boot and SIGINT/SIGTERM
affects: [04-02-ai-router, 04-03-event-triggers, 04-04-activity-log, 04-05-ephemeral-agents]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Atomic UPDATE...RETURNING for job pickup (anti-double-execution, no mutex needed)
    - Feature flag guard at every tick entry point (kill switch without restart)
    - Retry-with-backoff via SQL: attempt_count increment + scheduled_for = unixepoch('now') + (attempt * 30s)
    - Idempotent migration via schema_migrations check-before-apply pattern

key-files:
  created:
    - backend/src/db/migrate-04.ts
    - backend/src/services/scheduler.ts
    - backend/src/routes/v1/jobs.ts
  modified:
    - backend/src/db/schema.ts
    - backend/src/routes/v1/index.ts
    - backend/src/index.ts

key-decisions:
  - "migrate-04.ts applies SQL migrations idempotently — checks schema_migrations before creating tables, allows repeated server restarts without error"
  - "Scheduler uses shared sqlite instance from db/client.ts (not a new connection) — avoids SQLITE_BUSY, reuses WAL + busy_timeout=30000 config"
  - "executeJob dispatches to porter.py /api/dispatch proxy in plan 04-01 — native TypeScript ai-router.ts is plan 04-02 scope"
  - "Retry backoff: attempt * 30s delay (0s, 30s, 60s) with max 3 attempts — sufficient for this scale without exponential complexity"
  - "SIGINT/SIGTERM handlers call scheduler.stop() before exit — prevents orphaned interval on restart"

patterns-established:
  - "Pattern: Atomic job pickup — UPDATE agent_jobs SET status='running' WHERE id=(SELECT ... WHERE status='pending' AND scheduled_for<=NOW()) RETURNING *"
  - "Pattern: Feature flag guard — if (!featureFlags.agentScheduling) return; at top of tick()"
  - "Pattern: Migration guard — SELECT 1 FROM schema_migrations WHERE id='phase04_...' before applying SQL"

requirements-completed: [AGNT-01]

# Metrics
duration: 5min
completed: 2026-03-21
---

# Phase 4 Plan 01: Job Queue Infrastructure and Scheduler Service Summary

**SQLite job queue with 2s poll scheduler, atomic claim via UPDATE...RETURNING, retry backoff up to 3 attempts, and job CRUD routes at /api/v1/jobs**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-21T03:14:20Z
- **Completed:** 2026-03-21T03:19:26Z
- **Tasks:** 3 (Tasks 1, 2a, 2b)
- **Files modified:** 6

## Accomplishments
- agent_jobs and agent_activity tables defined in Drizzle schema + idempotent SQL migration
- Scheduler service polls every 2s, atomically claims jobs to prevent double-execution, dispatches to porter.py proxy, logs activity events
- Job CRUD routes: GET/POST /api/v1/jobs with status/agent_id filters, POST /api/v1/jobs/:id/cancel
- Scheduler lifecycle wired to Fastify server: start after listen(), stop on SIGINT/SIGTERM
- All 35 Playwright tests pass

## Task Commits

1. **Task 1: Add agent_jobs and agent_activity tables + SQL migration** - `03a074c` (feat)
2. **Task 2a: Build scheduler service** - `9e54877` (feat)
3. **Task 2b: Job CRUD routes, v1 registration, scheduler lifecycle wiring** - `6ea1b4b` (feat)

**Plan metadata:** (to be added in final commit)

## Files Created/Modified
- `backend/src/db/schema.ts` - Added agentJobs, agentActivity table definitions; deadline column on projects
- `backend/src/db/migrate-04.ts` - Idempotent SQL migration for agent_jobs, agent_activity tables and indexes
- `backend/src/services/scheduler.ts` - 2s poll loop, atomic job claim, executeJob dispatch, retry backoff, logActivity
- `backend/src/routes/v1/jobs.ts` - GET/POST /api/v1/jobs, POST /api/v1/jobs/:id/cancel
- `backend/src/routes/v1/index.ts` - Register jobV1Routes at /jobs prefix
- `backend/src/index.ts` - Import migrate-04 + scheduler; call migrate on startup, scheduler.start() after listen, SIGINT/SIGTERM handlers

## Decisions Made
- **Shared sqlite instance for scheduler:** Uses the singleton from db/client.ts rather than opening a new connection. This ensures the same WAL mode and busy_timeout=30000 configuration, preventing SQLITE_BUSY under the 2s poll load.
- **Porter.py proxy for AI dispatch (interim):** Plan 04-01 dispatches via `POST ${porterPyUrl}/api/dispatch`. Plan 04-02 builds the native TypeScript ai-router. This is the correct sequencing per research doc.
- **Retry strategy:** Linear backoff (attempt * 30s, not exponential) — simpler SQL, appropriate for a single-node system at this scale.
- **Migration guard pattern:** Using schema_migrations table (already present from prior phases) to make migrate-04.ts idempotent on every server restart.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - all TypeScript compiled cleanly on first attempt. All 35 Playwright tests passed.

## User Setup Required
None - no external service configuration required. FEATURE_AGENT_SCHEDULING env var controls scheduler activation (defaults to off).

## Next Phase Readiness
- Job queue infrastructure complete — ready for plan 04-02 (native ai-router.ts to replace porter.py proxy dispatch)
- agent_activity table ready for plan 04-04 (activity feed API and UI)
- agent_jobs.parent_agent_id and personas.is_temporary columns ready for plan 04-05 (ephemeral agents)
- Feature flag `agentScheduling` is the kill switch — safe to enable incrementally per environment

## Self-Check: PASSED

- FOUND: backend/src/db/migrate-04.ts
- FOUND: backend/src/services/scheduler.ts
- FOUND: backend/src/routes/v1/jobs.ts
- FOUND: commit 03a074c (Task 1)
- FOUND: commit 9e54877 (Task 2a)
- FOUND: commit 6ea1b4b (Task 2b)

---
*Phase: 04-agent-autonomy*
*Completed: 2026-03-21*
