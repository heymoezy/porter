/**
 * Pins the PRIORITY CONTRACT on the dream-proposal accept path.
 *
 * Run with: npx tsx --test backend/src/__tests__/dream-accept-priority.test.ts
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `directives.priority` runs LOW = generic, HIGH = binding. Moe's own rules sit at
 * 90+ (ALWAYS_INJECT_MIN_PRIORITY, services/directive-scorer.ts) and every reader
 * sorts DESC, so a rule at 90+ is injected before anything else and, under a render
 * cap, INSTEAD of it.
 *
 * The dream worker writes both the proposal AND the `proposed_metadata.priority` it
 * would like. Accept used to write that number through verbatim, so a proposal
 * asking for 95 would have landed level with Moe's sealed seeds — machine output
 * outranking the human it exists to serve. The agent-memory write path already
 * clamped (routes/v1/intellect.ts:605); this path did not.
 *
 * The clamp is the whole guarantee, it is one expression, and nothing downstream
 * re-checks it. That is exactly the kind of invariant that belongs in a test rather
 * than in someone's memory.
 *
 * NOTE ON SCOPE: this pins the number, not the transaction. The accept handler's
 * atomicity, its silo/sealed-seed pre-flights and its SSE broadcast need a live
 * Postgres and are covered by exercising the route.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampProposedPriority, AGENT_MAX_PRIORITY } from '../routes/admin/dreams.js';

// The floor Moe's rules stand on. Duplicated deliberately as a literal: importing
// ALWAYS_INJECT_MIN_PRIORITY would let both sides drift together and still pass.
const MOE_FLOOR = 90;

test('the ceiling sits strictly below the always-inject floor', () => {
  assert.equal(AGENT_MAX_PRIORITY, 89);
  assert.ok(
    AGENT_MAX_PRIORITY < MOE_FLOOR,
    'an agent-written rule must never reach the priority band that is always injected',
  );
});

test('a proposal asking to outrank Moe is clamped, not honoured', () => {
  for (const asked of [90, 95, 99, 100, 1_000, Number.MAX_SAFE_INTEGER]) {
    assert.equal(
      clampProposedPriority(asked),
      AGENT_MAX_PRIORITY,
      `priority ${asked} must clamp to ${AGENT_MAX_PRIORITY}`,
    );
  }
});

test('priorities below the ceiling pass through untouched', () => {
  for (const asked of [1, 50, 60, 70, 88, 89]) {
    assert.equal(clampProposedPriority(asked), asked);
  }
});

test('a missing or non-numeric priority defaults to 50, never to the ceiling', () => {
  // Defaulting high would make "the worker forgot to say" the loudest rule in the
  // system. proposed_metadata is free-form jsonb, so every one of these is reachable.
  for (const bad of [undefined, null, 'high', '95', {}, [], true, NaN, Infinity, -Infinity]) {
    assert.equal(clampProposedPriority(bad), 50, `${String(bad)} must default to 50`);
  }
});

test('a zero or negative priority floors at 1, so a rule is never unrankable', () => {
  for (const asked of [0, -1, -100]) {
    assert.equal(clampProposedPriority(asked), 1);
  }
});

test('a fractional priority is truncated to an integer (the column is integer)', () => {
  assert.equal(clampProposedPriority(70.9), 70);
  assert.equal(clampProposedPriority(89.9), 89);
});
