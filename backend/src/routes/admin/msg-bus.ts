import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { queryAll, queryOne } from '../../db/pg-helpers.js';

export default async function msgBusRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/msg-bus — list message bus events
  fastify.get('/', async (req) => {
    const { limit, intent, status, source, target } = req.query as {
      limit?: string; intent?: string; status?: string; source?: string; target?: string;
    };
    const maxRows = Math.min(parseInt(limit || '50', 10) || 50, 200);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (intent) {
      conditions.push(`intent = $${idx++}`);
      params.push(intent);
    }
    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }
    if (source) {
      conditions.push(`source_agent = $${idx++}`);
      params.push(source);
    }
    if (target) {
      conditions.push(`target_agent = $${idx++}`);
      params.push(target);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(maxRows);

    const rows = await queryAll<{
      id: string;
      correlation_id: string | null;
      source_agent: string | null;
      source_gateway: string | null;
      target_agent: string | null;
      target_gateway: string | null;
      intent: string | null;
      payload: unknown;
      response_payload: unknown;
      hop_count: number | null;
      latency_ms: number | null;
      status: string | null;
      created_at: number | null;
      delivered_at: number | null;
    }>(
      `SELECT id, correlation_id, source_agent, source_gateway,
              target_agent, target_gateway, intent, payload, response_payload,
              hop_count, latency_ms, status, created_at, delivered_at
       FROM msg_bus_events
       ${where}
       ORDER BY created_at DESC
       LIMIT $${idx}`,
      params
    );

    return ok({ events: rows, count: rows.length });
  });

  // GET /api/admin/msg-bus/stats — aggregate statistics
  fastify.get('/stats', async () => {
    const total = await queryOne<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM msg_bus_events'
    );

    const avgLatency = await queryOne<{ avg: string | null }>(
      'SELECT ROUND(AVG(latency_ms))::text AS avg FROM msg_bus_events WHERE latency_ms IS NOT NULL'
    );

    const byIntent = await queryAll<{ intent: string; count: string }>(
      `SELECT COALESCE(intent, 'unknown') AS intent, COUNT(*)::text AS count
       FROM msg_bus_events GROUP BY intent ORDER BY COUNT(*) DESC LIMIT 20`
    );

    const byStatus = await queryAll<{ status: string; count: string }>(
      `SELECT COALESCE(status, 'unknown') AS status, COUNT(*)::text AS count
       FROM msg_bus_events GROUP BY status ORDER BY COUNT(*) DESC`
    );

    return ok({
      total: parseInt(total?.count || '0', 10),
      avgLatencyMs: avgLatency?.avg ? parseInt(avgLatency.avg, 10) : null,
      byIntent: byIntent.map(r => ({ intent: r.intent, count: parseInt(r.count, 10) })),
      byStatus: byStatus.map(r => ({ status: r.status, count: parseInt(r.count, 10) })),
    });
  });
}
