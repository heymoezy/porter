/**
 * memory-projection.ts — Vault-shaped read-model over the LEGACY memory tables.
 *
 * R4.1 (projection-first, NOT data migration). This module does NOT copy legacy
 * rows into vault_nodes. It exposes the EXISTING legacy memory —
 * directives / concepts / project_notes / agent_notes / episodes /
 * environment_tools — through a single vault-shaped contract (`VaultRecord`)
 * with STABLE ids of the form `legacy:<kind>:<id>`.
 *
 * The point: buildMemoryContextV2 consumes this contract and reproduces the
 * legacy 6-tier injected context EXACTLY. Later, real vault-native learning
 * nodes (vault_nodes / placements, layer=learning) plug into the same
 * `VaultRecord` contract behind these same reader functions — the injection
 * builder never has to change.
 *
 * Each reader mirrors the corresponding query in buildMemoryContext() byte-for-
 * byte (same WHERE / ORDER BY / LIMIT), and additionally selects the row `id`
 * so the projection can mint the stable `legacy:*` vault id. Because the data
 * and ordering are identical, V2's rendered output is identical to V1's today —
 * which is exactly the safe baseline a shadow canary needs before any scope is
 * flipped to V2.
 */

import { pool } from '../db/client.js';
import { VAULT_RANK_BOOST } from './intellect/vault-indexer.js';

// ── Vault-shaped contract ─────────────────────────────────────────────────────
// One shape for every kind of memory the injector reads. Fields are a superset;
// each reader populates only the ones relevant to its kind. `vaultId` is the
// stable projection id (`legacy:<kind>:<sourceId>`).

export type VaultRecordKind =
  | 'persona'
  | 'directive'
  | 'project_note'
  | 'agent_note'
  | 'episode'
  | 'environment_tool'
  | 'concept';

export interface VaultRecord {
  /** Stable vault id: `legacy:<kind>:<sourceId>` (or `legacy:persona:<id>`). */
  vaultId: string;
  kind: VaultRecordKind;
  /** Raw underlying legacy primary key (uuid / text). */
  sourceId: string;
  content: string;

  // directive payload
  priority?: number;
  tags?: string[] | null;

  // project_note / agent_note payload
  noteType?: string;
  confidenceScore?: number;

  // episode payload
  createdAt?: number;

  // environment_tool payload
  toolKey?: string;

  // concept payload
  sourceType?: string;
  sourceUrl?: string | null;

  // persona payload
  name?: string;
  role?: string | null;
  config?: Record<string, unknown> | null;
}

function vid(kind: VaultRecordKind, sourceId: string): string {
  return `legacy:${kind}:${sourceId}`;
}

// ── Tier 1: persona / agent identity ──────────────────────────────────────────
// Mirrors: SELECT name, role, config FROM personas WHERE id = $1
export async function projectPersona(agentId: string): Promise<VaultRecord | null> {
  const res = await pool.query<{ id: string; name: string; role: string | null; config: Record<string, unknown> | null }>(
    'SELECT id, name, role, config FROM personas WHERE id = $1',
    [agentId],
  );
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    vaultId: vid('persona', r.id),
    kind: 'persona',
    sourceId: r.id,
    content: '',
    name: r.name,
    role: r.role,
    config: r.config,
  };
}

// ── Tier 2: directives ────────────────────────────────────────────────────────
// Mirrors buildMemoryContext tier-2 query EXACTLY (workspace + optional project),
// ORDER BY priority ASC. Adds `id` for the stable vault id.
export async function projectDirectives(projectId?: string): Promise<VaultRecord[]> {
  const rows = projectId
    ? (
        await pool.query<{ id: string; content: string; priority: number; tags: string[] | null }>(
          `SELECT id, content, priority, tags FROM directives
           WHERE status = 'active'
             AND (scope = 'workspace' OR (scope = 'project' AND scope_id = $1))
           ORDER BY priority ASC`,
          [projectId],
        )
      ).rows
    : (
        await pool.query<{ id: string; content: string; priority: number; tags: string[] | null }>(
          `SELECT id, content, priority, tags FROM directives
           WHERE status = 'active' AND scope = 'workspace'
           ORDER BY priority ASC`,
        )
      ).rows;
  return rows.map((r) => ({
    vaultId: vid('directive', r.id),
    kind: 'directive' as const,
    sourceId: r.id,
    content: r.content,
    priority: r.priority,
    tags: r.tags,
  }));
}

// ── Tier 3: project notes ─────────────────────────────────────────────────────
// Mirrors: SELECT content, note_type, confidence_score FROM project_notes
//          WHERE project_id = $1 AND status = 'active' ORDER BY confidence_score DESC
export async function projectProjectNotes(projectId: string): Promise<VaultRecord[]> {
  const res = await pool.query<{ id: string; content: string; note_type: string; confidence_score: number }>(
    `SELECT id, content, note_type, confidence_score
     FROM project_notes
     WHERE project_id = $1 AND status = 'active'
     ORDER BY confidence_score DESC`,
    [projectId],
  );
  return res.rows.map((r) => ({
    vaultId: vid('project_note', r.id),
    kind: 'project_note' as const,
    sourceId: r.id,
    content: r.content,
    noteType: r.note_type,
    confidenceScore: r.confidence_score,
  }));
}

// ── Tier 4: agent notes ───────────────────────────────────────────────────────
// Mirrors: SELECT content, note_type, confidence_score FROM agent_notes
//          WHERE agent_id = $1 AND status = 'active' ORDER BY confidence_score DESC
export async function projectAgentNotes(agentId: string): Promise<VaultRecord[]> {
  const res = await pool.query<{ id: string; content: string; note_type: string; confidence_score: number }>(
    `SELECT id, content, note_type, confidence_score
     FROM agent_notes
     WHERE agent_id = $1 AND status = 'active'
     ORDER BY confidence_score DESC`,
    [agentId],
  );
  return res.rows.map((r) => ({
    vaultId: vid('agent_note', r.id),
    kind: 'agent_note' as const,
    sourceId: r.id,
    content: r.content,
    noteType: r.note_type,
    confidenceScore: r.confidence_score,
  }));
}

// ── Tier 5: recent episodes ───────────────────────────────────────────────────
// Mirrors buildMemoryContext tier-5 query EXACTLY (project-or-workspace / global),
// ORDER BY created_at DESC LIMIT 5.
export async function projectEpisodes(projectId?: string): Promise<VaultRecord[]> {
  const rows = projectId
    ? (
        await pool.query<{ id: string; summary: string; created_at: number }>(
          `SELECT id, summary, created_at
           FROM episodes
           WHERE (scope = 'project' AND scope_id = $1) OR scope = 'workspace'
           ORDER BY created_at DESC
           LIMIT 5`,
          [projectId],
        )
      ).rows
    : (
        await pool.query<{ id: string; summary: string; created_at: number }>(
          `SELECT id, summary, created_at
           FROM episodes
           ORDER BY created_at DESC
           LIMIT 5`,
        )
      ).rows;
  return rows.map((r) => ({
    vaultId: vid('episode', r.id),
    kind: 'episode' as const,
    sourceId: r.id,
    content: r.summary,
    createdAt: r.created_at,
  }));
}

// ── Tier 5b: environment tools ────────────────────────────────────────────────
// Mirrors: SELECT tool_key FROM environment_tools WHERE detected = 1 AND health = 'ok' ORDER BY tool_key
export async function projectTools(): Promise<VaultRecord[]> {
  const res = await pool.query<{ tool_key: string }>(
    `SELECT tool_key FROM environment_tools WHERE detected = 1 AND health = 'ok' ORDER BY tool_key`,
  );
  return res.rows.map((r) => ({
    vaultId: vid('environment_tool', r.tool_key),
    kind: 'environment_tool' as const,
    sourceId: r.tool_key,
    content: r.tool_key,
    toolKey: r.tool_key,
  }));
}

// ── Tier 6: archival FTS concepts ─────────────────────────────────────────────
// Mirrors buildMemoryContext tier-6 query EXACTLY, including the multiplicative
// VAULT_RANK_BOOST for source_type='vault' rows (the reserved-slot ranking
// behavior). Adds `id` for the stable vault id.
export async function projectConcepts(searchQuery: string): Promise<VaultRecord[]> {
  const res = await pool.query<{ id: string; content: string; confidence_score: number | null; source_type: string; source_url: string | null }>(
    `SELECT id, content, confidence_score, source_type, source_url
     FROM concepts
     WHERE search_vector @@ websearch_to_tsquery('english', $1)
       AND status = 'active'
     ORDER BY ts_rank(search_vector, websearch_to_tsquery('english', $1))
              * CASE WHEN source_type = 'vault' THEN ${VAULT_RANK_BOOST} ELSE 1.0 END DESC
     LIMIT 10`,
    [searchQuery],
  );
  return res.rows.map((r) => ({
    vaultId: vid('concept', r.id),
    kind: 'concept' as const,
    sourceId: r.id,
    content: r.content,
    confidenceScore: r.confidence_score ?? undefined,
    sourceType: r.source_type,
    sourceUrl: r.source_url,
  }));
}
