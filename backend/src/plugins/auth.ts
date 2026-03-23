import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, pool } from '../db/client.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { err } from '../lib/envelope.js';
import { ProjectRole, PROJECT_ROLE_ORDER } from '../lib/roles.js';

declare module 'fastify' {
  interface FastifyRequest {
    sessionUser: { username: string; role: string; displayName: string | null } | null;
    projectRole: ProjectRole | null;
  }
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireProjectAccess: (minRole: ProjectRole) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('sessionUser', null);
  fastify.decorateRequest('projectRole', null);

  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    // Try session cookie first
    const token = request.cookies?.porter_session;
    if (!token) return;

    const [session] = await db.select().from(schema.sessions)
      .where(eq(schema.sessions.token, token));
    if (!session || session.expires < Date.now() / 1000) return;

    const [user] = await db.select().from(schema.users)
      .where(eq(schema.users.username, session.username));
    if (user) {
      request.sessionUser = {
        username: user.username,
        role: user.role ?? 'operator',
        displayName: user.displayName,
      };
    }
  });

  fastify.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.sessionUser) {
      reply.code(401).send(err('UNAUTHORIZED', 'Authentication required', request.id));
    }
  });

  fastify.decorate('requireProjectAccess', (minRole: ProjectRole) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // 1. Must be authenticated
      if (!request.sessionUser) {
        return reply.code(401).send(err('UNAUTHORIZED', 'Authentication required', request.id));
      }

      // 2. platform_admin bypasses all project checks
      if (request.sessionUser.role === 'platform_admin') {
        request.projectRole = 'owner';
        return;
      }

      // 3. Extract project id from route params
      const projectId = (request.params as Record<string, string>).id;
      if (!projectId) {
        return reply.code(400).send(err('BAD_REQUEST', 'Missing project id', request.id));
      }

      // 4. Look up collaborator record (active only, not pending/revoked)
      const collab = (await pool.query(
        `SELECT role FROM project_collaborators WHERE project_id = $1 AND username = $2 AND status = 'active'`,
        [projectId, request.sessionUser.username]
      )).rows[0] as { role: ProjectRole } | undefined;

      if (!collab) {
        return reply.code(403).send(err('FORBIDDEN', 'Access denied', request.id));
      }

      // 5. Enforce minimum role
      const callerIdx = PROJECT_ROLE_ORDER.indexOf(collab.role);
      const minIdx = PROJECT_ROLE_ORDER.indexOf(minRole);
      if (callerIdx < minIdx) {
        return reply.code(403).send(err('FORBIDDEN', 'Insufficient project role', request.id));
      }

      // 6. Expose project role to downstream handler
      request.projectRole = collab.role;
    };
  });
}

export default fp(authPlugin, { name: 'porter-auth' });
