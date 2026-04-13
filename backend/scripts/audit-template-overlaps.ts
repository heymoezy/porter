#!/usr/bin/env tsx
/**
 * audit-template-overlaps.ts
 *
 * Produces a markdown report of possible semantic overlap candidates in the
 * agent_templates catalog. Zero DB changes. Output: research/template-
 * overlap-audit.md.
 *
 * Criteria for flagging a cluster:
 *   1. Same category AND shared final word in name (e.g. three "Analyst"s
 *      in the research category).
 *   2. Same category AND description token overlap ≥ 40% (Jaccard on
 *      lowercase word set, stopwords removed).
 *
 * Each cluster gets an opinion (KEEP / MERGE / NEEDS_MOE) based on:
 *   - Distinct specializations visible in the names → KEEP.
 *   - Near-identical names + near-identical descriptions → MERGE candidate.
 *   - Ambiguous → NEEDS_MOE.
 *
 * Usage:
 *   tsx backend/scripts/audit-template-overlaps.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://lobster:porter@127.0.0.1:5432/porter';
const REPO_ROOT = path.resolve(path.join(import.meta.dirname, '..', '..'));
const REPORT_PATH = path.join(REPO_ROOT, 'research', 'template-overlap-audit.md');

const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','by','for','from','has','have','in','is','it','its','of','on','or','that','the','to','was','were','will','with','you','your','this','these','those','an','any','all','but','if','not','no','so','some','such','than','then','there','they','we','which','who','how','what','when','where','why','also','just','can','may','might','should','would','shall','will','into','out','up','down','over','under','own','more','most','less','least','much','many','few','other','another','each','every','both','either','neither','same','different','new','old','first','last','next','previous','only','very','well','good','bad','big','small','high','low','best','worst','make','made','do','does','did','done','use','used','using','user','users','one','two','three','via','through','across','work','works','working','role','roles','agent','agents','porter','ai','model','models','system','task','tasks','help','helps'
]);

interface TemplateRow {
  id: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
}

interface Cluster {
  title: string;
  category: string;
  templates: TemplateRow[];
  reason: string;
  opinion: 'KEEP' | 'MERGE' | 'NEEDS_MOE';
  rationale: string;
}

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersect = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return intersect / union;
}

function lastWord(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

async function fetchTemplates(pool: Pool): Promise<TemplateRow[]> {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    category: string;
    description: string | null;
    tags: unknown;
  }>(
    `SELECT id, name, category, COALESCE(description, '') AS description, tags
       FROM agent_templates ORDER BY category, name`,
  );
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    category: r.category,
    description: r.description ?? '',
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
  }));
}

function findLastWordClusters(templates: TemplateRow[]): Cluster[] {
  const clusters: Cluster[] = [];
  // Group by (category, lastWord)
  const buckets = new Map<string, TemplateRow[]>();
  for (const t of templates) {
    const key = `${t.category}::${lastWord(t.name)}`;
    const list = buckets.get(key) ?? [];
    list.push(t);
    buckets.set(key, list);
  }
  for (const [key, list] of buckets) {
    if (list.length < 2) continue;
    const [category, lw] = key.split('::');
    clusters.push({
      title: `${category} · "${lw}" role family`,
      category,
      templates: list,
      reason: `All share final word "${lw}" in their template name.`,
      opinion: list.length >= 3 ? 'NEEDS_MOE' : 'KEEP',
      rationale:
        list.length >= 3
          ? `Three or more variants of the same role — high likelihood of semantic overlap. Surfacing for your review.`
          : `Two templates share a role word but the prefixes suggest distinct specializations. Recommend KEEP unless you see the distinction as cosmetic.`,
    });
  }
  return clusters;
}

function findDescriptionOverlaps(templates: TemplateRow[]): Cluster[] {
  const clusters: Cluster[] = [];
  const byCategory = new Map<string, TemplateRow[]>();
  for (const t of templates) {
    const list = byCategory.get(t.category) ?? [];
    list.push(t);
    byCategory.set(t.category, list);
  }

  for (const [category, list] of byCategory) {
    const flagged = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const pairKey = `${a.id}::${b.id}`;
        if (flagged.has(pairKey)) continue;
        const descA = tokenize(a.description);
        const descB = tokenize(b.description);
        if (descA.size < 3 || descB.size < 3) continue;
        const sim = jaccard(descA, descB);
        if (sim >= 0.40) {
          flagged.add(pairKey);
          clusters.push({
            title: `${category} · ${a.name} ↔ ${b.name}`,
            category,
            templates: [a, b],
            reason: `Description tokens overlap at ${(sim * 100).toFixed(0)}% (Jaccard).`,
            opinion: sim >= 0.60 ? 'MERGE' : 'NEEDS_MOE',
            rationale:
              sim >= 0.60
                ? `Very high lexical overlap — likely redundant roles. Recommend merging into the more specific one or picking one canonical name.`
                : `Moderate lexical overlap — the descriptions talk about similar things. Worth Moe's eye to decide if they're distinct enough to keep.`,
          });
        }
      }
    }
  }
  return clusters;
}

function writeReport(allTemplates: TemplateRow[], clusters: Cluster[]): void {
  const now = new Date().toISOString();
  const born = allTemplates.length;
  const categoryCounts = new Map<string, number>();
  for (const t of allTemplates) {
    categoryCounts.set(t.category, (categoryCounts.get(t.category) ?? 0) + 1);
  }

  const lines: string[] = [];
  lines.push(`# Template overlap audit`);
  lines.push(``);
  lines.push(`Generated: ${now}`);
  lines.push(`Total templates: ${born}`);
  lines.push(`Categories: ${[...categoryCounts.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
  lines.push(``);
  lines.push(`## How to read this report`);
  lines.push(``);
  lines.push(`Each cluster below is a set of templates that might be redundant. Every cluster has an opinion:`);
  lines.push(``);
  lines.push(`- **KEEP** — my read is they're distinct specializations. Worth a glance, probably nothing to do.`);
  lines.push(`- **NEEDS_MOE** — genuinely ambiguous. I need your call on whether to collapse them.`);
  lines.push(`- **MERGE** — high-confidence duplicate or near-duplicate. Recommend collapsing into one.`);
  lines.push(``);
  lines.push(`**Nothing has been deleted.** This report is input to a conversation, not a fait accompli.`);
  lines.push(``);

  // Sort clusters: MERGE first, then NEEDS_MOE, then KEEP
  const sorted = [...clusters].sort((a, b) => {
    const rank = (op: Cluster['opinion']) => ({ MERGE: 0, NEEDS_MOE: 1, KEEP: 2 }[op]);
    return rank(a.opinion) - rank(b.opinion);
  });

  lines.push(`## Clusters (${sorted.length})`);
  lines.push(``);
  for (const c of sorted) {
    lines.push(`### ${c.title}`);
    lines.push(``);
    lines.push(`**Opinion:** ${c.opinion}`);
    lines.push(`**Reason flagged:** ${c.reason}`);
    lines.push(`**My take:** ${c.rationale}`);
    lines.push(``);
    lines.push(`| ID | Name | Description |`);
    lines.push(`|---|---|---|`);
    for (const t of c.templates) {
      const desc = (t.description || '').slice(0, 200).replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(`| \`${t.id}\` | ${t.name} | ${desc} |`);
    }
    lines.push(``);
  }

  // Non-conforming IDs callout
  const nonConforming = allTemplates.filter(t => {
    if (t.category === 'system') return false;
    const prefix = t.category.slice(0, 3);
    return !t.id.startsWith(`${prefix}-`);
  });
  if (nonConforming.length > 0) {
    lines.push(`## Non-conforming IDs (naming convention violations)`);
    lines.push(``);
    lines.push(`These templates don't follow the category-prefix ID convention. They're real system agents defined in \`backend/src/db/seed-templates.ts\`, not junk — renaming would break internal code references.`);
    lines.push(``);
    lines.push(`| ID | Name | Category | Expected prefix |`);
    lines.push(`|---|---|---|---|`);
    for (const t of nonConforming) {
      lines.push(`| \`${t.id}\` | ${t.name} | ${t.category} | \`${t.category.slice(0, 3)}-\` |`);
    }
    lines.push(``);
    lines.push(`**Opinion:** KEEP as-is. Document the exception.`);
    lines.push(``);
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join('\n') + '\n', 'utf8');
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const templates = await fetchTemplates(pool);
    console.log(`[audit-template-overlaps] scanned ${templates.length} templates`);

    const lwClusters = findLastWordClusters(templates);
    const descClusters = findDescriptionOverlaps(templates);

    // Dedupe: if a pair is already in an lw cluster, don't re-add from desc scan
    const seenPairs = new Set<string>();
    const keyFor = (ts: TemplateRow[]) => ts.map(t => t.id).sort().join('::');
    const filtered: Cluster[] = [];
    for (const c of [...lwClusters, ...descClusters]) {
      const k = keyFor(c.templates);
      if (seenPairs.has(k)) continue;
      seenPairs.add(k);
      filtered.push(c);
    }

    writeReport(templates, filtered);
    console.log(`[audit-template-overlaps] ${filtered.length} clusters written to ${REPORT_PATH}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
