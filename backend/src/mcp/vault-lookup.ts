/**
 * Porter MCP — vault lookup helpers.
 *
 * Thin, read-only query layer over the SAME tables the HTTP vault routes use
 * (vault_nodes / vault_artifacts / vault_placements / vault_edges — see
 * routes/v1/vault.ts). Nothing here writes to the vault. Scope-generic: every
 * function takes `scope` as a parameter, nothing is hardcoded to a specific
 * product/tenant.
 *
 * This module is the backing for two MCP tools:
 *   - porter_search_vault    — searchVaultNodes()
 *   - porter_get_context_pack — buildContextPack() (search + content resolve + cap)
 */

import { promises as fs } from 'node:fs';
import { pool } from '../db/client.js';

export interface VaultNodeHit {
  id: string;
  externalId: string;
  type: string;
  layer: string;
  title: string;
  status: string;
  titleMatch: boolean;
}

/**
 * Tokenized search across node titles + artifact metadata (cast to text) for
 * a scope. A multi-word query (e.g. "Edward Chen workout") is split into
 * tokens and EVERY token must appear somewhere (title OR any artifact's
 * metadata) for a node to match — order/adjacency don't matter, so a query
 * doesn't need to be a literal substring of the title. No FTS index
 * required — the vault is a few thousand rows per scope today, ILIKE is
 * plenty fast. Ranked by how many tokens landed in the title, then title.
 */
export async function searchVaultNodes(
  scope: string,
  query: string,
  opts: { layer?: string; limit?: number } = {}
): Promise<VaultNodeHit[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = Math.max(1, Math.min(opts.limit ?? 15, 50));
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2).slice(0, 8);
  if (tokens.length === 0) return [];

  const params: unknown[] = [scope];
  let layerClause = '';
  if (opts.layer) {
    params.push(opts.layer);
    layerClause = ` AND n.layer = $${params.length}`;
  }

  const tokenClauses: string[] = [];
  const titleMatchTerms: string[] = [];
  for (const t of tokens) {
    params.push(`%${t}%`);
    const idx = params.length;
    tokenClauses.push(
      `(n.title ILIKE $${idx} OR EXISTS (
         SELECT 1 FROM vault_artifacts a
         WHERE a.app_scope = n.app_scope AND a.node_id = n.id AND a.metadata::text ILIKE $${idx}
       ))`
    );
    titleMatchTerms.push(`(CASE WHEN n.title ILIKE $${idx} THEN 1 ELSE 0 END)`);
  }

  const rows = (await pool.query(
    `SELECT n.id, n.external_id, n.type, n.layer, n.title, n.status,
            (${titleMatchTerms.join(' + ')}) AS title_match_count
     FROM vault_nodes n
     WHERE n.app_scope = $1
       ${layerClause}
       AND ${tokenClauses.join('\n       AND ')}
     ORDER BY title_match_count DESC, n.title ASC
     LIMIT ${limit}`,
    params
  )).rows as Array<{
    id: string; external_id: string; type: string; layer: string; title: string;
    status: string; title_match_count: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    externalId: r.external_id,
    type: r.type,
    layer: r.layer,
    title: r.title,
    status: r.status,
    titleMatch: r.title_match_count > 0,
  }));
}

interface ArtifactRow {
  id: string;
  kind: string;
  source_system: string | null;
  source_id: string | null;
  path: string | null;
  content_hash: string | null;
  metadata: Record<string, unknown>;
}

const MAX_FILE_READ_BYTES = 500_000; // bounded local read (context-pack scale, not derivative-loop scale)

/**
 * Resolve the best available snippet of content for a node: prefer a
 * generated markdown_derivative, else raw_file (inline metadata.content, or
 * a bounded local disk read at artifact.path), else a compact stringified
 * db_entity metadata blob, else null (nothing resolvable).
 * Mirrors the resolution order in services/vault-derivatives.ts but reads
 * only — never generates or writes anything.
 */
export async function resolveNodeContent(
  scope: string,
  nodeId: string
): Promise<{ content: string | null; source: string | null }> {
  const artifacts = (await pool.query(
    `SELECT id, kind, source_system, source_id, path, content_hash, metadata
     FROM vault_artifacts WHERE app_scope = $1 AND node_id = $2
     ORDER BY created_at DESC`,
    [scope, nodeId]
  )).rows as ArtifactRow[];

  const byKind = (k: string) => artifacts.find((a) => a.kind === k);

  const derivative = byKind('markdown_derivative');
  if (derivative && typeof derivative.metadata?.content === 'string' && derivative.metadata.content.trim()) {
    return { content: derivative.metadata.content as string, source: `artifact:${derivative.id} (markdown_derivative)` };
  }

  const raw = byKind('raw_file');
  if (raw) {
    if (typeof raw.metadata?.content === 'string' && raw.metadata.content.trim()) {
      return { content: raw.metadata.content as string, source: `artifact:${raw.id} (raw_file, inline)` };
    }
    if (raw.path) {
      try {
        const stat = await fs.stat(raw.path);
        if (stat.isFile() && stat.size <= MAX_FILE_READ_BYTES) {
          const text = await fs.readFile(raw.path, 'utf8');
          return { content: text, source: `artifact:${raw.id} (raw_file, ${raw.path})` };
        }
      } catch {
        // not locally readable — fall through
      }
    }
  }

  const dbEntity = byKind('db_entity');
  if (dbEntity && dbEntity.metadata && Object.keys(dbEntity.metadata).length) {
    const compact = JSON.stringify(dbEntity.metadata, null, 0);
    return { content: compact, source: `artifact:${dbEntity.id} (db_entity, ${dbEntity.source_system ?? 'unknown source'})` };
  }

  return { content: null, source: null };
}

export interface ChildSummary { title: string; type: string; }
export interface EdgeSummary { kind: string; direction: 'out' | 'in'; title: string; type: string; }

/** Up to `limit` direct children (active/proposed placements) of a node. */
export async function getChildren(scope: string, nodeId: string, limit = 6): Promise<ChildSummary[]> {
  const rows = (await pool.query(
    `SELECT n.title, n.type
     FROM vault_placements p JOIN vault_nodes n ON n.id = p.node_id
     WHERE p.app_scope = $1 AND p.parent_id = $2 AND p.state IN ('active','proposed')
     ORDER BY n.title LIMIT ${Math.max(1, Math.min(limit, 25))}`,
    [scope, nodeId]
  )).rows as ChildSummary[];
  return rows;
}

/** Up to `limit` non-hierarchical edges touching a node, in either direction. */
export async function getRelatedEdges(scope: string, nodeId: string, limit = 6): Promise<EdgeSummary[]> {
  const rows = (await pool.query(
    `SELECT e.kind,
            CASE WHEN e.from_node_id = $2 THEN 'out' ELSE 'in' END AS direction,
            n2.title, n2.type
     FROM vault_edges e
     JOIN vault_nodes n2 ON n2.id = (CASE WHEN e.from_node_id = $2 THEN e.to_node_id ELSE e.from_node_id END)
     WHERE e.app_scope = $1 AND (e.from_node_id = $2 OR e.to_node_id = $2)
     LIMIT ${Math.max(1, Math.min(limit, 25))}`,
    [scope, nodeId]
  )).rows as EdgeSummary[];
  return rows;
}
