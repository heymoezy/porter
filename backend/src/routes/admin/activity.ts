import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { queryAll } from '../../db/pg-helpers.js';

export default async function activityRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/activity — combined activity feed
  fastify.get('/', async (req) => {
    const { limit = '50', action } = req.query as Record<string, string>;
    const lim = Math.min(parseInt(limit) || 50, 200);

    try {
      let query = 'SELECT id, ts, ts_iso, actor, actor_type, action, target, details, project_id FROM audit_log';
      const params: unknown[] = [];
      let idx = 1;
      if (action) {
        query += ` WHERE action LIKE $${idx}`;
        params.push(`%${action}%`);
        idx++;
      }
      query += ` ORDER BY ts DESC LIMIT $${idx}`;
      params.push(lim);

      const entries = await queryAll<{
        id: number; ts: number; ts_iso: string; actor: string; actor_type: string;
        action: string; target: string; details: string; project_id: string | null;
      }>(query, params);

      // Action type counts for filtering
      const actionCounts = await queryAll<{ action: string; cnt: number }>(
        'SELECT action, count(*)::int as cnt FROM audit_log GROUP BY action ORDER BY cnt DESC LIMIT 20'
      );

      return ok({ entries, actionCounts, total: entries.length });
    } catch {
      return ok({ entries: [], actionCounts: [], total: 0 });
    }
  });

  // GET /api/admin/activity/learnings — what Porter has learned
  fastify.get('/learnings', async () => {
    try {
      const rows = await queryAll<{
        session_id: string; source: string; learnings: string;
        backend_used: string | null; extracted_at: string;
      }>(
        'SELECT session_id, source, learnings, backend_used, extracted_at FROM session_learnings ORDER BY extracted_at DESC'
      );

      return ok({
        learnings: rows.map(r => ({
          sessionId: r.session_id,
          source: r.source,
          text: r.learnings,
          backend: r.backend_used,
          extractedAt: parseFloat(r.extracted_at) || 0,
        })),
        count: rows.length,
      });
    } catch {
      return ok({ learnings: [], count: 0 });
    }
  });
}
