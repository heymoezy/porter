import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { pool } from '../../db/client.js';
import { ok } from '../../lib/envelope.js';

interface ConceptRow {
  id: string;
  memory_kind: string;
  trust_tier: string;
  scope: string;
  scope_id: string | null;
  content: string;
  source_type: string | null;
  source_url: string | null;
  confidence_score: number | null;
  status: string;
  review_state: string | null;
  superseded_by_id: string | null;
  last_used_at: number | null;
  use_count: number;
  session_id: string | null;
  created_at: string;
  updated_at: string;
}

export default async function memoryV1Routes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  // GET /api/v1/memory/concepts — query Memory V2 concepts with optional FTS5 search
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const {
      scope,
      scope_id,
      status = 'active',
      q,
      limit: limitStr,
      offset: offsetStr,
    } = request.query as {
      scope?: string;
      scope_id?: string;
      status?: string;
      q?: string;
      limit?: string;
      offset?: string;
    };

    const limit = Math.min(parseInt(limitStr ?? '50', 10), 200);
    const offset = parseInt(offsetStr ?? '0', 10);

    let rows: ConceptRow[];

    if (q && q.trim()) {
      // Full-text search using ts_rank + websearch_to_tsquery against pre-built search_vector
      const conditions: string[] = ["c.search_vector @@ websearch_to_tsquery('english', $1)", 'c.status = $2'];
      const params: unknown[] = [q.trim(), status];
      let paramIdx = 3;

      if (scope) {
        conditions.push(`c.scope = $${paramIdx}`);
        params.push(scope);
        paramIdx++;
      }
      if (scope_id) {
        conditions.push(`c.scope_id = $${paramIdx}`);
        params.push(scope_id);
        paramIdx++;
      }

      params.push(limit, offset);

      rows = (await pool.query(`
        SELECT c.id, c.memory_kind, c.trust_tier, c.scope, c.scope_id, c.content,
               c.source_type, c.source_url, c.confidence_score, c.status,
               c.review_state, c.superseded_by_id, c.last_used_at, c.use_count,
               c.session_id, c.created_at, c.updated_at,
               ts_rank(c.search_vector, websearch_to_tsquery('english', $1)) AS rank
        FROM concepts c
        WHERE ${conditions.join(' AND ')}
        ORDER BY ts_rank(c.search_vector, websearch_to_tsquery('english', $1)) DESC
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
      `, params)).rows as ConceptRow[];
    } else {
      // Direct query without FTS
      const conditions: string[] = ['status = $1'];
      const params: unknown[] = [status];
      let paramIdx = 2;

      if (scope) {
        conditions.push(`scope = $${paramIdx}`);
        params.push(scope);
        paramIdx++;
      }
      if (scope_id) {
        conditions.push(`scope_id = $${paramIdx}`);
        params.push(scope_id);
        paramIdx++;
      }

      params.push(limit, offset);

      rows = (await pool.query(`
        SELECT id, memory_kind, trust_tier, scope, scope_id, content,
               source_type, source_url, confidence_score, status,
               review_state, superseded_by_id, last_used_at, use_count,
               session_id, created_at, updated_at
        FROM concepts
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
      `, params)).rows as ConceptRow[];
    }

    return reply.send(ok({ concepts: rows, count: rows.length }));
  });
}
