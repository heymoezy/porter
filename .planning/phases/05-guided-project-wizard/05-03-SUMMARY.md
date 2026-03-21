---
phase: "05"
plan: "03"
subsystem: backend
tags: [activity-feed, sse, real-time, scheduler, api]
dependency_graph:
  requires: ["05-01"]
  provides: ["GET /api/v1/projects/:id/activity", "SSE emission from logActivity"]
  affects: ["05-04 (dashboard frontend will consume this endpoint)"]
tech_stack:
  added: []
  patterns: ["raw sqlite.prepare() LEFT JOIN for multi-table activity query", "fire-and-forget SSE emission with AbortSignal.timeout"]
key_files:
  created: []
  modified:
    - backend/src/routes/v1/projects.ts
    - backend/src/services/scheduler.ts
decisions:
  - "SSE emission is best-effort — .catch() swallows all errors, never blocks scheduler"
  - "AbortSignal.timeout(2000) prevents slow porter.py SSE bus from stalling scheduler tick"
  - "config import re-added to scheduler.ts (was removed in Phase 4 plan 05) for porterPyUrl"
  - "agent:activity SSE emitted after markJobComplete (in executeJob) for job completion events"
  - "project:activity SSE emitted inside logActivity after every DB insert — covers all event types"
metrics:
  duration: "3min"
  completed: "2026-03-21"
  tasks: 2
  files_modified: 2
---

# Phase 05 Plan 03: Project Activity Feed API + SSE Wiring Summary

**One-liner:** Paginated GET /api/v1/projects/:id/activity endpoint with LEFT JOIN agent names + best-effort SSE emission from scheduler logActivity for real-time dashboard updates.

## What Was Built

### Task 1: Activity Feed Endpoint

Added `GET /:id/activity` to `projectV1Routes` in `backend/src/routes/v1/projects.ts`:
- Verifies project exists (404 guard) before querying activity
- Raw `sqlite.prepare()` with `LEFT JOIN personas` — consistent with Phase 4 activity endpoint pattern (Drizzle lacks multi-table join fluency)
- Pagination via `limit` (max 200, default 50) and `offset` query params
- Results ordered `created_at DESC` (newest first)
- Each event includes: `id`, `agent_id`, `agent_name`, `agent_role`, `agent_avatar`, `job_id`, `event_type`, `summary`, `detail` (JSON-parsed), `created_at`
- Total count returned alongside events for frontend pagination

### Task 2: SSE Emission from Scheduler

Added `emitSSE()` async helper and wired it into `logActivity` + `executeJob` in `backend/src/services/scheduler.ts`:
- `emitSSE()` POSTs to `porter.py /api/events/emit` with `AbortSignal.timeout(2000)` — 2s hard limit prevents scheduler blocking
- `logActivity` emits `project:activity` event after every DB insert (all event types: job_started, job_complete, job_failed, agent_retired, etc.)
- `executeJob` additionally emits `agent:activity` event after `markJobComplete` for job completion
- All `.catch(() => {})` — SSE emission is fire-and-forget, never blocks the scheduler tick
- `config` import re-added to scheduler.ts (was removed in Phase 4 plan 05 per STATE.md decision)

## Verification

- TypeScript: zero errors (`npx tsc --noEmit`)
- Playwright: 35/35 tests pass

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `backend/src/routes/v1/projects.ts` exists and contains `/:id/activity`: confirmed
- `backend/src/services/scheduler.ts` exists and contains `async function emitSSE`: confirmed
- Task 1 commit `2013233` exists: confirmed
- Task 2 commit `c83aaec` exists: confirmed
