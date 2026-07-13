/**
 * Announce a Porter release to the YMC Admin group — the Porter counterpart to
 * ymc's scripts/announce-platform-update.ts. Both feed the SAME announcer
 * (ymc lib/release-announce.ts); Porter reaches it over HTTP via the
 * cross-project intake POST /api/v1/admin/announce-release (kind=porter).
 *
 * ONE system (Moe 2026-07-08: "ymc and porter releases need to announce the
 * same way — don't have separate systems, it will break again"). The endpoint
 * owns render + @g.us group-guard + idempotence marker, so re-runs are safe.
 *
 * Usage:
 *   npx tsx scripts/announce-porter-update.ts --dry        # preview (no send)
 *   npx tsx scripts/announce-porter-update.ts              # latest PORTER_RELEASES
 *   npx tsx scripts/announce-porter-update.ts 6.70.0       # a specific version
 *
 * Fired automatically by Porter's post-commit hook on a version bump.
 */

import 'dotenv/config';
import { PORTER_RELEASES } from '../src/lib/porter-releases.js';

const YMC_BACKEND_URL = (process.env.YMC_BACKEND_URL || 'http://127.0.0.1:5182').replace(/\/$/, '');
const SERVICE_TOKEN = process.env.PORTER_SERVICE_TOKEN ?? process.env.YMC_SERVICE_TOKEN ?? ''; // no fallback: the old default leaked (public repo)

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const force = args.includes('--force');
  const verArg = args.find((a) => !a.startsWith('--'));
  const release = verArg ? PORTER_RELEASES.find((r) => r.version === verArg) : PORTER_RELEASES[0];
  if (!release) {
    console.error(`No Porter release found${verArg ? ` for version ${verArg}` : ''}.`);
    process.exit(1);
  }

  const resp = await fetch(`${YMC_BACKEND_URL}/api/v1/admin/announce-release`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Service-Token': SERVICE_TOKEN },
    body: JSON.stringify({
      kind: 'porter',
      version: release.version,
      title: release.title,
      bullets: release.bullets,
      dry,
      force,
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch((e) => {
    console.error('[announce-porter] HTTP error:', e instanceof Error ? e.message : e);
    return null;
  });

  if (!resp) process.exit(2);
  const j = await resp.json().catch(() => null) as { ok?: boolean; data?: { sent?: boolean; skipped?: boolean; reason?: string }; error?: unknown } | null;
  if (!resp.ok || !j?.ok) {
    console.error(`[announce-porter] failed (${resp.status}):`, JSON.stringify(j?.error ?? j));
    process.exit(2);
  }
  console.log(`--- Porter announcement (v${release.version}${dry ? ', DRY-RUN' : ''}) ---\n🧠 Porter update — v${release.version}\n${release.title}\n`);
  if (j.data?.skipped) console.log(`[announce-porter] ${j.data.reason ?? 'skipped'} (already announced / no change).`);
  else if (j.data?.sent) console.log('[announce-porter] sent to group ✅');
}

main().catch((e) => { console.error(e); process.exit(1); });
