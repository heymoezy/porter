/**
 * Failure-digest distillation — COLLECT step of the rule-distillation loop
 * (vault/concepts/rule-distillation-loop.md). Deterministic, zero-token.
 *
 * The `distill_failure_digest` workflow action (every_24h tick — no new timer)
 * calls ymc's read-only evidence endpoint
 * GET /api/v1/admin/tom/failure-digest?hours=24 (tom_feedback rows, worker
 * journal error/refusal lines, send-gate rejections, release-audit SKIPs),
 * reduces the response to counts + up to 20 raw snippets, and appends ONE
 * `failure_digest` intellect_event. Same posture as the dream-proposals
 * review digest: bounded snippets only, never full content dumps; a window
 * with zero failure signal is silent (no event).
 *
 * The DISTILL step is the existing dream worker: dream-worker.ts injects the
 * latest failure_digest event into the software-silo prompt
 * ({{FAILURE_DIGEST_BLOCK}}) so nightly dreaming proposes rules FROM failures.
 * Review stays human (memory_proposals queue) — nothing auto-applies.
 */

import { pool } from '../../db/client.js';
import { config } from '../../config.js';
import { logIntellectEvent } from './file-watcher.js';

const MAX_SNIPPETS = 20;
const SNIPPET_CHARS = 240;

interface YmcDigest {
  hours: number;
  since: string;
  generated_at: string;
  counts: Record<string, number>;
  tom_feedback: Array<{ at?: string; sender?: string | null; category?: string | null; user_msg?: string }>;
  worker_journal: {
    job_errors: Array<{ worker?: string | null; task?: string; error?: string; at?: string | null }>;
    outbox_delivery_failures: Array<{ target?: string; last_error?: string; at?: string }>;
    journal_lines: string[];
  };
  send_gate: { rejections: string[] };
  release_audit: Array<{ at: string; line: string }>;
}

export interface FailureDigestSnippet {
  source: 'tom_feedback' | 'send_gate' | 'worker_job_error' | 'outbox_failure' | 'release_audit' | 'journal';
  text: string;
}

function clip(text: unknown): string {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length <= SNIPPET_CHARS ? clean : clean.slice(0, SNIPPET_CHARS - 1) + '…';
}

/** Reduce the ymc digest to ≤MAX_SNIPPETS raw snippets, highest-signal first. */
export function reduceToSnippets(d: YmcDigest): FailureDigestSnippet[] {
  const out: FailureDigestSnippet[] = [];
  const push = (source: FailureDigestSnippet['source'], text: string) => {
    if (out.length < MAX_SNIPPETS && text) out.push({ source, text: clip(text) });
  };
  // Priority: explicit human corrections → gate refusals → worker failures →
  // delivery failures → ceremony bypasses → generic journal error lines.
  for (const f of d.tom_feedback ?? []) push('tom_feedback', `[${f.category ?? 'feedback'}] ${f.user_msg ?? ''}`);
  for (const line of d.send_gate?.rejections ?? []) push('send_gate', line);
  for (const j of d.worker_journal?.job_errors ?? []) push('worker_job_error', `worker=${j.worker ?? '?'} task="${j.task ?? ''}" error=${j.error ?? ''}`);
  for (const o of d.worker_journal?.outbox_delivery_failures ?? []) push('outbox_failure', `target=${o.target ?? '?'} error=${o.last_error ?? ''}`);
  for (const r of d.release_audit ?? []) push('release_audit', r.line);
  for (const line of d.worker_journal?.journal_lines ?? []) push('journal', line);
  return out;
}

/**
 * Run the collector: fetch ymc's failure digest and append ONE
 * `failure_digest` intellect_event. Returns the summary (also stored).
 */
export async function runFailureDigestDistill(hours = 24): Promise<{
  failures: number;
  counts?: Record<string, number>;
  snippets?: number;
  skipped?: string;
}> {
  const url = `${config.ymcApiUrl}/api/v1/admin/tom/failure-digest?hours=${hours}`;
  const res = await fetch(url, {
    headers: { 'X-Service-Token': config.ymcServiceToken },
    signal: AbortSignal.timeout(30_000),
  }).catch((e: unknown) => {
    throw new Error(`ymc failure-digest unreachable: ${e instanceof Error ? e.message : String(e)}`);
  });
  if (!res.ok) throw new Error(`ymc failure-digest HTTP ${res.status}`);
  const body = (await res.json()) as { ok?: boolean; data?: YmcDigest };
  const digest = body?.data;
  if (!body?.ok || !digest) throw new Error('ymc failure-digest returned no data');

  const counts = digest.counts ?? {};
  // Failure signal = everything except the delivered-sends baseline.
  const failures = Object.entries(counts)
    .filter(([k]) => k !== 'sent_ok')
    .reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
  if (failures === 0) return { failures: 0, skipped: 'no failure signal in window' };

  const snippets = reduceToSnippets(digest);
  await logIntellectEvent('failure_digest', 'failure_digest_distill', {
    hours: digest.hours,
    since: digest.since,
    counts,
    snippets,
    endpoint: 'ymc GET /api/v1/admin/tom/failure-digest',
  });
  return { failures, counts, snippets: snippets.length };
}

/**
 * Latest failure_digest event within `maxAgeHours` — the dream worker's
 * failure source. Returns null when there is none (quiet window), in which
 * case the prompt block renders as "(none)".
 */
export async function latestFailureDigest(maxAgeHours = 48): Promise<{
  created_at: number;
  counts: Record<string, number>;
  snippets: FailureDigestSnippet[];
} | null> {
  const { rows } = await pool.query<{ created_at: number; details_json: { counts?: Record<string, number>; snippets?: FailureDigestSnippet[] } }>(
    `SELECT created_at, details_json FROM intellect_events
      WHERE event_type = 'failure_digest'
        AND created_at > EXTRACT(EPOCH FROM NOW()) - $1
      ORDER BY created_at DESC LIMIT 1`,
    [maxAgeHours * 3600],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    created_at: row.created_at,
    counts: row.details_json?.counts ?? {},
    snippets: row.details_json?.snippets ?? [],
  };
}

/** Render the failure digest as a prompt block for {{FAILURE_DIGEST_BLOCK}}. */
export function formatFailureDigestBlock(
  digest: Awaited<ReturnType<typeof latestFailureDigest>>,
): string {
  if (!digest || digest.snippets.length === 0) return '(none — no failure digest in the last 48h)';
  const countsLine = Object.entries(digest.counts)
    .map(([k, v]) => `${k}=${v}`)
    .join(' · ');
  const lines = digest.snippets.map(s => `- [${s.source}] ${s.text}`);
  return `Counts: ${countsLine}\n${lines.join('\n')}`;
}
