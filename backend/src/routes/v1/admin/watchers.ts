import { FastifyInstance } from 'fastify';
import { pool } from '../../../db/client.js';
import { ok, err } from '../../../lib/admin-envelope.js';
import crypto from 'crypto';

const VALID_WATCHER_TYPES = ['web_search', 'rss_feed', 'email_monitor', 'custom'] as const;

export default async function watchersRoutes(fastify: FastifyInstance) {

  // ── POST / — Create a watcher ─────────────────────────────────────────────
  fastify.post('/', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const projectId = String(body.project_id ?? '');
    const name = String(body.name ?? '');
    const watcherType = String(body.watcher_type ?? '');
    const scheduleIntervalSec = Number(body.schedule_interval_sec) || 21600;
    const config = (body.config && typeof body.config === 'object') ? body.config : {};
    const notifyEmail = body.notify_email ? String(body.notify_email) : null;

    // Validate required fields
    if (!projectId || !name || !watcherType) {
      return reply.code(400).send(err('MISSING_FIELDS', 'project_id, name, and watcher_type are required'));
    }

    // Validate watcher_type
    if (!VALID_WATCHER_TYPES.includes(watcherType as typeof VALID_WATCHER_TYPES[number])) {
      return reply.code(400).send(err('INVALID_WATCHER_TYPE', `watcher_type must be one of: ${VALID_WATCHER_TYPES.join(', ')}`));
    }

    // Validate project exists
    const projectCheck = await pool.query('SELECT 1 FROM projects WHERE id = $1', [projectId]);
    if (projectCheck.rows.length === 0) {
      return reply.code(404).send(err('PROJECT_NOT_FOUND', 'Project not found'));
    }

    // Compute schedule_cron
    let scheduleCron: string;
    switch (scheduleIntervalSec) {
      case 3600:   scheduleCron = '0 * * * *';     break; // hourly
      case 21600:  scheduleCron = '0 */6 * * *';   break; // every 6h
      case 86400:  scheduleCron = '0 0 * * *';     break; // daily
      default: {
        const mins = Math.max(1, Math.round(scheduleIntervalSec / 60));
        scheduleCron = `*/${mins} * * * *`;
      }
    }

    const id = crypto.randomUUID();
    const now = Date.now() / 1000;
    const nextRunAt = now + scheduleIntervalSec;
    const createdBy = (request as any).sessionUser?.username ?? 'system';

    await pool.query(
      `INSERT INTO project_watchers (id, project_id, name, watcher_type, schedule_cron, schedule_interval_sec, config, notify_email, status, next_run_at, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10, $11, $11)`,
      [id, projectId, name, watcherType, scheduleCron, scheduleIntervalSec, JSON.stringify(config), notifyEmail, nextRunAt, createdBy, now],
    );

    const { rows } = await pool.query('SELECT * FROM project_watchers WHERE id = $1', [id]);
    return reply.code(201).send(ok({ watcher: rows[0] }));
  });

  // ── GET / — List all watchers ─────────────────────────────────────────────
  fastify.get('/', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const projectId = query.project_id || null;
    const status = query.status || null;
    const limit = Math.min(parseInt(query.limit) || 50, 200);
    const offset = parseInt(query.offset) || 0;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (projectId) {
      conditions.push(`pw.project_id = $${paramIdx++}`);
      params.push(projectId);
    }
    if (status) {
      conditions.push(`pw.status = $${paramIdx++}`);
      params.push(status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM project_watchers pw ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.total) || 0;

    const { rows } = await pool.query(
      `SELECT pw.*, p.name AS project_name
       FROM project_watchers pw
       LEFT JOIN projects p ON p.id = pw.project_id
       ${where}
       ORDER BY pw.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset],
    );

    return reply.send(ok({ watchers: rows, total, limit, offset }));
  });

  // ── GET /:watcherId — Single watcher detail ──────────────────────────────
  fastify.get('/:watcherId', async (request, reply) => {
    const { watcherId } = request.params as { watcherId: string };

    const { rows } = await pool.query(
      `SELECT pw.*, p.name AS project_name
       FROM project_watchers pw
       LEFT JOIN projects p ON p.id = pw.project_id
       WHERE pw.id = $1`,
      [watcherId],
    );

    if (rows.length === 0) {
      return reply.code(404).send(err('NOT_FOUND', 'Watcher not found'));
    }

    return reply.send(ok(rows[0]));
  });

  // ── PATCH /:watcherId — Update watcher config ────────────────────────────
  fastify.patch('/:watcherId', async (request, reply) => {
    const { watcherId } = request.params as { watcherId: string };
    const body = request.body as Record<string, unknown>;

    // Check watcher exists
    const existing = await pool.query('SELECT * FROM project_watchers WHERE id = $1', [watcherId]);
    if (existing.rows.length === 0) {
      return reply.code(404).send(err('NOT_FOUND', 'Watcher not found'));
    }

    // Build dynamic SET clause
    const sets: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (body.name !== undefined) {
      sets.push(`name = $${paramIdx++}`);
      params.push(String(body.name));
    }
    if (body.schedule_interval_sec !== undefined) {
      const newInterval = Number(body.schedule_interval_sec);
      sets.push(`schedule_interval_sec = $${paramIdx++}`);
      params.push(newInterval);

      // Recalculate schedule_cron
      let scheduleCron: string;
      switch (newInterval) {
        case 3600:   scheduleCron = '0 * * * *';     break;
        case 21600:  scheduleCron = '0 */6 * * *';   break;
        case 86400:  scheduleCron = '0 0 * * *';     break;
        default: {
          const mins = Math.max(1, Math.round(newInterval / 60));
          scheduleCron = `*/${mins} * * * *`;
        }
      }
      sets.push(`schedule_cron = $${paramIdx++}`);
      params.push(scheduleCron);

      // Recalculate next_run_at
      sets.push(`next_run_at = EXTRACT(EPOCH FROM NOW()) + $${paramIdx++}`);
      params.push(newInterval);
    }
    if (body.config !== undefined) {
      sets.push(`config = $${paramIdx++}`);
      params.push(JSON.stringify(body.config));
    }
    if (body.status !== undefined) {
      sets.push(`status = $${paramIdx++}`);
      params.push(String(body.status));
    }
    if (body.notify_email !== undefined) {
      sets.push(`notify_email = $${paramIdx++}`);
      params.push(body.notify_email ? String(body.notify_email) : null);
    }

    if (sets.length === 0) {
      return reply.code(400).send(err('NO_FIELDS', 'No updatable fields provided'));
    }

    // Always update updated_at
    sets.push(`updated_at = EXTRACT(EPOCH FROM NOW())`);
    params.push(watcherId);

    const { rows } = await pool.query(
      `UPDATE project_watchers SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params,
    );

    return reply.send(ok({ watcher: rows[0] }));
  });

  // ── DELETE /:watcherId — Remove a watcher ────────────────────────────────
  fastify.delete('/:watcherId', async (request, reply) => {
    const { watcherId } = request.params as { watcherId: string };

    // Cascade delete findings first
    await pool.query('DELETE FROM watcher_findings WHERE watcher_id = $1', [watcherId]);
    const result = await pool.query('DELETE FROM project_watchers WHERE id = $1', [watcherId]);

    if (result.rowCount === 0) {
      return reply.code(404).send(err('NOT_FOUND', 'Watcher not found'));
    }

    return reply.send(ok({ deleted: true }));
  });

  // ── GET /:watcherId/findings — List findings for a watcher ───────────────
  fastify.get('/:watcherId/findings', async (request, reply) => {
    const { watcherId } = request.params as { watcherId: string };
    const query = request.query as Record<string, string>;
    const importance = query.importance || null;
    const limit = Math.min(parseInt(query.limit) || 50, 200);
    const offset = parseInt(query.offset) || 0;

    const conditions: string[] = ['watcher_id = $1'];
    const params: unknown[] = [watcherId];
    let paramIdx = 2;

    if (importance) {
      conditions.push(`importance = $${paramIdx++}`);
      params.push(importance);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM watcher_findings ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.total) || 0;

    const { rows } = await pool.query(
      `SELECT * FROM watcher_findings
       ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset],
    );

    return reply.send(ok({ findings: rows, total, limit, offset }));
  });

  // ── POST /:watcherId/run — Trigger immediate watcher run ─────────────────
  fastify.post('/:watcherId/run', async (request, reply) => {
    const { watcherId } = request.params as { watcherId: string };

    // Check watcher exists and is active
    const { rows: watcherRows } = await pool.query(
      'SELECT id, project_id, status FROM project_watchers WHERE id = $1',
      [watcherId],
    );
    if (watcherRows.length === 0) {
      return reply.code(404).send(err('NOT_FOUND', 'Watcher not found'));
    }
    const watcher = watcherRows[0] as { id: string; project_id: string; status: string };
    if (watcher.status !== 'active') {
      return reply.code(400).send(err('WATCHER_INACTIVE', 'Watcher must be active to trigger a run'));
    }

    // Create immediate job
    const jobId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO agent_jobs (id, agent_id, project_id, trigger_type, trigger_data, source, status, scheduled_for, created_at)
       VALUES ($1, 'system', $2, 'watcher_run', $3, 'watcher', 'pending', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))`,
      [jobId, watcher.project_id, JSON.stringify({ watcher_id: watcherId })],
    );

    return reply.send(ok({ job_id: jobId }));
  });
}
