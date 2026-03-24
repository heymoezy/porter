import { pool } from '../db/client.js';

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
 *   Tier 1: Agent identity    (~200 tokens)  — who is this agent
 *   Tier 2: Directives        (~300 tokens)  — workspace + project rules
 *   Tier 3: Project notes     (~400 tokens)  — project state/decisions
 *   Tier 4: Agent notes       (~400 tokens)  — agent learnings/constraints
 *   Tier 5: Archival FTS      (remaining)    — relevant concepts from memory
 *
 * Token budget prevents context overflow — tiers are clipped when budget is
 * consumed. Any DB error returns empty string (never crashes the caller).
 */
export async function buildMemoryContext(opts: {
  agentId?: string;
  projectId?: string;
  tokenBudget?: number;
  searchQuery?: string;
}): Promise<string> {
  const { agentId, projectId, searchQuery } = opts;
  let remainingTokens = opts.tokenBudget ?? 2000;

  const sections: string[] = [];

  try {

    // ── Tier 1: Agent Identity ────────────────────────────────────────────────
    if (agentId) {
      const res = await pool.query<{ name: string; role: string | null; config: Record<string, unknown> | null }>(
        'SELECT name, role, config FROM personas WHERE id = $1',
        [agentId]
      );
      if (res.rows.length > 0) {
        const { name, role, config } = res.rows[0];
        // Override token budget if agent has a custom setting
        if (config && typeof config.memory_token_budget === 'number') {
          remainingTokens = config.memory_token_budget;
        }
        const section = `## Agent Identity\nName: ${name}\nRole: ${role ?? 'assistant'}\n`;
        const tokens = estimateTokens(section);
        if (tokens <= remainingTokens) {
          sections.push(section);
          remainingTokens -= tokens;
        }
      }
    }

    // ── Tier 2: Directives ────────────────────────────────────────────────────
    let directiveRows: Array<{ content: string; priority: number }> = [];
    if (projectId) {
      const res = await pool.query<{ content: string; priority: number }>(
        `SELECT content, priority FROM directives
         WHERE status = 'active'
           AND (scope = 'workspace' OR (scope = 'project' AND scope_id = $1))
         ORDER BY priority ASC`,
        [projectId]
      );
      directiveRows = res.rows;
    } else {
      const res = await pool.query<{ content: string; priority: number }>(
        `SELECT content, priority FROM directives
         WHERE status = 'active' AND scope = 'workspace'
         ORDER BY priority ASC`
      );
      directiveRows = res.rows;
    }

    if (directiveRows.length > 0) {
      const header = '## Directives\n';
      let body = '';
      for (const row of directiveRows) {
        const line = row.content + '\n';
        const lineTokens = estimateTokens(line);
        if (estimateTokens(header + body + line) > remainingTokens) break;
        body += line;
      }
      if (body) {
        const section = header + body;
        const tokens = estimateTokens(section);
        sections.push(section);
        remainingTokens -= tokens;
      }
    }

    // ── Tier 3: Project Notes ─────────────────────────────────────────────────
    if (projectId) {
      const res = await pool.query<{ content: string; note_type: string; confidence_score: number }>(
        `SELECT content, note_type, confidence_score
         FROM project_notes
         WHERE project_id = $1 AND status = 'active'
         ORDER BY confidence_score DESC`,
        [projectId]
      );
      if (res.rows.length > 0) {
        const header = '## Project State\n';
        let body = '';
        for (const row of res.rows) {
          const line = `[${row.note_type}] ${row.content}\n`;
          if (estimateTokens(header + body + line) > remainingTokens) break;
          body += line;
        }
        if (body) {
          const section = header + body;
          const tokens = estimateTokens(section);
          sections.push(section);
          remainingTokens -= tokens;
        }
      }
    }

    // ── Tier 4: Agent Notes ───────────────────────────────────────────────────
    if (agentId) {
      const res = await pool.query<{ content: string; note_type: string; confidence_score: number }>(
        `SELECT content, note_type, confidence_score
         FROM agent_notes
         WHERE agent_id = $1 AND status = 'active'
         ORDER BY confidence_score DESC`,
        [agentId]
      );
      if (res.rows.length > 0) {
        const header = '## Agent Knowledge\n';
        let body = '';
        for (const row of res.rows) {
          const line = `[${row.note_type}] ${row.content}\n`;
          if (estimateTokens(header + body + line) > remainingTokens) break;
          body += line;
        }
        if (body) {
          const section = header + body;
          const tokens = estimateTokens(section);
          sections.push(section);
          remainingTokens -= tokens;
        }
      }
    }

    // ── Tier 5: Archival FTS Search ───────────────────────────────────────────
    if (searchQuery && remainingTokens > 50) {
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
          if (estimateTokens(header + body + line) > remainingTokens) break;
          body += line;
        }
        if (body) {
          sections.push(header + body);
        }
      }
    }

  } catch (e) {
    console.error('[memory-injection] Error building memory context:', e);
    return '';
  }

  return sections.join('\n\n');
}
