import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { queryAll } from '../../db/pg-helpers.js';

export default async function calendarRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/calendar — list all calendar events
  fastify.get('/', async () => {
    try {
      const events = await queryAll<{
        id: number;
        user_id: number;
        google_event_id: string | null;
        title: string;
        start_at: string;
        end_at: string | null;
        all_day: boolean;
        created_at: string;
        username: string | null;
      }>(
        `SELECT ce.id, ce.user_id, ce.google_event_id, ce.title,
                ce.start_at, ce.end_at, ce.all_day, ce.created_at,
                u.username
         FROM calendar_events ce
         LEFT JOIN users u ON u.id = ce.user_id
         ORDER BY ce.start_at DESC
         LIMIT 100`
      );

      return ok({ events, total: events.length });
    } catch {
      return ok({ events: [], total: 0 });
    }
  });
}
