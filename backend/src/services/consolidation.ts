import { pool } from '../db/client.js';
import crypto from 'crypto';

export interface ConsolidationResult {
  before: number;
  after: number;
  merged: number;
  pairs: Array<{ kept: string; superseded: string; similarity: number }>;
}

/**
 * Consolidate near-duplicate agent_notes and concepts for a given agent.
 * Uses pg_trgm similarity > 0.6 to find pairs, keeps the higher-confidence
 * note and marks the loser as superseded.
 */
export async function consolidateAgentMemory(agentId: string): Promise<ConsolidationResult> {
  const client = await pool.connect();

  try {
    // Count active agent_notes before consolidation
    const beforeRes = await client.query(
      `SELECT COUNT(*) AS cnt FROM agent_notes WHERE agent_id = $1 AND status = 'active'`,
      [agentId]
    );
    const before = parseInt(beforeRes.rows[0].cnt, 10);

    const pairs: Array<{ kept: string; superseded: string; similarity: number }> = [];
    const supersededIds = new Set<string>();

    await client.query('BEGIN');

    // Find similar pairs in agent_notes using pg_trgm
    const agentPairsRes = await client.query(
      `SELECT a.id AS a_id, a.confidence_score AS a_score,
              b.id AS b_id, b.confidence_score AS b_score,
              similarity(a.content, b.content) AS sim
       FROM agent_notes a
       JOIN agent_notes b ON a.id < b.id
       WHERE a.agent_id = $1
         AND b.agent_id = $1
         AND a.status = 'active'
         AND b.status = 'active'
         AND similarity(a.content, b.content) > 0.6
       ORDER BY sim DESC`,
      [agentId]
    );

    for (const row of agentPairsRes.rows) {
      // Skip if either has already been superseded in this run
      if (supersededIds.has(row.a_id) || supersededIds.has(row.b_id)) {
        continue;
      }

      // Determine winner: higher confidence score wins; if equal, alphabetically smaller id wins
      let winner: string;
      let loser: string;
      if (row.a_score > row.b_score || (row.a_score === row.b_score && row.a_id < row.b_id)) {
        winner = row.a_id;
        loser = row.b_id;
      } else {
        winner = row.b_id;
        loser = row.a_id;
      }

      // Update loser — skip if concurrent edit already changed it
      const updateRes = await client.query(
        `UPDATE agent_notes
         SET status = 'superseded', superseded_by_id = $1, updated_at = EXTRACT(EPOCH FROM NOW())
         WHERE id = $2 AND status = 'active'
         RETURNING id`,
        [winner, loser]
      );

      if (updateRes.rowCount && updateRes.rowCount > 0) {
        supersededIds.add(loser);
        pairs.push({ kept: winner, superseded: loser, similarity: parseFloat(row.sim) });
      }
    }

    // Also consolidate concepts for this agent (scope='agent', scope_id = agent_id)
    const conceptPairsRes = await client.query(
      `SELECT a.id AS a_id, a.confidence_score AS a_score,
              b.id AS b_id, b.confidence_score AS b_score,
              similarity(a.content, b.content) AS sim
       FROM concepts a
       JOIN concepts b ON a.id < b.id
       WHERE a.scope = 'agent' AND a.scope_id = $1
         AND b.scope = 'agent' AND b.scope_id = $1
         AND a.status = 'active' AND b.status = 'active'
         AND similarity(a.content, b.content) > 0.6
       ORDER BY sim DESC`,
      [agentId]
    );

    for (const row of conceptPairsRes.rows) {
      if (supersededIds.has(row.a_id) || supersededIds.has(row.b_id)) {
        continue;
      }

      let winner: string;
      let loser: string;
      if (
        (row.a_score ?? 50) > (row.b_score ?? 50) ||
        ((row.a_score ?? 50) === (row.b_score ?? 50) && row.a_id < row.b_id)
      ) {
        winner = row.a_id;
        loser = row.b_id;
      } else {
        winner = row.b_id;
        loser = row.a_id;
      }

      const updateRes = await client.query(
        `UPDATE concepts
         SET status = 'superseded', superseded_by_id = $1, updated_at = EXTRACT(EPOCH FROM NOW())
         WHERE id = $2 AND status = 'active'
         RETURNING id`,
        [winner, loser]
      );

      if (updateRes.rowCount && updateRes.rowCount > 0) {
        supersededIds.add(loser);
        pairs.push({ kept: winner, superseded: loser, similarity: parseFloat(row.sim) });
      }
    }

    await client.query('COMMIT');

    // Count active agent_notes after consolidation
    const afterRes = await client.query(
      `SELECT COUNT(*) AS cnt FROM agent_notes WHERE agent_id = $1 AND status = 'active'`,
      [agentId]
    );
    const after = parseInt(afterRes.rows[0].cnt, 10);

    return {
      before,
      after,
      merged: before - after,
      pairs,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// re-export crypto for use in routes
export { crypto };
