---
phase: 42-task-decomposition-engine
plan: 02
subsystem: task-decomposition
tags: [tde, planner, executor, dag, parallel, sse, postgresql, llm]
dependency_graph:
  requires:
    - task_nodes PostgreSQL table (42-01)
    - TDE TypeScript types (42-01)
    - routingEngine (Phase 20)
    - broadcast/sse-hub (existing)
    - pool/db-client (existing)
  provides:
    - planTasks() — LLM-driven DAG generation with validation
    - validateDAG() — cycle detection, bounds, ref checks
    - insertTaskTree() — transactional task_nodes insertion
    - executeTaskTree() — parallel DAG execution loop
    - markReadyTasks() — ready-task query with dep completion check
    - getTreeStats() — per-status counts for a tree
  affects:
    - backend/src/services/task-decomposition/task-planner.ts (new)
    - backend/src/services/task-decomposition/dag-executor.ts (new)
    - backend/src/__tests__/task-planner.test.ts (new)
    - backend/src/__tests__/dag-executor.test.ts (new)
tech_stack:
  added: []
  patterns:
    - Kahn's algorithm for DAG cycle detection (topological sort via in-degree BFS)
    - Promise.allSettled for parallel subtask dispatch
    - NOT EXISTS correlated subquery for ready-task detection
    - LLM retry with error feedback on validation failure
    - SSE broadcast for every task state transition
    - JSONB dependency arrays with context propagation
key_files:
  created:
    - backend/src/services/task-decomposition/task-planner.ts
    - backend/src/services/task-decomposition/dag-executor.ts
    - backend/src/__tests__/task-planner.test.ts
    - backend/src/__tests__/dag-executor.test.ts
  modified: []
decisions:
  - "validateDAG uses Kahn's algorithm (in-degree BFS) — detects all cycle types including self-deps and N-node rings"
  - "planTasks prefers ollama (cheap) with graceful fallback to any gateway — keeps decomposition low-cost"
  - "insertTaskTree uses pool.connect() + BEGIN/COMMIT transaction — atomicity for root+subtasks insertion"
  - "dispatchSubtask loads dep results from completed rows for LLM context injection"
  - "handleFailure: attempt < maxAttempts-1 retries, else marks failed; >50% tree failed triggers cancelTree"
  - "propagateResult uses JSONB @> containment operator to find tasks depending on completed task"
  - "executeTaskTree breaks on empty ready+pending+running rather than waiting — caller manages sequencing"
metrics:
  duration_seconds: 317
  completed_date: "2026-04-03"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 0
---

# Phase 42 Plan 02: Task Decomposition Engine Core Summary

**One-liner:** LLM-driven task planner with Kahn's algorithm DAG validation + parallel DAG executor with retry/cancel logic and SSE progress events.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Build task planner with LLM DAG generation and validation | 798c4e1 | task-planner.ts, task-planner.test.ts |
| 2 | Build DAG executor with parallel dispatch and failure handling | 60cfa89 | dag-executor.ts, dag-executor.test.ts |

## What Was Built

### Task Planner (`task-planner.ts`)

**`validateDAG(tasks: PlannedTask[]): { valid: boolean; error?: string }`**
- Count bounds: rejects < 2 or > 7 tasks
- Self-dependency check: rejects `deps: [ownId]`
- Out-of-range dep check: all dep localIds must exist in the plan
- Cycle detection via Kahn's algorithm: builds in-degree map, BFS from zero-degree nodes, cycle exists if processed < tasks.length

**`planTasks(request: PlanRequest): Promise<PlanResult>`**
- Builds planner prompt with user message + available agents list
- Dispatches via routingEngine (forceGatewayType: 'ollama', falls back to any)
- Parses JSON response with markdown fence stripping
- Validates result with validateDAG — retries once with error feedback appended
- Throws `Planner failed to produce valid DAG` after second invalid response

**`insertTaskTree(rootId, plan, request): Promise<TaskNode[]>`**
- Generates UUID for each planned task, builds localId→UUID map
- Maps dep localIds to UUID references
- Single transaction: BEGIN → INSERT root (depth=0, status=running) → INSERT subtasks (depth=1, status=pending) → COMMIT
- Returns all created TaskNode objects

### DAG Executor (`dag-executor.ts`)

**`getTreeStats(rootId): Promise<DAGStats>`**
- `SELECT status, COUNT(*)::int FROM task_nodes WHERE root_id=$1 AND depth > 0 GROUP BY status`
- Fills missing statuses with 0

**`markReadyTasks(rootId): Promise<TaskNode[]>`**
- `UPDATE ... SET status='ready' WHERE status='pending' AND NOT EXISTS (dep where status != 'completed') RETURNING *`
- Uses the spec's correlated subquery pattern with `jsonb_array_elements_text`

**`executeTaskTree(rootId): Promise<void>`**
1. markReadyTasks → find newly ready tasks
2. getTreeStats → break if pending=ready=running=0
3. Cap batch at MAX_CONCURRENT (3)
4. Mark each batch task as running, broadcast `task:started`
5. `Promise.allSettled(batch.map(t => dispatchSubtask(t)))` — parallel dispatch
6. Fulfilled → mark completed, broadcast `task:completed`, propagateResult
7. Rejected → handleFailure (retry or fail)
8. Broadcast `decomposition:progress` with stats
9. Safety check: TREE_TIMEOUT_MS (5 min) → cancelTree on timeout

**`handleFailure(task, error): Promise<void>`**
- `attempt < maxAttempts - 1`: reset to pending, increment attempt, broadcast `task:retry`
- `attempt >= maxAttempts - 1`: mark failed, broadcast `task:failed`, check 50% threshold → cancelTree

**`propagateResult(taskId, result): Promise<void>`**
- Finds all tasks with `dependencies @> '[taskId]'::jsonb`
- Merges result into each task's context JSONB for downstream use

**SSE events emitted:**
- `decomposition:started` — when executeTaskTree begins
- `task:started` — when task enters running state
- `task:completed` — when task dispatches successfully
- `task:failed` — when task exhausts retries
- `task:retry` — when task is reset for retry
- `decomposition:progress` — after each batch with stats
- `decomposition:cancelled` — when tree is cancelled (timeout or >50% failure)

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Minor adjustments

- `handleFailure` checks `attempt < maxAttempts - 1` (not `< maxAttempts`) to correctly use MAX_RETRIES=3 meaning "3 total attempts" (0, 1, 2) not "3 extra retries" — consistent with TaskNode.maxAttempts semantics
- `executeTaskTree` breaks on empty ready list even if running > 0, per the synchronous loop design; the function is designed to be called by a higher-level coordinator (plan 03/04 will wire this into the stream dispatch path)
- Added `decomposition:cancelled` SSE event (not explicitly named in plan spec but required for observability of the cancelTree path)
- `propagateResult` exported as an internal function but not in the public export surface — callers use executeTaskTree which handles propagation

## Verification

```
✓ npx tsc --noEmit — zero type errors
✓ validateDAG tests: 10/10 pass (cycle detection, count bounds, dep validation, self-dep)
✓ dag-executor module exports: executeTaskTree, markReadyTasks, getTreeStats all exported
✓ Kahn's algorithm: topological sort detects 2-node and N-node cycles
✓ Promise.allSettled: parallel dispatch (3 occurrences in file)
✓ broadcast: 10 calls — all 7 SSE event types covered
✓ MAX_CONCURRENT, TREE_TIMEOUT_MS: referenced in executor loop
✓ BEGIN/COMMIT transaction: 2 occurrences in task-planner.ts
✓ routingEngine: used by both planner (5x) and executor (3x)
```

## Self-Check: PASSED
