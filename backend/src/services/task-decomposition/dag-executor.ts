/**
 * dag-executor.ts — Task Decomposition Engine: Phase 42 Plan 02
 *
 * Executes a task DAG by polling for ready tasks and dispatching them in
 * parallel via the existing routing engine. Handles failures with retry/cancel
 * logic and emits SSE progress events for every state transition.
 *
 * Exports: executeTaskTree, markReadyTasks, getTreeStats
 */

import { pool } from '../../db/client.js';
import { routingEngine } from '../bridge/routing-engine.js';
import { broadcast } from '../sse-hub.js';
import type { TaskNode, TaskResult, DAGStats } from './types.js';
import {
  MAX_CONCURRENT,
  MAX_RETRIES,
  TREE_TIMEOUT_MS,
} from './types.js';

// ── DB row type for raw pool.query results ─────────────────────────────────────

interface TaskNodeRow {
  id: string;
  root_id: string;
  parent_id: string | null;
  project_id: string | null;
  chat_id: string | null;
  description: string;
  task_type: string;
  assigned_agent_id: string | null;
  depth: number;
  dependencies: string[];
  status: string;
  attempt: number;
  max_attempts: number;
  context: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  token_budget: number | null;
  tokens_used: number;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
}

function rowToTaskNode(row: TaskNodeRow): TaskNode {
  return {
    id: row.id,
    rootId: row.root_id,
    parentId: row.parent_id,
    projectId: row.project_id,
    chatId: row.chat_id,
    description: row.description,
    taskType: row.task_type,
    assignedAgentId: row.assigned_agent_id,
    depth: row.depth,
    dependencies: Array.isArray(row.dependencies) ? row.dependencies : [],
    status: row.status as TaskNode['status'],
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
    context: row.context ?? {},
    result: row.result,
    error: row.error,
    tokenBudget: row.token_budget,
    tokensUsed: row.tokens_used,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

// ── getTreeStats ───────────────────────────────────────────────────────────────

/**
 * Get counts for each task status in a tree.
 * Only counts depth > 0 rows (excludes root node).
 */
export async function getTreeStats(rootId: string): Promise<DAGStats> {
  const { rows } = await pool.query<{ status: string; cnt: number }>(
    `SELECT status, COUNT(*)::int AS cnt
     FROM task_nodes
     WHERE root_id = $1 AND depth > 0
     GROUP BY status`,
    [rootId],
  );

  const counts: Partial<DAGStats> = {};
  for (const row of rows) {
    counts[row.status as keyof DAGStats] = row.cnt;
  }

  // Compute total from sum of all status counts
  const total = rows.reduce((sum, r) => sum + r.cnt, 0);

  return {
    total,
    pending: counts.pending ?? 0,
    ready: counts.ready ?? 0,
    running: counts.running ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    cancelled: counts.cancelled ?? 0,
    blocked: counts.blocked ?? 0,
  };
}

// ── markReadyTasks ────────────────────────────────────────────────────────────

/**
 * Find pending tasks whose all dependencies are completed, mark them ready.
 *
 * Uses a correlated subquery (NOT EXISTS) to check that no dep is non-completed.
 * Updates matched rows to status='ready' and returns them.
 */
export async function markReadyTasks(rootId: string): Promise<TaskNode[]> {
  const { rows } = await pool.query<TaskNodeRow>(
    `UPDATE task_nodes SET status = 'ready'
     WHERE root_id = $1
       AND status = 'pending'
       AND NOT EXISTS (
         SELECT 1 FROM task_nodes dep
         WHERE dep.id = ANY(
           SELECT jsonb_array_elements_text(task_nodes.dependencies)::TEXT
         )
         AND dep.status != 'completed'
       )
     RETURNING *`,
    [rootId],
  );

  return rows.map(rowToTaskNode);
}

// ── dispatchSubtask ───────────────────────────────────────────────────────────

/**
 * Dispatch a single subtask via the routing engine.
 *
 * Loads completed dependency results to provide context to the LLM.
 * Selects gateway based on task's assignedAgentId and projectId.
 */
async function dispatchSubtask(task: TaskNode): Promise<TaskResult> {
  // Load completed dependency results for context injection
  let contextStr = '';
  if (task.dependencies.length > 0) {
    const { rows: depRows } = await pool.query<TaskNodeRow>(
      `SELECT * FROM task_nodes
       WHERE id = ANY($1::uuid[])
         AND status = 'completed'`,
      [task.dependencies],
    );
    if (depRows.length > 0) {
      contextStr = depRows
        .map(d => `[${d.description}]: ${JSON.stringify(d.result)}`)
        .join('\n');
    }
  }

  const prompt = contextStr
    ? `${task.description}\n\nContext from prior work:\n${contextStr}\n\nRespond with your result. Be specific and actionable.`
    : `${task.description}\n\nRespond with your result. Be specific and actionable.`;

  const decision = await routingEngine.select({
    message: prompt,
    agentId: task.assignedAgentId ?? undefined,
    projectId: task.projectId,
  });

  const result = await routingEngine.dispatchWithQueue(decision, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
  });

  return {
    response: result.response,
    model: result.model,
    tokens: result.tokensUsed ?? 0,
  };
}

// ── handleFailure ─────────────────────────────────────────────────────────────

/**
 * Handle a failed task dispatch.
 *
 * If attempts remain: reset to pending with incremented attempt counter.
 * If max attempts reached: mark failed; if >50% of tree failed, cancel the tree.
 */
export async function handleFailure(task: TaskNode, error: Error): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  if (task.attempt < task.maxAttempts - 1) {
    // Retry: reset to pending with incremented attempt
    await pool.query(
      `UPDATE task_nodes
       SET status = 'pending', attempt = attempt + 1, error = $2
       WHERE id = $1`,
      [task.id, error.message],
    );
    broadcast('task:retry', {
      taskId: task.id,
      rootId: task.rootId,
      attempt: task.attempt + 1,
      maxAttempts: task.maxAttempts,
      error: error.message,
    });
  } else {
    // Max attempts reached — mark failed
    await pool.query(
      `UPDATE task_nodes
       SET status = 'failed', error = $2, completed_at = $3
       WHERE id = $1`,
      [task.id, error.message, now],
    );
    broadcast('task:failed', {
      taskId: task.id,
      rootId: task.rootId,
      error: error.message,
    });

    // Check if tree should be cancelled (>50% failed)
    const stats = await getTreeStats(task.rootId);
    if (stats.total > 0 && stats.failed > stats.total * 0.5) {
      await cancelTree(task.rootId, 'Too many failures — cancelling tree');
    }
  }
}

// ── cancelTree ────────────────────────────────────────────────────────────────

/**
 * Cancel all pending/ready tasks in a tree and mark root as failed.
 */
async function cancelTree(rootId: string, reason: string): Promise<void> {
  await pool.query(
    `UPDATE task_nodes
     SET status = 'cancelled', error = $2
     WHERE root_id = $1
       AND status IN ('pending', 'ready')`,
    [rootId, reason],
  );
  await pool.query(
    `UPDATE task_nodes
     SET status = 'failed', error = $2
     WHERE id = $1
       AND status = 'running'`,
    [rootId, reason],
  );
  broadcast('decomposition:cancelled', { rootId, reason });
}

// ── propagateResult ───────────────────────────────────────────────────────────

/**
 * Propagate a completed task's result into the context JSONB of dependent tasks.
 *
 * Finds all tasks that list taskId in their dependencies array and merges the
 * result into their context field, making it available for downstream dispatch.
 */
export async function propagateResult(taskId: string, result: TaskResult): Promise<void> {
  // Find tasks that depend on this taskId
  const { rows } = await pool.query<{ id: string; context: Record<string, unknown> }>(
    `SELECT id, context FROM task_nodes
     WHERE dependencies @> $1::jsonb
       AND status IN ('pending', 'ready')`,
    [JSON.stringify([taskId])],
  );

  for (const row of rows) {
    const merged = { ...row.context, [taskId]: result };
    await pool.query(
      `UPDATE task_nodes SET context = $1::jsonb WHERE id = $2`,
      [JSON.stringify(merged), row.id],
    );
  }
}

// ── executeTaskTree ───────────────────────────────────────────────────────────

/**
 * Main executor loop: dispatches ready tasks in parallel until the tree is done.
 *
 * Loop:
 * 1. markReadyTasks — find pending tasks with all deps completed
 * 2. getTreeStats — check termination: pending=0 AND ready=0 AND running=0
 * 3. Cap batch at MAX_CONCURRENT (3) simultaneous dispatches
 * 4. Mark each batch task as running, broadcast task:started
 * 5. Promise.allSettled — parallel dispatch
 * 6. Handle fulfilled (complete + propagate) and rejected (handleFailure)
 * 7. Broadcast decomposition:progress with current stats
 * 8. Safety timeout: TREE_TIMEOUT_MS (5 minutes)
 */
export async function executeTaskTree(rootId: string): Promise<void> {
  const startTime = Date.now();
  const now = () => Math.floor(Date.now() / 1000);

  broadcast('decomposition:started', { rootId });

  while (true) {
    // Safety: check timeout
    if (Date.now() - startTime > TREE_TIMEOUT_MS) {
      await cancelTree(rootId, 'Tree execution timed out');
      break;
    }

    // 1. Mark ready tasks (all deps completed)
    const readyTasks = await markReadyTasks(rootId);

    // 2. Check termination
    const stats = await getTreeStats(rootId);
    if (stats.pending === 0 && stats.ready === 0 && stats.running === 0) {
      break;
    }

    // 3. If no tasks ready to dispatch right now (others still running), skip this tick
    //    The outer loop will re-check after current running tasks complete
    if (readyTasks.length === 0) {
      // Nothing newly ready; if things are still running they'll complete async.
      // In this synchronous loop we must break if running > 0 but nothing is ready
      // to avoid spinning forever — the caller handles the async completion.
      // For now: terminate if we can't make progress (all running, nothing ready, nothing pending)
      if (stats.running > 0) {
        // In a real implementation this would be event-driven;
        // here we break and let the parent await resolve
        break;
      }
      break;
    }

    // 4. Cap at MAX_CONCURRENT
    const batch = readyTasks.slice(0, MAX_CONCURRENT);

    // Mark batch as running
    for (const task of batch) {
      await pool.query(
        `UPDATE task_nodes SET status = 'running', started_at = $2 WHERE id = $1`,
        [task.id, now()],
      );
      broadcast('task:started', {
        taskId: task.id,
        rootId: task.rootId,
        description: task.description,
        taskType: task.taskType,
      });
    }

    // 5. Parallel dispatch via Promise.allSettled
    const results = await Promise.allSettled(batch.map(t => dispatchSubtask(t)));

    // 6. Handle results
    for (let i = 0; i < results.length; i++) {
      const task = batch[i];
      const result = results[i];

      if (result.status === 'fulfilled') {
        const taskResult = result.value;
        await pool.query(
          `UPDATE task_nodes
           SET status = 'completed', result = $2::jsonb, completed_at = $3, tokens_used = $4
           WHERE id = $1`,
          [task.id, JSON.stringify({ response: taskResult.response }), now(), taskResult.tokens],
        );
        broadcast('task:completed', {
          taskId: task.id,
          rootId: task.rootId,
          model: taskResult.model,
          tokens: taskResult.tokens,
        });
        // Propagate result to downstream task contexts
        await propagateResult(task.id, taskResult);
      } else {
        const error = result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason));
        await handleFailure(task, error);
      }
    }

    // 7. Broadcast progress
    const updatedStats = await getTreeStats(rootId);
    broadcast('decomposition:progress', {
      rootId,
      stats: updatedStats,
      elapsedMs: Date.now() - startTime,
    });
  }

  // After loop: update root node status based on tree outcome
  const finalStats = await getTreeStats(rootId);
  const allDone = finalStats.pending === 0 && finalStats.ready === 0 && finalStats.running === 0;
  const hasFailures = finalStats.failed > 0 || finalStats.cancelled > 0;

  const rootStatus = allDone && !hasFailures ? 'completed' : (finalStats.cancelled > 0 ? 'failed' : 'completed');
  await pool.query(
    `UPDATE task_nodes SET status = $2, completed_at = $3 WHERE id = $1 AND depth = 0`,
    [rootId, rootStatus, now()],
  );

  broadcast('decomposition:progress', {
    rootId,
    stats: finalStats,
    elapsedMs: Date.now() - startTime,
    final: true,
  });
}
