---
phase: 42-task-decomposition-engine
plan: "03"
subsystem: task-decomposition
tags: [tde, joiner, synthesis, orchestration, chat-integration, sse]
dependency_graph:
  requires: ["42-02"]
  provides: ["joinResults", "decomposeAndExecute", "chat-classifier-gate"]
  affects: ["backend/src/routes/v1/chat.ts", "backend/src/services/task-decomposition/"]
tech_stack:
  added: []
  patterns: ["fire-and-forget async pipeline", "classifier gate with fail-safe fallback", "LLM synthesis with routingEngine"]
key_files:
  created:
    - backend/src/services/task-decomposition/task-joiner.ts
    - backend/src/services/task-decomposition/decomposition-engine.ts
    - backend/src/__tests__/task-joiner.test.ts
  modified:
    - backend/src/routes/v1/chat.ts
decisions:
  - "joinResults uses 4-path decision tree: all complete -> synthesized, all failed -> failed, >50% complete -> partial, >50% failed -> replan"
  - "decomposeAndExecute returns immediately after insertTaskTree; pipeline runs fire-and-forget to avoid blocking SSE response"
  - "Classifier gate wrapped in double try/catch: outer catches classifier errors, inner catches decomposeAndExecute errors — both fall through to direct dispatch"
  - "Synthesis temperature 0.5: balanced between creativity and accuracy"
  - "v1 replan: marks root as failed with replan note; no automatic re-execution (bounded replan prevents infinite loops)"
metrics:
  duration_seconds: 355
  completed_date: "2026-04-03"
  tasks_completed: 2
  files_changed: 4
requirements: [TDE-04, TDE-05]
---

# Phase 42 Plan 03: Task Joiner + Engine Entry Point + Chat Integration Summary

**One-liner:** LLM synthesis joiner (4-path decision tree) + decomposeAndExecute orchestrator with fire-and-forget pipeline + classifier gate in chat /stream endpoint.

## What Was Built

### task-joiner.ts
Synthesizes completed subtask outputs into a coherent user-facing response. Four decision paths:
1. `synthesized` — all tasks completed, LLM builds unified reply from results
2. `partial` — >50% complete, synthesis includes failure notes + next steps
3. `replan` — >50% failed, triggers replanning signal (no synthesis attempted)
4. `failed` — all tasks failed, error summary returned

Uses `routingEngine.select()` + `dispatchWithQueue()` for synthesis LLM call. Temperature 0.5. Maps DB rows to TaskNode interface before processing.

### decomposition-engine.ts
Single orchestration entry point for the full TDE pipeline. `decomposeAndExecute(message, opts)`:
- Loads available agents from `personas` table (best-effort, empty array is fine)
- Calls `planTasks()` to generate LLM DAG
- Calls `insertTaskTree()` (transactional root + subtasks insert)
- Broadcasts `decomposition:started` SSE with task summary
- Fires-and-forgets the execute → join → save pipeline
- Returns `{ rootId, taskCount }` immediately

Fire-and-forget pipeline: `executeTaskTree()` → `joinResults()` → update root node → save to `chat_messages` (if chatId) → broadcast `decomposition:complete`.

SSE events broadcast: `decomposition:started`, `decomposition:replan`, `decomposition:complete`, `decomposition:failed`.

### chat.ts — classifier gate
Inserted before `selectStreamBackend`, after memory injection block. Double fail-safe:
- Outer try/catch: classifier error → fall through to direct dispatch
- Inner try/catch: decompose error → fall through to direct dispatch

Complex messages receive immediate SSE ack (`[Decomposing into N subtasks...]`) + `done` event. The engine then streams progress via SSE. Simple messages route unchanged through existing direct dispatch.

## Tests

6 tests in `backend/src/__tests__/task-joiner.test.ts` — all pass:
- Decision tree: synthesized, partial, replan, failed paths
- Synthesis prompt includes original request + task results
- Partial synthesis includes failure notes + next steps suggestion

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `backend/src/services/task-decomposition/task-joiner.ts` exists
- [x] `backend/src/services/task-decomposition/decomposition-engine.ts` exists
- [x] `backend/src/routes/v1/chat.ts` has `classify` import
- [x] `backend/src/routes/v1/chat.ts` has `decomposeAndExecute` call
- [x] `npx tsc --noEmit` zero errors
- [x] `npm run build` clean
- [x] Service restarted: health returns `{"status":"ok","version":"5.2.0"}`
- [x] All acceptance criteria met (grep counts all ≥ required minimums)
