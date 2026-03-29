/**
 * Admin Auth Plugin — scoped to admin routes only.
 *
 * Reads the porter_admin_session cookie and provides requirePlatformAdmin.
 * Registered ONLY within the /api/admin prefix so it doesn't collide
 * with Brain's main auth plugin (which uses porter_session cookie).
 */
import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { queryOne } from '../db/pg-helpers.js';
import crypto from 'crypto';

declare module 'fastify' {
  interface FastifyInstance {
    requirePlatformAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function adminAuthPlugin(fastify: FastifyInstance) {
  // Resolve session from admin cookie on every request within this scope
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    // Skip if Brain's auth plugin already resolved the session
    if (request.sessionUser) return;

    const token = request.cookies?.porter_admin_session;
    if (!token) return;

    const session = await queryOne<{ username: string; expires: number }>(
      'SELECT username, expires FROM sessions WHERE token = $1', [token]
    );
    if (!session || session.expires < Date.now() / 1000) return;

    const user = await queryOne<{ username: string; role: string; display_name: string | null }>(
      'SELECT username, role, display_name FROM users WHERE username = $1', [session.username]
    );
    if (user) {
      request.sessionUser = {
        username: user.username,
        role: user.role ?? 'operator',
        displayName: user.display_name,
      };
    }
  });

  // Platform admin gate — every admin route uses this
  fastify.decorate('requirePlatformAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.sessionUser) {
      reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        meta: { request_id: crypto.randomUUID(), timestamp: Date.now() },
      });
      return;
    }
    if (request.sessionUser.role !== 'platform_admin') {
      reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Platform admin access required' },
        meta: { request_id: crypto.randomUUID(), timestamp: Date.now() },
      });
    }
  });
}

export default fp(adminAuthPlugin, { name: 'porter-admin-auth' });
