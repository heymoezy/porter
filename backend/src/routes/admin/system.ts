import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { queryOne } from '../../db/pg-helpers.js';
import { config } from '../../config.js';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';

function readProc(path: string): string {
  try { return fs.readFileSync(path, 'utf-8'); } catch { return ''; }
}

export default async function systemRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/system — server metrics
  fastify.get('/', async () => {
    // Memory
    const memTotal = os.totalmem();
    const memFree = os.freemem();
    const memUsed = memTotal - memFree;

    // CPU
    const cpus = os.cpus();
    const loadAvg = os.loadavg();

    // Disk — parse df output
    let disk = { total: 0, used: 0, available: 0, pct: 0 };
    try {
      const df = execSync('df -B1 / 2>/dev/null | tail -1').toString().trim().split(/\s+/);
      disk = { total: parseInt(df[1]) || 0, used: parseInt(df[2]) || 0, available: parseInt(df[3]) || 0, pct: parseInt(df[4]) || 0 };
    } catch {}

    // Uptime
    const uptimeS = os.uptime();

    // DB size (PostgreSQL)
    let dbSize = 0;
    try {
      const pgSize = await queryOne<{ size: string }>('SELECT pg_database_size(current_database()) as size');
      dbSize = parseInt(pgSize?.size ?? '0', 10);
    } catch {}

    // Active sessions (valid tokens)
    let activeSessions = 0;
    try {
      const sessRow = await queryOne<{ c: string }>("SELECT count(*) as c FROM sessions WHERE expires > EXTRACT(epoch FROM now())");
      activeSessions = parseInt(sessRow?.c ?? '0', 10);
    } catch {}

    // Concurrent users — distinct users active in last 5 minutes
    let concurrentUsers = 0;
    try {
      const concRow = await queryOne<{ c: string }>("SELECT count(DISTINCT username) as c FROM sessions WHERE last_seen_at > EXTRACT(epoch FROM now()) - 300");
      concurrentUsers = parseInt(concRow?.c ?? '0', 10);
    } catch {}

    // Process memory
    const proc = process.memoryUsage();

    // Porter runtimes health
    const runtimes: Array<{ name: string; url: string; status: string; latencyMs: number }> = [];
    async function probeRuntime(name: string, url: string) {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(t);
        runtimes.push({ name, url, status: res.ok ? 'healthy' : 'down', latencyMs: Date.now() - start });
      } catch {
        runtimes.push({ name, url, status: 'down', latencyMs: Date.now() - start });
      }
    }
    await Promise.all([
      probeRuntime('Fastify Backend', `${config.fastifyUrl}/health`),
    ]);

    return ok({
      memory: {
        total: memTotal,
        used: memUsed,
        free: memFree,
        pct: Math.round(memUsed / memTotal * 100),
      },
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model || 'unknown',
        load1m: loadAvg[0],
        load5m: loadAvg[1],
        load15m: loadAvg[2],
      },
      disk,
      uptime: uptimeS,
      platform: { os: os.platform(), arch: os.arch(), hostname: os.hostname(), nodeVersion: process.version },
      db: { engine: 'postgresql', size: dbSize },
      sessions: { active: activeSessions, concurrent: concurrentUsers },
      process: { rss: proc.rss, heapUsed: proc.heapUsed, heapTotal: proc.heapTotal },
      runtimes,
    });
  });
}
