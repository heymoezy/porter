import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { queryAll, execute } from '../../db/pg-helpers.js';

export default async function envToolsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/env-tools — list all environment tools
  fastify.get('/', async () => {
    try {
      const rows = await queryAll<{
        tool_key: string;
        detected: number;
        version: string;
        source: string;
        health: string;
        last_checked_at: number;
      }>(
        'SELECT tool_key, detected, version, source, health, last_checked_at FROM environment_tools ORDER BY tool_key'
      );

      return ok({
        tools: rows.map(r => ({
          key: r.tool_key,
          detected: !!r.detected,
          version: r.version,
          source: r.source,
          health: r.health,
          lastChecked: r.last_checked_at,
        })),
        count: rows.length,
      });
    } catch {
      return ok({ tools: [], count: 0 });
    }
  });

  // POST /api/admin/env-tools/refresh — trigger re-detection (updates last_checked_at)
  fastify.post('/refresh', async () => {
    const now = Math.floor(Date.now() / 1000);
    await execute(
      'UPDATE environment_tools SET last_checked_at = $1',
      [now]
    );
    return ok({ refreshed: true, timestamp: now });
  });
}
