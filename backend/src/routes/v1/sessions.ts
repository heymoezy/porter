// SIN-02: Cross-session FTS search endpoint (Phase 41 — Session Intelligence)
// GET /api/v1/sessions/search?q=keyword&agent_id=X&limit=N&offset=M

import { FastifyInstance } from 'fastify';
import { searchSessions, countSessionSearchResults } from '../../services/session-search.js';

export async function sessionsRoutes(app: FastifyInstance) {
  // This is full-text search over every agent transcript captured on this box.
  // It shipped with no guard at all and was reachable from the internet through
  // Caddy. Platform admin only — the admin SPA calls it with the admin cookie.
  app.addHook('preHandler', app.requirePlatformAdmin);

  // SIN-02: Cross-session FTS search
  app.get('/search', async (req, reply) => {
    const { q, agent_id, limit, offset } = req.query as {
      q?: string;
      agent_id?: string;
      limit?: string;
      offset?: string;
    };

    if (!q || q.trim().length === 0) {
      return reply.status(400).send({
        error: 'query_required',
        message: 'Query parameter "q" is required',
      });
    }

    const parsedLimit = Math.min(parseInt(limit ?? '20', 10) || 20, 100);
    const parsedOffset = parseInt(offset ?? '0', 10) || 0;

    const [results, total] = await Promise.all([
      searchSessions({
        query: q.trim(),
        agentId: agent_id,
        limit: parsedLimit,
        offset: parsedOffset,
      }),
      countSessionSearchResults(q.trim(), agent_id),
    ]);

    return reply.send({
      ok: true,
      query: q.trim(),
      total,
      limit: parsedLimit,
      offset: parsedOffset,
      results,
    });
  });
}

export default sessionsRoutes;
