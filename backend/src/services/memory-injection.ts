import { pool } from '../db/client.js';
import { selectDirectives, tokenizeTaskText } from './directive-scorer.js';
import type { DirectiveSelectionStats } from './directive-scorer.js';

// ── Token estimation helper ───────────────────────────────────────────────────
// Approximate: 4 chars ≈ 1 token (common rule of thumb for English text)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── buildMemoryContext ────────────────────────────────────────────────────────
/**
 * Build a tiered memory context string for injection into the AI prompt.
 *
 * 5-tier pipeline (priority order):
 *   Tier 1: Agent identity    (target 200 tokens)  — who is this agent
 *   Tier 2: Directives        (target 300 tokens)  — workspace + project rules
 *   Tier 3: Project notes     (target 400 tokens)  — project state/decisions
 *   Tier 4: Agent notes       (target 400 tokens)  — agent learnings/constraints
 *   Tier 5: Archival FTS      (remaining)           — relevant concepts from memory
 *
 * Token budget prevents context overflow. Tiers use a rolling budget: if a higher-priority
 * tier uses less than its target, the remainder flows to lower-priority tiers.
 * If a tier exceeds its target, it is clipped unless there is spare room from previous tiers.
 */
export interface MemoryContextResult {
  text: string;
  directive_selection?: DirectiveSelectionStats;
}

export async function buildMemoryContext(opts: {
  agentId?: string;
  projectId?: string;
  tokenBudget?: number;
  searchQuery?: string;
  taskText?: string;
  skillTags?: string[];
}): Promise<string>;

export async function buildMemoryContext(opts: {
  agentId?: string;
  projectId?: string;
  tokenBudget?: number;
  searchQuery?: string;
  taskText?: string;
  skillTags?: string[];
  returnMeta: true;
}): Promise<MemoryContextResult>;

export async function buildMemoryContext(opts: {
  agentId?: string;
  projectId?: string;
  tokenBudget?: number;
  searchQuery?: string;
  taskText?: string;
  skillTags?: string[];
  returnMeta?: boolean;
}): Promise<string | MemoryContextResult> {
  const { agentId, projectId, searchQuery, taskText, skillTags, returnMeta } = opts;
  let totalRemaining = opts.tokenBudget ?? 2000;

  const sections: string[] = [];
  let capturedDirectiveStats: DirectiveSelectionStats | undefined;

  // Tier target budgets (rolling)
  const targets = {
    tier1: 200,
    tier2: 300,
    tier3: 400,
    tier4: 400,
  };

  try {
    // ── Tier 1: Agent Identity (Target: 200) ──────────────────────────────────
    let tier1Spare = targets.tier1;
    if (agentId) {
      const res = await pool.query<{ name: string; role: string | null; config: Record<string, unknown> | null }>(
        'SELECT name, role, config FROM personas WHERE id = $1',
        [agentId]
      );
      if (res.rows.length > 0) {
        const { name, role, config } = res.rows[0];
        // Override TOTAL token budget if agent has a custom setting
        if (config && typeof config.memory_token_budget === 'number') {
          totalRemaining = config.memory_token_budget;
        }
        const section = `## Agent Identity\nName: ${name}\nRole: ${role ?? 'assistant'}\n`;
        const tokens = estimateTokens(section);
        if (tokens <= totalRemaining) {
          sections.push(section);
          totalRemaining -= tokens;
          tier1Spare = Math.max(0, targets.tier1 - tokens);
        }
      }
    }

    // ── Tier 2: Directives (Target: 300 + spare) ──────────────────────────────
    const tier2Budget = targets.tier2 + tier1Spare;
    let allDirectiveRows: Array<{ content: string; priority: number; tags?: string[] | null }> = [];
    if (projectId) {
      const res = await pool.query<{ content: string; priority: number; tags: string[] | null }>(
        `SELECT content, priority, tags FROM directives
         WHERE status = 'active'
           AND (scope = 'workspace' OR (scope = 'project' AND scope_id = $1))
         ORDER BY priority ASC`,
        [projectId]
      );
      allDirectiveRows = res.rows;
    } else {
      const res = await pool.query<{ content: string; priority: number; tags: string[] | null }>(
        `SELECT content, priority, tags FROM directives
         WHERE status = 'active' AND scope = 'workspace'
         ORDER BY priority ASC`
      );
      allDirectiveRows = res.rows;
    }

    // Phase 38: Context-aware directive selection
    const taskWords = taskText ? tokenizeTaskText(taskText) : [];
    const activeSkillTags = skillTags ?? [];
    const { directives: selectedDirectives, stats: directiveStats } = selectDirectives(
      allDirectiveRows,
      taskWords,
      activeSkillTags,
      Math.min(tier2Budget, totalRemaining),
    );

    let tier2Used = 0;

    if (selectedDirectives.length > 0) {
      const header = '## Directives\n';
      let body = '';
      for (const row of selectedDirectives) {
        const line = row.content + '\n';
        // Check both tier budget AND total remaining
        if (estimateTokens(header + body + line) > tier2Budget) break;
        if (estimateTokens(header + body + line) > totalRemaining) break;
        body += line;
      }
      if (body) {
        const section = header + body;
        const tokens = estimateTokens(section);
        sections.push(section);
        totalRemaining -= tokens;
        tier2Used = tokens;
        capturedDirectiveStats = directiveStats;
      }
    }
    const tier2Spare = Math.max(0, tier2Budget - tier2Used);

    // ── Tier 3: Project Notes (Target: 400 + spare) ───────────────────────────
    const tier3Budget = targets.tier3 + tier2Spare;
    if (projectId) {
      const res = await pool.query<{ content: string; note_type: string; confidence_score: number }>(
        `SELECT content, note_type, confidence_score
         FROM project_notes
         WHERE project_id = $1 AND status = 'active'
         ORDER BY confidence_score DESC`,
        [projectId]
      );
      let tier3Used = 0;
      if (res.rows.length > 0) {
        const header = '## Project State\n';
        let body = '';
        for (const row of res.rows) {
          const line = `[${row.note_type}] ${row.content}\n`;
          if (estimateTokens(header + body + line) > tier3Budget) break;
          if (estimateTokens(header + body + line) > totalRemaining) break;
          body += line;
        }
        if (body) {
          const section = header + body;
          const tokens = estimateTokens(section);
          sections.push(section);
          totalRemaining -= tokens;
          tier3Used = tokens;
        }
      }
      const tier3Spare = Math.max(0, tier3Budget - tier3Used);

      // ── Tier 4: Agent Notes (Target: 400 + spare) ─────────────────────────────
      const tier4Budget = targets.tier4 + tier3Spare;
      if (agentId) {
        const res = await pool.query<{ content: string; note_type: string; confidence_score: number }>(
          `SELECT content, note_type, confidence_score
           FROM agent_notes
           WHERE agent_id = $1 AND status = 'active'
           ORDER BY confidence_score DESC`,
          [agentId]
        );
        let tier4Used = 0;
        if (res.rows.length > 0) {
          const header = '## Agent Knowledge\n';
          let body = '';
          for (const row of res.rows) {
            const line = `[${row.note_type}] ${row.content}\n`;
            if (estimateTokens(header + body + line) > tier4Budget) break;
            if (estimateTokens(header + body + line) > totalRemaining) break;
            body += line;
          }
          if (body) {
            const section = header + body;
            const tokens = estimateTokens(section);
            sections.push(section);
            totalRemaining -= tokens;
            tier4Used = tokens;
          }
        }
        // Tier 5 gets whatever is left from totalRemaining
      }
    }

    // ── Tier 5: Archival FTS Search (Remaining) ───────────────────────────────
    if (searchQuery && totalRemaining > 50) {
      const res = await pool.query<{ content: string; confidence_score: number | null }>(
        `SELECT content, confidence_score
         FROM concepts
         WHERE search_vector @@ websearch_to_tsquery('english', $1)
           AND status = 'active'
         ORDER BY ts_rank(search_vector, websearch_to_tsquery('english', $1)) DESC
         LIMIT 10`,
        [searchQuery]
      );
      if (res.rows.length > 0) {
        const header = '## Related Knowledge\n';
        let body = '';
        for (const row of res.rows) {
          const line = row.content + '\n';
          if (estimateTokens(header + body + line) > totalRemaining) break;
          body += line;
        }
        if (body) {
          sections.push(header + body);
        }
      }
    }

  } catch (e) {
    console.error('[memory-injection] Error building memory context:', e)
    if (returnMeta) return { text: '', directive_selection: undefined };
    return '';
  }

  const text = sections.join('\n\n');

  if (returnMeta) {
    return { text, directive_selection: capturedDirectiveStats };
  }
  return text;
}
