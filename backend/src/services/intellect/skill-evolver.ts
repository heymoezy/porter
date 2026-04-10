/**
 * Intellect Skill Evolver
 *
 * Autonomous skill quality management based on dispatch telemetry.
 * Runs periodically to:
 *
 *   1. Update skill quality scores from real usage data
 *      - times_selected, times_completed from persona_skills
 *      - positive/negative feedback counts
 *      - effectiveness_score
 *
 *   2. Promote skills that perform well
 *      - baseline → production at quality_score ≥ 50
 *      - production → high-performing at quality_score ≥ 75
 *
 *   3. Flag underperforming skills
 *      - negative_feedback_count > positive → flag for review
 *      - Never selected in 30 days → mark stale
 *
 *   4. Generate evolution proposals for improvement
 *      - Skills with high usage but low effectiveness get a proposal
 *
 * No LLM calls — pure DB analytics. The evolution is deterministic
 * and based on observed outcomes.
 */

import { pool } from '../../db/client.js';
import { logIntellectEvent } from './file-watcher.js';

export interface SkillEvolutionResult {
  scanned: number;
  promoted: number;
  flagged: number;
  stale: number;
  proposalsCreated: number;
}

const PRODUCTION_THRESHOLD = 50;
const HIGH_PERFORMING_THRESHOLD = 75;
const STALE_DAYS = 30;

/**
 * Recalculate quality scores for all skills using real telemetry.
 *
 * Score components (matches admin skills audit logic):
 *   - completeness (20): based on file presence (already scored by audit)
 *   - specificity (20): word count in SKILL.md
 *   - examples (15): example files
 *   - richness (15): guide files
 *   - uniqueness (10): scaffold phrase avoidance
 *   - usage (10): times_selected from persona_skills
 *   - effectiveness (10): avg effectiveness_score from persona_skills
 *
 * We only update usage + effectiveness here (the file-based scores are
 * set by the admin audit endpoint). This function adds the telemetry
 * component on top of what the audit already computed.
 */
export async function runSkillEvolution(): Promise<SkillEvolutionResult> {
  // ── Step 1: Aggregate telemetry per skill ──────────────────────────
  const { rows: telemetry } = await pool.query<{
    skill_id: string;
    total_selected: string;
    total_completed: string;
    total_positive: string;
    total_negative: string;
    avg_effectiveness: string | null;
    last_used: number | null;
  }>(
    `SELECT
       skill_id,
       COALESCE(SUM(times_selected), 0)::text AS total_selected,
       COALESCE(SUM(times_completed), 0)::text AS total_completed,
       COALESCE(SUM(positive_feedback_count), 0)::text AS total_positive,
       COALESCE(SUM(negative_feedback_count), 0)::text AS total_negative,
       AVG(effectiveness_score)::text AS avg_effectiveness,
       MAX(last_used_at) AS last_used
     FROM persona_skills
     WHERE skill_id IS NOT NULL
     GROUP BY skill_id`
  );

  const telemetryMap = new Map(telemetry.map(t => [t.skill_id, {
    selected: parseInt(t.total_selected, 10),
    completed: parseInt(t.total_completed, 10),
    positive: parseInt(t.total_positive, 10),
    negative: parseInt(t.total_negative, 10),
    avgEffectiveness: t.avg_effectiveness ? parseFloat(t.avg_effectiveness) : 0,
    lastUsed: t.last_used,
  }]));

  // ── Step 2: Update quality scores ──────────────────────────────────
  const { rows: skills } = await pool.query<{
    id: string;
    quality_score: number;
    quality_tier: string;
  }>(
    `SELECT id, COALESCE(quality_score, 0) AS quality_score, COALESCE(quality_tier, 'scaffold') AS quality_tier
     FROM skills
     WHERE enabled = 1`
  );

  let promoted = 0;
  let flagged = 0;
  let stale = 0;
  let proposalsCreated = 0;
  const now = Date.now() / 1000;
  const staleCutoff = now - STALE_DAYS * 86400;

  for (const skill of skills) {
    const tel = telemetryMap.get(skill.id);

    // Usage score (0-10): scales with times_selected, caps at 50
    const usageScore = tel ? Math.min(10, Math.round(tel.selected / 5)) : 0;

    // Effectiveness score (0-10): from feedback
    const effScore = tel?.avgEffectiveness
      ? Math.min(10, Math.round(tel.avgEffectiveness * 2))
      : 0;

    // Base quality (from audit) is quality_score minus the usage/eff components
    // We add usage + effectiveness on top of the base (capped at 20 pts total)
    const baseScore = Math.max(0, skill.quality_score - 20); // strip old usage/eff
    const newScore = Math.min(100, baseScore + usageScore + effScore);

    // Determine new tier
    let newTier = skill.quality_tier;
    if (newScore >= HIGH_PERFORMING_THRESHOLD && skill.quality_tier !== 'high-performing') {
      newTier = 'high-performing';
      promoted++;
    } else if (newScore >= PRODUCTION_THRESHOLD && skill.quality_tier === 'scaffold') {
      newTier = 'production';
      promoted++;
    } else if (newScore >= PRODUCTION_THRESHOLD && skill.quality_tier === 'baseline') {
      newTier = 'production';
      promoted++;
    }

    // Check for staleness: never selected + old
    if (tel && tel.selected === 0 && tel.lastUsed && tel.lastUsed < staleCutoff) {
      newTier = 'stale';
      stale++;
    }

    // Check for underperformance: more negative than positive feedback
    if (tel && tel.negative > tel.positive && tel.negative >= 3) {
      flagged++;
      // Create an evolution proposal
      const proposalId = `evo-${skill.id}-${Date.now()}`;
      await pool.query(
        `INSERT INTO skill_feedback_events (id, persona_id, skill_id, event_type, note, created_at)
         VALUES ($1, 'system', $2, 'evolution_proposal',
                 $3, EXTRACT(EPOCH FROM NOW()))
         ON CONFLICT DO NOTHING`,
        [
          proposalId,
          skill.id,
          `Underperforming: ${tel.negative} negative vs ${tel.positive} positive feedback. ` +
          `Selected ${tel.selected}× completed ${tel.completed}×. ` +
          `Consider reviewing prompt.md and SKILL.md for improvements.`,
        ]
      );
      proposalsCreated++;
    }

    // Update if changed
    if (newScore !== skill.quality_score || newTier !== skill.quality_tier) {
      await pool.query(
        `UPDATE skills SET quality_score = $1, quality_tier = $2, updated_at = EXTRACT(EPOCH FROM NOW())
         WHERE id = $3`,
        [newScore, newTier, skill.id]
      );
    }
  }

  const result: SkillEvolutionResult = {
    scanned: skills.length,
    promoted,
    flagged,
    stale,
    proposalsCreated,
  };

  if (promoted > 0 || flagged > 0 || stale > 0) {
    await logIntellectEvent('skill_evolution', 'skill_evolver', { ...result });
    console.log(
      `[intellect:skill-evolver] scanned ${result.scanned} skills: ${promoted} promoted, ${flagged} flagged, ${stale} stale`
    );
  }

  return result;
}
