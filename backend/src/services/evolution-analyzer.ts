import { pool } from '../db/client.js';
import { v4 as uuidv4 } from 'uuid';

// ── Skill Evolution Analyzer — EVO-01 ─────────────────────────────────────────
//
// Analyzes skill_feedback_events (last 30 days) to generate proposals for:
//   1. remove_skill   — 60%+ negative feedback rate
//   2. rewrite_prompt — 40-60% negative feedback rate (mixed signals)
//   3. enrich_examples — 80%+ positive but low usage (<5 selections)
//   4. add_skill      — agents with fewer than 2 skills who are active
//
// Minimum 5 feedback events required before generating any proposal.
// Deduplication prevents multiple pending proposals for same persona+skill+change_type.

// ── Tunable constants ─────────────────────────────────────────────────────────

const MIN_FEEDBACK_EVENTS = 5;           // minimum events before generating proposal
const LOOKBACK_DAYS = 30;               // only analyze recent feedback
const NEGATIVE_REMOVE_THRESHOLD = 0.6;  // 60%+ negative → remove_skill
const NEGATIVE_REWRITE_LOW = 0.4;       // 40-60% negative → rewrite_prompt
const NEGATIVE_REWRITE_HIGH = 0.6;
const POSITIVE_ENRICH_THRESHOLD = 0.8;  // 80%+ positive + low usage → enrich_examples
const LOW_USAGE_THRESHOLD = 5;          // times_selected < 5 = low usage
const MIN_SKILLS_FOR_ADD = 2;           // agents with <2 skills = candidates for add_skill

// ── Type definitions ──────────────────────────────────────────────────────────

interface FeedbackAggRow {
  persona_id: string;
  skill_id: string;
  total_events: string;
  positive_count: string;
  negative_count: string;
  feedback_ids: string[];
  times_selected: number | null;
  effectiveness_score: number | null;
}

interface UnderSkilledAgentRow {
  persona_id: string;
}

interface TopSkillRow {
  skill_id: string;
  total_selections: string;
}

// ── Deduplication guard ───────────────────────────────────────────────────────

/**
 * Returns true if a pending proposal already exists for this persona+skill+change_type.
 * Prevents proposal explosion when analyzer runs repeatedly.
 */
async function isDuplicateProposal(
  personaId: string,
  skillId: string,
  changeType: string
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM skill_evolution_proposals
     WHERE persona_id = $1
       AND skill_id = $2
       AND change_type = $3
       AND status = 'pending'
     LIMIT 1`,
    [personaId, skillId, changeType]
  );
  return rows.length > 0;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * analyzeSkillEvolution — Analyzes feedback data and writes skill evolution proposals to DB.
 * Designed to be called by the scheduler every 6 hours.
 * Pure analytics function — reads feedback data, writes proposals, logs summary.
 */
export async function analyzeSkillEvolution(): Promise<void> {
  let generated = 0;
  let skipped = 0;

  // ── Step 1: Aggregate feedback per persona+skill ──────────────────────────

  const { rows: feedbackRows } = await pool.query<FeedbackAggRow>(`
    SELECT sfe.persona_id, sfe.skill_id,
           COUNT(*) AS total_events,
           COUNT(*) FILTER (WHERE sfe.event_type = 'positive') AS positive_count,
           COUNT(*) FILTER (WHERE sfe.event_type = 'negative') AS negative_count,
           array_agg(sfe.id) AS feedback_ids,
           ps.times_selected, ps.effectiveness_score
    FROM skill_feedback_events sfe
    LEFT JOIN persona_skills ps
      ON ps.persona_id = sfe.persona_id
      AND COALESCE(ps.skill_id, ps.skill_name) = sfe.skill_id
    WHERE sfe.created_at > EXTRACT(EPOCH FROM NOW()) - (86400 * ${LOOKBACK_DAYS})
    GROUP BY sfe.persona_id, sfe.skill_id, ps.times_selected, ps.effectiveness_score
    HAVING COUNT(*) >= ${MIN_FEEDBACK_EVENTS}
  `);

  // ── Step 2: Classify each row and generate proposals ─────────────────────

  for (const row of feedbackRows) {
    const totalEvents = parseInt(row.total_events, 10);
    const positiveCount = parseInt(row.positive_count, 10);
    const negativeCount = parseInt(row.negative_count, 10);
    const negativeRate = negativeCount / totalEvents;
    const positiveRate = positiveCount / totalEvents;
    const timesSelected = row.times_selected ?? 0;
    const effectivenessBefore = row.effectiveness_score ?? null;

    // Truncate feedback_ids to 20 to avoid bloated JSONB
    const triggeringIds = (row.feedback_ids || []).slice(0, 20);

    let changeType: string | null = null;
    let reasoning: string | null = null;
    let proposedChange: Record<string, unknown> | null = null;

    if (negativeRate > NEGATIVE_REMOVE_THRESHOLD) {
      // High negative rate — propose removal
      changeType = 'remove_skill';
      reasoning = `Skill ${row.skill_id} has ${Math.round(negativeRate * 100)}% negative feedback over ${totalEvents} events`;
      proposedChange = {
        skill_id: row.skill_id,
        action: 'remove',
        before: { effectiveness_score: effectivenessBefore, times_selected: timesSelected },
        after: { removed: true },
      };
    } else if (negativeRate >= NEGATIVE_REWRITE_LOW && negativeRate <= NEGATIVE_REWRITE_HIGH) {
      // Mixed results — propose prompt rewrite
      changeType = 'rewrite_prompt';
      reasoning = `Skill ${row.skill_id} shows mixed results (${Math.round(negativeRate * 100)}% negative) — prompt may need revision`;
      proposedChange = {
        skill_id: row.skill_id,
        action: 'rewrite_prompt',
        before: { effectiveness_score: effectivenessBefore, negative_rate: negativeRate },
        after: { target_negative_rate: NEGATIVE_REWRITE_LOW - 0.1 },
      };
    } else if (positiveRate > POSITIVE_ENRICH_THRESHOLD && timesSelected < LOW_USAGE_THRESHOLD) {
      // High positive but underused — propose example enrichment
      changeType = 'enrich_examples';
      reasoning = `Skill ${row.skill_id} performs well (${Math.round(positiveRate * 100)}% positive) but is underused (${timesSelected} selections) — more examples could increase selection`;
      proposedChange = {
        skill_id: row.skill_id,
        action: 'enrich_examples',
        before: { effectiveness_score: effectivenessBefore, times_selected: timesSelected },
        after: { target_times_selected: LOW_USAGE_THRESHOLD },
      };
    }

    if (!changeType || !reasoning || !proposedChange) continue;

    // Dedup check before insert
    const dup = await isDuplicateProposal(row.persona_id, row.skill_id, changeType);
    if (dup) {
      skipped++;
      continue;
    }

    await pool.query(
      `INSERT INTO skill_evolution_proposals
         (id, persona_id, skill_id, change_type, proposed_change, reasoning,
          triggering_feedback_ids, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', EXTRACT(EPOCH FROM NOW()))`,
      [
        uuidv4(),
        row.persona_id,
        row.skill_id,
        changeType,
        JSON.stringify(proposedChange),
        reasoning,
        triggeringIds,
      ]
    );
    generated++;
  }

  // ── Step 3: Check for agents with fewer than 2 skills ────────────────────

  const { rows: underSkilledAgents } = await pool.query<UnderSkilledAgentRow>(`
    SELECT DISTINCT bdl.persona_id
    FROM bridge_dispatch_log bdl
    WHERE bdl.created_at > EXTRACT(EPOCH FROM NOW()) - (86400 * ${LOOKBACK_DAYS})
      AND (SELECT COUNT(*) FROM persona_skills ps2 WHERE ps2.persona_id = bdl.persona_id) < ${MIN_SKILLS_FOR_ADD}
  `);

  if (underSkilledAgents.length > 0) {
    // Find the most commonly selected skills system-wide (to suggest as candidates)
    const { rows: topSkills } = await pool.query<TopSkillRow>(`
      SELECT COALESCE(skill_id, skill_name) AS skill_id,
             SUM(times_selected) AS total_selections
      FROM persona_skills
      WHERE times_selected > 0
      GROUP BY COALESCE(skill_id, skill_name)
      ORDER BY total_selections DESC
      LIMIT 5
    `);

    for (const agent of underSkilledAgents) {
      // Use top skill as candidate, or a generic placeholder
      const candidateSkillId = topSkills[0]?.skill_id ?? 'communication';

      const dup = await isDuplicateProposal(agent.persona_id, candidateSkillId, 'add_skill');
      if (dup) {
        skipped++;
        continue;
      }

      await pool.query(
        `INSERT INTO skill_evolution_proposals
           (id, persona_id, skill_id, change_type, proposed_change, reasoning,
            triggering_feedback_ids, status, created_at)
         VALUES ($1, $2, $3, 'add_skill', $4, $5, '{}', 'pending', EXTRACT(EPOCH FROM NOW()))`,
        [
          uuidv4(),
          agent.persona_id,
          candidateSkillId,
          JSON.stringify({
            skill_id: candidateSkillId,
            action: 'add_skill',
            before: { skill_count: 'lt_2' },
            after: { add_skill: candidateSkillId },
            top_system_skills: topSkills.map(s => s.skill_id),
          }),
          `Agent ${agent.persona_id} has fewer than ${MIN_SKILLS_FOR_ADD} assigned skills and has been active recently — consider adding ${candidateSkillId}`,
        ]
      );
      generated++;
    }
  }

  console.log(`[evolution-analyzer] Generated ${generated} proposals (${skipped} skipped as duplicates)`);

  // ── Backfill effectiveness_after on approved events older than 7 days ──────
  // SC-5: "whether effectiveness improved after the change"
  try {
    const { rowCount } = await pool.query(`
      UPDATE skill_evolution_events e
      SET effectiveness_after = (
        SELECT ps.effectiveness_score
        FROM persona_skills ps
        WHERE ps.persona_id = e.persona_id
          AND COALESCE(ps.skill_id, ps.skill_name) = e.skill_id
        LIMIT 1
      )
      WHERE e.effectiveness_after IS NULL
        AND e.event_type = 'approved'
        AND e.created_at < EXTRACT(EPOCH FROM NOW()) - 604800
    `);
    if (rowCount && rowCount > 0) {
      console.log(`[evolution-analyzer] Backfilled effectiveness_after on ${rowCount} events`);
    }
  } catch (err) {
    console.error('[evolution-analyzer] effectiveness_after backfill error:', err);
  }
}
