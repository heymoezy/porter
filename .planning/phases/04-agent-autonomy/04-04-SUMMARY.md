---
phase: 04-agent-autonomy
plan: 04
subsystem: api
tags: [sqlite, fastify, agents, activity-log, scheduler, ai-router]

# Dependency graph
requires:
  - phase: 04-agent-autonomy plan 01
    provides: scheduler.ts with logActivity(), agent_jobs and agent_activity tables
  - phase: 04-agent-autonomy plan 02
    provides: ai-router.ts with dispatch() function and smart model selection
provides:
  - GET /api/v1/agents/:id/activity — paginated chronological activity feed
  - GET /api/v1/agents/:id/jobs — agent job queue with optional status filter
  - Scheduler executeJob uses AI router dispatch (smart model selection + porter.py fallback)
affects: [05-project-wizard, frontend-agents]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Raw sqlite instance for JOIN queries in routes (alongside Drizzle for simple CRUD)
    - formatActivity helper mirrors formatAgent pattern for consistent serialization
    - Scheduler dispatches via ai-router — porter.py proxy is last-resort inside ai-router, not called directly

key-files:
  created: []
  modified:
    - backend/src/routes/v1/agents.ts
    - backend/src/services/scheduler.ts

key-decisions:
  - "Activity endpoint uses raw sqlite.prepare() for LEFT JOIN with agent_jobs — Drizzle lacks multi-table join fluency for this query"
  - "Stored result capped at 2000 chars in scheduler to prevent unbounded DB growth"
  - "config import removed from scheduler — only featureFlags needed after ai-router integration"

patterns-established:
  - "ActivityRow interface + formatActivity() for consistent activity serialization"
  - "Paginated list endpoints: limit capped at 200, offset from query params, total count returned"

requirements-completed: [AGNT-01, AGNT-03]

# Metrics
duration: 5min
completed: 2026-03-21
---

# Phase 04 Plan 04: Activity Log API and AI Router Integration Summary

**Activity feed endpoint (GET /api/v1/agents/:id/activity) with pagination plus scheduler dispatch wired through AI router for intelligent model selection**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-21T03:22:37Z
- **Completed:** 2026-03-21T03:28:31Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- GET /api/v1/agents/:id/activity returns chronological feed with LEFT JOIN on agent_jobs for trigger context, paginated via limit/offset
- GET /api/v1/agents/:id/jobs returns agent job queue with optional status filter
- Scheduler executeJob now dispatches through ai-router.dispatch() — smart model selection (cheap/strong), porter.py proxy as last resort inside ai-router
- Activity log entries record which model handled each job (model name + routing reason)
- All 35 Playwright regression tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add GET /api/v1/agents/:id/activity and /jobs endpoints** - `de572ab` (feat)
2. **Task 2: Integrate AI router into scheduler executeJob** - `43bce37` (feat — committed as part of plan 04-03 overlap)

**Plan metadata:** committed in docs commit below

## Files Created/Modified
- `backend/src/routes/v1/agents.ts` - Added ActivityRow type, formatActivity helper, GET /:id/activity, GET /:id/jobs endpoints; sqlite raw instance imported alongside db
- `backend/src/services/scheduler.ts` - executeJob uses aiRouterDispatch() instead of direct fetch; config import removed; model+routingReason recorded in activity log

## Decisions Made
- Activity endpoint uses raw `sqlite.prepare()` with LEFT JOIN — Drizzle ORM lacks fluent multi-table join support for this pattern
- Stored job result capped at 2000 chars to prevent unbounded growth in agent_jobs.result
- `config` import dropped from scheduler since porterPyUrl is now handled inside ai-router

## Deviations from Plan

### Overlap with Plan 04-03

**1. [Plan overlap] scheduler.ts AI router wiring pre-committed by plan 04-03**
- **Found during:** Task 2 (Integrate AI router into scheduler)
- **Issue:** Plan 04-03 ran concurrently and committed the `aiRouterDispatch` import into scheduler.ts as part of its deadline trigger wiring. The `executeJob` body still had the old `config.porterPyUrl` fetch when 04-04 started, requiring the fix.
- **Fix:** Applied the executeJob body replacement as planned — the working tree already had the correct imports. The final committed state in 43bce37 includes both deadline trigger wiring (04-03) and ai-router dispatch (04-04 scope).
- **Verification:** `grep -c "porterPyUrl" scheduler.ts` returns 0; `grep "aiRouterDispatch"` shows import and usage.

---

**Total deviations:** 1 (plan overlap — no net impact, all success criteria met)
**Impact on plan:** Both tasks implemented correctly. Success criteria fully satisfied.

## Issues Encountered
- Plan 04-03 ran concurrently and committed partial changes to scheduler.ts, requiring careful diff verification before applying Task 2 changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Activity log API ready for frontend agent detail views
- Scheduler fully wired to AI router — ready for end-to-end agent job execution testing
- Phase 05 (project wizard) can use agent scheduling infrastructure with confidence

---
*Phase: 04-agent-autonomy*
*Completed: 2026-03-21*
