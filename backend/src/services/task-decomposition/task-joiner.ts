/**
 * task-joiner.ts — Task Decomposition Engine: Phase 42 Plan 03
 *
 * Synthesizes completed subtask outputs into a coherent response.
 * Handles four outcomes:
 *   - synthesized: all tasks completed — full LLM synthesis
 *   - partial: >50% completed, some failed — synthesis + failure notes
 *   - replan: >50% failed — trigger replanning (caller handles)
 *   - failed: all tasks failed — error summary
 *
 * Phase 43: Loads inter-agent delegation audit trail from msg_bus_events
 * and includes delegation context in synthesis prompts.
 *
 * Uses routingEngine for LLM synthesis (no new dispatch paths).
 * Exports: joinResults
 */

import { pool } from '../../db/client.js';
import { routingEngine } from '../bridge/routing-engine.js';
import type { TaskNode, JoinResult } from './types.js';

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

// ── Delegation audit ──────────────────────────────────────────────────────────

interface DelegationAudit {
  totalMessages: number;
  agents: string[];
  gateways: string[];
  totalLatencyMs: number;
}

/**
 * Load inter-agent delegation audit trail from msg_bus_events for a DAG root.
 * Returns aggregate stats about how work was distributed across agents.
 */
async function loadDelegationAudit(correlationId: string): Promise<DelegationAudit> {
  const { rows } = await pool.query<{
    cnt: number;
    agents: string[];
    gateways: string[];
    total_latency: number;
  }>(
    `SELECT
       COUNT(*)::int AS cnt,
       ARRAY_AGG(DISTINCT target_agent) FILTER (WHERE target_agent IS NOT NULL) AS agents,
       ARRAY_AGG(DISTINCT target_gateway) FILTER (WHERE target_gateway IS NOT NULL) AS gateways,
       COALESCE(SUM(latency_ms), 0)::int AS total_latency
     FROM msg_bus_events
     WHERE correlation_id = $1 AND status = 'delivered'`,
    [correlationId],
  );

  const row = rows[0];
  return {
    totalMessages: row?.cnt ?? 0,
    agents: row?.agents?.filter(Boolean) ?? [],
    gateways: row?.gateways?.filter(Boolean) ?? [],
    totalLatencyMs: row?.total_latency ?? 0,
  };
}

// ── synthesize ─────────────────────────────────────────────────────────────────

/**
 * Build a synthesis response when all subtasks completed successfully.
 * Uses LLM to produce a clear, coherent reply from the distributed results.
 * Includes inter-agent delegation audit context when available.
 */
async function synthesize(root: TaskNode, completedTasks: TaskNode[]): Promise<JoinResult> {
  const taskLines = completedTasks
    .map(t => `- ${t.description}: ${JSON.stringify(t.result)}`)
    .join('\n');

  // IAM-04: Load delegation audit trail for synthesis context
  const audit = await loadDelegationAudit(root.rootId);
  const auditNote = audit.totalMessages > 0
    ? `\n\nDelegation summary: ${audit.totalMessages} inter-agent messages across agents [${audit.agents.join(', ')}] via gateways [${audit.gateways.join(', ')}], total delegation latency ${audit.totalLatencyMs}ms.`
    : '';

  const prompt = `You are Porter. These subtasks were executed for the user's request.

Original request: "${root.description}"

Completed work:
${taskLines}${auditNote}

Synthesize these results into a clear, complete response to the original request.`;

  const decision = await routingEngine.select({ message: prompt });
  const result = await routingEngine.dispatchWithQueue(decision, {
    messages: [{ role: 'user', content: prompt }],
    systemPrompt: 'You are Porter. Synthesize the completed subtask results into a single clear response.',
    temperature: 0.5,
    maxTokens: 2000,
  });

  return {
    action: 'synthesized',
    response: result.response,
  };
}

// ── synthesizePartial ──────────────────────────────────────────────────────────

/**
 * Build a synthesis response when >50% of tasks completed but some failed.
 * Synthesizes completed work and notes what couldn't be finished.
 * Includes inter-agent delegation audit context when available.
 */
async function synthesizePartial(
  root: TaskNode,
  completedTasks: TaskNode[],
  failedTasks: TaskNode[],
): Promise<JoinResult> {
  const completedLines = completedTasks
    .map(t => `- ${t.description}: ${JSON.stringify(t.result)}`)
    .join('\n');

  const failedLines = failedTasks
    .map(t => `- ${t.description}: ${t.error ?? 'Unknown error'}`)
    .join('\n');

  // IAM-04: Load delegation audit trail for synthesis context
  const audit = await loadDelegationAudit(root.rootId);
  const auditNote = audit.totalMessages > 0
    ? `\n\nDelegation summary: ${audit.totalMessages} inter-agent messages across agents [${audit.agents.join(', ')}] via gateways [${audit.gateways.join(', ')}], total delegation latency ${audit.totalLatencyMs}ms.`
    : '';

  const prompt = `You are Porter. These subtasks were executed for the user's request.

Original request: "${root.description}"

Completed work:
${completedLines}

Failed tasks (could not be completed):
${failedLines}${auditNote}

Synthesize the completed results into a clear response. Note what couldn't be completed and suggest next steps.`;

  const decision = await routingEngine.select({ message: prompt });
  const result = await routingEngine.dispatchWithQueue(decision, {
    messages: [{ role: 'user', content: prompt }],
    systemPrompt: 'You are Porter. Synthesize completed results and note any failures with suggested next steps.',
    temperature: 0.5,
    maxTokens: 2000,
  });

  return {
    action: 'partial',
    response: result.response,
    failedTasks: failedTasks.map(t => t.id),
  };
}

// ── joinResults ────────────────────────────────────────────────────────────────

/**
 * Synthesize the results of a completed task tree into a JoinResult.
 *
 * Decision tree (checks depth > 0 child tasks only):
 *   - ALL completed (failed+cancelled = 0): synthesize -> 'synthesized'
 *   - ALL failed (completed = 0): return 'failed' with error summary
 *   - >50% completed: synthesizePartial -> 'partial' with failure notes
 *   - >50% failed: return 'replan' for the engine to attempt replanning
 *
 * @param rootId - The root task_node UUID for this decomposition
 */
export async function joinResults(rootId: string): Promise<JoinResult> {
  // Load root node (description = original user request)
  const { rows: rootRows } = await pool.query<TaskNodeRow>(
    `SELECT * FROM task_nodes WHERE id = $1`,
    [rootId],
  );
  if (rootRows.length === 0) {
    return {
      action: 'failed',
      response: `Task tree not found for rootId: ${rootId}`,
    };
  }
  const root = rowToTaskNode(rootRows[0]);

  // Load all child tasks (depth > 0)
  const { rows: childRows } = await pool.query<TaskNodeRow>(
    `SELECT * FROM task_nodes WHERE root_id = $1 AND depth > 0 ORDER BY created_at ASC`,
    [rootId],
  );
  const children = childRows.map(rowToTaskNode);

  if (children.length === 0) {
    return {
      action: 'failed',
      response: 'No subtasks found in task tree.',
    };
  }

  // Compute outcome statistics
  const completedTasks = children.filter(t => t.status === 'completed');
  const failedTasks = children.filter(t => t.status === 'failed' || t.status === 'cancelled');
  const total = children.length;
  const failedCount = failedTasks.length;
  const completedCount = completedTasks.length;

  // a. All tasks completed — full synthesis
  if (failedCount === 0) {
    return synthesize(root, completedTasks);
  }

  // b. All tasks failed — hard failure, no synthesis possible
  if (completedCount === 0) {
    const errorSummary = failedTasks
      .map(t => `${t.description}: ${t.error ?? 'Unknown error'}`)
      .join('; ');
    return {
      action: 'failed',
      response: `All subtasks failed. Errors: ${errorSummary}`,
      failedTasks: failedTasks.map(t => t.id),
    };
  }

  // c. >50% completed — partial synthesis with failure notes
  if (completedCount > total * 0.5) {
    return synthesizePartial(root, completedTasks, failedTasks);
  }

  // d. >50% failed — trigger replan
  return {
    action: 'replan',
    response: '',
    failedTasks: failedTasks.map(t => t.id),
    context: root.description,
  };
}
