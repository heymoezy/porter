import { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { pool } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';
import { runVaultDerivativeSweep, getDerivativeCoverage } from '../../services/vault-derivatives.js';
import { routingEngine } from '../../services/bridge/routing-engine.js';
import { DEFAULT_BATCH_LIMIT } from '../../services/vault-derivatives.js';
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
 * R1c: this is the AI auto-association SEAM. Today it is a DETERMINISTIC STUB — it honours the
 * app-supplied proposedParentExternalId (or roots the node when none is given). A later release
 * swaps this body for a Bridge-backed classifier that reads the scope's schema + existing tree;
 * the contract (return a resolved parent node-id, or null for root) stays the same.
 *
 * 2026-07-13 — PROVENANCE CORRECTION. Every placement this stub created was stamped
 * `proposed_by = 'ai'`. That was FALSE: no classifier has ever run (one commit has ever touched
 * this function — the stub itself), so all 5,176 placements were labelled as AI proposals when
 * they are in fact the calling app's OWN declared hierarchy, passed straight through.
 *
 * That mislabel is not cosmetic. It told a reviewer that 4,900 filings were machine guesses
 * needing human judgement, when they are the app's own structure. It is exactly what Porter
 * architecture rule 5 forbids: never label an unconfigured feature as active.
 *
 * So provenance is now stamped by whoever ACTUALLY decided the parent. `ai` is reserved for a
 * real classifier and cannot be claimed until one exists.
 */
export const PLACEMENT_PROVENANCE = {
  /** The calling app declared this parent; we passed it through unchanged. */
  APP: 'app',
  /** No parent supplied — rooted by default. A decision by nobody. */
  DEFAULT_ROOT: 'default_root',
  /** RESERVED. Only a real Bridge-backed classifier may claim this. */
  CLASSIFIER: 'ai',
} as const;

function resolveProposedParentId(proposedParentNodeId: string | null): string | null {
  return proposedParentNodeId;
}

/** Who actually decided this placement — not who we wish had. */
function placementProvenance(resolvedParent: string | null): string {
  return resolvedParent === null ? PLACEMENT_PROVENANCE.DEFAULT_ROOT : PLACEMENT_PROVENANCE.APP;
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
        // R2 (Files dedup): when a raw_file item carries a contentHash, its NODE
        // identity becomes content:sha256:<hash> so identical content in N paths
        // collapses to ONE node; the per-path physical location is recorded in
        // vault_artifact_locations. `location` holds that row's fields; the
        // original path-based externalId is preserved as an alias in metadata.
        location: {
          absolutePath: string;
          relativePath: string | null;
          basename: string | null;
          contentHash: string;
          sizeBytes: number | null;
          mtimeNs: string | null;
        } | null;
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
        const metaObj = (o.metadata && typeof o.metadata === 'object' ? o.metadata : {}) as Record<string, unknown>;

        // R2 Files dedup: a raw_file with a contentHash is keyed by content, not
        // path — identical bytes anywhere = one node. The path becomes a location.
        let effectiveExternalId = externalId;
        let location: Prepared['location'] = null;
        if (source && source.kind === 'raw_file' && typeof source.contentHash === 'string' && source.contentHash) {
          const absolutePath = typeof source.path === 'string' ? source.path : '';
          if (absolutePath) {
            effectiveExternalId = `content:sha256:${source.contentHash}`;
            const sm = (source.metadata && typeof source.metadata === 'object' ? source.metadata : {}) as Record<string, unknown>;
            location = {
              absolutePath,
              relativePath: typeof sm.relPath === 'string' ? sm.relPath : (typeof sm.relativePath === 'string' ? sm.relativePath : null),
              basename: absolutePath.split('/').pop() || null,
              contentHash: source.contentHash,
              sizeBytes: typeof sm.sizeBytes === 'number' ? sm.sizeBytes : (typeof sm.size === 'number' ? sm.size : null),
              mtimeNs: sm.mtimeNs != null ? String(sm.mtimeNs) : (sm.mtime != null ? String(sm.mtime) : null),
            };
            // Preserve the original path-based externalId as an alias for traceability.
            const aliases = Array.isArray(metaObj.aliases) ? (metaObj.aliases as unknown[]) : [];
            if (!aliases.includes(externalId)) aliases.push(externalId);
            metaObj.aliases = aliases;
          }
        }

        prepared.push({
          externalId: effectiveExternalId,
          type,
          layer: decl.layer,
          title,
          metadata: metaObj,
          source,
          proposedParentExternalId: ppe || null,
          location,
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
            // Identity is (node, kind, source) OR (node, kind, identical BYTES).
            //
            // 2026-07-14: this used to key on PATH alone. So the same document filed at two paths
            // — e.g. edwardchen/IDENTITY_EXHIBIT.pdf and Working_Papers/Identity_Attribution_Inquiry.pdf,
            // byte-identical — produced TWO artifact rows for one node. That is how 486 duplicate
            // groups (840 redundant rows) accumulated, and each redundant row spawned its own
            // derivative job, inflating that backlog too.
            //
            // "One file, many locations" is what vault_artifact_locations is for. The artifact is
            // the CONTENT; the locations are where it happens to sit. Matching on content_hash makes
            // the ingest idempotent on content, so R2's dedup cannot silently undo itself on the
            // next run.
            const dupe = (await client.query(
              `SELECT id FROM vault_artifacts
                WHERE app_scope=$1 AND node_id=$2 AND kind=$3
                  AND ( COALESCE(source_id,path,'') = COALESCE($4,$5,'')
                     OR ($6 <> '' AND content_hash = $6) )
                LIMIT 1`,
              [scope, nodeId, kind, sourceId, path, contentHash ?? '']
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
                `UPDATE vault_placements SET parent_id=$1, proposed_by=$2, created_at=$3 WHERE id=$4`,
                [resolvedParent, placementProvenance(resolvedParent), now, proposed.id]
              );
              itemResult.placement = { id: proposed.id, state: 'proposed', parentId: resolvedParent, action: 'updated' };
            } else {
              const plId = crypto.randomUUID();
              await client.query(
                `INSERT INTO vault_placements (id, app_scope, node_id, parent_id, layer, state, proposed_by, created_at)
                 VALUES ($1,$2,$3,$4,$5,'proposed',$6,$7)`,
                [plId, scope, nodeId, resolvedParent, p.layer, placementProvenance(resolvedParent), now]
              );
              itemResult.placement = { id: plId, state: 'proposed', parentId: resolvedParent, action: 'created' };
            }
          }
          if (placementNote) itemResult.placementNote = placementNote;

          // R2 Files dedup: record this file's physical location for the content
          // node. Idempotent per (app_scope, absolute_path); re-ingest refreshes
          // present/last_seen so a reconcile pass can flip vanished paths.
          if (p.location) {
            const loc = p.location;
            const artId = (itemResult.artifact as { id?: string } | undefined)?.id ?? null;
            const scanId = typeof body.scanId === 'string' ? body.scanId : null;
            await client.query(
              `INSERT INTO vault_artifact_locations
                 (id, app_scope, document_node_id, artifact_id, content_hash, absolute_path, relative_path, basename,
                  project_node_id, documents_root_node_id, folder_node_id, size_bytes, mtime_ns, present, scan_id, first_seen_at, last_seen_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,NULL,$10,$11,true,$12,$13,$13)
               ON CONFLICT (app_scope, absolute_path) DO UPDATE SET
                 document_node_id = EXCLUDED.document_node_id,
                 artifact_id      = EXCLUDED.artifact_id,
                 content_hash     = EXCLUDED.content_hash,
                 relative_path    = EXCLUDED.relative_path,
                 basename         = EXCLUDED.basename,
                 project_node_id  = EXCLUDED.project_node_id,
                 documents_root_node_id = EXCLUDED.documents_root_node_id,
                 size_bytes       = EXCLUDED.size_bytes,
                 mtime_ns         = EXCLUDED.mtime_ns,
                 present          = true,
                 missing_since    = NULL,
                 scan_id          = EXCLUDED.scan_id,
                 last_seen_at     = EXCLUDED.last_seen_at`,
              [crypto.randomUUID(), scope, nodeId, artId, loc.contentHash, loc.absolutePath, loc.relativePath, loc.basename,
               parentNodeId, loc.sizeBytes, loc.mtimeNs, scanId, now]
            );
            itemResult.location = { path: loc.absolutePath };
          }
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

  // POST /api/v1/vault/reconcile — Files "perfect sync". After an app finishes a
  // full scan (every present file re-ingested with the same scan_id), it calls
  // this: any location UNDER a scanned root whose scan_id != the current scan is
  // a file that vanished/moved → present=false + missing_since. A content node
  // whose locations are ALL absent has its placements archived (tombstone kept,
  // hidden from Files) — the node itself is never deleted. Idempotent.
  fastify.post(
    '/reconcile',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const scope = scopeOf(body, {});
      if (!scope) return reply.code(400).send(err('MISSING_SCOPE', 'app_scope is required', request.id));
      const scanId = typeof body.scan_id === 'string' ? body.scan_id : (typeof body.scanId === 'string' ? body.scanId : '');
      if (!scanId) return reply.code(400).send(err('MISSING_SCAN', 'scan_id is required', request.id));
      const rootsRaw = Array.isArray(body.scanned_roots) ? body.scanned_roots : (Array.isArray(body.scannedRoots) ? body.scannedRoots : []);
      const roots = rootsRaw.filter((r): r is string => typeof r === 'string' && r.length > 0);
      if (roots.length === 0) return reply.code(400).send(err('MISSING_ROOTS', 'scanned_roots[] is required', request.id));

      const now = Date.now() / 1000;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Mark vanished: present locations under a scanned root not touched by this scan.
        const likeClauses = roots.map((_, i) => `absolute_path LIKE $${i + 3}`).join(' OR ');
        const params = [scope, scanId, ...roots.map((r) => `${r}%`)];
        const gone = await client.query(
          `UPDATE vault_artifact_locations
             SET present = false, missing_since = ${now}
           WHERE app_scope = $1 AND present = true
             AND (scan_id IS DISTINCT FROM $2)
             AND (${likeClauses})
           RETURNING document_node_id`,
          params
        );
        const affectedNodes = Array.from(new Set(gone.rows.map((r) => (r as { document_node_id: string }).document_node_id)));
        // Archive placements for content nodes whose locations are now ALL absent.
        let tombstoned = 0;
        for (const nodeId of affectedNodes) {
          const stillPresent = (await client.query(
            `SELECT 1 FROM vault_artifact_locations WHERE app_scope=$1 AND document_node_id=$2 AND present=true LIMIT 1`,
            [scope, nodeId]
          )).rowCount ?? 0;
          if (stillPresent === 0) {
            await client.query(
              `UPDATE vault_placements SET state='archived' WHERE app_scope=$1 AND node_id=$2 AND state IN ('active','proposed')`,
              [scope, nodeId]
            );
            tombstoned++;
          }
        }
        await client.query('COMMIT');
        return reply.send(ok({ appScope: scope, scanId, scannedRoots: roots, locationsMarkedAbsent: gone.rowCount ?? 0, nodesTombstoned: tombstoned }, request.id));
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
  );

  // GET /api/v1/vault/graph?scope=&layer=&focus= — the scoped, navigable graph.
  //   scope   (required) — tenant isolation; a scope with no data returns { nodes:[], edges:[] }.
  //   layer   (optional) — 'data' | 'learning' to view one layer at a time.
  //   focus   (optional) — a node id; returns that node + its whole subtree + 1-hop edges.
  // Each node carries its resolved parent: the ACTIVE placement when one exists, else the
  // latest PROPOSED one (so a freshly-ingested, not-yet-reviewed tree still renders), with a
  // placementState flag so the UI can distinguish reviewed vs pending hierarchy.
  /**
   * #27 R4 — the vault's operational state, which was invisible.
   *
   * The engine has been running for weeks and nobody could see what it was doing.
   * Two things this surfaces that no existing screen did:
   *
   *   - the REVIEW BACKLOG: placements the AI proposed and no human ever accepted.
   *   - DERIVATIVE COVERAGE: raw artifacts with a generated markdown derivative. The
   *     sweep is capped at 25 model calls per 24h run (a deliberate cost bound), so a
   *     large backlog converges in months, not days. It looks healthy — it does its 25
   *     a day — while the ETA quietly runs to a third of a year. Showing the ETA is the
   *     whole point: the cap is a COST decision and it should be made with the number in
   *     front of you, not discovered later.
   *
   * Aggregates only — every number is a COUNT over a real table. Nothing is derived,
   * estimated, or invented, except `etaDays`, which is plainly labelled as arithmetic.
   */
  fastify.get(
    '/overview',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const query = (request.query ?? {}) as Record<string, unknown>;
      const scope = typeof query.scope === 'string' ? query.scope.trim() : '';

      const scopeFilter = scope ? 'WHERE app_scope = $1' : '';
      const params = scope ? [scope] : [];

      const [scopes, schema, nodes, archivedNodes, placements, provenance, edges, artifacts, derivatives] = await Promise.all([
        pool.query(`SELECT id, scope_kind, parent_scope_id, label FROM vault_scopes ORDER BY scope_kind, id`),
        pool.query(
          `SELECT app_scope, jsonb_array_length(node_types) AS type_count, updated_at
             FROM vault_schemas ${scope ? 'WHERE app_scope = $1' : ''}`,
          params
        ),
        // LIVE nodes only. This used to count every row regardless of status, so the headline still
        // included the 1,740 archived Phoenix nodes and the overview reported 5,220 when the vault
        // actually holds 3,480. That is the same defect fixed in the graph in 6.109.0 — archiving
        // that the reader ignores is not archiving — and it was still sitting in the ONE number Moe
        // looks at first. Archived rows are reported separately below rather than hidden.
        pool.query(
          `SELECT app_scope, layer, type, count(*)::int AS count
             FROM vault_nodes ${scopeFilter}${scopeFilter ? ' AND' : ' WHERE'} status <> 'archived'
             GROUP BY 1,2,3 ORDER BY 4 DESC`,
          params
        ),
        pool.query(
          `SELECT count(*)::int AS count FROM vault_nodes
            ${scopeFilter}${scopeFilter ? ' AND' : ' WHERE'} status = 'archived'`,
          params
        ),
        pool.query(
          `SELECT state, count(*)::int AS count,
                  count(*) FILTER (WHERE confidence IS NULL)::int AS no_confidence
             FROM vault_placements ${scopeFilter} GROUP BY 1`,
          params
        ),
        pool.query(
          `SELECT proposed_by, count(*)::int AS count FROM vault_placements ${scopeFilter} GROUP BY 1 ORDER BY 2 DESC`,
          params
        ),
        pool.query(
          `SELECT kind, count(*)::int AS count FROM vault_edges ${scopeFilter} GROUP BY 1 ORDER BY 2 DESC`,
          params
        ),
        pool.query(
          `SELECT kind, count(*)::int AS count FROM vault_artifacts ${scopeFilter} GROUP BY 1 ORDER BY 2 DESC`,
          params
        ),
        pool.query(
          `SELECT status, count(*)::int AS count FROM vault_derivative_jobs ${scopeFilter} GROUP BY 1`,
          params
        ),
      ]);

      const derivByStatus: Record<string, number> = {};
      for (const r of derivatives.rows as Array<{ status: string; count: number }>) {
        derivByStatus[r.status] = r.count;
      }
      const derivTotal = Object.values(derivByStatus).reduce((a, b) => a + b, 0);
      const generated = derivByStatus.generated ?? 0;
      const missing = derivByStatus.missing ?? 0;

      const placeByState: Record<string, number> = {};
      let proposedWithoutConfidence = 0;
      for (const r of placements.rows as Array<{ state: string; count: number; no_confidence: number }>) {
        placeByState[r.state] = r.count;
        if (r.state === 'proposed') proposedWithoutConfidence = r.no_confidence;
      }

      return reply.send(
        ok(
          {
            scope: scope || null,
            scopes: scopes.rows,
            schema: (schema.rows[0] as { app_scope: string; type_count: number } | undefined) ?? null,
            nodes: nodes.rows,
            nodeTotal: (nodes.rows as Array<{ count: number }>).reduce((a, r) => a + r.count, 0),
            // Reported, not hidden: Phoenix is out of the graph but it is not gone, and it comes
            // back when Phoenix is revamped.
            archivedTotal: (archivedNodes.rows[0] as { count: number } | undefined)?.count ?? 0,
            edges: edges.rows,
            artifacts: artifacts.rows,
            placements: {
              byState: placeByState,
              proposedWithoutConfidence,
              // WHO actually decided each placement. Until a real classifier exists this is
              // 'app' / 'default_root' — never 'ai'. See PLACEMENT_PROVENANCE.
              byProvenance: Object.fromEntries(
                (provenance.rows as Array<{ proposed_by: string; count: number }>).map((r) => [r.proposed_by, r.count])
              ),
            },
            // Porter architecture rule 5: show REAL capability state. The auto-association
            // classifier is a deterministic stub — say so, rather than implying an AI filed these.
            classifier: {
              active: false,
              note: 'resolveProposedParentId is a deterministic stub — it passes through the parent the app supplied. No model call is made, and no confidence is scored.',
            },
            derivatives: {
              byStatus: derivByStatus,
              total: derivTotal,
              generated,
              missing,
              coveragePct: derivTotal > 0 ? Math.round((generated / derivTotal) * 1000) / 10 : 0,
              // Report the REAL limit. This was hardcoded to 25 and kept saying 25 after R6 raised it
              // to 100 — a dashboard that states a number the code does not use is worse than no number.
              batchLimitPerSweep: DEFAULT_BATCH_LIMIT,
              sweepIntervalHours: 24, // rides the every_24h workflow tick
              // Plain arithmetic, not a prediction: how long the current cap takes to drain.
              etaDays: missing > 0 ? Math.ceil(missing / DEFAULT_BATCH_LIMIT) : 0,
            },
          },
          request.id
        )
      );
    }
  );

  /**
   * #27 R4 — LIST placements. accept/refile/reject already existed, but only by id, and
   * nothing could enumerate the queue — so 4,900 AI-proposed placements sat unreviewable:
   * you cannot accept what you cannot list. This is the missing half of the review loop.
   */
  fastify.get(
    '/placements',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const query = (request.query ?? {}) as Record<string, unknown>;
      const scope = scopeOf({}, query);
      if (!scope) return reply.code(400).send(err('MISSING_SCOPE', 'scope is required', request.id));

      const state = typeof query.state === 'string' ? query.state.trim() : 'proposed';
      if (!['active', 'proposed', 'rejected', 'archived'].includes(state)) {
        return reply.code(400).send(err('INVALID_STATE', 'state must be active|proposed|rejected|archived', request.id));
      }
      const type = typeof query.type === 'string' ? query.type.trim() : '';
      const limitRaw = Number(query.limit ?? 50);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50;
      const offsetRaw = Number(query.offset ?? 0);
      const offset = Number.isFinite(offsetRaw) ? Math.max(Math.trunc(offsetRaw), 0) : 0;

      const params: unknown[] = [scope, state];
      let typeClause = '';
      if (type) {
        params.push(type);
        typeClause = ` AND n.type = $${params.length}`;
      }

      const total = (await pool.query(
        `SELECT count(*)::int AS c
           FROM vault_placements p JOIN vault_nodes n ON n.id = p.node_id
          WHERE p.app_scope = $1 AND p.state = $2${typeClause}`,
        params
      )).rows[0]?.c as number;

      params.push(limit, offset);
      const rows = (await pool.query(
        `SELECT p.id, p.node_id, p.parent_id, p.layer, p.state, p.confidence, p.proposed_by,
                n.type, n.title,
                parent.title AS parent_title, parent.type AS parent_type
           FROM vault_placements p
           JOIN vault_nodes n ON n.id = p.node_id
           LEFT JOIN vault_nodes parent ON parent.id = p.parent_id
          WHERE p.app_scope = $1 AND p.state = $2${typeClause}
          ORDER BY n.type, n.title
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      )).rows;

      return reply.send(ok({ scope, state, total, limit, offset, placements: rows }, request.id));
    }
  );

  /**
   * #27 R4b — accept a whole filtered slice of the review queue.
   *
   * A queue of 4,900 that you can only clear one row at a time is not a queue, it's a museum.
   * But "accept everything" with one click is how you rubber-stamp 4,900 AI guesses by accident.
   * So: the caller must pass a TYPE (you accept one kind of thing at a time, having looked at
   * that kind) and must echo back `expect` — the exact number the UI showed them. If the real
   * count has moved since they looked, this REFUSES rather than accepting a different set than
   * the one they saw.
   *
   * Every row goes through activateOneTx — the same schema/layer/cycle checks as a single
   * accept. Rows that fail validation are SKIPPED and reported, not silently dropped. Accept is
   * non-destructive (the incumbent is archived), so this is walk-back-able with a refile.
   */
  fastify.post(
    '/placements/bulk-accept',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const scope = scopeOf(body, (request.query ?? {}) as Record<string, unknown>);
      if (!scope) return reply.code(400).send(err('MISSING_SCOPE', 'scope is required', request.id));

      const type = typeof body.type === 'string' ? body.type.trim() : '';
      if (!type) {
        return reply
          .code(400)
          .send(err('MISSING_TYPE', 'type is required — accept one kind of thing at a time, deliberately', request.id));
      }
      const expect = Number(body.expect);
      if (!Number.isFinite(expect) || expect < 1) {
        return reply
          .code(400)
          .send(err('MISSING_EXPECT', 'expect (the count you were shown) is required', request.id));
      }

      const reviewer = request.sessionUser?.username ?? 'system';

      const ids = (await pool.query(
        `SELECT p.id FROM vault_placements p JOIN vault_nodes n ON n.id = p.node_id
          WHERE p.app_scope = $1 AND p.state = 'proposed' AND n.type = $2`,
        [scope, type]
      )).rows.map((r) => (r as { id: string }).id);

      // The set moved under them. Refuse — do not accept a different set than the one they saw.
      if (ids.length !== expect) {
        return reply
          .code(409)
          .send(
            err(
              'COUNT_CHANGED',
              `you were shown ${expect} proposed "${type}" placements but there are now ${ids.length}. Reload and look again.`,
              request.id
            )
          );
      }

      let accepted = 0;
      const skipped: Array<{ placementId: string; code: string; message: string }> = [];

      // One transaction per row: a single bad row must not roll back the 4,899 good ones.
      for (const id of ids) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const r = await activateOneTx(client, id, undefined, reviewer);
          if (r.ok) {
            await client.query('COMMIT');
            accepted++;
          } else {
            await client.query('ROLLBACK');
            skipped.push({ placementId: id, code: r.code, message: r.message });
          }
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          skipped.push({ placementId: id, code: 'ERROR', message: e instanceof Error ? e.message : String(e) });
        } finally {
          client.release();
        }
      }

      request.log.info({ scope, type, accepted, skipped: skipped.length, reviewer }, '[vault] bulk-accept');
      return reply.send(ok({ scope, type, requested: ids.length, accepted, skipped }, request.id));
    }
  );

  /**
   * #27 R4 — EXPLAIN a node: step through the logic behind everything attached to it.
   *
   * This is what Moe actually asked for: "a way to actually step thru your logic, because once you
   * exposed it visually I saw lots of weird associations and I just wanted an easy way to do this."
   *
   * What got built instead (by me) was a governance review queue — a gate that gated nothing, since
   * every reader already treated `proposed` and `active` alike. Worse, the graph could not have
   * answered him anyway: 1,731 of its 1,766 edges carried NO reason at all. You cannot step through
   * logic that was never recorded.
   *
   * So: every edge now records WHY it exists (rule + the source table/row that caused it), and this
   * endpoint hands that back for a single node — its parent, its associations, its files — each
   * with the reason and the row to blame. A wrong association can then be judged and CUT, instead
   * of merely distrusted.
   */
  fastify.get(
    '/nodes/:id/explain',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const id = (request.params as Record<string, string>).id;

      const node = (await pool.query(
        `SELECT id, app_scope, type, layer, title, status FROM vault_nodes WHERE id = $1`,
        [id],
      )).rows[0] as
        | { id: string; app_scope: string; type: string; layer: string; title: string; status: string }
        | undefined;
      if (!node) return reply.code(404).send(err('NODE_NOT_FOUND', `node "${id}" not found`, request.id));

      const [placements, edges, artifacts] = await Promise.all([
        // WHERE it is filed, and who decided that.
        pool.query(
          `SELECT p.id, p.state, p.layer, p.confidence, p.proposed_by, p.reviewed_by, p.reviewed_at,
                  p.parent_id, parent.title AS parent_title, parent.type AS parent_type
             FROM vault_placements p
             LEFT JOIN vault_nodes parent ON parent.id = p.parent_id
            WHERE p.node_id = $1 AND p.state <> 'archived'
            ORDER BY CASE p.state WHEN 'active' THEN 0 ELSE 1 END`,
          [id],
        ),
        // WHAT it is associated with, and WHY — both directions.
        pool.query(
          `SELECT e.id, e.kind, e.metadata, 'out' AS direction,
                  other.id AS other_id, other.title AS other_title, other.type AS other_type
             FROM vault_edges e JOIN vault_nodes other ON other.id = e.to_node_id
            WHERE e.from_node_id = $1
            UNION ALL
           SELECT e.id, e.kind, e.metadata, 'in' AS direction,
                  other.id, other.title, other.type
             FROM vault_edges e JOIN vault_nodes other ON other.id = e.from_node_id
            WHERE e.to_node_id = $1
            ORDER BY kind`,
          [id],
        ),
        // WHAT it actually is on disk / in the DB.
        pool.query(
          `SELECT id, kind, source_system, source_id, path, content_hash FROM vault_artifacts WHERE node_id = $1`,
          [id],
        ),
      ]);

      return reply.send(
        ok(
          {
            node,
            placements: placements.rows,
            edges: (edges.rows as Array<{ metadata: Record<string, unknown> | null }>).map((e) => ({
              ...e,
              // Surface the reason plainly. An edge with no rule cannot be audited — say so, do not
              // paper over it (architecture rule 5).
              why: e.metadata?.rule
                ? {
                    rule: e.metadata.rule,
                    sourceTable: e.metadata.sourceTable ?? null,
                    sourceId: e.metadata.sourceId ?? null,
                    note: e.metadata.note ?? null,
                  }
                : null,
            })),
            artifacts: artifacts.rows,
          },
          request.id,
        ),
      );
    },
  );

  /** Cut a wrong association. The edge is DELETED (it is a derived assertion, not a document) — the
   *  nodes, their placements and their files are untouched. Re-running the ingest would re-create it
   *  only if the underlying rule still fires, which is the correct behaviour: fix the data, not the
   *  symptom. */
  fastify.delete(
    '/edges/:id',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const id = (request.params as Record<string, string>).id;
      const row = (await pool.query(
        `DELETE FROM vault_edges WHERE id = $1 RETURNING id, kind, from_node_id, to_node_id, metadata`,
        [id],
      )).rows[0];
      if (!row) return reply.code(404).send(err('EDGE_NOT_FOUND', `edge "${id}" not found`, request.id));
      request.log.info({ edge: row, by: request.sessionUser?.username }, '[vault] association cut');
      return reply.send(ok({ cut: row }, request.id));
    },
  );

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
        // Edge-expansion: pull in 1-hop edge NEIGHBOURS of the focus subtree.
        // Placements only walk DOWN the tree, but a node's associations
        // (vault_edges) frequently point to nodes placed elsewhere — e.g. a
        // data_room's contents are `document --document_in_data_room--> room`
        // edges whose documents live under deals/people, NOT under the room.
        // Without this, focusing a room returns the room alone and the edge
        // filter (both endpoints must be in the set) drops every content edge,
        // so the room renders empty. Adding the neighbours makes incoming
        // associations (a room's "Contents", an entity's documents, …)
        // visible when a node is focused.
        const neighbourRows = (await pool.query(
          `SELECT DISTINCT nid FROM (
             SELECT to_node_id   AS nid FROM vault_edges WHERE app_scope = $1 AND from_node_id = ANY($2)
             UNION
             SELECT from_node_id AS nid FROM vault_edges WHERE app_scope = $1 AND to_node_id   = ANY($2)
           ) x`,
          [scope, focusIds]
        )).rows as Array<{ nid: string }>;
        const set = new Set(focusIds);
        for (const r of neighbourRows) set.add(r.nid);
        focusIds = Array.from(set);
      }

      // Nodes + their best placement (active preferred, else latest proposed).
      const params: unknown[] = [scope];
      // ARCHIVED nodes are NOT in the graph. This is the whole point of archiving.
      //
      // 2026-07-14: R1 archived 1,740 Phoenix nodes and I announced "Phoenix is out of the
      // knowledge graph" — but this query never filtered on status, so the graph kept serving all
      // 1,707 of them. Moe would have opened the vault and seen 1,702 cold prospects staring back.
      // Archiving that the reader ignores is not archiving; it is bookkeeping.
      let where = `n.app_scope = $1 AND n.status <> 'archived'`;
      if (layer) { params.push(layer); where += ` AND n.layer = $${params.length}`; }
      if (focusIds) { params.push(focusIds); where += ` AND n.id = ANY($${params.length})`; }
      // TOMBSTONE FILTER: a document node whose file locations are ALL absent
      // (moved/deleted, or PRUNED-AFTER-INGEST for privacy — e.g. a K-1 that was
      // ingested before the tax-PII rule existed) must NOT render. The admin
      // Files view already filters present=true; the graph did not, so pruned
      // personal-tax docs leaked as ghost nodes (Moe 2026-07-10). Non-document
      // nodes (domains/deals/people/entities) have no file locations, so the
      // filter only applies to type='document'.
      where += ` AND (n.type <> 'document' OR EXISTS (
        SELECT 1 FROM vault_artifact_locations val
         WHERE val.app_scope = n.app_scope AND val.document_node_id = n.id AND val.present = true))`;

      const nodeRows = (await pool.query(
        // parentTitle + titleAmbiguous exist to solve a real complaint: the graph drew ELEVEN
        // identical squares all labelled "Share Certificate.pdf". They are not duplicates — 11
        // distinct files, 11 distinct source rows; every entity has its own share certificate. But
        // the reader cannot know that, and a wall of identically-named nodes is exactly the "weird"
        // Moe saw. 571 document nodes across 265 colliding names are in this state.
        //
        // The node keeps its real title (renaming source data to suit a canvas would be a lie). We
        // just also return the parent's name, and a flag saying "this title is not unique here", so
        // a label can read "Share Certificate.pdf — Stablekey Holdings" instead of leaving the
        // reader to guess. Which of those the UI shows is a design decision; having the information
        // is not.
        `SELECT n.id, n.external_id, n.layer, n.type, n.title, n.status,
                pl.id AS placement_id, pl.parent_id, pl.state AS placement_state, pl.confidence,
                par.title AS parent_title,
                (amb.n > 1) AS title_ambiguous,
                src.kind AS source_kind, src.source_system, src.source_id, src.path AS source_path
         FROM vault_nodes n
         LEFT JOIN LATERAL (
           SELECT id, parent_id, state, confidence FROM vault_placements p
           WHERE p.app_scope = n.app_scope AND p.node_id = n.id AND p.layer = n.layer
             AND p.state IN ('active','proposed')
           ORDER BY CASE p.state WHEN 'active' THEN 0 ELSE 1 END, p.created_at DESC
           LIMIT 1
         ) pl ON true
         LEFT JOIN vault_nodes par
           ON par.id = pl.parent_id AND par.app_scope = n.app_scope
         LEFT JOIN LATERAL (
           SELECT count(*)::int AS n FROM vault_nodes d
           WHERE d.app_scope = n.app_scope AND d.status <> 'archived'
             AND d.type = n.type AND d.title = n.title
         ) amb ON true
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
        parent_title: string | null; title_ambiguous: boolean;
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
        parentTitle: r.parent_title,
        // true when another LIVE node of the same type carries this exact title — i.e. the label
        // alone cannot identify this node, and the UI should qualify it with parentTitle.
        titleAmbiguous: r.title_ambiguous === true,
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

      // Non-node app records that concern this node (e.g. tom_tasks). Open ones
      // first so the review/detail surface can show "N open tasks concern this".
      const recordLinkRows = (await pool.query(
        `SELECT id, source_table, source_id, kind, status, confidence, metadata, created_at
         FROM vault_record_links WHERE app_scope = $1 AND to_node_id = $2
         ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at DESC LIMIT 50`,
        [node.app_scope, node.id]
      )).rows as Array<{
        id: string; source_table: string; source_id: string; kind: string; status: string;
        confidence: number | null; metadata: Record<string, unknown>; created_at: number;
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
            recordLinks: recordLinkRows.map((r) => ({
              id: r.id, sourceTable: r.source_table, sourceId: r.source_id, kind: r.kind,
              status: r.status, confidence: r.confidence, metadata: r.metadata, createdAt: r.created_at,
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

  // POST /api/v1/vault/record-links — link a NON-node app record (source_table +
  // source_id, e.g. a transient tom_tasks row) to the vault node(s) it concerns.
  // Distinct from /edges (node↔node): the source is NOT a vault node. Apps push
  // these AFTER ingest (the target node must already exist). Idempotent per
  // (scope, source_table, source_id, to_node_id, kind); a re-push updates
  // status/confidence/metadata. Completing/dropping the app record = re-push with
  // status='completed'/'dismissed' — it NEVER mutates the vault fact graph.
  //
  // Body: { app_scope, links: [{ sourceTable, sourceId, toExternalId, kind,
  //           status?, confidence?, metadata? }] }
  fastify.post(
    '/record-links',
    { preHandler: [fastify.requireAuth] },
    async (request: FastifyRequest, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const scope = scopeOf(body, {});
      if (!scope) return reply.code(400).send(err('MISSING_SCOPE', 'app_scope is required', request.id));
      const links = body.links;
      if (!Array.isArray(links) || links.length === 0) {
        return reply.code(400).send(err('MISSING_LINKS', 'links must be a non-empty array', request.id));
      }
      if (links.length > 10000) {
        return reply.code(400).send(err('TOO_MANY_LINKS', 'max 10000 links per call', request.id));
      }

      const rows = (await pool.query(
        `SELECT external_id, id FROM vault_nodes WHERE app_scope = $1`,
        [scope]
      )).rows as Array<{ external_id: string; id: string }>;
      const idByExternal = new Map(rows.map((r) => [r.external_id, r.id]));

      const LINK_STATUSES = new Set(['open', 'completed', 'dismissed']);
      const now = Date.now() / 1000;
      const results: Array<Record<string, unknown>> = [];
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (let i = 0; i < links.length; i++) {
          const l = links[i] as Record<string, unknown>;
          const sourceTable = typeof l.sourceTable === 'string' ? l.sourceTable.trim() : '';
          const sourceId = typeof l.sourceId === 'string' ? l.sourceId.trim()
            : (typeof l.sourceId === 'number' ? String(l.sourceId) : '');
          const toExt = typeof l.toExternalId === 'string' ? l.toExternalId.trim() : '';
          const kind = typeof l.kind === 'string' ? l.kind.trim() : '';
          if (!sourceTable || !sourceId || !toExt || !kind) {
            await client.query('ROLLBACK');
            return reply.code(400).send(err('INVALID_LINK', `link ${i} needs sourceTable, sourceId, toExternalId, kind`, request.id));
          }
          const status = typeof l.status === 'string' && LINK_STATUSES.has(l.status.trim()) ? l.status.trim() : 'open';
          const confidence = typeof l.confidence === 'number' ? l.confidence : null;
          const meta = (l.metadata && typeof l.metadata === 'object' ? l.metadata : {}) as Record<string, unknown>;
          const toId = idByExternal.get(toExt);
          if (!toId) {
            results.push({ index: i, skipped: true, reason: `unresolved ${toExt}` });
            continue;
          }
          const dupe = (await client.query(
            `SELECT id FROM vault_record_links WHERE app_scope=$1 AND source_table=$2 AND source_id=$3 AND to_node_id=$4 AND kind=$5`,
            [scope, sourceTable, sourceId, toId, kind]
          )).rows[0] as { id: string } | undefined;
          if (dupe) {
            await client.query(
              `UPDATE vault_record_links SET status=$1, confidence=$2, metadata=$3::jsonb, updated_at=$4 WHERE id=$5`,
              [status, confidence, JSON.stringify(meta), now, dupe.id]
            );
            results.push({ index: i, id: dupe.id, action: 'updated' });
          } else {
            const id = crypto.randomUUID();
            await client.query(
              `INSERT INTO vault_record_links (id, app_scope, source_table, source_id, to_node_id, kind, status, confidence, metadata, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$10)`,
              [id, scope, sourceTable, sourceId, toId, kind, status, confidence, JSON.stringify(meta), now]
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
      return reply.send(ok({ appScope: scope, created, updated, skipped, total: links.length, results }, request.id));
    }
  );
}

/**
 * Activate a placement (accept, or refile under a new parent). `newParentId`:
 * undefined = keep the placement's current parent (accept); null = root; string = re-parent.
 * Demotes any existing active placement for the same (scope, node, layer) to 'archived'.
 * Enforces the scope's declared parentTypes and rejects cycles.
 */
type ActivateOutcome =
  | { ok: true; placementId: string; nodeId: string; layer: string; parentId: string | null }
  | { ok: false; status: number; code: string; message: string };

/**
 * Activate ONE placement inside a caller-supplied transaction.
 *
 * This is the single implementation of "what accepting a placement means" — schema check,
 * layer check, cycle guard, demote-the-incumbent, activate. The single-accept route and the
 * bulk-accept route BOTH go through it. Two copies of this logic would drift, and the copy
 * that drifted would be the one that lets a cycle in.
 *
 * Non-destructive by construction: the previously-active placement is ARCHIVED, never deleted,
 * so an accept can always be walked back with a refile.
 */
async function activateOneTx(
  client: import('pg').PoolClient,
  placementId: string,
  newParentId: string | null | undefined,
  reviewer: string
): Promise<ActivateOutcome> {
  const pl = (await client.query(
    `SELECT id, app_scope, node_id, parent_id, layer, state FROM vault_placements WHERE id = $1 FOR UPDATE`,
    [placementId]
  )).rows[0] as
    | { id: string; app_scope: string; node_id: string; parent_id: string | null; layer: string; state: string }
    | undefined;
  if (!pl) {
    return { ok: false, status: 404, code: 'PLACEMENT_NOT_FOUND', message: `placement "${placementId}" not found` };
  }
  if (pl.state === 'archived' || pl.state === 'rejected') {
    return { ok: false, status: 409, code: 'PLACEMENT_CLOSED', message: `placement is ${pl.state}; cannot activate` };
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
      return { ok: false, status: 400, code: 'INVALID_PARENT', message: `parent "${targetParent}" not in scope "${scope}"` };
    }
    if (parent.layer !== pl.layer) {
      return { ok: false, status: 400, code: 'LAYER_MISMATCH', message: `parent is in layer "${parent.layer}", node is "${pl.layer}"` };
    }
    const child = (await client.query(`SELECT type FROM vault_nodes WHERE id = $1`, [pl.node_id])).rows[0] as { type: string } | undefined;
    const schema = await loadSchema(scope);
    const decl = child ? schema.get(child.type) : undefined;
    if (decl && !decl.parentTypes.includes(parent.type)) {
      return { ok: false, status: 400, code: 'HIERARCHY_VIOLATION', message: `parent type "${parent.type}" not allowed under "${child!.type}"` };
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
      return { ok: false, status: 400, code: 'CYCLE', message: `parent "${targetParent}" is within the node's own subtree` };
    }
  }

  const now = Date.now() / 1000;
  // Demote any current active placement for this node+layer. ARCHIVED, not deleted.
  await client.query(
    `UPDATE vault_placements SET state = 'archived', reviewed_by = $1, reviewed_at = $2
     WHERE app_scope = $3 AND node_id = $4 AND layer = $5 AND state = 'active' AND id <> $6`,
    [reviewer, now, scope, pl.node_id, pl.layer, placementId]
  );
  await client.query(
    `UPDATE vault_placements SET state = 'active', parent_id = $1, reviewed_by = $2, reviewed_at = $3 WHERE id = $4`,
    [targetParent, reviewer, now, placementId]
  );

  return { ok: true, placementId, nodeId: pl.node_id, layer: pl.layer, parentId: targetParent };
}

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
    const r = await activateOneTx(client, placementId, newParentId, reviewer);
    if (!r.ok) {
      await client.query('ROLLBACK');
      return reply.code(r.status).send(err(r.code, r.message, request.id));
    }
    await client.query('COMMIT');
    return reply.send(
      ok(
        { placementId: r.placementId, nodeId: r.nodeId, layer: r.layer, parentId: r.parentId, state: 'active', reviewedBy: reviewer },
        request.id
      )
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
