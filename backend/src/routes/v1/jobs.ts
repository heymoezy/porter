import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { sqlite } from '../../db/client.js';
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
    let sql = 'SELECT * FROM agent_jobs WHERE 1=1';
    const params: Record<string, unknown> = {};
    if (status) { sql += ' AND status = @status'; params.status = status; }
    if (agent_id) { sql += ' AND agent_id = @agentId'; params.agentId = agent_id; }
    sql += ' ORDER BY created_at DESC LIMIT @limit';
    params.limit = parseInt(limit ?? '50', 10);
    const rows = sqlite.prepare(sql).all(params);
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
    sqlite.prepare(`
      INSERT INTO agent_jobs (id, agent_id, project_id, trigger_type, prompt, status, scheduled_for)
      VALUES (@id, @agentId, @projectId, @triggerType, @prompt, 'pending', @scheduledFor)
    `).run({
      id,
      agentId: agent_id,
      projectId: project_id ?? null,
      triggerType: trigger_type,
      prompt: prompt ?? null,
      scheduledFor: scheduled_for ?? Date.now() / 1000,
    });
    const row = sqlite.prepare('SELECT * FROM agent_jobs WHERE id = ?').get(id);
    return reply.code(201).send(ok({ job: row }));
  });

  // POST /api/v1/jobs/:id/cancel — cancel a pending job
  fastify.post('/:id/cancel', { preHandler: [fastify.requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = sqlite.prepare(`
      UPDATE agent_jobs SET status = 'cancelled', completed_at = unixepoch('now')
      WHERE id = @id AND status = 'pending'
    `).run({ id });
    if (result.changes === 0) {
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
      inserted = onFileCreated(project_id, (data as { filename?: string })?.filename ?? 'unknown');
    } else if (event_type === 'message-received') {
      inserted = onMessageReceived(project_id,
        (data as { message?: string })?.message ?? '',
        (data as { from_user?: string })?.from_user ?? 'system'
      );
    }

    return reply.send(ok({ event_type, project_id, jobs_created: inserted }));
  });
}
