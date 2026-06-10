/**
 * dream-worker.ts — Phase 48.3 DRW-04 / DRW-05 / DRW-06 / DRW-07 / DRW-10 / DRW-11
 *
 * The consciousness layer. Reads silo-tagged transcripts, dispatches a refinement
 * synthesis prompt via Bridge, parses + validates + sort-orders the response,
 * inserts memory_proposals transactionally with all-or-nothing posture.
 *
 * Refinement Doctrine enforcement is THREE LAYERS:
 *   1. The prompt (software.md) instructs the model to refine first
 *   2. validateRefinementDoctrine() rejects runs that add without refining (when active>4)
 *   3. assignSortOrder() forces refine kinds to sort BEFORE new_directive at the DB level
 *
 * Bridge "raw passthrough" is achieved BY OMISSION here:
 *   - We do NOT build Memory V3 context
 *   - We do NOT call selectSkills
 *   - We do NOT call decideDoctrine
 *   - We do NOT prefix the system message with identity
 * The routingEngine.selectWithFallback path just sends the prompt and reads the response.
 * This replicates the {raw: true} contract from /api/v1/chat/stream by not engaging
 * those services in the first place. DO NOT add Memory V3 / skills / doctrine wiring
 * here in the future — that is the entire point of dream-time isolation.
 *
 * Dispatch log id: selectWithFallback does NOT call logDispatch internally — only
 * dispatchStream does. We therefore call routingEngine.logDispatch(decision, ctx,
 * result, undefined) EXPLICITLY after selectWithFallback returns, capture the
 * returned id, and use it for dream_runs.dispatch_id. Without this explicit call
 * the dispatch_id column would always be null and Plan 05's live verify of raw
 * passthrough (system_prompt inspection) could not run.
 *
 * Mock injection: when DREAM_WORKER_MOCK_RESPONSE_PATH env var is set, dispatchDream
 * reads that file and returns its contents without touching Bridge. SMOKE-TEST-ONLY —
 * production code paths never set this env var.
 *
 * NEVER log raw turn content or model response text to intellect_events / journald.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { pool } from '../../db/client.js';
import { routingEngine } from '../bridge/routing-engine.js';
import type { BridgeDispatchRequest, RoutingContext } from '../bridge/types.js';
import { logIntellectEvent } from './file-watcher.js';
import { broadcast } from '../sse-hub.js';
import { sampleSoftwareTurns, type SampledTurn } from './dream-sampler.js';
import {
  parseDreamResponse,
  validateRefinementDoctrine,
  assignSortOrder,
  type ParsedDreamResponse,
  type ParsedProposal,
  type ParsedFailurePattern,
} from './dream-parser.js';

const BRIDGE_TIMEOUT_MS = 180_000;
const EXPIRES_IN_S = 30 * 86400;
const ERROR_MESSAGE_CAP = 1000;

// ESM-safe __dirname (Porter backend is ESM — adjacent files use the .js import suffix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Types ───────────────────────────────────────────────────────────────────

export interface RunDreamArgs {
  siloId: string;
  triggeredBy: 'schedule' | 'manual';
  triggeredByUser?: string;
  modelOverride?: string;
  sampleSizeOverride?: number;
  dryRun?: boolean;
  dreamRunIdOverride?: string;
  /**
   * SMOKE-TEST-ONLY: per-invocation mock response path. Mirrors the
   * DREAM_WORKER_MOCK_RESPONSE_PATH env var but reachable via HTTP body
   * (env vars don't propagate across HTTP). When set, dispatchDream reads
   * this file and returns its contents instead of invoking Bridge.
   * Production code paths never set this; only tests/smoke-48.3.sh does.
   */
  mockResponsePath?: string;
}

export interface RunDreamResult {
  dreamRunId: string;
  proposalsExtracted: number;
  status: 'completed' | 'failed' | 'skipped';
}

// ── Phase 49 LRN-02 helpers ──────────────────────────────────────────────────
// slugifyPatternName: convert a free-form failure-pattern label into a
// stable conceptual_area suffix. Used inside proposed_metadata.conceptual_area
// (`failure-pattern:<slug>`) so the 48.4 review surface and Phase 51 filters
// can group/dedupe by pattern. Max 40 chars keeps the eventual conceptual_area
// well under proposalSchema's 60-char ceiling.
function slugifyPatternName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// ── dispatchDream: direct routingEngine call with mock-injection support ────

async function dispatchDream(
  promptBody: string,
  modelName: string,
  mockResponsePathArg?: string,
): Promise<{ response: string; latencyMs: number; modelUsed: string; dispatchLogId?: string }> {
  // Mock-injection contract (smoke-test only — env var OR arg never set in prod).
  // Arg takes precedence so the smoke harness can reach this over HTTP (env vars
  // don't propagate from curl to the backend process).
  const mockPath = mockResponsePathArg ?? process.env.DREAM_WORKER_MOCK_RESPONSE_PATH;
  if (mockPath && mockPath.length > 0) {
    const response = await fs.promises.readFile(mockPath, 'utf8');
    return { response, latencyMs: 0, modelUsed: 'mock', dispatchLogId: undefined };
  }

  // Real dispatch — direct routingEngine call, no HTTP, no Memory V3.
  // forceGatewayType + forceModelName pin the backend; OMITTING agentId/projectId/
  // chatId/skillsUsed/directiveStats/dispatchStrategy is what makes this a RAW
  // dispatch (the routing engine and its consumers skip Memory V3 / skills /
  // doctrine wiring when these fields are undefined).
  const ctx: RoutingContext = {
    message: promptBody,
    forceGatewayType: 'claude_cli',
    forceModelName: modelName,
    sourceAgent: 'dreams',
  };
  const req: BridgeDispatchRequest = {
    messages: [{ role: 'user', content: promptBody }],
    model: modelName,
    temperature: 0.2,
    maxTokens: 16000,
  };

  // Hard outer 180s timeout via AbortController. The adapter's internal timeout
  // is the inner ring; this is the outer ring that catches an adapter that
  // doesn't respect its own deadline.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);
  try {
    const { decision, result } = await routingEngine.selectWithFallback(ctx, req);

    // Defensive: if the adapter returned an incomplete BridgeDispatchResult (some
    // legacy adapters return undefined on partial failure), DO NOT call logDispatch
    // — its IIFE accesses result.responseHeaders / result.latencyMs outside the
    // inner try/catch and an undefined result crashes the worker process on the
    // unhandledRejection path. Caller sees status='failed' with a diagnostic error
    // rather than the backend systemd-restarting.
    if (!result || typeof result !== 'object') {
      throw new Error(`Bridge dispatch returned no result for gateway ${decision.gatewayRow?.type ?? 'unknown'}`);
    }

    // CRITICAL: selectWithFallback does NOT call logDispatch (only dispatchStream does).
    // We must explicitly call logDispatch to populate bridge_dispatch_log and capture
    // the row id for dream_runs.dispatch_id. Without this, Plan 05's raw-passthrough
    // verify (system_prompt inspection) has nothing to inspect.
    const dispatchLogId = await routingEngine.logDispatch(decision, ctx, result, undefined);

    return {
      response: result.response,
      latencyMs: result.latencyMs,
      modelUsed: decision.modelName,
      dispatchLogId,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Template substitution (simple, no templating engine) ────────────────────

function renderTemplate(template: string, vars: Record<string, string | number>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(String(v));
  }
  return out;
}

function formatDirectivesBlock(
  rows: Array<{ id: string; content: string; priority: number; source_type: string }>,
): string {
  return rows
    .map(r => {
      const seal = r.source_type === 'moe-direct' ? ' SEAL' : '';
      return `[${r.id}]${seal} (priority ${r.priority}, source_type=${r.source_type}) ${r.content}`;
    })
    .join('\n');
}

function formatTurnsBlock(turns: SampledTurn[]): string {
  return turns
    .map(t => {
      const ts = t.captured_at.toISOString();
      const cwdSuffix = t.cwd ? ` ─── cwd: ${t.cwd} ───` : '';
      return `─── turn ${t.id} ─── ${ts} ─── session: ${t.session_id} ─── role: ${t.role} ───${cwdSuffix}\n${t.content}`;
    })
    .join('\n\n');
}

// ── insertProposalsTransactionally: all-or-nothing ──────────────────────────

async function insertProposalsTransactionally(
  dreamRunId: string,
  siloId: string,
  parsed: ParsedDreamResponse,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Existing: regular proposals (refinements + new_directive)
    for (const p of parsed.proposals as ParsedProposal[]) {
      const id = 'mp_' + randomUUID();
      const metadata = {
        priority: p.priority,
        source_type: 'dream_worker',
        conceptual_area: p.conceptual_area,
      };
      await client.query(
        `INSERT INTO memory_proposals
           (id, dream_run_id, silo_id, proposal_kind, target_directive_ids,
            proposed_content, proposed_metadata, source_evidence, sort_order, expires_at)
         VALUES ($1, $2, $3, $4, $5::text[], $6, $7::jsonb, $8::jsonb, $9,
                 EXTRACT(EPOCH FROM NOW()) + $10)`,
        [
          id,
          dreamRunId,
          siloId,
          p.kind,
          p.target_directive_ids,
          p.proposed_content,
          JSON.stringify(metadata),
          JSON.stringify(p.source_evidence),
          p._sort_order ?? 0,
          EXPIRES_IN_S,
        ],
      );
    }
    // Phase 49 LRN-02: failure-pattern proposals. Same memory_proposals shape,
    // REUSES the existing 'new_directive' kind so the DB CHECK constraint
    // (CHECK proposal_kind IN ('merge','supersede','delete','new_directive')) is
    // untouched and the 48.4 list endpoint surfaces these alongside ordinary
    // proposals without code changes. The discriminator lives in
    // proposed_metadata.source = 'failure_pattern'. sort_order in the 850-899
    // band sits between merge (300) and new_directive (900) so failure-pattern
    // rows surface BEFORE generic new directives within the same dream_run.
    //
    // Atomicity: this loop runs inside the same BEGIN/COMMIT block as the
    // regular proposals loop above. A failure mid-loop ROLLBACKs the entire
    // run — earlier proposals included.
    //
    // Phase 51 deferral: the 48.4 accept handler reads proposal_kind to decide
    // scope (currently always 'silo' for new_directive). proposed_metadata
    // carries suggested_scope + suggested_scope_id for failure-pattern rows,
    // but the accept handler does not yet read those fields. DRX-02 (Phase 51,
    // edit-in-place) automates honoring suggested_scope. For v7.0 the reviewer
    // adjusts scope manually via the admin UI if a failure-pattern directive
    // should land at project-scope rather than silo.
    const failurePatterns: ParsedFailurePattern[] = parsed.failure_patterns ?? [];
    let failurePatternCounter = 0;
    for (const fp of failurePatterns) {
      const id = 'mp_' + randomUUID();
      const metadata = {
        source: 'failure_pattern',
        source_type: 'dream_worker',
        pattern_name: fp.pattern_name,
        recurrence_count: fp.recurrence_count,
        suggested_scope: fp.suggested_scope,
        suggested_scope_id: fp.suggested_scope_id,
        priority: 60,
        conceptual_area: `failure-pattern:${slugifyPatternName(fp.pattern_name)}`,
      };
      const evidence = {
        sample_turn_ids: fp.evidence_turn_ids,
        phrasing_examples: [] as string[],
        reasoning: fp.description,
      };
      await client.query(
        `INSERT INTO memory_proposals
           (id, dream_run_id, silo_id, proposal_kind, target_directive_ids,
            proposed_content, proposed_metadata, source_evidence, sort_order, expires_at)
         VALUES ($1, $2, $3, 'new_directive', '{}'::text[], $4, $5::jsonb, $6::jsonb, $7,
                 EXTRACT(EPOCH FROM NOW()) + $8)`,
        [
          id,
          dreamRunId,
          siloId,
          fp.suggested_directive,
          JSON.stringify(metadata),
          JSON.stringify(evidence),
          850 + failurePatternCounter,
          EXPIRES_IN_S,
        ],
      );
      failurePatternCounter += 1;
    }
    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* non-fatal — connection may already be poisoned */
    }
    throw err;
  } finally {
    client.release();
  }
}

// ── Pre-flight validators ────────────────────────────────────────────────────

async function preFlightValidateTargets(parsed: ParsedDreamResponse): Promise<void> {
  const allTargets = new Set<string>();
  for (const p of parsed.proposals) {
    for (const id of p.target_directive_ids) allTargets.add(id);
  }
  if (allTargets.size === 0) return;
  const ids = Array.from(allTargets);
  const { rows: found } = await pool.query<{ id: string; source_type: string }>(
    `SELECT id, source_type FROM directives WHERE id = ANY($1::text[])`,
    [ids],
  );
  const foundSet = new Set(found.map(r => r.id));
  for (const id of ids) {
    if (!foundSet.has(id)) {
      throw new Error(`Proposal validation: target_directive_id ${id} not found`);
    }
  }
  // Sealed-seed pre-flight: any delete/supersede on source_type='moe-direct' is forbidden.
  // Catching this BEFORE the INSERT means the DB trigger never has to ROLLBACK on us
  // (cleaner audit trail; the failure is attributed to "Doctrine violation" not "constraint").
  const sourceById = new Map(found.map(r => [r.id, r.source_type]));
  for (const p of parsed.proposals) {
    if (p.kind === 'delete' || p.kind === 'supersede') {
      for (const tid of p.target_directive_ids) {
        if (sourceById.get(tid) === 'moe-direct') {
          throw new Error(`Doctrine violation: targeted sealed seed ${tid} (kind=${p.kind})`);
        }
      }
    }
  }
}

// ── Concurrency + skip-recent guards ────────────────────────────────────────

async function checkConcurrency(siloId: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT id FROM dream_runs WHERE silo_id = $1 AND status = 'running' LIMIT 1`,
    [siloId],
  );
  return (r.rowCount ?? 0) > 0;
}

async function checkSkipRecent(
  siloId: string,
): Promise<{ skip: boolean; lastRunAt?: number; cadenceSeconds?: number }> {
  // Phase 50 MSF-04: per-silo cadence floor. Reads silos.cadence_seconds (the
  // declared cadence for THIS silo) instead of a hardcoded constant. Floor =
  // cadence * 0.95 mirrors the prior 6.5/7 ratio software was running at.
  const r = await pool.query<{ last: string | null; cadence: number | null }>(
    `SELECT (SELECT MAX(started_at)::text FROM dream_runs WHERE silo_id = $1 AND status = 'completed') AS last,
            (SELECT cadence_seconds FROM silos WHERE id = $1) AS cadence`,
    [siloId],
  );
  const lastRaw = r.rows[0]?.last;
  const last = lastRaw ? Number(lastRaw) : null;
  const cadence = r.rows[0]?.cadence ?? 604800; // defensive default (weekly) when silos row missing
  const floor = Math.floor(cadence * 0.95); // 95% of cadence — matches the 6.5/7 ratio software had before
  if (last && Date.now() / 1000 - last < floor) {
    return { skip: true, lastRunAt: last, cadenceSeconds: cadence };
  }
  return { skip: false };
}

// ── runDreamWorker — main entry ─────────────────────────────────────────────

export async function runDreamWorker(args: RunDreamArgs): Promise<RunDreamResult> {
  const dreamRunId = args.dreamRunIdOverride ?? 'dr_' + randomUUID();
  const startedAtMs = Date.now();

  // ── Concurrency guard ────────────────────────────────────
  if (await checkConcurrency(args.siloId)) {
    await logIntellectEvent('dream_run_skipped', 'dream_worker', {
      siloId: args.siloId,
      reason: 'concurrent_run_in_progress',
    });
    return { dreamRunId: '', proposalsExtracted: 0, status: 'skipped' };
  }

  // ── Skip-recent guard (schedule-triggered only; manual ALWAYS runs) ─────
  if (args.triggeredBy === 'schedule') {
    const recent = await checkSkipRecent(args.siloId);
    if (recent.skip) {
      await logIntellectEvent('dream_run_skipped', 'dream_worker', {
        siloId: args.siloId,
        lastRunAt: recent.lastRunAt,
        cadenceSeconds: recent.cadenceSeconds,
        reason: 'recent_run_within_cadence_floor',
      });
      return { dreamRunId: '', proposalsExtracted: 0, status: 'skipped' };
    }
  }

  // ── Write dream_runs row with status='running' BEFORE any work ──────────
  // (so a crash leaves a sweepable orphan, not a phantom run)
  const initialActionConfig = {
    dryRun: !!args.dryRun,
    sampleSizeOverride: args.sampleSizeOverride ?? null,
    modelOverride: args.modelOverride ?? null,
  };
  await pool.query(
    `INSERT INTO dream_runs
       (id, silo_id, status, model_used, triggered_by, triggered_by_user, action_config)
     VALUES ($1, $2, 'running', $3, $4, $5, $6::jsonb)`,
    [
      dreamRunId,
      args.siloId,
      'pending-selection',
      args.triggeredBy,
      args.triggeredByUser ?? null,
      JSON.stringify(initialActionConfig),
    ],
  );
  await logIntellectEvent('dream_run_started', 'dream_worker', {
    dreamRunId,
    siloId: args.siloId,
    triggeredBy: args.triggeredBy,
    triggeredByUser: args.triggeredByUser,
  });

  // Hoisted so the catch block can stamp dream_runs.dispatch_id even when
  // post-dispatch validation throws (e.g. doctrine violation). Without this the
  // dispatch_id is lost on failure paths and the audit trail can't join to
  // bridge_dispatch_log for raw-passthrough verification.
  let capturedDispatchLogId: string | undefined;

  try {
    // ── 1. Load silo row ───────────────────────────────────
    const { rows: siloRows } = await pool.query<{
      id: string;
      prompt_path: string;
      default_model: string;
    }>(
      `SELECT id, prompt_path, default_model FROM silos WHERE id=$1 AND enabled=true`,
      [args.siloId],
    );
    const siloRow = siloRows[0];
    if (!siloRow) throw new Error(`Silo ${args.siloId} not found or disabled`);

    // ── 2. Load prompt template (no caching — readFile every run) ─────────
    // ESM-safe repo root resolution. PORTER_REPO_ROOT env var is the canonical
    // override; fallback climbs out of backend/dist/services/intellect/ to repo root.
    const repoRoot =
      process.env.PORTER_REPO_ROOT ?? path.resolve(__dirname, '../../../..');
    const promptPath = path.resolve(repoRoot, siloRow.prompt_path);
    const promptTemplate = await fs.promises.readFile(promptPath, 'utf8');

    // ── 3. Load active directives ──────────────────────────
    const { rows: directiveRows } = await pool.query<{
      id: string;
      content: string;
      priority: number;
      source_type: string;
    }>(
      `SELECT id, content, priority, source_type FROM directives
       WHERE scope='silo' AND scope_id=$1 AND status='active'
       ORDER BY priority DESC`,
      [args.siloId],
    );

    // ── 4. Sample transcript turns ─────────────────────────
    const { turns: sampledTurns, samplingLog } = await sampleSoftwareTurns(
      { siloId: args.siloId, sampleSizeOverride: args.sampleSizeOverride },
      pool,
    );

    // ── 5. Empty corpus = success (legitimate quiet week) ──
    if (sampledTurns.length === 0) {
      await pool.query(
        `UPDATE dream_runs
           SET status='completed', completed_at=EXTRACT(EPOCH FROM NOW()),
               duration_ms=$1, proposals_extracted=0, turns_sampled=0, sessions_sampled=0,
               model_used='n/a (empty corpus)',
               action_config = action_config || $2::jsonb
         WHERE id=$3`,
        [
          Date.now() - startedAtMs,
          JSON.stringify({ sampling: samplingLog, emptyCorpus: true }),
          dreamRunId,
        ],
      );
      await logIntellectEvent('dream_run_completed', 'dream_worker', {
        dreamRunId,
        proposalsExtracted: 0,
        modelUsed: 'n/a',
        durationMs: Date.now() - startedAtMs,
        emptyCorpus: true,
      });
      // Phase 48.4 SSE wiring: even empty-corpus success fires the completion
      // event so the UI clears the "running" pill on a legitimate quiet week.
      broadcast('dreams:run-completed', {
        dream_run_id: dreamRunId,
        silo_id: args.siloId,
        status: 'completed',
        proposals_extracted: 0,
      });
      return { dreamRunId, proposalsExtracted: 0, status: 'completed' };
    }

    // ── 6. Render prompt body ──────────────────────────────
    const sessionsSampled = new Set(sampledTurns.map(t => t.session_id)).size;
    const promptBody = renderTemplate(promptTemplate, {
      ACTIVE_DIRECTIVE_COUNT: directiveRows.length,
      ACTIVE_DIRECTIVES_BLOCK: formatDirectivesBlock(directiveRows),
      TRANSCRIPT_BLOCK: formatTurnsBlock(sampledTurns),
      TURNS_SAMPLED: sampledTurns.length,
      SESSIONS_SAMPLED: sessionsSampled,
    });

    // ── 7. Dispatch (explicit logDispatch happens inside dispatchDream) ──
    const modelName = args.modelOverride ?? siloRow.default_model;
    const { response, latencyMs, modelUsed, dispatchLogId } = await dispatchDream(
      promptBody,
      modelName,
      args.mockResponsePath,
    );
    // Capture for the failure path so dream_runs.dispatch_id is populated even
    // if post-dispatch validation (doctrine/parse/preflight) throws.
    capturedDispatchLogId = dispatchLogId;

    // ── 8. Parse + Zod ─────────────────────────────────────
    const parsed = parseDreamResponse(response);

    // ── 9. Doctrine validation (Layer 2 — refinement-before-append) ─────
    //
    // We pass REFINEABLE count (non-sealed only), not total. Sealed seeds
    // (source_type='moe-direct') can never be merged/superseded/deleted —
    // the directive_immutable_moe_direct trigger blocks the mutation. Counting
    // them against the doctrine creates a deadlock when a silo has many seeds
    // and no refineables (model is forced to refine something it can't).
    //
    // Trust DB > trust model — parsed.active_directive_count_before (model
    // self-report) is logged for audit but never used for validation.
    const refineableCount = directiveRows.filter(
      r => r.source_type !== 'moe-direct',
    ).length;
    validateRefinementDoctrine(parsed, refineableCount);

    // ── 10. Pre-flight: target ids exist + no sealed-seed deletes ──────
    await preFlightValidateTargets(parsed);

    // ── 11. Assign sort_order (Layer 3) ────────────────────
    assignSortOrder(parsed);

    // ── 12. Log seed flags (if any) ────────────────────────
    for (const f of parsed.flagged_seeds ?? []) {
      await logIntellectEvent('dream_seed_flagged', 'dream_worker', {
        dreamRunId,
        seedDirectiveId: f.seed_directive_id,
        note: f.note,
      });
    }

    // Phase 49 LRN-02: total proposals = refinement proposals + failure-pattern
    // rows. Used for the dreams:run-completed broadcast count, the
    // dream_runs.proposals_extracted column, and the audit event payload so the
    // review surface and audit trail reflect the true total.
    const failurePatternCount = parsed.failure_patterns?.length ?? 0;
    const totalProposals = parsed.proposals.length + failurePatternCount;

    // ── 13. Insert proposals (or skip in dry-run mode) ────
    if (!args.dryRun) {
      await insertProposalsTransactionally(dreamRunId, args.siloId, parsed);
      // Phase 48.4 SSE wiring: notify connected admin clients that new proposals
      // exist. Post-commit only — runs AFTER the COMMIT inside
      // insertProposalsTransactionally has returned (Pitfall 1). Quiet weeks
      // (totalProposals=0) skip the broadcast; the dreams:run-completed event
      // below still fires so the UI clears any "running" pill.
      // Phase 49 LRN-02: count includes failure-pattern rows.
      if (totalProposals > 0) {
        broadcast('proposals:created', {
          dream_run_id: dreamRunId,
          silo_id: args.siloId,
          count: totalProposals,
        });
      }
      // Phase 49 LRN-02: per-failure-pattern audit signal. One event per
      // pattern. Audit-only — payload NEVER includes turn content (matches
      // dream_seed_flagged posture). Post-commit so a transactional rollback
      // leaves no orphan audit rows. Fire-and-forget like the flagged_seeds
      // loop above.
      for (const fp of parsed.failure_patterns ?? []) {
        await logIntellectEvent('dream_failure_pattern_detected', 'dream_worker', {
          dreamRunId,
          siloId: args.siloId,
          patternName: fp.pattern_name,
          recurrenceCount: fp.recurrence_count,
          suggestedScope: fp.suggested_scope,
          suggestedScopeId: fp.suggested_scope_id,
        });
      }
    }

    // ── 14. Finalize dream_runs ────────────────────────────
    await pool.query(
      `UPDATE dream_runs
         SET status='completed', completed_at=EXTRACT(EPOCH FROM NOW()),
             duration_ms=$1, proposals_extracted=$2, turns_sampled=$3, sessions_sampled=$4,
             model_used=$5, prompt_token_estimate=$6, response_token_estimate=$7,
             dispatch_id=$8, action_config = action_config || $9::jsonb
       WHERE id=$10`,
      [
        Date.now() - startedAtMs,
        totalProposals,
        sampledTurns.length,
        sessionsSampled,
        modelUsed,
        Math.floor(promptBody.length / 3),
        Math.floor(response.length / 3),
        dispatchLogId ?? null,
        JSON.stringify({ sampling: samplingLog, latencyMs }),
        dreamRunId,
      ],
    );
    await logIntellectEvent('dream_run_completed', 'dream_worker', {
      dreamRunId,
      proposalsExtracted: totalProposals,
      modelUsed,
      durationMs: Date.now() - startedAtMs,
      dryRun: !!args.dryRun,
      failurePatternCount,
    });
    // Phase 48.4 SSE wiring: notify connected admin clients that the run
    // completed. Post-UPDATE only.
    broadcast('dreams:run-completed', {
      dream_run_id: dreamRunId,
      silo_id: args.siloId,
      status: 'completed',
      proposals_extracted: totalProposals,
    });
    return {
      dreamRunId,
      proposalsExtracted: totalProposals,
      status: 'completed',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const truncated = msg.slice(0, ERROR_MESSAGE_CAP);
    try {
      await pool.query(
        `UPDATE dream_runs SET status='failed',
                              completed_at=EXTRACT(EPOCH FROM NOW()),
                              error_message=$1,
                              dispatch_id=COALESCE(dispatch_id, $2)
         WHERE id=$3`,
        [truncated, capturedDispatchLogId ?? null, dreamRunId],
      );
    } catch {
      /* non-fatal — keep the original error for the caller */
    }
    await logIntellectEvent('dream_run_failed', 'dream_worker', {
      dreamRunId,
      error: truncated,
    });
    // Phase 48.4 SSE wiring: broadcast on failure too — UI shows error toast
    // and clears the "running" pill. proposals_extracted=0 because the
    // transactional insert was rolled back (or never reached). Wrapped in its
    // own try/catch so a broadcast failure can never mask the original error.
    try {
      broadcast('dreams:run-completed', {
        dream_run_id: dreamRunId,
        silo_id: args.siloId,
        status: 'failed',
        proposals_extracted: 0,
      });
    } catch (broadcastErr) {
      console.error('[dream-worker] failed to broadcast dreams:run-completed (failure path):', broadcastErr);
    }
    // Re-throw so HTTP caller (manual trigger) sees it; scheduled path is
    // already wrapped by workflow-engine's try/catch which writes workflow_failed.
    throw err;
  }
}
