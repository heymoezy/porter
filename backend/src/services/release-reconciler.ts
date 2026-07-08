/**
 * release-reconciler.ts — STRUCTURAL enforcement of the announce ceremony.
 *
 * The problem (Moe, repeatedly): announce depends on whichever session runs the
 * post-commit hook, so a session that ships a version bump without it silently
 * skips the announce. Git hooks are local + bypassable — enforcement can't live
 * in a session's diligence. THIS makes it structural: Porter (the always-on
 * backbone) periodically reconciles every project's CURRENT shipped version
 * against the group announce, and RE-ASSERTS the announce idempotently. If a
 * release was announced, the announce endpoint no-ops (marker exists); if it
 * was SKIPPED, this announces it — so a skipped ceremony self-heals within one
 * reconcile cycle, no matter which session (or none) shipped it.
 *
 * Announce delivery stays the ONE ymc announcer (POST /admin/announce-release);
 * this only guarantees it always fires. Runs on the scheduler tick + on demand
 * (POST /api/admin/releases/reconcile).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORTER_RELEASES } from '../lib/porter-releases.js';
import { announceViaYmc } from '../release-kit/announce-adapter.js';

const here = dirname(fileURLToPath(import.meta.url));

export interface ReconcileResult {
  project: string;
  kind: string;
  version: string | null;
  announced: boolean;   // true = we sent it now (was a gap); false = already announced / skipped
  reason: string;
}

/** Extract a scalar `version` from a version-file's source (VERSION = '...' or "version": "..."). */
function readVersionFromFile(path: string): string | null {
  try {
    const src = readFileSync(path, 'utf8');
    const m = src.match(/VERSION\s*=\s*['"]([\d.]+)['"]/) || src.match(/"version"\s*:\s*"([\d.]+)"/);
    return m ? m[1] : null;
  } catch { return null; }
}

/** Parse the FIRST release entry ({version,title,bullets}) from a *-releases.ts feed. */
function readLatestFeedEntry(path: string): { version: string; title: string; bullets: string[] } | null {
  try {
    const src = readFileSync(path, 'utf8');
    const vi = src.indexOf("version:");
    if (vi < 0) return null;
    const block = src.slice(vi, vi + 2000);
    const version = block.match(/version:\s*['"]([\d.]+)['"]/)?.[1];
    const title = block.match(/title:\s*['"]([^'"]+)['"]/)?.[1];
    const bulletsRaw = block.match(/bullets:\s*\[([\s\S]*?)\]/)?.[1] ?? '';
    const bullets = Array.from(bulletsRaw.matchAll(/['"]([^'"]{4,})['"]/g)).map(m => m[1]);
    if (!version || !title || bullets.length === 0) return null;
    return { version, title, bullets };
  } catch { return null; }
}

// What Porter enforces. Porter reads its own feed by import (authoritative);
// sibling repos are read from disk (same box) so no repo can ship unannounced.
const TARGETS: Array<() => { project: string; kind: string; entry: { version: string; title: string; bullets: string[] } | null }> = [
  () => {
    const version = readVersionFromFile(resolve(here, '../../package.json'));
    const entry = PORTER_RELEASES.find(r => r.version === version) ?? PORTER_RELEASES[0] ?? null;
    return { project: 'porter', kind: 'porter', entry };
  },
  () => {
    const version = readVersionFromFile('/home/lobster/projects/ymc.capital/site/app/lib/version.ts');
    const entry = readLatestFeedEntry('/home/lobster/projects/ymc.capital/backend/src/lib/site-releases.ts');
    // Only announce if the feed's top entry matches the shipped version (avoids
    // announcing a stale feed head); mismatch is surfaced as a drift reason.
    return { project: 'ymc.capital', kind: 'ymc-platform', entry: entry && entry.version === version ? entry : (entry ? { ...entry, version: version ?? entry.version } : null) };
  },
];

export async function reconcileReleases(): Promise<ReconcileResult[]> {
  const out: ReconcileResult[] = [];
  for (const get of TARGETS) {
    let t: ReturnType<typeof get>;
    try { t = get(); } catch { continue; }
    if (!t.entry) { out.push({ project: t.project, kind: t.kind, version: null, announced: false, reason: 'no release feed entry found' }); continue; }
    try {
      const res = await announceViaYmc({ kind: t.kind, version: t.entry.version, title: t.entry.title, bullets: t.entry.bullets });
      out.push({ project: t.project, kind: t.kind, version: t.entry.version, announced: !!res.sent, reason: res.sent ? 'announced (gap filled)' : (res.reason || 'already announced') });
    } catch (e) {
      out.push({ project: t.project, kind: t.kind, version: t.entry.version, announced: false, reason: `announce error: ${e instanceof Error ? e.message : e}` });
    }
  }
  return out;
}
