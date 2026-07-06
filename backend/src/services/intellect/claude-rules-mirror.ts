/**
 * Claude rules mirror — CLAUDE.md → Porter workspace directive (memory-unification U6).
 *
 * The CLAUDE.md files own Claude-session rule TRUTH (harness-loaded markdown:
 * /home/lobster/CLAUDE.md '## Hard Rules' + each ~/projects/<p>/CLAUDE.md
 * section whose heading says non-negotiable). Porter's `directives` table is
 * the runtime surface other agents (Tom, bridge workers) actually inject —
 * this module is the deterministic out-of-band sync, the exact counterpart of
 * vault-mirror.ts in the other direction:
 *
 *   - parses the sources (condensed: one line per rule, no LLM tokens)
 *   - renders ONE workspace-scope directive, source_type='claude_rules_mirror'
 *   - idempotent by sha256 content hash stored in references_json
 *   - UPDATES ITS OWN PRIOR ROW via the supersede chain (new row carries
 *     supersedes_id, prior row → status='superseded') — never accumulates
 *   - refreshes the U1 vault mirror page after a change (debounced)
 *
 * Triggers: 'claude_rules_mirror' action on the existing every_24h workflow
 * tick (no new timer) + POST /api/v1/intellect/claude-rules-mirror (manual,
 * same pattern as /prune and /vault-index).
 *
 * Revert (U6 is reversible): delete this file + its two hooks, then
 *   UPDATE directives SET status='archived' WHERE source_type='claude_rules_mirror';
 */

import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pool } from '../../db/client.js';
import { logIntellectEvent } from './file-watcher.js';
import { scheduleDirectivesMirror } from './vault-mirror.js';

const GLOBAL_CLAUDE_MD = '/home/lobster/CLAUDE.md';
const PROJECTS_ROOT = '/home/lobster/projects';
const SOURCE_TYPE = 'claude_rules_mirror';
const MIRROR_PRIORITY = 60; // above default workspace guidance (50); moe-direct rows stay senior by trust, not rank
const RULE_CAP = 200;       // chars per condensed rule
const CONTENT_CAP = 2400;   // total directive size — protects the injection token budget

export interface ClaudeRulesMirrorResult {
  rules: number;        // condensed rule lines rendered
  projects: number;     // project CLAUDE.md files that contributed
  written: boolean;     // false = content hash unchanged, nothing touched
  supersededId: string | null;
  directiveId: string | null;
}

/** Strip markdown emphasis/emoji noise and collapse to one line. */
function condense(line: string): string {
  return line
    .replace(/\*\*/g, '')
    .replace(/[⚠️]/gu, '')
    .replace(/\s*\n\s*/g, ' ')
    .trim()
    .slice(0, RULE_CAP)
    .replace(/[\s:—·-]+$/, ''); // no dangling separators after the cap
}

/** Extract the '## Hard Rules' bullet lines from the global CLAUDE.md. */
async function readGlobalHardRules(): Promise<string[]> {
  let raw: string;
  try {
    raw = await fs.readFile(GLOBAL_CLAUDE_MD, 'utf8');
  } catch {
    return []; // fresh-start assumption — no global file, no global rules
  }
  const m = raw.match(/^## Hard Rules\s*$([\s\S]*?)(?=^## |\n*$(?![\s\S]))/m);
  if (!m) return [];
  return m[1]
    .split('\n')
    .filter(l => l.trim().startsWith('- '))
    .map(l => condense(l.trim().slice(2)))
    .filter(Boolean);
}

/**
 * Per-project non-negotiables: every ##/### heading in
 * ~/projects/<p>/CLAUDE.md matching /non-negotiable/i, condensed to
 * "<heading title>: <first bullet-or-sentence of the section>".
 */
async function readProjectRules(): Promise<Map<string, string[]>> {
  const byProject = new Map<string, string[]>();
  let dirs: string[] = [];
  try {
    dirs = await fs.readdir(PROJECTS_ROOT);
  } catch {
    return byProject;
  }
  for (const dir of dirs.sort()) {
    const abs = path.join(PROJECTS_ROOT, dir, 'CLAUDE.md');
    let raw: string;
    try {
      raw = await fs.readFile(abs, 'utf8');
    } catch {
      continue; // no CLAUDE.md at this level
    }
    const rules: string[] = [];
    const headingRe = /^(#{2,3})\s+(.*non-negotiable.*)$/gim;
    let hm: RegExpExecArray | null;
    while ((hm = headingRe.exec(raw)) !== null) {
      const title = condense(hm[2].replace(/non-negotiable:?/i, '').replace(/^[\s—:-]+|[\s—:-]+$/g, ''));
      // Section body: from after the heading to the next heading of same-or-higher level.
      const rest = raw.slice(hm.index + hm[0].length);
      const end = rest.search(new RegExp(`^#{1,${hm[1].length}} `, 'm'));
      const body = end === -1 ? rest : rest.slice(0, end);
      // First meaningful line (bullet or prose) as the condensed detail.
      const first = body
        .split('\n')
        .map(l => l.trim())
        .find(l => l && !l.startsWith('#') && !l.startsWith('```') && !l.startsWith('>'));
      rules.push(first ? `${title} — ${condense(first.replace(/^-\s*/, ''))}` : title);
    }
    if (rules.length > 0) byProject.set(dir, rules);
  }
  return byProject;
}

function renderDirective(hardRules: string[], projectRules: Map<string, string[]>): string {
  const parts: string[] = [
    'CLAUDE SESSION RULES (mirror — truth lives in /home/lobster/CLAUDE.md + per-project CLAUDE.md; ' +
      'synced by claude-rules-mirror; edit the markdown, never this directive).',
  ];
  if (hardRules.length > 0) {
    parts.push(`Hard rules: ${hardRules.join(' · ')}`);
  }
  for (const [project, rules] of projectRules) {
    parts.push(`${project} non-negotiables: ${rules.join(' · ')}`);
  }
  let content = parts.join('\n');
  if (content.length > CONTENT_CAP) content = `${content.slice(0, CONTENT_CAP - 1)}…`;
  return content;
}

/**
 * Parse + render + upsert. Returns what actually happened. DB failures throw
 * so workflow_failed gets logged (same posture as runDirectivesMirror).
 */
export async function runClaudeRulesMirror(): Promise<ClaudeRulesMirrorResult> {
  const [hardRules, projectRules] = await Promise.all([readGlobalHardRules(), readProjectRules()]);
  const content = renderDirective(hardRules, projectRules);
  const ruleCount = hardRules.length + [...projectRules.values()].reduce((n, r) => n + r.length, 0);

  // Hash the rendered content — the idempotence key across ticks.
  const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 16);

  const { rows: prior } = await pool.query<{ id: string; hash: string | null }>(
    `SELECT id, references_json->>'content_hash' AS hash
       FROM directives
      WHERE source_type = $1 AND status = 'active'
      ORDER BY created_at DESC`,
    [SOURCE_TYPE],
  );

  if (prior.length === 1 && prior[0].hash === contentHash) {
    return { rules: ruleCount, projects: projectRules.size, written: false, supersededId: null, directiveId: prior[0].id };
  }

  const id = randomUUID();
  const supersededId = prior[0]?.id ?? null;
  await pool.query('BEGIN');
  try {
    // Supersede EVERY prior active mirror row (self-healing if duplicates ever crept in).
    if (prior.length > 0) {
      await pool.query(
        `UPDATE directives
            SET status = 'superseded', updated_at = EXTRACT(EPOCH FROM NOW())
          WHERE source_type = $1 AND status = 'active'`,
        [SOURCE_TYPE],
      );
    }
    await pool.query(
      `INSERT INTO directives
         (id, scope, scope_id, content, priority, source_type, status, created_by, tags, supersedes_id, references_json)
       VALUES ($1, 'workspace', NULL, $2, $3, $4, 'active', 'claude-rules-mirror', $5, $6, $7::jsonb)`,
      [
        id,
        content,
        MIRROR_PRIORITY,
        SOURCE_TYPE,
        ['claude-rules', 'mirror'],
        supersededId,
        JSON.stringify({
          content_hash: contentHash,
          sources: [GLOBAL_CLAUDE_MD, `${PROJECTS_ROOT}/*/CLAUDE.md (non-negotiable sections)`],
        }),
      ],
    );
    await pool.query('COMMIT');
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }

  scheduleDirectivesMirror(); // keep the U1 vault page current (debounced, fire-and-forget)
  await logIntellectEvent('claude_rules_mirrored', 'claude_rules_mirror', {
    directive_id: id,
    superseded_id: supersededId,
    rules: ruleCount,
    projects: [...projectRules.keys()],
    content_hash: contentHash,
  });
  return { rules: ruleCount, projects: projectRules.size, written: true, supersededId, directiveId: id };
}
