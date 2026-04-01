/**
 * RPG Engine — Sole writer to agent_rpg_stats
 *
 * All 5 stats are permanently derived from bridge_dispatch_log (immutable
 * source of truth). No manual stat editing, ever.
 *
 * Exports: recalculateStats, awardXP, checkProgression, getRpgStats
 */

import { pool } from '../db/client.js';
import { v4 as uuidv4 } from 'uuid';
import { emitSSE } from './scheduler.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SpecialtyEntry {
  domain: string;
  winRate: number;
  sampleSize: number;
  label: string; // e.g. "Won 87% of Python debugging battles"
}

export interface RpgStats {
  id: string;
  templateId: string;
  quality: number;     // 0-100
  speed: number;       // 0-100
  efficiency: number;  // 0-100
  reliability: number; // 0-100
  combo: number;       // 0-100
  xp: number;
  level: number;       // 1-100
  stars: number;       // 1-5
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
  elo: number;
  dispatchCount: number;
  battleCount: number;
  specialties: SpecialtyEntry[];
  lastComputed: number;
}

export type XpEvent = 'dispatch' | 'feedback' | 'specialty' | 'battle_won' | 'battle_lost' | 'chain' | 'failed';

// ── XP Awards (design spec — exact values) ───────────────────────────────────

export const XP_AWARDS: Record<XpEvent, number> = {
  dispatch:    10,
  feedback:    25,
  specialty:   50,
  battle_won:  100,
  battle_lost: 25,
  chain:       75,
  failed:      2,
};

// ── Pure computation helpers (exported for unit tests) ───────────────────────

/**
 * Quality: success rate = rows with output_tokens > 0 / total rows.
 */
export function computeQuality(successCount: number, totalCount: number): number {
  if (totalCount === 0) return 0;
  return (successCount / totalCount) * 100;
}

/**
 * Speed: inverse of p95 latency. p95=0ms → 100, p95=30000ms → 0.
 */
export function computeSpeed(p95: number | null): number {
  if (p95 === null) return 0;
  return Math.max(0, 100 - (p95 / 30000) * 100);
}

/**
 * Efficiency: avg output/input token ratio capped at 100.
 * Ratio of 2.0 = 100% efficiency.
 */
export function computeEfficiency(avgRatio: number | null): number {
  if (avgRatio === null) return 0;
  return Math.min(100, avgRatio * 50);
}

/**
 * Reliability: ok count / recent count over last 30 dispatches.
 */
export function computeReliability(okCount: number, recentCount: number): number {
  if (recentCount === 0) return 0;
  return (okCount / recentCount) * 100;
}

/**
 * Combo: multi-agent chain success rate from agent_bonds.
 */
export function computeCombo(totalSuccess: number, totalChains: number): number {
  if (totalChains === 0) return 0;
  return (totalSuccess / totalChains) * 100;
}

/**
 * Level: advance while xp >= level * 100, capped at 100.
 */
export function computeLevel(xp: number, startLevel: number): number {
  let level = startLevel;
  while (level < 100 && xp >= level * 100) {
    xp -= level * 100;
    level++;
  }
  return level;
}

/**
 * Stars: threshold progression based on dispatch/battle/reliability/elo.
 *
 * stars=1  default (forged)
 * stars=2  dispatchCount >= 50
 * stars=3  dispatchCount >= 200 && reliability >= 85
 * stars=4  dispatchCount >= 500 && battleCount >= 10
 * stars=5  dispatchCount >= 1000 && isTopPerformer (top 10% by elo)
 */
export function computeStars(
  dispatchCount: number,
  battleCount: number,
  reliability: number,
  isTopPerformer: boolean,
): number {
  if (dispatchCount >= 1000 && isTopPerformer) return 5;
  if (dispatchCount >= 500 && battleCount >= 10) return 4;
  if (dispatchCount >= 200 && reliability >= 85) return 3;
  if (dispatchCount >= 50) return 2;
  return 1;
}

/**
 * Rarity: tier based on dispatch history and battle win rate.
 *
 * common     rpg_enabled = 0 (never forged)
 * rare       rpg_enabled = 1, dispatch_count >= 1
 * epic       dispatch_count >= 50
 * legendary  dispatch_count >= 500 AND top 10% battle win rate
 * mythic     dispatch_count >= 5000
 */
export function computeRarity(
  rpgEnabled: boolean,
  dispatchCount: number,
  isTopWinRate: boolean,
): 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' {
  if (!rpgEnabled) return 'common';
  if (dispatchCount >= 5000) return 'mythic';
  if (dispatchCount >= 500 && isTopWinRate) return 'legendary';
  if (dispatchCount >= 50) return 'epic';
  if (dispatchCount >= 1) return 'rare';
  return 'common';
}

// ── Internal helpers ─────────────────────────────────────────────────────────

async function computeSpecialties(templateId: string): Promise<SpecialtyEntry[]> {
  try {
    const { rows } = await pool.query<{
      domain: string;
      total_battles: string;
      wins: string;
    }>(
      `SELECT
         COALESCE(b.domain, 'general') AS domain,
         COUNT(*) AS total_battles,
         COUNT(*) FILTER (WHERE b.winner_id = $1) AS wins
       FROM battles b
       WHERE (b.challenger_id = $1 OR b.defender_id = $1)
         AND b.status = 'completed'
       GROUP BY domain
       HAVING COUNT(*) >= 5
       ORDER BY (COUNT(*) FILTER (WHERE b.winner_id = $1))::float / COUNT(*) DESC
       LIMIT 5`,
      [templateId],
    );

    return rows.map((row) => {
      const total = parseInt(row.total_battles, 10);
      const wins = parseInt(row.wins, 10);
      const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
      return {
        domain: row.domain,
        winRate,
        sampleSize: total,
        label: `Won ${winRate}% of ${row.domain} battles`,
      };
    });
  } catch (err) {
    console.error('[rpg-engine] computeSpecialties error:', err);
    return [];
  }
}

async function isTopPerformerByElo(templateId: string, elo: number): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ p90: number }>(
      `SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY elo) AS p90
       FROM agent_rpg_stats`,
    );
    const p90 = rows[0]?.p90 ?? 1200;
    return elo >= p90;
  } catch {
    return false;
  }
}

async function isTopWinRateByBattles(templateId: string): Promise<boolean> {
  try {
    // Get this agent's win rate
    const { rows: agentRows } = await pool.query<{
      total: string;
      wins: string;
    }>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE winner_id = $1) AS wins
       FROM battles
       WHERE (challenger_id = $1 OR defender_id = $1) AND status = 'completed'`,
      [templateId],
    );
    const total = parseInt(agentRows[0]?.total ?? '0', 10);
    const wins = parseInt(agentRows[0]?.wins ?? '0', 10);
    if (total < 5) return false;
    const agentWinRate = wins / total;

    // Compare against p90 win rate across all agents
    const { rows: pctRows } = await pool.query<{ p90: number }>(
      `SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY win_rate) AS p90
       FROM (
         SELECT
           template_id,
           COUNT(*) FILTER (WHERE winner_id = template_id) ::float / NULLIF(COUNT(*), 0) AS win_rate
         FROM agent_rpg_stats r
         JOIN battles b ON (b.challenger_id = r.template_id OR b.defender_id = r.template_id)
         WHERE b.status = 'completed'
         GROUP BY r.template_id
         HAVING COUNT(*) >= 5
       ) sub`,
    );
    const p90 = pctRows[0]?.p90 ?? 1.0;
    return agentWinRate >= p90;
  } catch {
    return false;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * recalculateStats — Runs 6 SQL queries against bridge_dispatch_log, agent_bonds,
 * and battles. Writes result to agent_rpg_stats. Returns computed RpgStats.
 *
 * This is the SOLE writer of stat columns in agent_rpg_stats.
 */
export async function recalculateStats(templateId: string): Promise<RpgStats> {
  const now = Date.now() / 1000;

  try {
    // ── 1. Quality — success rate ────────────────────────────────────────────
    const { rows: qualityRows } = await pool.query<{
      success_count: string;
      total_count: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE output_tokens IS NOT NULL AND output_tokens > 0) AS success_count,
         COUNT(*) AS total_count
       FROM bridge_dispatch_log
       WHERE agent_id = $1`,
      [templateId],
    );
    const successCount = parseInt(qualityRows[0]?.success_count ?? '0', 10);
    const totalCount = parseInt(qualityRows[0]?.total_count ?? '0', 10);
    const quality = computeQuality(successCount, totalCount);

    // ── 2. Speed — inverse of p95 latency ───────────────────────────────────
    const { rows: speedRows } = await pool.query<{ p95: number | null }>(
      `SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95
       FROM bridge_dispatch_log
       WHERE agent_id = $1 AND latency_ms IS NOT NULL`,
      [templateId],
    );
    const p95 = speedRows[0]?.p95 ?? null;
    const speed = computeSpeed(p95);

    // ── 3. Efficiency — output/input token ratio ─────────────────────────────
    const { rows: effRows } = await pool.query<{ avg_ratio: number | null }>(
      `SELECT
         AVG(CASE WHEN input_tokens > 0 THEN output_tokens::float / input_tokens ELSE NULL END) AS avg_ratio
       FROM bridge_dispatch_log
       WHERE agent_id = $1 AND input_tokens IS NOT NULL AND output_tokens IS NOT NULL`,
      [templateId],
    );
    const avgRatio = effRows[0]?.avg_ratio ?? null;
    const efficiency = computeEfficiency(avgRatio);

    // ── 4. Reliability — success rate over last 30 dispatches ────────────────
    const { rows: relRows } = await pool.query<{
      ok_count: string;
      recent_count: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE output_tokens IS NOT NULL AND output_tokens > 0) AS ok_count,
         COUNT(*) AS recent_count
       FROM (
         SELECT output_tokens FROM bridge_dispatch_log
         WHERE agent_id = $1
         ORDER BY created_at DESC
         LIMIT 30
       ) sub`,
      [templateId],
    );
    const okCount = parseInt(relRows[0]?.ok_count ?? '0', 10);
    const recentCount = parseInt(relRows[0]?.recent_count ?? '0', 10);
    const reliability = computeReliability(okCount, recentCount);

    // ── 5. Combo — agent_bonds chain success rate ────────────────────────────
    const { rows: comboRows } = await pool.query<{
      total_success: string;
      total_chains: string;
    }>(
      `SELECT
         COALESCE(SUM(success_count), 0) AS total_success,
         COALESCE(SUM(chain_count), 0) AS total_chains
       FROM agent_bonds
       WHERE agent_a_id = $1 OR agent_b_id = $1`,
      [templateId],
    );
    const totalSuccess = parseInt(comboRows[0]?.total_success ?? '0', 10);
    const totalChains = parseInt(comboRows[0]?.total_chains ?? '0', 10);
    const combo = computeCombo(totalSuccess, totalChains);

    // ── 6. Dispatch + battle counts ──────────────────────────────────────────
    const { rows: dispatchRows } = await pool.query<{ dispatch_count: string }>(
      `SELECT COUNT(*) AS dispatch_count FROM bridge_dispatch_log WHERE agent_id = $1`,
      [templateId],
    );
    const dispatchCount = parseInt(dispatchRows[0]?.dispatch_count ?? '0', 10);

    const { rows: battleRows } = await pool.query<{ battle_count: string }>(
      `SELECT COUNT(*) AS battle_count FROM battles WHERE challenger_id = $1 OR defender_id = $1`,
      [templateId],
    );
    const battleCount = parseInt(battleRows[0]?.battle_count ?? '0', 10);

    // ── 7. Specialties ───────────────────────────────────────────────────────
    const specialties = await computeSpecialties(templateId);

    // ── 8. Get current xp/level/elo from existing row (preserve progression) ─
    const { rows: existingRows } = await pool.query<{
      id: string;
      xp: number;
      level: number;
      stars: number;
      rarity: string;
      elo: number;
    }>(
      `SELECT id, xp, level, stars, rarity, elo FROM agent_rpg_stats WHERE template_id = $1`,
      [templateId],
    );
    const existing = existingRows[0];
    const existingId = existing?.id ?? uuidv4();
    const xp = existing?.xp ?? 0;
    const level = existing?.level ?? 1;
    const elo = existing?.elo ?? 1200;

    // ── 9. Compute stars + rarity ────────────────────────────────────────────
    const topPerformer = await isTopPerformerByElo(templateId, elo);
    const stars = computeStars(dispatchCount, battleCount, reliability, topPerformer);

    const { rows: rpgEnabledRows } = await pool.query<{ rpg_enabled: number }>(
      `SELECT rpg_enabled FROM agent_templates WHERE id = $1`,
      [templateId],
    );
    const rpgEnabled = (rpgEnabledRows[0]?.rpg_enabled ?? 0) === 1;
    const topWinRate = await isTopWinRateByBattles(templateId);
    const rarity = computeRarity(rpgEnabled, dispatchCount, topWinRate);

    // ── 10. Upsert agent_rpg_stats ───────────────────────────────────────────
    if (existing) {
      await pool.query(
        `UPDATE agent_rpg_stats SET
           quality = $1, speed = $2, efficiency = $3, reliability = $4, combo = $5,
           dispatch_count = $6, battle_count = $7, specialties = $8::jsonb,
           stars = $9, rarity = $10,
           last_computed = $11, updated_at = $11
         WHERE template_id = $12`,
        [
          quality, speed, efficiency, reliability, combo,
          dispatchCount, battleCount, JSON.stringify(specialties),
          stars, rarity,
          now, templateId,
        ],
      );
    } else {
      await pool.query(
        `INSERT INTO agent_rpg_stats
           (id, template_id, quality, speed, efficiency, reliability, combo,
            xp, level, stars, rarity, elo,
            dispatch_count, battle_count, specialties, last_computed, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $16, $16)`,
        [
          existingId, templateId, quality, speed, efficiency, reliability, combo,
          xp, level, stars, rarity, elo,
          dispatchCount, battleCount, JSON.stringify(specialties), now,
        ],
      );
    }

    return {
      id: existingId,
      templateId,
      quality,
      speed,
      efficiency,
      reliability,
      combo,
      xp,
      level,
      stars,
      rarity: rarity as RpgStats['rarity'],
      elo,
      dispatchCount,
      battleCount,
      specialties,
      lastComputed: now,
    };
  } catch (err) {
    console.error('[rpg-engine] recalculateStats error:', err);
    return {
      id: '',
      templateId,
      quality: 0,
      speed: 0,
      efficiency: 0,
      reliability: 0,
      combo: 0,
      xp: 0,
      level: 1,
      stars: 1,
      rarity: 'common',
      elo: 1200,
      dispatchCount: 0,
      battleCount: 0,
      specialties: [],
      lastComputed: now,
    };
  }
}

/**
 * awardXP — Add XP for an event. Updates xp, level, stars, rarity.
 * Emits SSE rpg:level_up if the agent levels up.
 * Fire-safe: catches errors and never throws.
 */
export async function awardXP(templateId: string, event: XpEvent): Promise<void> {
  try {
    const xpGain = XP_AWARDS[event];

    // Get or create the agent_rpg_stats row
    const { rows } = await pool.query<{
      id: string;
      xp: number;
      level: number;
      stars: number;
      rarity: string;
      elo: number;
      dispatch_count: number;
      reliability: number;
    }>(
      `SELECT id, xp, level, stars, rarity, elo, dispatch_count, reliability
       FROM agent_rpg_stats WHERE template_id = $1`,
      [templateId],
    );

    let id: string;
    let currentXp: number;
    let currentLevel: number;

    if (rows.length === 0) {
      // Create a new row with defaults
      id = uuidv4();
      currentXp = 0;
      currentLevel = 1;
      const now = Date.now() / 1000;
      await pool.query(
        `INSERT INTO agent_rpg_stats
           (id, template_id, xp, level, stars, rarity, elo,
            dispatch_count, battle_count, last_computed, created_at, updated_at)
         VALUES ($1, $2, 0, 1, 1, 'common', 1200, 0, 0, $3, $3, $3)`,
        [id, templateId, now],
      );
    } else {
      id = rows[0].id;
      currentXp = rows[0].xp;
      currentLevel = rows[0].level;
    }

    const newXp = currentXp + xpGain;
    const newLevel = computeLevel(newXp, currentLevel);
    const leveledUp = newLevel > currentLevel;

    // Update xp + level
    await pool.query(
      `UPDATE agent_rpg_stats SET xp = $1, level = $2, updated_at = EXTRACT(EPOCH FROM NOW())
       WHERE template_id = $3`,
      [newXp, newLevel, templateId],
    );

    // Recompute stars + rarity after XP award
    await checkProgression(templateId);

    if (leveledUp) {
      emitSSE('rpg:level_up', {
        template_id: templateId,
        old_level: currentLevel,
        new_level: newLevel,
        xp: newXp,
      }).catch(() => {});
    }
  } catch (err) {
    console.error('[rpg-engine] awardXP error:', err);
  }
}

/**
 * checkProgression — Reads current stats and recomputes stars + rarity.
 * Writes updated values back to agent_rpg_stats.
 * Returns { stars, rarity, leveledUp }.
 * Fire-safe: catches errors and returns defaults.
 */
export async function checkProgression(
  templateId: string,
): Promise<{ stars: number; rarity: string; leveledUp: boolean }> {
  try {
    const { rows } = await pool.query<{
      id: string;
      xp: number;
      level: number;
      elo: number;
      dispatch_count: number;
      battle_count: number;
      reliability: number;
    }>(
      `SELECT id, xp, level, elo, dispatch_count, battle_count, reliability
       FROM agent_rpg_stats WHERE template_id = $1`,
      [templateId],
    );

    if (rows.length === 0) {
      return { stars: 1, rarity: 'common', leveledUp: false };
    }

    const row = rows[0];
    const { dispatch_count: dispatchCount, battle_count: battleCount, reliability, elo } = row;

    // Recompute level from stored xp + stored level (in case of drift)
    const newLevel = computeLevel(row.xp, 1);
    const leveledUp = newLevel > row.level;

    // Stars
    const topPerformer = await isTopPerformerByElo(templateId, elo);
    const stars = computeStars(dispatchCount, battleCount, reliability, topPerformer);

    // Rarity
    const { rows: rpgRows } = await pool.query<{ rpg_enabled: number }>(
      `SELECT rpg_enabled FROM agent_templates WHERE id = $1`,
      [templateId],
    );
    const rpgEnabled = (rpgRows[0]?.rpg_enabled ?? 0) === 1;
    const topWinRate = await isTopWinRateByBattles(templateId);
    const rarity = computeRarity(rpgEnabled, dispatchCount, topWinRate);

    await pool.query(
      `UPDATE agent_rpg_stats
       SET stars = $1, rarity = $2, level = $3, updated_at = EXTRACT(EPOCH FROM NOW())
       WHERE template_id = $4`,
      [stars, rarity, newLevel, templateId],
    );

    return { stars, rarity, leveledUp };
  } catch (err) {
    console.error('[rpg-engine] checkProgression error:', err);
    return { stars: 1, rarity: 'common', leveledUp: false };
  }
}

/**
 * getRpgStats — Simple SELECT from agent_rpg_stats.
 * Returns null if no row exists. Does NOT recalculate.
 */
export async function getRpgStats(templateId: string): Promise<RpgStats | null> {
  try {
    const { rows } = await pool.query<{
      id: string;
      template_id: string;
      quality: number;
      speed: number;
      efficiency: number;
      reliability: number;
      combo: number;
      xp: number;
      level: number;
      stars: number;
      rarity: string;
      elo: number;
      dispatch_count: number;
      battle_count: number;
      specialties: SpecialtyEntry[];
      last_computed: number | null;
    }>(
      `SELECT id, template_id, quality, speed, efficiency, reliability, combo,
              xp, level, stars, rarity, elo,
              dispatch_count, battle_count, specialties, last_computed
       FROM agent_rpg_stats
       WHERE template_id = $1`,
      [templateId],
    );

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row.id,
      templateId: row.template_id,
      quality: row.quality ?? 0,
      speed: row.speed ?? 0,
      efficiency: row.efficiency ?? 0,
      reliability: row.reliability ?? 0,
      combo: row.combo ?? 0,
      xp: row.xp ?? 0,
      level: row.level ?? 1,
      stars: row.stars ?? 1,
      rarity: (row.rarity ?? 'common') as RpgStats['rarity'],
      elo: row.elo ?? 1200,
      dispatchCount: row.dispatch_count ?? 0,
      battleCount: row.battle_count ?? 0,
      specialties: Array.isArray(row.specialties) ? row.specialties : [],
      lastComputed: row.last_computed ?? 0,
    };
  } catch (err) {
    console.error('[rpg-engine] getRpgStats error:', err);
    return null;
  }
}
