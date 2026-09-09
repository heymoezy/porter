/**
 * providers/porter-memory.ts — Porter's own retrieval, as a benchmark provider.
 *
 * Ported shape from memorybench's `src/providers/*` (MIT). Theirs each wrap a
 * remote SaaS; this one wraps the live Postgres path, which is the whole reason
 * the harness exists.
 *
 * ⚠️ READ-ONLY, AGAINST LIVE MEMORY. There is no ingest step: the corpus is
 * whatever the real system has learned (session-end → distiller → concepts →
 * pruner). That is deliberate — a benchmark that loads its own fixture measures
 * the fixture. The cost is that scores move as memory moves, so a run is only
 * comparable to another run of the same corpus. `report.corpusSize` is recorded
 * for exactly that reason: two runs with different corpus sizes are not a
 * before/after, they are two different questions.
 *
 * NOTHING HERE WRITES. In particular `buildMemoryContext` is called with
 * `recordUsage:false`, because a benchmark payload is never delivered to a model
 * and counting it would inflate `concepts.use_count` — the same reasoning that
 * governs the shadow-canary note in concept-usage.ts. Inflating use_count would
 * also change what the pruner archives, so a benchmark run would silently mutate
 * the corpus it is measuring.
 */
import { pool } from '../../../db/client.js';
import { searchConcepts } from '../../concept-retrieval.js';
import { buildMemoryContext } from '../../memory-injection.js';
import type { BenchDoc, BenchProvider, SearchOptions } from '../types.js';

export interface PorterProviderOptions {
  /** Passed to buildMemoryContext when measuring the real injected payload. */
  agentId?: string;
  projectId?: string;
  /** Token budget for the payload measurement. Defaults to the dispatch 2000. */
  tokenBudget?: number;
}

export class PorterMemoryProvider implements BenchProvider {
  readonly name = 'porter-memory';

  constructor(private readonly opts: PorterProviderOptions = {}) {}

  async initialize(): Promise<void> {
    // Fail loudly and early rather than reporting a run of zeroes: a benchmark
    // that scores 0% because the DB was unreachable looks exactly like a
    // retrieval regression.
    await pool.query('SELECT 1');
  }

  async search(query: string, options: SearchOptions): Promise<BenchDoc[]> {
    const rows = await searchConcepts(query, options.limit ?? 10);
    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      sourceType: r.source_type,
      metadata: { confidence: r.confidence_score, sourceUrl: r.source_url },
    }));
  }

  /**
   * What the model would ACTUALLY receive for this query.
   *
   * Not the same as the search results: the injector clips tier 6 to whatever
   * budget the higher tiers left, so the payload is usually smaller than the ten
   * rows `search()` returns. Measuring the search results instead would
   * understate the real cost of a wider budget, which is the trade MemScore
   * exists to keep visible.
   */
  async contextTokensFor(query: string): Promise<number> {
    const text = await buildMemoryContext({
      agentId: this.opts.agentId,
      projectId: this.opts.projectId,
      tokenBudget: this.opts.tokenBudget ?? 2000,
      searchQuery: query,
      recordUsage: false,
    });
    return Math.ceil(text.length / 4);
  }

  /** How many active concepts the run was scored against. Context for a diff. */
  async corpusSize(): Promise<number> {
    const res = await pool.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM concepts WHERE status = 'active'`,
    );
    return Number(res.rows[0]?.n ?? 0);
  }
}
