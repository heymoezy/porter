/**
 * Tests for the destructive-sweep FLOOR GUARDS.
 *
 * Run with: npx tsx --test backend/src/__tests__/floor-guards.test.ts
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Three nightly sweeps destroy rows on the premise that "I can no longer see X"
 * means "X was deleted". That premise is sound for a deleted page and
 * catastrophic for an unreadable ROOT, because every reader in this codebase
 * swallows a missing directory as the fresh-start case:
 *
 *   vault-indexer      : readVaultNodes() `continue`s past a missing folder → []
 *                        → every concept looks deleted → archives ALL of them
 *   claude-rules-mirror: readGlobalHardRules()/readProjectRules() catch → empty
 *                        → supersedes live rules with a header-only directive
 *   runnables reconcile: a failed systemctl read → found=[] → DELETEs every
 *                        systemd runnable, blinding staleness alerting
 *
 * None of these throw. The failure is silent, arrives on a 24h tick, and is
 * only visible later as "the model got dumber". These guards make an empty read
 * a REFUSAL rather than a deletion.
 *
 * This matters most for the config work that follows: the moment these roots
 * become configurable, a wrong path is one typo away from emptying the memory
 * layer. The guards must land first.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('vault-indexer floor guard', () => {
  it('FG-01: refuses to archive when a scan returns nothing but rows are live', async () => {
    const { shouldAbortOnEmptyScan } = await import('../services/intellect/vault-indexer.js');
    assert.equal(
      shouldAbortOnEmptyScan(0, 47),
      true,
      'scanning 0 pages while 47 concepts are active is a FAILED SCAN, not an emptied vault',
    );
  });

  it('FG-02: allows a genuinely empty install to stay empty', async () => {
    const { shouldAbortOnEmptyScan } = await import('../services/intellect/vault-indexer.js');
    assert.equal(shouldAbortOnEmptyScan(0, 0), false, 'fresh install: nothing scanned, nothing to lose');
  });

  it('FG-03: does not interfere with a normal run', async () => {
    const { shouldAbortOnEmptyScan } = await import('../services/intellect/vault-indexer.js');
    assert.equal(shouldAbortOnEmptyScan(47, 47), false, 'steady state must proceed');
    assert.equal(shouldAbortOnEmptyScan(48, 47), false, 'a page added must proceed');
  });

  it('FG-04: still permits a real partial deletion', async () => {
    const { shouldAbortOnEmptyScan } = await import('../services/intellect/vault-indexer.js');
    // Deliberately NOT a ratio guard. Deleting 46 of 47 pages is a legitimate
    // bulk edit; only zero-vs-nonzero is unambiguously a malfunction. A
    // percentage threshold would either block real deletions or wave through a
    // half-readable root.
    assert.equal(shouldAbortOnEmptyScan(1, 47), false, 'a large but partial delete is the user’s prerogative');
  });
});

describe('the guards encode a shared rule', () => {
  it('FG-05: "saw nothing" is only safe when there was nothing to lose', async () => {
    const { shouldAbortOnEmptyScan } = await import('../services/intellect/vault-indexer.js');
    // The same predicate shape protects claude-rules-mirror (ruleCount === 0 &&
    // prior.length > 0) and runnables (systemdSeen === 0 → skip prune). If this
    // table ever changes, those two must change with it.
    const cases: Array<[number, number, boolean]> = [
      [0, 1, true],   // saw nothing, had something  → refuse
      [0, 0, false],  // saw nothing, had nothing    → fine
      [1, 1, false],  // saw something               → proceed
      [1, 0, false],  // first ever run              → proceed
    ];
    for (const [seen, had, expected] of cases) {
      assert.equal(
        shouldAbortOnEmptyScan(seen, had),
        expected,
        `seen=${seen} had=${had} should ${expected ? 'ABORT' : 'proceed'}`,
      );
    }
  });
});
