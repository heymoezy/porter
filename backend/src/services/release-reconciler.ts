/**
 * release-reconciler.ts — STRUCTURAL enforcement of the announce ceremony.
 *
 * Porter (the always-on backbone) periodically re-asserts the group announce for
 * its OWN current shipped version, idempotently: if a release was announced the
 * endpoint no-ops (marker exists); if it was SKIPPED, this announces it — so a
 * skipped announce self-heals within one cycle, session-independent. Runs on the
 * scheduler tick + on demand (POST /api/admin/releases/reconcile).
 *
 * HARD SAFETY RULES (learned the hard way — a prior version announced GIBBERISH):
 *  1. EXACT MATCH OR SKIP. Only announce when the release FEED has an entry whose
 *     version EXACTLY equals the shipped version. Never fall back to the feed's
 *     top entry, never force the shipped version onto a different entry — that
 *     announced a version bump with stale/wrong content mid-release.
 *  2. TYPED FEED ONLY. Read the feed by importing the typed module (PORTER_RELEASES)
 *     — never regex-parse a TS source file (that mangled bullets on quotes/escapes).
 *  3. PORTER-ONLY auto-announce. ymc announces via its OWN post-commit/deploy.sh
 *     (reliable, in-process). Porter does NOT auto-announce ymc here — cross-repo
 *     feed reading was the gibberish source. ymc gaps are surfaced by the audit
 *     (drift), and a future clean ymc-side reconcile endpoint can re-add auto-heal.
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
  announced: boolean;   // true = we sent it now (was a gap); false = already announced / skipped / no-match
  reason: string;
}

function porterVersion(): string | null {
  try {
    const pkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? null;
  } catch { return null; }
}

export async function reconcileReleases(): Promise<ReconcileResult[]> {
  const out: ReconcileResult[] = [];

  // Porter — the ONLY project auto-announced here (clean typed feed, exact match).
  const version = porterVersion();
  if (!version) {
    out.push({ project: 'porter', kind: 'porter', version: null, announced: false, reason: 'could not read package.json version' });
    return out;
  }
  const entry = PORTER_RELEASES.find(r => r.version === version); // EXACT match only — no top-entry fallback.
  if (!entry) {
    // Version bumped but no matching PORTER_RELEASES entry yet (mid-release, or a
    // ceremony gap). Do NOT announce — that would send wrong content. Surface it.
    out.push({ project: 'porter', kind: 'porter', version, announced: false, reason: `no PORTER_RELEASES entry matching v${version} — announce skipped (ceremony gap: add the release-notes entry)` });
    return out;
  }
  try {
    const res = await announceViaYmc({ kind: 'porter', version: entry.version, title: entry.title, bullets: entry.bullets });
    out.push({ project: 'porter', kind: 'porter', version: entry.version, announced: !!res.sent, reason: res.sent ? 'announced (gap filled)' : (res.reason || 'already announced') });
  } catch (e) {
    out.push({ project: 'porter', kind: 'porter', version: entry.version, announced: false, reason: `announce error: ${e instanceof Error ? e.message : e}` });
  }
  return out;
}
