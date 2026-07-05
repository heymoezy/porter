/**
 * Vault mirror — Porter → vault directives page (memory-unification U1).
 *
 * Porter owns directive TRUTH (scoping, priority, supersede chain, the
 * protect_moe_direct trigger). The vault owns the human VIEW: this module
 * renders every ACTIVE directive, grouped by scope, into ONE generated
 * read-only markdown node — /home/lobster/vault/mirrors/porter-directives.md
 * — and commits it to the vault repo (git history = free audit trail).
 * Pattern mirrors ymc's gen-vault-state.sh: deterministic, zero LLM tokens,
 * push best-effort (offline never blocks).
 *
 * Idempotence: a content hash over the directive rows (NOT the timestamp) is
 * embedded in the page; unchanged rows ⇒ no write, no commit — nightly runs
 * don't produce no-op vault commits.
 *
 * Triggers:
 *   - post-write: directive-mutating paths in routes/v1/intellect.ts call
 *     scheduleDirectivesMirror() — fire-and-forget, trailing-edge debounced
 *     (≥30s) so a burst of agent learns collapses into one render/commit.
 *   - nightly: 'vault_directives_mirror' action on the every_24h workflow tick.
 *
 * Revert (U1 is reversible): delete this file, its two hooks, and the
 * generated mirrors/porter-directives.md.
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pool } from '../../db/client.js';
import { logIntellectEvent } from './file-watcher.js';

const execFileP = promisify(execFile);

const VAULT_ROOT = '/home/lobster/vault';
const MIRROR_REL = 'mirrors/porter-directives.md';
const MIRROR_ABS = path.join(VAULT_ROOT, MIRROR_REL);
const DEBOUNCE_MS = 30_000;

interface MirrorDirectiveRow {
  scope: string;
  scope_id: string | null;
  priority: number;
  content: string;
  source_type: string;
  created_at: number;
}

export interface MirrorResult {
  directives: number;
  written: boolean;   // false = content hash unchanged, nothing touched
  committed: boolean; // git commit landed (push is best-effort)
}

// Stable scope ordering for the page — injection-relevant scopes first.
const SCOPE_ORDER = ['system', 'workspace', 'project', 'silo', 'agent'];

function scopeRank(scope: string): number {
  const i = SCOPE_ORDER.indexOf(scope);
  return i === -1 ? SCOPE_ORDER.length : i;
}

function fmtSgt(epochSeconds: number | null): string {
  if (!epochSeconds) return '?';
  return new Date(epochSeconds * 1000)
    .toLocaleString('en-SG', { timeZone: 'Asia/Singapore', hour12: false })
    .replace(',', '');
}

function renderPage(rows: MirrorDirectiveRow[], contentHash: string): string {
  const now = new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore', hour12: false }).replace(',', '');

  const lines: string[] = [
    '# Porter directives (mirror)',
    `> GENERATED read-only — Porter is the source of truth ([[porter]] \`directives\` table).`,
    `> Edit via Porter APIs, never here; this page is overwritten on every sync.`,
    `> Design: [[memory-unification-design]] (U1) · rendered ${now} SGT`,
    `<!-- content-hash: ${contentHash} -->`,
    '',
    `Active directives: **${rows.length}**`,
  ];

  // Group by scope, then scope_id within it.
  const byScope = new Map<string, MirrorDirectiveRow[]>();
  for (const r of rows) {
    const bucket = byScope.get(r.scope) ?? [];
    bucket.push(r);
    byScope.set(r.scope, bucket);
  }
  const scopes = [...byScope.keys()].sort((a, b) => scopeRank(a) - scopeRank(b) || a.localeCompare(b));

  for (const scope of scopes) {
    const bucket = byScope.get(scope)!;
    lines.push('', `## scope: ${scope} (${bucket.length})`);
    const byScopeId = new Map<string, MirrorDirectiveRow[]>();
    for (const r of bucket) {
      const key = r.scope_id ?? '';
      const sub = byScopeId.get(key) ?? [];
      sub.push(r);
      byScopeId.set(key, sub);
    }
    const scopeIds = [...byScopeId.keys()].sort();
    for (const scopeId of scopeIds) {
      if (scopeId) lines.push('', `### ${scope}: ${scopeId}`);
      for (const r of byScopeId.get(scopeId)!) {
        // Single-line the content so each directive stays one list item.
        const content = r.content.replace(/\s*\n\s*/g, ' ').trim();
        lines.push(`- **[p${r.priority}]** ${content} _(${r.source_type} · ${fmtSgt(r.created_at)} SGT)_`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Render + write + commit. Returns what actually happened. Never throws for
 * git problems (commit/push are best-effort like ymc's vaultCommit); DB or
 * fs write failures DO throw so workflow_failed gets logged.
 */
export async function runDirectivesMirror(): Promise<MirrorResult> {
  const { rows } = await pool.query<MirrorDirectiveRow>(
    `SELECT scope, scope_id, priority, content, source_type, created_at
       FROM directives
      WHERE status = 'active'
      ORDER BY scope, scope_id NULLS FIRST, priority DESC, created_at ASC`,
  );

  // Hash the rows, not the rendered page — the timestamp line must not force commits.
  const contentHash = createHash('sha256')
    .update(JSON.stringify(rows.map(r => [r.scope, r.scope_id, r.priority, r.content, r.source_type])))
    .digest('hex')
    .slice(0, 16);

  const existing = await fs.readFile(MIRROR_ABS, 'utf8').catch(() => null);
  if (existing && existing.includes(`<!-- content-hash: ${contentHash} -->`)) {
    return { directives: rows.length, written: false, committed: false };
  }

  await fs.mkdir(path.dirname(MIRROR_ABS), { recursive: true });
  await fs.writeFile(MIRROR_ABS, renderPage(rows, contentHash), 'utf8');

  let committed = false;
  try {
    await execFileP('git', ['-C', VAULT_ROOT, 'add', MIRROR_REL], { timeout: 8000 });
    // Explicit identity like gen-vault-state.sh — the service env has no git user.
    await execFileP(
      'git',
      ['-C', VAULT_ROOT, '-c', 'user.name=Moe Ibrahim', '-c', 'user.email=moe@themozaic.com', 'commit', '-m', 'vault: porter-directives mirror'],
      { timeout: 8000 },
    );
    committed = true;
    void execFileP('git', ['-C', VAULT_ROOT, 'push', 'origin', 'master'], { timeout: 15000 }).catch(() => {});
  } catch {
    /* nothing staged / repo issue — file on disk is still current, non-fatal */
  }

  await logIntellectEvent('vault_mirror_written', 'vault_mirror', {
    directives: rows.length,
    committed,
    path: MIRROR_REL,
  });
  return { directives: rows.length, written: true, committed };
}

// ── Post-write debounce ─────────────────────────────────────────────────
//
// Directive writes are bursty (an agent learning 3 rules in one turn). One
// trailing-edge timer collapses the burst; a write landing while a render is
// already queued just rides the pending timer. Fire-and-forget by design —
// the caller's response must never wait on vault git.

let pendingTimer: NodeJS.Timeout | null = null;

export function scheduleDirectivesMirror(): void {
  if (pendingTimer) return; // already queued — the queued run will see this write too
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    runDirectivesMirror().catch(e =>
      console.warn('[vault-mirror] deferred render failed:', e instanceof Error ? e.message : e),
    );
  }, DEBOUNCE_MS);
  pendingTimer.unref?.(); // never keep the process alive for a mirror render
}
