import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { queryOne, queryAll } from '../../db/pg-helpers.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let ADMIN_VERSION = '0.6.2';
try {
  for (const p of [resolve(__dirname, '../../package.json'), resolve(process.cwd(), 'package.json')]) {
    try {
      const pkg = JSON.parse(readFileSync(p, 'utf-8'));
      if (pkg.version) { ADMIN_VERSION = pkg.version; break; }
    } catch {}
  }
} catch {}

export default async function healthRoutes(fastify: FastifyInstance) {
  // Public health check — no auth required
  fastify.get('/', async () => {
    let dbOk = false;
    try {
      const check = await queryOne('SELECT 1 as ok');
      dbOk = !!check;
    } catch { /* db unreachable */ }

    return ok({
      status: dbOk ? 'healthy' : 'degraded',
      service: 'porter-admin',
      version: ADMIN_VERSION,
      db: dbOk ? 'connected' : 'unreachable',
      timestamp: Date.now(),
    });
  });

  // GET /api/admin/health/version — version endpoint
  fastify.get('/version', async () => {
    return ok({ version: ADMIN_VERSION, service: 'porter-admin' });
  });

  // GET /api/admin/health/logs — combined user + error logs for dashboard terminal
  fastify.get('/logs', async (req) => {
    const limit = Math.min(parseInt((req.query as Record<string, string>).limit || '20'), 50);
    const logs: Array<{ ts: number; text: string; color: string }> = [];
    try {
      const audits = await queryAll('SELECT ts, actor, action, target, details FROM audit_log ORDER BY ts DESC LIMIT $1', [limit]);
      for (const a of audits as Array<{ ts: number; actor: string; action: string; target: string; details: string }>) {
        let ip = ''; try { ip = JSON.parse(a.details || '{}').ip || ''; } catch {}
        const t = new Date(a.ts * 1000).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (a.action.includes('login.ok')) logs.push({ ts: a.ts, text: `${t} [${a.actor}] Login OK — ${ip}`, color: 'text-success' });
        else if (a.action.includes('login.fail')) logs.push({ ts: a.ts, text: `${t} [${a.actor}] Login FAILED — ${ip}`, color: 'text-danger' });
        else if (a.action.includes('logout')) logs.push({ ts: a.ts, text: `${t} [${a.actor}] Logout`, color: 'text-text3' });
        else logs.push({ ts: a.ts, text: `${t} [${a.actor}] ${a.action} → ${a.target}`, color: 'text-accent-porter' });
      }
    } catch {}
    // Porter-related errors only — skip browser noise (MetaMask, extensions, etc.)
    const NOISE = ['MetaMask', 'metamask', 'extension', 'chrome-extension', 'moz-extension', 'webpack', 'ResizeObserver'];
    try {
      const errors = await queryAll('SELECT created_at, source, severity, message, username FROM error_log ORDER BY created_at DESC LIMIT $1', [limit * 2]);
      for (const e of errors as Array<{ created_at: number; source: string; severity: string; message: string; username: string | null }>) {
        if (NOISE.some(n => e.message.includes(n))) continue;
        const t = new Date(e.created_at * 1000).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        logs.push({ ts: e.created_at, text: `${t} [${e.username || 'system'}] ${e.severity}: ${e.message.slice(0, 80)}`, color: e.severity === 'error' || e.severity === 'critical' ? 'text-danger' : 'text-warning' });
      }
    } catch {}
    logs.sort((a, b) => b.ts - a.ts);
    return ok({ logs: logs.slice(0, limit) });
  });

  // GET /api/admin/health/dashboard — global platform metrics
  fastify.get('/dashboard', async () => {
    const q = async (sql: string): Promise<Record<string, number>> => {
      try { return (await queryOne(sql)) as Record<string, number> ?? {}; }
      catch { return {}; }
    };

    const projects = await q('SELECT count(*)::int as total FROM projects');
    let projectsByStatus: Array<{status: string; cnt: number}> = [];
    try {
      projectsByStatus = await queryAll('SELECT status, count(*)::int as cnt FROM projects GROUP BY status');
    } catch {}
    const agents = await q("SELECT count(*)::int as total FROM personas WHERE id != 'porter-core'");
    const chats = await q('SELECT count(*)::int as total FROM chats');
    const messages = await q('SELECT count(*)::int as total FROM chat_messages');
    const agentMessages = await q('SELECT count(*)::int as total FROM agent_messages');
    const tasks = await q('SELECT count(*)::int as total FROM tasks');
    const orchestrations = { total: 0 };
    const decisions = await q('SELECT count(*)::int as total FROM decision_log');
    const customers = await q("SELECT count(*)::int as total FROM users WHERE role NOT IN ('platform_admin','admin')");
    const sessions = await q("SELECT count(*)::int as total FROM sessions WHERE expires > EXTRACT(epoch FROM now())");
    const tokens = await q('SELECT coalesce(sum(input_tokens),0)::int as input, coalesce(sum(output_tokens),0)::int as output, coalesce(sum(request_count),0)::int as reqs FROM token_usage_daily');
    const learnings = await q('SELECT count(*)::int as total FROM session_learnings');
    const auditEvents = await q('SELECT count(*)::int as total FROM audit_log');
    const emails = await q('SELECT count(*)::int as total FROM email_messages');
    const skills = await q('SELECT count(DISTINCT skill_name)::int as total FROM persona_skills');

    // Recent activity (last 10)
    let recentActivity: Array<{ts: number; actor: string; action: string; target: string}> = [];
    try {
      recentActivity = await queryAll('SELECT ts, actor, action, target FROM audit_log ORDER BY ts DESC LIMIT 10');
    } catch {}

    return ok({
      projects: { total: projects.total || 0, byStatus: projectsByStatus },
      agents: agents.total || 0,
      chats: chats.total || 0,
      messages: messages.total || 0,
      agentMessages: agentMessages.total || 0,
      tasks: tasks.total || 0,
      orchestrations: orchestrations.total || 0,
      decisions: decisions.total || 0,
      customers: customers.total || 0,
      sessions: sessions.total || 0,
      tokens: { input: tokens.input || 0, output: tokens.output || 0, requests: tokens.reqs || 0 },
      learnings: learnings.total || 0,
      auditEvents: auditEvents.total || 0,
      emails: emails.total || 0,
      skills: skills.total || 0,
      recentActivity,
      version: ADMIN_VERSION,
    });
  });
}
