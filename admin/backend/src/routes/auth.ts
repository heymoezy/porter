import { FastifyInstance } from 'fastify';
import { queryOne, execute } from '../db/pg.js';
import { ok, err } from '../lib/envelope.js';
import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);

interface UserRow {
  username: string;
  email: string | null;
  password_hash: string;
  salt: string;
  role: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /api/v1/auth/login
  fastify.post('/login', async (request, reply) => {
    const { email, username, password } = request.body as { email?: string; username?: string; password?: string };
    const loginId = email || username;
    if (!loginId || !password) {
      return reply.code(400).send(err('INVALID_INPUT', 'Email and password are required'));
    }

    // Look up by email first, fall back to username
    let user = email
      ? await queryOne<UserRow>('SELECT username, email, password_hash, salt, role, display_name FROM users WHERE email = $1', [email])
      : null;
    if (!user) {
      user = await queryOne<UserRow>('SELECT username, email, password_hash, salt, role, display_name FROM users WHERE username = $1', [loginId]);
    }
    if (!user) {
      return reply.code(401).send(err('INVALID_CREDENTIALS', 'Invalid credentials'));
    }

    const hash = (await scrypt(password, user.salt, 32)) as Buffer;
    if (hash.toString('hex') !== user.password_hash) {
      return reply.code(401).send(err('INVALID_CREDENTIALS', 'Invalid credentials'));
    }

    // Clean up: delete expired sessions, then cap at 5 concurrent (allow multi-device)
    await execute('DELETE FROM sessions WHERE username = $1 AND expires <= $2', [user.username, Date.now() / 1000]);
    const countRow = await queryOne<{ c: string }>('SELECT COUNT(*) as c FROM sessions WHERE username = $1', [user.username]);
    const activeSessions = parseInt(countRow?.c ?? '0', 10);
    if (activeSessions >= 5) {
      // Keep 4 most recent, make room for new one
      await execute(`DELETE FROM sessions WHERE username = $1 AND token NOT IN (
        SELECT token FROM sessions WHERE username = $1 ORDER BY created_at DESC LIMIT 4
      )`, [user.username]);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = (Date.now() / 1000) + (24 * 60 * 60); // 24h, not 30d

    await execute(
      'INSERT INTO sessions (token, username, expires, ip_address, user_agent, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [token, user.username, expires, request.ip, request.headers['user-agent'] ?? null, Date.now() / 1000]
    );

    // Track login event
    try {
      await execute(
        'INSERT INTO customer_events (username, event_type, ip_address, created_at) VALUES ($1, $2, $3, EXTRACT(epoch FROM now()))',
        [user.username, 'login', request.ip]
      );
    } catch { /* table may not exist */ }

    reply.setCookie('porter_admin_session', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60, // 24h
    });

    return reply.send(ok({ username: user.username, displayName: user.display_name ?? user.username }));
  });

  // POST /api/v1/auth/logout
  fastify.post('/logout', async (request, reply) => {
    const token = request.cookies?.porter_admin_session;
    if (token) {
      try {
        await execute('DELETE FROM sessions WHERE token = $1', [token]);
      } catch { /* ignore */ }
    }
    reply.clearCookie('porter_admin_session', { path: '/' });
    return reply.send(ok({ loggedOut: true }));
  });

  // GET /api/v1/auth/me
  fastify.get('/me', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const sessionUser = request.sessionUser!;
    const user = await queryOne<{ email: string | null }>(
      'SELECT email FROM users WHERE username = $1', [sessionUser.username]
    );

    // avatar_url stores JSON appearance spec
    let avatarUrl: string | null = null;
    try {
      const row = await queryOne<{ avatar_url: string | null }>(
        'SELECT avatar_url FROM users WHERE username = $1', [sessionUser.username]
      );
      avatarUrl = row?.avatar_url ?? null;
    } catch {}

    return reply.send(ok({
      username: sessionUser.username,
      displayName: sessionUser.displayName ?? sessionUser.username,
      role: sessionUser.role,
      email: user?.email ?? null,
      avatarUrl,
    }));
  });

  // POST /api/v1/auth/update-avatar -- save avatar spec
  fastify.post('/update-avatar', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const body = request.body as { avatar_url?: string };
    if (!body?.avatar_url) return reply.code(400).send(err('INVALID_INPUT', 'avatar_url required'));
    try {
      await execute('UPDATE users SET avatar_url = $1 WHERE username = $2', [body.avatar_url, request.sessionUser!.username]);
    } catch {}
    return reply.send(ok({ saved: true }));
  });
}
