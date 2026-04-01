/**
 * Tests for rpg-engine.ts — RPG Stat Engine
 * Sole writer to agent_rpg_stats. All stats derived from bridge_dispatch_log.
 *
 * Uses Node.js built-in test runner (node:test) + tsx for TypeScript support.
 * Run with: npx tsx --test backend/src/__tests__/rpg-engine.test.ts
 *
 * These tests verify the pure computation logic (XP awards, stat formulas,
 * progression thresholds, rarity rules) without requiring a live DB.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── XP_AWARDS constant verification ────────────────────────────────────────

describe('XP_AWARDS', () => {
  it('dispatch awards exactly 10 XP', async () => {
    const { XP_AWARDS } = await import('../services/rpg-engine.js');
    assert.equal(XP_AWARDS['dispatch'], 10);
  });

  it('feedback awards exactly 25 XP', async () => {
    const { XP_AWARDS } = await import('../services/rpg-engine.js');
    assert.equal(XP_AWARDS['feedback'], 25);
  });

  it('specialty awards exactly 50 XP', async () => {
    const { XP_AWARDS } = await import('../services/rpg-engine.js');
    assert.equal(XP_AWARDS['specialty'], 50);
  });

  it('battle_won awards exactly 100 XP', async () => {
    const { XP_AWARDS } = await import('../services/rpg-engine.js');
    assert.equal(XP_AWARDS['battle_won'], 100);
  });

  it('battle_lost awards exactly 25 XP', async () => {
    const { XP_AWARDS } = await import('../services/rpg-engine.js');
    assert.equal(XP_AWARDS['battle_lost'], 25);
  });

  it('chain awards exactly 75 XP', async () => {
    const { XP_AWARDS } = await import('../services/rpg-engine.js');
    assert.equal(XP_AWARDS['chain'], 75);
  });

  it('failed awards exactly 2 XP', async () => {
    const { XP_AWARDS } = await import('../services/rpg-engine.js');
    assert.equal(XP_AWARDS['failed'], 2);
  });
});

// ── Stat formula unit tests (pure computation, no DB) ───────────────────────

describe('computeQuality()', () => {
  it('returns 0 when total_count is 0', async () => {
    const { computeQuality } = await import('../services/rpg-engine.js');
    assert.equal(computeQuality(0, 0), 0);
  });

  it('returns 100 when all dispatches have output_tokens', async () => {
    const { computeQuality } = await import('../services/rpg-engine.js');
    assert.equal(computeQuality(10, 10), 100);
  });

  it('returns 50 when half dispatches have output_tokens', async () => {
    const { computeQuality } = await import('../services/rpg-engine.js');
    assert.equal(computeQuality(5, 10), 50);
  });
});

describe('computeSpeed()', () => {
  it('returns 0 when p95 is null', async () => {
    const { computeSpeed } = await import('../services/rpg-engine.js');
    assert.equal(computeSpeed(null), 0);
  });

  it('returns 100 when p95 latency is 0ms', async () => {
    const { computeSpeed } = await import('../services/rpg-engine.js');
    assert.equal(computeSpeed(0), 100);
  });

  it('returns 0 when p95 latency is 30000ms or more', async () => {
    const { computeSpeed } = await import('../services/rpg-engine.js');
    assert.equal(computeSpeed(30000), 0);
    assert.ok(computeSpeed(60000) <= 0);
  });

  it('returns ~33 when p95 latency is 20000ms', async () => {
    const { computeSpeed } = await import('../services/rpg-engine.js');
    const speed = computeSpeed(20000);
    assert.ok(speed > 32 && speed < 34, `expected ~33, got ${speed}`);
  });
});

describe('computeEfficiency()', () => {
  it('returns 0 when avg_ratio is null', async () => {
    const { computeEfficiency } = await import('../services/rpg-engine.js');
    assert.equal(computeEfficiency(null), 0);
  });

  it('returns 100 when avg ratio is 2.0 (max)', async () => {
    const { computeEfficiency } = await import('../services/rpg-engine.js');
    assert.equal(computeEfficiency(2.0), 100);
  });

  it('caps at 100 even for ratio > 2.0', async () => {
    const { computeEfficiency } = await import('../services/rpg-engine.js');
    assert.equal(computeEfficiency(5.0), 100);
  });

  it('returns 50 when avg ratio is 1.0', async () => {
    const { computeEfficiency } = await import('../services/rpg-engine.js');
    assert.equal(computeEfficiency(1.0), 50);
  });
});

describe('computeReliability()', () => {
  it('returns 0 when recent_count is 0', async () => {
    const { computeReliability } = await import('../services/rpg-engine.js');
    assert.equal(computeReliability(0, 0), 0);
  });

  it('returns 100 when all recent dispatches succeeded', async () => {
    const { computeReliability } = await import('../services/rpg-engine.js');
    assert.equal(computeReliability(30, 30), 100);
  });

  it('returns ~83.33 when 25 of 30 recent dispatches succeeded', async () => {
    const { computeReliability } = await import('../services/rpg-engine.js');
    const rel = computeReliability(25, 30);
    assert.ok(rel > 83 && rel < 84, `expected ~83.33, got ${rel}`);
  });
});

describe('computeCombo()', () => {
  it('returns 0 when total_chains is 0', async () => {
    const { computeCombo } = await import('../services/rpg-engine.js');
    assert.equal(computeCombo(0, 0), 0);
  });

  it('returns 100 when all chains succeeded', async () => {
    const { computeCombo } = await import('../services/rpg-engine.js');
    assert.equal(computeCombo(10, 10), 100);
  });

  it('returns 60 when 6 of 10 chains succeeded', async () => {
    const { computeCombo } = await import('../services/rpg-engine.js');
    assert.equal(computeCombo(6, 10), 60);
  });
});

// ── Level computation ────────────────────────────────────────────────────────

describe('computeLevel()', () => {
  it('stays at level 1 with 0 XP', async () => {
    const { computeLevel } = await import('../services/rpg-engine.js');
    assert.equal(computeLevel(0, 1), 1);
  });

  it('stays at level 1 with 99 XP (threshold is 100)', async () => {
    const { computeLevel } = await import('../services/rpg-engine.js');
    assert.equal(computeLevel(99, 1), 1);
  });

  it('advances to level 2 with exactly 100 XP (1 * 100 threshold)', async () => {
    const { computeLevel } = await import('../services/rpg-engine.js');
    assert.equal(computeLevel(100, 1), 2);
  });

  it('advances to level 3 with 300 XP (cumulative: 100+200)', async () => {
    const { computeLevel } = await import('../services/rpg-engine.js');
    // At level 2 after 100 XP, need another 200 XP (2*100) to reach level 3
    // Total: 100 + 200 = 300 XP
    assert.equal(computeLevel(300, 1), 3);
  });

  it('never exceeds level 100', async () => {
    const { computeLevel } = await import('../services/rpg-engine.js');
    // Even with enormous XP, cap at 100
    assert.equal(computeLevel(99999999, 1), 100);
  });
});

// ── Star progression thresholds ─────────────────────────────────────────────

describe('computeStars()', () => {
  it('returns 1 star for dispatch_count=0 (forged but never dispatched)', async () => {
    const { computeStars } = await import('../services/rpg-engine.js');
    assert.equal(computeStars(0, 0, 100, false), 1);
  });

  it('returns 1 star for dispatch_count=49', async () => {
    const { computeStars } = await import('../services/rpg-engine.js');
    assert.equal(computeStars(49, 0, 100, false), 1);
  });

  it('returns 2 stars for dispatch_count=50', async () => {
    const { computeStars } = await import('../services/rpg-engine.js');
    assert.equal(computeStars(50, 0, 100, false), 2);
  });

  it('returns 2 stars for dispatch_count=200 with reliability < 85', async () => {
    const { computeStars } = await import('../services/rpg-engine.js');
    assert.equal(computeStars(200, 0, 80, false), 2);
  });

  it('returns 3 stars for dispatch_count=200 AND reliability >= 85', async () => {
    const { computeStars } = await import('../services/rpg-engine.js');
    assert.equal(computeStars(200, 0, 85, false), 3);
  });

  it('returns 4 stars for dispatch_count=500 AND battle_count >= 10', async () => {
    const { computeStars } = await import('../services/rpg-engine.js');
    assert.equal(computeStars(500, 10, 90, false), 4);
  });

  it('returns 3 stars for dispatch_count=500 but battle_count=5 (no star 4 yet)', async () => {
    const { computeStars } = await import('../services/rpg-engine.js');
    assert.equal(computeStars(500, 5, 90, false), 3);
  });

  it('returns 5 stars for dispatch_count=1000 AND isTopPerformer=true', async () => {
    const { computeStars } = await import('../services/rpg-engine.js');
    assert.equal(computeStars(1000, 20, 95, true), 5);
  });

  it('returns 4 stars for dispatch_count=1000 but isTopPerformer=false', async () => {
    const { computeStars } = await import('../services/rpg-engine.js');
    assert.equal(computeStars(1000, 20, 95, false), 4);
  });
});

// ── Rarity thresholds ────────────────────────────────────────────────────────

describe('computeRarity()', () => {
  it('returns common when rpg_enabled=0 (never forged)', async () => {
    const { computeRarity } = await import('../services/rpg-engine.js');
    assert.equal(computeRarity(false, 0, false), 'common');
  });

  it('returns rare when rpg_enabled=1 and dispatch_count=1', async () => {
    const { computeRarity } = await import('../services/rpg-engine.js');
    assert.equal(computeRarity(true, 1, false), 'rare');
  });

  it('returns epic for dispatch_count=50', async () => {
    const { computeRarity } = await import('../services/rpg-engine.js');
    assert.equal(computeRarity(true, 50, false), 'epic');
  });

  it('returns legendary for dispatch_count=500 AND top 10% win rate', async () => {
    const { computeRarity } = await import('../services/rpg-engine.js');
    assert.equal(computeRarity(true, 500, true), 'legendary');
  });

  it('returns epic for dispatch_count=500 without top 10% win rate', async () => {
    const { computeRarity } = await import('../services/rpg-engine.js');
    assert.equal(computeRarity(true, 500, false), 'epic');
  });

  it('returns mythic for dispatch_count=5000', async () => {
    const { computeRarity } = await import('../services/rpg-engine.js');
    assert.equal(computeRarity(true, 5000, false), 'mythic');
  });

  it('returns mythic for dispatch_count=5001 (mythic beats legendary)', async () => {
    const { computeRarity } = await import('../services/rpg-engine.js');
    assert.equal(computeRarity(true, 5001, true), 'mythic');
  });
});

// ── Exported function signatures ─────────────────────────────────────────────

describe('exports', () => {
  it('exports recalculateStats function', async () => {
    const mod = await import('../services/rpg-engine.js');
    assert.equal(typeof mod.recalculateStats, 'function');
  });

  it('exports awardXP function', async () => {
    const mod = await import('../services/rpg-engine.js');
    assert.equal(typeof mod.awardXP, 'function');
  });

  it('exports checkProgression function', async () => {
    const mod = await import('../services/rpg-engine.js');
    assert.equal(typeof mod.checkProgression, 'function');
  });

  it('exports getRpgStats function', async () => {
    const mod = await import('../services/rpg-engine.js');
    assert.equal(typeof mod.getRpgStats, 'function');
  });
});
