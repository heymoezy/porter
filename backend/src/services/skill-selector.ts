/**
 * skill-selector.ts — Runtime Skill Selection Service (Phase 33)
 *
 * Selects relevant skills for a dispatch based on task text keyword matching.
 * Queries persona_skills to find assigned skills, scores each against task text,
 * then reads SKILL.md and prompt.md for the top candidates and builds a prompt block.
 *
 * Only SKILL.md and prompt.md are read for selected skills — not guides/ or examples/.
 * Fire-and-forget safe: any error returns empty result, never throws.
 */

import { pool } from '../db/client.js';
import fs from 'node:fs';
import path from 'node:path';

// ── Configuration ─────────────────────────────────────────────────────────────

const SKILLS_ROOT = path.resolve(process.env.PORTER_SKILLS_DIR || path.join(process.cwd(), 'skills'));

/** Maximum number of skills selected per dispatch */
const MAX_SELECTED = 3;

/** Minimum score for a skill to be included in selected set */
const SCORE_THRESHOLD = 1;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SkillCandidate {
  skillId: string;
  name: string;
  description: string;
  score: number;
  reason: string;
}

export interface SkillSelectionResult {
  candidates: SkillCandidate[];
  selected: SkillCandidate[];
  promptBlock: string;
}

// ── Pure scoring function ─────────────────────────────────────────────────────

/**
 * Score a skill against a set of task words.
 * Pure function — no I/O, safe to unit test directly.
 *
 * Scoring weights:
 *   - Description match: +2 per word
 *   - Tag match: +3 per matched tag
 *   - Trigger match: +3 per matched trigger
 *   - Name part match: +1 per matched name segment
 */
export function scoreSkill(
  taskWords: Set<string>,
  skill: { name: string; description: string; tags: string[]; triggers: string[] }
): { score: number; reason: string } {
  let score = 0;
  const matched: string[] = [];

  const descLower = skill.description.toLowerCase();
  const nameParts = skill.name.toLowerCase().split('-');
  const tagsLower = (skill.tags || []).map(t => t.toLowerCase());
  const triggersLower = (skill.triggers || []).map(t => t.toLowerCase());

  for (const word of taskWords) {
    // Skip very short words (stop words)
    if (word.length < 3) continue;

    // Description match
    if (descLower.includes(word)) {
      score += 2;
      if (!matched.includes(word)) matched.push(word);
    }

    // Tag match (higher weight)
    for (const tag of tagsLower) {
      if (tag.includes(word) || word.includes(tag)) {
        score += 3;
        if (!matched.includes(tag)) matched.push(tag);
        break; // only count once per word across all tags
      }
    }

    // Trigger match (higher weight)
    for (const trigger of triggersLower) {
      if (trigger.includes(word) || word.includes(trigger)) {
        score += 3;
        if (!matched.includes(trigger)) matched.push(trigger);
        break; // only count once per word across all triggers
      }
    }

    // Name part match (lower weight)
    for (const part of nameParts) {
      if (part.length >= 3 && (part.includes(word) || word.includes(part))) {
        score += 1;
        if (!matched.includes(part)) matched.push(part);
        break; // only count once per word across all name parts
      }
    }
  }

  const reason = matched.length > 0
    ? `matched: ${[...new Set(matched)].join(', ')}`
    : 'no match';

  return { score, reason };
}

// ── File helpers ──────────────────────────────────────────────────────────────

function safeReadText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function readTriggers(skillId: string): string[] {
  try {
    const metaPath = path.join(SKILLS_ROOT, skillId, 'meta', 'skill.json');
    const raw = fs.readFileSync(metaPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.triggers) ? parsed.triggers : [];
  } catch {
    return [];
  }
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter(w => w.length >= 3);
  return new Set(words);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Select relevant skills for a dispatch.
 *
 * @param agentId  - The persona/agent ID to look up skills for
 * @param taskText - The task description used to score skill relevance
 * @returns SkillSelectionResult with candidates (all scored), selected (top 3), promptBlock
 */
export async function selectSkills(
  agentId: string | undefined,
  taskText: string
): Promise<SkillSelectionResult> {
  const empty: SkillSelectionResult = { candidates: [], selected: [], promptBlock: '' };

  // Guard: no agentId
  if (!agentId) return empty;

  try {
    // Step 1: Query persona_skills for this agent's assigned skills
    const personaResult = await pool.query<{ effective_id: string; skill_name: string }>(
      `SELECT COALESCE(skill_id, skill_name) AS effective_id, skill_name
         FROM persona_skills
        WHERE persona_id = $1
          AND enabled = 1`,
      [agentId]
    );

    if (!personaResult.rows.length) return empty;

    const effectiveIds = personaResult.rows.map(r => r.effective_id).filter(Boolean);
    if (!effectiveIds.length) return empty;

    // Step 2: Fetch skill metadata from skills table
    const skillsResult = await pool.query<{
      id: string;
      name: string;
      description: string;
      tags: string[] | null;
    }>(
      `SELECT id, name, description, COALESCE(tags, '[]'::jsonb) AS tags
         FROM skills
        WHERE id = ANY($1::text[])`,
      [effectiveIds]
    );

    // Step 3: Tokenize task text
    const taskWords = tokenize(taskText);

    // Step 4: Score each skill
    const candidates: SkillCandidate[] = skillsResult.rows.map(skill => {
      const triggers = readTriggers(skill.id);
      const tagsArr = Array.isArray(skill.tags) ? skill.tags : [];
      const { score, reason } = scoreSkill(taskWords, {
        name: skill.name,
        description: skill.description || '',
        tags: tagsArr,
        triggers,
      });
      return {
        skillId: skill.id,
        name: skill.name,
        description: skill.description || '',
        score,
        reason,
      };
    });

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Step 5: Select top MAX_SELECTED with score > SCORE_THRESHOLD
    const selected = candidates
      .filter(c => c.score >= SCORE_THRESHOLD)
      .slice(0, MAX_SELECTED);

    if (!selected.length) {
      return { candidates, selected: [], promptBlock: '' };
    }

    // Step 6 & 7: Read pack files and build prompt block
    const sections: string[] = [
      '## Active Skills\n\nThe following skills have been selected as relevant to this task:\n',
    ];

    for (const skill of selected) {
      const skillMd = safeReadText(path.join(SKILLS_ROOT, skill.skillId, 'SKILL.md'));
      const promptMd = safeReadText(path.join(SKILLS_ROOT, skill.skillId, 'prompt.md'));

      sections.push(`### ${skill.name}`);
      if (skillMd) sections.push(skillMd);
      if (promptMd) {
        sections.push('**Prompting guidance:**');
        sections.push(promptMd);
      }
      sections.push('---');
    }

    const promptBlock = sections.join('\n\n');

    return { candidates, selected, promptBlock };
  } catch {
    // Fire-and-forget safe — never throw from skill selection
    return empty;
  }
}
