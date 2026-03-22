import { FastifyInstance } from 'fastify';
import { ok } from '../lib/envelope.js';
import { sqlite } from '../db/client.js';
import { config } from '../config.js';
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

    // DB size
    let dbSize = 0;
    try { dbSize = fs.statSync(config.dbPath).size; } catch {}

    // Active sessions (valid tokens)
    let activeSessions = 0;
    try {
      activeSessions = (sqlite.prepare("SELECT count(*) as c FROM sessions WHERE expires > unixepoch('now')").get() as { c: number }).c;
    } catch {}

    // Concurrent users — distinct users active in last 5 minutes
    let concurrentUsers = 0;
    try {
      concurrentUsers = (sqlite.prepare("SELECT count(DISTINCT username) as c FROM sessions WHERE last_seen_at > unixepoch('now') - 300").get() as { c: number }).c;
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
      probeRuntime('Porter.py', `${config.porterPyUrl}/api/admin/health`),
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
      db: { size: dbSize, path: config.dbPath },
      sessions: { active: activeSessions, concurrent: concurrentUsers },
      process: { rss: proc.rss, heapUsed: proc.heapUsed, heapTotal: proc.heapTotal },
      runtimes,
    });
  });
}
