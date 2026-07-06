/**
 * Worker knowledge-evolution loop — RESEARCH step (vault/concepts/worker-knowledge-loop.md).
 *
 * Moe 2026-07-06: worker knowledge files must improve over time via a web
 * researcher on LOWER-TIER models through Bridge. This module is the
 * `worker_knowledge_refresh` workflow action on the EXISTING every_24h tick
 * (no new timers):
 *
 *   1. Reads the per-worker vault nodes (vault/entities/worker-*.md) — each
 *      declares `refresh_days::` (0 = manual-only, skipped at zero cost),
 *      `research_focus::` and optionally `data_file::` (e.g. Marshall's seed
 *      stock ymc backend/data/marshall-facts.json, read READ-ONLY here).
 *   2. Round-robin: ONE due worker per tick (state in
 *      <PORTER_DATA_DIR>/runtime/worker-knowledge-state.json). Nothing due =
 *      silent, no dispatch.
 *   3. Dispatches ONE research prompt via Bridge FORCED to the cheap gateway
 *      (see CHEAP_GATEWAY below), raw passthrough like dream-worker.ts
 *      (no Memory V3 / skills / doctrine — deliberate omission).
 *   4. Diffs findings against the node + data file (the prompt carries both;
 *      the model is instructed to propose only NEW/CHANGED knowledge) and
 *      inserts ONE memory_proposals row (kind 'new_directive', silo 'workers',
 *      proposed_metadata.source='worker_knowledge_refresh') into the EXISTING
 *      human review queue. NOTHING auto-applies to worker files or seed stocks;
 *      on accept the U4 hook writes a vault draft for human promotion, and the
 *      apply-to-data-file admin action is a designed follow-up slice (ymc side).
 *
 * Posture: never log model response text to intellect_events — the proposal
 * row carries the content (same rule as dream-worker.ts). Tokens + latency ARE
 * logged per cycle (cost discipline).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pool } from '../../db/client.js';
import { config } from '../../config.js';
import { routingEngine } from '../bridge/routing-engine.js';
import type { BridgeDispatchRequest, RoutingContext } from '../bridge/types.js';
import { logIntellectEvent } from './file-watcher.js';
import { broadcast } from '../sse-hub.js';

// ── COST DISCIPLINE (Moe 2026-07-06, NON-NEGOTIABLE) ────────────────────────
// Every dispatch in this loop rides the CHEAP gateway: codex_cli (Codex CLI,
// OpenAI quota, Bridge priority 20) — NEVER the premium claude_cli gateway.
// codex exec runs with full-access sandbox, so the model can fetch the web
// itself (its own search/curl) — that IS the researcher (proven 2026-07-06:
// real OFAC/IRI findings with source URLs, 64s). antigravity_cli registered
// on Bridge the same day (priority 30) — flip CHEAP_GATEWAY here (one
// constant) once its web-research ability is proven too.
export const CHEAP_GATEWAY = 'codex_cli';
export const CHEAP_MODEL = 'codex/gpt-5.5';

const VAULT_ROOT = '/home/lobster/vault'; // same precedent as vault-indexer.ts / vault-draft.ts
const WORKERS_GLOB_DIR = path.join(VAULT_ROOT, 'entities');
const WORKER_NODE_RE = /^worker-([a-z0-9-]+)\.md$/;
// Runtime state home is <PORTER_DATA_DIR>/runtime/ (gitignored — leases,
// checkpoints, usage etc. already live there).
const STATE_FILE = () => path.join(config.dataDir, 'runtime', 'worker-knowledge-state.json');
const DATA_FILE_CAP = 8000;   // chars of the worker's data file included in the prompt
const NODE_CAP = 4000;        // chars of the vault node included in the prompt
// Bridge's non-streaming circuit breaker allows 180s per dispatch
// (circuit-breaker-registry.ts) — the research contract must fit that budget,
// so the prompt caps findings at 3 and sources consulted at 3.
const MAX_FINDINGS = 3;
const EXPIRES_IN_S = 30 * 86400; // same 30d review window as dream proposals
const PROPOSALS_SILO = 'workers'; // silo_id label on memory_proposals (no FK; deliberate:
                                  // no session ever resolves silo 'workers', so an accepted
                                  // row's directive is inert — the operative artifact is the
                                  // U4 vault draft written on accept.

// ── Types ────────────────────────────────────────────────────────────────────

interface WorkerNode {
  worker: string;        // slug from filename (marshall, sentinel, …)
  title: string;
  refreshDays: number;   // 0 = manual-only (never auto-refreshed)
  dataFile: string | null;
  researchFocus: string;
  body: string;          // full node text (capped in prompt)
  nodePath: string;      // absolute path (evidence)
}

interface RefreshState {
  last_worker?: string;
  last_refresh_at?: Record<string, number>; // epoch seconds per worker
}

interface Finding {
  fact: string;
  source: string;
  change_type: 'new' | 'update' | 'correction';
  target: 'data_file' | 'vault_node';
}

export interface WorkerRefreshResult {
  worker?: string;
  skipped?: string;
  nothing_new?: boolean;
  findings?: number;
  proposal_id?: string;
  latency_ms?: number;
  output_tokens?: number;
  gateway?: string;
}

// ── Vault node parsing ───────────────────────────────────────────────────────

function parseInlineField(text: string, key: string): string | null {
  const m = text.match(new RegExp(`^${key}::\\s*(.+)$`, 'm'));
  return m ? m[1].trim() : null;
}

export async function readWorkerNodes(): Promise<WorkerNode[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(WORKERS_GLOB_DIR);
  } catch {
    return []; // fresh-start assumption — vault absent is not an error
  }
  const nodes: WorkerNode[] = [];
  for (const f of entries.sort()) {
    const m = f.match(WORKER_NODE_RE);
    if (!m) continue;
    const abs = path.join(WORKERS_GLOB_DIR, f);
    let raw: string;
    try {
      raw = await fs.readFile(abs, 'utf8');
    } catch {
      continue;
    }
    nodes.push({
      worker: m[1],
      title: raw.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? m[1],
      refreshDays: Number(parseInlineField(raw, 'refresh_days') ?? '0') || 0,
      dataFile: parseInlineField(raw, 'data_file'),
      researchFocus: parseInlineField(raw, 'research_focus') ?? '',
      body: raw,
      nodePath: abs,
    });
  }
  return nodes;
}

// ── State (round-robin + per-worker last-refresh) ────────────────────────────

async function readState(): Promise<RefreshState> {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE(), 'utf8')) as RefreshState;
  } catch {
    return {};
  }
}

async function writeState(state: RefreshState): Promise<void> {
  await fs.mkdir(path.dirname(STATE_FILE()), { recursive: true });
  await fs.writeFile(STATE_FILE(), JSON.stringify(state, null, 2), 'utf8');
}

/** Next due worker AFTER state.last_worker in alphabetical node order (round-robin). */
export function pickDueWorker(
  nodes: WorkerNode[],
  state: RefreshState,
  nowEpoch: number,
): WorkerNode | null {
  const due = nodes.filter(n => {
    if (n.refreshDays <= 0) return false; // manual-only — zero cost
    const last = state.last_refresh_at?.[n.worker] ?? 0;
    return nowEpoch - last >= n.refreshDays * 86400;
  });
  if (due.length === 0) return null;
  const names = due.map(n => n.worker).sort();
  const lastIdx = state.last_worker ? names.indexOf(state.last_worker) : -1;
  const next = names[(lastIdx + 1) % names.length];
  return due.find(n => n.worker === next) ?? due[0];
}

// ── Research prompt ──────────────────────────────────────────────────────────

function buildPrompt(node: WorkerNode, dataFileContent: string | null, today: string): string {
  return [
    `You are a knowledge researcher keeping an AI worker's domain knowledge fresh. Today is ${today}.`,
    `Worker: ${node.title}`,
    `Research focus: ${node.researchFocus}`,
    '',
    'CURRENT KNOWLEDGE NODE (markdown):',
    '<<<NODE',
    node.body.slice(0, NODE_CAP),
    'NODE',
    '',
    ...(dataFileContent
      ? ['CURRENT DATA FILE (the worker\'s runtime fact stock):', '<<<DATA', dataFileContent.slice(0, DATA_FILE_CAP), 'DATA', '']
      : []),
    'TASK: Do a QUICK web check (you have network access) for what is NEW, CHANGED, or now WRONG relative',
    'to the knowledge above, within the research focus. HARD BUDGET: consult at most 3 authoritative pages',
    '(official registry/regulator/vendor sources first) and finish fast — this is a scheduled scan, not a',
    `deep dive. Only report deltas — do not restate what the node/data file already says. At most ${MAX_FINDINGS}`,
    'findings; each needs the source URL you actually consulted and a one/two-sentence fact in plain',
    'declarative register (no marketing-speak). If your quick check finds nothing solid, say nothing_new.',
    '',
    'Reply with STRICT JSON only (no prose, no code fence):',
    '{"nothing_new": boolean, "summary": "one-paragraph overview of what changed (empty if nothing)",',
    ' "findings": [{"fact": "...", "source": "https://...", "change_type": "new|update|correction",',
    '               "target": "data_file|vault_node"}]}',
  ].join('\n');
}

function parseFindings(response: string): { nothing_new: boolean; summary: string; findings: Finding[] } {
  // Tolerate accidental fences/prose: take the outermost {...} block.
  const start = response.indexOf('{');
  const end = response.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('researcher returned no JSON object');
  const parsed = JSON.parse(response.slice(start, end + 1)) as {
    nothing_new?: boolean;
    summary?: string;
    findings?: Array<Partial<Finding>>;
  };
  const findings: Finding[] = (parsed.findings ?? [])
    .filter(f => typeof f.fact === 'string' && f.fact.trim().length > 0)
    .slice(0, MAX_FINDINGS)
    .map(f => ({
      fact: String(f.fact).trim(),
      source: String(f.source ?? '').trim(),
      change_type: (['new', 'update', 'correction'] as const).includes(f.change_type as never)
        ? (f.change_type as Finding['change_type'])
        : 'new',
      target: f.target === 'data_file' ? 'data_file' : 'vault_node',
    }));
  return { nothing_new: !!parsed.nothing_new || findings.length === 0, summary: String(parsed.summary ?? '').trim(), findings };
}

// ── Cheap-gateway dispatch (raw passthrough, dream-worker pattern) ───────────

export async function dispatchCheap(promptBody: string, sourceAgent: string): Promise<{
  response: string;
  latencyMs: number;
  outputTokens?: number;
  modelUsed: string;
}> {
  const ctx: RoutingContext = {
    message: promptBody,
    forceGatewayType: CHEAP_GATEWAY, // NEVER claude_cli — see CHEAP_GATEWAY doc block
    forceModelName: CHEAP_MODEL,
    sourceAgent,
  };
  const req: BridgeDispatchRequest = {
    messages: [{ role: 'user', content: promptBody }],
    model: CHEAP_MODEL,
    temperature: 0.2,
    maxTokens: 8000,
  };
  const { decision, result } = await routingEngine.selectWithFallback(ctx, req);
  if (!result || typeof result !== 'object') {
    throw new Error(`Bridge dispatch returned no result for gateway ${decision.gatewayRow?.type ?? 'unknown'}`);
  }
  // selectWithFallback does NOT log the dispatch itself (dream-worker precedent).
  await routingEngine.logDispatch(decision, ctx, result, undefined);
  return {
    response: result.response,
    latencyMs: result.latencyMs,
    outputTokens: result.outputTokens,
    modelUsed: decision.modelName,
  };
}

// ── Proposal insert ──────────────────────────────────────────────────────────

function renderProposal(node: WorkerNode, summary: string, findings: Finding[], today: string): string {
  const lines = findings.map(
    f => `- (${f.change_type} → ${f.target === 'data_file' ? 'data file' : 'vault node'}) ${f.fact}${f.source ? ` — source: ${f.source}` : ''}`,
  );
  return [
    `Worker knowledge refresh — ${node.title} (${today})`,
    '',
    summary,
    '',
    'Proposed updates (apply on accept: vault node by hand from the U4 draft; data-file changes via the explicit admin apply action — never automatic):',
    ...lines,
  ].join('\n');
}

// ── Main entry — the `worker_knowledge_refresh` workflow action ──────────────

export async function runWorkerKnowledgeRefresh(opts: {
  triggeredBy: 'schedule' | 'manual';
  /** Manual trigger may pin a worker (e.g. 'marshall'); schedule always round-robins. */
  worker?: string;
} = { triggeredBy: 'schedule' }): Promise<WorkerRefreshResult> {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const nodes = await readWorkerNodes();
  if (nodes.length === 0) return { skipped: 'no worker nodes in vault/entities/' };

  const state = await readState();
  let node: WorkerNode | null;
  if (opts.worker) {
    const wanted = opts.worker.toLowerCase();
    node = nodes.find(n => n.worker === wanted) ?? null;
    if (!node) return { skipped: `unknown worker '${wanted}'` };
    if (node.refreshDays <= 0 && opts.triggeredBy === 'schedule') {
      return { skipped: `${node.worker} is manual-only (refresh_days 0)` };
    }
  } else {
    node = pickDueWorker(nodes, state, nowEpoch);
    if (!node) return { skipped: 'no worker due for refresh' }; // silent, zero cost
  }

  // Read the worker's data file READ-ONLY (Marshall: ymc marshall-facts.json).
  let dataFileContent: string | null = null;
  if (node.dataFile) {
    dataFileContent = await fs.readFile(node.dataFile, 'utf8').catch(() => null);
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
  const promptBody = buildPrompt(node, dataFileContent, today);
  const { response, latencyMs, outputTokens, modelUsed } = await dispatchCheap(
    promptBody,
    'worker-knowledge',
  );
  const { nothing_new, summary, findings } = parseFindings(response);

  // Mark refreshed BEFORE proposal bookkeeping so a broken insert can't cause
  // a daily re-dispatch loop (cost discipline beats at-least-once here).
  state.last_worker = node.worker;
  state.last_refresh_at = { ...(state.last_refresh_at ?? {}), [node.worker]: nowEpoch };
  await writeState(state);

  const base: WorkerRefreshResult = {
    worker: node.worker,
    latency_ms: latencyMs,
    output_tokens: outputTokens,
    gateway: `${CHEAP_GATEWAY}/${modelUsed}`,
  };

  if (nothing_new) {
    await logIntellectEvent('worker_knowledge_refreshed', 'worker_knowledge', {
      worker: node.worker,
      nothing_new: true,
      latency_ms: latencyMs,
      output_tokens: outputTokens ?? null,
      prompt_chars: promptBody.length,
      gateway: CHEAP_GATEWAY,
      model: modelUsed,
    });
    return { ...base, nothing_new: true, findings: 0 };
  }

  const proposalId = 'mp_' + randomUUID();
  await pool.query(
    `INSERT INTO memory_proposals
       (id, dream_run_id, silo_id, proposal_kind, target_directive_ids,
        proposed_content, proposed_metadata, source_evidence, sort_order, expires_at)
     VALUES ($1, $2, $3, 'new_directive', '{}'::text[], $4, $5::jsonb, $6::jsonb, 0,
             EXTRACT(EPOCH FROM NOW()) + $7)`,
    [
      proposalId,
      'wkr_' + randomUUID(), // synthetic run id — no dream_runs row (no consumer joins it)
      PROPOSALS_SILO,
      renderProposal(node, summary, findings, today),
      JSON.stringify({
        source: 'worker_knowledge_refresh',
        source_type: 'worker_knowledge',
        worker: node.worker,
        priority: 55,
        conceptual_area: `worker-knowledge:${node.worker}`,
        gateway: CHEAP_GATEWAY,
        model: modelUsed,
        data_file: node.dataFile,
      }),
      JSON.stringify({ findings, node_path: node.nodePath, researched_at: today }),
      EXPIRES_IN_S,
    ],
  );
  broadcast('proposals:created', { dream_run_id: null, silo_id: PROPOSALS_SILO, count: 1 });
  await logIntellectEvent('worker_knowledge_refreshed', 'worker_knowledge', {
    worker: node.worker,
    findings: findings.length,
    proposal_id: proposalId,
    latency_ms: latencyMs,
    output_tokens: outputTokens ?? null,
    prompt_chars: promptBody.length,
    gateway: CHEAP_GATEWAY,
    model: modelUsed,
  });
  return { ...base, nothing_new: false, findings: findings.length, proposal_id: proposalId };
}
