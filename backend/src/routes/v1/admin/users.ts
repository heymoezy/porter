import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { ok, err } from '../../../lib/envelope.js';
import { db, pool } from '../../../db/client.js';
import * as schema from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import {
  computeScores, getLoginHistory, getLoginAnomalies,
  backfillLoginEvents,
} from '../../../services/customer-intel.js';

// Run backfill on first load
let backfilled = false;

// Valid subscription plans and statuses
const VALID_PLANS = ['free', 'cloud', 'cloud_team', 'enterprise'] as const;
const VALID_SUB_STATUSES = ['trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired'] as const;

export default async function usersRoutes(fastify: FastifyInstance) {

  // GET /api/admin/users — customer list with scores
  fastify.get('/', async () => {
    if (!backfilled) {
      await backfillLoginEvents();
      // Fix orphaned project ownership from username migration (admin → moe)
      try {
        const orphaned = (await pool.query("SELECT COUNT(*) as c FROM projects WHERE owner_id = 'admin'")).rows[0].c;
        if (orphaned > 0) {
          const target = (await pool.query("SELECT username FROM users WHERE username = 'moe'")).rows[0];
          if (target) {
            await pool.query("UPDATE projects SET owner_id = 'moe' WHERE owner_id = 'admin'");
          }
        }
      } catch {}
      backfilled = true;
    }

    const totalUsers = (await pool.query('SELECT COUNT(*) as c FROM users')).rows[0].c;

    const rows = (await pool.query(`
      SELECT
        u.username, u.display_name, u.full_name, u.email, u.role, u.created_at,
        COALESCE(u.email_verified, 0) as email_verified,
        COALESCE(u.lifetime_free, 0) as lifetime_free,
        u.suspended_at,
        COALESCE(s.plan, 'free') as plan, COALESCE(s.status, 'none') as sub_status,
        s.trial_ends_at,
        (SELECT COUNT(*) FROM sessions ss WHERE ss.username = u.username AND ss.expires > EXTRACT(EPOCH FROM NOW())) as active_sessions,
        (SELECT MAX(ss.last_seen_at) FROM sessions ss WHERE ss.username = u.username) as last_seen_at,
        (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.username) as project_count,
        (SELECT COUNT(*) FROM personas pe WHERE pe.owner = u.username AND pe.is_system = false) as agent_count,
        (SELECT COUNT(*) FROM chats WHERE username = u.username) as chat_count
      FROM users u
      LEFT JOIN subscriptions s ON s.username = u.username
      WHERE u.role NOT IN ('platform_admin', 'admin')
      ORDER BY u.created_at DESC
    `)).rows as any[];

    // Compute scores for each customer
    const customers = [];
    for (const r of rows) {
      const scores = await computeScores(r.username);
      customers.push({ ...r, ...scores });
    }

    const total = customers.length;
    const paying = customers.filter(c => c.plan !== 'free' && c.sub_status === 'active').length;
    const trialing = customers.filter(c => c.sub_status === 'trialing').length;
    const suspended = customers.filter(c => c.suspended_at).length;

    return ok({
      customers,
      stats: {
        total,
        paying,
        trialing,
        free: total - paying - trialing,
        suspended,
        preLaunch: totalUsers < 100,
        totalAllUsers: totalUsers,
      },
    });
  });

  // GET /api/admin/users/team — platform admins and internal staff (not customers)
  fastify.get('/team', async () => {
    const rows = (await pool.query(`
      SELECT
        u.username, u.display_name, u.email, u.role, u.created_at,
        (SELECT COUNT(*) FROM sessions ss WHERE ss.username = u.username AND ss.expires > EXTRACT(EPOCH FROM NOW())) as active_sessions,
        (SELECT MAX(ss.last_seen_at) FROM sessions ss WHERE ss.username = u.username) as last_seen_at,
        (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.username) as project_count,
        (SELECT COUNT(*) FROM personas pe WHERE pe.owner = u.username AND pe.is_system = false) as agent_count
      FROM users u
      WHERE u.role IN ('platform_admin', 'admin')
      ORDER BY u.role DESC, u.username
    `)).rows as any[];

    return ok({ team: rows });
  });

  // GET /api/admin/users/:username — full revenue cockpit
  fastify.get<{ Params: { username: string } }>('/:username', async (request, reply) => {
    const { username } = request.params;

    const user = (await pool.query('SELECT username, display_name, full_name, email, role, created_at, country, city, timezone, company, job_title, phone, bio, social_x, social_linkedin, social_github, avatar_url, language, email_verified, suspended_at, suspension_reason, terms_accepted_at, last_ip, signup_source, COALESCE(lifetime_free, 0) as lifetime_free FROM users WHERE username = $1', [username])).rows[0] as any;
    if (!user) return reply.code(404).send(err('NOT_FOUND', 'User not found'));

    const scores = await computeScores(username);
    if (!scores) return reply.code(404).send(err('NOT_FOUND', 'User not found'));

    // Subscription
    let subscription: any = null;
    try {
      subscription = (await pool.query('SELECT * FROM subscriptions WHERE username = $1', [username])).rows[0] as any;
    } catch {}

    const plan = subscription?.plan ?? 'free';
    const subStatus = subscription?.status ?? 'none';
    const trialEndsAt = subscription?.trial_ends_at ?? null;

    const lastSeen = (await pool.query('SELECT MAX(last_seen_at) as t FROM sessions WHERE username = $1', [username])).rows[0]?.t;
    const activeSessions = (await pool.query("SELECT COUNT(*) as c FROM sessions WHERE username = $1 AND expires > EXTRACT(EPOCH FROM NOW())", [username])).rows[0].c;
    const uniqueIps = (await pool.query('SELECT COUNT(DISTINCT ip_address) as c FROM sessions WHERE username = $1', [username])).rows[0].c;
    const projectCount = (await pool.query('SELECT COUNT(*) as c FROM projects WHERE owner_id = $1', [username])).rows[0].c;
    const chatCount = (await pool.query('SELECT COUNT(*) as c FROM chats WHERE username = $1', [username])).rows[0].c;
    const agentCount = (await pool.query("SELECT COUNT(*) as c FROM personas WHERE owner = $1 AND is_system = false", [username])).rows[0].c;

    // User's agents (non-system only)
    const userAgents = (await pool.query(
      "SELECT id, name, role, status, created_at FROM personas WHERE owner = $1 AND is_system = false ORDER BY created_at DESC", [username]
    )).rows as any[];

    // Login history + anomalies
    const loginHistory = await getLoginHistory(username);
    const anomalies = await getLoginAnomalies(username);

    // Funnel stage
    const stage = plan !== 'free' ? 'revenue'
      : projectCount > 0 ? 'activated'
      : lastSeen && (Date.now() / 1000 - lastSeen < 7 * 86400) ? 'acquired'
      : 'at-risk';

    // Recent activity (compact)
    const recentProjects = (await pool.query(
      'SELECT name, status FROM projects WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT 5', [username]
    )).rows as any[];

    // Pending agent tasks for this customer
    let pendingTasks: any[] = [];
    try {
      pendingTasks = (await pool.query(
        "SELECT id, agent_type, action_type, status, priority, payload, created_at FROM admin_agent_tasks WHERE target_username = $1 AND status IN ('queued', 'running') ORDER BY priority DESC", [username]
      )).rows as any[];
    } catch {}

    // Billing history
    let billingHistory: any[] = [];
    try {
      billingHistory = (await pool.query(
        'SELECT id, event_type, payload, created_at FROM billing_events WHERE username = $1 ORDER BY created_at DESC LIMIT 50', [username]
      )).rows as any[];
    } catch {}

    // Total users for pre-launch check
    const totalUsers = (await pool.query('SELECT COUNT(*) as c FROM users')).rows[0].c;

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
      subscription: subscription ? {
        plan: subscription.plan,
        status: subscription.status,
        trialEndsAt: subscription.trial_ends_at,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAt: subscription.cancel_at,
        pausedAt: subscription.paused_at,
        createdAt: subscription.created_at,
      } : null,
      billingHistory: billingHistory.map(e => ({
        id: e.id,
        eventType: e.event_type,
        payload: JSON.parse(e.payload || '{}'),
        createdAt: e.created_at,
      })),
      preLaunch: totalUsers < 100,
      totalUsers,
      loginHistory: loginHistory.slice(0, 20),
      anomalies,
      recentProjects,
      pendingTasks,
      userAgents,
    });
  });

  // PUT /api/admin/users/:username/role — kept for internal /team use
  fastify.put<{ Params: { username: string }; Body: { role: string } }>('/:username/role', async (request, reply) => {
    const { username } = request.params;
    const { role } = request.body as { role: string };
    const validRoles = ['operator', 'admin', 'platform_admin'];
    if (!validRoles.includes(role)) return reply.code(400).send(err('INVALID_ROLE', `Must be: ${validRoles.join(', ')}`));
    const userRows = await db.select().from(schema.users).where(eq(schema.users.username, username));
    if (userRows.length === 0) return reply.code(404).send(err('NOT_FOUND', 'User not found'));
    await db.update(schema.users).set({ role }).where(eq(schema.users.username, username));
    return ok({ username, role });
  });

  // POST /api/admin/users/:username/purge-sessions
  fastify.post<{ Params: { username: string } }>('/:username/purge-sessions', async (request, reply) => {
    const { username } = request.params;
    const result = await pool.query('DELETE FROM sessions WHERE username = $1', [username]);
    return ok({ purged: result.rowCount });
  });

  // PUT /api/admin/users/:username/suspend
  fastify.put<{ Params: { username: string }; Body: { reason?: string } }>('/:username/suspend', async (request, reply) => {
    const { username } = request.params;
    const { reason } = (request.body ?? {}) as { reason?: string };

    const user = (await pool.query('SELECT username FROM users WHERE username = $1', [username])).rows[0] as any;
    if (!user) return reply.code(404).send(err('NOT_FOUND', 'User not found'));

    if (username === request.sessionUser?.username) {
      return reply.code(400).send(err('SELF_SUSPEND', 'Cannot suspend yourself'));
    }

    const now = Date.now() / 1000;
    await pool.query('UPDATE users SET suspended_at = $1, suspension_reason = $2 WHERE username = $3',
      [now, reason ?? null, username]);

    // Purge all sessions
    await pool.query('DELETE FROM sessions WHERE username = $1', [username]);

    return ok({ username, suspended_at: now, reason: reason ?? null });
  });

  // PUT /api/admin/users/:username/unsuspend
  fastify.put<{ Params: { username: string } }>('/:username/unsuspend', async (request, reply) => {
    const { username } = request.params;

    const user = (await pool.query('SELECT username FROM users WHERE username = $1', [username])).rows[0] as any;
    if (!user) return reply.code(404).send(err('NOT_FOUND', 'User not found'));

    await pool.query('UPDATE users SET suspended_at = NULL, suspension_reason = NULL WHERE username = $1',
      [username]);

    return ok({ username, unsuspended: true });
  });

  // PUT /api/admin/users/:username/subscription — manage plan + billing status
  fastify.put<{ Params: { username: string }; Body: { plan?: string; status?: string; lifetime_free?: boolean; trial_days?: number } }>('/:username/subscription', async (request, reply) => {
    const { username } = request.params;
    const body = request.body as { plan?: string; status?: string; lifetime_free?: boolean; trial_days?: number };

    const user = (await pool.query('SELECT username FROM users WHERE username = $1', [username])).rows[0] as any;
    if (!user) return reply.code(404).send(err('NOT_FOUND', 'User not found'));

    // Handle lifetime_free flag on user record
    if (body.lifetime_free !== undefined) {
      await pool.query('UPDATE users SET lifetime_free = $1 WHERE username = $2',
        [body.lifetime_free ? 1 : 0, username]);
    }

    // Upsert subscription
    const existing = (await pool.query('SELECT id FROM subscriptions WHERE username = $1', [username])).rows[0] as any;

    if (existing) {
      const sets: string[] = [];
      const vals: (string | number | null)[] = [];
      let paramIdx = 1;

      if (body.plan && (VALID_PLANS as readonly string[]).includes(body.plan)) {
        sets.push(`plan = $${paramIdx++}`);
        vals.push(body.plan);
      }
      if (body.status && (VALID_SUB_STATUSES as readonly string[]).includes(body.status)) {
        sets.push(`status = $${paramIdx++}`);
        vals.push(body.status);
        if (body.status === 'cancelled') {
          sets.push(`cancelled_at = $${paramIdx++}`);
          vals.push(Date.now() / 1000);
        }
        if (body.status === 'paused') {
          sets.push(`paused_at = $${paramIdx++}`);
          vals.push(Date.now() / 1000);
        }
      }
      if (body.trial_days && body.trial_days > 0) {
        sets.push(`status = $${paramIdx++}`);
        vals.push('trialing');
        sets.push(`trial_ends_at = $${paramIdx++}`);
        vals.push(Date.now() / 1000 + body.trial_days * 86400);
      }

      if (sets.length > 0) {
        sets.push(`updated_at = $${paramIdx++}`);
        vals.push(Date.now() / 1000);
        vals.push(username);
        await pool.query(`UPDATE subscriptions SET ${sets.join(', ')} WHERE username = $${paramIdx}`, vals);
      }
    } else if (body.plan || body.trial_days) {
      // Create subscription record
      const id = crypto.randomUUID();
      const plan = body.plan && (VALID_PLANS as readonly string[]).includes(body.plan) ? body.plan : 'free';
      const status = body.trial_days ? 'trialing' : 'active';
      const trialEndsAt = body.trial_days ? Date.now() / 1000 + body.trial_days * 86400 : null;

      await pool.query(
        'INSERT INTO subscriptions (id, username, plan, status, trial_ends_at) VALUES ($1, $2, $3, $4, $5)',
        [id, username, plan, status, trialEndsAt]
      );
    }

    // Log billing event
    try {
      await pool.query(
        "INSERT INTO billing_events (username, event_type, payload, created_at) VALUES ($1, 'admin_plan_change', $2, EXTRACT(EPOCH FROM NOW()))",
        [username, JSON.stringify(body)]
      );
    } catch { /* billing_events may not exist */ }

    return ok({ username, updated: true });
  });

  // GET /api/admin/users/:username/activity — compact activity log
  fastify.get<{ Params: { username: string } }>('/:username/activity', async (request, reply) => {
    const { username } = request.params;

    // Combine logins, project events, chat events, agent events into one timeline
    const events: Array<{ type: string; action: string; detail: string; ts: number }> = [];

    // Login events (customer_events first, fall back to sessions)
    let loginCount = 0;
    try {
      const logins = (await pool.query(
        "SELECT ip_address, country, created_at FROM customer_events WHERE username = $1 AND event_type = 'login' ORDER BY created_at DESC LIMIT 10", [username]
      )).rows as any[];
      loginCount = logins.length;
      for (const l of logins) {
        events.push({ type: 'login', action: 'Logged in', detail: [l.country, l.ip_address].filter(Boolean).join(' · ') || '—', ts: l.created_at });
      }
    } catch {}

    // Fallback: derive login events from sessions if customer_events is empty
    if (loginCount === 0) {
      try {
        const sessions = (await pool.query(
          'SELECT ip_address, created_at FROM sessions WHERE username = $1 ORDER BY created_at DESC LIMIT 10', [username]
        )).rows as any[];
        for (const s of sessions) {
          events.push({ type: 'login', action: 'Session created', detail: s.ip_address || '—', ts: s.created_at });
        }
      } catch {}
    }

    // Project activity
    try {
      const projects = (await pool.query(
        'SELECT name, status, created_at, updated_at FROM projects WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT 10', [username]
      )).rows as any[];
      for (const p of projects) {
        events.push({ type: 'project', action: `Project "${p.name}"`, detail: p.status, ts: p.updated_at || p.created_at });
      }
    } catch {}

    // Agent creation
    try {
      const agents = (await pool.query(
        "SELECT name, status, created_at FROM personas WHERE owner = $1 AND is_system = false ORDER BY created_at DESC LIMIT 10", [username]
      )).rows as any[];
      for (const a of agents) {
        events.push({ type: 'agent', action: `Agent "${a.name}"`, detail: a.status, ts: a.created_at });
      }
    } catch {}

    // Chat activity
    try {
      const chats = (await pool.query(
        'SELECT title, created_at FROM chats WHERE username = $1 ORDER BY created_at DESC LIMIT 10', [username]
      )).rows as any[];
      for (const c of chats) {
        events.push({ type: 'chat', action: 'Chat session', detail: c.title || 'untitled', ts: c.created_at });
      }
    } catch {}

    // Sort by time descending, limit 30
    events.sort((a, b) => b.ts - a.ts);

    return ok({ events: events.slice(0, 30) });
  });
}
