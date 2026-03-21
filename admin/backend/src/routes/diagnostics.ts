import { FastifyInstance } from 'fastify';
import { ok, err } from '../lib/envelope.js';
import { sqlite } from '../db/client.js';

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
      sqlite.prepare(`
        INSERT INTO error_log (source, severity, message, stack, url, username, user_agent, ip_address, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        body.source ?? 'client_js',
        body.severity ?? 'error',
        body.message.slice(0, 2000),
        body.stack?.slice(0, 5000) ?? null,
        body.url ?? null,
        request.sessionUser?.username ?? null,
        request.headers['user-agent'] ?? null,
        request.ip,
        JSON.stringify(body.metadata ?? {}),
      );
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

    let where = `WHERE resolved = ${resolved === '1' ? 1 : 0}`;
    if (source) where += ` AND source = '${source.replace(/'/g, "''")}'`;

    const errors = sqlite.prepare(`
      SELECT * FROM error_log ${where} ORDER BY created_at DESC LIMIT ?
    `).all(parseInt(limit)) as any[];

    const stats = {
      total: (sqlite.prepare('SELECT COUNT(*) as c FROM error_log').get() as any).c,
      open: (sqlite.prepare('SELECT COUNT(*) as c FROM error_log WHERE resolved = 0').get() as any).c,
      today: (sqlite.prepare("SELECT COUNT(*) as c FROM error_log WHERE created_at > unixepoch('now') - 86400").get() as any).c,
      bySeverity: {
        critical: (sqlite.prepare("SELECT COUNT(*) as c FROM error_log WHERE resolved = 0 AND severity = 'critical'").get() as any).c,
        error: (sqlite.prepare("SELECT COUNT(*) as c FROM error_log WHERE resolved = 0 AND severity = 'error'").get() as any).c,
        warning: (sqlite.prepare("SELECT COUNT(*) as c FROM error_log WHERE resolved = 0 AND severity = 'warning'").get() as any).c,
      },
      bySource: {
        client_js: (sqlite.prepare("SELECT COUNT(*) as c FROM error_log WHERE resolved = 0 AND source = 'client_js'").get() as any).c,
        server_api: (sqlite.prepare("SELECT COUNT(*) as c FROM error_log WHERE resolved = 0 AND source = 'server_api'").get() as any).c,
        agent_error: (sqlite.prepare("SELECT COUNT(*) as c FROM error_log WHERE resolved = 0 AND source = 'agent_error'").get() as any).c,
      },
      // Top recurring errors (grouped by message)
      topErrors: sqlite.prepare(`
        SELECT message, source, severity, COUNT(*) as count, MAX(created_at) as last_seen
        FROM error_log WHERE resolved = 0
        GROUP BY message ORDER BY count DESC LIMIT 10
      `).all() as any[],
    };

    return ok({ errors, stats });
  });

  // POST /api/admin/diagnostics/:id/resolve — mark error resolved
  fastify.post<{ Params: { id: string } }>('/:id/resolve', async (request) => {
    sqlite.prepare(
      "UPDATE error_log SET resolved = 1, resolved_by = ?, resolved_at = unixepoch('now') WHERE id = ?"
    ).run(request.sessionUser?.username ?? 'admin', request.params.id);
    return ok({ resolved: request.params.id });
  });

  // POST /api/admin/diagnostics/resolve-all — bulk resolve
  fastify.post('/resolve-all', async (request) => {
    const { source, message } = request.body as { source?: string; message?: string };
    let where = 'WHERE resolved = 0';
    const params: any[] = [];
    if (source) { where += ' AND source = ?'; params.push(source); }
    if (message) { where += ' AND message = ?'; params.push(message); }
    const result = sqlite.prepare(`UPDATE error_log SET resolved = 1, resolved_by = ?, resolved_at = unixepoch('now') ${where}`)
      .run(request.sessionUser?.username ?? 'admin', ...params);
    return ok({ resolved: result.changes });
  });
}
