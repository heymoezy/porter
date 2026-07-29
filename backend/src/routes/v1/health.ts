import { FastifyInstance } from 'fastify';
import { pool } from '../../db/client.js';
import { config } from '../../config.js';
import { ok } from '../../lib/envelope.js';
import { PORTER_VERSION } from '../../version.js';
import { isLoopbackRequest } from '../../plugins/auth.js';

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
  // GET /api/v1/health — liveness for everyone, detail for the operator.
  //
  // This route is unauthenticated by necessity: monitoring has to be able to ask
  // whether Porter is up without holding a credential, and both the release
  // smoke (release.manifest.json) and admin/deploy.sh poll it. But "is it up"
  // never required publishing the internal topology, and until now an anonymous
  // request to askporter.app got the AI backend URLs and models, the database
  // engine and its latency, and seven days of token-usage totals — a free map of
  // what to attack and a running signal of how busy the box is.
  //
  // So the answer is now split by who is asking. Anonymous callers get liveness
  // only: status + version, which is everything the smoke checks and everything
  // an uptime monitor needs. The full body is unchanged for an operator — a
  // process on this box (the loopback gate, real only since `trustProxy` was set
  // in index.ts) or a signed-in platform_admin.
  fastify.get('/', async (request, reply) => {
    const privileged = isLoopbackRequest(request) || request.sessionUser?.role === 'platform_admin';

    if (!privileged) {
      return reply.send(ok({
        status: 'ok',
        porter_version: PORTER_VERSION,
      }));
    }

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
      // `status` and `porter_version` are the two fields BOTH shapes carry, so a
      // caller that only needs liveness reads the same keys either way.
      status: 'ok',
      porter_version: PORTER_VERSION,
      db_engine: 'postgresql',
      db_connected: dbStatus === 'up',
      backends,
      database: { engine: 'postgresql', status: dbStatus, latencyMs: dbLatencyMs },
      tokenUsage,
      checkedAt: new Date().toISOString(),
    }));
  });
}
