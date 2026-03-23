import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { pool } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';
import { onFileCreated, onMessageReceived } from '../../services/event-triggers.js';
import { z } from 'zod';
import crypto from 'crypto';

const createJobSchema = z.object({
  agent_id: z.string().min(1),
  project_id: z.string().optional(),
  trigger_type: z.string().default('manual'),
  prompt: z.string().optional(),
  scheduled_for: z.number().optional(), // Unix timestamp; defaults to now
});

export default async function jobV1Routes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  // GET /api/v1/jobs — list jobs, optional ?status=pending&agent_id=xxx&limit=50
  fastify.get('/', { preHandler: [fastify.requireAuth] }, async (request, reply) => {
    const { status, agent_id, limit } = request.query as {
      status?: string; agent_id?: string; limit?: string;
    };
    const params: unknown[] = [];
    let sql = 'SELECT * FROM agent_jobs WHERE 1=1';
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    if (agent_id) { params.push(agent_id); sql += ` AND agent_id = $${params.length}`; }
    params.push(parseInt(limit ?? '50', 10));
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    const rows = (await pool.query(sql, params)).rows;
    return reply.send(ok({ jobs: rows, count: rows.length }));
  });

  // POST /api/v1/jobs — create a new job (manual trigger)
  fastify.post('/', { preHandler: [fastify.requireAuth] }, async (request, reply) => {
    const parsed = createJobSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }
    const { agent_id, project_id, trigger_type, prompt, scheduled_for } = parsed.data;
    const id = crypto.randomUUID();
    await pool.query(`
      INSERT INTO agent_jobs (id, agent_id, project_id, trigger_type, prompt, status, scheduled_for)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6)
    `, [
      id,
      agent_id,
      project_id ?? null,
      trigger_type,
      prompt ?? null,
      scheduled_for ?? Date.now() / 1000,
    ]);
    const row = (await pool.query('SELECT * FROM agent_jobs WHERE id = $1', [id])).rows[0];
    return reply.code(201).send(ok({ job: row }));
  });

  // POST /api/v1/jobs/:id/cancel — cancel a pending job
  fastify.post('/:id/cancel', { preHandler: [fastify.requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await pool.query(`
      UPDATE agent_jobs SET status = 'cancelled', completed_at = EXTRACT(EPOCH FROM NOW())
      WHERE id = $1 AND status = 'pending'
    `, [id]);
    if (result.rowCount === 0) {
      return reply.code(404).send(err('JOB_NOT_FOUND', 'Job not found or not cancellable'));
    }
    return reply.send(ok({ cancelled: true }));
  });

  // POST /api/v1/jobs/events/notify — fire an event trigger
  // Used by external callers (porter.py after /api/files/upload) to insert trigger jobs.
  const notifySchema = z.object({
    event_type: z.enum(['file-created', 'message-received']),
    project_id: z.string().min(1),
    data: z.record(z.string(), z.unknown()).optional(),
  });

  fastify.post('/events/notify', { preHandler: [fastify.requireAuth] }, async (request, reply) => {
    const parsed = notifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const { event_type, project_id, data } = parsed.data;
    let inserted = 0;

    if (event_type === 'file-created') {
      inserted = await onFileCreated(project_id, (data as { filename?: string })?.filename ?? 'unknown');
    } else if (event_type === 'message-received') {
      inserted = await onMessageReceived(project_id,
        (data as { message?: string })?.message ?? '',
        (data as { from_user?: string })?.from_user ?? 'system'
      );
    }

    return reply.send(ok({ event_type, project_id, jobs_created: inserted }));
  });
}
