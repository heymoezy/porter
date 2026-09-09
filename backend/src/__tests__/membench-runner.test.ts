/**
 * Tests for membench/runner.ts — the benchmark pipeline.
 *
 * Run with: npx tsx --test backend/src/__tests__/membench-runner.test.ts
 *
 * Uses a stub provider and a stub probe set, so the pipeline is exercised with
 * no Postgres and no network. That is the point: the harness has to be provable
 * on its own before any number it produces about memory is worth reading.
 *
 * Checkpoints are written under a temp dir via PORTER_DATA_DIR, which must be
 * set BEFORE importing the runner — config.ts reads it at module load.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'membench-test-'));
process.env.PORTER_DATA_DIR = TMP;

const { runBenchmark, loadCheckpoint, RUNS_DIR } = await import('../services/membench/runner.js');
import type { BenchDoc, BenchProvider, Probe, ProbeSet, SearchOptions } from '../services/membench/types.js';

// ── stubs ────────────────────────────────────────────────────────────────────

const PROBES: Probe[] = [
  {
    id: 'alpha:control', label: 'alpha', variant: 'control', category: 'x',
    query: 'alpha', groundTruth: { needle: /ALPHA-FACT/, totalRelevant: 1 },
  },
  {
    id: 'alpha:paraphrase', label: 'alpha', variant: 'paraphrase', category: 'x',
    query: 'the first letter thing', groundTruth: { needle: /ALPHA-FACT/, totalRelevant: 1 },
  },
  {
    id: 'beta:control', label: 'beta', variant: 'control', category: 'y',
    query: 'beta', groundTruth: { needle: /BETA-FACT/, totalRelevant: 1 },
  },
];

class StubProbeSet implements ProbeSet {
  readonly name = 'stub';
  constructor(private readonly probes = PROBES) {}
  async load(): Promise<void> {}
  getProbes(filter?: { categories?: string[]; variants?: string[]; limit?: number }): Probe[] {
    let out = this.probes;
    if (filter?.categories?.length) out = out.filter((p) => filter.categories!.includes(p.category));
    if (filter?.variants?.length) out = out.filter((p) => filter.variants!.includes(p.variant));
    if (filter?.limit != null) out = out.slice(0, filter.limit);
    return out;
  }
}

/** Returns the right doc for exact queries only — so paraphrases miss. */
class StubProvider implements BenchProvider {
  readonly name = 'stub-provider';
  searches = 0;
  initialized = 0;
  closed = 0;
  constructor(private readonly failOn?: string) {}
  async initialize(): Promise<void> { this.initialized++; }
  async close(): Promise<void> { this.closed++; }
  async contextTokensFor(): Promise<number> { return 400; }
  async search(query: string, _o: SearchOptions): Promise<BenchDoc[]> {
    this.searches++;
    if (this.failOn && query === this.failOn) throw new Error('provider exploded');
    if (query === 'alpha') return [{ id: '1', content: 'ALPHA-FACT here' }, { id: '2', content: 'noise' }];
    if (query === 'beta') return [{ id: '3', content: 'noise' }, { id: '4', content: 'BETA-FACT' }];
    return [{ id: '9', content: 'unrelated' }];
  }
}

// ── tests ────────────────────────────────────────────────────────────────────

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

describe('runBenchmark', () => {
  it('scores every probe and separates control from paraphrase', async () => {
    const provider = new StubProvider();
    const report = await runBenchmark({ provider, probeSet: new StubProbeSet() });

    assert.equal(report.summary.totalProbes, 3);
    assert.equal(report.summary.completed, 3);
    assert.equal(report.summary.failed, 0);
    // alpha:control and beta:control hit; alpha:paraphrase misses.
    assert.equal(report.summary.hits, 2);
    assert.equal(report.byVariant.control.hitRate, 1);
    assert.equal(report.byVariant.paraphrase.hitRate, 0);
    assert.equal(provider.initialized, 1);
    assert.equal(provider.closed, 1);
  });

  it('reports a real recall basis when probes declare a denominator', async () => {
    const report = await runBenchmark({ provider: new StubProvider(), probeSet: new StubProbeSet() });
    assert.equal(report.summary.recallBasis, 'ground_truth');
  });

  it('ranks matter — MRR distinguishes rank 1 from rank 2', async () => {
    const report = await runBenchmark({ provider: new StubProvider(), probeSet: new StubProbeSet() });
    const alpha = report.results.find((r) => r.probeId === 'alpha:control')!;
    const beta = report.results.find((r) => r.probeId === 'beta:control')!;
    assert.equal(alpha.metrics!.mrr, 1, 'ALPHA-FACT is rank 1');
    assert.equal(beta.metrics!.mrr, 0.5, 'BETA-FACT is rank 2');
  });

  it('records a provider error as failed, not as a miss', async () => {
    const report = await runBenchmark({
      provider: new StubProvider('beta'),
      probeSet: new StubProbeSet(),
    });
    assert.equal(report.summary.failed, 1);
    const failed = report.results.find((r) => r.probeId === 'beta:control')!;
    assert.equal(failed.status, 'failed');
    assert.match(failed.error!, /exploded/);
    // hit rate is over SCORED probes only — 1 of the 2 that ran.
    assert.equal(report.summary.completed, 2);
    assert.equal(report.summary.hits, 1);
  });

  it('honours category and variant filters', async () => {
    const report = await runBenchmark({
      provider: new StubProvider(),
      probeSet: new StubProbeSet(),
      filter: { variants: ['control'] },
    });
    assert.equal(report.summary.totalProbes, 2);
    assert.ok(report.results.every((r) => r.variant === 'control'));
  });

  it('measures context tokens only when asked', async () => {
    const off = await runBenchmark({ provider: new StubProvider(), probeSet: new StubProbeSet() });
    assert.equal(off.tokens.meanContextTokens, 0);

    const on = await runBenchmark({
      provider: new StubProvider(),
      probeSet: new StubProbeSet(),
      measureTokens: true,
    });
    assert.equal(on.tokens.meanContextTokens, 400);
    assert.match(on.memScore, /400tok$/);
  });

  it('uses the judge when a probe asks for one, and drops to the hit proxy', async () => {
    const judged: Probe[] = [{
      id: 'open:q', label: 'open', variant: 'control', category: 'z',
      query: 'alpha', groundTruth: { judge: true },
    }];
    const report = await runBenchmark({
      provider: new StubProvider(),
      probeSet: new StubProbeSet(judged),
      judge: async (_p, docs) => docs.map((d) => (d.content.includes('ALPHA') ? 1 : 0)),
    });
    assert.equal(report.summary.hits, 1);
    assert.equal(report.summary.recallBasis, 'hit_proxy');
  });
});

describe('checkpointing', () => {
  it('persists enough to re-derive the metrics', async () => {
    const report = await runBenchmark({ provider: new StubProvider(), probeSet: new StubProbeSet() });
    const cp = loadCheckpoint(report.runId);
    assert.ok(cp, 'checkpoint must exist');
    assert.equal(cp!.status, 'completed');
    const alpha = cp!.results['alpha:control'];
    assert.deepEqual(alpha.retrievedIds, ['1', '2']);
    assert.deepEqual(alpha.relevance, [1, 0]);
    assert.ok(fs.existsSync(path.join(RUNS_DIR, `${report.runId}.json`)));
  });

  it('resumes without re-querying completed probes', async () => {
    const first = new StubProvider();
    const report = await runBenchmark({ provider: first, probeSet: new StubProbeSet() });
    assert.equal(first.searches, 3);

    const second = new StubProvider();
    const resumed = await runBenchmark({
      provider: second,
      probeSet: new StubProbeSet(),
      resumeRunId: report.runId,
    });
    assert.equal(second.searches, 0, 'every probe was already complete');
    assert.equal(resumed.summary.hits, 2, 'the report still rebuilds from the checkpoint');
  });

  it('refuses to resume into a different configuration', async () => {
    const report = await runBenchmark({ provider: new StubProvider(), probeSet: new StubProbeSet() });
    await assert.rejects(
      () => runBenchmark({
        provider: new StubProvider(),
        probeSet: new StubProbeSet(),
        resumeRunId: report.runId,
        k: 5,
      }),
      /cannot resume/,
    );
  });

  it('starts fresh rather than throwing on a corrupt checkpoint', async () => {
    const report = await runBenchmark({ provider: new StubProvider(), probeSet: new StubProbeSet() });
    fs.writeFileSync(path.join(RUNS_DIR, `${report.runId}.json`), '{ truncated');
    assert.equal(loadCheckpoint(report.runId), null);
    const again = await runBenchmark({
      provider: new StubProvider(),
      probeSet: new StubProbeSet(),
      resumeRunId: report.runId,
    });
    assert.equal(again.summary.completed, 3);
  });
});

describe('guards', () => {
  it('throws rather than reporting on an empty probe set', async () => {
    await assert.rejects(
      () => runBenchmark({
        provider: new StubProvider(),
        probeSet: new StubProbeSet(),
        filter: { categories: ['nonexistent'] },
      }),
      /no probes/,
    );
  });
});
