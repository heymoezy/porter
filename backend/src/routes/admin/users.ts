import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { ok, err } from '../../lib/admin-envelope.js';
import { pool as brain } from '../../db/client.js';
import { queryOne, queryAll, execute } from '../../db/pg-helpers.js';
import {
  computeScores, getLoginHistory, getLoginAnomalies,
} from '../../services/admin/customer-intel.js';

// Valid subscription plans and statuses
const VALID_PLANS = ['free', 'cloud', 'cloud_team', 'enterprise'] as const;
const VALID_SUB_STATUSES = ['trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired'] as const;

export default async function usersRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/users — ALL users from Brain PG (single source of truth)
  fastify.get('/', async () => {
    // Read from Brain PostgreSQL — one truth
    const { rows } = await brain.query(`
      SELECT
        u.username, u.display_name, u.full_name, u.email, u.role, u.created_at,
        COALESCE(u.email_verified, 0) as email_verified,
        COALESCE(u.lifetime_free, 0) as lifetime_free,
        u.suspended_at,
        COALESCE(u.pipeline_stage, 'acquired') as pipeline_stage,
        COALESCE(s.plan, 'free') as plan, COALESCE(s.status, 'none') as sub_status,
        s.trial_ends_at,
        (SELECT COUNT(*) FROM sessions ss WHERE ss.username = u.username AND ss.expires > EXTRACT(EPOCH FROM NOW())) as active_sessions,
        (SELECT MAX(ss.last_seen_at) FROM sessions ss WHERE ss.username = u.username) as last_seen_at,
        (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.username) as project_count,
        (SELECT COUNT(*) FROM personas pe WHERE pe.owner = u.username AND COALESCE(pe.is_system, 0) = 0) as agent_count,
        (SELECT COUNT(*) FROM chats WHERE username = u.username) as chat_count,
        COALESCE(
          ARRAY(SELECT tag FROM customer_tags WHERE username = u.username ORDER BY tag ASC),
          ARRAY[]::TEXT[]
        ) as tags
      FROM users u
      LEFT JOIN subscriptions s ON s.username = u.username
      WHERE u.username != 'system'
      ORDER BY u.created_at DESC
    `);

    // Compute scores (async from customer-intel PG)
    const customers = await Promise.all(rows.map(async (r: any) => {
      let scores: Record<string, unknown> = {};
      try { scores = (await computeScores(r.username)) ?? {}; } catch {}
      return { ...r, ...scores };
    }));

    const total = customers.length;
    const paying = customers.filter((c: any) => c.plan !== 'free' && c.sub_status === 'active').length;
    const trialing = customers.filter((c: any) => c.sub_status === 'trialing').length;
    const suspended = customers.filter((c: any) => c.suspended_at).length;
    const staff = customers.filter((c: any) => c.role === 'platform_admin' || c.role === 'admin').length;

    return ok({
      customers,
      stats: {
        total,
        paying,
        trialing,
        free: total - paying - trialing - staff,
        suspended,
        staff,
        preLaunch: total < 100,
        totalAllUsers: total,
      },
    });
  });

  // GET /api/admin/users/team — platform admins and internal staff
  fastify.get('/team', async () => {
    const { rows } = await brain.query(`
      SELECT
        u.username, u.display_name, u.email, u.role, u.created_at,
        (SELECT COUNT(*) FROM sessions ss WHERE ss.username = u.username AND ss.expires > EXTRACT(EPOCH FROM NOW())) as active_sessions,
        (SELECT MAX(ss.last_seen_at) FROM sessions ss WHERE ss.username = u.username) as last_seen_at,
        (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.username) as project_count,
        (SELECT COUNT(*) FROM personas pe WHERE pe.owner = u.username AND COALESCE(pe.is_system, 0) = 0) as agent_count
      FROM users u
      WHERE u.role IN ('platform_admin', 'admin')
      ORDER BY u.role DESC, u.username
    `);

    return ok({ team: rows });
  });

  // GET /api/admin/users/:username — full revenue cockpit (reads from Brain PG)
  fastify.get<{ Params: { username: string } }>('/:username', async (request, reply) => {
    const { username } = request.params;

    // Core user data from Brain PG (single source of truth)
    const userResult = await brain.query(
      `SELECT username, display_name, full_name, email, role, created_at, country, city, timezone, company, job_title, phone, bio, social_x, social_linkedin, social_github, avatar_url, language, email_verified, suspended_at, suspension_reason, terms_accepted_at, last_ip, signup_source, COALESCE(lifetime_free, 0) as lifetime_free FROM users WHERE username = $1`,
      [username]
    );
    const user = userResult.rows[0];
    if (!user) return reply.code(404).send(err('NOT_FOUND', 'User not found'));

    // Scores from customer-intel PG (async)
    let scores: any = {};
    try { scores = await computeScores(username); } catch {}

    // Subscription from Brain PG
    let subscription: any = null;
    try {
      const subResult = await brain.query('SELECT * FROM subscriptions WHERE username = $1', [username]);
      subscription = subResult.rows[0] ?? null;
    } catch {}

    const plan = subscription?.plan ?? 'free';
    const subStatus = subscription?.status ?? 'none';
    const trialEndsAt = subscription?.trial_ends_at ?? null;

    // Session/activity stats from Brain PG
    const lastSeen = (await brain.query('SELECT MAX(last_seen_at) as t FROM sessions WHERE username = $1', [username])).rows[0]?.t;
    const activeSessions = parseInt((await brain.query("SELECT COUNT(*) as c FROM sessions WHERE username = $1 AND expires > EXTRACT(EPOCH FROM NOW())", [username])).rows[0]?.c ?? '0');
    const uniqueIps = parseInt((await brain.query('SELECT COUNT(DISTINCT ip_address) as c FROM sessions WHERE username = $1', [username])).rows[0]?.c ?? '0');
    const projectCount = parseInt((await brain.query('SELECT COUNT(*) as c FROM projects WHERE owner_id = $1', [username])).rows[0]?.c ?? '0');
    const chatCount = parseInt((await brain.query('SELECT COUNT(*) as c FROM chats WHERE username = $1', [username])).rows[0]?.c ?? '0');
    const agentCount = parseInt((await brain.query("SELECT COUNT(*) as c FROM personas WHERE owner = $1 AND COALESCE(is_system, 0) = 0", [username])).rows[0]?.c ?? '0');

    // User's agents from Brain PG
    const userAgents = (await brain.query(
      "SELECT id, name, role, status, created_at FROM personas WHERE owner = $1 AND COALESCE(is_system, 0) = 0 ORDER BY created_at DESC",
      [username]
    )).rows;

    // Login history + anomalies (async from customer-intel PG)
    let loginHistory: any[] = [];
    let anomalies: any[] = [];
    try { loginHistory = await getLoginHistory(username); } catch {}
    try { anomalies = await getLoginAnomalies(username); } catch {}

    // Funnel stage
    const stage = plan !== 'free' ? 'revenue'
      : projectCount > 0 ? 'activated'
      : lastSeen && (Date.now() / 1000 - lastSeen < 7 * 86400) ? 'acquired'
      : 'at-risk';

    // Recent projects from Brain PG
    const recentProjects = (await brain.query(
      'SELECT name, status FROM projects WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT 5',
      [username]
    )).rows;

    // Pending agent tasks (PG)
    let pendingTasks: any[] = [];
    try {
      pendingTasks = await queryAll(
        "SELECT id, agent_type, action_type, status, priority, payload, created_at FROM admin_agent_tasks WHERE target_username = $1 AND status IN ('queued', 'running') ORDER BY priority DESC",
        [username]
      );
    } catch {}

    // Billing history (PG)
    let billingHistory: any[] = [];
    try {
      billingHistory = await queryAll(
        'SELECT id, event_type, payload, created_at FROM billing_events WHERE username = $1 ORDER BY created_at DESC LIMIT 50',
        [username]
      );
    } catch {}

    // Total users from Brain PG
    const totalUsers = parseInt((await brain.query('SELECT COUNT(*) as c FROM users')).rows[0]?.c ?? '0');

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
        payload: e.payload ?? {},
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
    const user = await queryOne('SELECT username FROM users WHERE username = $1', [username]);
    if (!user) return reply.code(404).send(err('NOT_FOUND', 'User not found'));
    await execute('UPDATE users SET role = $1 WHERE username = $2', [role, username]);
    return ok({ username, role });
  });

  // POST /api/admin/users/:username/purge-sessions
  fastify.post<{ Params: { username: string } }>('/:username/purge-sessions', async (request, reply) => {
    const { username } = request.params;
    const result = await execute('DELETE FROM sessions WHERE username = $1', [username]);
    return ok({ purged: result.rowCount });
  });

  // PUT /api/admin/users/:username/suspend
  fastify.put<{ Params: { username: string }; Body: { reason?: string } }>('/:username/suspend', async (request, reply) => {
    const { username } = request.params;
    const { reason } = (request.body ?? {}) as { reason?: string };

    const user = await queryOne('SELECT username FROM users WHERE username = $1', [username]);
    if (!user) return reply.code(404).send(err('NOT_FOUND', 'User not found'));

    if (username === request.sessionUser?.username) {
      return reply.code(400).send(err('SELF_SUSPEND', 'Cannot suspend yourself'));
    }

    const now = Date.now() / 1000;
    await execute('UPDATE users SET suspended_at = $1, suspension_reason = $2 WHERE username = $3', [now, reason ?? null, username]);

    // Purge all sessions
    await execute('DELETE FROM sessions WHERE username = $1', [username]);

    return ok({ username, suspended_at: now, reason: reason ?? null });
  });

  // PUT /api/admin/users/:username/unsuspend
  fastify.put<{ Params: { username: string } }>('/:username/unsuspend', async (request, reply) => {
    const { username } = request.params;

    const user = await queryOne('SELECT username FROM users WHERE username = $1', [username]);
    if (!user) return reply.code(404).send(err('NOT_FOUND', 'User not found'));

    await execute('UPDATE users SET suspended_at = NULL, suspension_reason = NULL WHERE username = $1', [username]);

    return ok({ username, unsuspended: true });
  });

  // PUT /api/admin/users/:username/subscription — manage plan + billing status
  fastify.put<{ Params: { username: string }; Body: { plan?: string; status?: string; lifetime_free?: boolean; trial_days?: number } }>('/:username/subscription', async (request, reply) => {
    const { username } = request.params;
    const body = request.body as { plan?: string; status?: string; lifetime_free?: boolean; trial_days?: number };

    const user = await queryOne('SELECT username FROM users WHERE username = $1', [username]);
    if (!user) return reply.code(404).send(err('NOT_FOUND', 'User not found'));

    // Handle lifetime_free flag on user record
    if (body.lifetime_free !== undefined) {
      await execute('UPDATE users SET lifetime_free = $1 WHERE username = $2', [body.lifetime_free ? 1 : 0, username]);
    }

    // Upsert subscription
    const existing = await queryOne('SELECT id FROM subscriptions WHERE username = $1', [username]);

    if (existing) {
      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (body.plan && (VALID_PLANS as readonly string[]).includes(body.plan)) {
        sets.push(`plan = $${idx++}`);
        params.push(body.plan);
      }
      if (body.status && (VALID_SUB_STATUSES as readonly string[]).includes(body.status)) {
        sets.push(`status = $${idx++}`);
        params.push(body.status);
        if (body.status === 'cancelled') {
          sets.push(`cancelled_at = $${idx++}`);
          params.push(Date.now() / 1000);
        }
        if (body.status === 'paused') {
          sets.push(`paused_at = $${idx++}`);
          params.push(Date.now() / 1000);
        }
      }
      if (body.trial_days && body.trial_days > 0) {
        sets.push(`status = $${idx++}, trial_ends_at = $${idx++}`);
        params.push('trialing', Date.now() / 1000 + body.trial_days * 86400);
      }

      if (sets.length > 0) {
        sets.push(`updated_at = $${idx++}`);
        params.push(Date.now() / 1000);
        params.push(username);
        await execute(`UPDATE subscriptions SET ${sets.join(', ')} WHERE username = $${idx}`, params);
      }
    } else if (body.plan || body.trial_days) {
      // Create subscription record
      const id = crypto.randomUUID();
      const plan = body.plan && (VALID_PLANS as readonly string[]).includes(body.plan) ? body.plan : 'free';
      const status = body.trial_days ? 'trialing' : 'active';
      const trialEndsAt = body.trial_days ? Date.now() / 1000 + body.trial_days * 86400 : null;

      await execute(
        'INSERT INTO subscriptions (id, username, plan, status, trial_ends_at) VALUES ($1, $2, $3, $4, $5)',
        [id, username, plan, status, trialEndsAt]
      );
    }

    // Log billing event
    try {
      await execute(
        "INSERT INTO billing_events (username, event_type, payload, created_at) VALUES ($1, 'admin_plan_change', $2, EXTRACT(epoch FROM now()))",
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
      const logins = await queryAll(
        "SELECT ip_address, country, created_at FROM customer_events WHERE username = $1 AND event_type = 'login' ORDER BY created_at DESC LIMIT 10",
        [username]
      );
      loginCount = logins.length;
      for (const l of logins) {
        events.push({ type: 'login', action: 'Logged in', detail: [l.country, l.ip_address].filter(Boolean).join(' · ') || '—', ts: l.created_at });
      }
    } catch {}

    // Fallback: derive login events from sessions if customer_events is empty
    if (loginCount === 0) {
      try {
        const sessions = await queryAll(
          'SELECT ip_address, created_at FROM sessions WHERE username = $1 ORDER BY created_at DESC LIMIT 10',
          [username]
        );
        for (const s of sessions) {
          events.push({ type: 'login', action: 'Session created', detail: s.ip_address || '—', ts: s.created_at });
        }
      } catch {}
    }

    // Project activity
    try {
      const projects = await queryAll(
        'SELECT name, status, created_at, updated_at FROM projects WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT 10',
        [username]
      );
      for (const p of projects) {
        events.push({ type: 'project', action: `Project "${p.name}"`, detail: p.status, ts: p.updated_at || p.created_at });
      }
    } catch {}

    // Agent creation
    try {
      const agents = await queryAll(
        "SELECT name, status, created_at FROM personas WHERE owner = $1 AND is_system = 0 ORDER BY created_at DESC LIMIT 10",
        [username]
      );
      for (const a of agents) {
        events.push({ type: 'agent', action: `Agent "${a.name}"`, detail: a.status, ts: a.created_at });
      }
    } catch {}

    // Chat activity
    try {
      const chats = await queryAll(
        'SELECT title, created_at FROM chats WHERE username = $1 ORDER BY created_at DESC LIMIT 10',
        [username]
      );
      for (const c of chats) {
        events.push({ type: 'chat', action: 'Chat session', detail: c.title || 'untitled', ts: c.created_at });
      }
    } catch {}

    // Sort by time descending, limit 30
    events.sort((a, b) => b.ts - a.ts);

    return ok({ events: events.slice(0, 30) });
  });
}
