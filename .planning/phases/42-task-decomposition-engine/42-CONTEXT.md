# Phase 42: Task Decomposition Engine - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Complex requests are classified and decomposed into a dependency DAG. DAG executor dispatches ready tasks in parallel via Bridge, respects dependencies, handles failures with retry/replan/escalate. Final synthesis combines results. Admin can inspect any decomposed task.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion. Key areas:
- task_nodes table schema (id, parent_id, dag_id, status, dependencies[], output)
- Classifier: simple heuristic first (code blocks, multi-step keywords, length), LLM fallback for ambiguous
- Planner: use cheapest model (Ollama or Haiku) to generate DAG from complex request
- Executor: poll-based ready-task finder (dependencies satisfied → dispatch)
- Joiner: synthesis via LLM call combining subtask outputs
- Failure handling: retry count, replan trigger, escalation to user

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- research/task-decomposition-engine.md — full design spec (645 lines) with SQL schema, service modules, integration points
- backend/src/services/bridge/routing-engine.ts — dispatchWithQueue for sending work
- backend/src/services/bridge/task-executor.ts — CLI task execution
- backend/src/services/bridge/http-task-executor.ts — HTTP agent loop
- backend/src/routes/v1/tasks.ts — task dispatch endpoint

### Integration Points
- Classifier sits in front of chat dispatch (chat.ts) — decides direct vs decompose
- Planner generates task_nodes rows with dependency edges
- Executor queries ready tasks and dispatches via Bridge task dispatch
- Joiner synthesizes or replans based on subtask outcomes
- SSE events for decomposition progress

</code_context>

<specifics>
No specific requirements.
</specifics>

<deferred>
None
</deferred>
