/**
 * Vault indexer — vault → Porter concepts (memory-unification U2).
 *
 * The vault (/home/lobster/vault) owns concept TRUTH: Moe edits markdown in
 * Obsidian, git keeps history. Porter's `concepts` table is the RUNTIME index
 * (FTS via the search_vector trigger) — agents never read the vault on the
 * hot path. This module is the deterministic out-of-band sync:
 *
 *   - scans concepts/*.md + entities/*.md (one row per node)
 *   - id = 'vault:<folder>/<slug>' (slug = filename sans .md)
 *   - content = title (first '# ' heading, else slug) + body capped 1500 chars
 *   - source_type='vault', trust_tier='high', scope='global',
 *     source_url = absolute vault path (U3 will cite it)
 *   - idempotent by sha256 content hash stored in references_json
 *     (jsonb, zero code consumers — verified 2026-07-05 — so it doubles as
 *     the metadata field; the table has no dedicated metadata column)
 *   - node deleted in vault ⇒ Porter row status='archived' (never deleted;
 *     re-appearing node revives the same row)
 *
 * Triggers: 'vault_concept_index' action on the every_24h workflow tick +
 * POST /api/v1/intellect/vault-index (manual, same pattern as /prune).
 *
 * Revert (U2 is reversible): archive rows —
 *   UPDATE concepts SET status='archived' WHERE source_type='vault';
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pool } from '../../db/client.js';
import { logIntellectEvent } from './file-watcher.js';

const VAULT_ROOT = '/home/lobster/vault';
const VAULT_FOLDERS = ['concepts', 'entities'] as const;
const BODY_CAP = 1500;

// ── U3 — injection ranking boosts for vault-sourced concepts ─────────────
//
// Vault rows are curated truth (Moe-edited markdown, trust_tier='high') but
// carry no earned confidence_score (0) and no use history, so under the
// pre-U3 orderings they sorted dead last. These constants make injection
// PREFER them over harvested/session rows of similar relevance — a ranking
// boost, never a filter: non-vault knowledge still wins when it is clearly
// more relevant (or the only match).
//
// VAULT_CONFIDENCE_BOOST — additive, for the confidence-ordered slot
//   (GET /api/v1/intellect/context). confidence_score is an integer 0–100;
//   live distribution: distiller avg 78 / max 95, subscription 30, vault 0.
//   +80 lifts a vault row above the average harvested concept while a
//   genuinely high-confidence distilled row (>80) can still outrank it.
//
// VAULT_RANK_BOOST — multiplicative, for FTS ts_rank slots
//   (buildMemoryContext Tier 6). ×1.25 flips ties and near-ties toward the
//   vault row; a non-vault row >25% more relevant to the query still wins.
export const VAULT_CONFIDENCE_BOOST = 80;
export const VAULT_RANK_BOOST = 1.25;

export interface VaultIndexResult {
  scanned: number;
  inserted: number;
  updated: number;
  unchanged: number;
  archived: number; // rows whose vault node vanished
}

interface VaultNode {
  id: string;         // vault:<folder>/<slug>
  sourceUrl: string;  // absolute path
  content: string;    // title + capped body
  hash: string;       // sha256 of content
}

async function readVaultNodes(): Promise<VaultNode[]> {
  const nodes: VaultNode[] = [];
  for (const folder of VAULT_FOLDERS) {
    const dir = path.join(VAULT_ROOT, folder);
    let entries: string[] = [];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue; // folder absent — fresh-start assumption, not an error
    }
    for (const f of entries.sort()) {
      if (!f.endsWith('.md')) continue;
      const abs = path.join(dir, f);
      let raw: string;
      try {
        raw = await fs.readFile(abs, 'utf8');
      } catch {
        continue;
      }
      const slug = f.slice(0, -3);
      const titleMatch = raw.match(/^#\s+(.+)$/m);
      const title = (titleMatch?.[1] ?? slug).trim();
      // Body = everything after the title line (or whole file if no heading).
      const body = (titleMatch ? raw.slice(raw.indexOf(titleMatch[0]) + titleMatch[0].length) : raw)
        .trim()
        .slice(0, BODY_CAP);
      const content = `${title}\n${body}`.trim();
      nodes.push({
        id: `vault:${folder}/${slug}`,
        sourceUrl: abs,
        content,
        hash: createHash('sha256').update(content).digest('hex'),
      });
    }
  }
  return nodes;
}

export async function runVaultIndexing(): Promise<VaultIndexResult> {
  const nodes = await readVaultNodes();

  // Current vault-sourced rows (any status — an archived row revives on re-appearance).
  const { rows: existing } = await pool.query<{
    id: string;
    status: string;
    hash: string | null;
  }>(
    `SELECT id, status, references_json->>'content_hash' AS hash
       FROM concepts
      WHERE source_type = 'vault'`,
  );
  const existingById = new Map(existing.map(r => [r.id, r]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const node of nodes) {
    const prev = existingById.get(node.id);
    if (prev && prev.hash === node.hash && prev.status === 'active') {
      unchanged++;
      continue;
    }
    // search_vector maintained by the concepts_search_update trigger.
    await pool.query(
      `INSERT INTO concepts
         (id, memory_kind, trust_tier, scope, scope_id, content, source_type,
          source_url, status, review_state, references_json)
       VALUES ($1, 'concept', 'high', 'global', NULL, $2, 'vault',
               $3, 'active', 'accepted', $4::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         content = EXCLUDED.content,
         source_url = EXCLUDED.source_url,
         trust_tier = EXCLUDED.trust_tier,
         status = 'active',
         references_json = EXCLUDED.references_json,
         updated_at = EXTRACT(EPOCH FROM NOW())`,
      [node.id, node.content, node.sourceUrl, JSON.stringify({ content_hash: node.hash, vault_path: node.sourceUrl })],
    );
    if (prev) updated++;
    else inserted++;
  }

  // Archive rows whose vault node vanished (git keeps the vault-side history).
  const liveIds = new Set(nodes.map(n => n.id));
  const toArchive = existing.filter(r => r.status === 'active' && !liveIds.has(r.id)).map(r => r.id);
  let archived = 0;
  if (toArchive.length > 0) {
    const res = await pool.query(
      `UPDATE concepts
          SET status = 'archived', updated_at = EXTRACT(EPOCH FROM NOW())
        WHERE source_type = 'vault' AND status = 'active' AND id = ANY($1::text[])`,
      [toArchive],
    );
    archived = res.rowCount ?? 0;
  }

  const result: VaultIndexResult = {
    scanned: nodes.length,
    inserted,
    updated,
    unchanged,
    archived,
  };

  if (inserted + updated + archived > 0) {
    console.log(
      `[vault-indexer] ${nodes.length} nodes: +${inserted} new, ~${updated} updated, ${archived} archived, ${unchanged} unchanged`,
    );
    await logIntellectEvent('vault_indexed', 'vault_indexer', { ...result });
  }
  return result;
}
