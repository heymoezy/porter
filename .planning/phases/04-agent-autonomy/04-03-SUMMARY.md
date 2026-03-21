---
phase: 04-agent-autonomy
plan: 03
subsystem: backend/event-triggers
tags: [event-triggers, scheduler, agent-jobs, deduplication, file-events]
dependency_graph:
  requires: ["04-01"]
  provides: ["event-triggers-service", "scheduler-deadline-check", "event-notify-endpoint"]
  affects: ["backend/src/services/scheduler.ts", "backend/src/routes/v1/jobs.ts", "backend/src/routes/files.ts"]
tech_stack:
  added: []
  patterns: ["event-subscription from persona config JSON", "60-second dedup window via SQL", "string BETWEEN for ISO date comparison"]
key_files:
  created:
    - backend/src/services/event-triggers.ts
  modified:
    - backend/src/services/scheduler.ts
    - backend/src/routes/v1/jobs.ts
    - backend/src/routes/files.ts
decisions:
  - "60-second dedup window prevents trigger storms; implemented via created_at guard in agent_jobs"
  - "deadline uses string BETWEEN on TEXT ISO dates (not CAST) — lexicographic order matches chronological"
  - "events/notify route registered under /api/v1/jobs prefix — keeps event notification co-located with job management"
  - "Zod v4 requires z.record(z.string(), z.unknown()) — z.record(z.unknown()) is 1-arg and invalid in v4"
metrics:
  duration: 6min
  completed: "2026-03-21"
  tasks: 3
  files: 4
---

# Phase 04 Plan 03: Event Triggers Service Summary

**One-liner:** Event-driven trigger service with file-created, deadline-approaching, and message-received handlers — 60-second dedup, ISO date BETWEEN query, and scheduler integration.

## What Was Built

Three event trigger types backed by the `agent_jobs` queue, with subscriber lookup from persona config JSON and a 60-second deduplication window to prevent trigger storms on bulk operations.

### Files Created

**`backend/src/services/event-triggers.ts`** — New service with 4 exports:
- `getEventSubscribers(eventType, projectId)` — reads `event_subscriptions` from persona config JSON, filters by event type and optional project scope
- `onFileCreated(projectId, filename)` — inserts pending jobs for subscribed agents; gated by `featureFlags.eventTriggers`
- `onMessageReceived(projectId, message, fromUser)` — inserts message-triggered jobs; truncates message at 500 chars for trigger data
- `checkDeadlineTriggers()` — scans projects with TEXT deadline BETWEEN today and tomorrow (ISO string comparison, not CAST); called from scheduler tick

### Files Modified

**`backend/src/services/scheduler.ts`:**
- Added `import { checkDeadlineTriggers } from './event-triggers.js'`
- Added `tickCount` and `DEADLINE_CHECK_INTERVAL = 30` constants
- Updated `tick()` to call `checkDeadlineTriggers()` every 30th tick (every 60s)

**`backend/src/routes/v1/jobs.ts`:**
- Added `import { onFileCreated, onMessageReceived } from '../../services/event-triggers.js'`
- Added `POST /events/notify` endpoint (full path: `POST /api/v1/jobs/events/notify`) for porter.py to call after file uploads
- Accepts `event_type: 'file-created' | 'message-received'`, `project_id`, and optional `data` payload

**`backend/src/routes/files.ts`:**
- Added `import { onFileCreated } from '../services/event-triggers.js'`
- Added `action='create'` branch that calls `onFileCreated(projectId, filename)` when `project_id` is provided
- Added doc comment explaining the porter.py upload gap and bridge strategy

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zod v4 z.record() requires two arguments**
- **Found during:** Task 2
- **Issue:** `z.record(z.unknown())` is invalid in Zod v4 — requires both key and value type arguments
- **Fix:** Changed to `z.record(z.string(), z.unknown())` in the notifySchema definition
- **Files modified:** `backend/src/routes/v1/jobs.ts`
- **Commit:** 43bce37

## Architecture Notes

- **Subscriber lookup:** Reads all non-retired personas in one query, filters in-memory by parsing config JSON. Acceptable at current scale; a DB index on config JSON would be needed at 10K+ agents.
- **Dedup mechanism:** SQL `AND created_at > unixepoch('now') - 60` on `agent_jobs` table — no separate dedup table needed.
- **Porter.py bridge:** `/api/files/upload` remains in porter.py for now. Porter.py should call `POST /api/v1/jobs/events/notify` with `{"event_type": "file-created", "project_id": "...", "data": {"filename": "..."}}` after each successful upload. This is documented in the route handler comment.
- **Deadline query:** Uses `deadline BETWEEN @today AND @tomorrow` on TEXT columns — ISO dates are lexicographically ordered so string comparison is equivalent to date comparison.

## Verification Results

- TypeScript compiles cleanly: PASS
- 35 Playwright tests: 35/35 PASS
- 4 exported functions in event-triggers.ts: PASS
- `onFileCreated` in files.ts: PASS
- `BETWEEN @today AND @tomorrow` in event-triggers.ts: PASS

## Self-Check

Files exist:
- `backend/src/services/event-triggers.ts`: FOUND
- `backend/src/services/scheduler.ts` (modified): FOUND
- `backend/src/routes/v1/jobs.ts` (modified): FOUND
- `backend/src/routes/files.ts` (modified): FOUND

Commits:
- d7ac150: feat(04-03): add event-triggers service
- 43bce37: feat(04-03): wire deadline check into scheduler tick and add event notify endpoint
- 019ad73: feat(04-03): wire onFileCreated into Fastify file route POST handler
