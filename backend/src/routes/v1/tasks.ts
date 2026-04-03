/**
 * Task Dispatch Routes (Phase 39)
 *
 * REST API surface for Bridge task dispatch. Callers POST a task, get a
 * task_id back immediately (202), and watch progress via SSE or polling.
 *
 * Routes:
 *   POST   /api/v1/tasks/dispatch      — create and start a task
 *   GET    /api/v1/tasks/:id           — get task status + output
 *   DELETE /api/v1/tasks/:id/cancel    — abort running task
 *   GET    /api/v1/tasks               — list tasks with optional filters
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';
import { broadcast } from '../../services/sse-hub.js';
import {
  executeTask,
  validateCwd,
  TASK_CAPABLE_TYPES,
  getTaskQueue,
} from '../../services/bridge/task-executor.js';
import {
  executeHttpTask,
  HTTP_TASK_CAPABLE_TYPES,
  type HttpGatewayConfig,
} from '../../services/bridge/http-task-executor.js';
import { createAdapter } from '../../services/bridge/adapters/index.js';
import type { GatewayType } from '../../services/bridge/types.js';
import { normalizeCapabilities } from '../../services/bridge/capability-registry.js';
import type { GatewayCapabilityRecord } from '../../services/bridge/capability-registry.js';

// ── In-memory abort controllers (for cancellation) ───────────────────────────

const runningTasks = new Map<string, AbortController>();

// ── Binary path defaults per gateway type ────────────────────────────────────

const BINARY_DEFAULTS: Record<string, string> = {
  claude_cli: 'claude',
  gemini_cli: 'gemini',
  codex_cli: 'codex',
};

// ── Capability filter helpers ─────────────────────────────────────────────────

/** GWC-02: Cost tier rank for max-budget filtering (lower rank = cheaper) */
const COST_TIER_RANK: Record<string, number> = { premium: 2, standard: 1, budget: 0 };

// ── DB row type for raw gateways query ───────────────────────────────────────

interface GatewayDbRow {
  id: string;
  type: string;
  name: string;
  url: string | null;
  auth_method: string;
  status: string;
  source: string;
  priority: number;
  capabilities: unknown;
  metadata: unknown;
  enabled: number;
  masked_display: string;
  created_at: number | null;
  updated_at: number | null;
  last_health_at: number | null;
}

// ── HTTP config builder ───────────────────────────────────────────────────────

const HTTP_DEFAULT_URLS: Record<string, string> = {
  openclaw: 'http://127.0.0.1:18789',
  ollama: 'http://127.0.0.1:11434',
};

const HTTP_DEFAULT_TOKENS: Record<string, string | undefined> = {
  openclaw: process.env.OPENCLAW_TOKEN ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? 'lobster-2026',
  ollama: undefined, // no auth
};

const HTTP_DEFAULT_MODELS: Record<string, string> = {
  openclaw: 'openai-codex/gpt-5.4',
  ollama: 'qwen2.5-coder:1.5b',
};

/**
 * Build an HttpGatewayConfig from a DB row for openclaw/ollama gateways.
 */
function buildHttpConfig(
  type: string,
  row: GatewayDbRow,
  meta: Record<string, unknown>,
  modelName: string,
): HttpGatewayConfig {
  const baseUrl = row.url ?? HTTP_DEFAULT_URLS[type] ?? `http://127.0.0.1`;
  const token = (meta.token as string | undefined)
    ?? HTTP_DEFAULT_TOKENS[type];
  const model = (meta.default_model as string | undefined)
    ?? HTTP_DEFAULT_MODELS[type]
    ?? modelName;

  return {
    type: type as 'openclaw' | 'ollama',
    baseUrl,
    token,
    model,
  };
}

// ── Background execution ──────────────────────────────────────────────────────

/**
 * Shared event-loop body — processes TaskEvent objects from either a CLI or
 * HTTP generator and writes progress to SSE + DB.
 */
async function processTaskEvents(
  taskId: string,
  gatewayType: GatewayType,
  startEpoch: number,
  ac: AbortController,
  eventSource: AsyncGenerator<import('../../services/bridge/types.js').TaskEvent>,
): Promise<{ finalBroadcast: boolean }> {
  let outputChunks: string[] = [];
  let finalBroadcast = false;

  try {
    for await (const event of eventSource) {
      if (event.type === 'progress' && event.text) {
        outputChunks.push(event.text);
        broadcast('bridge:task-progress', {
          task_id: taskId,
          type: 'progress',
          text: event.text,
          gateway_type: gatewayType,
        });
      } else if (event.type === 'tool_use') {
        broadcast('bridge:task-progress', {
          task_id: taskId,
          type: 'tool_use',
          tool: event.tool,
          gateway_type: gatewayType,
        });
      } else if (event.type === 'tool_result') {
        broadcast('bridge:task-progress', {
          task_id: taskId,
          type: 'tool_result',
          tool: event.tool,
          gateway_type: gatewayType,
        });
      } else if (event.type === 'result') {
        const status = event.exitCode === 0 ? 'complete' : 'failed';
        const durationMs = event.durationMs ?? Date.now() - startEpoch;
        const output = outputChunks.join('');

        await pool.query(
          `UPDATE bridge_tasks
             SET status = $1,
                 output = $2,
                 exit_code = $3,
                 completed_at = EXTRACT(EPOCH FROM NOW()),
                 duration_ms = $4
           WHERE id = $5`,
          [status, output, event.exitCode ?? null, durationMs, taskId],
        );

        broadcast('bridge:task-complete', {
          task_id: taskId,
          status,
          exit_code: event.exitCode ?? null,
          duration_ms: durationMs,
        });
        finalBroadcast = true;
      } else if (event.type === 'error') {
        const durationMs = event.durationMs ?? Date.now() - startEpoch;
        const output = outputChunks.join('');
        const errorText = event.text ?? undefined;

        await pool.query(
          `UPDATE bridge_tasks
             SET status = 'failed',
                 output = $1,
                 error = $2,
                 exit_code = $3,
                 completed_at = EXTRACT(EPOCH FROM NOW()),
                 duration_ms = $4
           WHERE id = $5`,
          [output, errorText ?? null, event.exitCode ?? null, durationMs, taskId],
        );

        broadcast('bridge:task-complete', {
          task_id: taskId,
          status: 'failed',
          exit_code: event.exitCode ?? null,
          duration_ms: durationMs,
        });
        finalBroadcast = true;
      }
    }
  } catch (execErr) {
    const durationMs = Date.now() - startEpoch;
    const output = outputChunks.join('');
    const errorMsg = execErr instanceof Error ? execErr.message : String(execErr);

    await pool.query(
      `UPDATE bridge_tasks
         SET status = 'failed',
             output = $1,
             error = $2,
             completed_at = EXTRACT(EPOCH FROM NOW()),
             duration_ms = $3
       WHERE id = $4`,
      [output, errorMsg, durationMs, taskId],
    );

    if (!finalBroadcast) {
      broadcast('bridge:task-complete', {
        task_id: taskId,
        status: 'failed',
        duration_ms: durationMs,
      });
      finalBroadcast = true;
    }
  }

  return { finalBroadcast };
}

/**
 * Runs the task in background (CLI or HTTP), streaming progress to SSE and
 * persisting incremental + final output to bridge_tasks.
 */
async function runTaskInBackground(
  taskId: string,
  gatewayType: GatewayType,
  binaryPath: string,
  prompt: string,
  cwd: string,
  timeoutMs: number | undefined,
  ac: AbortController,
  httpConfig?: HttpGatewayConfig,
  toolSupport?: string,
  tools?: string[],
): Promise<void> {
  const startEpoch = Date.now();

  // Mark as running
  await pool.query(
    `UPDATE bridge_tasks SET status = 'running', started_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $1`,
    [taskId],
  );

  broadcast('bridge:task-progress', {
    task_id: taskId,
    type: 'started',
    gateway_type: gatewayType,
  });

  let finalBroadcast = false;

  try {
    await getTaskQueue(gatewayType).add(async () => {
      // ── Choose executor based on gateway type ──────────────────────────
      const effectiveToolSupport = (toolSupport as 'full' | 'limited' | 'none' | undefined) ?? 'full';
      const eventSource = HTTP_TASK_CAPABLE_TYPES.has(gatewayType) && httpConfig
        ? executeHttpTask(httpConfig, prompt, cwd, ac.signal, effectiveToolSupport)
        : executeTask(binaryPath, gatewayType, prompt, cwd, ac.signal, timeoutMs, tools);

      const result = await processTaskEvents(taskId, gatewayType, startEpoch, ac, eventSource);
      finalBroadcast = result.finalBroadcast;
    });
  } finally {
    runningTasks.delete(taskId);

    // Safety net: if generator ended without a result/error event, mark complete
    if (!finalBroadcast) {
      const status = ac.signal.aborted ? 'cancelled' : 'complete';
      const durationMs = Date.now() - startEpoch;

      const { rows: taskRows } = await pool.query(
        `SELECT output FROM bridge_tasks WHERE id = $1`,
        [taskId],
      );
      const output = (taskRows[0] as { output: string | null })?.output ?? '';

      await pool.query(
        `UPDATE bridge_tasks
           SET status = $1,
               output = $2,
               completed_at = EXTRACT(EPOCH FROM NOW()),
               duration_ms = $3
         WHERE id = $4`,
        [status, output, durationMs, taskId],
      );

      broadcast('bridge:task-complete', {
        task_id: taskId,
        status,
        duration_ms: durationMs,
      });
    }
  }
}

// ── Route plugin ─────────────────────────────────────────────────────────────

export default async function tasksV1Routes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // POST /api/v1/tasks/dispatch — create and start a task
  fastify.post(
    '/dispatch',
    { preHandler: [fastify.requireAuth] },
    async (request, reply) => {
      const user = request.sessionUser!;
      const body = request.body as Record<string, unknown>;

      // ── Input validation ─────────────────────────────────────────────────

      const prompt = body.prompt;
      const cwd = body.cwd;
      const gateway = body.gateway as string | undefined;
      const agentId = body.agent_id as string | undefined;
      const projectId = body.project_id as string | undefined;
      const timeoutMs = body.timeout_ms as number | undefined;
      // GWC-02: Capability filtering params
      const requiredStrengths = body.required_strengths as string[] | undefined;
      const costTierMax = body.cost_tier_max as 'premium' | 'standard' | 'budget' | undefined;
      // GWC-03: CLI tool allowlist
      const tools = body.tools as string[] | undefined;

      if (typeof prompt !== 'string' || prompt.trim().length === 0) {
        return reply.code(400).send(err('VALIDATION_ERROR', 'prompt is required'));
      }
      if (prompt.length > 50_000) {
        return reply.code(400).send(err('VALIDATION_ERROR', 'prompt exceeds 50,000 character limit'));
      }
      if (typeof cwd !== 'string' || cwd.trim().length === 0) {
        return reply.code(400).send(err('VALIDATION_ERROR', 'cwd is required'));
      }
      if (timeoutMs !== undefined) {
        if (typeof timeoutMs !== 'number' || timeoutMs < 60_000 || timeoutMs > 600_000) {
          return reply.code(400).send(err('VALIDATION_ERROR', 'timeout_ms must be between 60000 and 600000'));
        }
      }

      // ── CWD validation ───────────────────────────────────────────────────

      try {
        validateCwd(cwd);
      } catch (e) {
        return reply.code(400).send(err('INVALID_CWD', e instanceof Error ? e.message : String(e)));
      }

      // ── Gateway selection ────────────────────────────────────────────────

      let selectedGatewayType: GatewayType;
      let binaryPath: string;
      let modelName: string;
      let httpConfig: HttpGatewayConfig | undefined;
      let toolSupport: string | undefined;

      if (gateway) {
        // Explicit gateway requested — validate it's task-capable
        if (!TASK_CAPABLE_TYPES.has(gateway as GatewayType)) {
          return reply.code(400).send(
            err(
              'GATEWAY_NOT_TASK_CAPABLE',
              `Gateway type "${gateway}" does not support task dispatch. Supported: ${[...TASK_CAPABLE_TYPES].join(', ')}`,
            ),
          );
        }

        const { rows } = await pool.query<GatewayDbRow>(
          `SELECT id, type, name, url, auth_method, status, source, priority,
                  capabilities, metadata, enabled, masked_display,
                  created_at, updated_at, last_health_at
           FROM gateways
           WHERE type = $1 AND status = 'active' AND enabled = 1
           ORDER BY priority ASC
           LIMIT 1`,
          [gateway],
        );

        if (rows.length === 0) {
          return reply.code(503).send(
            err('GATEWAY_UNAVAILABLE', `No active gateway of type "${gateway}" found`),
          );
        }

        const raw = rows[0];
        const meta = (typeof raw.metadata === 'object' && raw.metadata !== null)
          ? (raw.metadata as Record<string, unknown>)
          : {};
        selectedGatewayType = raw.type as GatewayType;
        binaryPath = (meta.binary_path as string | undefined) ?? BINARY_DEFAULTS[raw.type] ?? raw.type;
        modelName = (meta.default_model as string | undefined) ?? raw.name;

        // GWC-03: Extract tool_support from explicit gateway capabilities
        const rawCaps = normalizeCapabilities(raw.capabilities);
        toolSupport = rawCaps?.tool_support ?? 'full';

        // Build HTTP config for HTTP-type gateways
        if (HTTP_TASK_CAPABLE_TYPES.has(selectedGatewayType)) {
          httpConfig = buildHttpConfig(selectedGatewayType, raw, meta, modelName);
        }
      } else {
        // Auto-select: pick highest-priority active task-capable gateway
        const { rows } = await pool.query<GatewayDbRow>(
          `SELECT id, type, name, url, auth_method, status, source, priority,
                  capabilities, metadata, enabled, masked_display,
                  created_at, updated_at, last_health_at
           FROM gateways
           WHERE status = 'active' AND enabled = 1
           ORDER BY priority ASC`,
        );

        const taskCapable = rows.filter((r) => TASK_CAPABLE_TYPES.has(r.type as GatewayType));

        if (taskCapable.length === 0) {
          return reply.code(503).send(
            err('NO_TASK_CAPABLE_GATEWAY', 'No active task-capable gateways available (need claude_cli, gemini_cli, codex_cli, openclaw, or ollama)'),
          );
        }

        // GWC-02: Filter by capability requirements, then pick by priority
        let capFiltered = taskCapable;
        if (requiredStrengths?.length || costTierMax) {
          const maxRank = costTierMax ? (COST_TIER_RANK[costTierMax] ?? 2) : 2;

          const filtered = taskCapable.filter(row => {
            const caps = normalizeCapabilities(row.capabilities);
            if (!caps) return true; // unstructured — don't filter out

            const tierRank = COST_TIER_RANK[caps.cost_tier] ?? 2;
            if (tierRank > maxRank) return false;

            if (requiredStrengths?.length) {
              if (!requiredStrengths.every(s => caps.strengths.includes(s as GatewayCapabilityRecord['strengths'][number]))) return false;
            }
            return true;
          });

          if (filtered.length > 0) capFiltered = filtered; // graceful degradation
        }

        const chosen = capFiltered[0];
        const meta = (typeof chosen.metadata === 'object' && chosen.metadata !== null)
          ? (chosen.metadata as Record<string, unknown>)
          : {};
        selectedGatewayType = chosen.type as GatewayType;
        binaryPath = (meta.binary_path as string | undefined) ?? BINARY_DEFAULTS[chosen.type] ?? chosen.type;
        modelName = (meta.default_model as string | undefined) ?? chosen.name;

        // GWC-03: Extract tool_support from chosen gateway capabilities
        const chosenCaps = normalizeCapabilities(chosen.capabilities);
        toolSupport = chosenCaps?.tool_support ?? 'full';

        // Build HTTP config for HTTP-type gateways
        if (HTTP_TASK_CAPABLE_TYPES.has(selectedGatewayType)) {
          httpConfig = buildHttpConfig(selectedGatewayType, chosen, meta, modelName);
        }
      }

      // ── Create task row ──────────────────────────────────────────────────

      const taskId = uuidv4();

      await pool.query(
        `INSERT INTO bridge_tasks
           (id, gateway_type, model_name, prompt, cwd, status, username, agent_id, project_id)
         VALUES ($1, $2, $3, $4, $5, 'queued', $6, $7, $8)`,
        [taskId, selectedGatewayType, modelName, prompt, cwd, user.username, agentId ?? null, projectId ?? null],
      );

      // ── Spawn background execution ───────────────────────────────────────

      const ac = new AbortController();
      runningTasks.set(taskId, ac);

      // Fire and forget — do not await
      void runTaskInBackground(
        taskId,
        selectedGatewayType,
        binaryPath,
        prompt,
        cwd,
        timeoutMs,
        ac,
        httpConfig,
        toolSupport,
        tools,
      );

      return reply.code(202).send(
        ok({ task_id: taskId, status: 'queued', gateway_type: selectedGatewayType, model: modelName }),
      );
    },
  );

  // GET /api/v1/tasks/:id — get task status + output
  fastify.get(
    '/:id',
    { preHandler: [fastify.requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const { rows } = await pool.query(
        `SELECT id, status, gateway_type, model_name, prompt, cwd,
                output, error, exit_code, started_at, completed_at, duration_ms, created_at
         FROM bridge_tasks WHERE id = $1`,
        [id],
      );

      if (rows.length === 0) {
        return reply.code(404).send(err('TASK_NOT_FOUND', `Task ${id} not found`));
      }

      return reply.send(ok(rows[0]));
    },
  );

  // DELETE /api/v1/tasks/:id/cancel — abort running task
  fastify.delete(
    '/:id/cancel',
    { preHandler: [fastify.requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const { rows } = await pool.query(
        `SELECT status FROM bridge_tasks WHERE id = $1`,
        [id],
      );

      if (rows.length === 0) {
        return reply.code(404).send(err('TASK_NOT_FOUND', `Task ${id} not found`));
      }

      const { status } = rows[0] as { status: string };

      if (status !== 'running' && status !== 'queued') {
        return reply.code(409).send(
          err('TASK_NOT_CANCELLABLE', 'Task is not running or queued'),
        );
      }

      // Send abort signal to subprocess
      runningTasks.get(id)?.abort();

      // Mark cancelled in DB
      await pool.query(
        `UPDATE bridge_tasks SET status = 'cancelled', completed_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $1`,
        [id],
      );

      broadcast('bridge:task-complete', { task_id: id, status: 'cancelled' });

      return reply.send(ok({ task_id: id, status: 'cancelled' }));
    },
  );

  // GET /api/v1/tasks — list tasks with optional filters
  fastify.get(
    '/',
    { preHandler: [fastify.requireAuth] },
    async (request, reply) => {
      const query = request.query as Record<string, string | undefined>;
      const statusFilter = query.status;
      const gatewayFilter = query.gateway_type;
      const limit = Math.min(parseInt(query.limit ?? '50', 10) || 50, 200);
      const offset = parseInt(query.offset ?? '0', 10) || 0;

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (statusFilter) {
        params.push(statusFilter);
        conditions.push(`status = $${params.length}`);
      }
      if (gatewayFilter) {
        params.push(gatewayFilter);
        conditions.push(`gateway_type = $${params.length}`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      params.push(limit);
      const limitParam = params.length;
      params.push(offset);
      const offsetParam = params.length;

      const { rows: tasks } = await pool.query(
        `SELECT id, status, gateway_type, model_name, prompt, cwd,
                output, error, exit_code, started_at, completed_at, duration_ms, created_at
         FROM bridge_tasks
         ${where}
         ORDER BY created_at DESC
         LIMIT $${limitParam} OFFSET $${offsetParam}`,
        params,
      );

      // Total count (without limit/offset)
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM bridge_tasks ${where}`,
        params.slice(0, conditions.length),
      );

      return reply.send(ok({ tasks, total: countRows[0].total }));
    },
  );
}
