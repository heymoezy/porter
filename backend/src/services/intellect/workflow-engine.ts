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
import { runSubscriptionCheck } from './subscription-manager.js';
import { runTranscriptRetention } from './transcript-retention.js';
import { runDreamWorker } from './dream-worker.js';
import { runDirectivesMirror } from './vault-mirror.js';
import { runVaultIndexing } from './vault-indexer.js';
import { runFailureDigestDistill } from './failure-digest.js';
import { runClaudeRulesMirror } from './claude-rules-mirror.js';
import { runWorkerKnowledgeRefresh } from './worker-knowledge.js';
import { runGithubScan } from './github-scan.js';
import { runVaultDerivativeSweep } from '../vault-derivatives.js';
import { reconcileRunnables } from '../runnables.js';
import { broadcast } from '../sse-hub.js';

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
  | 'subscription_check'
  | 'transcript_retain'
  | 'dream_run'                 // Phase 48.3 — wired in 48.3-04 (runDreamWorker)
  | 'dream_runs_stuck_sweep'    // Phase 48.3 — fully wired here
  | 'memory_proposals_expire'   // Phase 48.4 — auto-expire pending proposals past expires_at
  | 'dream_proposals_review_digest' // PR-3 2026-07-04 — daily pending-proposals summary → intellect_events
  | 'vault_directives_mirror'   // U1 2026-07-05 — render active directives → vault mirrors/porter-directives.md
  | 'vault_concept_index'       // U2 2026-07-05 — index vault concepts/+entities/ → concepts (source_type='vault')
  | 'distill_failure_digest'    // rule-distillation loop 2026-07-05 — ymc failure evidence → ONE failure_digest intellect_event
  | 'claude_rules_mirror'       // U6 2026-07-06 — CLAUDE.md hard rules + project non-negotiables → ONE workspace directive
  | 'worker_knowledge_refresh'  // worker-knowledge loop 2026-07-06 — ONE due worker/day researched via CHEAP gateway → proposal
  | 'github_scan'               // worker-knowledge loop 2026-07-06 — weekly (state-gated) gh watchlist scan → digest proposal
  | 'runnables_reconcile'       // #52 2026-07-14 — re-discover systemd timers + workflows into the ONE registry
  | 'vault_derivative_sweep'    // Vault v2 R4 2026-07-07 — raw_file artifacts w/o markdown_derivative → generate via Bridge failover; stale detection
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

// ── Dream-proposal review digest (PR-3, 2026-07-04) ─────────────────────
//
// The dream worker writes memory_proposals rows that had NO reviewer once the
// admin SPA was archived (PR-2): 54 rows expired unreviewed vs 3 ever reviewed
// as of 2026-07-04. This digest closes the loop headlessly: once a day (on the
// existing every_24h workflow tick — no new timer) it appends ONE
// 'dream_proposals_pending' row to intellect_events summarizing what awaits
// review. Consumers poll GET /api/v1/intellect/events (Tom/ymc) and act via
// the existing review API: GET/POST /api/admin/dreams/proposals[/:id/accept|reject].
//
// Posture: the event payload carries ids/kinds/expiry ONLY — never
// proposed_content (dream-worker.ts: model response text must not be logged
// to intellect_events). Full content is one GET away. Zero pending = silent
// (no event), matching memory_proposals_expire.
export async function runDreamProposalsReviewDigest(): Promise<{
  pending: number;
  by_silo?: Record<string, number>;
  soonest_expires_at?: number | null;
  expiring_within_7d?: number;
}> {
  const { rows } = await pool.query<{
    id: string;
    silo_id: string;
    proposal_kind: string;
    conceptual_area: string | null;
    created_at: number;
    expires_at: number | null;
  }>(
    `SELECT id, silo_id, proposal_kind,
            proposed_metadata->>'conceptual_area' AS conceptual_area,
            created_at, expires_at
       FROM memory_proposals
      WHERE status = 'pending'
      ORDER BY expires_at ASC NULLS LAST, created_at ASC`,
  );
  if (rows.length === 0) return { pending: 0 };

  const bySilo: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  for (const r of rows) {
    bySilo[r.silo_id] = (bySilo[r.silo_id] ?? 0) + 1;
    byKind[r.proposal_kind] = (byKind[r.proposal_kind] ?? 0) + 1;
  }
  const nowEpoch = Date.now() / 1000;
  const expiries = rows.map(r => r.expires_at).filter((e): e is number => e != null);
  const soonest = expiries.length ? Math.min(...expiries) : null;
  const expiring7d = expiries.filter(e => e < nowEpoch + 7 * 86400).length;

  const summary = {
    pending: rows.length,
    by_silo: bySilo,
    by_kind: byKind,
    soonest_expires_at: soonest,
    expiring_within_7d: expiring7d,
    proposals: rows.slice(0, 20).map(r => ({
      id: r.id,
      silo_id: r.silo_id,
      kind: r.proposal_kind,
      conceptual_area: r.conceptual_area,
      expires_at: r.expires_at,
    })),
    review_api: 'GET /api/admin/dreams/proposals?status=pending · POST /api/admin/dreams/proposals/:id/{accept,reject} · GET /api/v1/intellect/dream-proposals',
  };
  await logIntellectEvent('dream_proposals_pending', 'dream_review_digest', summary);
  return summary;
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
  subscription_check: async () => runSubscriptionCheck(),
  transcript_retain: async () => runTranscriptRetention(pool),
  dream_run: async (_ctx, config) => {
    // Wired in Plan 48.3-04: scheduled every_week trigger invokes runDreamWorker for
    // the configured silo. Errors re-thrown by the worker bubble up here and get
    // caught by runWorkflow's outer try/catch (which logs workflow_failed).
    // SAFE DEFAULT (Phase 50 MSF-03): software is the dominant silo; explicit silo_id
    // (admin, data-room, future) in the workflow row's action_config ALWAYS overrides this fallback.
    const siloId = (config?.silo_id as string) ?? 'software';
    return runDreamWorker({ siloId, triggeredBy: 'schedule' });
  },
  dream_runs_stuck_sweep: async () => {
    const result = await pool.query(
      `UPDATE dream_runs
         SET status='failed',
             error_message='Worker process lost (stuck in running >30min)',
             completed_at=EXTRACT(EPOCH FROM NOW())
       WHERE status='running'
         AND started_at < EXTRACT(EPOCH FROM NOW()) - 1800`,
    );
    const swept = result.rowCount ?? 0;
    if (swept > 0) {
      console.log(`[dream_runs_stuck_sweep] flipped ${swept} stuck run(s) to failed`);
    }
    return { swept };
  },
  memory_proposals_expire: async () => {
    // Phase 48.4 — flip pending proposals past their expires_at to status='expired'.
    // Uses memory_proposals_expiry_idx partial index (status='pending', expires_at).
    // logIntellectEvent + broadcast post-mutation so connected admin clients clear
    // stale rows without a refresh. Empty sweeps are silent (no event, no broadcast).
    const result = await pool.query<{ id: string; silo_id: string }>(
      `UPDATE memory_proposals
         SET status='expired'
       WHERE status='pending'
         AND expires_at IS NOT NULL
         AND expires_at < EXTRACT(EPOCH FROM NOW())
       RETURNING id, silo_id`,
    );
    const expired = result.rowCount ?? 0;
    if (expired > 0) {
      await logIntellectEvent('proposals_expired', 'memory_proposals_expire', {
        count: expired,
        ids: result.rows.map(r => r.id).slice(0, 20),
      });
      broadcast('proposals:resolved', { event: 'expired', count: expired });
      console.log(`[memory_proposals_expire] flipped ${expired} stale proposal(s) to expired`);
    }
    return { expired };
  },
  dream_proposals_review_digest: async () => runDreamProposalsReviewDigest(),
  vault_directives_mirror: async () => runDirectivesMirror(),
  vault_concept_index: async () => runVaultIndexing(),
  claude_rules_mirror: async () => runClaudeRulesMirror(),
  // Rule-distillation loop (vault/concepts/rule-distillation-loop.md):
  // deterministic collect step — ymc failure evidence → one failure_digest
  // intellect_event. The dream worker mines it nightly (software silo).
  distill_failure_digest: async (_ctx, config) =>
    runFailureDigestDistill((config?.hours as number) ?? 24),
  // Worker knowledge-evolution loop (vault/concepts/worker-knowledge-loop.md):
  // both ride the every_24h tick; internal state files gate the real cadence
  // (per-node refresh_days round-robin / weekly scan floor). All model calls
  // are FORCED to the cheap gateway — never premium (see worker-knowledge.ts).
  worker_knowledge_refresh: async () => runWorkerKnowledgeRefresh({ triggeredBy: 'schedule' }),
  github_scan: async () => runGithubScan({ triggeredBy: 'schedule' }),
  // Vault v2 R4 (2026-07-07): derivative loop rides the same every_24h tick —
  // no new timer. Generic across every app_scope (no scope filter here).
  vault_derivative_sweep: async () => runVaultDerivativeSweep({ triggeredBy: 'schedule' }),
  // #52 — re-discover everything that runs. A registry that is itself stale cannot tell you what
  // has gone quiet, so this rides the same tick as everything else.
  runnables_reconcile: async () => reconcileRunnables(),
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
  {
    name: 'Check agent subscriptions for new content',
    trigger_type: 'schedule',
    trigger_value: 'every_6h',
    action_type: 'subscription_check',
  },
  {
    name: 'Prune transcripts older than 30 days',
    trigger_type: 'schedule',
    trigger_value: 'every_24h',
    action_type: 'transcript_retain',
  },
  // Phase 50 MSF-04 (deferred-items, 50-02): legacy 'Software dream — weekly consolidation'
  // BUILTIN_WORKFLOWS entry REMOVED. Single source of truth for per-silo dream cadence is now
  // silos.cadence_seconds, driven by scheduler.runSiloCadenceCheck (Plan 50-01). Keeping a
  // built-in startup re-seed here re-installed the row Plan 50-01's migration deleted, causing
  // duplicate weekly fires (skip-recent deduped, but audit logs gained orphan rows).
  // smoke-50.sh SC-18 asserts this row stays at count=0 across restarts.
  {
    name: 'Sweep stuck dream runs (>30 min)',
    trigger_type: 'schedule',
    trigger_value: 'every_30m',
    action_type: 'dream_runs_stuck_sweep',
    action_config: {},
  },
  {
    name: 'Expire stale memory proposals',
    trigger_type: 'schedule',
    trigger_value: 'every_24h',
    action_type: 'memory_proposals_expire',
    action_config: {},
  },
  {
    name: 'Daily dream-proposal review digest',
    trigger_type: 'schedule',
    trigger_value: 'every_24h',
    action_type: 'dream_proposals_review_digest',
    action_config: {},
  },
  // Memory unification (2026-07-05): U1 mirror + U2 indexer ride the same
  // every_24h tick as the pruner/digest — no new timer.
  {
    name: 'Mirror directives to vault',
    trigger_type: 'schedule',
    trigger_value: 'every_24h',
    action_type: 'vault_directives_mirror',
    action_config: {},
  },
  {
    name: 'Index vault concepts daily',
    trigger_type: 'schedule',
    trigger_value: 'every_24h',
    action_type: 'vault_concept_index',
    action_config: {},
  },
  // Memory unification U6 (2026-07-06): mirror Claude session rules
  // (CLAUDE.md hard rules + project non-negotiables) into ONE workspace
  // directive — same every_24h tick, no new timer, hash-idempotent.
  {
    name: 'Mirror Claude session rules',
    trigger_type: 'schedule',
    trigger_value: 'every_24h',
    action_type: 'claude_rules_mirror',
    action_config: {},
  },
  // Rule-distillation loop (2026-07-05): collect ymc failure evidence daily
  // on the same every_24h tick — no new timer (design doc "no patchwork").
  {
    name: 'Distill ymc failure digest',
    trigger_type: 'schedule',
    trigger_value: 'every_24h',
    action_type: 'distill_failure_digest',
    action_config: { hours: 24 },
  },
  // Worker knowledge-evolution loop (2026-07-06): refresh + github scan ride
  // the same every_24h tick — no new timers; cadence state lives in
  // <PORTER_DATA_DIR>/runtime/{worker-knowledge,github-scan}-state.json.
  {
    name: 'Refresh worker knowledge (round-robin, cheap gateway)',
    trigger_type: 'schedule',
    trigger_value: 'every_24h',
    action_type: 'worker_knowledge_refresh',
    action_config: {},
  },
  {
    name: 'Scan GitHub watchlist (weekly, zero-LLM diff)',
    trigger_type: 'schedule',
    trigger_value: 'every_24h',
    action_type: 'github_scan',
    action_config: {},
  },
  // Vault v2 R4 (2026-07-07): raw→markdown derivative loop — same every_24h
  // tick, no new timer. Finds vault_artifacts(kind='raw_file') with no/stale
  // markdown_derivative, generates one via Bridge (dispatchWithFailover, cheap
  // gateway preferred). Raw artifacts are never altered.
  {
    name: 'Vault derivative sweep (raw → markdown, stale-aware)',
    trigger_type: 'schedule',
    trigger_value: 'every_24h',
    action_type: 'vault_derivative_sweep',
    action_config: {},
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
