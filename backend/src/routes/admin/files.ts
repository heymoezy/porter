/**
 * Porter Files Directory API (R5) — the graph-organized, content-deduped
 * document view Moe asked for ("all documents within the apps should be
 * visible in porter files directory, properly organised in a way that
 * reflects the knowledge graph. these should be in perfect sync completely
 * deduped"). Read-only surface over tables populated by R1-R4:
 *   vault_nodes(type='document', external_id='content:sha256:<hash>')
 *   vault_artifact_locations (physical paths, present/missing_since)
 *   vault_placements (state active|proposed|rejected|archived)
 *
 * Grouping key: `vault_artifact_locations.documents_root_node_id` — NOT a
 * walk of vault_placements. The #30 association engine also links document
 * nodes to deals/persons/entities/etc for a different purpose (task/record
 * association), so a document's placement parent is frequently NOT its
 * documents_root. documents_root_node_id is written once at ingest time by
 * the raw_file location upsert and is the reliable "project" grouping for
 * Files (verified live: exactly the 6 real documents_root containers).
 *
 * A document is "archived/tombstoned" (hidden here) when it has an
 * 'archived' vault_placements row — that's what R4's reconcile pass sets
 * when a content node's locations all go present=false. We don't need a
 * separate reconcile check here; reconcile already flipped locations to
 * present=false, and the `present=true` filter below does the rest. The
 * archived-placement check is a belt-and-braces guard against a future
 * document being tombstoned while a stale location row still says present.
 */
import { FastifyInstance } from 'fastify';
import { ok, err } from '../../lib/admin-envelope.js';
import { pool } from '../../db/client.js';

const NOT_ARCHIVED_SQL = `
  NOT EXISTS (
    SELECT 1 FROM vault_placements vp
    WHERE vp.node_id = val.document_node_id AND vp.state = 'archived'
  )
`;

interface LocationRow {
  document_node_id: string;
  content_hash: string;
  absolute_path: string;
  relative_path: string | null;
  size_bytes: string | number | null;
}

/** `vault_artifact_locations.mtime_ns` is documented (schema.ts) as text
 * nanoseconds, but the live ymc ingest actually writes ISO-8601 timestamp
 * strings (verified: `SELECT mtime_ns ...` returns e.g.
 * '2026-04-10T04:08:08.346Z', not a nanosecond integer). Handle both without
 * touching the ingest script: numeric strings are nanoseconds-since-epoch,
 * anything else is parsed as a date string. Returns an ISO string or null. */
function parseMtime(mtimeNs: string | null | undefined): string | null {
  if (!mtimeNs) return null;
  if (/^\d+$/.test(mtimeNs)) {
    return new Date(Number(BigInt(mtimeNs) / 1_000_000n)).toISOString();
  }
  const parsed = new Date(mtimeNs);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Canonical path rule (planning/porter-files-directory.md): among a set of
 * present locations, shallowest path depth first, then shortest absolute
 * path, then lexicographic. */
function pickCanonical<T extends { absolute_path: string }>(locs: T[]): T | undefined {
  return [...locs].sort((a, b) => {
    const depthA = a.absolute_path.split('/').length;
    const depthB = b.absolute_path.split('/').length;
    if (depthA !== depthB) return depthA - depthB;
    if (a.absolute_path.length !== b.absolute_path.length) return a.absolute_path.length - b.absolute_path.length;
    return a.absolute_path.localeCompare(b.absolute_path);
  })[0];
}

export default async function filesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/files/apps — every app_scope that has Files-eligible
  // document nodes (i.e. at least one present, non-archived location).
  fastify.get('/apps', async (_req, reply) => {
    const { rows } = await pool.query(`
      SELECT val.app_scope,
        count(DISTINCT val.documents_root_node_id) AS project_count,
        count(DISTINCT val.document_node_id)       AS document_count,
        count(*)                                    AS location_count
      FROM vault_artifact_locations val
      WHERE val.present = true AND ${NOT_ARCHIVED_SQL}
      GROUP BY val.app_scope
      ORDER BY val.app_scope
    `);
    return reply.send(ok(rows.map((r) => ({
      appScope: r.app_scope as string,
      projectCount: Number(r.project_count),
      documentCount: Number(r.document_count),
      locationCount: Number(r.location_count),
    }))));
  });

  // GET /api/admin/files/tree?app_scope=ymc — app_scope -> documents_root
  // (project) -> documents. Present locations only; tombstones hidden.
  fastify.get('/tree', async (req, reply) => {
    const q = (req.query ?? {}) as { app_scope?: string };
    const appScope = q.app_scope;
    if (!appScope) {
      reply.code(400);
      return err('MISSING_APP_SCOPE', 'app_scope query param is required');
    }

    const [projectsRes, docAggRes, membershipRes] = await Promise.all([
      pool.query(`
        SELECT val.documents_root_node_id AS node_id, vn.title,
          count(DISTINCT val.document_node_id) AS document_count,
          count(*)                             AS location_count
        FROM vault_artifact_locations val
        JOIN vault_nodes vn ON vn.id = val.documents_root_node_id
        WHERE val.app_scope = $1 AND val.present = true AND ${NOT_ARCHIVED_SQL}
        GROUP BY val.documents_root_node_id, vn.title
        ORDER BY vn.title
      `, [appScope]),
      // Per-document aggregates GLOBAL across all its present locations
      // (a document can physically live under >1 project).
      pool.query(`
        SELECT document_node_id, content_hash, absolute_path, relative_path, size_bytes
        FROM vault_artifact_locations
        WHERE app_scope = $1 AND present = true
      `, [appScope]),
      pool.query(`
        SELECT DISTINCT val.documents_root_node_id AS project_node_id, val.document_node_id, vn.title
        FROM vault_artifact_locations val
        JOIN vault_nodes vn ON vn.id = val.document_node_id
        WHERE val.app_scope = $1 AND val.present = true AND ${NOT_ARCHIVED_SQL}
      `, [appScope]),
    ]);

    const locsByDoc = new Map<string, LocationRow[]>();
    for (const r of docAggRes.rows as LocationRow[]) {
      const list = locsByDoc.get(r.document_node_id) ?? [];
      list.push(r);
      locsByDoc.set(r.document_node_id, list);
    }

    function docSummary(documentNodeId: string, title: string) {
      const locs = locsByDoc.get(documentNodeId) ?? [];
      const canonical = pickCanonical(locs);
      return {
        nodeId: documentNodeId,
        title,
        contentHash: canonical?.content_hash ?? locs[0]?.content_hash ?? null,
        canonicalPath: canonical?.absolute_path ?? null,
        locationCount: locs.length,
        sizeBytes: canonical?.size_bytes != null ? Number(canonical.size_bytes) : null,
      };
    }

    const docsByProject = new Map<string, ReturnType<typeof docSummary>[]>();
    for (const m of membershipRes.rows) {
      const list = docsByProject.get(m.project_node_id) ?? [];
      list.push(docSummary(m.document_node_id, m.title));
      docsByProject.set(m.project_node_id, list);
    }

    const projects = projectsRes.rows.map((p) => ({
      nodeId: p.node_id as string,
      title: p.title as string,
      documentCount: Number(p.document_count),
      locationCount: Number(p.location_count),
      documents: (docsByProject.get(p.node_id) ?? []).sort((a, b) => a.title.localeCompare(b.title)),
    }));

    return reply.send(ok({ appScope, projects }));
  });

  // GET /api/admin/files/document/:nodeId — full detail panel payload.
  // Locations include BOTH present and absent rows (each carries its own
  // `present` flag) so the panel can show freshness/history honestly;
  // the tree/list views are the ones that hide all-absent documents.
  fastify.get('/document/:nodeId', async (req, reply) => {
    const { nodeId } = req.params as { nodeId: string };

    const nodeRes = await pool.query(
      `SELECT id, app_scope, title FROM vault_nodes WHERE id = $1 AND type = 'document'`,
      [nodeId]
    );
    const node = nodeRes.rows[0] as { id: string; app_scope: string; title: string } | undefined;
    if (!node) {
      reply.code(404);
      return err('NOT_FOUND', 'Document node not found');
    }

    const locRes = await pool.query(`
      SELECT val.absolute_path, val.relative_path, val.documents_root_node_id,
             dvn.title AS project_title, val.present, val.size_bytes,
             val.mtime_ns, val.last_seen_at, val.missing_since, val.content_hash
      FROM vault_artifact_locations val
      LEFT JOIN vault_nodes dvn ON dvn.id = val.documents_root_node_id
      WHERE val.document_node_id = $1
      ORDER BY val.present DESC, val.absolute_path
    `, [nodeId]);

    const presentLocs = locRes.rows.filter((r) => r.present);
    const canonical = pickCanonical(presentLocs.length ? presentLocs : locRes.rows);

    const projects = [...new Map(
      presentLocs.map((r) => [r.documents_root_node_id, r.project_title])
    ).entries()].map(([id, title]) => ({ nodeId: id, title }));

    const mtime = parseMtime(canonical?.mtime_ns ?? null);

    return reply.send(ok({
      nodeId: node.id,
      title: node.title,
      contentHash: canonical?.content_hash ?? locRes.rows[0]?.content_hash ?? null,
      canonicalPath: canonical?.absolute_path ?? null,
      locations: locRes.rows.map((r) => ({
        absolutePath: r.absolute_path,
        relativePath: r.relative_path,
        project: r.project_title,
        present: r.present,
        sizeBytes: r.size_bytes != null ? Number(r.size_bytes) : null,
      })),
      projects,
      sizeBytes: canonical?.size_bytes != null ? Number(canonical.size_bytes) : null,
      mtime,
    }));
  });

  // POST /api/admin/files/sync {app_scope} — Porter does NOT run app-side
  // filesystem scans itself (no mechanism exists yet to invoke one remotely).
  // This returns the honest, exact command the operator runs in that app's
  // own repo/session. No fake "triggered: true".
  const SYNC_COMMANDS: Record<string, { command: string; cwd: string; note: string }> = {
    ymc: {
      command: 'npx tsx scripts/vault-ingest-files.ts --commit',
      cwd: '/home/lobster/projects/ymc.capital/backend',
      note: 'Scans ymc\'s declared document roots, POSTs raw_file ingest + reconcile to Porter in one run. Must be run from the ymc host/session — Porter has no remote-exec mechanism for app scanners.',
    },
  };

  fastify.post('/sync', async (req, reply) => {
    const body = (req.body ?? {}) as { app_scope?: string; appScope?: string };
    const appScope = body.app_scope ?? body.appScope;
    if (!appScope) {
      reply.code(400);
      return err('MISSING_APP_SCOPE', 'app_scope is required');
    }

    const known = SYNC_COMMANDS[appScope];
    if (!known) {
      return reply.send(ok({
        appScope,
        triggered: false,
        message: `No file scanner is configured for app_scope "${appScope}" yet. Porter has no mechanism to invoke one — nothing was run.`,
      }));
    }

    return reply.send(ok({
      appScope,
      triggered: false,
      message: `Porter cannot execute this sync itself. Run the command below in the ${appScope} app's own backend, then re-open this tree.`,
      command: known.command,
      cwd: known.cwd,
      note: known.note,
    }));
  });
}
