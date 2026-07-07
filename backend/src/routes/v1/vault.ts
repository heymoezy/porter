import { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { pool } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';

/**
 * Vault v2 — the generic knowledge-graph engine.
 *
 * Porter owns the ENGINE; apps DECLARE their own node-types and PUSH their data.
 * No app-specific concepts live here. A fresh install is an empty registry that
 * fills entirely from the new user's own apps. Tenant isolation via `app_scope`.
 *
 * Auth: `requireAuth` — a logged-in platform_admin OR the X-Porter-Service-Token
 * (apps calling server-to-server). Both resolve to request.sessionUser.
 *
 * Built incrementally as micro-releases:
 *   R1b — register-schema (this).   R1c — ingest.   R1d — graph read.   R1e — placement review.
 */

const LAYERS = new Set(['data', 'learning']);

/** A single declared node-type: which layer it belongs to and which parent-types it may nest under. */
interface NodeTypeDecl {
  type: string;
  layer: string;
  parentTypes: string[];
}

/** Validate + normalize an app's declared node_types. Returns [normalized, errorMessage]. */
function normalizeNodeTypes(raw: unknown): [NodeTypeDecl[], string | null] {
  if (!Array.isArray(raw)) return [[], 'node_types must be an array'];
  const seen = new Set<string>();
  const out: NodeTypeDecl[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return [[], 'each node_type must be an object'];
    const o = item as Record<string, unknown>;
    const type = typeof o.type === 'string' ? o.type.trim() : '';
    const layer = typeof o.layer === 'string' ? o.layer.trim() : '';
    if (!type) return [[], 'each node_type needs a non-empty "type"'];
    if (!LAYERS.has(layer)) return [[], `node_type "${type}" has invalid layer "${layer}" (use data|learning)`];
    if (seen.has(type)) return [[], `duplicate node_type "${type}"`];
    seen.add(type);
    let parentTypes: string[] = [];
    if (o.parentTypes !== undefined) {
      if (!Array.isArray(o.parentTypes) || o.parentTypes.some((p) => typeof p !== 'string')) {
        return [[], `node_type "${type}" parentTypes must be an array of strings`];
      }
      parentTypes = (o.parentTypes as string[]).map((p) => p.trim()).filter(Boolean);
    }
    out.push({ type, layer, parentTypes });
  }
  // parentTypes must reference declared types within the same scope (or be empty = root-capable).
  const declared = new Set(out.map((t) => t.type));
  for (const t of out) {
    for (const p of t.parentTypes) {
      if (!declared.has(p)) return [[], `node_type "${t.type}" references unknown parentType "${p}"`];
    }
  }
  return [out, null];
}

function scopeOf(body: Record<string, unknown>, query: Record<string, unknown>): string {
  const raw = (body.app_scope ?? body.appScope ?? query.scope ?? '') as string;
  return typeof raw === 'string' ? raw.trim() : '';
}

export default async function vaultRoutes(fastify: FastifyInstance) {
  // POST /api/v1/vault/register-schema — an app declares its node-types/layers/hierarchy.
  // Idempotent upsert per scope; re-registering replaces the scope's declaration.
  fastify.post(
    '/register-schema',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const scope = scopeOf(body, {});
      if (!scope) return reply.code(400).send(err('MISSING_SCOPE', 'app_scope is required', request.id));

      const [nodeTypes, verr] = normalizeNodeTypes(body.node_types ?? body.nodeTypes ?? []);
      if (verr) return reply.code(400).send(err('INVALID_SCHEMA', verr, request.id));

      const now = Date.now() / 1000;
      await pool.query(
        `INSERT INTO vault_schemas (app_scope, node_types, created_at, updated_at)
         VALUES ($1, $2::jsonb, $3, $3)
         ON CONFLICT (app_scope)
         DO UPDATE SET node_types = EXCLUDED.node_types, updated_at = EXCLUDED.updated_at`,
        [scope, JSON.stringify(nodeTypes), now]
      );

      return reply.send(
        ok({ appScope: scope, nodeTypes, typeCount: nodeTypes.length }, request.id)
      );
    }
  );

  // GET /api/v1/vault/schema?scope= — read back a scope's declared node-types.
  // A scope that has never registered returns null (fresh-install: nothing declared).
  fastify.get(
    '/schema',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const query = (request.query ?? {}) as Record<string, unknown>;
      const scope = scopeOf({}, query);
      if (!scope) return reply.code(400).send(err('MISSING_SCOPE', 'scope is required', request.id));

      const row = (await pool.query(
        `SELECT app_scope, node_types, created_at, updated_at FROM vault_schemas WHERE app_scope = $1`,
        [scope]
      )).rows[0] as
        | { app_scope: string; node_types: NodeTypeDecl[]; created_at: number; updated_at: number }
        | undefined;

      if (!row) return reply.send(ok({ appScope: scope, registered: false, nodeTypes: [] }, request.id));

      return reply.send(
        ok(
          {
            appScope: row.app_scope,
            registered: true,
            nodeTypes: row.node_types,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          },
          request.id
        )
      );
    }
  );
}
