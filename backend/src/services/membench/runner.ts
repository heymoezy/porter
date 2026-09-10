/**
 * membench/runner.ts — the checkpointed pipeline.
 *
 * Ported from memorybench's `src/orchestrator/` (MIT). Their phases are
 * INGEST → INDEXING → SEARCH → ANSWER → EVALUATE → REPORT; ours are
 * SEARCH → EVALUATE → REPORT, for two reasons:
 *
 *   · no INGEST/INDEXING — Porter's corpus is live and written by the real
 *     system; loading a fixture would measure the fixture (see types.ts).
 *   · no ANSWER — memorybench asks a model to answer from the retrieved context
 *     and judges the answer, which measures retrieval and the answering model
 *     together. Porter's open question is specifically whether the RIGHT ROW is
 *     found, and the probe set knows which row that is, so relevance is settled
 *     by ground truth. That makes a run FREE, DETERMINISTIC and offline —
 *     no judge, no API key, no variance between runs of identical code.
 *
 * The LLM judge is still available (`judge: true` on a probe) for probes whose
 * answer set is genuinely open. It is opt-in per probe, never the default: a
 * benchmark whose baseline drifts because a judge model changed cannot answer
 * "did this change help".
 *
 * CHECKPOINTING is kept because it is what makes a slow run resumable and, more
 * importantly, what makes a run AUDITABLE: `retrievedIds` and `relevance` are
 * persisted per probe, so every number in the report can be re-derived without
 * re-querying, and two runs can be diffed probe by probe.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../../config.js';
import { aggregate, combineBasis, labelByGroundTruth, latencyStats, memScore, scoreProbe } from './metrics.js';
import type {
  BenchProvider,
  BenchReport,
  Probe,
  ProbeResult,
  ProbeSet,
  RunCheckpoint,
} from './types.js';

/** Runs live under the Porter data dir — no hardcoded path (architecture rule 2). */
export const RUNS_DIR = path.join(config.dataDir, 'membench', 'runs');

export interface RunOptions {
  provider: BenchProvider;
  probeSet: ProbeSet;
  /** Retrieval cutoff. 10 matches what the injector requests from tier 6. */
  k?: number;
  filter?: { categories?: string[]; variants?: string[]; limit?: number };
  /** Resume a previous run id instead of starting fresh. */
  resumeRunId?: string;
  /** Measure the real injected payload size. Costs one extra build per probe. */
  measureTokens?: boolean;
  /** Optional relevance judge for probes that set `groundTruth.judge`. */
  judge?: (probe: Probe, docs: Array<{ id: string; content: string }>) => Promise<number[]>;
  onProgress?: (done: number, total: number, last: ProbeResult) => void;
}

function checkpointPath(runId: string): string {
  return path.join(RUNS_DIR, `${runId}.json`);
}

export function loadCheckpoint(runId: string): RunCheckpoint | null {
  const p = checkpointPath(runId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as RunCheckpoint;
  } catch {
    // A truncated checkpoint (killed mid-write) must not abort the run — start
    // over rather than resuming from a file we cannot parse.
    return null;
  }
}

function saveCheckpoint(cp: RunCheckpoint): void {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  cp.updatedAt = new Date().toISOString();
  // Write-then-rename so a crash cannot leave a half-written checkpoint behind.
  const target = checkpointPath(cp.runId);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cp, null, 2));
  fs.renameSync(tmp, target);
}

/**
 * Score one probe. Pure orchestration — all arithmetic is in metrics.ts.
 */
async function runProbe(
  probe: Probe,
  provider: BenchProvider,
  k: number,
  opts: Pick<RunOptions, 'measureTokens' | 'judge'>,
): Promise<ProbeResult> {
  const base = {
    probeId: probe.id,
    label: probe.label,
    variant: probe.variant,
    category: probe.category,
    query: probe.query,
  };

  const t0 = Date.now();
  let docs: Array<{ id: string; content: string }>;
  try {
    docs = await provider.search(probe.query, { limit: k });
  } catch (e) {
    // A provider error is NOT a miss. Scoring it as one would let an outage
    // read as a retrieval regression, which is the reading that wastes a day.
    return {
      ...base,
      status: 'failed',
      retrievedIds: [],
      relevance: [],
      error: e instanceof Error ? e.message : String(e),
      searchDurationMs: Date.now() - t0,
    };
  }
  const searchDurationMs = Date.now() - t0;

  let relevance: number[];
  if (probe.groundTruth.judge && opts.judge) {
    relevance = await opts.judge(probe, docs);
  } else {
    relevance = labelByGroundTruth(docs, probe.groundTruth);
  }

  let contextTokens: number | undefined;
  if (opts.measureTokens && provider.contextTokensFor) {
    contextTokens = await provider
      .contextTokensFor(probe.query, { limit: k })
      .catch(() => undefined);
  }

  return {
    ...base,
    status: 'completed',
    retrievedIds: docs.map((d) => d.id),
    relevance,
    // A judged probe has no known denominator, so recall degrades to the proxy
    // and says so — see metrics.ts.
    metrics: scoreProbe(
      relevance,
      k,
      probe.groundTruth.judge ? undefined : probe.groundTruth.totalRelevant,
    ),
    contextTokens,
    searchDurationMs,
  };
}

export async function runBenchmark(opts: RunOptions): Promise<BenchReport> {
  const k = opts.k ?? 10;
  const startedAt = new Date().toISOString();

  await opts.probeSet.load();
  const probes = opts.probeSet.getProbes(opts.filter);
  if (probes.length === 0) throw new Error('membench: probe set produced no probes');

  await opts.provider.initialize?.();

  const existing = opts.resumeRunId ? loadCheckpoint(opts.resumeRunId) : null;
  const cp: RunCheckpoint = existing ?? {
    runId: randomUUID().slice(0, 8),
    provider: opts.provider.name,
    probeSet: opts.probeSet.name,
    k,
    status: 'running',
    createdAt: startedAt,
    updatedAt: startedAt,
    phase: 'search',
    results: {},
  };

  if (existing && (existing.k !== k || existing.provider !== opts.provider.name)) {
    // Resuming into a different configuration would blend two runs into one
    // report and the mixture would be invisible in the output.
    throw new Error(
      `membench: cannot resume run ${existing.runId} — it used provider=${existing.provider} k=${existing.k}`,
    );
  }

  try {
    let done = 0;
    for (const probe of probes) {
      const prior = cp.results[probe.id];
      if (prior?.status === 'completed') {
        done++;
        continue;
      }
      const result = await runProbe(probe, opts.provider, k, opts);
      cp.results[probe.id] = result;
      saveCheckpoint(cp);
      done++;
      opts.onProgress?.(done, probes.length, result);
    }

    cp.phase = 'report';
    cp.status = 'completed';
    saveCheckpoint(cp);
  } finally {
    await opts.provider.close?.();
  }

  return buildReport(cp, probes, startedAt);
}

export function buildReport(
  cp: RunCheckpoint,
  probes: Probe[],
  startedAt: string,
): BenchReport {
  const results = probes.map((p) => cp.results[p.id]).filter(Boolean);
  const scored = results.filter((r) => r.metrics);
  const overall = aggregate(results);

  const byCategory: Record<string, ReturnType<typeof aggregate>> = {};
  for (const cat of new Set(results.map((r) => r.category))) {
    byCategory[cat] = aggregate(results.filter((r) => r.category === cat));
  }
  const byVariant: Record<string, ReturnType<typeof aggregate>> = {};
  for (const v of new Set(results.map((r) => r.variant))) {
    byVariant[v] = aggregate(results.filter((r) => r.variant === v));
  }

  const latency = latencyStats(
    results.map((r) => r.searchDurationMs).filter((n): n is number => n != null),
  );
  const tokenSamples = results
    .map((r) => r.contextTokens)
    .filter((n): n is number => n != null);
  const meanContextTokens = tokenSamples.length
    ? tokenSamples.reduce((a, b) => a + b, 0) / tokenSamples.length
    : 0;

  return {
    runId: cp.runId,
    provider: cp.provider,
    probeSet: cp.probeSet,
    k: cp.k,
    startedAt,
    finishedAt: new Date().toISOString(),
    summary: {
      totalProbes: probes.length,
      completed: scored.length,
      failed: results.filter((r) => r.status === 'failed').length,
      hits: overall.hits,
      hitRate: overall.hitRate,
      meanPrecision: overall.meanPrecision,
      meanRecall: overall.meanRecall,
      meanMrr: overall.meanMrr,
      meanNdcg: overall.meanNdcg,
      recallBasis: combineBasis(scored.map((r) => r.metrics!.recallBasis)),
    },
    latency,
    tokens: {
      meanContextTokens,
      maxContextTokens: tokenSamples.length ? Math.max(...tokenSamples) : 0,
    },
    // Quality is the hit rate: "did the row we needed come back at all". The
    // other two terms are what that cost.
    memScore: memScore(overall.hitRate * 100, latency.mean, meanContextTokens),
    byCategory,
    byVariant,
    results,
  };
}
