/**
 * Tests for supersession.ts — semantic contradiction resolution for directives.
 *
 * Run with: npx tsx --test backend/src/__tests__/supersession.test.ts
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `gateSupersession()` is the only thing standing between a background job and
 * a rule of Moe's quietly leaving every prompt. The idea it implements was
 * imported from supermemory, whose resolution policy is RECENCY-WINS — correct
 * for user facts ("I moved to SF" beats "I live in NYC"), catastrophic for a
 * precedence lattice where agent-written rules clamp to <= 89 specifically so
 * they can never outrank Moe's 90+.
 *
 * These tests pin PRECEDENCE OVER RECENCY. If someone simplifies the gate toward
 * the upstream policy, this goes red instead of a binding rule disappearing.
 *
 * Pure functions only — no DB, no model.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  gateSupersession,
  parseAdjudication,
  cosine,
  ALWAYS_INJECT_MIN_PRIORITY,
  TOPIC_SIMILARITY_MIN,
  LEXICAL_DUP_MAX,
} from '../services/intellect/supersession.js';
import type { Adjudication, ContradictionPair, DirectiveRow } from '../services/intellect/supersession.js';

const row = (over: Partial<DirectiveRow> = {}): DirectiveRow => ({
  id: 'r1',
  content: 'a rule',
  priority: 50,
  scope: 'project',
  scope_id: 'Porter',
  source_type: 'agent',
  created_at: 1_700_000_000,
  ...over,
});

const pairOf = (a: Partial<DirectiveRow>, b: Partial<DirectiveRow>): ContradictionPair => ({
  a: row({ id: 'a', ...a }),
  b: row({ id: 'b', ...b }),
  topicSimilarity: 0.8,
  lexicalSimilarity: 0.2,
});

const verdict = (over: Partial<Adjudication> = {}): Adjudication => ({
  contradicts: true,
  retire: 'a',
  confidence: 90,
  reason: 'b supersedes a',
  ...over,
});

describe('gateSupersession — precedence outranks recency', () => {
  it('refuses to retire a binding rule in favour of a weaker one', () => {
    // The upstream recency policy would allow this: `a` is Moe's rule at 95,
    // `b` is an agent rule written later. Retiring `a` is exactly the outcome
    // the priority clamp exists to prevent.
    const out = gateSupersession(
      pairOf({ priority: 95, source_type: 'system', created_at: 1 }, { priority: 60, created_at: 999 }),
      verdict({ retire: 'a' }),
    );
    assert.equal(out.action, 'skip');
    assert.match(out.reason, /binding rule/);
  });

  it('refuses when an agent-tier rule would retire a Moe-tier rule at equal-or-lower priority', () => {
    const out = gateSupersession(
      pairOf({ priority: 90 }, { priority: 89 }),
      verdict({ retire: 'a' }),
    );
    assert.equal(out.action, 'skip');
  });

  it('allows a binding rule to retire a weaker one', () => {
    const out = gateSupersession(
      pairOf({ priority: 40 }, { priority: 95 }),
      verdict({ retire: 'a' }),
    );
    assert.equal(out.action, 'propose');
    if (out.action === 'propose') {
      assert.equal(out.retireId, 'a');
      assert.equal(out.keepId, 'b');
    }
  });

  it('allows retirement between two rules of the same tier', () => {
    const out = gateSupersession(pairOf({ priority: 50 }, { priority: 60 }), verdict({ retire: 'a' }));
    assert.equal(out.action, 'propose');
  });

  it('allows two binding rules to resolve against each other', () => {
    // Both are Moe's tier, so the clamp is not in play and the adjudicator's
    // reading stands.
    const out = gateSupersession(
      pairOf({ priority: 95, source_type: 'system' }, { priority: 92, source_type: 'system' }),
      verdict({ retire: 'b' }),
    );
    assert.equal(out.action, 'propose');
  });
});

describe('gateSupersession — sealed rows', () => {
  it('never targets a moe-direct row (the DB trigger would abort the write)', () => {
    const out = gateSupersession(
      pairOf({ source_type: 'moe-direct', priority: 50 }, { priority: 95 }),
      verdict({ retire: 'a' }),
    );
    assert.equal(out.action, 'skip');
    assert.match(out.reason, /moe-direct/);
  });

  it('permits a moe-direct row to be the SURVIVOR', () => {
    const out = gateSupersession(
      pairOf({ priority: 50 }, { source_type: 'moe-direct', priority: 95 }),
      verdict({ retire: 'a' }),
    );
    assert.equal(out.action, 'propose');
  });
});

describe('gateSupersession — scope', () => {
  it('refuses across scopes — a general rule and its local exception', () => {
    const out = gateSupersession(
      pairOf({ scope: 'workspace', scope_id: null }, { scope: 'project', scope_id: 'Porter' }),
      verdict(),
    );
    assert.equal(out.action, 'skip');
    assert.match(out.reason, /cross-scope/);
  });

  it('refuses across two different projects', () => {
    const out = gateSupersession(
      pairOf({ scope: 'project', scope_id: 'Porter' }, { scope: 'project', scope_id: 'ymc' }),
      verdict(),
    );
    assert.equal(out.action, 'skip');
  });

  it('allows within one scope', () => {
    const out = gateSupersession(
      pairOf({ scope: 'project', scope_id: 'Porter' }, { scope: 'project', scope_id: 'Porter' }),
      verdict(),
    );
    assert.equal(out.action, 'propose');
  });
});

describe('gateSupersession — adjudicator verdicts', () => {
  it('skips when no contradiction was found', () => {
    const out = gateSupersession(pairOf({}, {}), verdict({ contradicts: false }));
    assert.equal(out.action, 'skip');
  });

  it('skips when the adjudicator retired neither', () => {
    const out = gateSupersession(pairOf({}, {}), verdict({ retire: 'neither' }));
    assert.equal(out.action, 'skip');
  });

  it('skips below the confidence floor', () => {
    const out = gateSupersession(pairOf({}, {}), verdict({ confidence: 69 }));
    assert.equal(out.action, 'skip');
    assert.match(out.reason, /confidence/);
  });

  it('honours a caller-supplied confidence floor', () => {
    const low = gateSupersession(pairOf({}, {}), verdict({ confidence: 75 }), { minConfidence: 80 });
    assert.equal(low.action, 'skip');
    const ok = gateSupersession(pairOf({}, {}), verdict({ confidence: 75 }), { minConfidence: 70 });
    assert.equal(ok.action, 'propose');
  });

  it('checks the seal BEFORE confidence, so a sealed row is never a near miss', () => {
    // Both clauses would skip this pair, but the REASON matters: the seal is
    // absolute, while the confidence floor is a tunable someone may lower. If
    // this reported "confidence 10 below 70", the obvious next move would be to
    // drop the floor — and the pair still could not be applied.
    const out = gateSupersession(
      pairOf({ source_type: 'moe-direct' }, {}),
      verdict({ confidence: 10 }),
    );
    assert.equal(out.action, 'skip');
    assert.match(out.reason, /moe-direct/);
    assert.doesNotMatch(out.reason, /confidence/);
  });
});

describe('parseAdjudication', () => {
  it('reads a clean JSON object', () => {
    const v = parseAdjudication('{"contradicts": true, "retire": "b", "confidence": 88, "reason": "x"}');
    assert.equal(v.contradicts, true);
    assert.equal(v.retire, 'b');
    assert.equal(v.confidence, 88);
  });

  it('tolerates prose around the object, as CLI gateways emit', () => {
    const v = parseAdjudication(
      'Looking at these two rules...\n\n{"contradicts": false, "retire": "neither", "confidence": 20, "reason": "compatible"}\n\nHope that helps!',
    );
    assert.equal(v.contradicts, false);
    assert.equal(v.confidence, 20);
  });

  it('treats an unparseable response as no contradiction', () => {
    for (const bad of ['', 'I cannot answer that', '{ truncated', '{"retire": "maybe"}']) {
      const v = parseAdjudication(bad);
      assert.equal(v.contradicts, false, `for input: ${bad}`);
      assert.equal(v.retire, 'neither');
    }
  });

  it('does not read a missing confidence as certainty', () => {
    const v = parseAdjudication('{"contradicts": true, "retire": "a", "reason": "x"}');
    assert.equal(v.confidence, 0);
    // …and therefore cannot pass the gate.
    assert.equal(gateSupersession(pairOf({}, {}), v).action, 'skip');
  });

  it('clamps an out-of-range confidence', () => {
    assert.equal(parseAdjudication('{"contradicts":true,"retire":"a","confidence":900}').confidence, 100);
    assert.equal(parseAdjudication('{"contradicts":true,"retire":"a","confidence":-5}').confidence, 0);
  });
});

describe('cosine', () => {
  it('is 1 for identical vectors', () => {
    assert.ok(Math.abs(cosine([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
  });

  it('is 0 for orthogonal vectors', () => {
    assert.equal(cosine([1, 0], [0, 1]), 0);
  });

  it('is 0 rather than NaN for a zero vector', () => {
    assert.equal(cosine([0, 0], [1, 1]), 0);
  });

  it('is 0 for mismatched or empty input', () => {
    assert.equal(cosine([1, 2], [1]), 0);
    assert.equal(cosine([], []), 0);
  });
});

describe('thresholds', () => {
  it('leaves lexical duplicates to the existing pruner', () => {
    // memory-pruner.ts retires directives at similarity >= 0.85. If this ceiling
    // rose above that, both jobs would act on the same pair.
    assert.equal(LEXICAL_DUP_MAX, 0.85);
  });

  it('keeps the topic floor high enough to be worth a model call', () => {
    assert.ok(TOPIC_SIMILARITY_MIN >= 0.7);
  });

  it('matches the binding threshold used by the directive scorer', () => {
    assert.equal(ALWAYS_INJECT_MIN_PRIORITY, 90);
  });
});
