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
 *
 * ── THREE STORES, ONE ANSWER (2026-08-01) ───────────────────────────────────
 *
 * Porter keeps knowledge in three places, and they are NOT copies of each other:
 *
 *   - `vault_nodes` + friends — the ENTITY/DOCUMENT graph. Hierarchy, edges,
 *     artifacts, a review queue. This is where "the Edward Chen PDFs" live.
 *     App-scoped (`app_scope`).
 *   - `concepts` — the durable-truth memory layer. Flat rows, FTS via the
 *     `concepts_search_update` trigger. This is where "our RMI redomiciliation
 *     position" lives (`source_type='vault'`, written by
 *     services/intellect/vault-indexer.ts from the markdown vault), alongside
 *     agent memory and distilled learnings.
 *   - `directives` — the operating-rules layer, highest trust.
 *
 * Until now this module only read the graph, so a session asking one tool got
 * a third of Porter's knowledge. Worse, `ymc.capital`'s vault-ingest was
 * COPYING vault concepts / directives / agent knowledge into `vault_nodes` to
 * paper over the gap — 108 second copies that then drifted (9 of them showed
 * `active` while the directive they copied was already archived).
 *
 * The fix is here, not there: search ALL THREE and merge. The ingest keeps one
 * writer per fact; this reader spans them. Coverage goes up — 47 vault
 * concepts, 144 agent/distilled rows and 93 live directives become searchable
 * for the first time — and duplication goes to zero.
 *
 * `concepts` and `directives` are NOT app-scoped — their `scope`/`scope_id` are
 * MEMORY scopes ('global', 'agent'/'tom', 'project'/…), a different axis from
 * the vault's `app_scope`. Filtering one by the other would silently drop Tom's
 * memory from every ymc query. So the memory arms filter on `status='active'`
 * only, and that is deliberate, not an oversight.
 */

import { promises as fs } from 'node:fs';
import { pool } from '../db/client.js';
import { visibleNodeSql } from '../lib/vault-visibility.js';

export interface VaultNodeHit {
  id: string;
  externalId: string;
  type: string;
  layer: string;
  title: string;
  status: string;
  titleMatch: boolean;
  /** Which store answered: the vault graph, or one of Porter's memory tables. */
  store: 'graph' | 'concepts' | 'directives';
}

/**
 * Hit ids from the memory arms carry a prefix so `resolveNodeContent` can tell
 * the stores apart from the id alone (vault_nodes.id is a UUID; concepts.id and
 * directives.id are free text like `vault:concepts/rmi-redomiciliation` or
 * `tom-log-commitments-2026-05-20`). One prefix per store, checked in one
 * place — never a heuristic on id shape.
 */
const CONCEPTS_ID_PREFIX = 'concepts:';
const DIRECTIVES_ID_PREFIX = 'directives:';
const MEMORY_ID_PREFIXES = [CONCEPTS_ID_PREFIX, DIRECTIVES_ID_PREFIX];

/** True for a hit id produced by a memory arm rather than the vault graph. */
function isMemoryId(id: string): boolean {
  return MEMORY_ID_PREFIXES.some((p) => id.startsWith(p));
}

/**
 * Tokenized search across node titles + artifact metadata (cast to text) for
 * a scope. A multi-word query (e.g. "Edward Chen workout") is split into
 * tokens and EVERY token must appear somewhere (title OR any artifact's
 * metadata) for a node to match — order/adjacency don't matter, so a query
 * doesn't need to be a literal substring of the title. No FTS index
 * required — the vault is a few thousand rows per scope today, ILIKE is
 * plenty fast. Ranked by how many tokens landed in the title, then title.
 *
 * Results are MERGED with the memory arms below — see the module header.
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

  // `layer:'data'` means "entities/documents only" — concepts and directives
  // are learning knowledge by construction, so that filter excludes them.
  const memoryWanted = opts.layer !== 'data';

  const [graphHits, conceptHits, directiveHits] = await Promise.all([
    searchGraphNodes(scope, tokens, opts.layer, limit),
    memoryWanted ? searchConcepts(tokens, limit) : Promise.resolve([]),
    memoryWanted ? searchDirectives(tokens, limit) : Promise.resolve([]),
  ]);

  return mergeHits(graphHits, [...directiveHits, ...conceptHits], limit);
}

/**
 * Merge the graph arm and the memory arms into one ranked list.
 *
 * A naive concat + sort would let a query with many document hits ("Edward
 * Chen" returns 15) fill every slot and hide the one rule or concept that
 * actually answers the question — which is the failure mode this whole change
 * exists to remove. So memory gets a RESERVED share of the budget (a third,
 * rounded up) when it matched at all; whatever either side doesn't use goes
 * back to the other. Within the merged set, title matches still outrank
 * body-only matches.
 *
 * Directives are listed ahead of concepts inside the memory share because they
 * are the higher-trust layer (an operating rule beats a durable truth when both
 * mention the same thing).
 */
function mergeHits(graphHits: VaultNodeHit[], memoryHits: VaultNodeHit[], limit: number): VaultNodeHit[] {
  const reserved = Math.min(memoryHits.length, Math.ceil(limit / 3));
  const picked = [
    ...graphHits.slice(0, limit - reserved),
    ...memoryHits.slice(0, reserved),
  ];
  if (picked.length < limit) {
    const seen = new Set(picked.map((h) => h.id));
    for (const h of [...graphHits, ...memoryHits]) {
      if (picked.length >= limit) break;
      if (!seen.has(h.id)) { picked.push(h); seen.add(h.id); }
    }
  }
  return picked.sort((a, b) => {
    if (a.titleMatch !== b.titleMatch) return a.titleMatch ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

async function searchGraphNodes(
  scope: string,
  tokens: string[],
  layer: string | undefined,
  limit: number
): Promise<VaultNodeHit[]> {
  const params: unknown[] = [scope];
  let layerClause = '';
  if (layer) {
    params.push(layer);
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
       -- ARCHIVED nodes are NOT results. routes/v1/vault.ts learned this on
       -- 2026-07-14 (1,740 Phoenix nodes archived, graph kept serving all of
       -- them because its query never filtered status) and this reader was never
       -- given the same filter — so porter_search_vault has been handing back
       -- 1,702 cold prospects, pruned personal documents and superseded rules as
       -- live knowledge ever since. Archiving that the reader ignores is not
       -- archiving; it is bookkeeping.
       -- 2026-09-03, same lesson again: the file scanner retired a private root,
       -- /reconcile flipped all 43 of its locations absent, the graph hid its 36
       -- documents, and this reader kept returning them (status was still
       -- 'active'; only their locations were gone). visibleNodeSql() is the one
       -- predicate the graph and this reader now share.
       AND ${visibleNodeSql('n')}
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
    store: 'graph' as const,
  }));
}

/**
 * The `concepts` arm. Same AND-over-tokens semantics as the graph arm, so a
 * query behaves identically in both stores — deliberately ILIKE over `content`
 * rather than the FTS index, because `plainto_tsquery` stems and would make
 * "Edward Chen" behave one way here and another way there. The FTS index still
 * earns its keep in memory-injection; this tool wants predictability.
 *
 * A concept row has no title column: vault-indexer.ts writes `title\nbody`, and
 * the other writers put the substance on line one too, so the first line IS the
 * title. Matching it is what marks a hit as a title match.
 *
 * No app-scope filter — see the module header. `status='active'` only:
 * archived concepts are superseded knowledge and must never surface as current.
 */
async function searchConcepts(tokens: string[], limit: number): Promise<VaultNodeHit[]> {
  const params: unknown[] = [];
  const tokenClauses: string[] = [];
  const titleMatchTerms: string[] = [];
  for (const t of tokens) {
    params.push(`%${t}%`);
    const idx = params.length;
    tokenClauses.push(`c.content ILIKE $${idx}`);
    titleMatchTerms.push(`(CASE WHEN split_part(c.content, E'\\n', 1) ILIKE $${idx} THEN 1 ELSE 0 END)`);
  }

  const rows = (await pool.query(
    `SELECT c.id, c.source_type, c.status, c.scope, c.scope_id,
            split_part(c.content, E'\\n', 1) AS title,
            (${titleMatchTerms.join(' + ')}) AS title_match_count
     FROM concepts c
     WHERE c.status = 'active'
       AND ${tokenClauses.join('\n       AND ')}
     ORDER BY title_match_count DESC,
              -- vault rows are Moe-authored truth (trust_tier='high'); prefer
              -- them over harvested/distilled rows of equal token relevance,
              -- the same preference VAULT_RANK_BOOST encodes for injection.
              (CASE WHEN c.source_type = 'vault' THEN 0 ELSE 1 END),
              title ASC
     LIMIT ${limit}`,
    params
  )).rows as Array<{
    id: string; source_type: string; status: string; scope: string; scope_id: string | null;
    title: string; title_match_count: number;
  }>;

  return rows.map((r) => ({
    id: `${CONCEPTS_ID_PREFIX}${r.id}`,
    externalId: r.id,
    type: 'concept',
    layer: 'learning',
    title: clipTitle(r.title || r.id),
    status: r.status,
    titleMatch: r.title_match_count > 0,
    store: 'concepts' as const,
  }));
}

/**
 * The `directives` arm — Porter's highest-trust memory layer (operating rules).
 *
 * Directives already reach a model through injection, but they were also
 * SEARCHABLE, because ymc's vault-ingest copied 61 of them into `vault_nodes`.
 * That copy is what drifted: 9 of the 61 rendered `active` in the graph while
 * Porter had already archived or superseded the rule. Removing the copy without
 * this arm would have made "what's our rule about X" unanswerable by search —
 * so the copy goes and the reader comes here, to live status, instead.
 *
 * `status='active'` only, for the same reason: an archived rule is a rule Moe
 * retired, and surfacing it as findable knowledge is exactly the drift removed.
 */
async function searchDirectives(tokens: string[], limit: number): Promise<VaultNodeHit[]> {
  const params: unknown[] = [];
  const tokenClauses: string[] = [];
  const titleMatchTerms: string[] = [];
  for (const t of tokens) {
    params.push(`%${t}%`);
    const idx = params.length;
    tokenClauses.push(`d.content ILIKE $${idx}`);
    titleMatchTerms.push(`(CASE WHEN split_part(d.content, E'\\n', 1) ILIKE $${idx} THEN 1 ELSE 0 END)`);
  }

  const rows = (await pool.query(
    `SELECT d.id, d.scope, d.scope_id, d.priority, d.status,
            split_part(d.content, E'\\n', 1) AS title,
            (${titleMatchTerms.join(' + ')}) AS title_match_count
     FROM directives d
     WHERE d.status = 'active'
       AND ${tokenClauses.join('\n       AND ')}
     ORDER BY title_match_count DESC, d.priority DESC, title ASC
     LIMIT ${limit}`,
    params
  )).rows as Array<{
    id: string; scope: string; scope_id: string | null; priority: number; status: string;
    title: string; title_match_count: number;
  }>;

  return rows.map((r) => ({
    id: `${DIRECTIVES_ID_PREFIX}${r.id}`,
    externalId: r.id,
    type: 'directive',
    layer: 'learning',
    // A directive has no title, only content — the first line is the rule.
    // Clipped so a long rule doesn't dominate a result list.
    title: clipTitle(r.title || r.id),
    status: r.status,
    titleMatch: r.title_match_count > 0,
    store: 'directives' as const,
  }));
}

const MAX_TITLE_CHARS = 120;
function clipTitle(s: string): string {
  const t = s.trim();
  return t.length > MAX_TITLE_CHARS ? `${t.slice(0, MAX_TITLE_CHARS - 1)}…` : t;
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
  // A memory-arm hit has no artifacts — its content IS the row. Resolve it
  // here so a context pack built from a concept or a directive reads the same
  // as one built from a graph node, instead of "(no content artifact
  // resolvable)".
  if (nodeId.startsWith(CONCEPTS_ID_PREFIX)) {
    const conceptId = nodeId.slice(CONCEPTS_ID_PREFIX.length);
    const row = (await pool.query(
      `SELECT id, content, source_type, source_url FROM concepts WHERE id = $1`,
      [conceptId]
    )).rows[0] as { id: string; content: string; source_type: string; source_url: string | null } | undefined;
    if (!row || !row.content?.trim()) return { content: null, source: null };
    return {
      content: row.content,
      source: `concept:${row.id} (${row.source_type}${row.source_url ? `, ${row.source_url}` : ''})`,
    };
  }
  if (nodeId.startsWith(DIRECTIVES_ID_PREFIX)) {
    const directiveId = nodeId.slice(DIRECTIVES_ID_PREFIX.length);
    const row = (await pool.query(
      `SELECT id, content, scope, scope_id, priority FROM directives WHERE id = $1`,
      [directiveId]
    )).rows[0] as { id: string; content: string; scope: string; scope_id: string | null; priority: number } | undefined;
    if (!row || !row.content?.trim()) return { content: null, source: null };
    const where = row.scope_id ? `${row.scope}/${row.scope_id}` : row.scope;
    return { content: row.content, source: `directive:${row.id} (${where}, priority ${row.priority})` };
  }

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

/**
 * Up to `limit` direct children (active/proposed placements) of a node.
 * A memory row has no place in the hierarchy — it is a flat row, not a graph
 * node — so return early rather than run a query that cannot match.
 */
export async function getChildren(scope: string, nodeId: string, limit = 6): Promise<ChildSummary[]> {
  if (isMemoryId(nodeId)) return [];
  const rows = (await pool.query(
    `SELECT n.title, n.type
     FROM vault_placements p JOIN vault_nodes n ON n.id = p.node_id
     WHERE p.app_scope = $1 AND p.parent_id = $2 AND p.state IN ('active','proposed')
     ORDER BY n.title LIMIT ${Math.max(1, Math.min(limit, 25))}`,
    [scope, nodeId]
  )).rows as ChildSummary[];
  return rows;
}

/**
 * Up to `limit` non-hierarchical edges touching a node, in either direction.
 * Memory rows carry no edges (same reason as getChildren) — return early.
 */
export async function getRelatedEdges(scope: string, nodeId: string, limit = 6): Promise<EdgeSummary[]> {
  if (isMemoryId(nodeId)) return [];
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
