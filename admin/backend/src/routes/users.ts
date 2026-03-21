import { FastifyInstance } from 'fastify';
import { ok, err } from '../lib/envelope.js';
import { db, sqlite } from '../db/client.js';
import * as schema from '../../../../backend/src/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  computeScores, getLoginHistory, getLoginAnomalies,
  getMrr, getModelCost, backfillLoginEvents,
} from '../services/customer-intel.js';

// Run backfill on first load
let backfilled = false;

export default async function usersRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/users — customer list with scores
  fastify.get('/', async () => {
    if (!backfilled) { backfillLoginEvents(); backfilled = true; }

    const rows = sqlite.prepare(`
      SELECT
        u.username, u.display_name, u.email, u.role, u.created_at,
        COALESCE(s.plan, 'free') as plan, COALESCE(s.status, 'none') as sub_status,
        (SELECT COUNT(*) FROM sessions ss WHERE ss.username = u.username AND ss.expires > unixepoch('now')) as active_sessions,
        (SELECT MAX(ss.last_seen_at) FROM sessions ss WHERE ss.username = u.username) as last_seen_at,
        (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.username) as project_count,
        (SELECT COUNT(*) FROM personas pe WHERE pe.owner = u.username) as agent_count
      FROM users u
      LEFT JOIN subscriptions s ON s.username = u.username
      WHERE u.role NOT IN ('platform_admin', 'admin')
      ORDER BY u.created_at DESC
    `).all() as any[];

    // Compute scores for each customer
    const customers = rows.map(r => {
      const scores = computeScores(r.username);
      return { ...r, ...scores };
    });

    const total = customers.length;
    const paying = customers.filter(c => c.plan !== 'free' && c.sub_status === 'active').length;
    const trialing = customers.filter(c => c.sub_status === 'trialing').length;

    return ok({
      customers,
      stats: { total, paying, trialing, free: total - paying - trialing },
    });
  });

  // GET /api/admin/users/team — platform admins and internal staff (not customers)
  fastify.get('/team', async () => {
    const rows = sqlite.prepare(`
      SELECT
        u.username, u.display_name, u.email, u.role, u.created_at,
        (SELECT COUNT(*) FROM sessions ss WHERE ss.username = u.username AND ss.expires > unixepoch('now')) as active_sessions,
        (SELECT MAX(ss.last_seen_at) FROM sessions ss WHERE ss.username = u.username) as last_seen_at,
        (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.username) as project_count,
        (SELECT COUNT(*) FROM personas pe WHERE pe.owner = u.username) as agent_count
      FROM users u
      WHERE u.role IN ('platform_admin', 'admin')
      ORDER BY u.role DESC, u.username
    `).all() as any[];

    return ok({ team: rows });
  });

  // GET /api/admin/users/:username — full revenue cockpit
  fastify.get<{ Params: { username: string } }>('/:username', async (request, reply) => {
    const { username } = request.params;

    const user = sqlite.prepare('SELECT username, display_name, full_name, email, role, created_at, country, city, timezone, company, job_title, phone, bio, social_x, social_linkedin, social_github, avatar_url, language, email_verified, suspended_at, suspension_reason, terms_accepted_at, last_ip, signup_source FROM users WHERE username = ?').get(username) as any;
    if (!user) return reply.code(404).send(err('NOT_FOUND', 'User not found'));

    const scores = computeScores(username);
    if (!scores) return reply.code(404).send(err('NOT_FOUND', 'User not found'));

    // Basic profile
    let plan = 'free', subStatus = 'none', trialEndsAt = null;
    try {
      const sub = sqlite.prepare('SELECT plan, status, trial_ends_at FROM subscriptions WHERE username = ?').get(username) as any;
      if (sub) { plan = sub.plan; subStatus = sub.status; trialEndsAt = sub.trial_ends_at; }
    } catch {}

    const lastSeen = (sqlite.prepare('SELECT MAX(last_seen_at) as t FROM sessions WHERE username = ?').get(username) as any)?.t;
    const activeSessions = (sqlite.prepare("SELECT COUNT(*) as c FROM sessions WHERE username = ? AND expires > unixepoch('now')").get(username) as any).c;
    const uniqueIps = (sqlite.prepare('SELECT COUNT(DISTINCT ip_address) as c FROM sessions WHERE username = ?').get(username) as any).c;
    const projectCount = (sqlite.prepare('SELECT COUNT(*) as c FROM projects WHERE owner_id = ?').get(username) as any).c;
    const chatCount = (sqlite.prepare('SELECT COUNT(*) as c FROM chats WHERE username = ?').get(username) as any).c;
    const agentCount = (sqlite.prepare('SELECT COUNT(*) as c FROM personas WHERE owner = ?').get(username) as any).c;

    // Token breakdown by model
    const tokensByModel = sqlite.prepare(`
      SELECT model, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, SUM(request_count) as requests
      FROM token_usage_daily WHERE date >= strftime('%Y-%m-01', 'now')
      GROUP BY model ORDER BY (input_tokens + output_tokens) DESC
    `).all() as any[];

    // Login history + anomalies
    const loginHistory = getLoginHistory(username);
    const anomalies = getLoginAnomalies(username);

    // Funnel stage
    const stage = plan !== 'free' ? 'revenue'
      : projectCount > 0 ? 'activated'
      : lastSeen && (Date.now() / 1000 - lastSeen < 7 * 86400) ? 'acquired'
      : 'at-risk';

    // Recent activity (compact)
    const recentProjects = sqlite.prepare(
      'SELECT name, status FROM projects WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 5'
    ).all(username) as any[];

    // Pending agent tasks for this customer
    let pendingTasks: any[] = [];
    try {
      pendingTasks = sqlite.prepare(
        "SELECT id, agent_type, action_type, status, priority, payload, created_at FROM admin_agent_tasks WHERE target_username = ? AND status IN ('queued', 'running') ORDER BY priority DESC"
      ).all(username) as any[];
    } catch {}

    return ok({
      customer: {
        ...user,
        plan, sub_status: subStatus, trial_ends_at: trialEndsAt,
        last_seen_at: lastSeen,
        active_sessions: activeSessions,
        unique_ips: uniqueIps,
        project_count: projectCount,
        chat_count: chatCount,
        agent_count: agentCount,
      },
      scores,
      stage,
      tokensByModel: tokensByModel.map(t => ({
        model: t.model,
        inputTokens: t.input_tokens,
        outputTokens: t.output_tokens,
        requests: t.requests,
        cost: Math.round(getModelCost(t.model, t.input_tokens, t.output_tokens) * 100) / 100,
      })),
      loginHistory: loginHistory.slice(0, 20),
      anomalies,
      recentProjects,
      pendingTasks,
    });
  });

  // PUT /api/admin/users/:username/role
  fastify.put<{ Params: { username: string }; Body: { role: string } }>('/:username/role', async (request, reply) => {
    const { username } = request.params;
    const { role } = request.body as { role: string };
    const validRoles = ['operator', 'admin', 'platform_admin'];
    if (!validRoles.includes(role)) return reply.code(400).send(err('INVALID_ROLE', `Must be: ${validRoles.join(', ')}`));
    const user = db.select().from(schema.users).where(eq(schema.users.username, username)).get();
    if (!user) return reply.code(404).send(err('NOT_FOUND', 'User not found'));
    db.update(schema.users).set({ role }).where(eq(schema.users.username, username)).run();
    return ok({ username, role });
  });

  // POST /api/admin/users/:username/purge-sessions
  fastify.post<{ Params: { username: string } }>('/:username/purge-sessions', async (request, reply) => {
    const { username } = request.params;
    const result = sqlite.prepare('DELETE FROM sessions WHERE username = ?').run(username);
    return ok({ purged: result.changes });
  });

  // DELETE /api/admin/users/:username
  fastify.delete<{ Params: { username: string } }>('/:username', async (request, reply) => {
    const { username } = request.params;
    const user = db.select().from(schema.users).where(eq(schema.users.username, username)).get();
    if (!user) return reply.code(404).send(err('NOT_FOUND', 'User not found'));
    if (username === request.sessionUser?.username) return reply.code(400).send(err('SELF_DELETE', 'Cannot delete yourself'));
    db.delete(schema.sessions).where(eq(schema.sessions.username, username)).run();
    db.delete(schema.users).where(eq(schema.users.username, username)).run();
    return ok({ deleted: username });
  });
}
