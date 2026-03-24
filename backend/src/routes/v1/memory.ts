import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { pool } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';
import crypto from 'crypto';
import { z } from 'zod';
import { consolidateAgentMemory } from '../../services/consolidation.js';

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

const selfEditSchema = z.object({
  agent_id: z.string().min(1),
  action: z.enum(['promote', 'dismiss', 'create_directive']),
  concept_id: z.string().optional(),
  content: z.string().min(1).max(500).optional(),
  note_type: z.enum(['learning', 'directive', 'constraint']).optional(),
});

export default async function memoryV1Routes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  // GET /api/v1/memory/concepts — query Memory V2 concepts with optional FTS search
  fastify.get('/concepts', {
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

  // POST /api/v1/memory/self-edit — agent self-modification of memory (MEMV3-04)
  fastify.post('/self-edit', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const parsed = selfEditSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(err('INVALID_INPUT', parsed.error.issues.map(i => i.message).join('; ')));
    }

    const body = parsed.data;
    const username = request.sessionUser!.username;

    if (body.action === 'promote') {
      if (!body.concept_id) {
        return reply.status(400).send(err('INVALID_INPUT', 'concept_id required for promote action'));
      }

      // Fetch the concept to promote
      const conceptRes = await pool.query(
        `SELECT id, content, confidence_score FROM concepts WHERE id = $1 AND status = 'active'`,
        [body.concept_id]
      );

      if (conceptRes.rowCount === 0) {
        return reply.status(404).send(err('NOT_FOUND', `Concept ${body.concept_id} not found or already archived`));
      }

      const concept = conceptRes.rows[0];
      const newNoteId = crypto.randomUUID();

      // Insert into agent_notes
      const insertRes = await pool.query(
        `INSERT INTO agent_notes (id, agent_id, content, note_type, confidence_score, source_type, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'self_edit', 'active', $6, EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
         RETURNING id, agent_id, content, note_type, confidence_score, source_type, status, created_by, created_at`,
        [newNoteId, body.agent_id, concept.content, body.note_type ?? 'learning', concept.confidence_score, username]
      );

      // Archive the original concept
      await pool.query(
        `UPDATE concepts SET status = 'archived', updated_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $1`,
        [body.concept_id]
      );

      return reply.send(ok({ note: insertRes.rows[0], archived_concept_id: body.concept_id }));
    }

    if (body.action === 'dismiss') {
      if (!body.concept_id) {
        return reply.status(400).send(err('INVALID_INPUT', 'concept_id required for dismiss action'));
      }

      // Try agent_notes first
      const noteRes = await pool.query(
        `UPDATE agent_notes SET status = 'archived', updated_at = EXTRACT(EPOCH FROM NOW())
         WHERE id = $1 AND status = 'active'
         RETURNING id`,
        [body.concept_id]
      );

      if (noteRes.rowCount && noteRes.rowCount > 0) {
        return reply.send(ok({ dismissed: true, id: body.concept_id }));
      }

      // Try concepts table
      const conceptRes = await pool.query(
        `UPDATE concepts SET status = 'archived', updated_at = EXTRACT(EPOCH FROM NOW())
         WHERE id = $1 AND status = 'active'
         RETURNING id`,
        [body.concept_id]
      );

      if (conceptRes.rowCount && conceptRes.rowCount > 0) {
        return reply.send(ok({ dismissed: true, id: body.concept_id }));
      }

      return reply.status(404).send(err('NOT_FOUND', `No active record found with id ${body.concept_id}`));
    }

    if (body.action === 'create_directive') {
      if (!body.content) {
        return reply.status(400).send(err('INVALID_INPUT', 'content required for create_directive action'));
      }

      const newNoteId = crypto.randomUUID();
      const insertRes = await pool.query(
        `INSERT INTO agent_notes (id, agent_id, content, note_type, confidence_score, source_type, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 70, 'self_edit', 'active', $5, EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
         RETURNING id, agent_id, content, note_type, confidence_score, source_type, status, created_by, created_at`,
        [newNoteId, body.agent_id, body.content, body.note_type ?? 'directive', username]
      );

      return reply.send(ok({ note: insertRes.rows[0] }));
    }

    // Should never reach here due to enum validation
    return reply.status(400).send(err('INVALID_INPUT', 'Unknown action'));
  });

  // POST /api/v1/memory/consolidate — merge near-duplicate agent notes (MEMV3-03)
  fastify.post('/consolidate', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const bodySchema = z.object({ agent_id: z.string().min(1) });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(err('INVALID_INPUT', parsed.error.issues.map(i => i.message).join('; ')));
    }

    const result = await consolidateAgentMemory(parsed.data.agent_id);
    return reply.send(ok(result));
  });

  // GET /api/v1/memory/admin/overview — fleet-wide memory health (MEMV3-05)
  fastify.get('/admin/overview', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    if (request.sessionUser!.role !== 'platform_admin') {
      return reply.status(403).send(err('FORBIDDEN', 'Platform admin required'));
    }

    // Per-agent memory stats
    const agentsRes = await pool.query(`
      SELECT
        p.id AS agent_id,
        p.name AS agent_name,
        COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'active') AS concept_count,
        COUNT(DISTINCT an.id) FILTER (WHERE an.status = 'active') AS note_count,
        COALESCE(AVG(
          CASE WHEN an.status = 'active' THEN an.confidence_score
               WHEN c.status = 'active' THEN c.confidence_score
          END
        ), 50)::integer AS avg_confidence,
        COUNT(DISTINCT c.id) FILTER (WHERE c.review_state = 'pending' AND c.status = 'active') AS pending_review_count
      FROM personas p
      LEFT JOIN concepts c ON c.scope = 'agent' AND c.scope_id = p.id AND c.status = 'active'
      LEFT JOIN agent_notes an ON an.agent_id = p.id AND an.status = 'active'
      WHERE p.is_system = 0
      GROUP BY p.id, p.name
      ORDER BY p.name
    `);

    // Compute health_score per agent
    const agents = agentsRes.rows.map((row) => {
      const avgConf = parseInt(row.avg_confidence, 10);
      const pending = parseInt(row.pending_review_count, 10);
      const health_score = Math.min(100, Math.max(0, avgConf - pending * 5));
      return {
        agent_id: row.agent_id,
        agent_name: row.agent_name,
        concept_count: parseInt(row.concept_count, 10),
        note_count: parseInt(row.note_count, 10),
        avg_confidence: avgConf,
        pending_review_count: pending,
        health_score,
      };
    });

    // Fleet-wide totals
    const totalsRes = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM concepts WHERE status = 'active') AS total_concepts,
        (SELECT COUNT(*) FROM agent_notes WHERE status = 'active') AS total_notes,
        (SELECT COUNT(*) FROM directives WHERE status = 'active') AS total_directives,
        (SELECT COUNT(*) FROM concepts WHERE review_state = 'pending' AND status = 'active') AS total_pending_review
    `);

    const t = totalsRes.rows[0];
    const totals = {
      total_concepts: parseInt(t.total_concepts, 10),
      total_notes: parseInt(t.total_notes, 10),
      total_directives: parseInt(t.total_directives, 10),
      total_pending_review: parseInt(t.total_pending_review, 10),
    };

    return reply.send(ok({ agents, totals }));
  });
}
