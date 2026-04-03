---
phase: 41-session-intelligence
plan: 02
subsystem: api
tags: [postgres, fts, tsvector, ts_rank, ts_headline, websearch_to_tsquery, fastify]

# Dependency graph
requires:
  - phase: 41-01
    provides: search_vector tsvector column + GIN index on agent_messages, trigger for auto-population

provides:
  - searchSessions() FTS service querying agent_messages.search_vector with ts_rank ordering
  - countSessionSearchResults() for pagination
  - GET /api/v1/sessions/search endpoint with q/agent_id/limit/offset params

affects:
  - 41-03
  - memory-injection
  - agent dispatch context

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "websearch_to_tsquery FTS pattern matching existing concepts table search in memory-injection.ts"
    - "ts_headline with StartSel=<< StopSel=>> for searchable excerpt highlighting"
    - "CROSS JOIN-style query using websearch_to_tsquery inline in WHERE + rank columns"

key-files:
  created:
    - backend/src/services/session-search.ts
    - backend/src/routes/v1/sessions.ts
  modified:
    - backend/src/routes/v1/index.ts

key-decisions:
  - "Route registered in v1 barrel (v1/index.ts) not directly in backend/src/index.ts — matches all other v1 routes"
  - "No auth required on /api/v1/sessions/search — internal API, consistent with other v1 endpoints"
  - "CROSS JOIN removed in favour of inlining websearch_to_tsquery($1) call — avoids subquery complexity"

patterns-established:
  - "Pool.query<RowType>(sql, params) for raw FTS queries — Drizzle ORM cannot express ts_rank/ts_headline"
  - "Optional agent filter appended as string fragment with conditional $N param slot"

requirements-completed: [SIN-02]

# Metrics
duration: 4min
completed: 2026-04-03
---

# Phase 41 Plan 02: Cross-Session FTS Search Summary

**PostgreSQL FTS search across agent_messages via websearch_to_tsquery, ts_rank ordering, and ts_headline excerpts exposed at GET /api/v1/sessions/search**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-03T09:53:14Z
- **Completed:** 2026-04-03T09:57:25Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `session-search.ts` service with `searchSessions()` and `countSessionSearchResults()` using PostgreSQL websearch_to_tsquery against the GIN-indexed `agent_messages.search_vector` column from Plan 41-01
- Results ranked by `ts_rank`, excerpts highlighted with `<<match>>` markers via `ts_headline`
- Optional `agentId` filter narrows search to from_agent/to_agent; LEFT JOIN `session_registry` adds session metadata context
- Registered `GET /api/v1/sessions/search?q=keyword&agent_id=X&limit=N&offset=M` endpoint returning `{ ok, query, total, limit, offset, results[] }`
- 400 guard on missing/empty `q` parameter; limit capped at 100

## Task Commits

1. **Task 1: Cross-session search service** - `c33ff65` (feat)
2. **Task 2: REST endpoint + route registration** - `dc8a8d0` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `backend/src/services/session-search.ts` - FTS search service: searchSessions() + countSessionSearchResults()
- `backend/src/routes/v1/sessions.ts` - GET /sessions/search Fastify route handler
- `backend/src/routes/v1/index.ts` - Added sessionsV1Routes registration under /sessions prefix

## Decisions Made

- **v1 barrel vs index.ts:** Plan specified registration in `backend/src/index.ts` but all v1 routes go through the `v1/index.ts` barrel. Followed the actual codebase pattern — route is correctly accessible at `/api/v1/sessions/search`.
- **No auth:** Consistent with other v1 endpoints; internal API, no auth required for now.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Route registered in v1/index.ts barrel, not backend/src/index.ts**
- **Found during:** Task 2 (REST endpoint + route registration)
- **Issue:** Plan said to register in backend/src/index.ts, but the codebase routes all v1 endpoints through `backend/src/routes/v1/index.ts` barrel. Direct registration in backend/src/index.ts would have been an architectural inconsistency.
- **Fix:** Imported and registered `sessionsV1Routes` in `v1/index.ts` with prefix `/sessions`, producing the correct final path `/api/v1/sessions/search`.
- **Files modified:** backend/src/routes/v1/index.ts
- **Verification:** `curl http://127.0.0.1:3001/api/v1/sessions/search?q=test` returns `{"ok":true,...}` with ranked results.
- **Committed in:** dc8a8d0 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - architecture alignment)
**Impact on plan:** Deviation was necessary for consistency with project architecture. Endpoint works correctly at the specified URL.

## Issues Encountered

None — build clean, endpoint live on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Cross-session FTS search is live and queryable
- `searchSessions()` is ready for agents to call via dispatch (Plan 41-03 can wire the `_recall_prior_work` injection)
- Pagination (limit/offset + total count) ready for any admin UI integration
- Search vector column must be populated via the Plan 41-01 trigger — new messages auto-populate; historic messages may need backfill if empty

---
*Phase: 41-session-intelligence*
*Completed: 2026-04-03*

## Self-Check: PASSED

- FOUND: backend/src/services/session-search.ts
- FOUND: backend/src/routes/v1/sessions.ts
- FOUND: .planning/phases/41-session-intelligence/41-02-SUMMARY.md
- FOUND commit: c33ff65 (feat: cross-session search service)
- FOUND commit: dc8a8d0 (feat: sessions search endpoint)
