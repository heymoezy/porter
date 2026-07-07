import { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { pool } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';

/**
 * Registry v1 — the scope ladder + product registry (identity spine).
 *
 * Porter's vault engine keys everything on a single `app_scope` text column,
 * but tenant / product(app) / project / global are 4 different concepts.
 * `vault_scopes` gives that column a real backing DAG: global (porter) →
 * tenant (moe) → app (ymc, themozaic, ...) → project (optional, deeper).
 * `products` is the minimal, generic registry of what each app/matter scope
 * actually is (repo path, ports, services) — no app-specific columns here,
 * app detail lives in jsonb.
 *
 * The injection chain (`GET /scopes/:id/chain`) is what knowledge-injection
 * will read from: global ∪ every ancestor up to the root, NEVER a sibling
 * scope. That is the leakage boundary this file exists to enforce.
 *
 * Auth: `requireAuth` — a logged-in platform_admin OR the X-Porter-Service-Token
 * (apps calling server-to-server). Both resolve to request.sessionUser.
 */

const SCOPE_KINDS = new Set(['global', 'tenant', 'app', 'project']);
const PRODUCT_KINDS = new Set(['product', 'matter']);
const MAX_CHAIN_DEPTH = 32; // guards against a corrupt/cyclic parent chain

interface ScopeRow {
  id: string;
  scope_kind: string;
  parent_scope_id: string | null;
  tenant_id: string | null;
  label: string;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

function toScope(r: ScopeRow) {
  return {
    id: r.id,
    scopeKind: r.scope_kind,
    parentScopeId: r.parent_scope_id,
    tenantId: r.tenant_id,
    label: r.label,
    metadata: r.metadata,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

interface ProductRow {
  id: string;
  tenant_id: string;
  scope_id: string;
  name: string;
  slug: string;
  kind: string;
  repo_path: string | null;
  frontend: Record<string, unknown>;
  backend: Record<string, unknown>;
  services: Record<string, unknown>;
  ports: Record<string, unknown>;
  bridge_profile: Record<string, unknown>;
  tools: unknown[];
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

function toProduct(r: ProductRow) {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    scopeId: r.scope_id,
    name: r.name,
    slug: r.slug,
    kind: r.kind,
    repoPath: r.repo_path,
    frontend: r.frontend,
    backend: r.backend,
    services: r.services,
    ports: r.ports,
    bridgeProfile: r.bridge_profile,
    tools: r.tools,
    metadata: r.metadata,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export default async function registryRoutes(fastify: FastifyInstance) {
  // ── Scopes ─────────────────────────────────────────────────────────────

  // GET /api/v1/registry/scopes — list the whole ladder.
  fastify.get(
    '/scopes',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const rows = (await pool.query(
        `SELECT id, scope_kind, parent_scope_id, tenant_id, label, metadata, created_at, updated_at
         FROM vault_scopes ORDER BY scope_kind, id`
      )).rows as ScopeRow[];
      return reply.send(ok({ scopes: rows.map(toScope) }, request.id));
    }
  );

  // POST /api/v1/registry/scopes — register a new scope in the ladder.
  // Body: { id, scope_kind, parent_scope_id?, tenant_id?, label, metadata? }
  // Idempotent upsert by id. Rejects a parent that doesn't exist yet (the
  // ladder must be built root-down) and rejects self-parenting.
  fastify.post(
    '/scopes',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      const scopeKind = typeof body.scope_kind === 'string' ? body.scope_kind.trim()
        : typeof body.scopeKind === 'string' ? body.scopeKind.trim() : '';
      const parentScopeId = typeof body.parent_scope_id === 'string' ? body.parent_scope_id.trim()
        : typeof body.parentScopeId === 'string' ? body.parentScopeId.trim() : null;
      const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id.trim()
        : typeof body.tenantId === 'string' ? body.tenantId.trim() : null;
      const label = typeof body.label === 'string' ? body.label.trim() : '';
      const metadata = (body.metadata && typeof body.metadata === 'object' ? body.metadata : {}) as Record<string, unknown>;

      if (!id) return reply.code(400).send(err('MISSING_ID', 'id is required', request.id));
      if (!SCOPE_KINDS.has(scopeKind)) {
        return reply.code(400).send(err('INVALID_SCOPE_KIND', 'scope_kind must be global|tenant|app|project', request.id));
      }
      if (!label) return reply.code(400).send(err('MISSING_LABEL', 'label is required', request.id));

      if (scopeKind === 'global' && parentScopeId) {
        return reply.code(400).send(err('INVALID_PARENT', 'a global scope cannot have a parent', request.id));
      }
      if (scopeKind !== 'global' && !parentScopeId) {
        return reply.code(400).send(err('MISSING_PARENT', 'non-global scopes require parent_scope_id', request.id));
      }
      if (parentScopeId === id) {
        return reply.code(400).send(err('SELF_PARENT', 'a scope cannot be its own parent', request.id));
      }
      if (parentScopeId) {
        const parent = (await pool.query(`SELECT id FROM vault_scopes WHERE id = $1`, [parentScopeId])).rows[0];
        if (!parent) {
          return reply.code(400).send(err('PARENT_NOT_FOUND', `parent_scope_id "${parentScopeId}" does not exist — register it first`, request.id));
        }
      }

      const now = Date.now() / 1000;
      const row = (await pool.query(
        `INSERT INTO vault_scopes (id, scope_kind, parent_scope_id, tenant_id, label, metadata, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$7)
         ON CONFLICT (id) DO UPDATE SET
           scope_kind = EXCLUDED.scope_kind,
           parent_scope_id = EXCLUDED.parent_scope_id,
           tenant_id = EXCLUDED.tenant_id,
           label = EXCLUDED.label,
           metadata = EXCLUDED.metadata,
           updated_at = EXCLUDED.updated_at
         RETURNING id, scope_kind, parent_scope_id, tenant_id, label, metadata, created_at, updated_at`,
        [id, scopeKind, parentScopeId, tenantId, label, JSON.stringify(metadata), now]
      )).rows[0] as ScopeRow;

      return reply.send(ok(toScope(row), request.id));
    }
  );

  // GET /api/v1/registry/scopes/:id/chain — resolve the INJECTION CHAIN: the
  // scope itself plus every ancestor up to the global root (e.g. ymc -> [ymc,
  // moe, porter]). This is the leakage boundary — a chain NEVER contains a
  // sibling scope, only the scope + its direct ancestors. Cycle-guarded.
  fastify.get(
    '/scopes/:id/chain',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const id = (request.params as Record<string, string>).id;
      const start = (await pool.query(
        `SELECT id, scope_kind, parent_scope_id, tenant_id, label, metadata, created_at, updated_at
         FROM vault_scopes WHERE id = $1`,
        [id]
      )).rows[0] as ScopeRow | undefined;
      if (!start) return reply.code(404).send(err('SCOPE_NOT_FOUND', `scope "${id}" not found`, request.id));

      const chain: ScopeRow[] = [start];
      const seen = new Set<string>([start.id]);
      let cursor = start.parent_scope_id;
      let guard = 0;
      while (cursor) {
        if (guard++ > MAX_CHAIN_DEPTH) {
          return reply.code(500).send(err('CHAIN_TOO_DEEP', `scope chain from "${id}" exceeds ${MAX_CHAIN_DEPTH} hops — possible cycle`, request.id));
        }
        if (seen.has(cursor)) {
          return reply.code(500).send(err('SCOPE_CYCLE', `scope chain from "${id}" cycles back to "${cursor}"`, request.id));
        }
        const next = (await pool.query(
          `SELECT id, scope_kind, parent_scope_id, tenant_id, label, metadata, created_at, updated_at
           FROM vault_scopes WHERE id = $1`,
          [cursor]
        )).rows[0] as ScopeRow | undefined;
        if (!next) break; // dangling parent reference — chain stops here
        chain.push(next);
        seen.add(next.id);
        cursor = next.parent_scope_id;
      }

      return reply.send(
        ok({ scopeId: id, chain: chain.map(toScope), chainIds: chain.map((s) => s.id) }, request.id)
      );
    }
  );

  // ── Products ───────────────────────────────────────────────────────────

  // GET /api/v1/registry/products — list all products/matters.
  fastify.get(
    '/products',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const rows = (await pool.query(
        `SELECT id, tenant_id, scope_id, name, slug, kind, repo_path, frontend, backend,
                services, ports, bridge_profile, tools, metadata, created_at, updated_at
         FROM products ORDER BY name`
      )).rows as ProductRow[];
      return reply.send(ok({ products: rows.map(toProduct) }, request.id));
    }
  );

  // GET /api/v1/registry/products/:id
  fastify.get(
    '/products/:id',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const id = (request.params as Record<string, string>).id;
      const row = (await pool.query(
        `SELECT id, tenant_id, scope_id, name, slug, kind, repo_path, frontend, backend,
                services, ports, bridge_profile, tools, metadata, created_at, updated_at
         FROM products WHERE id = $1`,
        [id]
      )).rows[0] as ProductRow | undefined;
      if (!row) return reply.code(404).send(err('PRODUCT_NOT_FOUND', `product "${id}" not found`, request.id));
      return reply.send(ok(toProduct(row), request.id));
    }
  );

  // POST /api/v1/registry/products — upsert by id.
  // Body: { id, tenant_id, scope_id, name, slug, kind?, repo_path?, frontend?,
  //         backend?, services?, ports?, bridge_profile?, tools?, metadata? }
  // scope_id must already be registered in vault_scopes.
  fastify.post(
    '/products',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id.trim()
        : typeof body.tenantId === 'string' ? body.tenantId.trim() : '';
      const scopeId = typeof body.scope_id === 'string' ? body.scope_id.trim()
        : typeof body.scopeId === 'string' ? body.scopeId.trim() : '';
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
      const kind = typeof body.kind === 'string' && body.kind.trim() ? body.kind.trim() : 'product';
      const repoPath = typeof body.repo_path === 'string' ? body.repo_path.trim()
        : typeof body.repoPath === 'string' ? body.repoPath.trim() : null;

      if (!id) return reply.code(400).send(err('MISSING_ID', 'id is required', request.id));
      if (!tenantId) return reply.code(400).send(err('MISSING_TENANT', 'tenant_id is required', request.id));
      if (!scopeId) return reply.code(400).send(err('MISSING_SCOPE', 'scope_id is required', request.id));
      if (!name) return reply.code(400).send(err('MISSING_NAME', 'name is required', request.id));
      if (!slug) return reply.code(400).send(err('MISSING_SLUG', 'slug is required', request.id));
      if (!PRODUCT_KINDS.has(kind)) {
        return reply.code(400).send(err('INVALID_KIND', 'kind must be product|matter', request.id));
      }

      const scope = (await pool.query(`SELECT id FROM vault_scopes WHERE id = $1`, [scopeId])).rows[0];
      if (!scope) {
        return reply.code(400).send(err('SCOPE_NOT_FOUND', `scope_id "${scopeId}" does not exist — register it first`, request.id));
      }

      const jsonField = (v: unknown, fallback: string) =>
        JSON.stringify(v && typeof v === 'object' ? v : JSON.parse(fallback));

      const now = Date.now() / 1000;
      const row = (await pool.query(
        `INSERT INTO products (id, tenant_id, scope_id, name, slug, kind, repo_path,
           frontend, backend, services, ports, bridge_profile, tools, metadata, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15,$15)
         ON CONFLICT (id) DO UPDATE SET
           tenant_id = EXCLUDED.tenant_id,
           scope_id = EXCLUDED.scope_id,
           name = EXCLUDED.name,
           slug = EXCLUDED.slug,
           kind = EXCLUDED.kind,
           repo_path = EXCLUDED.repo_path,
           frontend = EXCLUDED.frontend,
           backend = EXCLUDED.backend,
           services = EXCLUDED.services,
           ports = EXCLUDED.ports,
           bridge_profile = EXCLUDED.bridge_profile,
           tools = EXCLUDED.tools,
           metadata = EXCLUDED.metadata,
           updated_at = EXCLUDED.updated_at
         RETURNING id, tenant_id, scope_id, name, slug, kind, repo_path, frontend, backend,
                   services, ports, bridge_profile, tools, metadata, created_at, updated_at`,
        [
          id, tenantId, scopeId, name, slug, kind, repoPath,
          jsonField(body.frontend, '{}'),
          jsonField(body.backend, '{}'),
          jsonField(body.services, '{}'),
          jsonField(body.ports, '{}'),
          jsonField(body.bridge_profile ?? body.bridgeProfile, '{}'),
          jsonField(body.tools, '[]'),
          jsonField(body.metadata, '{}'),
          now,
        ]
      )).rows[0] as ProductRow;

      return reply.send(ok(toProduct(row), request.id));
    }
  );
}
