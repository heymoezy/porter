import { FastifyInstance } from 'fastify';
import { ok, err } from '../../../lib/envelope.js';
import { pool } from '../../../db/client.js';

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
      await pool.query(`
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

  // Everything below requires platform_admin (handled by admin/index.ts hook)
  // The /report endpoint above is public — it runs before the parent hook catches it
  // because Fastify processes routes in registration order within the same plugin.

  // GET /api/admin/diagnostics — error dashboard
  fastify.get('/', async (request) => {
    const { resolved = '0', limit = '50', source } = request.query as Record<string, string>;

    const params: unknown[] = [];
    let paramIdx = 1;
    let where = `WHERE resolved = $${paramIdx++}`;
    params.push(resolved === '1' ? 1 : 0);
    if (source) {
      where += ` AND source = $${paramIdx++}`;
      params.push(source);
    }

    params.push(parseInt(limit));
    const errors = (await pool.query(
      `SELECT * FROM error_log ${where} ORDER BY created_at DESC LIMIT $${paramIdx++}`,
      params
    )).rows as any[];

    const stats = {
      total: (await pool.query('SELECT COUNT(*) as c FROM error_log')).rows[0].c,
      open: (await pool.query('SELECT COUNT(*) as c FROM error_log WHERE resolved = 0')).rows[0].c,
      today: (await pool.query("SELECT COUNT(*) as c FROM error_log WHERE created_at > EXTRACT(EPOCH FROM NOW()) - 86400")).rows[0].c,
      bySeverity: {
        critical: (await pool.query("SELECT COUNT(*) as c FROM error_log WHERE resolved = 0 AND severity = 'critical'")).rows[0].c,
        error: (await pool.query("SELECT COUNT(*) as c FROM error_log WHERE resolved = 0 AND severity = 'error'")).rows[0].c,
        warning: (await pool.query("SELECT COUNT(*) as c FROM error_log WHERE resolved = 0 AND severity = 'warning'")).rows[0].c,
      },
      bySource: {
        client_js: (await pool.query("SELECT COUNT(*) as c FROM error_log WHERE resolved = 0 AND source = 'client_js'")).rows[0].c,
        server_api: (await pool.query("SELECT COUNT(*) as c FROM error_log WHERE resolved = 0 AND source = 'server_api'")).rows[0].c,
        agent_error: (await pool.query("SELECT COUNT(*) as c FROM error_log WHERE resolved = 0 AND source = 'agent_error'")).rows[0].c,
      },
      // Top recurring errors (grouped by message)
      topErrors: (await pool.query(`
        SELECT message, source, severity, COUNT(*) as count, MAX(created_at) as last_seen
        FROM error_log WHERE resolved = 0
        GROUP BY message, source, severity ORDER BY count DESC LIMIT 10
      `)).rows as any[],
    };

    return ok({ errors, stats });
  });

  // POST /api/admin/diagnostics/:id/resolve — mark error resolved
  fastify.post<{ Params: { id: string } }>('/:id/resolve', async (request) => {
    await pool.query(
      "UPDATE error_log SET resolved = 1, resolved_by = $1, resolved_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $2",
      [request.sessionUser?.username ?? 'admin', request.params.id]
    );
    return ok({ resolved: request.params.id });
  });

  // POST /api/admin/diagnostics/resolve-all — bulk resolve
  fastify.post('/resolve-all', async (request) => {
    const { source, message } = request.body as { source?: string; message?: string };
    let where = 'WHERE resolved = 0';
    const params: any[] = [request.sessionUser?.username ?? 'admin'];
    let paramIdx = 2;
    if (source) { where += ` AND source = $${paramIdx++}`; params.push(source); }
    if (message) { where += ` AND message = $${paramIdx++}`; params.push(message); }
    const result = await pool.query(
      `UPDATE error_log SET resolved = 1, resolved_by = $1, resolved_at = EXTRACT(EPOCH FROM NOW()) ${where}`,
      params
    );
    return ok({ resolved: result.rowCount });
  });
}
