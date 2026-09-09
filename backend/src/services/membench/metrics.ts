/**
 * membench/metrics.ts — retrieval scoring. PURE FUNCTIONS ONLY.
 *
 * Ported from supermemoryai/memorybench (MIT), `src/orchestrator/phases/
 * retrieval-eval.ts` and `report.ts`. Every formula here is theirs except
 * recall, which is corrected — see below.
 *
 * No DB, no network, no clock. That is deliberate: this is the one part of the
 * harness that decides whether a memory change was an improvement, so it has to
 * be testable without standing anything up. See __tests__/membench-metrics.test.ts.
 *
 * ⚠️ THE RECALL CORRECTION — read before comparing our numbers to theirs.
 * memorybench computes:
 *     totalRelevant = max(1, relevantRetrieved)
 *     recallAtK     = relevantRetrieved > 0 ? 1 : 0
 * The denominator is derived from what was retrieved, so anything missed is
 * invisible and recall collapses into hit@k — the two columns in their report
 * are always identical. A system that stores ten relevant facts and returns one
 * scores recall 1.0.
 *
 * That matters here because Porter's failure mode is precisely the missed row:
 * the probe in embeddings.ts:16 returns SOMETHING for a compliance question,
 * just not Clement. Under their formula that probe scores a perfect recall.
 *
 * So: when a probe declares `totalRelevant`, we use it and report
 * recallBasis:'ground_truth'. When it cannot (open-ended, judge-labelled), we
 * fall back to their hit-style number and report recallBasis:'hit_proxy'. The
 * basis travels with the number so the two are never silently averaged — and a
 * mixed run reports 'mixed' rather than a figure that means neither thing.
 */
import type { LatencyStats, RetrievalMetrics, CategoryStats, ProbeResult } from './types.js';

/**
 * Normalised discounted cumulative gain over binary relevance.
 *
 * Straight from memorybench: the ideal ranking puts every relevant doc first,
 * so IDCG sums the same discount over `idealRelevant` ones. Rewards a system for
 * putting the right row at rank 1 rather than rank 9 — which matters when the
 * consumer clips to a token budget partway down the list, as Porter's tier 6 does.
 */
export function ndcg(relevance: number[], idealRelevant: number): number {
  const dcg = relevance.reduce((sum, rel, i) => sum + rel / Math.log2(i + 2), 0);
  const ideal = Array(relevance.length).fill(0);
  for (let i = 0; i < Math.min(idealRelevant, ideal.length); i++) ideal[i] = 1;
  const idcg = ideal.reduce((sum, rel, i) => sum + rel / Math.log2(i + 2), 0);
  return idcg > 0 ? dcg / idcg : 0;
}

/** Reciprocal rank of the first relevant result; 0 if none. */
export function mrr(relevance: number[]): number {
  const first = relevance.findIndex((r) => r === 1);
  return first >= 0 ? 1 / (first + 1) : 0;
}

/**
 * Score one probe's ranked results.
 *
 * @param relevance  binary labels in rank order (1 = relevant)
 * @param k          cutoff actually applied — pass results.length when the
 *                   provider returned fewer than k
 * @param totalRelevant  how many relevant docs exist in the corpus. Omit when
 *                   unknown; recall then degrades to the hit proxy.
 */
export function scoreProbe(
  relevance: number[],
  k: number,
  totalRelevant?: number,
): RetrievalMetrics {
  const cut = relevance.slice(0, k);

  if (cut.length === 0) {
    return {
      hitAtK: 0,
      precisionAtK: 0,
      recallAtK: 0,
      f1AtK: 0,
      mrr: 0,
      ndcg: 0,
      k: 0,
      relevantRetrieved: 0,
      // An empty result set still had a denominator, if the probe knew one.
      totalRelevant: totalRelevant ?? 0,
      recallBasis: totalRelevant != null ? 'ground_truth' : 'hit_proxy',
    };
  }

  const relevantRetrieved = cut.filter((r) => r === 1).length;
  const hitAtK = relevantRetrieved > 0 ? 1 : 0;
  const precisionAtK = relevantRetrieved / cut.length;

  const knowsDenominator = totalRelevant != null && totalRelevant > 0;
  const recallAtK = knowsDenominator
    ? Math.min(1, relevantRetrieved / totalRelevant!)
    : hitAtK;

  const f1AtK =
    precisionAtK + recallAtK > 0
      ? (2 * precisionAtK * recallAtK) / (precisionAtK + recallAtK)
      : 0;

  return {
    hitAtK,
    precisionAtK,
    recallAtK,
    f1AtK,
    mrr: mrr(cut),
    // Ideal ranking is bounded by what actually exists, not by what we found.
    ndcg: ndcg(cut, knowsDenominator ? totalRelevant! : Math.max(1, relevantRetrieved)),
    k: cut.length,
    relevantRetrieved,
    totalRelevant: knowsDenominator ? totalRelevant! : relevantRetrieved,
    recallBasis: knowsDenominator ? 'ground_truth' : 'hit_proxy',
  };
}

/** memorybench's latency block: min/max/mean/median/p95/p99/stdDev. */
export function latencyStats(durations: number[]): LatencyStats {
  if (durations.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0, stdDev: 0, count: 0 };
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  return {
    min: sorted[0],
    max: sorted[n - 1],
    mean: Math.round(mean),
    median: sorted[Math.floor(n / 2)],
    p95: sorted[Math.min(n - 1, Math.floor(n * 0.95))],
    p99: sorted[Math.min(n - 1, Math.floor(n * 0.99))],
    stdDev: Math.round(Math.sqrt(variance)),
    count: n,
  };
}

/**
 * Collapse several probes' bases into one label. A run that mixes a real recall
 * with a hit proxy reports 'mixed' — averaging them would produce a number that
 * is neither, which is the exact failure this field exists to prevent.
 */
export function combineBasis(
  bases: Array<'ground_truth' | 'hit_proxy'>,
): 'ground_truth' | 'hit_proxy' | 'mixed' {
  if (bases.length === 0) return 'hit_proxy';
  const first = bases[0];
  return bases.every((b) => b === first) ? first : 'mixed';
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Aggregate a bucket of completed probe results. */
export function aggregate(results: ProbeResult[]): CategoryStats {
  const scored = results.filter((r) => r.metrics);
  const m = scored.map((r) => r.metrics!);
  return {
    total: results.length,
    hits: m.filter((x) => x.hitAtK === 1).length,
    hitRate: m.length ? m.filter((x) => x.hitAtK === 1).length / m.length : 0,
    meanPrecision: mean(m.map((x) => x.precisionAtK)),
    meanRecall: mean(m.map((x) => x.recallAtK)),
    meanMrr: mean(m.map((x) => x.mrr)),
    meanNdcg: mean(m.map((x) => x.ndcg)),
    recallBasis: combineBasis(m.map((x) => x.recallBasis)),
  };
}

/**
 * memorybench's MemScore: "quality% / latencyMs / contextTokens".
 *
 * Kept as ONE string on purpose. Retrieval quality is trivially bought with a
 * bigger budget or a slower pipeline, and a scalar hides that trade. Porter's
 * tier-6 budget is the thing most likely to be widened in pursuit of a better
 * number, so the cost of the win is printed next to the win.
 */
export function memScore(qualityPct: number, latencyMs: number, contextTokens: number): string {
  return `${Math.round(qualityPct)}% / ${Math.round(latencyMs)}ms / ${Math.round(contextTokens)}tok`;
}

/**
 * Label results by ground truth, without a model.
 *
 * A doc is relevant if its id is in `expectedIds` or its content matches
 * `needle`. This is what makes the existing Porter probe set runnable at zero
 * cost and with no judge variance — the LLM judge (evaluate.ts) is only for
 * probes whose answer set is genuinely open.
 */
export function labelByGroundTruth(
  docs: Array<{ id: string; content: string }>,
  gt: { needle?: RegExp; expectedIds?: string[] },
): number[] {
  const ids = new Set(gt.expectedIds ?? []);
  return docs.map((d) => {
    if (ids.has(d.id)) return 1;
    // A regex with /g is stateful across .test() calls; rebuild without it so
    // probe order can never change a label.
    if (gt.needle) {
      const re = new RegExp(gt.needle.source, gt.needle.flags.replace('g', ''));
      if (re.test(d.content)) return 1;
    }
    return 0;
  });
}
