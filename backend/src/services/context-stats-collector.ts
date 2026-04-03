/**
 * context-stats-collector.ts — Unified context pressure stats assembly (Phase 38 Plan 03)
 *
 * Pure assembly function — no DB access, no side effects.
 * Takes data already available at dispatch time and formats it into the context_stats JSONB blob.
 *
 * Called from routing-engine.ts logDispatch() after each successful dispatch.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Memory tier injection summary */
export interface MemoryStats {
  tiers_used: string[];
  total_memory_tokens: number;
  budget_tokens: number;
}

/** Directive selection summary */
export interface DirectiveStats {
  total_active: number;
  injected: number;
  skipped: number;
  scoring_mode: 'task_aware' | 'all';
}

/** Skill selection summary */
export interface SkillStats {
  candidates: number;
  selected: number;
  prompt_tokens: number;
}

/** Compression summary for this dispatch */
export interface CompressionStats {
  tool_outputs_compressed: number;
  conversation_turns_compressed: number;
  tokens_saved: number;
}

/** Session context pressure snapshot */
export interface SessionStats {
  turn_number: number;
  context_pct: number;
  compression_events: number;
  tokens_reclaimed: number;
}

/** Full context pressure blob written to bridge_dispatch_log.context_stats */
export interface ContextStats {
  memory: MemoryStats;
  directives: DirectiveStats;
  skills: SkillStats;
  compression: CompressionStats;
  session: SessionStats;
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface BuildContextStatsOptions {
  memoryStats?: Partial<MemoryStats>;
  directiveStats?: Partial<DirectiveStats>;
  skillsUsed?: {
    candidates: Array<{ skillId: string; name: string; score: number; reason: string }>;
    selected: Array<{ skillId: string; name: string; score: number; reason: string }>;
    threshold: number;
    totalCandidates: number;
  } | null;
  skillPromptTokens?: number;
  compressionStats?: Partial<CompressionStats>;
  sessionResult?: {
    tokensUsed: number;
    contextPct: number;
  } | null;
  sessionCompressionEvents?: number;
  sessionTokensReclaimed?: number;
  turnNumber?: number;
}

// ── Pure assembly function ─────────────────────────────────────────────────────

/**
 * Assemble a ContextStats blob from available dispatch data.
 * All fields have safe defaults — missing data produces zeros, not nulls.
 * Never throws — if called with partial data, zeroes fill in the gaps.
 */
export function buildContextStats(opts: BuildContextStatsOptions): ContextStats {
  // Memory stats
  const memory: MemoryStats = {
    tiers_used: opts.memoryStats?.tiers_used ?? [],
    total_memory_tokens: opts.memoryStats?.total_memory_tokens ?? 0,
    budget_tokens: opts.memoryStats?.budget_tokens ?? 0,
  };

  // Directive stats
  const directives: DirectiveStats = {
    total_active: opts.directiveStats?.total_active ?? 0,
    injected: opts.directiveStats?.injected ?? 0,
    skipped: opts.directiveStats?.skipped ?? 0,
    scoring_mode: opts.directiveStats?.scoring_mode ?? 'all',
  };

  // Skill stats — derived from skillsUsed if present
  const skillCandidates = opts.skillsUsed?.candidates?.length ?? 0;
  const skillSelected = opts.skillsUsed?.selected?.length ?? 0;
  const skills: SkillStats = {
    candidates: skillCandidates,
    selected: skillSelected,
    prompt_tokens: opts.skillPromptTokens ?? 0,
  };

  // Compression stats
  const compression: CompressionStats = {
    tool_outputs_compressed: opts.compressionStats?.tool_outputs_compressed ?? 0,
    conversation_turns_compressed: opts.compressionStats?.conversation_turns_compressed ?? 0,
    tokens_saved: opts.compressionStats?.tokens_saved ?? 0,
  };

  // Session stats
  const contextPct = opts.sessionResult?.contextPct ?? 0;
  const session: SessionStats = {
    turn_number: opts.turnNumber ?? 0,
    context_pct: Math.min(1, Math.max(0, contextPct)),
    compression_events: opts.sessionCompressionEvents ?? 0,
    tokens_reclaimed: opts.sessionTokensReclaimed ?? 0,
  };

  return { memory, directives, skills, compression, session };
}
