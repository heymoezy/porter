import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db, sqlite } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { ok, err } from '../../lib/envelope.js';
import { z } from 'zod';
import crypto from 'crypto';
import { promisify } from 'util';
import {
  createAuthToken, verifyAuthToken,
  sendVerificationCode, sendPasswordResetCode,
} from '../../services/transactional-email.js';

const scrypt = promisify(crypto.scrypt);

// ── Schemas ──────────────────────────────────────────────────────────────────

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerBodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8),
});

const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  password: z.string().min(8),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 30);
}

function generateUsername(name: string): string {
  const base = slugify(name);
  if (!base) return `user-${crypto.randomBytes(3).toString('hex')}`;

  // Check if base username is available
  const existing = sqlite.prepare('SELECT 1 FROM users WHERE username = ?').get(base);
  if (!existing) return base;

  // Append incrementing number
  for (let i = 2; i <= 100; i++) {
    const candidate = `${base}-${i}`;
    const exists = sqlite.prepare('SELECT 1 FROM users WHERE username = ?').get(candidate);
    if (!exists) return candidate;
  }

  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 32)) as Buffer;
  return { hash: derived.toString('hex'), salt };
}

async function verifyPassword(password: string, storedHash: string, storedSalt: string): Promise<boolean> {
  const derived = (await scrypt(password, storedSalt, 32)) as Buffer;
  return derived.toString('hex') === storedHash;
}

function createSession(username: string, request: { ip: string; headers: Record<string, string | string[] | undefined> }): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = (Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days

  db.insert(schema.sessions).values({
    token,
    username,
    expires,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] as string | undefined,
  }).run();

  return token;
}

function setSessionCookie(reply: any, token: string) {
  reply.setCookie('porter_session', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60,
  });
}

function trackLogin(username: string, ip: string) {
  try {
    sqlite.prepare(`
      INSERT INTO customer_events (username, event_type, ip_address, created_at)
      VALUES (?, 'login', ?, unixepoch('now'))
    `).run(username, ip);
  } catch { /* customer_events table may not exist yet */ }

  // Update last_ip on user record
  try {
    sqlite.prepare('UPDATE users SET last_ip = ? WHERE username = ?').run(ip, username);
  } catch { /* last_ip column may not exist yet */ }

  // Async IP→country resolution (fire-and-forget, non-blocking)
  if (ip && ip !== '127.0.0.1' && ip !== '::1' && ip !== '0.0.0.0') {
    resolveCountry(ip, username).catch(() => {});
  }
}

async function resolveCountry(ip: string, username: string) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://api.country.is/${ip}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return;
    const data = await res.json() as { country?: string };
    if (data.country) {
      try {
        sqlite.prepare('UPDATE users SET country = ? WHERE username = ? AND (country IS NULL OR country = ?)').run(data.country, username, '');
      } catch { /* ignore */ }
      // Also tag the latest login event with country
      try {
        sqlite.prepare(
          "UPDATE customer_events SET country = ? WHERE username = ? AND event_type = 'login' AND country IS NULL ORDER BY created_at DESC LIMIT 1"
        ).run(data.country, username);
      } catch { /* ignore */ }
    }
  } catch { /* geo failure must never break login */ }
}

// ── Routes ───────────────────────────────────────────────────────────────────

export default async function authV1Routes(fastify: FastifyInstance, _options: FastifyPluginOptions) {

  // POST /api/v1/auth/register
  fastify.post('/register', async (request, reply) => {
    const parsed = registerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', 'Valid email, name, and password (8+ chars) required'));
    }

    const { email, name, password } = parsed.data;
    const emailLower = email.toLowerCase().trim();

    // Check if email already registered
    const existingUser = sqlite.prepare('SELECT username, email_verified FROM users WHERE email = ?').get(emailLower) as
      { username: string; email_verified: number } | undefined;

    if (existingUser) {
      if (existingUser.email_verified) {
        return reply.code(409).send(err('EMAIL_EXISTS', 'An account with this email already exists'));
      }
      // Unverified account — resend code
      const code = createAuthToken(emailLower, 'verify_email');
      await sendVerificationCode(emailLower, code);
      return reply.send(ok({ message: 'Verification code sent', email: emailLower }));
    }

    // Generate username from name
    const username = generateUsername(name);

    // Hash password
    const { hash, salt } = await hashPassword(password);

    // Create user
    sqlite.prepare(`
      INSERT INTO users (username, display_name, full_name, email, password_hash, salt, role, email_verified, status)
      VALUES (?, ?, ?, ?, ?, ?, 'operator', 0, 'pending')
    `).run(username, name, name, emailLower, hash, salt);

    // Create free subscription
    try {
      sqlite.prepare(`
        INSERT INTO subscriptions (id, username, plan, status)
        VALUES (?, ?, 'free', 'active')
      `).run(crypto.randomUUID(), username);
    } catch { /* subscriptions table may not exist */ }

    // Generate and send verification code
    const code = createAuthToken(emailLower, 'verify_email');
    await sendVerificationCode(emailLower, code);

    return reply.send(ok({ message: 'Verification code sent', email: emailLower }));
  });

  // POST /api/v1/auth/verify-email
  fastify.post('/verify-email', async (request, reply) => {
    const parsed = verifyEmailSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', 'Email and 6-digit code required'));
    }

    const { email, code } = parsed.data;
    const emailLower = email.toLowerCase().trim();

    const valid = verifyAuthToken(emailLower, code, 'verify_email');
    if (!valid) {
      return reply.code(400).send(err('INVALID_CODE', 'Invalid or expired verification code'));
    }

    // Mark user as verified + active
    sqlite.prepare(`
      UPDATE users SET email_verified = 1, status = 'active'
      WHERE email = ?
    `).run(emailLower);

    // Get user for session creation
    const user = sqlite.prepare('SELECT username, display_name FROM users WHERE email = ?').get(emailLower) as
      { username: string; display_name: string | null } | undefined;

    if (!user) {
      return reply.code(404).send(err('NOT_FOUND', 'User not found'));
    }

    // Auto-login: create session
    const token = createSession(user.username, request as any);
    setSessionCookie(reply, token);
    trackLogin(user.username, request.ip);

    return reply.send(ok({
      username: user.username,
      displayName: user.display_name ?? user.username,
      verified: true,
    }));
  });

  // POST /api/v1/auth/resend-code
  fastify.post('/resend-code', async (request, reply) => {
    const body = request.body as { email?: string };
    const email = body.email?.toLowerCase().trim();

    if (!email) {
      return reply.code(400).send(err('INVALID_INPUT', 'Email required'));
    }

    const user = sqlite.prepare('SELECT email_verified FROM users WHERE email = ?').get(email) as
      { email_verified: number } | undefined;

    if (!user || user.email_verified) {
      // Always return success to prevent email enumeration
      return reply.send(ok({ sent: true }));
    }

    const code = createAuthToken(email, 'verify_email');
    await sendVerificationCode(email, code);

    return reply.send(ok({ sent: true }));
  });

  // POST /api/v1/auth/login — email-based
  fastify.post('/login', async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', 'Email and password are required'));
    }

    const { email, password } = parsed.data;
    const emailLower = email.toLowerCase().trim();

    // Lookup by email — only product users (non-admin roles)
    const user = sqlite.prepare(
      "SELECT username, display_name, password_hash, salt, email_verified, status, role FROM users WHERE email = ? AND role NOT IN ('platform_admin', 'admin')"
    ).get(emailLower) as {
      username: string; display_name: string | null;
      password_hash: string; salt: string;
      email_verified: number; status: string; role: string;
    } | undefined;

    if (!user) {
      return reply.code(401).send(err('INVALID_CREDENTIALS', 'Invalid email or password'));
    }

    const valid = await verifyPassword(password, user.password_hash, user.salt);
    if (!valid) {
      return reply.code(401).send(err('INVALID_CREDENTIALS', 'Invalid email or password'));
    }

    // Check email verification
    if (!user.email_verified) {
      // Send a fresh code so they can verify
      const code = createAuthToken(emailLower, 'verify_email');
      await sendVerificationCode(emailLower, code);
      return reply.code(403).send(err('EMAIL_NOT_VERIFIED', 'Please verify your email. A new code has been sent.'));
    }

    // Reuse existing valid session if cookie present
    const existingToken = request.cookies?.porter_session;
    if (existingToken) {
      const existing = db.select().from(schema.sessions)
        .where(eq(schema.sessions.token, existingToken)).get();
      if (existing && existing.expires! > Date.now() / 1000 && existing.username === user.username) {
        return reply.send(ok({ username: user.username, displayName: user.display_name ?? user.username }));
      }
    }

    // Clean expired sessions
    sqlite.prepare("DELETE FROM sessions WHERE username = ? AND expires <= unixepoch('now')").run(user.username);

    const token = createSession(user.username, request as any);
    setSessionCookie(reply, token);
    trackLogin(user.username, request.ip);

    return reply.send(ok({ username: user.username, displayName: user.display_name ?? user.username }));
  });

  // POST /api/v1/auth/logout
  fastify.post('/logout', async (request, reply) => {
    const token = request.cookies?.porter_session;
    if (token) {
      db.delete(schema.sessions).where(eq(schema.sessions.token, token)).run();
    }
    reply.clearCookie('porter_session', { path: '/' });
    return reply.send(ok({ loggedOut: true }));
  });

  // GET /api/v1/auth/me
  fastify.get('/me', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const sessionUser = request.sessionUser!;

    const user = db.select().from(schema.users)
      .where(eq(schema.users.username, sessionUser.username)).get();

    // avatar_url stores JSON appearance spec
    let avatarUrl: string | null = null;
    try {
      const row = sqlite.prepare('SELECT avatar_url FROM users WHERE username = ?').get(sessionUser.username) as any;
      avatarUrl = row?.avatar_url ?? null;
    } catch {}

    return reply.send(ok({
      username: sessionUser.username,
      displayName: sessionUser.displayName ?? sessionUser.username,
      fullName: user?.fullName ?? null,
      role: sessionUser.role,
      email: user?.email ?? null,
      emailVerified: user?.emailVerified ?? 0,
      avatarUrl,
    }));
  });

  // POST /api/v1/auth/change-password
  fastify.post('/change-password', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const body = request.body as { new_password?: string };
    const newPw = body.new_password ?? '';

    if (newPw.length < 8) {
      return reply.code(400).send(err('INVALID_INPUT', 'New password must be at least 8 characters'));
    }

    const username = request.sessionUser!.username;

    const { hash, salt } = await hashPassword(newPw);

    db.update(schema.users).set({
      passwordHash: hash,
      salt,
    }).where(eq(schema.users.username, username)).run();

    return reply.send(ok({ changed: true }));
  });

  // POST /api/v1/auth/forgot-password
  fastify.post('/forgot-password', async (request, reply) => {
    const parsed = forgotPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', 'Valid email required'));
    }

    const emailLower = parsed.data.email.toLowerCase().trim();

    // Always return success to prevent email enumeration
    const user = sqlite.prepare('SELECT username FROM users WHERE email = ?').get(emailLower) as
      { username: string } | undefined;

    if (user) {
      const code = createAuthToken(emailLower, 'reset_password');
      await sendPasswordResetCode(emailLower, code);
    }

    return reply.send(ok({ sent: true }));
  });

  // POST /api/v1/auth/reset-password
  fastify.post('/reset-password', async (request, reply) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', 'Email, 6-digit code, and new password (8+ chars) required'));
    }

    const { email, code, password } = parsed.data;
    const emailLower = email.toLowerCase().trim();

    const valid = verifyAuthToken(emailLower, code, 'reset_password');
    if (!valid) {
      return reply.code(400).send(err('INVALID_CODE', 'Invalid or expired reset code'));
    }

    const { hash, salt } = await hashPassword(password);

    const result = sqlite.prepare(`
      UPDATE users SET password_hash = ?, salt = ?
      WHERE email = ?
    `).run(hash, salt, emailLower);

    if (result.changes === 0) {
      return reply.code(404).send(err('NOT_FOUND', 'User not found'));
    }

    return reply.send(ok({ reset: true }));
  });
}
