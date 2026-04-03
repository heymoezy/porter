/**
 * Decomposition Inspection Routes (Phase 42)
 *
 * REST API surface for inspecting Task Decomposition Engine (TDE) results.
 * Provides visibility into every root-level task, its full DAG tree, and
 * individual node details with dependency resolution.
 *
 * Routes:
 *   GET  /api/v1/decomposition                              — list root tasks with stats
 *   GET  /api/v1/decomposition/:rootId/tree                 — full DAG tree for a root
 *   GET  /api/v1/decomposition/:rootId/nodes/:nodeId        — single node with dep details
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { pool } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';

// ── DB row types ─────────────────────────────────────────────────────────────

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

interface RootSummaryRow extends TaskNodeRow {
  subtask_count: number;
  completed_count: number;
  failed_count: number;
}

// ── Route plugin ─────────────────────────────────────────────────────────────

export default async function decompositionV1Routes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /api/v1/decomposition — list root-level decomposed tasks with stats
  fastify.get(
    '/',
    { preHandler: [fastify.requireAuth] },
    async (request, reply) => {
      const query = request.query as Record<string, string | undefined>;
      const statusFilter = query.status;
      const limit = Math.min(parseInt(query.limit ?? '50', 10) || 50, 200);
      const offset = parseInt(query.offset ?? '0', 10) || 0;

      const conditions: string[] = ['t.depth = 0'];
      const params: unknown[] = [];

      if (statusFilter) {
        params.push(statusFilter);
        conditions.push(`t.status = $${params.length}`);
      }

      const where = `WHERE ${conditions.join(' AND ')}`;

      // Count query (without limit/offset)
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM task_nodes t ${where}`,
        params,
      );
      const total = (countRows[0] as { total: number }).total;

      // Add pagination params
      params.push(limit);
      const limitParam = params.length;
      params.push(offset);
      const offsetParam = params.length;

      const { rows } = await pool.query<RootSummaryRow>(
        `SELECT
           t.id,
           t.root_id,
           t.parent_id,
           t.project_id,
           t.chat_id,
           t.description,
           t.task_type,
           t.assigned_agent_id,
           t.depth,
           t.dependencies,
           t.status,
           t.attempt,
           t.max_attempts,
           t.context,
           t.result,
           t.error,
           t.token_budget,
           t.tokens_used,
           t.created_at,
           t.started_at,
           t.completed_at,
           (SELECT COUNT(*)::int FROM task_nodes WHERE root_id = t.id AND depth > 0) AS subtask_count,
           (SELECT COUNT(*)::int FROM task_nodes WHERE root_id = t.id AND depth > 0 AND status = 'completed') AS completed_count,
           (SELECT COUNT(*)::int FROM task_nodes WHERE root_id = t.id AND depth > 0 AND status = 'failed') AS failed_count
         FROM task_nodes t
         ${where}
         ORDER BY t.created_at DESC
         LIMIT $${limitParam} OFFSET $${offsetParam}`,
        params,
      );

      const roots = rows.map(r => ({
        id: r.id,
        rootId: r.root_id,
        parentId: r.parent_id,
        projectId: r.project_id,
        chatId: r.chat_id,
        description: r.description,
        taskType: r.task_type,
        assignedAgentId: r.assigned_agent_id,
        depth: r.depth,
        dependencies: r.dependencies,
        status: r.status,
        attempt: r.attempt,
        maxAttempts: r.max_attempts,
        context: r.context,
        result: r.result,
        error: r.error,
        tokenBudget: r.token_budget,
        tokensUsed: r.tokens_used,
        createdAt: r.created_at,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        subtaskCount: r.subtask_count,
        completedCount: r.completed_count,
        failedCount: r.failed_count,
      }));

      return reply.send(ok({ roots, total }));
    },
  );

  // GET /api/v1/decomposition/:rootId/tree — full DAG tree for a root task
  fastify.get(
    '/:rootId/tree',
    { preHandler: [fastify.requireAuth] },
    async (request, reply) => {
      const { rootId } = request.params as { rootId: string };

      const { rows } = await pool.query<TaskNodeRow>(
        `SELECT
           id, root_id, parent_id, project_id, chat_id,
           description, task_type, assigned_agent_id,
           depth, dependencies, status, attempt, max_attempts,
           context, result, error, token_budget, tokens_used,
           created_at, started_at, completed_at
         FROM task_nodes
         WHERE root_id = $1
         ORDER BY depth ASC, created_at ASC`,
        [rootId],
      );

      const root = rows.find(n => n.id === rootId);

      if (!root) {
        return reply.code(404).send(err('NOT_FOUND', `Decomposition root ${rootId} not found`));
      }

      const children = rows.filter(n => n.id !== rootId);

      // Compute stats
      const stats = {
        total: rows.length,
        completed: rows.filter(n => n.status === 'completed').length,
        failed: rows.filter(n => n.status === 'failed').length,
        running: rows.filter(n => n.status === 'running').length,
        pending: rows.filter(n => n.status === 'pending' || n.status === 'ready').length,
        cancelled: rows.filter(n => n.status === 'cancelled').length,
        blocked: rows.filter(n => n.status === 'blocked').length,
      };

      const mapNode = (n: TaskNodeRow) => ({
        id: n.id,
        rootId: n.root_id,
        parentId: n.parent_id,
        projectId: n.project_id,
        chatId: n.chat_id,
        description: n.description,
        taskType: n.task_type,
        assignedAgentId: n.assigned_agent_id,
        depth: n.depth,
        dependencies: n.dependencies,
        status: n.status,
        attempt: n.attempt,
        maxAttempts: n.max_attempts,
        context: n.context,
        result: n.result,
        error: n.error,
        tokenBudget: n.token_budget,
        tokensUsed: n.tokens_used,
        createdAt: n.created_at,
        startedAt: n.started_at,
        completedAt: n.completed_at,
      });

      return reply.send(ok({
        root: mapNode(root),
        children: children.map(mapNode),
        stats,
      }));
    },
  );

  // GET /api/v1/decomposition/:rootId/nodes/:nodeId — single node with dep details
  fastify.get(
    '/:rootId/nodes/:nodeId',
    { preHandler: [fastify.requireAuth] },
    async (request, reply) => {
      const { rootId, nodeId } = request.params as { rootId: string; nodeId: string };

      const { rows } = await pool.query<TaskNodeRow>(
        `SELECT
           id, root_id, parent_id, project_id, chat_id,
           description, task_type, assigned_agent_id,
           depth, dependencies, status, attempt, max_attempts,
           context, result, error, token_budget, tokens_used,
           created_at, started_at, completed_at
         FROM task_nodes
         WHERE id = $1 AND root_id = $2`,
        [nodeId, rootId],
      );

      if (rows.length === 0) {
        return reply.code(404).send(err('NOT_FOUND', `Node ${nodeId} not found in decomposition ${rootId}`));
      }

      const node = rows[0];

      // Resolve dependency details
      let depDetails: Array<{
        id: string;
        description: string;
        status: string;
        result: Record<string, unknown> | null;
      }> = [];

      const depIds = node.dependencies;
      if (Array.isArray(depIds) && depIds.length > 0) {
        const { rows: depRows } = await pool.query<{
          id: string;
          description: string;
          status: string;
          result: Record<string, unknown> | null;
        }>(
          `SELECT id, description, status, result
           FROM task_nodes
           WHERE id = ANY($1::text[])`,
          [depIds],
        );
        depDetails = depRows;
      }

      return reply.send(ok({
        node: {
          id: node.id,
          rootId: node.root_id,
          parentId: node.parent_id,
          projectId: node.project_id,
          chatId: node.chat_id,
          description: node.description,
          taskType: node.task_type,
          assignedAgentId: node.assigned_agent_id,
          depth: node.depth,
          dependencies: node.dependencies,
          status: node.status,
          attempt: node.attempt,
          maxAttempts: node.max_attempts,
          context: node.context,
          result: node.result,
          error: node.error,
          tokenBudget: node.token_budget,
          tokensUsed: node.tokens_used,
          createdAt: node.created_at,
          startedAt: node.started_at,
          completedAt: node.completed_at,
        },
        dependencies: depDetails,
      }));
    },
  );
}
