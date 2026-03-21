import { FastifyInstance } from 'fastify';
import { ok } from '../lib/envelope.js';
import { sqlite } from '../db/client.js';

export default async function activityRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/activity — combined activity feed
  fastify.get('/', async (req) => {
    const { limit = '50', action } = req.query as Record<string, string>;
    const lim = Math.min(parseInt(limit) || 50, 200);

    try {
      let query = 'SELECT id, ts, ts_iso, actor, actor_type, action, target, details, project_id FROM audit_log';
      const params: unknown[] = [];
      if (action) {
        query += ' WHERE action LIKE ?';
        params.push(`%${action}%`);
      }
      query += ' ORDER BY ts DESC LIMIT ?';
      params.push(lim);

      const entries = sqlite.prepare(query).all(...params) as Array<{
        id: number; ts: number; ts_iso: string; actor: string; actor_type: string;
        action: string; target: string; details: string; project_id: string | null;
      }>;

      // Action type counts for filtering
      const actionCounts = sqlite.prepare(
        'SELECT action, count(*) as cnt FROM audit_log GROUP BY action ORDER BY cnt DESC LIMIT 20'
      ).all() as Array<{ action: string; cnt: number }>;

      return ok({ entries, actionCounts, total: entries.length });
    } catch {
      return ok({ entries: [], actionCounts: [], total: 0 });
    }
  });

  // GET /api/admin/activity/learnings — what Porter has learned
  fastify.get('/learnings', async () => {
    try {
      const rows = sqlite.prepare(
        'SELECT session_id, source, learnings, backend_used, extracted_at FROM session_learnings ORDER BY extracted_at DESC'
      ).all() as Array<{
        session_id: string; source: string; learnings: string;
        backend_used: string | null; extracted_at: string;
      }>;

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
