import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { sqlite } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';
import { encryptCredential } from '../../lib/credential-crypto.js';
import { emitSSE } from '../../services/scheduler.js';
import { getProjectCalendarEvents } from '../../services/calendar.js';
import { z } from 'zod';
import crypto from 'crypto';

// ── Schema definitions ────────────────────────────────────────────────────────

const createConnectionSchema = z.object({
  provider: z.string().min(1),
  kind: z.enum(['oauth2', 'api_key']),
  display_name: z.string().optional(),
  meta_json: z.record(z.string(), z.unknown()).optional(),
  scopes: z.array(z.string()).optional(),
});

const updateConnectionSchema = z.object({
  display_name: z.string().optional(),
  meta_json: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['connected', 'disconnected', 'needs_reauth', 'error']).optional(),
});

const attachProjectSchema = z.object({
  connection_id: z.string().min(1),
  access_mode: z.enum(['read', 'read_write']).default('read'),
});

// ── Row types ─────────────────────────────────────────────────────────────────

interface WorkspaceConnectionRow {
  id: string;
  provider: string;
  kind: string;
  status: string;
  display_name: string | null;
  scopes_json: string | null;
  tools_json: string | null;
  last_sync_at: number | null;
  last_error: string | null;
  installed_by: string | null;
  meta_json: string | null;
  meta_encrypted: number | null;
  created_at: number | null;
  updated_at: number | null;
}

interface ProjectConnectionRow extends WorkspaceConnectionRow {
  access_mode: string | null;
  override_status: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Mask meta_json in list/detail responses — never send credentials to frontend */
function safeMeta(row: WorkspaceConnectionRow): string {
  if (row.meta_encrypted === 1) return '[encrypted]';
  return row.meta_json ?? '{}';
}

function formatConnection(row: WorkspaceConnectionRow) {
  return {
    id: row.id,
    provider: row.provider,
    kind: row.kind,
    status: row.status,
    display_name: row.display_name ?? '',
    scopes_json: row.scopes_json ?? '[]',
    tools_json: row.tools_json ?? '[]',
    last_sync_at: row.last_sync_at ?? 0,
    last_error: row.last_error ?? '',
    installed_by: row.installed_by ?? '',
    meta_json: safeMeta(row),
    meta_encrypted: Boolean(row.meta_encrypted),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function formatProjectConnection(row: ProjectConnectionRow) {
  return {
    ...formatConnection(row),
    access_mode: row.access_mode ?? 'read',
    override_status: row.override_status ?? null,
  };
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export default async function connectionsV1Routes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions,
) {
  // ── GET / — list all workspace connections ──────────────────────────────────
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (_request, reply) => {
    const rows = sqlite.prepare(
      'SELECT * FROM workspace_connections ORDER BY provider ASC',
    ).all() as WorkspaceConnectionRow[];

    return reply.send(ok({ connections: rows.map(formatConnection), count: rows.length }));
  });

  // ── GET /:id — single connection detail ─────────────────────────────────────
  fastify.get('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const row = sqlite.prepare(
      'SELECT * FROM workspace_connections WHERE id = ?',
    ).get(id) as WorkspaceConnectionRow | undefined;

    if (!row) {
      return reply.code(404).send(err('CONNECTION_NOT_FOUND', 'Connection not found'));
    }

    return reply.send(ok({ connection: formatConnection(row) }));
  });

  // ── POST / — create connection (admin only) ─────────────────────────────────
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    if (request.sessionUser!.role !== 'admin') {
      return reply.code(403).send(err('FORBIDDEN', 'Admin access required'));
    }

    const parsed = createConnectionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const { provider, kind, display_name, meta_json, scopes } = parsed.data;
    const id = crypto.randomUUID();
    const now = Date.now() / 1000;

    let storedMeta = '{}';
    let metaEncrypted = 0;

    if (meta_json && Object.keys(meta_json).length > 0) {
      storedMeta = encryptCredential(JSON.stringify(meta_json));
      metaEncrypted = 1;
    }

    sqlite.prepare(`
      INSERT INTO workspace_connections
        (id, provider, kind, status, display_name, scopes_json, meta_json, meta_encrypted, installed_by, created_at, updated_at)
      VALUES
        (@id, @provider, @kind, 'disconnected', @displayName, @scopesJson, @metaJson, @metaEncrypted, @installedBy, @now, @now)
    `).run({
      id,
      provider,
      kind,
      displayName: display_name ?? '',
      scopesJson: JSON.stringify(scopes ?? []),
      metaJson: storedMeta,
      metaEncrypted,
      installedBy: request.sessionUser!.username,
      now,
    });

    return reply.code(201).send(ok({ id, provider, status: 'disconnected' }));
  });

  // ── PUT /:id — update connection (admin only) ────────────────────────────────
  fastify.put('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    if (request.sessionUser!.role !== 'admin') {
      return reply.code(403).send(err('FORBIDDEN', 'Admin access required'));
    }

    const { id } = request.params as { id: string };

    const existing = sqlite.prepare(
      'SELECT id FROM workspace_connections WHERE id = ?',
    ).get(id) as { id: string } | undefined;

    if (!existing) {
      return reply.code(404).send(err('CONNECTION_NOT_FOUND', 'Connection not found'));
    }

    const parsed = updateConnectionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const { display_name, meta_json, status } = parsed.data;

    const sets: string[] = ['updated_at = unixepoch(\'now\')'];
    const params: Record<string, unknown> = { id };

    if (display_name !== undefined) {
      sets.push('display_name = @displayName');
      params.displayName = display_name;
    }

    if (status !== undefined) {
      sets.push('status = @status');
      params.status = status;
    }

    if (meta_json !== undefined) {
      sets.push('meta_json = @metaJson, meta_encrypted = 1');
      params.metaJson = encryptCredential(JSON.stringify(meta_json));
    }

    sqlite.prepare(
      `UPDATE workspace_connections SET ${sets.join(', ')} WHERE id = @id`,
    ).run(params);

    return reply.send(ok({ updated: true }));
  });

  // ── DELETE /:id — remove connection + cascade (admin only) ──────────────────
  fastify.delete('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    if (request.sessionUser!.role !== 'admin') {
      return reply.code(403).send(err('FORBIDDEN', 'Admin access required'));
    }

    const { id } = request.params as { id: string };

    const existing = sqlite.prepare(
      'SELECT id, provider FROM workspace_connections WHERE id = ?',
    ).get(id) as { id: string; provider: string } | undefined;

    if (!existing) {
      return reply.code(404).send(err('CONNECTION_NOT_FOUND', 'Connection not found'));
    }

    // Cascade delete project-level overrides first
    sqlite.prepare(
      'DELETE FROM project_connections WHERE connection_id = ?',
    ).run(id);

    sqlite.prepare(
      'DELETE FROM workspace_connections WHERE id = ?',
    ).run(id);

    // Fire-and-forget SSE notification
    emitSSE('connection:status', { provider: existing.provider, status: 'disconnected' }).catch(() => {
      // Best-effort — never block the response
    });

    return reply.send(ok({ deleted: true }));
  });

  // ── GET /project/:projectId — connections for a project ─────────────────────
  fastify.get('/project/:projectId', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const rows = sqlite.prepare(`
      SELECT
        wc.*,
        pc.access_mode,
        pc.status AS override_status
      FROM workspace_connections wc
      LEFT JOIN project_connections pc
        ON pc.connection_id = wc.id AND pc.project_id = @projectId
      ORDER BY wc.provider ASC
    `).all({ projectId }) as ProjectConnectionRow[];

    return reply.send(ok({ connections: rows.map(formatProjectConnection), count: rows.length }));
  });

  // ── POST /project/:projectId — attach connection to project ─────────────────
  fastify.post('/project/:projectId', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const parsed = attachProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const { connection_id, access_mode } = parsed.data;
    const now = Date.now() / 1000;

    // Verify the workspace connection exists
    const conn = sqlite.prepare(
      'SELECT id FROM workspace_connections WHERE id = ?',
    ).get(connection_id) as { id: string } | undefined;

    if (!conn) {
      return reply.code(404).send(err('CONNECTION_NOT_FOUND', 'Workspace connection not found'));
    }

    sqlite.prepare(`
      INSERT OR REPLACE INTO project_connections
        (project_id, connection_id, access_mode, status, attached_by, attached_at)
      VALUES
        (@projectId, @connectionId, @accessMode, 'active', @attachedBy, @now)
    `).run({
      projectId,
      connectionId: connection_id,
      accessMode: access_mode,
      attachedBy: request.sessionUser!.username,
      now,
    });

    return reply.send(ok({ attached: true }));
  });

  // ── DELETE /project/:projectId/:connectionId — detach connection ─────────────
  fastify.delete('/project/:projectId/:connectionId', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { projectId, connectionId } = request.params as { projectId: string; connectionId: string };

    sqlite.prepare(`
      DELETE FROM project_connections
      WHERE project_id = @projectId AND connection_id = @connectionId
    `).run({ projectId, connectionId });

    return reply.send(ok({ detached: true }));
  });

  // ── GET /project/:projectId/calendar-events — Calendar events for project dashboard ──
  fastify.get('/project/:projectId/calendar-events', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const events = getProjectCalendarEvents(projectId);
    return reply.send(ok(events));
  });
}
