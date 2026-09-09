/**
 * Tests for membench/metrics.ts — the scoring core of the memory benchmark.
 *
 * Run with: npx tsx --test backend/src/__tests__/membench-metrics.test.ts
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * This module is the thing that decides whether a memory change was an
 * improvement. If it is wrong, every future decision about retrieval is wrong
 * and nothing goes red — the same class of silent failure that let the directive
 * priority scale sit inverted for months (see directive-scorer.test.ts).
 *
 * The recall tests below are the load-bearing ones. We deliberately diverge from
 * upstream memorybench, whose recall is derived from what was retrieved and so
 * can never fall below 1.0 on a hit. If someone "fixes" our recall back to
 * theirs to make the numbers match a blog post, these go red.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreProbe,
  ndcg,
  mrr,
  latencyStats,
  combineBasis,
  aggregate,
  memScore,
  labelByGroundTruth,
} from '../services/membench/metrics.js';
import type { ProbeResult } from '../services/membench/types.js';

const close = (a: number, b: number, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

describe('mrr', () => {
  it('is 1 when the first result is relevant', () => {
    assert.equal(mrr([1, 0, 0]), 1);
  });

  it('is 1/rank of the first relevant result', () => {
    close(mrr([0, 0, 1, 1]), 1 / 3);
  });

  it('is 0 when nothing is relevant', () => {
    assert.equal(mrr([0, 0, 0]), 0);
  });
});

describe('ndcg', () => {
  it('is 1 for a perfect ranking', () => {
    close(ndcg([1, 1, 0, 0], 2), 1);
  });

  it('penalises a relevant result buried down the list', () => {
    const good = ndcg([1, 0, 0, 0], 1);
    const bad = ndcg([0, 0, 0, 1], 1);
    assert.ok(bad < good, 'rank 4 must score worse than rank 1');
    close(good, 1);
  });

  it('is 0 when nothing is relevant', () => {
    assert.equal(ndcg([0, 0, 0], 1), 0);
  });
});

describe('scoreProbe — recall', () => {
  it('reports TRUE recall when the probe knows the denominator', () => {
    // 4 relevant docs exist; we retrieved 1 of them.
    const m = scoreProbe([1, 0, 0, 0], 4, 4);
    close(m.recallAtK, 0.25);
    assert.equal(m.recallBasis, 'ground_truth');
    assert.equal(m.hitAtK, 1);
  });

  it('does NOT collapse recall into hit@k — the upstream bug', () => {
    // Upstream memorybench would score this recall 1.0 because it derives the
    // denominator from what came back. Missing 9 of 10 relevant rows is not
    // perfect recall.
    const m = scoreProbe([1, 0, 0], 3, 10);
    close(m.recallAtK, 0.1);
    assert.notEqual(m.recallAtK, m.hitAtK);
  });

  it('falls back to the hit proxy and SAYS SO when the denominator is unknown', () => {
    const m = scoreProbe([0, 1, 0], 3);
    assert.equal(m.recallBasis, 'hit_proxy');
    assert.equal(m.recallAtK, 1, 'proxy recall is the hit indicator');
  });

  it('caps recall at 1 when more relevant docs are found than declared', () => {
    const m = scoreProbe([1, 1, 1], 3, 2);
    assert.equal(m.recallAtK, 1);
  });

  it('keeps the denominator on a total miss so the run still averages honestly', () => {
    const m = scoreProbe([0, 0, 0], 3, 5);
    assert.equal(m.recallAtK, 0);
    assert.equal(m.totalRelevant, 5);
    assert.equal(m.recallBasis, 'ground_truth');
  });
});

describe('scoreProbe — precision and shape', () => {
  it('computes precision over what was actually returned, not over k', () => {
    // Asked for 10, provider returned 2, one relevant → 0.5 not 0.1.
    const m = scoreProbe([1, 0], 10, 1);
    close(m.precisionAtK, 0.5);
    assert.equal(m.k, 2);
  });

  it('handles an empty result set without dividing by zero', () => {
    const m = scoreProbe([], 10, 3);
    assert.equal(m.hitAtK, 0);
    assert.equal(m.precisionAtK, 0);
    assert.equal(m.recallAtK, 0);
    assert.equal(m.f1AtK, 0);
    assert.equal(m.mrr, 0);
    assert.equal(m.ndcg, 0);
    assert.equal(m.totalRelevant, 3, 'a known denominator survives an empty result');
  });

  it('truncates at k', () => {
    // The relevant row sits at rank 4 but k=3, so it must not count.
    const m = scoreProbe([0, 0, 0, 1], 3, 1);
    assert.equal(m.hitAtK, 0);
    assert.equal(m.k, 3);
  });

  it('f1 is the harmonic mean of precision and recall', () => {
    const m = scoreProbe([1, 1, 0, 0], 4, 4);
    close(m.precisionAtK, 0.5);
    close(m.recallAtK, 0.5);
    close(m.f1AtK, 0.5);
  });
});

describe('combineBasis', () => {
  it('reports mixed rather than averaging two different metrics', () => {
    assert.equal(combineBasis(['ground_truth', 'hit_proxy']), 'mixed');
  });

  it('passes a uniform basis through', () => {
    assert.equal(combineBasis(['ground_truth', 'ground_truth']), 'ground_truth');
    assert.equal(combineBasis(['hit_proxy']), 'hit_proxy');
  });

  it('defaults to the proxy on an empty run', () => {
    assert.equal(combineBasis([]), 'hit_proxy');
  });
});

describe('latencyStats', () => {
  it('is all zeroes for no samples', () => {
    assert.deepEqual(latencyStats([]), {
      min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0, stdDev: 0, count: 0,
    });
  });

  it('computes order statistics on unsorted input', () => {
    const s = latencyStats([30, 10, 20]);
    assert.equal(s.min, 10);
    assert.equal(s.max, 30);
    assert.equal(s.mean, 20);
    assert.equal(s.median, 20);
    assert.equal(s.count, 3);
  });

  it('never indexes past the end for small samples', () => {
    const s = latencyStats([5]);
    assert.equal(s.p95, 5);
    assert.equal(s.p99, 5);
  });
});

describe('labelByGroundTruth', () => {
  const docs = [
    { id: 'a', content: 'Compliance and KYC lead — precise, checks everything' },
    { id: 'b', content: 'Terse, hates fluff' },
    { id: 'c', content: 'unrelated row' },
  ];

  it('matches on a needle regex', () => {
    assert.deepEqual(labelByGroundTruth(docs, { needle: /Compliance and KYC lead/i }), [1, 0, 0]);
  });

  it('matches on explicit ids', () => {
    assert.deepEqual(labelByGroundTruth(docs, { expectedIds: ['b', 'c'] }), [0, 1, 1]);
  });

  it('is stable when the needle carries the /g flag', () => {
    // A /g regex keeps lastIndex between .test() calls; if that leaked, the
    // second identical doc below would score 0 and probe order would change
    // the result.
    const g = /row/g;
    const repeated = [
      { id: '1', content: 'a row' },
      { id: '2', content: 'a row' },
    ];
    assert.deepEqual(labelByGroundTruth(repeated, { needle: g }), [1, 1]);
  });

  it('labels nothing relevant when neither form is given', () => {
    assert.deepEqual(labelByGroundTruth(docs, {}), [0, 0, 0]);
  });
});

describe('aggregate', () => {
  const mk = (id: string, category: string, relevance: number[], total?: number): ProbeResult => ({
    probeId: id,
    label: id,
    variant: 'control',
    category,
    query: 'q',
    status: 'completed',
    retrievedIds: relevance.map((_, i) => `d${i}`),
    relevance,
    metrics: scoreProbe(relevance, relevance.length, total),
  });

  it('averages only scored probes and counts hits', () => {
    const stats = aggregate([mk('a', 'entity', [1, 0], 1), mk('b', 'entity', [0, 0], 1)]);
    assert.equal(stats.total, 2);
    assert.equal(stats.hits, 1);
    close(stats.hitRate, 0.5);
    assert.equal(stats.recallBasis, 'ground_truth');
  });

  it('flags a bucket that mixes recall bases', () => {
    const stats = aggregate([mk('a', 'x', [1], 1), mk('b', 'x', [1])]);
    assert.equal(stats.recallBasis, 'mixed');
  });

  it('counts a failed probe in the total but not in the mean', () => {
    const failed: ProbeResult = {
      probeId: 'f', label: 'f', variant: 'control', category: 'x', query: 'q',
      status: 'failed', retrievedIds: [], relevance: [], error: 'boom',
    };
    const stats = aggregate([mk('a', 'x', [1], 1), failed]);
    assert.equal(stats.total, 2);
    assert.equal(stats.hitRate, 1, 'the failure must not be scored as a miss');
  });
});

describe('memScore', () => {
  it('prints quality, latency and tokens together', () => {
    assert.equal(memScore(95, 120, 720), '95% / 120ms / 720tok');
  });

  it('rounds rather than emitting long floats', () => {
    assert.equal(memScore(66.666, 12.4, 719.5), '67% / 12ms / 720tok');
  });
});
