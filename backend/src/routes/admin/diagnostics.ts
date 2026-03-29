import { FastifyInstance } from 'fastify';
import { ok, err } from '../../lib/admin-envelope.js';
import { queryOne, queryAll, execute } from '../../db/pg-helpers.js';

export default async function diagnosticsRoutes(fastify: FastifyInstance) {

  // POST /api/admin/diagnostics/report — PUBLIC (no auth, clients report errors here)
  fastify.post('/report', async (request) => {
    const body = request.body as {
      source?: string;
      severity?: string;
      message?: string;
      stack?: string;
      url?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.message) return ok({ ignored: true });

    try {
      await execute(`
        INSERT INTO error_log (source, severity, message, stack, url, username, user_agent, ip_address, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        body.source ?? 'client_js',
        body.severity ?? 'error',
        body.message.slice(0, 2000),
        body.stack?.slice(0, 5000) ?? null,
        body.url ?? null,
        request.sessionUser?.username ?? null,
        request.headers['user-agent'] ?? null,
        request.ip,
        JSON.stringify(body.metadata ?? {}),
      ]);
    } catch { /* table may not exist */ }

    return ok({ received: true });
  });

  // Everything below requires platform_admin
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip auth for the report endpoint (already handled above)
    if (request.url.endsWith('/report')) return;
    return fastify.requirePlatformAdmin(request, reply);
  });

  // GET /api/admin/diagnostics — error dashboard
  fastify.get('/', async (request) => {
    const { resolved = '0', limit = '50', source } = request.query as Record<string, string>;

    const conditions: string[] = ['resolved = $1'];
    const params: unknown[] = [resolved === '1' ? 1 : 0];
    let idx = 2;
    if (source) {
      conditions.push(`source = $${idx}`);
      params.push(source);
      idx++;
    }
    params.push(parseInt(limit) || 50);

    const errors = await queryAll(
      `SELECT * FROM error_log WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${idx}`,
      params
    );

    const stats = {
      total: ((await queryOne<{ c: number }>('SELECT COUNT(*)::int as c FROM error_log')) ?? { c: 0 }).c,
      open: ((await queryOne<{ c: number }>('SELECT COUNT(*)::int as c FROM error_log WHERE resolved = 0')) ?? { c: 0 }).c,
      today: ((await queryOne<{ c: number }>(
        "SELECT COUNT(*)::int as c FROM error_log WHERE created_at > EXTRACT(epoch FROM now()) - 86400"
      )) ?? { c: 0 }).c,
      bySeverity: {
        critical: ((await queryOne<{ c: number }>("SELECT COUNT(*)::int as c FROM error_log WHERE resolved = 0 AND severity = 'critical'")) ?? { c: 0 }).c,
        error: ((await queryOne<{ c: number }>("SELECT COUNT(*)::int as c FROM error_log WHERE resolved = 0 AND severity = 'error'")) ?? { c: 0 }).c,
        warning: ((await queryOne<{ c: number }>("SELECT COUNT(*)::int as c FROM error_log WHERE resolved = 0 AND severity = 'warning'")) ?? { c: 0 }).c,
      },
      bySource: {
        client_js: ((await queryOne<{ c: number }>("SELECT COUNT(*)::int as c FROM error_log WHERE resolved = 0 AND source = 'client_js'")) ?? { c: 0 }).c,
        server_api: ((await queryOne<{ c: number }>("SELECT COUNT(*)::int as c FROM error_log WHERE resolved = 0 AND source = 'server_api'")) ?? { c: 0 }).c,
        agent_error: ((await queryOne<{ c: number }>("SELECT COUNT(*)::int as c FROM error_log WHERE resolved = 0 AND source = 'agent_error'")) ?? { c: 0 }).c,
      },
      topErrors: await queryAll(`
        SELECT message, source, severity, COUNT(*)::int as count, MAX(created_at) as last_seen
        FROM error_log WHERE resolved = 0
        GROUP BY message, source, severity ORDER BY count DESC LIMIT 10
      `),
    };

    return ok({ errors, stats });
  });

  // POST /api/admin/diagnostics/:id/resolve — mark error resolved
  fastify.post<{ Params: { id: string } }>('/:id/resolve', async (request) => {
    await execute(
      "UPDATE error_log SET resolved = 1, resolved_by = $1, resolved_at = EXTRACT(epoch FROM now()) WHERE id = $2",
      [request.sessionUser?.username ?? 'admin', request.params.id]
    );
    return ok({ resolved: request.params.id });
  });

  // POST /api/admin/diagnostics/resolve-all — bulk resolve
  fastify.post('/resolve-all', async (request) => {
    const { source, message } = request.body as { source?: string; message?: string };
    const conditions: string[] = ['resolved = 0'];
    const params: unknown[] = [request.sessionUser?.username ?? 'admin'];
    let idx = 2;
    if (source) { conditions.push(`source = $${idx}`); params.push(source); idx++; }
    if (message) { conditions.push(`message = $${idx}`); params.push(message); idx++; }
    const result = await execute(
      `UPDATE error_log SET resolved = 1, resolved_by = $1, resolved_at = EXTRACT(epoch FROM now()) WHERE ${conditions.join(' AND ')}`,
      params
    );
    return ok({ resolved: result.rowCount });
  });
}
