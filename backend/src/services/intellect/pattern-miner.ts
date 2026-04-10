/**
 * Intellect Pattern Miner
 *
 * Looks across the corpus of active directives + recent episodes to surface
 * patterns Porter would otherwise miss:
 *
 *   - Theme clusters: directives that share significant vocabulary
 *     (e.g., 5 different "never use raw HTML elements" rules → one theme).
 *
 *   - Recurring topics per project: which projects accumulate the most
 *     directives, what categories dominate them.
 *
 *   - Tool affinity: which tools dominate which projects' episodes
 *     (signal for which gateway is best for which work).
 *
 * Pattern miner does NOT mutate memory itself — it produces a read-only
 * report. The pruner is responsible for actually merging duplicates; the
 * miner just makes them visible. Future work: emit pattern_found events
 * that route to the promoter or specific workflows.
 *
 * Cheap, deterministic, no LLM. Runs in seconds even on large corpora.
 */

import { pool } from '../../db/client.js';
import { logIntellectEvent } from './file-watcher.js';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'have', 'has',
  'are', 'was', 'were', 'will', 'would', 'should', 'could', 'must', 'may',
  'use', 'used', 'using', 'when', 'what', 'which', 'while', 'because',
  'always', 'never', 'instead', 'rather', 'than', 'about', 'after', 'before',
  'their', 'they', 'them', 'these', 'those', 'each', 'every', 'some', 'any',
  'just', 'also', 'only', 'over', 'under', 'between', 'across',
]);

const MIN_TOKEN_LEN = 4;
const MIN_CLUSTER_SIZE = 2;
const CLUSTER_MIN_SIMILARITY = 0.5;

export interface ThemeCluster {
  theme: string[];           // top tokens
  scope: string;
  scopeId: string | null;
  members: Array<{ id: string; preview: string; priority: number }>;
}

export interface ProjectTopic {
  project: string;
  directiveCount: number;
  topTokens: Array<{ token: string; count: number }>;
}

export interface ToolAffinity {
  project: string;
  episodes: number;
  topTools: Array<{ tool: string; uses: number }>;
}

export interface PatternMineResult {
  generatedAt: number;
  themeClusters: ThemeCluster[];
  projectTopics: ProjectTopic[];
  toolAffinity: ToolAffinity[];
  totals: {
    directivesScanned: number;
    episodesScanned: number;
    clustersFound: number;
  };
}

// ── Token helpers ───────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= MIN_TOKEN_LEN && !STOPWORDS.has(t));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

// ── Mining steps ────────────────────────────────────────────────────────

async function mineThemeClusters(): Promise<{
  clusters: ThemeCluster[];
  scanned: number;
}> {
  const { rows: directives } = await pool.query<{
    id: string;
    scope: string;
    scope_id: string | null;
    content: string;
    priority: number;
  }>(
    `SELECT id, scope, scope_id, content, priority
     FROM directives
     WHERE status = 'active'
     ORDER BY scope, scope_id NULLS FIRST`
  );

  // Tokenize each directive once
  const items = directives.map(d => ({
    ...d,
    tokens: new Set(tokenize(d.content)),
  }));

  // Bucket by (scope, scope_id) — clusters only span the same scope
  const buckets = new Map<string, typeof items>();
  for (const it of items) {
    const key = `${it.scope}|${it.scope_id ?? ''}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(it);
    buckets.set(key, bucket);
  }

  // Greedy cluster within each bucket
  const clusters: ThemeCluster[] = [];
  for (const bucket of buckets.values()) {
    const claimed = new Set<string>();
    for (let i = 0; i < bucket.length; i++) {
      const seed = bucket[i];
      if (claimed.has(seed.id)) continue;
      const cluster: typeof bucket = [seed];
      const themeTokens = new Set(seed.tokens);
      for (let j = i + 1; j < bucket.length; j++) {
        const cand = bucket[j];
        if (claimed.has(cand.id)) continue;
        if (jaccard(themeTokens, cand.tokens) >= CLUSTER_MIN_SIMILARITY) {
          cluster.push(cand);
          // Theme grows by intersection so it stays tight
          for (const t of cand.tokens) themeTokens.add(t);
        }
      }
      if (cluster.length >= MIN_CLUSTER_SIZE) {
        for (const c of cluster) claimed.add(c.id);
        // Top theme tokens = tokens that appear in MOST cluster members
        const tokenCounts = new Map<string, number>();
        for (const c of cluster) for (const t of c.tokens) {
          tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 1);
        }
        const theme = [...tokenCounts.entries()]
          .filter(([, n]) => n >= Math.ceil(cluster.length / 2))
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([t]) => t);
        clusters.push({
          theme,
          scope: seed.scope,
          scopeId: seed.scope_id,
          members: cluster.map(c => ({
            id: c.id,
            preview: c.content.slice(0, 120),
            priority: c.priority,
          })),
        });
      }
    }
  }

  return { clusters, scanned: directives.length };
}

async function mineProjectTopics(): Promise<ProjectTopic[]> {
  const { rows } = await pool.query<{
    project: string;
    content: string;
  }>(
    `SELECT scope_id AS project, content
     FROM directives
     WHERE status = 'active' AND scope = 'project' AND scope_id IS NOT NULL`
  );

  const byProject = new Map<string, { count: number; counts: Map<string, number> }>();
  for (const r of rows) {
    const slot = byProject.get(r.project) ?? { count: 0, counts: new Map() };
    slot.count++;
    for (const tok of tokenize(r.content)) {
      slot.counts.set(tok, (slot.counts.get(tok) ?? 0) + 1);
    }
    byProject.set(r.project, slot);
  }

  return [...byProject.entries()].map(([project, slot]) => ({
    project,
    directiveCount: slot.count,
    topTokens: [...slot.counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([token, count]) => ({ token, count })),
  }));
}

async function mineToolAffinity(): Promise<{
  affinity: ToolAffinity[];
  scanned: number;
}> {
  const { rows } = await pool.query<{
    scope_id: string | null;
    summary: string;
  }>(
    `SELECT scope_id, summary
     FROM episodes
     WHERE created_at > EXTRACT(EPOCH FROM NOW()) - 30 * 86400`
  );

  // The session-analyzer summary embeds tool counts as "tools: X×N, Y×N"
  // Parse them out to compute per-project affinity.
  const byProject = new Map<string, { episodes: number; tools: Map<string, number> }>();
  for (const r of rows) {
    const key = r.scope_id ?? '_workspace';
    const slot = byProject.get(key) ?? { episodes: 0, tools: new Map() };
    slot.episodes++;
    const m = r.summary.match(/tools: ([^—]+)/);
    if (m) {
      const segments = m[1].split(',').map(s => s.trim());
      for (const seg of segments) {
        const mm = seg.match(/^(\S+)×(\d+)/);
        if (mm) {
          const tool = mm[1];
          const n = parseInt(mm[2], 10);
          slot.tools.set(tool, (slot.tools.get(tool) ?? 0) + n);
        }
      }
    }
    byProject.set(key, slot);
  }

  const affinity = [...byProject.entries()]
    .map(([project, slot]) => ({
      project,
      episodes: slot.episodes,
      topTools: [...slot.tools.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tool, uses]) => ({ tool, uses })),
    }))
    .sort((a, b) => b.episodes - a.episodes);

  return { affinity, scanned: rows.length };
}

// ── Main entry ──────────────────────────────────────────────────────────

export async function runPatternMining(): Promise<PatternMineResult> {
  const themes = await mineThemeClusters();
  const projectTopics = await mineProjectTopics();
  const tools = await mineToolAffinity();

  const result: PatternMineResult = {
    generatedAt: Date.now() / 1000,
    themeClusters: themes.clusters,
    projectTopics,
    toolAffinity: tools.affinity,
    totals: {
      directivesScanned: themes.scanned,
      episodesScanned: tools.scanned,
      clustersFound: themes.clusters.length,
    },
  };

  await logIntellectEvent('patterns_mined', 'pattern_miner', {
    directivesScanned: result.totals.directivesScanned,
    episodesScanned: result.totals.episodesScanned,
    clustersFound: result.totals.clustersFound,
    projectsCovered: projectTopics.length,
  });

  return result;
}
