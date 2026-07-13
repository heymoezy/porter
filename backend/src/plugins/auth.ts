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

/**
 * Service-token auth — machine-to-machine, grants platform_admin.
 *
 * ROTATION COMPLETE (2026-07-13). The old token `porter-local-service-2026` was hardcoded
 * here as a fallback and is committed in 11 commits of a PUBLIC repo (heymoezy/porter) —
 * anyone reading GitHub had the admin token for this brain. Only the localhost check below
 * kept it from being remotely exploitable.
 *
 * Two invariants now hold, and they are code, not convention:
 *   1. NO hardcoded fallback. No env token → service auth is DISABLED (fail-closed).
 *      It can never again be guessable-by-default.
 *   2. The leaked literal is REFUSED as a secret even if someone sets it explicitly —
 *      so it cannot be reintroduced by copying an old config.
 *
 * The rotation window (PORTER_SERVICE_TOKEN_LEGACY + a warn-log naming each caller) did its
 * job: it found the stragglers — the post-commit hook and the openclaw-spawned tom-mcp — and
 * both are migrated. The window is closed and the scaffolding is deleted.
 */
const LEAKED_TOKEN = 'porter-local-service-2026';

const RAW_TOKEN = (process.env.PORTER_SERVICE_TOKEN || '').trim();
const SERVICE_TOKEN = RAW_TOKEN && RAW_TOKEN !== LEAKED_TOKEN ? RAW_TOKEN : '';

if (!SERVICE_TOKEN) {
  console.warn(
    '[auth] PORTER_SERVICE_TOKEN is unset (or is the leaked 2026 literal) — ' +
    'service-token auth is DISABLED. Machine-to-machine callers will get 401. ' +
    'Set it in ~/.config/porter/porter.env.',
  );
}

const LOCALHOST_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('sessionUser', null);
  fastify.decorateRequest('projectRole', null);

  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    // 1. Check for service token (localhost machine-to-machine auth)
    const serviceToken =
      request.headers['x-porter-service-token'] as string | undefined
      || extractBearerServiceToken(request.headers.authorization);

    if (serviceToken && SERVICE_TOKEN !== '' && serviceToken === SERVICE_TOKEN) {
      // Only accept from localhost.
      if (LOCALHOST_IPS.has(request.ip)) {
        request.sessionUser = {
          username: 'system',
          role: 'platform_admin',
          displayName: 'System',
        };
        return;
      }
    }

    // 2. Try session cookie (check both product and admin cookies)
    const token = request.cookies?.porter_session || request.cookies?.porter_admin_session;
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
      return reply.code(401).send(err('UNAUTHORIZED', 'Authentication required', request.id));
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

/**
 * Extract a service token from "Bearer <token>" authorization header.
 * Only returns values that look like Porter service tokens (porter-* prefix).
 */
function extractBearerServiceToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(porter-.+)$/i);
  return match ? match[1] : null;
}

export default fp(authPlugin, { name: 'porter-auth' });
