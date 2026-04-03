// SIN-02: Cross-session FTS search service (Phase 41 — Session Intelligence)
// Queries agent_messages.search_vector using PostgreSQL websearch_to_tsquery for ranked results.

import { pool } from '../db/client.js';

export interface SessionSearchResult {
  messageId: number;
  runId: string;
  fromAgent: string;
  toAgent: string;
  messageExcerpt: string;      // ts_headline highlighted excerpt from message
  responseExcerpt: string;     // ts_headline highlighted excerpt from response (empty string if null)
  rank: number;                // ts_rank relevance score
  createdAt: number;
  // Session context joined from session_registry (null if no matching session)
  sessionId: string | null;
  agentId: string | null;
  gatewayType: string | null;
  modelName: string | null;
}

export interface SearchSessionsOpts {
  query: string;
  agentId?: string;
  limit?: number;
  offset?: number;
}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/**
 * Search across all past sessions using PostgreSQL full-text search.
 * Results are ranked by ts_rank relevance score (descending).
 * Excerpts are generated via ts_headline with highlighted match markers (<< >>).
 */
export async function searchSessions(opts: SearchSessionsOpts): Promise<SessionSearchResult[]> {
  const { query, agentId, limit = DEFAULT_LIMIT, offset = 0 } = opts;

  if (!query || query.trim().length === 0) {
    throw new Error('Search query must be non-empty');
  }

  const clampedLimit = Math.min(limit, MAX_LIMIT);

  // Build parameterised query — agent filter is optional
  const params: (string | number)[] = [query.trim(), clampedLimit, offset];
  const agentFilter = agentId
    ? `AND (am.to_agent = $4 OR am.from_agent = $4)`
    : '';
  if (agentId) params.push(agentId);

  const sql = `
    SELECT
      am.id                                                            AS message_id,
      am.run_id,
      am.from_agent,
      am.to_agent,
      ts_headline(
        'english', am.message,
        websearch_to_tsquery('english', $1),
        'MaxWords=30, MinWords=10, StartSel=<<, StopSel=>>'
      )                                                                AS message_excerpt,
      ts_headline(
        'english', COALESCE(am.response, ''),
        websearch_to_tsquery('english', $1),
        'MaxWords=30, MinWords=10, StartSel=<<, StopSel=>>'
      )                                                                AS response_excerpt,
      ts_rank(am.search_vector, websearch_to_tsquery('english', $1))  AS rank,
      am.created_at,
      sr.id                                                            AS session_id,
      sr.agent_id,
      sr.gateway_type,
      sr.model_name
    FROM agent_messages am
    LEFT JOIN session_registry sr
           ON sr.chat_id = am.run_id
          AND sr.status IN ('active', 'rotated')
    WHERE am.search_vector @@ websearch_to_tsquery('english', $1)
      ${agentFilter}
    ORDER BY rank DESC
    LIMIT $2 OFFSET $3
  `;

  const res = await pool.query<{
    message_id: number;
    run_id: string;
    from_agent: string;
    to_agent: string;
    message_excerpt: string;
    response_excerpt: string;
    rank: number;
    created_at: number;
    session_id: string | null;
    agent_id: string | null;
    gateway_type: string | null;
    model_name: string | null;
  }>(sql, params);

  return res.rows.map((row) => ({
    messageId: row.message_id,
    runId: row.run_id,
    fromAgent: row.from_agent,
    toAgent: row.to_agent,
    messageExcerpt: row.message_excerpt ?? '',
    responseExcerpt: row.response_excerpt ?? '',
    rank: row.rank,
    createdAt: row.created_at,
    sessionId: row.session_id,
    agentId: row.agent_id,
    gatewayType: row.gateway_type,
    modelName: row.model_name,
  }));
}

/**
 * Count total matching messages for pagination purposes.
 * Mirrors the WHERE clause of searchSessions but returns only the count.
 */
export async function countSessionSearchResults(
  query: string,
  agentId?: string
): Promise<number> {
  if (!query || query.trim().length === 0) {
    return 0;
  }

  const params: string[] = [query.trim()];
  const agentFilter = agentId
    ? `AND (am.to_agent = $2 OR am.from_agent = $2)`
    : '';
  if (agentId) params.push(agentId);

  const sql = `
    SELECT COUNT(*)::int AS total
    FROM agent_messages am
    WHERE am.search_vector @@ websearch_to_tsquery('english', $1)
      ${agentFilter}
  `;

  const res = await pool.query<{ total: number }>(sql, params);
  return res.rows[0]?.total ?? 0;
}
