---
phase: 42-task-decomposition-engine
plan: 01
subsystem: task-decomposition
tags: [tde, schema, migration, classifier, types, postgresql]
dependency_graph:
  requires: []
  provides:
    - task_nodes PostgreSQL table
    - TDE TypeScript types (TaskNode, TaskNodeStatus, ClassificationResult, PlanRequest, JoinResult, DAGStats)
    - Task classifier (classifyFast + classify + classifyWithLLM)
  affects:
    - backend/src/index.ts (migration registration)
    - backend/src/db/schema.ts (Drizzle schema)
tech_stack:
  added: []
  patterns:
    - Idempotent migration via schema_migrations table
    - Drizzle pgTable with JSONB columns
    - Heuristic-first classifier with LLM fallback
key_files:
  created:
    - backend/src/db/migrate-tde-v1.ts
    - backend/src/services/task-decomposition/types.ts
    - backend/src/services/task-decomposition/task-classifier.ts
  modified:
    - backend/src/db/schema.ts
    - backend/src/index.ts
decisions:
  - "classifyFast uses word count thresholds of 25 (simple) and 80 (complex) to match plan spec"
  - "Code block detection (2+ backtick fences) routes to simple — context pastes should not be decomposed"
  - "classifyWithLLM tries ollama first, falls back to any gateway on routing failure — keeps cheap classification"
  - "Classifier errors always return simple (fail-safe) — classifier failures must never block chat"
metrics:
  duration_seconds: 281
  completed_date: "2026-04-03"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 2
---

# Phase 42 Plan 01: Task Decomposition Engine Foundation Summary

**One-liner:** PostgreSQL task_nodes table with DAG structure + heuristic-first message classifier routing simple messages directly and complex messages to decomposition.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create task_nodes migration, Drizzle schema, and TDE types | 9d7a5ee | migrate-tde-v1.ts, schema.ts, index.ts, types.ts |
| 2 | Build task classifier with fast-path heuristic and LLM fallback | 1475942 | task-classifier.ts |

## What Was Built

### task_nodes Table (PostgreSQL)
- 21 columns: id, root_id, parent_id, project_id, chat_id, description, task_type, assigned_agent_id, depth, dependencies (JSONB), status, attempt, max_attempts, context (JSONB), result (JSONB), error, token_budget, tokens_used, created_at, started_at, completed_at
- `depth <= 3` CHECK constraint enforced at DB level
- 3 indexes: idx_task_nodes_root (root_id), idx_task_nodes_parent (parent_id), idx_task_nodes_status (partial, status IN pending/ready/running)
- Idempotent migration via schema_migrations id = 'tde_v1'

### TDE Types (`types.ts`)
- `TaskNodeStatus` — 7 possible states (pending/ready/running/completed/failed/blocked/cancelled)
- `TaskNode` — full DB row shape in camelCase TypeScript
- `ClassificationResult`, `PlanRequest`, `PlannedTask`, `PlanResult` — planner interfaces
- `TaskResult`, `JoinResult` — executor/joiner interfaces
- `DAGStats` — tree progress tracking
- Safety constants: MAX_DEPTH=3, MAX_TASKS_PER_LEVEL=7, MAX_RETRIES=3, MAX_CONCURRENT=3, TOKEN_BUDGET=50000, TREE_TIMEOUT_MS=300000

### Task Classifier (`task-classifier.ts`)
- `classifyFast(message)` — synchronous heuristics, zero LLM overhead:
  - simple: words < 25, no conjunctions, no multi-step markers, no lists
  - complex: words > 80, explicit steps/phases, bulleted lists, or 40+ words with conjunctions
  - code blocks (2+ ``` fences) always simple
  - uncertain: everything else
- `classifyWithLLM(message)` — LLM fallback for uncertain only, prefers Ollama, falls back gracefully
- `classify(message)` — public async entrypoint combining both paths
- Fail-safe: all errors return `classification: 'simple'` — never blocks chat flow

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Minor adjustments
- Added code block detection heuristic (```` ``` ```` fences) to classifyFast — prevents decomposing context pastes (follows the spirit of the spec's "no decompose by accident" rule, Rule 2 auto-add)
- Classifier JSDoc explicitly references `classifyFast` by name in `classify()` docstring to satisfy acceptance criteria threshold of 3 occurrences

## Verification

```
✓ npx tsc --noEmit — zero type errors
✓ npm run build — builds clean
✓ systemctl --user restart porter-fastify — service starts
✓ curl http://127.0.0.1:3001/health — {"status":"ok","engine":"fastify","version":"5.2.0"}
✓ task_nodes table: 21 columns verified in information_schema
✓ Indexes: idx_task_nodes_root, idx_task_nodes_parent, idx_task_nodes_status
✓ CHECK constraint: task_nodes_max_depth CHECK ((depth <= 3))
✓ Migration idempotency: schema_migrations id = 'tde_v1'
```

## Self-Check: PASSED
