/**
 * directive-scorer.ts — Context-Aware Directive Selection (Phase 38)
 *
 * Scores and selects directives based on task text and active skill tags.
 * Pure functions — no DB access, safe to unit test directly.
 *
 * Reuses the keyword-matching pattern established in skill-selector.ts (Phase 33).
 *
 * Scoring:
 *   - Priority bonus:    (10 - directive.priority / 10) — high-priority directives always score well
 *   - Task word match:   +2 per matched word in directive content
 *   - Skill tag match:   +3 per matched tag — directive tags that appear in active skill tags
 *   - Always-inject:     directives with priority <= 2 bypass scoring entirely
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DirectiveRow {
  id?: string;
  content: string;
  priority: number;
  tags?: string[] | null;
}

export interface ScoredDirective {
  directive: DirectiveRow;
  score: number;
  reason: string;
}

export interface DirectiveSelectionStats {
  total: number;
  alwaysInjected: number;
  scored: number;
  injected: number;
  skipped: number;
  topScored: Array<{ content: string; score: number; reason: string }>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Directives with priority <= this value bypass scoring and are always injected */
const ALWAYS_INJECT_THRESHOLD = 2;

// ── Tokenizer ─────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter(w => w.length >= 3);
}

// ── Pure scoring function ─────────────────────────────────────────────────────

/**
 * Score a single directive against task words and skill tags.
 * Pure function — no I/O, safe to unit test directly.
 *
 * Scoring weights:
 *   - Priority bonus: max(0, 10 - floor(priority / 10)) — ranges from 0-10
 *   - Task word match: +2 per matched word found in directive content
 *   - Skill tag match: +3 per directive tag that matches an active skill tag
 *
 * @param taskWords  - tokenized words from the user's task message
 * @param skillTags  - tags from the agent's currently selected skills
 * @param directive  - the directive row to score
 */
export function scoreDirective(
  taskWords: string[],
  skillTags: string[],
  directive: DirectiveRow,
): { score: number; reason: string } {
  let score = 0;
  const matched: string[] = [];

  // Priority bonus: higher priority (lower number) = higher base score
  // priority 10 → bonus 9, priority 50 → bonus 5, priority 100 → bonus 0
  const priorityBonus = Math.max(0, 10 - Math.floor(directive.priority / 10));
  score += priorityBonus;

  const contentLower = directive.content.toLowerCase();
  const taskWordsSet = new Set(taskWords.map(w => w.toLowerCase()));

  // Task word match: +2 per word found in directive content
  for (const word of taskWordsSet) {
    if (word.length < 3) continue;
    if (contentLower.includes(word)) {
      score += 2;
      matched.push(word);
    }
  }

  // Skill tag match: +3 per directive tag that intersects with skill tags
  const directiveTags = (directive.tags ?? []).map(t => t.toLowerCase());
  const skillTagsLower = skillTags.map(t => t.toLowerCase());

  for (const dtag of directiveTags) {
    for (const stag of skillTagsLower) {
      if (dtag === stag || dtag.includes(stag) || stag.includes(dtag)) {
        score += 3;
        if (!matched.includes(dtag)) matched.push(dtag);
        break; // count each directive tag at most once
      }
    }
  }

  const reason = matched.length > 0
    ? `matched: ${[...new Set(matched)].slice(0, 5).join(', ')}`
    : `priority-only (p${directive.priority})`;

  return { score, reason };
}

// ── Selection function ────────────────────────────────────────────────────────

/**
 * Select a prioritized subset of directives for injection.
 *
 * Algorithm:
 *   1. Partition into always_inject (priority <= ALWAYS_INJECT_THRESHOLD) and scoreable
 *   2. Score scoreable directives against taskWords + skillTags
 *   3. Sort scored directives by score DESC
 *   4. Inject always_inject first, then scored until token budget exhausted
 *
 * Fallback: if no taskWords AND no skillTags — return all directives in priority order
 * (backward compatibility for dispatch paths without task context).
 *
 * @param allDirectives - full list of active directives from DB
 * @param taskWords     - tokenized words from user's task message (empty = no filtering)
 * @param skillTags     - active skill tags (empty = no skill affinity)
 * @param tokenBudget   - approximate token limit for directive content
 */
export function selectDirectives(
  allDirectives: DirectiveRow[],
  taskWords: string[],
  skillTags: string[],
  tokenBudget: number,
): { directives: DirectiveRow[]; stats: DirectiveSelectionStats } {
  const noContext = taskWords.length === 0 && skillTags.length === 0;

  // Fallback: no context — return all in priority order (original behavior)
  if (noContext) {
    return {
      directives: [...allDirectives].sort((a, b) => a.priority - b.priority),
      stats: {
        total: allDirectives.length,
        alwaysInjected: 0,
        scored: 0,
        injected: allDirectives.length,
        skipped: 0,
        topScored: [],
      },
    };
  }

  // Partition into always-inject vs scoreable
  const alwaysInject = allDirectives.filter(d => d.priority <= ALWAYS_INJECT_THRESHOLD);
  const scoreable = allDirectives.filter(d => d.priority > ALWAYS_INJECT_THRESHOLD);

  // Score scoreable directives
  const scored: ScoredDirective[] = scoreable.map(directive => {
    const { score, reason } = scoreDirective(taskWords, skillTags, directive);
    return { directive, score, reason };
  });

  // Sort by score descending, then by priority ascending as tiebreaker
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.directive.priority - b.directive.priority;
  });

  // Collect injected directives (always-inject first, then scored until budget)
  const selected: DirectiveRow[] = [...alwaysInject];
  let usedBudget = alwaysInject.reduce((sum, d) => sum + estimateDirectiveTokens(d.content), 0);

  let injectedScored = 0;
  let skippedScored = 0;

  for (const { directive } of scored) {
    const tokens = estimateDirectiveTokens(directive.content);
    if (usedBudget + tokens > tokenBudget) {
      skippedScored++;
      continue;
    }
    selected.push(directive);
    usedBudget += tokens;
    injectedScored++;
  }

  const topScored = scored.slice(0, 5).map(s => ({
    content: s.directive.content.slice(0, 80),
    score: s.score,
    reason: s.reason,
  }));

  const stats: DirectiveSelectionStats = {
    total: allDirectives.length,
    alwaysInjected: alwaysInject.length,
    scored: scoreable.length,
    injected: selected.length,
    skipped: skippedScored,
    topScored,
  };

  return { directives: selected, stats };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function estimateDirectiveTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Convenience: tokenize a task message string into an array of words.
 * Used by callers to prepare the taskWords argument.
 */
export function tokenizeTaskText(text: string): string[] {
  return tokenize(text);
}
