/**
 * Tests for directive-scorer.ts — directive selection for prompt injection.
 *
 * Uses Node.js built-in test runner (node:test) + tsx for TypeScript support.
 * Run with: npx tsx --test backend/src/__tests__/directive-scorer.test.ts
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The priority scale was read BACKWARDS here for months and nothing noticed,
 * because the function that decides which operating rules reach a prompt had no
 * test at all. The scale runs LOW = generic, HIGH = binding — every writer uses
 * it that way (claude-rules-mirror sets 60 "above default workspace guidance
 * (50)"; the agent-write path clamps to 1-89 "never outrank moe-direct", so
 * Moe's own rules sit at 90+). The scorer inverted it, so a 300-token budget
 * spent itself on "You are a worker in Porter" and clipped Moe's rules entirely.
 *
 * These tests pin the DIRECTION. If someone flips a comparator back, this goes
 * red instead of a prompt quietly getting dumber.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const row = (priority: number, content: string, tags: string[] = []) => ({ priority, content, tags });

// A realistic slice of the live table, deliberately built in the WRONG order
// so a test that passes by accident of input ordering cannot.
const SAMPLE = [
  row(10, 'You are a worker in Porter, an AI orchestration platform.'),
  row(50, 'Read the canonical checkpoint at CHECKPOINT.md at session start.'),
  row(90, "You need to reply to my messages even when I don't tag you directly."),
  row(60, 'CLAUDE SESSION RULES (mirror) — never guess, verify before done.'),
  row(20, 'Never guess. Always investigate first.'),
];

describe('scoreDirective — priority direction', () => {
  it('DS-01: a higher priority number yields a higher base score', async () => {
    const { scoreDirective } = await import('../services/directive-scorer.js');
    const binding = scoreDirective([], [], row(90, 'moe-direct rule'));
    const generic = scoreDirective([], [], row(10, 'generic identity line'));
    assert.ok(
      binding.score > generic.score,
      `priority 90 must outscore priority 10, got ${binding.score} vs ${generic.score}`,
    );
  });

  it('DS-02: the bonus is monotonic across the whole scale', async () => {
    const { scoreDirective } = await import('../services/directive-scorer.js');
    const scores = [10, 30, 50, 70, 90].map((p) => scoreDirective([], [], row(p, 'x')).score);
    for (let i = 1; i < scores.length; i++) {
      assert.ok(scores[i] >= scores[i - 1], `score must not decrease as priority rises: ${scores}`);
    }
  });
});

describe('selectDirectives — ordering and the always-inject floor', () => {
  it('DS-03: with no task context, the most binding rule comes FIRST', async () => {
    const { selectDirectives } = await import('../services/directive-scorer.js');
    const { directives } = selectDirectives(SAMPLE, [], [], 10_000);
    assert.equal(directives[0].priority, 90, 'priority 90 must lead the no-context fallback');
    assert.equal(directives[directives.length - 1].priority, 10, 'priority 10 must come last');
  });

  it('DS-04: a tight budget keeps the binding rules and drops the generic ones', async () => {
    const { selectDirectives } = await import('../services/directive-scorer.js');
    // Budget big enough for roughly two lines — the regression this file exists for.
    const { directives } = selectDirectives(SAMPLE, ['reply', 'messages'], [], 40);
    const kept = directives.map((d) => d.priority);
    assert.ok(kept.includes(90), `the priority-90 rule must survive a tight budget, kept: ${kept}`);
    assert.ok(!kept.includes(10), `the priority-10 filler must not survive it, kept: ${kept}`);
  });

  it('DS-05: priority >= 90 bypasses scoring even with no keyword match', async () => {
    const { selectDirectives } = await import('../services/directive-scorer.js');
    const { directives, stats } = selectDirectives(SAMPLE, ['zzz-nothing-matches'], [], 10_000);
    assert.equal(stats.alwaysInjected, 1, 'exactly the one priority-90 row is always-injected');
    assert.equal(directives[0].priority, 90, 'always-inject rows lead the selection');
  });

  it('DS-06: nothing below the floor is treated as always-inject', async () => {
    const { selectDirectives } = await import('../services/directive-scorer.js');
    const belowFloor = [row(2, 'legacy low number'), row(89, 'just under moe-direct')];
    const { stats } = selectDirectives(belowFloor, ['anything'], [], 10_000);
    assert.equal(stats.alwaysInjected, 0, 'priority 2 and 89 are NOT always-inject');
  });
});
