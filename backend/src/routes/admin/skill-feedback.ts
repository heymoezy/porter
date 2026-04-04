import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { queryAll, queryOne } from '../../db/pg-helpers.js';

export default async function skillFeedbackRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/skill-feedback — list feedback events
  fastify.get('/', async (req) => {
    const { limit, type, skill } = req.query as {
      limit?: string; type?: string; skill?: string;
    };
    const maxRows = Math.min(parseInt(limit || '50', 10) || 50, 200);

    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (type) {
        conditions.push(`sfe.event_type = $${idx++}`);
        params.push(type);
      }
      if (skill) {
        conditions.push(`sfe.skill_id = $${idx++}`);
        params.push(skill);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(maxRows);

      const rows = await queryAll(
        `SELECT
           sfe.id,
           sfe.persona_id,
           sfe.skill_id,
           sfe.dispatch_id,
           sfe.event_type,
           sfe.note,
           sfe.created_at,
           s.name AS skill_name,
           p.name AS agent_name
         FROM skill_feedback_events sfe
         LEFT JOIN skills s ON s.id = sfe.skill_id
         LEFT JOIN personas p ON p.id = sfe.persona_id
         ${where}
         ORDER BY sfe.created_at DESC
         LIMIT $${idx}`,
        params
      );

      return ok({ events: rows, count: rows.length });
    } catch (e) {
      fastify.log.error({ err: e }, 'skill-feedback: failed to list events');
      return ok({ events: [], count: 0 });
    }
  });

  // GET /api/admin/skill-feedback/stats — aggregate stats
  fastify.get('/stats', async () => {
    try {
      const total = await queryOne<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM skill_feedback_events'
      );

      const byType = await queryAll<{ event_type: string; count: string }>(
        `SELECT event_type, COUNT(*)::text AS count
         FROM skill_feedback_events
         GROUP BY event_type
         ORDER BY COUNT(*) DESC`
      );

      const bySkill = await queryAll<{ skill_id: string; skill_name: string; count: string }>(
        `SELECT sfe.skill_id, COALESCE(s.name, sfe.skill_id) AS skill_name, COUNT(*)::text AS count
         FROM skill_feedback_events sfe
         LEFT JOIN skills s ON s.id = sfe.skill_id
         GROUP BY sfe.skill_id, s.name
         ORDER BY COUNT(*) DESC
         LIMIT 10`
      );

      const totalCount = parseInt(total?.count || '0', 10);
      const positiveTypes = ['positive', 'success'];
      const positiveCount = byType
        .filter(r => positiveTypes.includes(r.event_type))
        .reduce((sum, r) => sum + parseInt(r.count, 10), 0);
      const positiveRate = totalCount > 0 ? Math.round((positiveCount / totalCount) * 100) : 0;

      return ok({
        total: totalCount,
        positiveRate,
        byType: byType.map(r => ({ type: r.event_type, count: parseInt(r.count, 10) })),
        bySkill: bySkill.map(r => ({
          skill_id: r.skill_id,
          skill_name: r.skill_name,
          count: parseInt(r.count, 10),
        })),
      });
    } catch (e) {
      fastify.log.error({ err: e }, 'skill-feedback: failed to get stats');
      return ok({ total: 0, positiveRate: 0, byType: [], bySkill: [] });
    }
  });
}
