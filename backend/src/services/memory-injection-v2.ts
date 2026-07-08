/**
 * memory-injection-v2.ts — vault-projection injection builder + SHADOW CANARY.
 *
 * R4.1. HIGHEST-RISK area: memory injection feeds every Claude session and fails
 * SILENT. This module is built so it CANNOT harm live sessions:
 *
 *   • buildMemoryContext (V1, memory-injection.ts) stays the injected source.
 *   • buildMemoryContextV2 is a NEW, faithful mirror of V1 that reads the legacy
 *     memory THROUGH the vault-shaped projection (memory-projection.ts). It
 *     preserves EXACTLY: the 6-tier order, the rolling token caps, the
 *     VAULT_RANK_BOOST / source_type='vault' reserved-slot behavior, and the
 *     environment_tools coverage. Same output shape as V1 (string | MemoryContextResult).
 *   • resolveInjectedMemoryContext(opts) is a drop-in wrapper around
 *     buildMemoryContext:
 *       - Both flags OFF  → returns buildMemoryContext(opts) directly. Zero
 *         overhead, byte-identical to V1. (Default = pure legacy.)
 *       - MEMORY_INJECTION_SHADOW=1 → computes BOTH V1 and V2, INJECTS V1, logs a
 *         structured comparison. Never changes the injected bytes.
 *       - scope ∈ MEMORY_INJECTION_VAULT_SCOPES (csv) → injects V2 for that scope
 *         ONLY, with MANDATORY auto-fallback to V1 on exception / timeout /
 *         empty-context / any mandatory directive missing vs V1. Default empty =
 *         nobody gets V2.
 *
 * Ship the FIRST safe release with both flags OFF (shadow-only once you set
 * SHADOW=1) — never enable a real scope by default.
 */

import { pool } from '../db/client.js';
import { selectDirectives, tokenizeTaskText } from './directive-scorer.js';
import type { DirectiveSelectionStats } from './directive-scorer.js';
import { VAULT_RANK_BOOST } from './intellect/vault-indexer.js';
import { buildMemoryContext, type MemoryContextResult } from './memory-injection.js';
import {
  projectPersona,
  projectDirectives,
  projectProjectNotes,
  projectAgentNotes,
  projectEpisodes,
  projectTools,
  projectConcepts,
} from './memory-projection.js';
import { randomUUID } from 'node:crypto';

// Same token estimator V1 uses (4 chars ≈ 1 token). Keeping it byte-identical is
// what guarantees V2's tier clipping matches V1's.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface MemoryContextOpts {
  agentId?: string;
  projectId?: string;
  tokenBudget?: number;
  searchQuery?: string;
  taskText?: string;
  skillTags?: string[];
}

/** Rich internal result — used by the shadow comparison. */
export interface MemoryContextV2Detailed {
  text: string;
  directive_selection?: DirectiveSelectionStats;
  /** Vault ids (`legacy:directive:<id>`) whose line was actually rendered. */
  injectedDirectiveVaultIds: string[];
  /** Underlying directive uuids that were rendered (stripped of the prefix). */
  injectedDirectiveIds: string[];
  /** Tool keys rendered in the Available Tools section. */
  injectedToolKeys: string[];
  /** Concept vault ids rendered in the Related Knowledge section. */
  injectedConceptVaultIds: string[];
  /** Concept vault ids rendered that came from source_type='vault' (reserved slots). */
  injectedVaultConceptVaultIds: string[];
  /** Per-tier rendered line counts. */
  tierCounts: Record<string, number>;
}

// ── buildV2Detailed — faithful 6-tier mirror over the vault projection ─────────
// This is a line-for-line port of buildMemoryContext(), with every pool.query
// replaced by the corresponding memory-projection reader. Because the projection
// runs the identical SQL (same WHERE/ORDER/LIMIT) and V2 runs the identical
// tiering math, the rendered text is identical to V1 today. The extra bookkeeping
// (injected*Ids, tierCounts) exists only for the shadow comparison and never
// affects the emitted string.
async function buildV2Detailed(opts: MemoryContextOpts): Promise<MemoryContextV2Detailed> {
  const { agentId, projectId, searchQuery, taskText, skillTags } = opts;
  let totalRemaining = opts.tokenBudget ?? 2000;

  const sections: string[] = [];
  let capturedDirectiveStats: DirectiveSelectionStats | undefined;

  const injectedDirectiveVaultIds: string[] = [];
  const injectedToolKeys: string[] = [];
  const injectedConceptVaultIds: string[] = [];
  const injectedVaultConceptVaultIds: string[] = [];
  const tierCounts: Record<string, number> = {};

  const targets = { tier1: 200, tier2: 300, tier3: 400, tier4: 400 };

  try {
    // ── Tier 1: Agent Identity (Target: 200) ──────────────────────────────────
    let tier1Spare = targets.tier1;
    if (agentId) {
      const persona = await projectPersona(agentId);
      if (persona) {
        const { name, role, config } = persona;
        if (config && typeof config.memory_token_budget === 'number') {
          totalRemaining = config.memory_token_budget;
        }
        const section = `## Agent Identity\nName: ${name}\nRole: ${role ?? 'assistant'}\n`;
        const tokens = estimateTokens(section);
        if (tokens <= totalRemaining) {
          sections.push(section);
          totalRemaining -= tokens;
          tier1Spare = Math.max(0, targets.tier1 - tokens);
          tierCounts.identity = 1;
        }
      }
    }

    // ── Tier 2: Directives (Target: 300 + spare) ──────────────────────────────
    const tier2Budget = targets.tier2 + tier1Spare;
    const projected = await projectDirectives(projectId);
    // Shape for selectDirectives (DirectiveRow), carrying vaultId through so the
    // selected rows can report which projected directive was injected.
    const allDirectiveRows = projected.map((r) => ({
      vaultId: r.vaultId,
      content: r.content,
      priority: r.priority ?? 0,
      tags: r.tags ?? null,
    }));

    const taskWords = taskText ? tokenizeTaskText(taskText) : [];
    const activeSkillTags = skillTags ?? [];
    const { directives: selectedDirectives, stats: directiveStats } = selectDirectives(
      allDirectiveRows,
      taskWords,
      activeSkillTags,
      Math.min(tier2Budget, totalRemaining),
    );

    let tier2Used = 0;
    if (selectedDirectives.length > 0) {
      const header = '## Directives\n';
      let body = '';
      for (const row of selectedDirectives) {
        const line = row.content + '\n';
        if (estimateTokens(header + body + line) > tier2Budget) break;
        if (estimateTokens(header + body + line) > totalRemaining) break;
        body += line;
        // Record which projected directive actually made it in.
        const vid = (row as { vaultId?: string }).vaultId;
        if (vid) injectedDirectiveVaultIds.push(vid);
      }
      if (body) {
        const section = header + body;
        const tokens = estimateTokens(section);
        sections.push(section);
        totalRemaining -= tokens;
        tier2Used = tokens;
        capturedDirectiveStats = directiveStats;
        tierCounts.directives = injectedDirectiveVaultIds.length;
      }
    }
    const tier2Spare = Math.max(0, tier2Budget - tier2Used);

    // ── Tier 3: Project Notes (Target: 400 + spare) ───────────────────────────
    const tier3Budget = targets.tier3 + tier2Spare;
    if (projectId) {
      const rows = await projectProjectNotes(projectId);
      let tier3Used = 0;
      let tier3Lines = 0;
      if (rows.length > 0) {
        const header = '## Project State\n';
        let body = '';
        for (const row of rows) {
          const line = `[${row.noteType}] ${row.content}\n`;
          if (estimateTokens(header + body + line) > tier3Budget) break;
          if (estimateTokens(header + body + line) > totalRemaining) break;
          body += line;
          tier3Lines++;
        }
        if (body) {
          const section = header + body;
          const tokens = estimateTokens(section);
          sections.push(section);
          totalRemaining -= tokens;
          tier3Used = tokens;
          tierCounts.projectNotes = tier3Lines;
        }
      }
      const tier3Spare = Math.max(0, tier3Budget - tier3Used);

      // ── Tier 4: Agent Notes (Target: 400 + spare) ───────────────────────────
      const tier4Budget = targets.tier4 + tier3Spare;
      if (agentId) {
        const aRows = await projectAgentNotes(agentId);
        let tier4Lines = 0;
        if (aRows.length > 0) {
          const header = '## Agent Knowledge\n';
          let body = '';
          for (const row of aRows) {
            const line = `[${row.noteType}] ${row.content}\n`;
            if (estimateTokens(header + body + line) > tier4Budget) break;
            if (estimateTokens(header + body + line) > totalRemaining) break;
            body += line;
            tier4Lines++;
          }
          if (body) {
            const section = header + body;
            const tokens = estimateTokens(section);
            sections.push(section);
            totalRemaining -= tokens;
            tierCounts.agentNotes = tier4Lines;
          }
        }
      }
    }

    // ── Tier 5: Recent Episodes (Target: 200) ──────────────────────────────────
    if (totalRemaining > 50) {
      try {
        const rows = await projectEpisodes(projectId);
        if (rows.length > 0) {
          const header = '## Recent Sessions\n';
          let body = '';
          let lines = 0;
          const tier5Budget = Math.min(200, totalRemaining);
          for (const row of rows) {
            const when = new Date((row.createdAt ?? 0) * 1000).toISOString().split('T')[0];
            const line = `- **${when}**: ${row.content}\n`;
            if (estimateTokens(header + body + line) > tier5Budget) break;
            body += line;
            lines++;
          }
          if (body) {
            const section = header + body;
            const tokens = estimateTokens(section);
            sections.push(section);
            totalRemaining -= tokens;
            tierCounts.episodes = lines;
          }
        }
      } catch { /* episodes table may not exist on first run */ }
    }

    // ── Tier 5b: Available Tools (compact — ~50 tokens) ─────────────────────
    if (totalRemaining > 30) {
      try {
        const tools = await projectTools();
        if (tools.length > 0) {
          const toolList = tools.map((t) => t.toolKey).join(', ');
          const section = `## Available Tools\n${toolList}\n`;
          const tokens = estimateTokens(section);
          if (tokens <= totalRemaining) {
            sections.push(section);
            totalRemaining -= tokens;
            for (const t of tools) if (t.toolKey) injectedToolKeys.push(t.toolKey);
            tierCounts.tools = tools.length;
          }
        }
      } catch { /* environment_tools may not exist */ }
    }

    // ── Tier 6: Archival FTS Search (Remaining) ───────────────────────────────
    // Preserves the VAULT_RANK_BOOST reserved-slot behavior via the projection's
    // identical ORDER BY, and cites vault-sourced rows exactly as V1 does.
    if (searchQuery && totalRemaining > 50) {
      const rows = await projectConcepts(searchQuery);
      if (rows.length > 0) {
        const header = '## Related Knowledge\n';
        let body = '';
        let lines = 0;
        for (const row of rows) {
          const cite = row.sourceType === 'vault' && row.sourceUrl
            ? ` _(vault: ${row.sourceUrl.replace('/home/lobster/vault/', '')})_`
            : '';
          const line = row.content + cite + '\n';
          if (estimateTokens(header + body + line) > totalRemaining) break;
          body += line;
          lines++;
          if (row.vaultId) injectedConceptVaultIds.push(row.vaultId);
          if (row.sourceType === 'vault' && row.vaultId) injectedVaultConceptVaultIds.push(row.vaultId);
        }
        if (body) {
          sections.push(header + body);
          tierCounts.concepts = lines;
        }
      }
    }
  } catch (e) {
    console.error('[memory-injection-v2] Error building V2 memory context:', e);
    return {
      text: '',
      directive_selection: undefined,
      injectedDirectiveVaultIds: [],
      injectedDirectiveIds: [],
      injectedToolKeys: [],
      injectedConceptVaultIds: [],
      injectedVaultConceptVaultIds: [],
      tierCounts: {},
    };
  }

  const text = sections.join('\n\n');
  return {
    text,
    directive_selection: capturedDirectiveStats,
    injectedDirectiveVaultIds,
    injectedDirectiveIds: injectedDirectiveVaultIds.map((v) => v.replace(/^legacy:directive:/, '')),
    injectedToolKeys,
    injectedConceptVaultIds,
    injectedVaultConceptVaultIds,
    tierCounts,
  };
}

// ── Public buildMemoryContextV2 — same overloads/shape as V1 ───────────────────
export async function buildMemoryContextV2(opts: MemoryContextOpts): Promise<string>;
export async function buildMemoryContextV2(
  opts: MemoryContextOpts & { returnMeta: true },
): Promise<MemoryContextResult>;
export async function buildMemoryContextV2(
  opts: MemoryContextOpts & { returnMeta?: boolean },
): Promise<string | MemoryContextResult> {
  const detailed = await buildV2Detailed(opts);
  if (opts.returnMeta) {
    return { text: detailed.text, directive_selection: detailed.directive_selection };
  }
  return detailed.text;
}

// ── Flags ──────────────────────────────────────────────────────────────────────
export function shadowFlagOn(): boolean {
  return process.env.MEMORY_INJECTION_SHADOW === '1';
}
export function canaryScopes(): Set<string> {
  const raw = (process.env.MEMORY_INJECTION_VAULT_SCOPES ?? '').trim();
  if (!raw) return new Set();
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}
/** SessionStart is a hot path — cap V2 build time so it can never stall injection. */
function canaryTimeoutMs(): number {
  const n = Number(process.env.MEMORY_INJECTION_VAULT_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 750;
}
/** V2 output shorter than this (chars) vs a non-empty V1 is treated as "near-empty" → fallback. */
const NEAR_EMPTY_CHARS = 40;

// ── Scope-chain resolution (registry-backed, fail-open) ────────────────────────
// Resolves scope → [scope, ...ancestors] from vault_scopes (e.g. ymc → moe →
// porter). Used only to enrich the shadow log's chain context. The directive
// invariant universe itself is V1's tier-2 set (workspace + project), which IS
// the injected scope chain in directive terms.
async function resolveScopeChain(scope: string): Promise<string[]> {
  const chain: string[] = [];
  const seen = new Set<string>();
  let cursor: string | null = scope;
  let guard = 0;
  try {
    while (cursor && guard++ < 16 && !seen.has(cursor)) {
      seen.add(cursor);
      const res: { rows: Array<{ id: string; parent_scope_id: string | null }> } = await pool.query(
        'SELECT id, parent_scope_id FROM vault_scopes WHERE id = $1',
        [cursor],
      );
      if (res.rows.length === 0) break;
      chain.push(res.rows[0].id);
      cursor = res.rows[0].parent_scope_id;
    }
  } catch { /* registry optional — fail open */ }
  return chain.length ? chain : [scope];
}

// ── Structured comparison ──────────────────────────────────────────────────────
export interface ShadowComparison {
  context_build_id: string;
  scope: string;
  scope_chain: string[];
  v1_tokens: number;
  v2_tokens: number;
  v1_directive_ids: string[];
  v2_directive_ids: string[];
  missing_in_v2: string[]; // active scope-chain directive ids present in V1 but not V2
  extra_in_v2: string[];
  tools_coverage_match: boolean;
  tier_counts: { v1: Record<string, number>; v2: Record<string, number> };
  invariants_ok: boolean;
  fallback_reason: string | null;
}

// Active directive universe for the injected scope chain (== V1 tier-2 query).
// Returns id → content so we can check presence in rendered text (black-box).
async function scopeChainDirectives(projectId?: string): Promise<Array<{ id: string; content: string }>> {
  const rows = projectId
    ? (
        await pool.query<{ id: string; content: string }>(
          `SELECT id, content FROM directives
           WHERE status = 'active'
             AND (scope = 'workspace' OR (scope = 'project' AND scope_id = $1))`,
          [projectId],
        )
      ).rows
    : (
        await pool.query<{ id: string; content: string }>(
          `SELECT id, content FROM directives WHERE status = 'active' AND scope = 'workspace'`,
        )
      ).rows;
  return rows;
}

function parseToolLine(text: string): Set<string> {
  const m = text.match(/## Available Tools\n([^\n]*)/);
  if (!m) return new Set();
  return new Set(m[1].split(',').map((s) => s.trim()).filter(Boolean));
}

/**
 * Compute V2 (with timeout cap), diff it against a given V1 text, evaluate the
 * hard invariants, and return the structured comparison. Never throws — on any
 * failure it returns a comparison flagged invariants_ok=false with a
 * fallback_reason, so the caller safely stays on V1.
 */
export async function shadowCompareMemoryContext(
  opts: MemoryContextOpts,
  v1Text: string,
): Promise<{ comparison: ShadowComparison; v2Detailed: MemoryContextV2Detailed | null }> {
  const scope = opts.projectId ?? 'workspace';
  const context_build_id = randomUUID();
  const scope_chain = await resolveScopeChain(scope);

  let v2Detailed: MemoryContextV2Detailed | null = null;
  let fallback_reason: string | null = null;

  try {
    const timeoutMs = canaryTimeoutMs();
    v2Detailed = await Promise.race<MemoryContextV2Detailed | null>([
      buildV2Detailed(opts),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (v2Detailed === null) fallback_reason = `v2_timeout_${timeoutMs}ms`;
  } catch (e) {
    fallback_reason = 'v2_exception:' + (e instanceof Error ? e.message : String(e));
    v2Detailed = null;
  }

  const v2Text = v2Detailed?.text ?? '';
  const v1_tokens = estimateTokens(v1Text);
  const v2_tokens = estimateTokens(v2Text);

  // Directive invariant: every active scope-chain directive present in V1 must be
  // present in V2. Black-box presence check on rendered text (no V1 internals).
  const universe = await scopeChainDirectives(opts.projectId).catch(() => []);
  const v1_directive_ids: string[] = [];
  const v2_directive_ids: string[] = [];
  const missing_in_v2: string[] = [];
  for (const d of universe) {
    const inV1 = v1Text.includes(d.content);
    const inV2 = v2Text.includes(d.content);
    if (inV1) v1_directive_ids.push(d.id);
    if (inV2) v2_directive_ids.push(d.id);
    if (inV1 && !inV2) missing_in_v2.push(d.id);
  }
  const v1Set = new Set(v1_directive_ids);
  const extra_in_v2 = v2_directive_ids.filter((id) => !v1Set.has(id));

  // Tools coverage: V2's Available Tools set must ⊇ V1's.
  const v1Tools = parseToolLine(v1Text);
  const v2Tools = parseToolLine(v2Text);
  let toolsSuperset = true;
  for (const t of v1Tools) if (!v2Tools.has(t)) { toolsSuperset = false; break; }
  const tools_coverage_match = toolsSuperset && v1Tools.size === v2Tools.size;

  // Near-empty guard (V2 collapsed while V1 had content).
  if (!fallback_reason && v1Text.length > NEAR_EMPTY_CHARS && v2Text.length < NEAR_EMPTY_CHARS) {
    fallback_reason = 'v2_near_empty';
  }
  if (!fallback_reason && missing_in_v2.length > 0) {
    fallback_reason = `missing_directives:${missing_in_v2.length}`;
  }
  if (!fallback_reason && !toolsSuperset) {
    fallback_reason = 'tools_coverage_regressed';
  }

  const invariants_ok = fallback_reason === null;

  const comparison: ShadowComparison = {
    context_build_id,
    scope,
    scope_chain,
    v1_tokens,
    v2_tokens,
    v1_directive_ids,
    v2_directive_ids,
    missing_in_v2,
    extra_in_v2,
    tools_coverage_match,
    tier_counts: { v1: {}, v2: v2Detailed?.tierCounts ?? {} },
    invariants_ok,
    fallback_reason,
  };

  return { comparison, v2Detailed };
}

// ── Lazy shadow-log table (no migration / no index.ts wiring) ──────────────────
let shadowTableReady = false;
async function ensureShadowTable(): Promise<void> {
  if (shadowTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memory_injection_shadow (
      id            TEXT PRIMARY KEY,
      created_at    DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
      scope         TEXT NOT NULL,
      mode          TEXT NOT NULL,          -- 'shadow' | 'canary'
      injected      TEXT NOT NULL,          -- 'v1' | 'v2'
      v1_tokens     INTEGER NOT NULL,
      v2_tokens     INTEGER NOT NULL,
      missing_count INTEGER NOT NULL,
      tools_match   BOOLEAN NOT NULL,
      invariants_ok BOOLEAN NOT NULL,
      fallback_reason TEXT,
      comparison    JSONB NOT NULL
    )
  `);
  shadowTableReady = true;
}

async function logShadow(
  comparison: ShadowComparison,
  mode: 'shadow' | 'canary',
  injected: 'v1' | 'v2',
): Promise<void> {
  // Structured logger line (always) — survives even if the table write fails.
  console.log(
    '[memory-injection-shadow] ' +
      JSON.stringify({
        context_build_id: comparison.context_build_id,
        scope: comparison.scope,
        mode,
        injected,
        v1_tokens: comparison.v1_tokens,
        v2_tokens: comparison.v2_tokens,
        v1_directives: comparison.v1_directive_ids.length,
        v2_directives: comparison.v2_directive_ids.length,
        missing_in_v2: comparison.missing_in_v2,
        tools_coverage_match: comparison.tools_coverage_match,
        tier_counts: comparison.tier_counts.v2,
        invariants_ok: comparison.invariants_ok,
        fallback_reason: comparison.fallback_reason,
      }),
  );
  try {
    await ensureShadowTable();
    await pool.query(
      `INSERT INTO memory_injection_shadow
         (id, scope, mode, injected, v1_tokens, v2_tokens, missing_count, tools_match, invariants_ok, fallback_reason, comparison)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        comparison.context_build_id,
        comparison.scope,
        mode,
        injected,
        comparison.v1_tokens,
        comparison.v2_tokens,
        comparison.missing_in_v2.length,
        comparison.tools_coverage_match,
        comparison.invariants_ok,
        comparison.fallback_reason,
        JSON.stringify(comparison),
      ],
    );
  } catch (e) {
    // Logging must never break injection — the console line above is the durable record.
    console.error('[memory-injection-shadow] table write failed (non-fatal):', e instanceof Error ? e.message : e);
  }
}

// ── observeShadow — SessionStart-safe, fire-and-forget observation ─────────────
// Computes the V1-vs-V2 comparison and logs it WITHOUT changing any injected
// bytes. Safe to call from the /context hot path (never awaited into the
// response, never throws). Only does work when a flag is on (caller guards).
export async function observeShadow(opts: MemoryContextOpts): Promise<void> {
  try {
    const v1Text = await buildMemoryContext(opts);
    const { comparison } = await shadowCompareMemoryContext(opts, v1Text);
    await logShadow(comparison, 'shadow', 'v1');
  } catch (e) {
    console.error('[memory-injection-shadow] observeShadow failed (non-fatal):', e instanceof Error ? e.message : e);
  }
}

// ── resolveInjectedMemoryContext — the drop-in wrapper ─────────────────────────
// Signature-compatible with buildMemoryContext. Both flags OFF → delegates
// straight to V1 (byte-identical, zero extra work). SHADOW=1 → compute both,
// inject V1, log. Canary scope → inject V2 with mandatory fallback to V1.
export async function resolveInjectedMemoryContext(opts: MemoryContextOpts): Promise<string>;
export async function resolveInjectedMemoryContext(
  opts: MemoryContextOpts & { returnMeta: true },
): Promise<MemoryContextResult>;
export async function resolveInjectedMemoryContext(
  opts: MemoryContextOpts & { returnMeta?: boolean },
): Promise<string | MemoryContextResult> {
  const shadow = shadowFlagOn();
  const scopes = canaryScopes();
  const scope = opts.projectId ?? 'workspace';
  const isCanary = scopes.has(scope);

  // Fast path: both flags off → pure legacy, zero overhead, byte-identical.
  if (!shadow && !isCanary) {
    return opts.returnMeta
      ? buildMemoryContext({ ...opts, returnMeta: true })
      : buildMemoryContext(opts);
  }

  // Always compute V1 first — it is both the shadow baseline and the fallback.
  const v1Result: MemoryContextResult = opts.returnMeta
    ? await buildMemoryContext({ ...opts, returnMeta: true })
    : { text: await buildMemoryContext(opts), directive_selection: undefined };

  const { comparison, v2Detailed } = await shadowCompareMemoryContext(opts, v1Result.text);

  // Decide injection. Canary scope + all invariants pass → V2. Otherwise V1.
  const injectV2 = isCanary && v2Detailed !== null && comparison.invariants_ok;
  await logShadow(comparison, isCanary ? 'canary' : 'shadow', injectV2 ? 'v2' : 'v1');

  if (injectV2 && v2Detailed) {
    return opts.returnMeta
      ? { text: v2Detailed.text, directive_selection: v2Detailed.directive_selection }
      : v2Detailed.text;
  }
  return opts.returnMeta ? v1Result : v1Result.text;
}
