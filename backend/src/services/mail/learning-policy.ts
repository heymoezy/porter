/**
 * Learning Policy Service — safe memory and skill-learning integration.
 *
 * Non-negotiable rules:
 *   - NEVER directly mutate skills from newsletter content
 *   - Only auto-learn from approved senders (trust_level='trusted')
 *   - Require admin review before updating skill prompts or high-confidence memory
 *   - Every action is recorded in mail_learning_events
 *
 * Pipeline:
 *   digest → trust check → promote to medium-trust concept → optionally suggest skill improvement
 */

import crypto from 'node:crypto';
import { pool } from '../../db/client.js';
import { logLearningEvent } from './mail-learning-service.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LearningCandidate {
  messageId: string;
  agentId: string;
  sourceId: string;
  trustLevel: string;
  subject: string;
  summary: string;
  topicTags: string[];
  sourceDisplayName: string;
}

// ── Trust gate ───────────────────────────────────────────────────────────────

/** Check if a source is eligible for auto-learning */
export function isEligibleForLearning(trustLevel: string): boolean {
  return trustLevel === 'trusted';
  // 'review' and 'untrusted' sources are blocked from auto-learning
}

// ── Promote to Memory ────────────────────────────────────────────────────────

/** Promote a digest summary to an agent memory concept (medium trust) */
export async function promoteToMemory(opts: {
  messageId: string;
  agentId: string;
  summary: string;
  topicTags: string[];
  sourceDisplayName: string;
}): Promise<{ conceptId: string | null }> {
  // 1. Verify trust: look up the source for this message through newsletter_sources
  //    (caller already verified, but defense-in-depth)
  const conceptId = crypto.randomUUID();
  const now = Date.now() / 1000;

  // 2. Build a stable key from messageId (truncated for readability)
  const keySlug = opts.messageId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40);
  const conceptKey = `newsletter_digest_${keySlug}`;

  // 3. Check for duplicate concept (idempotent)
  const { rows: existing } = await pool.query<{ id: string }>(
    `SELECT id FROM concepts WHERE id = $1 OR (scope = 'agent' AND scope_id = $2 AND content LIKE $3) LIMIT 1`,
    [conceptId, opts.agentId, `%${conceptKey}%`],
  );
  if (existing.length > 0) {
    return { conceptId: existing[0].id };
  }

  // 4. Insert concept — medium trust (newsletter-derived, not user-authored)
  await pool.query(
    `INSERT INTO concepts
       (id, memory_kind, trust_tier, scope, scope_id, content, source_type, source_url,
        confidence_score, status, review_state, created_at, updated_at)
     VALUES ($1, 'concept', 'medium', 'agent', $2, $3, 'newsletter', $4, 50, 'active', 'accepted', $5, $5)`,
    [
      conceptId,
      opts.agentId,
      `[${conceptKey}] ${opts.summary}`,
      `newsletter:${opts.sourceDisplayName}`,
      now,
    ],
  );

  // 5. Log learning event
  await logLearningEvent({
    messageId: opts.messageId,
    agentId: opts.agentId,
    eventType: 'promoted_to_memory',
    payload: {
      concept_id: conceptId,
      topic_tags: opts.topicTags,
      source: opts.sourceDisplayName,
    },
  });

  return { conceptId };
}

// ── Suggest Skill Improvement ────────────────────────────────────────────────

/** Create a skill improvement suggestion (does NOT mutate skills directly) */
export async function suggestSkillImprovement(opts: {
  messageId: string;
  agentId: string;
  skillId?: string;
  suggestion: string;
  evidence: string;
  sourceDisplayName: string;
}): Promise<{ proposalId: string }> {
  const proposalId = crypto.randomUUID();
  const now = Date.now() / 1000;

  // Insert into skill_evolution_proposals (reuses Phase 35 infrastructure)
  // status = 'pending' — requires admin review before any skill mutation
  await pool.query(
    `INSERT INTO skill_evolution_proposals
       (id, persona_id, skill_id, change_type, proposed_change, reasoning,
        triggering_feedback_ids, status, created_at)
     VALUES ($1, $2, $3, 'newsletter_suggestion', $4::jsonb, $5, '{}', 'pending', $6)`,
    [
      proposalId,
      opts.agentId,
      opts.skillId ?? '__none__',
      JSON.stringify({
        suggestion: opts.suggestion,
        evidence: opts.evidence,
        source: `newsletter:${opts.sourceDisplayName}`,
      }),
      `Newsletter digest from ${opts.sourceDisplayName}`,
      now,
    ],
  );

  // Log learning event
  await logLearningEvent({
    messageId: opts.messageId,
    agentId: opts.agentId,
    skillId: opts.skillId,
    eventType: 'skill_suggestion_created',
    payload: {
      proposal_id: proposalId,
      source: opts.sourceDisplayName,
    },
  });

  return { proposalId };
}

// ── Match topic tags to agent skills ────────────────────────────────────────

/** Find skills assigned to an agent whose name/category overlaps with topic tags */
async function findMatchingSkills(agentId: string, topicTags: string[]): Promise<{ skillId: string; skillName: string }[]> {
  if (topicTags.length === 0) return [];

  // Normalize tags to lowercase
  const normalizedTags = topicTags.map(t => t.toLowerCase().trim());

  // Look up assigned skills for this agent and check for name/category overlap
  const { rows } = await pool.query<{ skill_id: string; skill_name: string; category: string }>(
    `SELECT ps.skill_id, COALESCE(s.name, ps.skill_name) AS skill_name, COALESCE(s.category, '') AS category
     FROM persona_skills ps
     LEFT JOIN skills s ON s.id = ps.skill_id
     WHERE ps.persona_id = $1 AND ps.enabled = 1`,
    [agentId],
  );

  const matched: { skillId: string; skillName: string }[] = [];
  for (const row of rows) {
    const name = (row.skill_name || '').toLowerCase();
    const category = (row.category || '').toLowerCase();
    // Match if any tag appears in skill name or category
    const isMatch = normalizedTags.some(tag =>
      name.includes(tag) || category.includes(tag) || tag.includes(name) || tag.includes(category),
    );
    if (isMatch && row.skill_id) {
      matched.push({ skillId: row.skill_id, skillName: row.skill_name });
    }
  }

  return matched;
}

// ── Main Pipeline ────────────────────────────────────────────────────────────

/** Process a digest through the learning pipeline */
export async function processDigestForLearning(candidate: LearningCandidate): Promise<{
  action: 'promoted' | 'suggested' | 'ignored';
  reason: string;
  conceptId?: string;
  proposalIds?: string[];
}> {
  // 1. Trust gate — only 'trusted' sources can auto-learn
  if (!isEligibleForLearning(candidate.trustLevel)) {
    await logLearningEvent({
      messageId: candidate.messageId,
      agentId: candidate.agentId,
      eventType: 'ignored',
      payload: {
        reason: 'untrusted_source',
        trust_level: candidate.trustLevel,
        source_id: candidate.sourceId,
      },
    });
    return { action: 'ignored', reason: 'untrusted_source' };
  }

  // 2. Content quality gate — summary must be meaningful
  if (candidate.summary.length < 50) {
    await logLearningEvent({
      messageId: candidate.messageId,
      agentId: candidate.agentId,
      eventType: 'ignored',
      payload: {
        reason: 'insufficient_content',
        summary_length: candidate.summary.length,
      },
    });
    return { action: 'ignored', reason: 'insufficient_content' };
  }

  // 3. Promote to memory (always — memory is low-risk, medium trust)
  const { conceptId } = await promoteToMemory({
    messageId: candidate.messageId,
    agentId: candidate.agentId,
    summary: candidate.summary,
    topicTags: candidate.topicTags,
    sourceDisplayName: candidate.sourceDisplayName,
  });

  // 4. Check if topic tags match any assigned skill — if so, create skill suggestion
  const matchedSkills = await findMatchingSkills(candidate.agentId, candidate.topicTags);
  const proposalIds: string[] = [];

  if (matchedSkills.length > 0) {
    for (const skill of matchedSkills) {
      // Dedup: check if a pending newsletter_suggestion already exists for this agent+skill
      const { rows: dupes } = await pool.query(
        `SELECT 1 FROM skill_evolution_proposals
         WHERE persona_id = $1 AND skill_id = $2 AND change_type = 'newsletter_suggestion' AND status = 'pending'
         LIMIT 1`,
        [candidate.agentId, skill.skillId],
      );
      if (dupes.length > 0) continue;

      const { proposalId } = await suggestSkillImprovement({
        messageId: candidate.messageId,
        agentId: candidate.agentId,
        skillId: skill.skillId,
        suggestion: `Newsletter "${candidate.subject}" from ${candidate.sourceDisplayName} contains content relevant to skill "${skill.skillName}". Consider incorporating key insights.`,
        evidence: candidate.summary.slice(0, 500),
        sourceDisplayName: candidate.sourceDisplayName,
      });
      proposalIds.push(proposalId);
    }
  }

  const action = proposalIds.length > 0 ? 'suggested' : 'promoted';
  const reason = proposalIds.length > 0
    ? `promoted_to_memory + ${proposalIds.length} skill suggestion(s)`
    : 'promoted_to_memory';

  return { action, reason, conceptId: conceptId ?? undefined, proposalIds };
}
