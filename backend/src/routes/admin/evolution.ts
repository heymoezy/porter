import { FastifyInstance } from 'fastify';
import { ok, err } from '../../lib/admin-envelope.js';
import { queryAll, queryOne, execute } from '../../db/pg-helpers.js';

export default async function evolutionRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/evolution/proposals — list proposals with optional filters
  fastify.get('/proposals', async (req) => {
    const { status, skill, limit } = req.query as { status?: string; skill?: string; limit?: string };
    const maxRows = Math.min(parseInt(limit || '50', 10) || 50, 200);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (status) {
      conditions.push(`p.status = $${idx++}`);
      params.push(status);
    }
    if (skill) {
      conditions.push(`p.skill_id = $${idx++}`);
      params.push(skill);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(maxRows);

    const rows = await queryAll<{
      id: string;
      skill_id: string;
      skill_name: string;
      persona_id: string;
      change_type: string;
      proposed_change: unknown;
      reasoning: string;
      triggering_feedback_ids: string[];
      status: string;
      created_at: number;
      reviewed_at: number | null;
      reviewed_by: string | null;
    }>(
      `SELECT p.id, p.skill_id, COALESCE(s.name, p.skill_id) AS skill_name,
              p.persona_id, p.change_type, p.proposed_change, p.reasoning,
              p.triggering_feedback_ids, p.status, p.created_at,
              p.reviewed_at, p.reviewed_by
       FROM skill_evolution_proposals p
       LEFT JOIN skills s ON s.id = p.skill_id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${idx}`,
      params
    );

    return ok({ proposals: rows, count: rows.length });
  });

  // GET /api/admin/evolution/events — list evolution events
  fastify.get('/events', async (req) => {
    const { skill, limit } = req.query as { skill?: string; limit?: string };
    const maxRows = Math.min(parseInt(limit || '50', 10) || 50, 200);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (skill) {
      conditions.push(`e.skill_id = $${idx++}`);
      params.push(skill);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(maxRows);

    const rows = await queryAll<{
      id: string;
      skill_id: string;
      skill_name: string;
      persona_id: string;
      proposal_id: string | null;
      change_type: string;
      change_detail: unknown;
      triggered_by: string[];
      effectiveness_before: number | null;
      effectiveness_after: number | null;
      created_at: number;
    }>(
      `SELECT e.id, e.skill_id, COALESCE(s.name, e.skill_id) AS skill_name,
              e.persona_id, e.proposal_id, e.change_type, e.change_detail,
              e.triggered_by, e.effectiveness_before, e.effectiveness_after,
              e.created_at
       FROM skill_evolution_events e
       LEFT JOIN skills s ON s.id = e.skill_id
       ${where}
       ORDER BY e.created_at DESC
       LIMIT $${idx}`,
      params
    );

    return ok({ events: rows, count: rows.length });
  });

  // POST /api/admin/evolution/proposals/:id/approve
  fastify.post('/proposals/:id/approve', async (req) => {
    const { id } = req.params as { id: string };
    const existing = await queryOne<{ status: string }>(
      'SELECT status FROM skill_evolution_proposals WHERE id = $1', [id]
    );
    if (!existing) return err('NOT_FOUND', 'Proposal not found');
    if (existing.status !== 'pending') return err('INVALID_STATE', `Cannot approve proposal with status '${existing.status}'`);

    await execute(
      `UPDATE skill_evolution_proposals SET status = 'approved', reviewed_at = EXTRACT(epoch FROM now()), reviewed_by = 'admin' WHERE id = $1`,
      [id]
    );
    return ok({ id, status: 'approved' });
  });

  // POST /api/admin/evolution/proposals/:id/reject
  fastify.post('/proposals/:id/reject', async (req) => {
    const { id } = req.params as { id: string };
    const existing = await queryOne<{ status: string }>(
      'SELECT status FROM skill_evolution_proposals WHERE id = $1', [id]
    );
    if (!existing) return err('NOT_FOUND', 'Proposal not found');
    if (existing.status !== 'pending') return err('INVALID_STATE', `Cannot reject proposal with status '${existing.status}'`);

    await execute(
      `UPDATE skill_evolution_proposals SET status = 'rejected', reviewed_at = EXTRACT(epoch FROM now()), reviewed_by = 'admin' WHERE id = $1`,
      [id]
    );
    return ok({ id, status: 'rejected' });
  });
}
