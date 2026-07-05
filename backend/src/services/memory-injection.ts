import { pool } from '../db/client.js';
import { selectDirectives, tokenizeTaskText } from './directive-scorer.js';
import type { DirectiveSelectionStats } from './directive-scorer.js';
import { VAULT_RANK_BOOST } from './intellect/vault-indexer.js';

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
 *   Tier 5: Recent episodes   (target 200 tokens)  — what happened in prior sessions
 *   Tier 6: Archival FTS      (remaining)           — relevant concepts from memory
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

    // ── Tier 5: Recent Episodes (Target: 200) ──────────────────────────────────
    // Session summaries from Intellect session-analyzer. Most recent first.
    // Gives the current session context about what was worked on before.
    if (totalRemaining > 50) {
      const episodeQuery = projectId
        ? `SELECT summary, created_at
           FROM episodes
           WHERE (scope = 'project' AND scope_id = $1) OR scope = 'workspace'
           ORDER BY created_at DESC
           LIMIT 5`
        : `SELECT summary, created_at
           FROM episodes
           ORDER BY created_at DESC
           LIMIT 5`;
      const episodeParams = projectId ? [projectId] : [];
      try {
        const res = await pool.query<{ summary: string; created_at: number }>(
          episodeQuery,
          episodeParams
        );
        if (res.rows.length > 0) {
          const header = '## Recent Sessions\n';
          let body = '';
          const tier5Budget = Math.min(200, totalRemaining);
          for (const row of res.rows) {
            const when = new Date(row.created_at * 1000).toISOString().split('T')[0];
            const line = `- **${when}**: ${row.summary}\n`;
            if (estimateTokens(header + body + line) > tier5Budget) break;
            body += line;
          }
          if (body) {
            const section = header + body;
            const tokens = estimateTokens(section);
            sections.push(section);
            totalRemaining -= tokens;
          }
        }
      } catch { /* episodes table may not exist on first run */ }
    }

    // ── Tier 5b: Available Tools (compact — ~50 tokens) ─────────────────────
    // Inject a compact list of detected tools so the agent knows what's available.
    if (totalRemaining > 30) {
      try {
        const { rows: tools } = await pool.query<{ tool_key: string }>(
          `SELECT tool_key FROM environment_tools WHERE detected = 1 AND health = 'ok' ORDER BY tool_key`
        );
        if (tools.length > 0) {
          const toolList = tools.map(t => t.tool_key).join(', ');
          const section = `## Available Tools\n${toolList}\n`;
          const tokens = estimateTokens(section);
          if (tokens <= totalRemaining) {
            sections.push(section);
            totalRemaining -= tokens;
          }
        }
      } catch { /* environment_tools may not exist */ }
    }

    // ── Tier 6: Archival FTS Search (Remaining) ───────────────────────────────
    // U3: vault-sourced concepts (curated truth from ~/vault, indexed by
    // vault-indexer.ts) get a multiplicative ts_rank boost so they win slots
    // against harvested rows of similar relevance — a ranking boost, not a
    // filter: a clearly more relevant non-vault row still outranks (see
    // VAULT_RANK_BOOST). Vault rows also cite their source node.
    if (searchQuery && totalRemaining > 50) {
      const res = await pool.query<{ content: string; confidence_score: number | null; source_type: string; source_url: string | null }>(
        `SELECT content, confidence_score, source_type, source_url
         FROM concepts
         WHERE search_vector @@ websearch_to_tsquery('english', $1)
           AND status = 'active'
         ORDER BY ts_rank(search_vector, websearch_to_tsquery('english', $1))
                  * CASE WHEN source_type = 'vault' THEN ${VAULT_RANK_BOOST} ELSE 1.0 END DESC
         LIMIT 10`,
        [searchQuery]
      );
      if (res.rows.length > 0) {
        const header = '## Related Knowledge\n';
        let body = '';
        for (const row of res.rows) {
          const cite = row.source_type === 'vault' && row.source_url
            ? ` _(vault: ${row.source_url.replace('/home/lobster/vault/', '')})_`
            : '';
          const line = row.content + cite + '\n';
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
