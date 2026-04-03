---
phase: 39-bridge-task-dispatch
plan: 01
subsystem: api
tags: [bridge, task-dispatch, subprocess, cli, postgresql, drizzle, typescript]

# Dependency graph
requires: []
provides:
  - TaskRequest/TaskEvent/TaskDispatchResult/TaskStatus type contracts in bridge/types.ts
  - bridgeTasks Drizzle pgTable schema definition (17 columns)
  - bridge_tasks PostgreSQL table with status + created_at indexes
  - scripts/migrate-bridge-tasks.ts idempotent migration script
  - task-executor.ts: validateCwd, buildTaskArgs, getTaskQueue, executeTask async generator
  - TASK_CAPABLE_TYPES set identifying claude_cli/gemini_cli/codex_cli as task-capable gateways
affects:
  - 39-02 (API routes + adapter task() method depend on these types and executor)
  - 39-03 (admin UI depends on bridge_tasks table and task status types)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - CWD allowlist security gate validates before any subprocess spawn
    - Per-gateway task PQueue singleton (concurrency=1), separate from chat dispatch queues
    - SIGTERM -> 5s -> SIGKILL pattern for both AbortSignal and hard timeout
    - Async generator executeTask yields TaskEvent objects for streaming consumption
    - JSONL readline loop with per-gateway parse logic (Claude accumulator, Gemini message, Codex item.completed)
    - 1MB output cap with truncation notice, continues draining to avoid deadlock

key-files:
  created:
    - backend/src/services/bridge/task-executor.ts
    - scripts/migrate-bridge-tasks.ts
  modified:
    - backend/src/services/bridge/types.ts
    - backend/src/db/schema.ts

key-decisions:
  - "executeTask is a standalone exported async generator, not a class method — simpler, testable, no this binding"
  - "Separate getTaskQueue map from dispatch-queues.ts getQueue — task queues must not share concurrency slots with chat requests"
  - "CWD_ALLOWLIST hardcoded as module constant — security gate not config-driven, intentionally restrictive"
  - "Claude --bare flag included to suppress extraneous output (headers, footers) in task mode"
  - "migration script lives in scripts/ root to match plan spec; uses backend/src/db/client.ts pool via relative import"

patterns-established:
  - "Task CLI flags: claude_cli uses --dangerously-skip-permissions + --bare + stdin prompt; gemini_cli uses --yolo + -p positional; codex_cli uses --dangerously-bypass-approvals-and-sandbox + -C cwd + positional"
  - "Output truncation: track outputBytes per dispatch, yield '[output truncated at 1MB]' progress event, set flag to skip further text"

requirements-completed: [BTD-04]

# Metrics
duration: 5min
completed: 2026-04-03
---

# Phase 39 Plan 01: Bridge Task Dispatch Foundation Summary

**TaskRequest/TaskEvent/TaskDispatchResult types, bridgeTasks Drizzle schema + PostgreSQL table, and executeTask async generator with per-gateway CLI flags, CWD allowlist, SIGTERM/SIGKILL abort, and 1MB output cap**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-03T08:00:00Z
- **Completed:** 2026-04-03T08:03:44Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- Added TaskRequest, TaskEvent, TaskDispatchResult, TaskStatus type exports to bridge/types.ts — type contracts Plan 02 and 03 depend on
- Added bridgeTasks pgTable definition (17 columns) to schema.ts — Drizzle schema ready for ORM queries
- Created scripts/migrate-bridge-tasks.ts — idempotent migration ran successfully, bridge_tasks table live in PostgreSQL with 2 indexes
- Created task-executor.ts with validateCwd (allowlist), buildTaskArgs (per-gateway flags), getTaskQueue (concurrency=1 per gateway), executeTask (async generator with SIGTERM/SIGKILL + 1MB cap)

## Task Commits

Each task was committed atomically:

1. **Task 1: Types, schema, migration** - `6ac378a` (feat)
2. **Task 2: TaskExecutor module** - `f7fd231` (feat)

## Files Created/Modified
- `backend/src/services/bridge/types.ts` - Added TaskRequest, TaskEvent, TaskDispatchResult, TaskStatus types
- `backend/src/db/schema.ts` - Added bridgeTasks pgTable definition with 17 columns
- `scripts/migrate-bridge-tasks.ts` - Standalone migration: CREATE TABLE + 2 indexes + schema_migrations record
- `backend/src/services/bridge/task-executor.ts` - Full task executor: validateCwd, buildTaskArgs, getTaskQueue, executeTask

## Decisions Made
- executeTask is a standalone exported async generator (not a class method) — simpler, testable, no this binding needed
- Separate getTaskQueue map from dispatch-queues.ts getQueue — task queues must not share concurrency slots with chat requests
- CWD_ALLOWLIST is a module constant (not config-driven) — security gate needs to be intentionally restrictive
- Claude --bare flag included to suppress headers/footers in task mode output
- Migration script lives in scripts/ root (not backend/scripts/) per plan spec — uses relative import to backend/src/db/client.ts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - migration ran automatically, no external service configuration required.

## Next Phase Readiness
- bridge_tasks table live in PostgreSQL with all expected columns and indexes
- All type contracts exported from types.ts — Plan 02 adapter task() methods can import TaskRequest/TaskDispatchResult directly
- executeTask async generator ready for Plan 02 API route wiring
- No blockers for Plan 02

---
*Phase: 39-bridge-task-dispatch*
*Completed: 2026-04-03*
