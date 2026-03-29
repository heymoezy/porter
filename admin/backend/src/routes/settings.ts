import { FastifyInstance } from 'fastify';
import { ok, err } from '../lib/envelope.js';
import { getSetting, setSetting } from '../lib/workspace-settings.js';
import { queryOne, execute } from '../db/pg.js';
import { config } from '../config.js';

const VALID_CATEGORIES = ['general', 'features', 'models', 'email', 'security'] as const;

const FEATURE_FLAGS = [
  'feature_agent_scheduling',
  'feature_wizard',
  'feature_event_triggers',
  'feature_ephemeral_agents',
  'feature_sse',
  'feature_billing',
  'feature_external_connections',
] as const;

export default async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/settings — all settings grouped by category
  fastify.get('/', async () => {
    // General
    const totalRow = await queryOne<{ cnt: number }>('SELECT count(*)::int as cnt FROM users');
    const totalUsers = totalRow?.cnt ?? 0;

    const general = {
      workspace_name: (await getSetting('workspace_name')) || 'Porter',
      registration_mode: (await getSetting('registration_mode')) || 'closed',
      default_timezone: (await getSetting('default_timezone')) || 'UTC',
      trial_duration_days: parseInt((await getSetting('trial_duration_days')) || '14', 10),
      pre_launch: totalUsers < 100,
      user_count: totalUsers,
    };

    // Features
    const features: Record<string, boolean> = {};
    for (const flag of FEATURE_FLAGS) {
      const val = await getSetting(flag);
      features[flag] = val === 'true';
    }

    // Models
    const models = {
      ollama_url: (await getSetting('ollama_url')) || config.ollamaUrl,
      ollama_model: (await getSetting('ollama_model')) || 'qwen2.5-coder:1.5b',
      openclaw_url: (await getSetting('openclaw_url')) || config.openclawUrl,
      openclaw_model: (await getSetting('openclaw_model')) || 'openai-codex/gpt-5.4',
      has_openclaw_token: !!(await getSetting('openclaw_token')),
      preferred_model: (await getSetting('preferred_model')) || 'ollama',
    };

    // Email (no secrets)
    const email = {
      smtp_host: (await getSetting('smtp_host')) || config.smtp.host,
      smtp_port: parseInt((await getSetting('smtp_port')) || String(config.smtp.port), 10),
      smtp_user: (await getSetting('smtp_user')) || config.smtp.user,
      has_smtp_pass: !!((await getSetting('smtp_pass')) || config.smtp.pass),
      smtp_from_name: (await getSetting('smtp_from_name')) || config.smtp.fromName,
      smtp_from_email: (await getSetting('smtp_from_email')) || config.smtp.fromEmail,
      smtp_reply_to: (await getSetting('smtp_reply_to')) || config.smtp.replyTo,
    };

    // Security
    const sessRow = await queryOne<{ cnt: number }>(
      `SELECT count(*)::int as cnt FROM sessions WHERE expires > EXTRACT(epoch FROM now())`
    );
    const activeSessions = sessRow?.cnt ?? 0;

    const security = {
      session_ttl_hours: parseInt((await getSetting('session_ttl_hours')) || '72', 10),
      max_sessions_per_user: parseInt((await getSetting('max_sessions_per_user')) || '5', 10),
      min_password_length: parseInt((await getSetting('min_password_length')) || '8', 10),
      active_sessions: activeSessions,
    };

    return ok({ general, features, models, email, security });
  });

  // PUT /api/admin/settings/:category — save one category
  fastify.put<{ Params: { category: string } }>('/:category', async (req, reply) => {
    const { category } = req.params;
    if (!VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
      reply.status(400);
      return err('INVALID_CATEGORY', `Unknown category: ${category}`);
    }

    const body = req.body as Record<string, unknown>;

    if (category === 'general') {
      const fields = ['workspace_name', 'registration_mode', 'default_timezone', 'trial_duration_days'];
      for (const f of fields) {
        if (body[f] !== undefined) await setSetting(f, String(body[f]));
      }
    }

    if (category === 'features') {
      for (const flag of FEATURE_FLAGS) {
        if (body[flag] !== undefined) await setSetting(flag, body[flag] ? 'true' : 'false');
      }
    }

    if (category === 'models') {
      const fields = ['ollama_url', 'ollama_model', 'openclaw_url', 'openclaw_model', 'preferred_model'];
      for (const f of fields) {
        if (body[f] !== undefined && body[f] !== '') await setSetting(f, String(body[f]));
      }
      // Token: empty string = keep existing
      if (body.openclaw_token !== undefined && body.openclaw_token !== '') {
        await setSetting('openclaw_token', String(body.openclaw_token));
      }
    }

    if (category === 'email') {
      const fields = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_from_name', 'smtp_from_email', 'smtp_reply_to'];
      for (const f of fields) {
        if (body[f] !== undefined) await setSetting(f, String(body[f]));
      }
      // Password: empty string = keep existing
      if (body.smtp_pass !== undefined && body.smtp_pass !== '') {
        await setSetting('smtp_pass', String(body.smtp_pass));
      }
    }

    if (category === 'security') {
      const fields = ['session_ttl_hours', 'max_sessions_per_user', 'min_password_length'];
      for (const f of fields) {
        if (body[f] !== undefined) await setSetting(f, String(body[f]));
      }
    }

    return ok({ saved: true, category });
  });

  // POST /api/admin/settings/test-connection/:provider — probe health
  fastify.post<{ Params: { provider: string } }>('/test-connection/:provider', async (req, reply) => {
    const { provider } = req.params;
    const body = req.body as Record<string, string> | undefined;

    let url: string;
    if (provider === 'ollama') {
      url = (body?.url || (await getSetting('ollama_url')) || config.ollamaUrl) + '/api/tags';
    } else if (provider === 'openclaw') {
      url = (body?.url || (await getSetting('openclaw_url')) || config.openclawUrl) + '/health';
    } else {
      reply.status(400);
      return err('INVALID_PROVIDER', `Unknown provider: ${provider}`);
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;
      return ok({ status: res.ok ? 'healthy' : 'down', latencyMs, statusCode: res.status });
    } catch (e) {
      const latencyMs = Date.now() - start;
      return ok({ status: 'down', latencyMs, error: (e as Error).message });
    }
  });

  // POST /api/admin/settings/test-email — send test
  fastify.post('/test-email', async (_req, reply) => {
    const host = (await getSetting('smtp_host')) || config.smtp.host;
    const user = (await getSetting('smtp_user')) || config.smtp.user;
    if (!host || !user) {
      reply.status(400);
      return err('SMTP_NOT_CONFIGURED', 'SMTP host and user must be configured first');
    }
    // For now, record a test email in email_messages table
    try {
      const fromEmail = (await getSetting('smtp_from_email')) || config.smtp.fromEmail || 'porter@askporter.app';
      const fromName = (await getSetting('smtp_from_name')) || config.smtp.fromName || 'Porter';
      await execute(`
        INSERT INTO email_messages (folder, from_email, from_name, to_email, to_name, subject, body, status, sent_at)
        VALUES ('sent', $1, $2, $3, $4, 'Porter Admin Test Email', 'This is a test email sent from Porter Admin Settings.', 'sent', EXTRACT(epoch FROM now()))
      `, [fromEmail, fromName, user, 'Admin']);
      return ok({ sent: true, to: user });
    } catch (e) {
      reply.status(500);
      return err('SEND_FAILED', (e as Error).message);
    }
  });

  // POST /api/admin/settings/force-logout — terminate all sessions except current
  fastify.post('/force-logout', async (req) => {
    const currentToken = req.cookies?.porter_admin_session;
    let terminated = 0;
    if (currentToken) {
      const result = await execute('DELETE FROM sessions WHERE token != $1', [currentToken]);
      terminated = result.rowCount;
    } else {
      const result = await execute('DELETE FROM sessions');
      terminated = result.rowCount;
    }
    return ok({ terminated });
  });
}
