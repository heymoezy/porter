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

    // Active sessions
    let activeSessions = 0;
    try {
      const row = sqlite.prepare("SELECT count(*) as c FROM sessions WHERE expires > unixepoch('now')").get() as { c: number };
      activeSessions = row.c;
    } catch {}

    // Process memory
    const proc = process.memoryUsage();

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
      sessions: { active: activeSessions },
      process: { rss: proc.rss, heapUsed: proc.heapUsed, heapTotal: proc.heapTotal },
    });
  });
}
