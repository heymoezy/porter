# Task Decomposition Engine — Implementation Plan

> **Status:** Research complete, ready for review
> **Author:** Claude Code (research session 2026-03-26)
> **For:** Moe
> **Scope:** Porter Brain (Fastify backend)

---

## The Problem

Porter can delegate 1-3 tasks to workers via `gsd_dispatch` (wizard.ts:398-494), but:

1. **No recursive decomposition** — one level only, no subtask trees
2. **No dependency tracking** — all tasks fire in parallel, no "A before B"
3. **No follow-up** — Porter dispatches and walks away, never checks results
4. **No synthesis** — subtask results don't bubble back up to a final answer
5. **No complexity assessment** — same logic for "change the button color" and "build a payment system"
6. **No replanning on failure** — if a subtask fails, the whole dispatch is dead

## The Solution

A **Plan-and-Execute engine** where Porter:

1. Receives a complex idea
2. Assesses complexity (simple → direct answer, complex → decompose)
3. Generates a **task DAG** (directed acyclic graph) with dependencies
4. Executes tasks in dependency order, parallelizing where possible
5. Monitors progress, retries failures, replans when needed
6. Synthesizes results back into a coherent response

---

## Architecture Overview

```
User sends message
        |
        v
  ┌─────────────┐
  │  CLASSIFIER  │  "Is this simple or complex?"
  └──────┬───────┘
         |
    simple|         complex
         |              |
         v              v
  ┌──────────┐   ┌──────────┐
  │  DIRECT  │   │ PLANNER  │  "Break into subtasks with deps"
  │  ANSWER  │   └────┬─────┘
  └──────────┘        |
                      v
               ┌──────────┐
               │ EXECUTOR  │  "Run ready tasks, track progress"
               └────┬─────┘
                    |
                    v  (all tasks done or failure)
               ┌──────────┐
               │  JOINER   │  "Synthesize or replan"
               └──────────┘
```

---

## Data Model

### New table: `task_nodes`

Replaces the flat `tasks` table for decomposition work. The existing `tasks` table stays for user-visible project tasks — `task_nodes` is the internal execution graph.

```sql
CREATE TABLE task_nodes (
  id            TEXT PRIMARY KEY,           -- UUID
  root_id       TEXT NOT NULL,              -- top-level task (self-referencing for root)
  parent_id     TEXT,                       -- immediate parent task_node
  project_id    TEXT,                       -- optional project context
  chat_id       TEXT,                       -- chat that triggered this

  -- Task definition
  description   TEXT NOT NULL,              -- what to do
  task_type     TEXT DEFAULT 'general',     -- classify for routing: research, code, review, etc.
  assigned_agent_id TEXT,                   -- which worker executes this

  -- DAG structure
  depth         INTEGER DEFAULT 0,          -- 0 = root, 1 = first decomposition, etc.
  dependencies  JSONB DEFAULT '[]',         -- array of task_node IDs that must complete first

  -- Execution state
  status        TEXT DEFAULT 'pending' NOT NULL,
  -- pending: waiting for deps or scheduling
  -- ready: all deps satisfied, can execute
  -- running: claimed by executor
  -- completed: done
  -- failed: failed after max retries
  -- blocked: waiting on external resource
  -- cancelled: parent cancelled or replanned

  attempt       INTEGER DEFAULT 0,
  max_attempts  INTEGER DEFAULT 3,

  -- Context & results
  context       JSONB DEFAULT '{}',         -- input data from deps/parent
  result        JSONB,                      -- output when completed
  error         TEXT,                        -- error on failure

  -- Budgets
  token_budget  INTEGER,                    -- max tokens for this task
  tokens_used   INTEGER DEFAULT 0,

  -- Timestamps
  created_at    DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
  started_at    DOUBLE PRECISION,
  completed_at  DOUBLE PRECISION,

  -- Constraints
  CONSTRAINT max_depth CHECK (depth <= 3)
);

-- Indexes
CREATE INDEX idx_task_nodes_root ON task_nodes (root_id);
CREATE INDEX idx_task_nodes_parent ON task_nodes (parent_id);
CREATE INDEX idx_task_nodes_status ON task_nodes (status) WHERE status IN ('pending', 'ready', 'running');
```

### Ready-task query

A task is "ready" when all its dependencies are completed:

```sql
SELECT t.* FROM task_nodes t
WHERE t.root_id = $1
  AND t.status = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM task_nodes dep
    WHERE dep.id = ANY(
      SELECT jsonb_array_elements_text(t.dependencies)::TEXT
    )
    AND dep.status != 'completed'
  )
ORDER BY t.depth ASC, t.created_at ASC;
```

When this query returns rows, update their status to `'ready'`.

---

## Core Services

### 1. Classifier (`services/task-classifier.ts`)

Decides whether a message needs decomposition or can be answered directly.

**Fast path (no LLM call):**
```typescript
function classifyFast(message: string): 'simple' | 'complex' | 'uncertain' {
  const words = message.split(/\s+/).length;
  const hasConjunctions = /\b(and then|after that|also|plus|additionally)\b/i.test(message);
  const hasMultiStep = /\b(first|second|step \d|phase|stage)\b/i.test(message);
  const hasList = (message.match(/^[-*]\s/gm) || []).length >= 2;

  if (words < 20 && !hasConjunctions && !hasMultiStep && !hasList) return 'simple';
  if (words > 80 || hasMultiStep || hasList) return 'complex';
  return 'uncertain';
}
```

**Slow path (LLM call, only for 'uncertain'):**
```typescript
// Use cheapest available model (Ollama/Qwen)
const prompt = `Classify this task. Respond with JSON only:
{"complexity": "simple"|"complex", "reason": "one sentence", "estimated_subtasks": number}

Task: "${message}"`;
```

**Cost:** Near-zero for 80%+ of messages (fast path). ~200 tokens for uncertain cases.

### 2. Planner (`services/task-planner.ts`)

Takes a complex task and produces a DAG of subtasks.

**Input:**
```typescript
interface PlanRequest {
  message: string;           // the user's complex idea
  projectId?: string;        // project context
  chatId?: string;           // originating chat
  availableAgents: Agent[];  // workers on this project
  memoryContext: string;     // from buildMemoryContext()
  maxDepth?: number;         // default 3
}
```

**Planner prompt:**
```
You are Porter, the task planner. Decompose this request into an execution plan.

User request: "{message}"

Project context: {project info if available}
Available workers:
{agent list with roles and skills}

Rules:
- Output ONLY a JSON object with a "tasks" array
- Each task: { "id": 1, "description": "...", "deps": [ids], "agent_role": "...", "type": "..." }
- deps = array of task IDs this depends on (empty = no deps, can run immediately)
- agent_role = which worker type should handle this (match to available workers)
- type = one of: research, code, review, design, test, deploy, communicate
- Keep tasks atomic — each completable with one focused effort
- 2-7 tasks maximum (if more needed, group logically)
- Use #R{id} in descriptions to reference output of a prior task
- Do NOT create tasks for things Porter can answer directly
```

**Output:** Validated JSON → inserted into `task_nodes` table as a transaction.

**Validation rules:**
- No circular dependencies (topological sort must succeed)
- All dep IDs reference valid task IDs in this plan
- Depth + 1 doesn't exceed maxDepth
- 2-7 tasks (reject and retry if outside range)
- Each task has a valid agent_role matching an available worker

### 3. Executor (`services/task-executor.ts`)

Runs the task DAG by polling for ready tasks and dispatching them.

**Core loop (event-driven, not polling):**
```typescript
async function executeTaskTree(rootId: string): Promise<void> {
  while (true) {
    // 1. Mark ready tasks
    const readyTasks = await markReadyTasks(rootId);

    // 2. Check termination conditions
    const stats = await getTreeStats(rootId);
    if (stats.pending === 0 && stats.ready === 0 && stats.running === 0) {
      // All done (or all failed/cancelled)
      break;
    }

    // 3. Dispatch ready tasks (parallel where possible)
    const dispatches = readyTasks.map(task => dispatchTask(task));
    const results = await Promise.allSettled(dispatches);

    // 4. Handle results
    for (const [i, result] of results.entries()) {
      const task = readyTasks[i];
      if (result.status === 'fulfilled') {
        await completeTask(task.id, result.value);
        // Propagate result to downstream tasks' context
        await propagateResult(task.id, result.value);
      } else {
        await handleFailure(task, result.reason);
      }
    }

    // 5. Emit progress via SSE
    await emitProgress(rootId);
  }
}
```

**Task dispatch** reuses the existing `ai-router.dispatch()`:
```typescript
async function dispatchTask(task: TaskNode): Promise<TaskResult> {
  // Build context from completed dependency results
  const depResults = await getDependencyResults(task.dependencies);
  const contextStr = depResults.map(d => `[${d.description}]: ${JSON.stringify(d.result)}`).join('\n');

  const prompt = `${task.description}

Context from prior work:
${contextStr}

Respond with your result. Be specific and actionable.`;

  const result = await dispatch({
    agentId: task.assigned_agent_id,
    message: prompt,
    projectId: task.project_id,
  });

  return { response: result.response, model: result.model, tokens: result.tokensUsed };
}
```

**Failure handling:**
```typescript
async function handleFailure(task: TaskNode, error: Error): Promise<void> {
  if (task.attempt < task.max_attempts) {
    // Retry with backoff
    await updateTask(task.id, {
      status: 'pending',
      attempt: task.attempt + 1,
      error: error.message,
    });
  } else {
    // Max retries exceeded — mark failed
    await updateTask(task.id, { status: 'failed', error: error.message });

    // Check if we should replan or abort
    const stats = await getTreeStats(task.root_id);
    if (stats.failed > stats.total * 0.5) {
      // More than half failed — abort entire tree
      await cancelTree(task.root_id, 'Too many failures');
    }
    // Otherwise continue — downstream tasks will be blocked
  }
}
```

### 4. Joiner (`services/task-joiner.ts`)

Synthesizes results when all leaf tasks complete, or triggers replanning.

```typescript
async function joinResults(rootId: string): Promise<JoinResult> {
  const root = await getTaskNode(rootId);
  const allTasks = await getTreeTasks(rootId);
  const stats = getStats(allTasks);

  // If all completed — synthesize
  if (stats.failed === 0) {
    return synthesize(root, allTasks);
  }

  // If some failed — decide: replan or return partial
  const failedTasks = allTasks.filter(t => t.status === 'failed');
  const completedTasks = allTasks.filter(t => t.status === 'completed');

  // If >50% completed, return partial with failure notes
  if (completedTasks.length > allTasks.length * 0.5) {
    return synthesizePartial(root, completedTasks, failedTasks);
  }

  // Otherwise trigger replan
  return { action: 'replan', failedTasks, context: root.description };
}
```

**Synthesis prompt:**
```
You are Porter. These subtasks were executed for the user's request.

Original request: "{root.description}"

Completed work:
{completedTasks.map(t => `- ${t.description}: ${t.result}`).join('\n')}

{failedTasks.length > 0 ? `Failed tasks:\n${failedTasks.map(...)}\n` : ''}

Synthesize these results into a clear, complete response to the original request.
If anything failed, note what couldn't be completed and suggest next steps.
```

---

## Integration Points

### 1. Chat route (primary entry point)

When a user sends a message in chat, the classifier decides the path:

```typescript
// In chat.ts message handler, after current dispatch logic:

const classification = classifyFast(message);
const finalClass = classification === 'uncertain'
  ? await classifyWithLLM(message)
  : classification;

if (finalClass === 'simple') {
  // Current flow — direct dispatch via ai-router
  const result = await dispatch({ agentId, message, projectId });
  // ... save and return
} else {
  // New flow — decomposition engine
  const rootId = await createRootTask(message, projectId, chatId);
  const plan = await planTasks({ message, projectId, chatId, availableAgents });
  await insertTaskTree(rootId, plan);

  // Execute asynchronously — results stream via SSE
  executeTaskTree(rootId).then(async () => {
    const joined = await joinResults(rootId);
    await saveSynthesizedResponse(chatId, joined);
    emitSSE('task_tree_complete', { rootId, chatId });
  });

  // Immediate acknowledgment
  return { type: 'decomposed', rootId, taskCount: plan.tasks.length };
}
```

### 2. SSE events (real-time progress)

New SSE event types for the frontend:

```typescript
// Task tree created
{ type: 'decomposition:started', rootId, taskCount, tasks: [{id, description, deps}] }

// Individual task progress
{ type: 'task:started', taskId, agentName, description }
{ type: 'task:completed', taskId, agentName, summary }
{ type: 'task:failed', taskId, agentName, error }

// Overall progress
{ type: 'decomposition:progress', rootId, completed, total, pct }

// Final result
{ type: 'decomposition:complete', rootId, synthesizedResponse }
```

### 3. Follow-up loop (Porter checks on work)

After task tree execution, Porter can autonomously follow up:

```typescript
// In task-executor.ts, after tree completion:

// Check if any tasks need follow-up
const needsFollowUp = allTasks.some(t =>
  t.result && JSON.parse(t.result).next_steps?.length > 0
);

if (needsFollowUp) {
  // Create follow-up task in the same tree
  const followUpId = await createFollowUpTask(rootId, {
    description: 'Review completed work and determine if anything needs follow-up',
    assigned_agent_id: porterAgentId,
    depth: 1,
    dependencies: allTasks.filter(t => t.status === 'completed').map(t => t.id),
  });

  // Execute the follow-up
  await dispatchTask(await getTaskNode(followUpId));
}
```

### 4. Existing wizard.ts `gsd_dispatch`

The current `gsd_dispatch` action becomes a thin wrapper that calls the new engine:

```typescript
if (data.action === 'gsd_dispatch') {
  const { projectId, message } = data;

  // New: route through decomposition engine
  const rootId = await decomposeAndExecute(message, projectId);

  return reply.send(ok({
    dispatched: true,
    rootId,
    // ... progress available via SSE
  }));
}
```

---

## Safety Rails

| Constraint | Value | Enforcement |
|---|---|---|
| Max decomposition depth | 3 | DB CHECK constraint + planner validation |
| Max tasks per tree | 7 | Planner prompt + post-validation |
| Max retries per task | 3 | Executor loop |
| Max concurrent tasks | 3 | Executor dispatches max 3 at once |
| Token budget per tree | 50,000 | Sum of task tokens_used, hard kill at limit |
| Time limit per tree | 300s | Executor timeout |
| Cycle detection | Topological sort | Planner validation before insert |
| Replan limit | 1 | Only one replan attempt, then abort |

---

## Files to Create/Modify

### New files:
```
backend/src/services/task-classifier.ts    (~80 lines)
backend/src/services/task-planner.ts       (~150 lines)
backend/src/services/task-executor.ts      (~200 lines)
backend/src/services/task-joiner.ts        (~100 lines)
```

### Modified files:
```
backend/src/db/schema.ts                   (add task_nodes table)
backend/src/routes/v1/chat.ts              (integrate classifier at message handler)
backend/src/routes/v1/wizard.ts            (gsd_dispatch → decomposition engine)
drizzle/                                   (new migration for task_nodes)
```

### Estimated scope:
- ~530 lines of new TypeScript
- 1 new DB table + migration
- 2 route modifications
- 0 new dependencies (uses existing ai-router, memory-injection, SSE)

---

## Implementation Phases

### Phase 1: Foundation (task_nodes + classifier + planner)
- Create `task_nodes` table and migration
- Build classifier (fast path + LLM fallback)
- Build planner with prompt engineering and validation
- Unit tests for DAG validation (cycle detection, depth limits)

### Phase 2: Execution (executor + integration)
- Build executor with parallel dispatch and failure handling
- Integrate into chat route (classifier → planner → executor)
- SSE events for real-time progress
- Wire up `gsd_dispatch` to new engine

### Phase 3: Synthesis + Follow-up (joiner + monitoring)
- Build joiner with synthesis prompt
- Add follow-up detection and auto-scheduling
- Progress tracking in admin dashboard
- Replan logic for partial failures

---

## Design Decisions

1. **Separate table (`task_nodes`) instead of extending `tasks`** — The existing `tasks` table is user-facing project tasks. Internal execution graphs are a different concern with different lifecycle and visibility rules.

2. **Plan-and-Execute over ReAct** — Porter already operates as an orchestrator, not a step-by-step reasoner. Plan upfront, execute in parallel, replan on failure. More efficient and transparent.

3. **DAG over tree** — Dependencies can cross branches. Task 5 might depend on tasks 2 AND 3 from different branches. A flat dependency array handles this cleanly.

4. **Event-driven executor over polling** — The existing scheduler polls every 2s. The decomposition executor runs as a single async function that completes synchronously within one request lifecycle (for small trees) or as a background job (for large ones).

5. **Reuse ai-router.dispatch()** — No new model calling infrastructure. Each subtask goes through the same routing engine, circuit breakers, and logging.

6. **Max 7 tasks per level** — Research shows 2-7 is the sweet spot. More than 7 means the planner is insufficiently abstract. Fewer than 2 means the task wasn't complex enough to decompose.

---

## Example Flow

**User message:** "Set up a landing page for our new product with a waitlist form, connect it to our email system, and make sure it's mobile responsive"

**Classifier:** `complex` (3 distinct operations, conjunction "and")

**Planner output:**
```json
{
  "tasks": [
    { "id": 1, "description": "Design landing page layout with hero section, value props, and waitlist CTA", "deps": [], "agent_role": "designer", "type": "design" },
    { "id": 2, "description": "Build the waitlist form component with email validation", "deps": [1], "agent_role": "frontend_dev", "type": "code" },
    { "id": 3, "description": "Set up email integration — connect form submission to email service", "deps": [2], "agent_role": "backend_dev", "type": "code" },
    { "id": 4, "description": "Ensure full mobile responsiveness — test all breakpoints", "deps": [2], "agent_role": "frontend_dev", "type": "review" },
    { "id": 5, "description": "End-to-end test: submit form, verify email received, check mobile", "deps": [3, 4], "agent_role": "qa", "type": "test" }
  ]
}
```

**Execution order:**
1. Task 1 runs immediately (no deps)
2. Tasks 2 starts after 1 completes
3. Tasks 3 and 4 run in parallel (both depend only on 2)
4. Task 5 runs after both 3 and 4 complete

**Joiner:** Synthesizes all results into a summary for the user, noting any issues from QA.

---

## Decisions (Moe, 2026-03-27)

1. **Visibility: SHOW** — Decomposition trees visible in product UI (project detail → tasks tab). Users see exactly how Porter broke down their request.
2. **Chat UX: SHOW** — Individual subtask progress in chat as a live task list. Each subtask appears, updates in real time, completes.
3. **Agent creation: AUTONOMOUS** — If no suitable worker exists, Porter auto-creates a temporary worker from templates. No asking.
4. **Scope: EVERYTHING** — Decomposition applies universally: chat, project actions, wizard flows, "Do This Next" coaching, AND inter-agent communication. Agents talking to each other decompose through this same engine. **This is the USP.**

### Implications of Decision #4 (Universal Scope)

This changes the architecture significantly. The decomposition engine is NOT a chat feature — it's the **core intelligence layer** that sits below everything:

```
┌─────────────────────────────────────────────┐
│  ENTRY POINTS (all route into same engine)  │
│  • User chat message                        │
│  • Project wizard / "Do This Next"          │
│  • Agent-to-agent delegation                │
│  • Scheduled autonomous jobs                │
│  • External triggers (webhooks, events)     │
└──────────────────┬──────────────────────────┘
                   │
                   v
         ┌─────────────────┐
         │  DECOMPOSITION   │  ← single entry point
         │     ENGINE       │     decomposeAndExecute()
         └────────┬────────┘
                  │
    ┌─────────────┼──────────────┐
    v             v              v
 Classify      Plan          Execute
    │             │              │
    v             v              v
 Simple?       DAG           Dispatch
 → direct     → task_nodes   → ai-router
                              → SSE events
                              → follow-up
```

**Agent-to-agent flow:**
When Worker A needs to hand off to Worker B, it doesn't call dispatch directly. It submits to the decomposition engine, which classifies, potentially decomposes further, assigns, executes, and synthesizes — same as a user request. This means:

- Every piece of work in the system is trackable in `task_nodes`
- Porter sees ALL work flowing through the system — nothing hidden
- Inter-agent coordination gets the same progress visibility as user requests
- Recursive decomposition works: Agent A's task spawns subtasks, one of which Agent B decomposes further (up to depth 3)

### Auto Agent Creation Flow

When the planner identifies a subtask needing a role not present:

```typescript
async function resolveAgent(role: string, projectId: string): Promise<string> {
  // 1. Check existing project agents
  const existing = await findAgentByRole(role, projectId);
  if (existing) return existing.id;

  // 2. Find best matching template
  const template = await matchTemplate(role);
  if (!template) throw new Error(`No template matches role: ${role}`);

  // 3. Auto-create temporary worker
  const agent = await createEphemeralAgent({
    templateId: template.id,
    projectId,
    parentAgentId: porterAgentId,
    depth: 1,
  });

  // 4. Log decision
  await logDecision('agent_auto_created', agent.id,
    `Created ${template.name} for "${role}" subtask — no existing worker matched`);

  return agent.id;
}
```
