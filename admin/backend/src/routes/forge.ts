import { FastifyInstance } from 'fastify';
import { ok, err } from '../lib/envelope.js';
import { queryOne, queryAll, execute } from '../db/pg.js';
import {
  start, stop, getState, getSettings, updateSettings,
  approveWave, resetPipeline, retryItem, seedPipeline,
  queueTemplate, queueTemplates,
  addSSEClient, removeSSEClient,
} from '../services/forge.js';

export default async function forgeRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/forge — pipeline state + items
  fastify.get('/', async () => {
    const state = await getState();
    const items = await queryAll<Record<string, unknown>>(`
      SELECT fp.*, at.name as template_name, at.category
      FROM forge_pipeline fp
      LEFT JOIN agent_templates at ON at.id = fp.template_id
      ORDER BY fp.wave, fp.station DESC, fp.created_at
      LIMIT 200
    `);

    return ok({ ...state, items });
  });

  // GET /api/admin/forge/stats — counts per station
  fastify.get('/stats', async () => {
    const state = await getState();
    const byStation = await queryAll<Record<string, unknown>>(`
      SELECT station, status, COUNT(*)::int as count
      FROM forge_pipeline
      GROUP BY station, status
    `);

    return ok({ ...state.stats, byStation });
  });

  // GET /api/admin/forge/wave-summary — current wave stats
  fastify.get('/wave-summary', async () => {
    const settings = await getSettings();
    const wave = settings.currentWave;

    const summary = await queryOne<Record<string, unknown>>(`
      SELECT
        COUNT(*)::int as total,
        SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END)::int as complete,
        SUM(CASE WHEN status = 'error' OR status = 'dead_letter' THEN 1 ELSE 0 END)::int as errors,
        SUM(tokens_used)::int as tokens,
        AVG(CASE WHEN status = 'complete' THEN (
          SELECT AVG(quality_score) FROM forge_station_runs WHERE pipeline_id = forge_pipeline.id AND quality_score IS NOT NULL
        ) END) as avg_quality
      FROM forge_pipeline WHERE wave = $1
    `, [wave]);

    return ok({ wave, ...summary as Record<string, unknown> });
  });

  // GET /api/admin/forge/events — SSE stream
  fastify.get('/events', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const client = {
      write: (data: string) => { try { reply.raw.write(data); return true; } catch { return false; } },
      end: () => { try { reply.raw.end(); } catch {} },
    };

    addSSEClient(client);

    // Heartbeat
    const heartbeat = setInterval(() => {
      try { reply.raw.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
    }, 15000);

    // Send initial state
    const initialState = await getState();
    reply.raw.write(`data: ${JSON.stringify({ type: 'forge:state', data: initialState, timestamp: Date.now() })}\n\n`);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      removeSSEClient(client);
    });
  });

  // POST /api/admin/forge/start
  fastify.post('/start', async () => {
    await start();
    return ok({ running: true });
  });

  // POST /api/admin/forge/stop
  fastify.post('/stop', async () => {
    await stop();
    return ok({ running: false });
  });

  // POST /api/admin/forge/reset
  fastify.post('/reset', async () => {
    await resetPipeline();
    return ok({ reset: true });
  });

  // POST /api/admin/forge/approve-wave
  fastify.post('/approve-wave', async () => {
    await approveWave();
    const settings = await getSettings();
    return ok({ approved: true, wave: settings.currentWave });
  });

  // POST /api/admin/forge/queue — queue specific templates
  fastify.post('/queue', async (request) => {
    const body = request.body as { template_ids?: string[]; template_id?: string; wave?: number } | null;
    const ids = body?.template_ids ?? (body?.template_id ? [body.template_id] : []);
    if (ids.length === 0) return err('INVALID_INPUT', 'template_id or template_ids required');
    const count = await queueTemplates(ids, body?.wave);
    return ok({ queued: count, total: ids.length });
  });

  // DELETE /api/admin/forge/:id — remove from pipeline
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await queryOne<{ id: string }>("SELECT id FROM forge_pipeline WHERE id = $1", [id]);
    if (!item) {
      reply.status(404);
      return err('NOT_FOUND', 'Item not found');
    }
    await execute("DELETE FROM forge_station_runs WHERE pipeline_id = $1", [id]);
    await execute("DELETE FROM forge_pipeline WHERE id = $1", [id]);
    return ok({ removed: true, id });
  });

  // POST /api/admin/forge/:id/retry
  fastify.post('/:id/retry', async (request, reply) => {
    const { id } = request.params as { id: string };
    const success = await retryItem(id);
    if (!success) {
      reply.status(404);
      return err('NOT_FOUND', 'Item not found or not in error state');
    }
    return ok({ retried: true, id });
  });

  // PATCH /api/admin/forge/settings
  fastify.patch('/settings', async (request) => {
    const body = request.body as Record<string, unknown>;
    await updateSettings({
      tickIntervalMs: body.tickIntervalMs as number | undefined,
      dailyTokenBudget: body.dailyTokenBudget as number | undefined,
      qualityThreshold: body.qualityThreshold as number | undefined,
    });

    // Restart with new interval if running
    const settings = await getSettings();
    if (settings.running) {
      await stop();
      await start();
    }

    return ok(await getSettings());
  });
}
