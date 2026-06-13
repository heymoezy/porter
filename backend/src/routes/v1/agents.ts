// Worker-agent management + delegation API (Phase 2: "Tom is the boss").
//
// Tom (on ymc-tom-service) reaches these over HTTP with the service token to
// list / create worker agents and hand them async research/synthesis JOBS. The
// job-executor (services/job-executor.ts) runs each job through Bridge with the
// worker's persona + a BOUNDED read-only tool allow-list, then POSTs the result
// to the job's callback_url so Tom can report back to the WhatsApp group.
//
// Read-only by design: workers fetch + read + summarise; they never mutate the
// CRM or touch infra — every allow-list excludes Write/Edit/Bash/Agent.
import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { pool } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';

// Default worker sandbox: web search/fetch + file read/search. Nothing that writes.
const READ_ONLY_TOOLS = ['WebSearch', 'WebFetch', 'Read', 'Glob', 'Grep'];

export default async function agentsV1Routes(fastify: FastifyInstance) {
  // ── List worker agents (personas) ──────────────────────────────────────
  fastify.get('/', { preHandler: [fastify.requireAuth] }, async (request, reply) => {
    const q = request.query as { status?: string; role?: string };
    const args: unknown[] = [];
    const wh: string[] = [];
    if (q.status) { args.push(q.status); wh.push(`p.status = $${args.length}`); }
    if (q.role)   { args.push(q.role);   wh.push(`p.role = $${args.length}`); }
    const rows = (await pool.query(
      `SELECT p.id, p.name, p.role, p.status, p.template_id, p.preferred_backend, p.config,
              t.name AS template_name, t.description AS template_description
         FROM personas p
         LEFT JOIN agent_templates t ON t.id = p.template_id
        ${wh.length ? 'WHERE ' + wh.join(' AND ') : ''}
        ORDER BY p.name ASC`,
      args,
    )).rows;
    return reply.send(ok({ agents: rows }, request.id));
  });

  // ── Get one agent ──────────────────────────────────────────────────────
  fastify.get('/:id', { preHandler: [fastify.requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = (await pool.query(
      `SELECT p.id, p.name, p.role, p.status, p.template_id, p.preferred_backend, p.config,
              t.name AS template_name, t.description AS template_description, t.tools AS template_tools
         FROM personas p
         LEFT JOIN agent_templates t ON t.id = p.template_id
        WHERE p.id = $1`,
      [id],
    )).rows[0];
    if (!row) return reply.code(404).send(err('NOT_FOUND', 'Agent not found', request.id));
    return reply.send(ok({ agent: row }, request.id));
  });

  // ── Create a worker agent instance (persona), optionally from a template ──
  // Phase 3 seam — Tom mints a named worker. Phase 2 mostly uses the standing
  // roster, but this lets the roster grow on demand.
  fastify.post('/', { preHandler: [fastify.requireAuth] }, async (request, reply) => {
    const b = request.body as {
      name?: string; role?: string; template_id?: string;
      preferred_backend?: string; config?: Record<string, unknown>;
    };
    if (!b.name?.trim()) return reply.code(400).send(err('INVALID_INPUT', 'name required', request.id));
    const id = randomUUID();
    await pool.query(
      `INSERT INTO personas (id, name, role, status, template_id, preferred_backend, config, created_at)
       VALUES ($1, $2, $3, 'active', $4, $5, $6::jsonb, EXTRACT(EPOCH FROM NOW())::text)`,
      [id, b.name.trim(), b.role ?? 'worker', b.template_id ?? null,
       b.preferred_backend ?? null, JSON.stringify(b.config ?? {})],
    );
    return reply.send(ok({ id, name: b.name.trim() }, request.id));
  });

  // ── Enqueue a delegation job → runs async via job-executor ──────────────
  fastify.post('/:id/jobs', { preHandler: [fastify.requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const b = request.body as { task?: string; callback_url?: string; allowed_tools?: string[]; backend?: string };
    if (!b.task?.trim()) return reply.code(400).send(err('INVALID_INPUT', 'task required', request.id));

    const agent = (await pool.query(
      `SELECT p.id, t.tools AS template_tools
         FROM personas p LEFT JOIN agent_templates t ON t.id = p.template_id
        WHERE p.id = $1`,
      [id],
    )).rows[0] as { id: string; template_tools: unknown } | undefined;
    if (!agent) return reply.code(404).send(err('NOT_FOUND', 'Agent not found', request.id));

    // Bounded sandbox, ALWAYS set: explicit > the agent template's tools >
    // read-only default. The enforcement happens at the claude_cli adapter.
    const allowed = Array.isArray(b.allowed_tools) && b.allowed_tools.length
      ? b.allowed_tools
      : (Array.isArray(agent.template_tools) && (agent.template_tools as string[]).length
          ? (agent.template_tools as string[])
          : READ_ONLY_TOOLS);

    const jobId = randomUUID();
    const triggerData = { task: b.task.trim(), callback_url: b.callback_url ?? null, allowed_tools: allowed };
    await pool.query(
      `INSERT INTO agent_jobs
         (id, agent_id, trigger_type, trigger_data, prompt, status, scheduled_for, attempt_count, source, assigned_gateway)
       VALUES ($1, $2, 'custom', $3::jsonb, $4, 'pending', EXTRACT(EPOCH FROM NOW()), 0, 'delegation', $5)`,
      [jobId, id, JSON.stringify(triggerData), b.task.trim(), b.backend ?? null],
    );
    return reply.send(ok({ job_id: jobId, agent_id: id, status: 'pending', allowed_tools: allowed }, request.id));
  });

  // ── Poll a delegation job ───────────────────────────────────────────────
  fastify.get('/:id/jobs/:jobId', { preHandler: [fastify.requireAuth] }, async (request, reply) => {
    const { id, jobId } = request.params as { id: string; jobId: string };
    const row = (await pool.query(
      `SELECT id, agent_id, status, result, error, created_at, started_at, completed_at
         FROM agent_jobs WHERE id = $1 AND agent_id = $2`,
      [jobId, id],
    )).rows[0];
    if (!row) return reply.code(404).send(err('NOT_FOUND', 'Job not found', request.id));
    return reply.send(ok({ job: row }, request.id));
  });
}
