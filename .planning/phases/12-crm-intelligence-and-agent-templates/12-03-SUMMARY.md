---
phase: 12-crm-intelligence-and-agent-templates
plan: 03
subsystem: api
tags: [sqlite, fastify, crm, timeline, union-all, pagination]

# Dependency graph
requires:
  - phase: 12-01
    provides: contact_analyses table and schema
  - phase: 11-unified-chat-and-crm-schema
    provides: contacts, messages, conversations, files, file_contacts, contact_conversations, contact_projects tables
provides:
  - GET /api/v1/contacts/:id/timeline route returning unified chronological feed
  - UNION ALL query across messages, project_events, files, and analyses
  - Paginated timeline with total count metadata
affects: [frontend-v2, crm-ui, contact-detail-views]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - UNION ALL with consistent 5-column shape (type, ref_id, detail, created_at, actor)
    - CAST(INTEGER AS TEXT) for UNION ALL type compatibility across heterogeneous tables
    - Subquery SUM for cheap total count across multiple UNION ALL arms

key-files:
  created: []
  modified:
    - backend/src/routes/v1/contacts.ts

key-decisions:
  - "contact_projects has no attached_at column — project_event arm uses p.created_at (project creation time) as the event timestamp"
  - "messages.id is INTEGER so CAST to TEXT is required for UNION ALL type compatibility with other TEXT ref_ids"
  - "Timeline route registered after other sub-routes — Fastify handles 3-segment /:id/timeline vs 2-segment /:id without conflict"
  - "Total count uses 4 separate subquery additions (cheaper than COUNT on full UNION ALL materialization)"

patterns-established:
  - "UNION ALL timeline pattern: each arm emits (type, ref_id, detail, created_at, actor) — consistent shape enables generic frontend rendering"

requirements-completed: [CRM-04]

# Metrics
duration: 8min
completed: 2026-03-22
---

# Phase 12 Plan 03: CRM Intelligence — Contact Activity Timeline Summary

**UNION ALL timeline endpoint aggregating messages, project events, file uploads, and AI analyses into a paginated chronological feed per contact**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-22T08:25:00Z (SGT)
- **Completed:** 2026-03-22T08:33:00Z (SGT)
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments
- Added `GET /api/v1/contacts/:id/timeline` returning a flat chronological array of all four touchpoint types
- UNION ALL query joins across messages (via contact_conversations), project events (via contact_projects), files (via file_contacts), and contact_analyses
- Pagination: limit (default 50, max 200) + offset (default 0) with total count returned for metadata
- 404 response for nonexistent contact

## Task Commits

Each task was committed atomically:

1. **Task 1: Add GET /:id/timeline route with UNION ALL query** - `c56d90e` (feat)

**Plan metadata:** _(see final commit below)_

## Files Created/Modified
- `backend/src/routes/v1/contacts.ts` - Added GET /:id/timeline handler at end of plugin (line 414), after POST /:id/projects

## Decisions Made
- `contact_projects` has only `contact_id` and `project_id` — no `attached_at` column. Used `p.created_at` for the project_event arm timestamp (verified in both schema.ts and migrate-11.ts).
- `messages.id` is INTEGER AUTOINCREMENT (for FTS5 rowid alignment, Phase 11 decision). CAST to TEXT required for UNION ALL type homogeneity.
- Route placed after other /:id/... sub-routes. Fastify resolves /:id/timeline (3-segment) vs /:id (2-segment) correctly — no conflict.

## Deviations from Plan

None - plan executed exactly as written (schema verification confirmed the plan's "IMPORTANT" note: contact_projects has no attached_at, so p.created_at is used as specified in the fallback SQL).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CRM-04 complete. Contact activity timeline is live at GET /api/v1/contacts/:id/timeline.
- Plan 12-04 (agent templates API) is unblocked — no dependencies on this timeline endpoint.
- Frontend can now render a full relationship timeline for any contact in a single API call.

---
*Phase: 12-crm-intelligence-and-agent-templates*
*Completed: 2026-03-22*
