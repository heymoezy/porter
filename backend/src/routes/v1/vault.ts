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

const ARTIFACT_KINDS = new Set(['db_entity', 'raw_file', 'markdown_derivative', 'external_url']);

/** Load a scope's declared node-types as a lookup map. Empty map = scope never registered. */
async function loadSchema(scope: string): Promise<Map<string, NodeTypeDecl>> {
  const row = (await pool.query(
    `SELECT node_types FROM vault_schemas WHERE app_scope = $1`,
    [scope]
  )).rows[0] as { node_types: NodeTypeDecl[] } | undefined;
  const map = new Map<string, NodeTypeDecl>();
  for (const t of row?.node_types ?? []) map.set(t.type, t);
  return map;
}

/**
 * Decide a node's hierarchy placement.
 *
 * R1c: this is the AI auto-association SEAM. Today it is a deterministic stub —
 * it honours the app-supplied proposedParentExternalId (or roots the node when
 * none is given). A later release swaps this body for a Bridge-backed classifier
 * that reads the scope's schema + existing tree; the contract (return a resolved
 * parent node-id, or null for root) stays the same. Every placement is created in
 * state='proposed' so it flows through the per-app review queue and nothing that
 * is already active is ever disturbed.
 */
function resolveProposedParentId(proposedParentNodeId: string | null): string | null {
  return proposedParentNodeId;
}

export default async function vaultRoutes(fastify: FastifyInstance) {
  // Bodyless POSTs (notably /accept) must not 400 just because a client sent
  // `Content-Type: application/json` with an empty body. Scoped to this plugin only.
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const raw = typeof body === 'string' ? body.trim() : '';
    if (!raw) return done(null, {});
    try {
      done(null, JSON.parse(raw));
    } catch (e) {
      (e as { statusCode?: number }).statusCode = 400;
      done(e as Error, undefined);
    }
  });

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

  // POST /api/v1/vault/ingest — an app PUSHES its data (Porter never pulls custom
  // connectors). Each item is type-checked against the scope's registered schema,
  // then materialized as node(active) + artifact + placement(proposed). Idempotent
  // per (app_scope, externalId): re-ingesting updates the node and its source
  // artifact without disturbing any active placement or generated derivatives.
  //
  // Body: { app_scope, items: [{ externalId, type, title,
  //           source?: { kind, sourceSystem?, sourceId?, path?, contentHash?, metadata? },
  //           proposedParentExternalId?, metadata? }] }
  fastify.post(
    '/ingest',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const scope = scopeOf(body, {});
      if (!scope) return reply.code(400).send(err('MISSING_SCOPE', 'app_scope is required', request.id));

      const items = body.items;
      if (!Array.isArray(items) || items.length === 0) {
        return reply.code(400).send(err('MISSING_ITEMS', 'items must be a non-empty array', request.id));
      }
      if (items.length > 2000) {
        return reply.code(400).send(err('TOO_MANY_ITEMS', 'max 2000 items per ingest call', request.id));
      }

      const schema = await loadSchema(scope);
      if (schema.size === 0) {
        return reply.code(409).send(err('NO_SCHEMA', `scope "${scope}" has no registered schema — call register-schema first`, request.id));
      }

      // Pre-validate every item before writing anything (all-or-nothing on shape).
      interface Prepared {
        externalId: string;
        type: string;
        layer: string;
        title: string;
        metadata: Record<string, unknown>;
        source: Record<string, unknown> | null;
        proposedParentExternalId: string | null;
      }
      const prepared: Prepared[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it || typeof it !== 'object') {
          return reply.code(400).send(err('INVALID_ITEM', `item ${i} must be an object`, request.id));
        }
        const o = it as Record<string, unknown>;
        const externalId = typeof o.externalId === 'string' ? o.externalId.trim() : '';
        const type = typeof o.type === 'string' ? o.type.trim() : '';
        const title = typeof o.title === 'string' ? o.title.trim() : '';
        if (!externalId) return reply.code(400).send(err('INVALID_ITEM', `item ${i} needs externalId`, request.id));
        if (!title) return reply.code(400).send(err('INVALID_ITEM', `item ${i} (${externalId}) needs title`, request.id));
        const decl = schema.get(type);
        if (!decl) {
          return reply.code(400).send(err('UNKNOWN_TYPE', `item ${i} (${externalId}) has type "${type}" not in scope schema`, request.id));
        }
        let source: Record<string, unknown> | null = null;
        if (o.source !== undefined && o.source !== null) {
          if (typeof o.source !== 'object') {
            return reply.code(400).send(err('INVALID_SOURCE', `item ${i} source must be an object`, request.id));
          }
          const s = o.source as Record<string, unknown>;
          const kind = typeof s.kind === 'string' ? s.kind.trim() : '';
          if (!ARTIFACT_KINDS.has(kind)) {
            return reply.code(400).send(err('INVALID_SOURCE', `item ${i} source.kind "${kind}" invalid (db_entity|raw_file|markdown_derivative|external_url)`, request.id));
          }
          source = s;
        }
        const ppe = typeof o.proposedParentExternalId === 'string' ? o.proposedParentExternalId.trim() : '';
        prepared.push({
          externalId,
          type,
          layer: decl.layer,
          title,
          metadata: (o.metadata && typeof o.metadata === 'object' ? o.metadata : {}) as Record<string, unknown>,
          source,
          proposedParentExternalId: ppe || null,
        });
      }

      const now = Date.now() / 1000;
      const client = await pool.connect();
      const results: Array<Record<string, unknown>> = [];
      try {
        await client.query('BEGIN');

        // Map of externalId -> nodeId for this scope, seeded with existing nodes so
        // proposedParentExternalId can reference either an existing node or one in
        // this same batch.
        const existing = (await client.query(
          `SELECT external_id, id FROM vault_nodes WHERE app_scope = $1`,
          [scope]
        )).rows as Array<{ external_id: string; id: string }>;
        const idByExternal = new Map<string, string>(existing.map((r) => [r.external_id, r.id]));

        // First pass: upsert every node so intra-batch parent references resolve.
        for (const p of prepared) {
          let nodeId = idByExternal.get(p.externalId);
          if (nodeId) {
            await client.query(
              `UPDATE vault_nodes SET title=$1, type=$2, layer=$3, metadata=$4::jsonb, updated_at=$5
               WHERE id=$6`,
              [p.title, p.type, p.layer, JSON.stringify(p.metadata), now, nodeId]
            );
          } else {
            nodeId = crypto.randomUUID();
            await client.query(
              `INSERT INTO vault_nodes (id, app_scope, external_id, layer, type, title, status, metadata, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,'active',$7::jsonb,$8,$8)`,
              [nodeId, scope, p.externalId, p.layer, p.type, p.title, JSON.stringify(p.metadata), now]
            );
            idByExternal.set(p.externalId, nodeId);
          }
        }

        // Second pass: artifacts + proposed placements (types validated, parents resolved).
        for (const p of prepared) {
          const nodeId = idByExternal.get(p.externalId)!;
          const decl = schema.get(p.type)!;
          const itemResult: Record<string, unknown> = { externalId: p.externalId, nodeId, type: p.type };

          // Source artifact — idempotent by (node_id, kind, coalesce(source_id,path)).
          if (p.source) {
            const s = p.source;
            const kind = String(s.kind);
            const sourceSystem = typeof s.sourceSystem === 'string' ? s.sourceSystem : null;
            const sourceId = typeof s.sourceId === 'string' ? s.sourceId : null;
            const path = typeof s.path === 'string' ? s.path : null;
            const contentHash = typeof s.contentHash === 'string' ? s.contentHash : null;
            const meta = (s.metadata && typeof s.metadata === 'object' ? s.metadata : {}) as Record<string, unknown>;
            const dupe = (await client.query(
              `SELECT id FROM vault_artifacts
               WHERE app_scope=$1 AND node_id=$2 AND kind=$3 AND COALESCE(source_id,path,'')=COALESCE($4,$5,'')`,
              [scope, nodeId, kind, sourceId, path]
            )).rows[0] as { id: string } | undefined;
            if (dupe) {
              await client.query(
                `UPDATE vault_artifacts SET content_hash=$1, metadata=$2::jsonb WHERE id=$3`,
                [contentHash, JSON.stringify(meta), dupe.id]
              );
              itemResult.artifact = { id: dupe.id, action: 'updated' };
            } else {
              const artId = crypto.randomUUID();
              await client.query(
                `INSERT INTO vault_artifacts (id, app_scope, node_id, kind, source_system, source_id, path, content_hash, metadata, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
                [artId, scope, nodeId, kind, sourceSystem, sourceId, path, contentHash, JSON.stringify(meta), now]
              );
              itemResult.artifact = { id: artId, action: 'created' };
            }
          }

          // Resolve proposed parent. Enforce the declared hierarchy: a parent's type
          // must be one of the child type's declared parentTypes.
          let parentNodeId: string | null = null;
          let placementNote: string | null = null;
          if (p.proposedParentExternalId) {
            const pid = idByExternal.get(p.proposedParentExternalId) ?? null;
            if (!pid) {
              placementNote = `parent externalId "${p.proposedParentExternalId}" not found — rooted`;
            } else {
              const parentType = (await client.query(
                `SELECT type FROM vault_nodes WHERE id=$1`, [pid]
              )).rows[0] as { type: string } | undefined;
              if (parentType && !decl.parentTypes.includes(parentType.type)) {
                placementNote = `parent type "${parentType.type}" not allowed under "${p.type}" — rooted`;
              } else {
                parentNodeId = pid;
              }
            }
          }
          const resolvedParent = resolveProposedParentId(parentNodeId);

          // Never disturb an active placement. Otherwise keep exactly one proposed row.
          const active = (await client.query(
            `SELECT id FROM vault_placements WHERE app_scope=$1 AND node_id=$2 AND layer=$3 AND state='active'`,
            [scope, nodeId, p.layer]
          )).rows[0] as { id: string } | undefined;
          if (active) {
            itemResult.placement = { state: 'active', unchanged: true };
          } else {
            const proposed = (await client.query(
              `SELECT id FROM vault_placements WHERE app_scope=$1 AND node_id=$2 AND layer=$3 AND state='proposed'`,
              [scope, nodeId, p.layer]
            )).rows[0] as { id: string } | undefined;
            if (proposed) {
              await client.query(
                `UPDATE vault_placements SET parent_id=$1, proposed_by='ai', created_at=$2 WHERE id=$3`,
                [resolvedParent, now, proposed.id]
              );
              itemResult.placement = { id: proposed.id, state: 'proposed', parentId: resolvedParent, action: 'updated' };
            } else {
              const plId = crypto.randomUUID();
              await client.query(
                `INSERT INTO vault_placements (id, app_scope, node_id, parent_id, layer, state, proposed_by, created_at)
                 VALUES ($1,$2,$3,$4,$5,'proposed','ai',$6)`,
                [plId, scope, nodeId, resolvedParent, p.layer, now]
              );
              itemResult.placement = { id: plId, state: 'proposed', parentId: resolvedParent, action: 'created' };
            }
          }
          if (placementNote) itemResult.placementNote = placementNote;
          results.push(itemResult);
        }

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      return reply.send(ok({ appScope: scope, ingested: results.length, items: results }, request.id));
    }
  );

  // GET /api/v1/vault/graph?scope=&layer=&focus= — the scoped, navigable graph.
  //   scope   (required) — tenant isolation; a scope with no data returns { nodes:[], edges:[] }.
  //   layer   (optional) — 'data' | 'learning' to view one layer at a time.
  //   focus   (optional) — a node id; returns that node + its whole subtree + 1-hop edges.
  // Each node carries its resolved parent: the ACTIVE placement when one exists, else the
  // latest PROPOSED one (so a freshly-ingested, not-yet-reviewed tree still renders), with a
  // placementState flag so the UI can distinguish reviewed vs pending hierarchy.
  fastify.get(
    '/graph',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const query = (request.query ?? {}) as Record<string, unknown>;
      const scope = scopeOf({}, query);
      if (!scope) return reply.code(400).send(err('MISSING_SCOPE', 'scope is required', request.id));

      const layer = typeof query.layer === 'string' ? query.layer.trim() : '';
      if (layer && !LAYERS.has(layer)) {
        return reply.code(400).send(err('INVALID_LAYER', `layer must be data|learning`, request.id));
      }
      const focus = typeof query.focus === 'string' ? query.focus.trim() : '';

      // Restrict to a focus subtree (recursive walk down placements) when asked.
      let focusIds: string[] | null = null;
      if (focus) {
        const rows = (await pool.query(
          `WITH RECURSIVE sub AS (
             SELECT id FROM vault_nodes WHERE id = $2 AND app_scope = $1
             UNION
             SELECT p.node_id FROM vault_placements p
             JOIN sub ON p.parent_id = sub.id
             WHERE p.app_scope = $1 AND p.state IN ('active','proposed')
           )
           SELECT id FROM sub`,
          [scope, focus]
        )).rows as Array<{ id: string }>;
        focusIds = rows.map((r) => r.id);
        if (focusIds.length === 0) {
          return reply.code(404).send(err('NODE_NOT_FOUND', `focus node "${focus}" not in scope "${scope}"`, request.id));
        }
      }

      // Nodes + their best placement (active preferred, else latest proposed).
      const params: unknown[] = [scope];
      let where = `n.app_scope = $1`;
      if (layer) { params.push(layer); where += ` AND n.layer = $${params.length}`; }
      if (focusIds) { params.push(focusIds); where += ` AND n.id = ANY($${params.length})`; }

      const nodeRows = (await pool.query(
        `SELECT n.id, n.external_id, n.layer, n.type, n.title, n.status,
                pl.parent_id, pl.state AS placement_state, pl.confidence
         FROM vault_nodes n
         LEFT JOIN LATERAL (
           SELECT parent_id, state, confidence FROM vault_placements p
           WHERE p.app_scope = n.app_scope AND p.node_id = n.id AND p.layer = n.layer
             AND p.state IN ('active','proposed')
           ORDER BY CASE p.state WHEN 'active' THEN 0 ELSE 1 END, p.created_at DESC
           LIMIT 1
         ) pl ON true
         WHERE ${where}
         ORDER BY n.type, n.title`,
        params
      )).rows as Array<{
        id: string; external_id: string; layer: string; type: string; title: string;
        status: string; parent_id: string | null; placement_state: string | null; confidence: number | null;
      }>;

      const nodes = nodeRows.map((r) => ({
        id: r.id,
        externalId: r.external_id,
        layer: r.layer,
        type: r.type,
        title: r.title,
        status: r.status,
        parentId: r.parent_id,
        placementState: r.placement_state,
        confidence: r.confidence,
      }));

      // Non-hierarchical edges, restricted to the returned node set.
      const nodeIds = new Set(nodes.map((n) => n.id));
      const edgeRows = (await pool.query(
        `SELECT id, from_node_id, to_node_id, kind FROM vault_edges WHERE app_scope = $1`,
        [scope]
      )).rows as Array<{ id: string; from_node_id: string; to_node_id: string; kind: string }>;
      const edges = edgeRows
        .filter((e) => nodeIds.has(e.from_node_id) && nodeIds.has(e.to_node_id))
        .map((e) => ({ id: e.id, from: e.from_node_id, to: e.to_node_id, kind: e.kind }));

      return reply.send(
        ok({ appScope: scope, layer: layer || null, focus: focus || null, nodes, edges }, request.id)
      );
    }
  );

  // ── Review-queue ops ──────────────────────────────────────────────────────
  // Both make a placement ACTIVE (demoting any prior active for the same
  // node+layer to 'archived') — nothing that is live is ever deleted, only refiled.

  // POST /api/v1/vault/placements/:id/accept — approve the proposed placement as-is.
  fastify.post(
    '/placements/:id/accept',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const id = (request.params as Record<string, string>).id;
      const reviewer = request.sessionUser?.username ?? 'system';
      return activatePlacement(request, reply, id, undefined, reviewer);
    }
  );

  // POST /api/v1/vault/placements/:id/refile { parentId } — approve, but under a
  // corrected parent (parentId null = root). Enforces declared parentTypes + no cycles.
  fastify.post(
    '/placements/:id/refile',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const id = (request.params as Record<string, string>).id;
      const body = (request.body ?? {}) as Record<string, unknown>;
      if (!('parentId' in body)) {
        return reply.code(400).send(err('MISSING_PARENT', 'parentId is required (null for root)', request.id));
      }
      const parentId = body.parentId === null ? null : typeof body.parentId === 'string' ? body.parentId.trim() : '';
      if (parentId === '') return reply.code(400).send(err('INVALID_PARENT', 'parentId must be a node id or null', request.id));
      const reviewer = request.sessionUser?.username ?? 'system';
      return activatePlacement(request, reply, id, parentId, reviewer);
    }
  );
}

/**
 * Activate a placement (accept, or refile under a new parent). `newParentId`:
 * undefined = keep the placement's current parent (accept); null = root; string = re-parent.
 * Demotes any existing active placement for the same (scope, node, layer) to 'archived'.
 * Enforces the scope's declared parentTypes and rejects cycles.
 */
async function activatePlacement(
  request: FastifyRequest,
  reply: import('fastify').FastifyReply,
  placementId: string,
  newParentId: string | null | undefined,
  reviewer: string
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pl = (await client.query(
      `SELECT id, app_scope, node_id, parent_id, layer, state FROM vault_placements WHERE id = $1 FOR UPDATE`,
      [placementId]
    )).rows[0] as
      | { id: string; app_scope: string; node_id: string; parent_id: string | null; layer: string; state: string }
      | undefined;
    if (!pl) {
      await client.query('ROLLBACK');
      return reply.code(404).send(err('PLACEMENT_NOT_FOUND', `placement "${placementId}" not found`, request.id));
    }
    if (pl.state === 'archived' || pl.state === 'rejected') {
      await client.query('ROLLBACK');
      return reply.code(409).send(err('PLACEMENT_CLOSED', `placement is ${pl.state}; cannot activate`, request.id));
    }

    const scope = pl.app_scope;
    const targetParent = newParentId === undefined ? pl.parent_id : newParentId;

    // Validate the target parent against the scope schema + guard cycles.
    if (targetParent !== null) {
      const parent = (await client.query(
        `SELECT id, type, layer FROM vault_nodes WHERE id = $1 AND app_scope = $2`,
        [targetParent, scope]
      )).rows[0] as { id: string; type: string; layer: string } | undefined;
      if (!parent) {
        await client.query('ROLLBACK');
        return reply.code(400).send(err('INVALID_PARENT', `parent "${targetParent}" not in scope "${scope}"`, request.id));
      }
      if (parent.layer !== pl.layer) {
        await client.query('ROLLBACK');
        return reply.code(400).send(err('LAYER_MISMATCH', `parent is in layer "${parent.layer}", node is "${pl.layer}"`, request.id));
      }
      const child = (await client.query(`SELECT type FROM vault_nodes WHERE id = $1`, [pl.node_id])).rows[0] as { type: string } | undefined;
      const schema = await loadSchema(scope);
      const decl = child ? schema.get(child.type) : undefined;
      if (decl && !decl.parentTypes.includes(parent.type)) {
        await client.query('ROLLBACK');
        return reply.code(400).send(err('HIERARCHY_VIOLATION', `parent type "${parent.type}" not allowed under "${child!.type}"`, request.id));
      }
      // Cycle guard: the target parent must not be the node itself or one of its descendants.
      const desc = (await client.query(
        `WITH RECURSIVE sub AS (
           SELECT $2::text AS id
           UNION
           SELECT p.node_id FROM vault_placements p JOIN sub ON p.parent_id = sub.id
           WHERE p.app_scope = $1 AND p.state IN ('active','proposed')
         )
         SELECT 1 FROM sub WHERE id = $3 LIMIT 1`,
        [scope, pl.node_id, targetParent]
      )).rows.length > 0;
      if (desc) {
        await client.query('ROLLBACK');
        return reply.code(400).send(err('CYCLE', `parent "${targetParent}" is within the node's own subtree`, request.id));
      }
    }

    const now = Date.now() / 1000;
    // Demote any current active placement for this node+layer.
    await client.query(
      `UPDATE vault_placements SET state = 'archived', reviewed_by = $1, reviewed_at = $2
       WHERE app_scope = $3 AND node_id = $4 AND layer = $5 AND state = 'active' AND id <> $6`,
      [reviewer, now, scope, pl.node_id, pl.layer, placementId]
    );
    // Activate this one (with the corrected parent when refiling).
    await client.query(
      `UPDATE vault_placements SET state = 'active', parent_id = $1, reviewed_by = $2, reviewed_at = $3 WHERE id = $4`,
      [targetParent, reviewer, now, placementId]
    );

    await client.query('COMMIT');
    return reply.send(
      ok({ placementId, nodeId: pl.node_id, layer: pl.layer, parentId: targetParent, state: 'active', reviewedBy: reviewer }, request.id)
    );
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
