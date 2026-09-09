/**
 * membench/types.ts — the pluggable contracts.
 *
 * Ported from supermemoryai/memorybench (MIT) — `src/types/{provider,benchmark,
 * unified,checkpoint}.ts` — and reshaped for Porter. What we kept is the SHAPE:
 * a provider is anything that can be searched, a probe set is anything that can
 * produce questions with ground truth, and a run is a checkpointed walk through
 * fixed phases. That shape is why one harness can compare Porter's own retrieval
 * against an external service without either knowing about the other.
 *
 * WHAT WE DELIBERATELY DID NOT PORT
 * --------------------------------
 * memorybench models ingest as a first-class phase because every provider it
 * compares is a remote store you have to LOAD before you can query it. Porter's
 * corpus already lives in Postgres and is written by the real system
 * (session-end → distiller → concepts). Re-ingesting it for a benchmark would
 * measure a fixture, not the brain. So `ingest` is optional here and Porter's
 * own provider does not implement it — see providers/porter-memory.ts.
 *
 * The consequence is that a Porter run is READ-ONLY against live memory, which
 * is the only way the number means anything.
 */

/** One retrievable item, normalised across providers. */
export interface BenchDoc {
  id: string;
  content: string;
  /** Provider-specific origin — 'vault', 'distiller', 'contacts', … */
  sourceType?: string;
  /** Whatever the provider wants to carry through to the report. */
  metadata?: Record<string, unknown>;
}

export interface SearchOptions {
  limit?: number;
  /** Scope hint. Porter maps this to agent/project scoping. */
  containerTag?: string;
}

/**
 * A thing that can be asked a question.
 *
 * `search` returns ranked docs, best first — rank order is the ONLY thing the
 * metrics use, so a provider must not return an unordered set.
 */
export interface BenchProvider {
  name: string;
  /** Called once before a run. Providers that need no setup can omit it. */
  initialize?(): Promise<void>;
  search(query: string, options: SearchOptions): Promise<BenchDoc[]>;
  /**
   * Optional: how many context tokens this provider would ACTUALLY inject for
   * this query, if that differs from the raw search results. Porter's real
   * injector applies a token budget and tier clipping, so the honest number is
   * the rendered payload's, not the search result's. Without this the harness
   * falls back to estimating from the returned docs.
   */
  contextTokensFor?(query: string, options: SearchOptions): Promise<number>;
  /** Optional teardown (close a pool, drop a scratch container tag). */
  close?(): Promise<void>;
}

/**
 * How a probe declares what a correct retrieval looks like.
 *
 * `needle` — a regex matched against doc content. Deterministic, free, and
 *   exactly how `scripts/measure-paraphrase-miss.ts` has always worked. Use it
 *   whenever you know the specific row that should surface.
 * `expectedIds` — explicit doc ids. Strongest form; use when ids are stable.
 * `judge` — hand the results to a model and ask which are relevant. Ported from
 *   memorybench's retrieval-eval phase. Use only when the answer set is open.
 *
 * A probe may set `needle` AND `expectedIds`; a doc matching either counts.
 */
export interface ProbeGroundTruth {
  needle?: RegExp;
  expectedIds?: string[];
  judge?: boolean;
  /**
   * How many relevant docs exist in the corpus for this probe, when known.
   * REQUIRED for a true recall@k — see metrics.ts on why memorybench's recall
   * is really a hit rate. Omit and the harness reports `recallBasis:'hit_proxy'`
   * rather than quietly reporting a different metric under the same name.
   */
  totalRelevant?: number;
}

/**
 * One question. `variant` lets a single fact be probed several ways — the
 * control/paraphrase pairing that Porter's recall measurement is built on.
 */
export interface Probe {
  id: string;
  /** Groups variants of the same underlying fact. */
  label: string;
  /** 'control' = the concept's own words. 'paraphrase' = deliberately disjoint. */
  variant: string;
  /** Free-form bucket for per-category reporting, e.g. 'entity', 'directive'. */
  category: string;
  query: string;
  groundTruth: ProbeGroundTruth;
  /** Human-readable expected answer, for the LLM judge and for failure reports. */
  expectedAnswer?: string;
}

export interface ProbeSet {
  name: string;
  load(): Promise<void>;
  getProbes(filter?: { categories?: string[]; variants?: string[]; limit?: number }): Probe[];
}

// ── Run state ────────────────────────────────────────────────────────────────

export type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/** memorybench's PHASE_ORDER, minus ingest (see the header note). */
export const PHASE_ORDER = ['search', 'evaluate', 'report'] as const;
export type PhaseId = (typeof PHASE_ORDER)[number];

export interface RetrievalMetrics {
  hitAtK: number;
  precisionAtK: number;
  recallAtK: number;
  f1AtK: number;
  mrr: number;
  ndcg: number;
  k: number;
  relevantRetrieved: number;
  totalRelevant: number;
  /**
   * Whether `recallAtK` is a real recall (denominator known) or the hit-rate
   * stand-in. Reported so the two are never averaged together silently.
   */
  recallBasis: 'ground_truth' | 'hit_proxy';
}

export interface ProbeResult {
  probeId: string;
  label: string;
  variant: string;
  category: string;
  query: string;
  status: PhaseStatus;
  /** Ids of what came back, in rank order — enough to re-derive every metric. */
  retrievedIds: string[];
  /** Per-rank relevance labels, 1 = relevant. Parallel to retrievedIds. */
  relevance: number[];
  metrics?: RetrievalMetrics;
  contextTokens?: number;
  searchDurationMs?: number;
  error?: string;
}

export interface LatencyStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  stdDev: number;
  count: number;
}

export interface CategoryStats {
  total: number;
  hits: number;
  hitRate: number;
  meanPrecision: number;
  meanRecall: number;
  meanMrr: number;
  meanNdcg: number;
  recallBasis: 'ground_truth' | 'hit_proxy' | 'mixed';
}

export interface BenchReport {
  runId: string;
  provider: string;
  probeSet: string;
  k: number;
  startedAt: string;
  finishedAt: string;
  summary: {
    totalProbes: number;
    completed: number;
    failed: number;
    hits: number;
    hitRate: number;
    meanPrecision: number;
    meanRecall: number;
    meanMrr: number;
    meanNdcg: number;
    recallBasis: 'ground_truth' | 'hit_proxy' | 'mixed';
  };
  latency: LatencyStats;
  tokens: {
    meanContextTokens: number;
    maxContextTokens: number;
  };
  /**
   * memorybench's MemScore, verbatim in spirit: "quality% / latencyMs / tokens".
   * One string so a retrieval win that costs 3x the budget cannot be reported as
   * a straight improvement.
   */
  memScore: string;
  byCategory: Record<string, CategoryStats>;
  byVariant: Record<string, CategoryStats>;
  results: ProbeResult[];
}

export interface RunCheckpoint {
  runId: string;
  provider: string;
  probeSet: string;
  k: number;
  status: 'running' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  phase: PhaseId;
  results: Record<string, ProbeResult>;
}
