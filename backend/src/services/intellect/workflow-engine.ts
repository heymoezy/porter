/**
 * Intellect Workflow Engine
 *
 * Minimal event-driven workflow runner. Workflows live in the `workflows`
 * table — each row pairs a trigger (event name, cron expression, or manual)
 * with an action type and optional config. When `emitEvent(eventName)` is
 * called, all enabled workflows with `trigger_type='event'` and
 * `trigger_value=eventName` fire.
 *
 * For Phase 2 the action registry is small — Intellect's own maintenance
 * jobs. Phase 3 will add agent-triggered actions (Intellect dispatching
 * jobs to workers via the agent scheduler).
 *
 * Design notes:
 *   - Workflows are stored, not code — enable/disable/priority live in DB.
 *   - The engine does NOT own the scheduler — cron triggers are handled by
 *     the existing scheduler.ts tick loop. This engine only fires on
 *     `emitEvent()` calls.
 *   - Action handlers are in-process functions registered at startup.
 *   - Failures are logged but do not throw — one broken workflow must not
 *     stop the event loop.
 */

import { randomUUID } from 'node:crypto';
import { pool } from '../../db/client.js';
import { logIntellectEvent } from './file-watcher.js';
import { analyzeAndStoreSession, sweepStaleSessions } from './session-analyzer.js';
import { runMemoryValidation } from './memory-validator.js';
import { runMemoryPromotion } from './memory-promoter.js';
import { runDispatchScoring } from './dispatch-scorer.js';
import { runMemoryPruning } from './memory-pruner.js';
import { runSelfMonitor } from './self-monitor.js';
import { runPatternMining } from './pattern-miner.js';
import { runToolDetection } from './tool-detector.js';

// ── Types ───────────────────────────────────────────────────────────────

export type WorkflowActionType =
  | 'session_analyze'
  | 'sweep_stale_sessions'
  | 'memory_validate'
  | 'memory_promote'
  | 'dispatch_score'
  | 'memory_prune'
  | 'self_monitor'
  | 'pattern_mine'
  | 'tool_detect'
  | 'noop';

export interface WorkflowRow {
  id: string;
  name: string;
  trigger_type: 'event' | 'schedule' | 'manual';
  trigger_value: string;
  agent_id: string | null;
  action_type: string;
  action_config: Record<string, unknown>;
  enabled: boolean;
  last_run_at: number | null;
  run_count: number;
}

export interface EventContext {
  sessionId?: string;
  project?: string | null;
  gateway?: string | null;
  [key: string]: unknown;
}

// ── Action registry ─────────────────────────────────────────────────────

type ActionHandler = (ctx: EventContext, config: Record<string, unknown>) => Promise<unknown>;

const actionHandlers: Record<WorkflowActionType, ActionHandler> = {
  session_analyze: async (ctx) => {
    if (!ctx.sessionId) throw new Error('session_analyze requires sessionId');
    return analyzeAndStoreSession({
      sessionId: ctx.sessionId,
      project: ctx.project ?? null,
      gateway: ctx.gateway ?? null,
    });
  },
  sweep_stale_sessions: async (_ctx, config) => {
    const staleness = (config.stalenessSeconds as number) ?? 1800;
    return sweepStaleSessions(staleness);
  },
  memory_validate: async () => runMemoryValidation(),
  memory_promote: async () => runMemoryPromotion(),
  dispatch_score: async () => runDispatchScoring(),
  memory_prune: async () => runMemoryPruning(),
  self_monitor: async () => runSelfMonitor(),
  pattern_mine: async () => runPatternMining(),
  tool_detect: async () => runToolDetection(),
  noop: async () => null,
};

function isKnownAction(name: string): name is WorkflowActionType {
  return name in actionHandlers;
}

// ── Event emitter ───────────────────────────────────────────────────────

/**
 * Fire all enabled workflows matching an event. Non-blocking — handlers
 * run concurrently but errors are isolated.
 */
export async function emitEvent(eventName: string, ctx: EventContext = {}): Promise<void> {
  const { rows } = await pool.query<WorkflowRow>(
    `SELECT id, name, trigger_type, trigger_value, agent_id,
            action_type, action_config, enabled, last_run_at, run_count
     FROM workflows
     WHERE trigger_type = 'event' AND trigger_value = $1 AND enabled = true`,
    [eventName]
  );

  if (rows.length === 0) return;

  await Promise.all(rows.map(row => runWorkflow(row, ctx)));
}

async function runWorkflow(workflow: WorkflowRow, ctx: EventContext): Promise<void> {
  if (!isKnownAction(workflow.action_type)) {
    console.warn(`[intellect:workflow] unknown action_type "${workflow.action_type}" on workflow ${workflow.id}`);
    return;
  }

  const handler = actionHandlers[workflow.action_type];
  const started = Date.now();
  try {
    const result = await handler(ctx, workflow.action_config ?? {});
    const durationMs = Date.now() - started;
    await pool.query(
      `UPDATE workflows
       SET last_run_at = EXTRACT(EPOCH FROM NOW()),
           run_count = run_count + 1
       WHERE id = $1`,
      [workflow.id]
    );
    await logIntellectEvent('workflow_ran', 'workflow_engine', {
      workflowId: workflow.id,
      name: workflow.name,
      actionType: workflow.action_type,
      trigger: workflow.trigger_value,
      durationMs,
      resultPreview: summarizeResult(result),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[intellect:workflow] ${workflow.name} failed: ${message}`);
    await logIntellectEvent('workflow_failed', 'workflow_engine', {
      workflowId: workflow.id,
      name: workflow.name,
      actionType: workflow.action_type,
      error: message,
    });
  }
}

function summarizeResult(result: unknown): unknown {
  if (result == null) return null;
  if (typeof result === 'number' || typeof result === 'string' || typeof result === 'boolean') return result;
  if (Array.isArray(result)) return { length: result.length };
  if (typeof result === 'object') {
    // Only keep scalar fields to keep the event log compact
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(result as Record<string, unknown>)) {
      if (v == null) continue;
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
        out[k] = v;
      } else if (Array.isArray(v)) {
        out[k] = `[${v.length}]`;
      }
    }
    return out;
  }
  return null;
}

// ── Scheduled action runner ─────────────────────────────────────────────

/**
 * Run workflows that match `trigger_type='schedule'` AND `trigger_value=tag`.
 * The caller (scheduler.ts) is responsible for calling this at the right
 * cadence — we don't parse cron expressions here, we just match a tag.
 *
 * Tags like: 'every_30m', 'every_6h', 'every_24h', 'every_tick'.
 */
export async function runScheduledWorkflows(tag: string, ctx: EventContext = {}): Promise<void> {
  const { rows } = await pool.query<WorkflowRow>(
    `SELECT id, name, trigger_type, trigger_value, agent_id,
            action_type, action_config, enabled, last_run_at, run_count
     FROM workflows
     WHERE trigger_type = 'schedule' AND trigger_value = $1 AND enabled = true`,
    [tag]
  );
  await Promise.all(rows.map(row => runWorkflow(row, ctx)));
}

// ── Built-in workflow seeding ───────────────────────────────────────────

interface SeedWorkflow {
  name: string;
  trigger_type: 'event' | 'schedule' | 'manual';
  trigger_value: string;
  action_type: WorkflowActionType;
  action_config?: Record<string, unknown>;
}

const BUILTIN_WORKFLOWS: SeedWorkflow[] = [
  {
    name: 'Analyze session on end',
    trigger_type: 'event',
    trigger_value: 'session.end',
    action_type: 'session_analyze',
  },
  {
    name: 'Sweep stale sessions (30 min idle)',
    trigger_type: 'schedule',
    trigger_value: 'every_30m',
    action_type: 'sweep_stale_sessions',
    action_config: { stalenessSeconds: 1800 },
  },
  {
    name: 'Validate memory references',
    trigger_type: 'schedule',
    trigger_value: 'every_30m',
    action_type: 'memory_validate',
  },
  {
    name: 'Promote reinforced corrections',
    trigger_type: 'schedule',
    trigger_value: 'every_30m',
    action_type: 'memory_promote',
  },
  {
    name: 'Score recent dispatches',
    trigger_type: 'schedule',
    trigger_value: 'every_6h',
    action_type: 'dispatch_score',
  },
  {
    name: 'Promote corrections on new directive',
    trigger_type: 'event',
    trigger_value: 'correction.detected',
    action_type: 'memory_promote',
  },
  {
    name: 'Prune stale memory daily',
    trigger_type: 'schedule',
    trigger_value: 'every_24h',
    action_type: 'memory_prune',
  },
  {
    name: 'Self-monitor Intellect health',
    trigger_type: 'schedule',
    trigger_value: 'every_6h',
    action_type: 'self_monitor',
  },
  {
    name: 'Mine memory for patterns',
    trigger_type: 'schedule',
    trigger_value: 'every_24h',
    action_type: 'pattern_mine',
  },
  {
    name: 'Detect available tools',
    trigger_type: 'schedule',
    trigger_value: 'every_6h',
    action_type: 'tool_detect',
  },
];

/** Insert built-in workflows (idempotent by name). Call once at startup. */
export async function seedBuiltinWorkflows(): Promise<void> {
  for (const wf of BUILTIN_WORKFLOWS) {
    await pool.query(
      `INSERT INTO workflows
        (id, name, trigger_type, trigger_value, action_type, action_config, enabled)
       SELECT $1, $2, $3, $4, $5, $6::jsonb, true
       WHERE NOT EXISTS (SELECT 1 FROM workflows WHERE name = $2)`,
      [
        randomUUID(),
        wf.name,
        wf.trigger_type,
        wf.trigger_value,
        wf.action_type,
        JSON.stringify(wf.action_config ?? {}),
      ]
    );
  }
}
