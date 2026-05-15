/**
 * task-planner.ts — Task Decomposition Engine: Phase 42 Plan 02
 *
 * Takes a complex user message and produces a validated DAG of subtasks.
 * Dispatches via the Bridge (claude_cli, single gateway since v6.9.0) to
 * generate the plan, then validates it via Kahn's algorithm cycle detection
 * before inserting all task_nodes into PostgreSQL in a single transaction.
 *
 * Exports: planTasks, validateDAG, insertTaskTree
 */

import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../db/client.js';
import { routingEngine } from '../bridge/routing-engine.js';
import type {
  PlanRequest,
  PlanResult,
  PlannedTask,
  TaskNode,
} from './types.js';
import {
  MAX_TASKS_PER_LEVEL,
} from './types.js';

// ── DAG Validation ─────────────────────────────────────────────────────────────

/**
 * Validate a planned task DAG before inserting into DB.
 *
 * Checks:
 * 1. Task count is between 2 and MAX_TASKS_PER_LEVEL (7)
 * 2. All dep localId references point to valid tasks in this plan
 * 3. No task depends on itself
 * 4. No cycles (topological sort via Kahn's algorithm, in-degree BFS)
 */
export function validateDAG(tasks: PlannedTask[]): { valid: boolean; error?: string } {
  // 1. Count bounds
  if (tasks.length < 2) {
    return { valid: false, error: `Plan must have at least 2 tasks, got ${tasks.length}` };
  }
  if (tasks.length > MAX_TASKS_PER_LEVEL) {
    return { valid: false, error: `Plan exceeds maximum of ${MAX_TASKS_PER_LEVEL} tasks, got ${tasks.length}` };
  }

  // Build a set of valid localIds for O(1) lookup
  const validIds = new Set(tasks.map(t => t.localId));

  // 2. Self-dependency and out-of-range dep checks
  for (const task of tasks) {
    for (const dep of task.deps) {
      if (dep === task.localId) {
        return {
          valid: false,
          error: `Task ${task.localId} depends on itself`,
        };
      }
      if (!validIds.has(dep)) {
        return {
          valid: false,
          error: `Task ${task.localId} has dep ${dep} that is not a valid task ID in this plan`,
        };
      }
    }
  }

  // 3. Cycle detection via Kahn's algorithm (topological sort)
  // Build adjacency map and in-degree counts
  const inDegree = new Map<number, number>();
  const adjacency = new Map<number, number[]>(); // dep → dependents

  for (const task of tasks) {
    if (!inDegree.has(task.localId)) inDegree.set(task.localId, 0);
    if (!adjacency.has(task.localId)) adjacency.set(task.localId, []);
    for (const dep of task.deps) {
      // dep must complete before task.localId
      inDegree.set(task.localId, (inDegree.get(task.localId) ?? 0) + 1);
      const depDependents = adjacency.get(dep) ?? [];
      depDependents.push(task.localId);
      adjacency.set(dep, depDependents);
    }
  }

  // BFS from zero-in-degree nodes
  const queue: number[] = [];
  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(id);
  }

  let processed = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    processed++;
    for (const dependent of (adjacency.get(current) ?? [])) {
      const newDegree = (inDegree.get(dependent) ?? 1) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) queue.push(dependent);
    }
  }

  if (processed !== tasks.length) {
    return { valid: false, error: 'DAG contains a cycle — topological sort failed' };
  }

  return { valid: true };
}

// ── LLM Planner ───────────────────────────────────────────────────────────────

/**
 * Build the planner system prompt.
 * Instructs LLM to produce a JSON task DAG from a complex user request.
 */
function buildPlannerPrompt(request: PlanRequest, errorFeedback?: string): string {
  const agentList = request.availableAgents.length > 0
    ? request.availableAgents
        .map(a => `- ${a.name} (id: ${a.id}${a.role ? `, role: ${a.role}` : ''}${a.skills?.length ? `, skills: ${a.skills.join(', ')}` : ''})`)
        .join('\n')
    : '- General assistant (role: general)';

  const errorSection = errorFeedback
    ? `\n\nPrevious attempt was invalid: ${errorFeedback}\nPlease fix and try again.`
    : '';

  return `You are Porter, the task planner. Decompose this request into an execution plan.

User request: "${request.message}"

Available workers:
${agentList}

Rules:
- Output ONLY a JSON object with a "tasks" array. No explanation, no markdown fences.
- Each task: { "id": 1, "description": "...", "deps": [ids], "agent_role": "...", "type": "..." }
- deps = array of task IDs this depends on (empty = no deps, can run immediately)
- agent_role = which worker type should handle this (match to available workers)
- type = one of: research, code, review, design, test, deploy, communicate
- Keep tasks atomic — each completable with one focused effort
- 2-7 tasks maximum (if more needed, group logically)
- Do NOT create tasks for things Porter can answer directly${errorSection}

Example: {"tasks":[{"id":1,"description":"Research X","deps":[],"agent_role":"researcher","type":"research"},{"id":2,"description":"Write report based on research","deps":[1],"agent_role":"writer","type":"communicate"}]}`;
}

/**
 * Parse LLM response into PlannedTask array.
 * Handles markdown code fences and maps snake_case JSON fields to camelCase.
 */
function parseResponse(raw: string): PlannedTask[] {
  // Strip markdown code fences (```json...``` or ```...```)
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const parsed = JSON.parse(cleaned) as {
    tasks: Array<{
      id: number;
      description: string;
      deps: number[];
      agent_role: string;
      type: string;
    }>;
  };

  if (!Array.isArray(parsed.tasks)) {
    throw new Error('Response missing "tasks" array');
  }

  return parsed.tasks.map(t => ({
    localId: t.id,
    description: t.description,
    deps: Array.isArray(t.deps) ? t.deps : [],
    agentRole: t.agent_role ?? 'general',
    taskType: t.type ?? 'research',
  }));
}

/**
 * Generate a DAG plan from a complex user request via LLM.
 *
 * Dispatches via routingEngine (single claude_cli gateway since v6.9.0).
 * Validates the result with validateDAG.
 * Retries once with error feedback on validation failure.
 * Throws if both attempts fail.
 */
export async function planTasks(request: PlanRequest): Promise<PlanResult> {
  // Attempt 1
  const attempt1 = await attemptPlan(request);
  const validation1 = validateDAG(attempt1);
  if (validation1.valid) {
    return { tasks: attempt1 };
  }

  // Attempt 2 with error feedback
  const attempt2 = await attemptPlan(request, validation1.error);
  const validation2 = validateDAG(attempt2);
  if (validation2.valid) {
    return { tasks: attempt2 };
  }

  throw new Error(`Planner failed to produce valid DAG: ${validation2.error}`);
}

async function attemptPlan(request: PlanRequest, errorFeedback?: string): Promise<PlannedTask[]> {
  const prompt = buildPlannerPrompt(request, errorFeedback);

  // Single-gateway Bridge (claude_cli) since v6.9.0.
  const decision = await routingEngine.select({ message: prompt });

  const result = await routingEngine.dispatchWithQueue(decision, {
    messages: [{ role: 'user', content: prompt }],
    systemPrompt: 'You are a task planner. Respond with valid JSON only.',
    temperature: 0.3,
    maxTokens: 1000,
  });

  return parseResponse(result.response);
}

// ── DB Insert ──────────────────────────────────────────────────────────────────

/**
 * Insert a validated plan as task_nodes rows in a single transaction.
 *
 * Creates:
 * - Root node (rootId, depth=0, status='running') — represents the original request
 * - One subtask row per PlannedTask (depth=1, status='pending')
 *
 * Maps localId dependencies to UUID dependencies using the plan's ID map.
 * Returns all created TaskNode objects.
 */
export async function insertTaskTree(
  rootId: string,
  plan: PlanResult,
  request: PlanRequest,
): Promise<TaskNode[]> {
  const now = Math.floor(Date.now() / 1000);

  // Generate UUIDs for each planned task
  const localIdToUUID = new Map<number, string>();
  for (const task of plan.tasks) {
    localIdToUUID.set(task.localId, uuidv4());
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert root node
    await client.query(
      `INSERT INTO task_nodes (
        id, root_id, parent_id, project_id, chat_id,
        description, task_type, assigned_agent_id,
        depth, dependencies, status,
        attempt, max_attempts, context, result, error,
        token_budget, tokens_used, created_at, started_at, completed_at
      ) VALUES (
        $1, $2, NULL, $3, $4,
        $5, 'root', NULL,
        0, '[]'::jsonb, 'running',
        0, 1, '{}'::jsonb, NULL, NULL,
        NULL, 0, $6, $7, NULL
      )
      ON CONFLICT (id) DO NOTHING`,
      [
        rootId, rootId,
        request.projectId ?? null,
        request.chatId ?? null,
        `Plan: ${request.message.slice(0, 500)}`,
        now, now,
      ],
    );

    // Insert subtasks
    const createdNodes: TaskNode[] = [];

    // Root node
    createdNodes.push({
      id: rootId,
      rootId,
      parentId: null,
      projectId: request.projectId ?? null,
      chatId: request.chatId ?? null,
      description: `Plan: ${request.message.slice(0, 500)}`,
      taskType: 'root',
      assignedAgentId: null,
      depth: 0,
      dependencies: [],
      status: 'running',
      attempt: 0,
      maxAttempts: 1,
      context: {},
      result: null,
      error: null,
      tokenBudget: null,
      tokensUsed: 0,
      createdAt: now,
      startedAt: now,
      completedAt: null,
    });

    for (const task of plan.tasks) {
      const taskId = localIdToUUID.get(task.localId)!;
      // Map dep localIds to UUIDs
      const depUUIDs = task.deps.map(depId => {
        const uuid = localIdToUUID.get(depId);
        if (!uuid) throw new Error(`Cannot resolve dep localId ${depId} to UUID`);
        return uuid;
      });

      await client.query(
        `INSERT INTO task_nodes (
          id, root_id, parent_id, project_id, chat_id,
          description, task_type, assigned_agent_id,
          depth, dependencies, status,
          attempt, max_attempts, context, result, error,
          token_budget, tokens_used, created_at, started_at, completed_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, NULL,
          1, $8::jsonb, 'pending',
          0, 3, '{}'::jsonb, NULL, NULL,
          NULL, 0, $9, NULL, NULL
        )`,
        [
          taskId,
          rootId,
          rootId,               // parent = root
          request.projectId ?? null,
          request.chatId ?? null,
          task.description,
          task.taskType,
          JSON.stringify(depUUIDs),
          now,
        ],
      );

      createdNodes.push({
        id: taskId,
        rootId,
        parentId: rootId,
        projectId: request.projectId ?? null,
        chatId: request.chatId ?? null,
        description: task.description,
        taskType: task.taskType,
        assignedAgentId: null,
        depth: 1,
        dependencies: depUUIDs,
        status: 'pending',
        attempt: 0,
        maxAttempts: 3,
        context: {},
        result: null,
        error: null,
        tokenBudget: null,
        tokensUsed: 0,
        createdAt: now,
        startedAt: null,
        completedAt: null,
      });
    }

    await client.query('COMMIT');
    return createdNodes;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
