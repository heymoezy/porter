/**
 * decomposition-engine.ts — Task Decomposition Engine: Phase 42 Plan 03
 *
 * Single entry point that orchestrates the full TDE pipeline:
 *   classify -> plan -> execute -> join -> synthesize
 *
 * decomposeAndExecute() returns immediately with { rootId, taskCount }.
 * The execution + join pipeline runs fire-and-forget in the background,
 * broadcasting SSE events at each stage and saving the synthesized response
 * to chat history when done.
 *
 * Exports: decomposeAndExecute
 */

import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../db/client.js';
import { broadcast } from '../sse-hub.js';
import { planTasks, insertTaskTree } from './task-planner.js';
import { executeTaskTree } from './dag-executor.js';
import { joinResults } from './task-joiner.js';
import type { PlanRequest } from './types.js';

// ── decomposeAndExecute ────────────────────────────────────────────────────────

/**
 * Orchestrate the full decomposition pipeline for a complex message.
 *
 * Steps:
 * 1. Generate a rootId (UUID)
 * 2. Load available agents for the project context (best-effort)
 * 3. Plan: call planTasks() -> PlanResult (LLM-generated DAG)
 * 4. Insert: call insertTaskTree() -> task_nodes rows in a transaction
 * 5. Broadcast decomposition:started SSE with task summary
 * 6. Fire-and-forget the execute -> join -> save pipeline
 * 7. Return immediately: { rootId, taskCount }
 *
 * @param message - The complex user message to decompose
 * @param opts - Optional project/chat/user context
 */
export async function decomposeAndExecute(
  message: string,
  opts: {
    projectId?: string;
    chatId?: string;
    userId?: string;
  } = {},
): Promise<{ rootId: string; taskCount: number }> {
  const rootId = uuidv4();

  // Load available agents for the project (best-effort)
  // Currently personas aren't project-scoped so we use all active agents
  let availableAgents: PlanRequest['availableAgents'] = [];
  try {
    const { rows: agentRows } = await pool.query<{
      id: string;
      name: string;
      role: string;
    }>(
      `SELECT id, name, role FROM personas WHERE status = 'active' LIMIT 10`,
    );
    availableAgents = agentRows.map(r => ({
      id: r.id,
      name: r.name,
      role: r.role ?? undefined,
    }));
  } catch {
    // Agent loading is best-effort — planner handles empty list gracefully
  }

  // 1. Plan: generate DAG from message
  const plan = await planTasks({
    message,
    projectId: opts.projectId,
    chatId: opts.chatId,
    availableAgents,
  });

  // 2. Insert task tree (atomic transaction: root + subtasks)
  const nodes = await insertTaskTree(rootId, plan, {
    message,
    projectId: opts.projectId,
    chatId: opts.chatId,
    availableAgents,
  });

  // 3. Broadcast decomposition:started with task summary
  const taskSummaries = nodes
    .filter(n => n.depth > 0)
    .map(n => ({
      id: n.id,
      description: n.description,
      deps: n.dependencies,
    }));

  broadcast('decomposition:started', {
    rootId,
    taskCount: plan.tasks.length,
    tasks: taskSummaries,
  });

  // 4. Fire-and-forget: execute -> join -> save -> broadcast complete
  void (async () => {
    try {
      // Execute: run all subtasks via parallel DAG dispatch
      await executeTaskTree(rootId);

      // Join: synthesize results into coherent response
      const joined = await joinResults(rootId);

      // Update root node with synthesis outcome
      const finalStatus =
        joined.action === 'synthesized' || joined.action === 'partial'
          ? 'completed'
          : 'failed';

      await pool.query(
        `UPDATE task_nodes
         SET status = $1, result = $2::jsonb, completed_at = EXTRACT(EPOCH FROM NOW())
         WHERE id = $3`,
        [
          finalStatus,
          JSON.stringify({ synthesis: joined.response, action: joined.action }),
          rootId,
        ],
      );

      // Handle replan: for v1 mark as failed with replan note
      if (joined.action === 'replan') {
        broadcast('decomposition:replan', {
          rootId,
          failedTasks: joined.failedTasks ?? [],
        });
        await pool.query(
          `UPDATE task_nodes
           SET status = 'failed', error = 'Replan needed — manual intervention required'
           WHERE id = $1`,
          [rootId],
        );
      }

      // Save synthesized response to chat history if chatId provided
      if (opts.chatId && joined.response) {
        try {
          await pool.query(
            `INSERT INTO chat_messages (chat_id, role, content, model_id, timestamp)
             VALUES ($1, 'assistant', $2, 'porter-synthesis', NOW())`,
            [opts.chatId, joined.response],
          );
          await pool.query(
            `UPDATE chats SET updated_at = NOW() WHERE id = $1`,
            [opts.chatId],
          );
        } catch {
          // Chat persistence is best-effort
        }
      }

      // Broadcast completion
      broadcast('decomposition:complete', {
        rootId,
        chatId: opts.chatId ?? null,
        response: joined.response,
        action: joined.action,
        failedTasks: joined.failedTasks ?? [],
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      // Update root node as failed
      try {
        await pool.query(
          `UPDATE task_nodes
           SET status = 'failed', error = $1, completed_at = EXTRACT(EPOCH FROM NOW())
           WHERE id = $2`,
          [errorMsg, rootId],
        );
      } catch {
        // Best-effort — don't throw inside fire-and-forget
      }

      broadcast('decomposition:failed', { rootId, error: errorMsg });
    }
  })();

  return { rootId, taskCount: plan.tasks.length };
}
