import { FastifyInstance } from 'fastify';
import { pool } from '../../../db/client.js';
import { ok, err } from '../../../lib/admin-envelope.js';

export default async function jobsRoutes(fastify: FastifyInstance) {

  // ── GET / — List all jobs with filtering ──────────────────────────────────
  fastify.get('/', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const status = query.status || null;
    const source = query.source || null;
    const triggerType = query.trigger_type || null;
    const limit = Math.min(parseInt(query.limit) || 50, 200);
    const offset = parseInt(query.offset) || 0;

    // Build WHERE clause dynamically
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (status) {
      conditions.push(`aj.status = $${paramIdx++}`);
      params.push(status);
    }
    if (source) {
      conditions.push(`aj.source = $${paramIdx++}`);
      params.push(source);
    }
    if (triggerType) {
      conditions.push(`aj.trigger_type = $${paramIdx++}`);
      params.push(triggerType);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM agent_jobs aj ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total) || 0;

    // Fetch page
    const { rows } = await pool.query(
      `SELECT aj.*,
              p.name AS assigned_agent_name,
              CASE WHEN aj.completed_at IS NOT NULL AND aj.started_at IS NOT NULL
                   THEN ROUND((aj.completed_at - aj.started_at) * 1000)::int
              END AS duration_ms,
              LEFT(aj.result, 200) AS result_preview
       FROM agent_jobs aj
       LEFT JOIN personas p ON p.id = aj.agent_id AND aj.agent_id != 'system'
       ${where}
       ORDER BY aj.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    );

    return reply.send(ok({ jobs: rows, total, limit, offset }));
  });

  // ── GET /queue — Pending + running jobs (next-to-run first) ───────────────
  fastify.get('/queue', async (request, reply) => {
    const { rows } = await pool.query(
      `SELECT aj.*,
              p.name AS assigned_agent_name,
              CASE WHEN aj.completed_at IS NOT NULL AND aj.started_at IS NOT NULL
                   THEN ROUND((aj.completed_at - aj.started_at) * 1000)::int
              END AS duration_ms,
              LEFT(aj.result, 200) AS result_preview
       FROM agent_jobs aj
       LEFT JOIN personas p ON p.id = aj.agent_id AND aj.agent_id != 'system'
       WHERE aj.status IN ('pending', 'running')
       ORDER BY aj.scheduled_for ASC
       LIMIT 100`
    );

    return reply.send(ok({ jobs: rows }));
  });

  // ── GET /history — Completed + failed jobs ────────────────────────────────
  fastify.get('/history', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const limit = Math.min(parseInt(query.limit) || 50, 200);
    const offset = parseInt(query.offset) || 0;

    const { rows } = await pool.query(
      `SELECT aj.*,
              p.name AS assigned_agent_name,
              CASE WHEN aj.completed_at IS NOT NULL AND aj.started_at IS NOT NULL
                   THEN ROUND((aj.completed_at - aj.started_at) * 1000)::int
              END AS duration_ms,
              LEFT(aj.result, 200) AS result_preview
       FROM agent_jobs aj
       LEFT JOIN personas p ON p.id = aj.agent_id AND aj.agent_id != 'system'
       WHERE aj.status IN ('complete', 'failed')
       ORDER BY aj.completed_at DESC NULLS LAST
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return reply.send(ok({ jobs: rows }));
  });

  // ── GET /:jobId — Single job detail (full result, no truncation) ──────────
  fastify.get('/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    const { rows } = await pool.query(
      `SELECT aj.*,
              p.name AS assigned_agent_name,
              CASE WHEN aj.completed_at IS NOT NULL AND aj.started_at IS NOT NULL
                   THEN ROUND((aj.completed_at - aj.started_at) * 1000)::int
              END AS duration_ms
       FROM agent_jobs aj
       LEFT JOIN personas p ON p.id = aj.agent_id AND aj.agent_id != 'system'
       WHERE aj.id = $1`,
      [jobId]
    );

    if (rows.length === 0) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });
    }

    return reply.send(ok(rows[0]));
  });
}
