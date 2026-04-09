/**
 * Intellect Correction Detector
 *
 * Analyzes user messages for correction signals and turns them into directive
 * candidates. When the same rule is reinforced repeatedly, the memory-promoter
 * escalates it to a high-confidence directive.
 *
 * Design philosophy (MIPT):
 *   Porter doesn't evolve fixed-role agents. It evolves rules (directives) and
 *   protocols (coordination patterns). Corrections are the raw signal that
 *   keeps Porter's operating rules aligned with what Moe actually wants.
 *
 * Pattern matching is intentionally conservative — we'd rather miss a correction
 * than spam directives from neutral messages. A candidate only becomes a real
 * directive after the memory-promoter sees the same rule 3+ times.
 */

import { randomUUID } from 'node:crypto';
import { pool } from '../../db/client.js';
import { logIntellectEvent } from './file-watcher.js';

// ── Correction signal patterns ─────────────────────────────────────────

/**
 * Strong correction markers — presence strongly suggests the user is correcting
 * past or expected behavior. Regexes are anchored on word boundaries and
 * case-insensitive.
 */
const STRONG_CORRECTION_PATTERNS: RegExp[] = [
  /\b(never|don'?t|do not|stop|avoid|refuse to)\b/i,
  /\b(always|must|have to|need to)\b/i,
  /\b(wrong|incorrect|that'?s not|not that|not right)\b/i,
  /\b(instead of|rather than)\b/i,
  /\b(remember (to|that)|from now on)\b/i,
];

/**
 * Noise patterns — presence strongly suggests this is NOT a correction, even
 * if a strong pattern matched. Questions, requests for clarification, general
 * statements.
 */
const NOISE_PATTERNS: RegExp[] = [
  /^(what|why|how|when|where|who|which|can you|could you|would you|will you)\b/i,
  /\?\s*$/,
];

/**
 * Minimum message length — very short messages are usually one-off commands,
 * not rules worth remembering.
 */
const MIN_CORRECTION_LENGTH = 12;

/** Max length we'll store as a directive — anything longer is probably a rant. */
const MAX_CORRECTION_LENGTH = 600;

// ── Types ───────────────────────────────────────────────────────────────

export interface CorrectionInput {
  sessionId: string;
  project?: string | null;
  userMessage: string;
  gateway?: string | null;
  createdAt?: number;
}

export interface CorrectionResult {
  detected: boolean;
  reason?: string;
  directiveCandidateId?: string;
  existingCandidateId?: string;
  normalizedRule?: string;
}

// ── Detection ───────────────────────────────────────────────────────────

/**
 * Return true if the message looks like a correction.
 * Cheap check — no DB, no LLM. Deterministic.
 */
export function isCorrection(message: string): { match: boolean; reason?: string } {
  const trimmed = (message ?? '').trim();
  if (trimmed.length < MIN_CORRECTION_LENGTH) {
    return { match: false, reason: 'too_short' };
  }
  if (trimmed.length > MAX_CORRECTION_LENGTH * 2) {
    // Don't bother analyzing walls of text
    return { match: false, reason: 'too_long' };
  }
  for (const noise of NOISE_PATTERNS) {
    if (noise.test(trimmed)) {
      return { match: false, reason: 'question_or_noise' };
    }
  }
  for (const pattern of STRONG_CORRECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { match: true, reason: pattern.source };
    }
  }
  return { match: false, reason: 'no_signal' };
}

/**
 * Normalize a correction message into a rule-shaped string that's easier to
 * dedupe against. Lowercases, collapses whitespace, strips common filler.
 */
export function normalizeRule(message: string): string {
  return message
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!]+$/, '')
    .slice(0, MAX_CORRECTION_LENGTH);
}

/**
 * Very simple semantic overlap check: count shared significant words (length >= 4)
 * and return the fraction of the shorter string's significant words that overlap.
 * Cheap, deterministic, works well enough for "same correction phrased twice".
 */
function similarity(a: string, b: string): number {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 4)
    );
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

// ── Directive candidate lifecycle ──────────────────────────────────────

const CANDIDATE_CONFIDENCE_INITIAL = 60;
const DEDUPE_SIMILARITY_THRESHOLD = 0.7;

/**
 * Process a user message. If it looks like a correction:
 *   1. Check existing directive candidates for semantic overlap.
 *   2. If found, bump the existing candidate's priority (reinforcement signal).
 *   3. If not found, insert a new candidate directive (status='candidate').
 *
 * The memory-promoter service is what actually promotes candidates to active
 * directives after enough reinforcement.
 */
export async function processCorrection(input: CorrectionInput): Promise<CorrectionResult> {
  const { match, reason } = isCorrection(input.userMessage);
  if (!match) return { detected: false, reason };

  const normalized = normalizeRule(input.userMessage);
  const scope = input.project ? 'project' : 'workspace';
  const scopeId = input.project ?? null;

  // Look for an existing candidate or active directive in the same scope.
  const { rows: existing } = await pool.query<{
    id: string;
    content: string;
    priority: number;
    status: string;
  }>(
    `SELECT id, content, priority, status
     FROM directives
     WHERE scope = $1
       AND (scope_id IS NOT DISTINCT FROM $2)
       AND status IN ('active', 'candidate')
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 50`,
    [scope, scopeId]
  );

  for (const row of existing) {
    const sim = similarity(normalized, row.content);
    if (sim >= DEDUPE_SIMILARITY_THRESHOLD) {
      // Reinforcement: bump priority and refresh updated_at. The promoter will
      // escalate candidate→active once the reinforcement count is high enough.
      await pool.query(
        `UPDATE directives
         SET priority = LEAST(priority + 10, 100),
             updated_at = EXTRACT(EPOCH FROM NOW()),
             source_session_id = $2
         WHERE id = $1`,
        [row.id, input.sessionId]
      );
      await logIntellectEvent('correction_reinforced', 'correction_detector', {
        directiveId: row.id,
        similarity: Number(sim.toFixed(3)),
        sessionId: input.sessionId,
        project: input.project ?? null,
        oldStatus: row.status,
      });
      return {
        detected: true,
        existingCandidateId: row.id,
        normalizedRule: normalized,
        reason: 'reinforced',
      };
    }
  }

  // No overlap — create a new directive candidate.
  const id = randomUUID();
  await pool.query(
    `INSERT INTO directives
      (id, scope, scope_id, content, priority, source_type, status,
       created_by, source_session_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'correction', 'candidate',
             'intellect:correction-detector', $6,
             EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))`,
    [id, scope, scopeId, normalized, CANDIDATE_CONFIDENCE_INITIAL, input.sessionId]
  );

  await logIntellectEvent('correction_detected', 'correction_detector', {
    directiveId: id,
    scope,
    scopeId,
    sessionId: input.sessionId,
    project: input.project ?? null,
    rule: normalized,
    matchedPattern: reason,
  });

  return {
    detected: true,
    directiveCandidateId: id,
    normalizedRule: normalized,
    reason: 'new_candidate',
  };
}
