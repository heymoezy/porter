import { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { pool } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';
import { runVaultDerivativeSweep, getDerivativeCoverage } from '../../services/vault-derivatives.js';
import { routingEngine } from '../../services/bridge/routing-engine.js';
import type { BridgeDispatchRequest, RoutingContext } from '../../services/bridge/types.js';
import { CHEAP_GATEWAY, CHEAP_MODEL } from '../../services/intellect/worker-knowledge.js';

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
 *   R1b — register-schema.   R1c — ingest.   R1d — graph read.   R1e — placement review.
 *   R4  — derivative loop (coverage read + on-demand sweep; nightly sweep on
 *         the every_24h workflow tick — see services/vault-derivatives.ts).
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
                pl.id AS placement_id, pl.parent_id, pl.state AS placement_state, pl.confidence,
                src.kind AS source_kind, src.source_system, src.source_id, src.path AS source_path
         FROM vault_nodes n
         LEFT JOIN LATERAL (
           SELECT id, parent_id, state, confidence FROM vault_placements p
           WHERE p.app_scope = n.app_scope AND p.node_id = n.id AND p.layer = n.layer
             AND p.state IN ('active','proposed')
           ORDER BY CASE p.state WHEN 'active' THEN 0 ELSE 1 END, p.created_at DESC
           LIMIT 1
         ) pl ON true
         LEFT JOIN LATERAL (
           SELECT kind, source_system, source_id, path FROM vault_artifacts a
           WHERE a.app_scope = n.app_scope AND a.node_id = n.id
           ORDER BY a.created_at DESC LIMIT 1
         ) src ON true
         WHERE ${where}
         ORDER BY n.type, n.title`,
        params
      )).rows as Array<{
        id: string; external_id: string; layer: string; type: string; title: string;
        status: string; placement_id: string | null; parent_id: string | null; placement_state: string | null; confidence: number | null;
        source_kind: string | null; source_system: string | null; source_id: string | null; source_path: string | null;
      }>;

      // placementId is the vault_placements row id — the accept/refile/reject
      // review-queue ops below key off THIS, not the node id (a node can be
      // re-reviewed many times; each review targets the current
      // active-or-proposed placement row). `source` is the node's most recent
      // ingest artifact (kind + originating system/path) — the review table's
      // "Source" column, so a reviewer sees WHERE a proposed node came from.
      const nodes = nodeRows.map((r) => ({
        id: r.id,
        externalId: r.external_id,
        layer: r.layer,
        type: r.type,
        title: r.title,
        status: r.status,
        placementId: r.placement_id,
        parentId: r.parent_id,
        placementState: r.placement_state,
        confidence: r.confidence,
        source: r.source_kind
          ? { kind: r.source_kind, sourceSystem: r.source_system, sourceId: r.source_id, path: r.source_path }
          : null,
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

  // GET /api/v1/vault/nodes/:id — single-node detail: the node itself, its
  // resolved parent (active-or-latest-proposed placement, same precedence as
  // GET /graph), its 1-hop edges (both directions, with the other endpoint's
  // title/type resolved), and its ingest artifacts. Built for the review
  // table's Discuss/Edit surfaces, which need one node's full context without
  // paying for a whole-scope graph fetch.
  fastify.get(
    '/nodes/:id',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const id = (request.params as Record<string, string>).id;
      const node = (await pool.query(
        `SELECT id, app_scope, external_id, layer, type, title, status, metadata, created_at, updated_at
         FROM vault_nodes WHERE id = $1`,
        [id]
      )).rows[0] as
        | { id: string; app_scope: string; external_id: string; layer: string; type: string; title: string; status: string; metadata: Record<string, unknown>; created_at: number; updated_at: number }
        | undefined;
      if (!node) return reply.code(404).send(err('NODE_NOT_FOUND', `node "${id}" not found`, request.id));

      const placement = (await pool.query(
        `SELECT id, parent_id, state, confidence, proposed_by, reviewed_by, reviewed_at, created_at
         FROM vault_placements p
         WHERE p.app_scope = $1 AND p.node_id = $2 AND p.layer = $3 AND p.state IN ('active','proposed')
         ORDER BY CASE p.state WHEN 'active' THEN 0 ELSE 1 END, p.created_at DESC
         LIMIT 1`,
        [node.app_scope, node.id, node.layer]
      )).rows[0] as
        | { id: string; parent_id: string | null; state: string; confidence: number | null; proposed_by: string; reviewed_by: string | null; reviewed_at: number | null; created_at: number }
        | undefined;

      const parent = placement?.parent_id
        ? (await pool.query(`SELECT id, title, type FROM vault_nodes WHERE id = $1`, [placement.parent_id])).rows[0] as
            | { id: string; title: string; type: string }
            | undefined
        : undefined;

      const edgeRows = (await pool.query(
        `SELECT e.id, e.from_node_id, e.to_node_id, e.kind, e.metadata,
                fn.title AS from_title, fn.type AS from_type, tn.title AS to_title, tn.type AS to_type
         FROM vault_edges e
         JOIN vault_nodes fn ON fn.id = e.from_node_id
         JOIN vault_nodes tn ON tn.id = e.to_node_id
         WHERE e.app_scope = $1 AND (e.from_node_id = $2 OR e.to_node_id = $2)
         ORDER BY e.created_at DESC LIMIT 50`,
        [node.app_scope, node.id]
      )).rows as Array<{
        id: string; from_node_id: string; to_node_id: string; kind: string; metadata: Record<string, unknown>;
        from_title: string; from_type: string; to_title: string; to_type: string;
      }>;

      const artifactRows = (await pool.query(
        `SELECT id, kind, source_system, source_id, path, content_hash, metadata, created_at
         FROM vault_artifacts WHERE app_scope = $1 AND node_id = $2 ORDER BY created_at DESC LIMIT 20`,
        [node.app_scope, node.id]
      )).rows as Array<{
        id: string; kind: string; source_system: string | null; source_id: string | null; path: string | null;
        content_hash: string | null; metadata: Record<string, unknown>; created_at: number;
      }>;

      return reply.send(
        ok(
          {
            node: {
              id: node.id, appScope: node.app_scope, externalId: node.external_id, layer: node.layer,
              type: node.type, title: node.title, status: node.status, metadata: node.metadata,
              createdAt: node.created_at, updatedAt: node.updated_at,
            },
            placement: placement
              ? {
                  id: placement.id, parentId: placement.parent_id, state: placement.state, confidence: placement.confidence,
                  proposedBy: placement.proposed_by, reviewedBy: placement.reviewed_by, reviewedAt: placement.reviewed_at,
                  createdAt: placement.created_at,
                }
              : null,
            parent: parent ? { id: parent.id, title: parent.title, type: parent.type } : null,
            edges: edgeRows.map((e) => ({
              id: e.id, kind: e.kind, metadata: e.metadata,
              from: { id: e.from_node_id, title: e.from_title, type: e.from_type },
              to: { id: e.to_node_id, title: e.to_title, type: e.to_type },
            })),
            artifacts: artifactRows.map((a) => ({
              id: a.id, kind: a.kind, sourceSystem: a.source_system, sourceId: a.source_id, path: a.path,
              contentHash: a.content_hash, metadata: a.metadata, createdAt: a.created_at,
            })),
          },
          request.id
        )
      );
    }
  );

  // PATCH /api/v1/vault/nodes/:id { title?, type?, metadata? } — edit a node's
  // own fields (NOT its placement/parent — use /placements/:id/refile for
  // that). `type`, when given, must be declared in the node's scope schema;
  // changing to a type in a DIFFERENT layer is rejected (would silently
  // desync the node's placement.layer invariant enforced elsewhere) — refile
  // after registering a same-layer type instead. `metadata`, when given,
  // REPLACES the stored object (callers should read-modify-write via GET
  // /nodes/:id if they need a partial merge).
  fastify.patch(
    '/nodes/:id',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const id = (request.params as Record<string, string>).id;
      const body = (request.body ?? {}) as Record<string, unknown>;

      const node = (await pool.query(
        `SELECT id, app_scope, layer, type, title, metadata FROM vault_nodes WHERE id = $1`,
        [id]
      )).rows[0] as { id: string; app_scope: string; layer: string; type: string; title: string; metadata: Record<string, unknown> } | undefined;
      if (!node) return reply.code(404).send(err('NODE_NOT_FOUND', `node "${id}" not found`, request.id));

      let title = node.title;
      let type = node.type;
      let metadata = node.metadata;

      if ('title' in body) {
        if (typeof body.title !== 'string' || !body.title.trim()) {
          return reply.code(400).send(err('INVALID_TITLE', 'title must be a non-empty string', request.id));
        }
        title = body.title.trim();
      }
      if ('type' in body) {
        if (typeof body.type !== 'string' || !body.type.trim()) {
          return reply.code(400).send(err('INVALID_TYPE', 'type must be a non-empty string', request.id));
        }
        const newType = body.type.trim();
        const schema = await loadSchema(node.app_scope);
        const decl = schema.get(newType);
        if (!decl) return reply.code(400).send(err('UNKNOWN_TYPE', `type "${newType}" not in scope "${node.app_scope}" schema`, request.id));
        if (decl.layer !== node.layer) {
          return reply.code(400).send(err('LAYER_CHANGE_NOT_SUPPORTED', `type "${newType}" is in layer "${decl.layer}", node is in "${node.layer}" — layer changes are not supported via edit`, request.id));
        }
        type = newType;
      }
      if ('metadata' in body) {
        if (!body.metadata || typeof body.metadata !== 'object' || Array.isArray(body.metadata)) {
          return reply.code(400).send(err('INVALID_METADATA', 'metadata must be an object', request.id));
        }
        metadata = body.metadata as Record<string, unknown>;
      }

      const now = Date.now() / 1000;
      await pool.query(
        `UPDATE vault_nodes SET title = $1, type = $2, metadata = $3::jsonb, updated_at = $4 WHERE id = $5`,
        [title, type, JSON.stringify(metadata), now, id]
      );

      return reply.send(ok({ id, title, type, metadata, layer: node.layer, updatedAt: now }, request.id));
    }
  );

  // ── Review-queue ops ──────────────────────────────────────────────────────
  // accept/refile make a placement ACTIVE (demoting any prior active for the
  // same node+layer to 'archived'); reject marks it 'rejected' (node stays,
  // simply not placed) — nothing that is live is ever deleted, only refiled
  // or rejected.

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

  // POST /api/v1/vault/placements/:id/reject — mark a proposed placement
  // 'rejected'. The node row is untouched (never deleted) — it simply has no
  // active/proposed placement afterwards, so it drops out of both the graph's
  // default view and the review queue. Mirrors accept's closed-state guard.
  fastify.post(
    '/placements/:id/reject',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const id = (request.params as Record<string, string>).id;
      const reviewer = request.sessionUser?.username ?? 'system';
      return rejectPlacement(request, reply, id, reviewer);
    }
  );

  // POST /api/v1/vault/placements/:id/refine — ask the Bridge (cheap gateway,
  // full failover chain — same dispatchWithFailover path as the derivative
  // loop below) to SUGGEST a better type/parent for a proposed placement,
  // given the node + the scope's declared schema + the scope's existing
  // "major" nodes (anything already used as a parent, same layer). This
  // NEVER applies the suggestion — the reviewer applies it via PATCH
  // /nodes/:id (type) and/or /placements/:id/refile (parent).
  fastify.post(
    '/placements/:id/refine',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const id = (request.params as Record<string, string>).id;
      return refinePlacement(request, reply, id);
    }
  );

  // ── Derivative loop (R4) ──────────────────────────────────────────────────
  // Markdown = DERIVATIVES: loop-generated from a raw source, raw never
  // altered. vault-derivatives.ts owns the sweep logic; this file only wires
  // the read + the on-demand trigger. The nightly run rides the existing
  // every_24h workflow tick (workflow-engine.ts) — no new timer here.

  // GET /api/v1/vault/derivatives?scope= — coverage: counts by status
  // (missing|queued|generated|failed|stale) + the job list, so it's visible
  // which raw artifacts still lack a derivative.
  fastify.get(
    '/derivatives',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const query = (request.query ?? {}) as Record<string, unknown>;
      const scope = scopeOf({}, query);
      if (!scope) return reply.code(400).send(err('MISSING_SCOPE', 'scope is required', request.id));

      const coverage = await getDerivativeCoverage(scope);
      return reply.send(ok(coverage, request.id));
    }
  );

  // POST /api/v1/vault/derivatives/sweep { app_scope? } — run the derivative
  // sweep on demand (in addition to the nightly every_24h tick). Omitting
  // app_scope sweeps every scope. Never throws — per-job failures land on the
  // job row (status='failed'), not on this response.
  fastify.post(
    '/derivatives/sweep',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const scope = scopeOf(body, {});
      const result = await runVaultDerivativeSweep({ scope: scope || undefined, triggeredBy: 'manual' });
      return reply.send(ok(result, request.id));
    }
  );

  // POST /api/v1/vault/edges — bulk create NON-hierarchical relationships between
  // existing nodes (hierarchy lives in placements; this is everything else:
  // person↔deal, doc↔person, knowledge↔agent, proposal↔target, …). Apps push edges
  // AFTER ingest (nodes must already exist). Endpoints resolve app-supplied
  // externalIds to node ids within the scope. Idempotent per (scope, from, to, kind).
  //
  // Body: { app_scope, edges: [{ fromExternalId, toExternalId, kind, metadata? }] }
  fastify.post(
    '/edges',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const scope = scopeOf(body, {});
      if (!scope) return reply.code(400).send(err('MISSING_SCOPE', 'app_scope is required', request.id));
      const edges = body.edges;
      if (!Array.isArray(edges) || edges.length === 0) {
        return reply.code(400).send(err('MISSING_EDGES', 'edges must be a non-empty array', request.id));
      }
      if (edges.length > 10000) {
        return reply.code(400).send(err('TOO_MANY_EDGES', 'max 10000 edges per call', request.id));
      }

      // Resolve all externalIds in the scope up front.
      const rows = (await pool.query(
        `SELECT external_id, id FROM vault_nodes WHERE app_scope = $1`,
        [scope]
      )).rows as Array<{ external_id: string; id: string }>;
      const idByExternal = new Map(rows.map((r) => [r.external_id, r.id]));

      const now = Date.now() / 1000;
      const results: Array<Record<string, unknown>> = [];
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (let i = 0; i < edges.length; i++) {
          const e = edges[i] as Record<string, unknown>;
          const fromExt = typeof e.fromExternalId === 'string' ? e.fromExternalId.trim() : '';
          const toExt = typeof e.toExternalId === 'string' ? e.toExternalId.trim() : '';
          const kind = typeof e.kind === 'string' ? e.kind.trim() : '';
          if (!fromExt || !toExt || !kind) {
            await client.query('ROLLBACK');
            return reply.code(400).send(err('INVALID_EDGE', `edge ${i} needs fromExternalId, toExternalId, kind`, request.id));
          }
          const fromId = idByExternal.get(fromExt);
          const toId = idByExternal.get(toExt);
          if (!fromId || !toId) {
            results.push({ index: i, skipped: true, reason: `unresolved ${!fromId ? fromExt : toExt}` });
            continue;
          }
          const meta = (e.metadata && typeof e.metadata === 'object' ? e.metadata : {}) as Record<string, unknown>;
          // Idempotent: skip if the same (scope, from, to, kind) edge already exists.
          const dupe = (await client.query(
            `SELECT id FROM vault_edges WHERE app_scope=$1 AND from_node_id=$2 AND to_node_id=$3 AND kind=$4`,
            [scope, fromId, toId, kind]
          )).rows[0] as { id: string } | undefined;
          if (dupe) {
            await client.query(`UPDATE vault_edges SET metadata=$1::jsonb WHERE id=$2`, [JSON.stringify(meta), dupe.id]);
            results.push({ index: i, id: dupe.id, action: 'updated' });
          } else {
            const id = crypto.randomUUID();
            await client.query(
              `INSERT INTO vault_edges (id, app_scope, from_node_id, to_node_id, kind, metadata, created_at)
               VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
              [id, scope, fromId, toId, kind, JSON.stringify(meta), now]
            );
            results.push({ index: i, id, action: 'created' });
          }
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      const created = results.filter((r) => r.action === 'created').length;
      const updated = results.filter((r) => r.action === 'updated').length;
      const skipped = results.filter((r) => r.skipped).length;
      return reply.send(ok({ appScope: scope, created, updated, skipped, total: edges.length, results }, request.id));
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

/**
 * Reject a proposed placement: state='rejected'. No parent change, no
 * activation — the node keeps existing (and can be re-ingested/re-proposed
 * later; a fresh ingest of the same externalId creates a NEW proposed
 * placement since the rejected one no longer matches the "existing active
 * or proposed" lookup in POST /ingest).
 */
async function rejectPlacement(
  request: FastifyRequest,
  reply: import('fastify').FastifyReply,
  placementId: string,
  reviewer: string
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pl = (await client.query(
      `SELECT id, app_scope, node_id, layer, state FROM vault_placements WHERE id = $1 FOR UPDATE`,
      [placementId]
    )).rows[0] as { id: string; app_scope: string; node_id: string; layer: string; state: string } | undefined;
    if (!pl) {
      await client.query('ROLLBACK');
      return reply.code(404).send(err('PLACEMENT_NOT_FOUND', `placement "${placementId}" not found`, request.id));
    }
    if (pl.state === 'archived' || pl.state === 'rejected') {
      await client.query('ROLLBACK');
      return reply.code(409).send(err('PLACEMENT_CLOSED', `placement is ${pl.state}; cannot reject`, request.id));
    }
    const now = Date.now() / 1000;
    await client.query(
      `UPDATE vault_placements SET state = 'rejected', reviewed_by = $1, reviewed_at = $2 WHERE id = $3`,
      [reviewer, now, placementId]
    );
    await client.query('COMMIT');
    return reply.send(
      ok({ placementId, nodeId: pl.node_id, layer: pl.layer, state: 'rejected', reviewedBy: reviewer }, request.id)
    );
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Ask the Bridge for a suggested type/parent for a proposed (or any
 * not-yet-closed) placement. Read-only — returns the suggestion; the
 * reviewer applies it explicitly via PATCH /nodes/:id + /placements/:id/refile.
 * Never throws to the caller: Bridge/parse failures come back as a 502 with
 * a message, same posture as the derivative loop's per-job failure handling
 * (just not silently swallowed here, since this IS the response body).
 */
async function refinePlacement(
  request: FastifyRequest,
  reply: import('fastify').FastifyReply,
  placementId: string
) {
  const pl = (await pool.query(
    `SELECT id, app_scope, node_id, parent_id, layer, state FROM vault_placements WHERE id = $1`,
    [placementId]
  )).rows[0] as { id: string; app_scope: string; node_id: string; parent_id: string | null; layer: string; state: string } | undefined;
  if (!pl) return reply.code(404).send(err('PLACEMENT_NOT_FOUND', `placement "${placementId}" not found`, request.id));
  if (pl.state === 'archived' || pl.state === 'rejected') {
    return reply.code(409).send(err('PLACEMENT_CLOSED', `placement is ${pl.state}; cannot refine`, request.id));
  }

  const node = (await pool.query(
    `SELECT title, type, metadata FROM vault_nodes WHERE id = $1`,
    [pl.node_id]
  )).rows[0] as { title: string; type: string; metadata: Record<string, unknown> } | undefined;
  if (!node) return reply.code(404).send(err('NODE_NOT_FOUND', `node "${pl.node_id}" not found`, request.id));

  const schema = await loadSchema(pl.app_scope);
  const schemaList = Array.from(schema.values());

  const currentParent = pl.parent_id
    ? (await pool.query(`SELECT id, title, type FROM vault_nodes WHERE id = $1`, [pl.parent_id])).rows[0] as
        | { id: string; title: string; type: string }
        | undefined
    : undefined;

  // Candidate parents = every node already used as a parent (an "active" or
  // "proposed" placement points at it) in the same scope+layer — the same
  // "majors" concept the review UI's own hierarchy picker uses. Keeps the
  // prompt small regardless of how many thousands of LEAF nodes exist.
  const candidates = (await pool.query(
    `SELECT DISTINCT n.id, n.title, n.type
     FROM vault_nodes n
     JOIN vault_placements p ON p.parent_id = n.id AND p.app_scope = n.app_scope AND p.state IN ('active','proposed')
     WHERE n.app_scope = $1 AND n.layer = $2 AND n.id <> $3
     ORDER BY n.title LIMIT 200`,
    [pl.app_scope, pl.layer, pl.node_id]
  )).rows as Array<{ id: string; title: string; type: string }>;

  const prompt = [
    `You are curating a knowledge-graph review queue for app_scope "${pl.app_scope}" (layer: ${pl.layer}).`,
    '',
    `Declared node types (type — allowed parent types): ${schemaList.map((t) => `${t.type} [${t.parentTypes.join(', ') || 'any/root'}]`).join('; ')}`,
    '',
    'Node under review:',
    `  title: ${node.title}`,
    `  current type: ${node.type}`,
    `  metadata: ${JSON.stringify(node.metadata ?? {}).slice(0, 500)}`,
    `  currently proposed parent: ${currentParent ? `${currentParent.title} (${currentParent.type}, id ${currentParent.id})` : '(root — no parent)'}`,
    '',
    'Candidate parent nodes (id — title — type), pick one of these ids or null for root:',
    candidates.map((c) => `  ${c.id} — ${c.title} — ${c.type}`).join('\n') || '  (no candidate parents exist yet in this scope/layer)',
    '',
    'Respond with ONLY one JSON object, no prose, no code fence:',
    '{"suggestedType":"<a declared type, or the current type if unchanged>","suggestedParentId":"<one of the candidate ids above, or null>","confidence":<0.0-1.0>,"reasoning":"<one sentence, plain register>"}',
    'Only use a suggestedParentId from the candidate list above (or null) — never invent an id.',
  ].join('\n');

  try {
    const ctx: RoutingContext = {
      message: prompt,
      forceGatewayType: CHEAP_GATEWAY,
      forceModelName: CHEAP_MODEL,
      sourceAgent: 'vault-refine',
    };
    const req: BridgeDispatchRequest = {
      messages: [{ role: 'user', content: prompt }],
      model: CHEAP_MODEL,
      temperature: 0.2,
      maxTokens: 500,
    };
    const { decision, result, failover } = await routingEngine.dispatchWithFailover(ctx, req);
    await routingEngine.logDispatch(decision, ctx, result, undefined, null, failover);

    const raw = (result.response ?? '').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Bridge reply had no JSON object');
    const parsed = JSON.parse(jsonMatch[0]) as {
      suggestedType?: unknown; suggestedParentId?: unknown; confidence?: unknown; reasoning?: unknown;
    };

    let reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning.trim() : '';

    let suggestedType = typeof parsed.suggestedType === 'string' ? parsed.suggestedType.trim() : node.type;
    if (!schema.has(suggestedType)) {
      reasoning += (reasoning ? ' ' : '') + `(model suggested unknown type "${suggestedType}" — defaulted to current type)`;
      suggestedType = node.type;
    }

    const candidateIds = new Set(candidates.map((c) => c.id));
    let suggestedParentId: string | null;
    if (parsed.suggestedParentId === null || parsed.suggestedParentId === undefined) {
      suggestedParentId = null;
    } else if (typeof parsed.suggestedParentId === 'string' && candidateIds.has(parsed.suggestedParentId)) {
      suggestedParentId = parsed.suggestedParentId;
    } else {
      reasoning += (reasoning ? ' ' : '') + `(model suggested an unknown parent id — defaulted to root)`;
      suggestedParentId = null;
    }
    const suggestedParent = suggestedParentId ? candidates.find((c) => c.id === suggestedParentId) ?? null : null;
    const confidence = typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1 ? parsed.confidence : null;

    return reply.send(
      ok(
        {
          placementId,
          nodeId: pl.node_id,
          currentType: node.type,
          currentParentId: pl.parent_id,
          suggestion: {
            type: suggestedType,
            parentId: suggestedParentId,
            parentTitle: suggestedParent?.title ?? null,
            confidence,
            reasoning: reasoning || null,
          },
          model: decision.modelName,
          gateway: decision.gatewayRow.type,
        },
        request.id
      )
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return reply.code(502).send(err('REFINE_FAILED', `Bridge refine call failed: ${message}`, request.id));
  }
}
