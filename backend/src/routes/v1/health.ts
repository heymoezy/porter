import { FastifyInstance } from 'fastify';
import { pool } from '../../db/client.js';
import { config } from '../../config.js';
import { ok } from '../../lib/envelope.js';

interface BackendStatus {
  name: string;
  url: string;
  model: string;
  status: 'up' | 'down' | 'unknown';
  latencyMs: number | null;
}

async function probeBackend(name: string, url: string, model: string): Promise<BackendStatus> {
  const start = Date.now();
  try {
    const resp = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    });
    const latency = Date.now() - start;
    // Accept 200-499 as "up" — HEAD may return 405 but server is running
    const isUp = resp.ok || resp.status === 405 || resp.status < 500;
    return { name, url, model, status: isUp ? 'up' : 'down', latencyMs: latency };
  } catch {
    return { name, url, model, status: 'down', latencyMs: null };
  }
}

export default async function healthV1Routes(fastify: FastifyInstance) {
  // GET /api/v1/health — aggregate status of all services
  fastify.get('/', async (_request, reply) => {
    // Probe AI backends in parallel
    const backends = await Promise.all([
      probeBackend('Ollama', config.ollamaUrl, config.ollamaModel),
      probeBackend('OpenClaw', config.openclawUrl, config.openclawModel),
    ]);

    // DB health — quick query
    let dbStatus: 'up' | 'down' = 'down';
    let dbLatencyMs: number | null = null;
    try {
      const dbStart = Date.now();
      await pool.query('SELECT 1');
      dbLatencyMs = Date.now() - dbStart;
      dbStatus = 'up';
    } catch {
      dbStatus = 'down';
    }

    // Token usage — last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);

    let tokenUsage: { model: string; total_input: number; total_output: number; total_requests: number }[] = [];
    try {
      tokenUsage = (await pool.query(`
        SELECT model,
               SUM(input_tokens) as total_input,
               SUM(output_tokens) as total_output,
               SUM(request_count) as total_requests
        FROM token_usage_daily
        WHERE date >= $1
        GROUP BY model
        ORDER BY total_requests DESC
      `, [sevenDaysAgo])).rows as typeof tokenUsage;
    } catch {
      // Table may not exist yet — empty is fine
    }

    return reply.send(ok({
      porter_version: '6.32.0',
      db_engine: 'postgresql',
      db_connected: dbStatus === 'up',
      backends,
      database: { engine: 'postgresql', status: dbStatus, latencyMs: dbLatencyMs },
      tokenUsage,
      checkedAt: new Date().toISOString(),
    }));
  });
}
