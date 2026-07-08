/**
 * Porter PLATFORM release line — the Porter counterpart to ymc's
 * site/app/lib/site-releases.ts (SITE_RELEASES). ONE announce SYSTEM: both
 * projects publish through the SAME announcer (ymc's lib/release-announce.ts).
 * ymc fires it in-process from its post-commit hook; Porter fires it over HTTP
 * (POST /api/v1/admin/announce-release, kind=porter) from ITS post-commit hook
 * via scripts/announce-porter-update.ts. Same renderer, same group-guard, same
 * idempotence marker — no separate Porter announce system to drift/break.
 *
 * Rule (Moe 2026-07-08): "ymc and porter releases need to announce the same way
 * — don't have separate systems for this, it will break again." Every Porter
 * version bump adds an entry here; the post-commit hook announces the latest.
 * Keep bullets human + benefit-led, not a git log. Newest FIRST.
 */

export interface PorterRelease {
  version: string; // matches backend/package.json
  date: string;    // ISO date
  title: string;
  bullets: string[];
}

export const PORTER_RELEASES: PorterRelease[] = [
  {
    version: '6.73.0',
    date: '2026-07-08',
    title: 'Release-kit R2 — Porter now audits release consistency',
    bullets: [
      'Porter can now see, and flag drift in, how every project releases: a registry API (/api/admin/releases/*) reports each repo\'s release wiring — manifest present, hooks calling the shared kit, kit version current, version file present — and a drift audit gives one consistent|drift verdict across all projects. This is how Porter enforces one release standard everywhere.',
    ],
  },
  {
    version: '6.72.0',
    date: '2026-07-08',
    title: 'Release-kit R1 — the shared release engine',
    bullets: [
      'First piece of the unified release system: a shared release-kit in Porter (manifest schema + project registry + a porter-release CLI with a pre-commit gate and post-commit run sequence + the shared announce adapter). Groundwork so every project releases the exact same way and Porter can enforce it — not wired into any repo yet.',
    ],
  },
  {
    version: '6.71.0',
    date: '2026-07-08',
    title: 'Porter now announces its own releases',
    bullets: [
      'Porter releases now post to the group automatically the same way ymc.capital ones do — through the one shared announcer, fired from Porter’s own post-commit hook. No more separate manual step that could be forgotten.',
    ],
  },
  {
    version: '6.70.0',
    date: '2026-07-08',
    title: 'Grok joined the model mesh',
    bullets: [
      'Added the xAI Grok CLI (grok-4.5) as a fourth Bridge gateway alongside Claude, Codex and Antigravity — so Grok can be routed to directly and now sits on the design council.',
    ],
  },
  {
    version: '6.69.0',
    date: '2026-07-08',
    title: 'Document Library — every app’s files, deduped and in sync',
    bullets: [
      'New Document Library in the Porter admin: all of an app’s documents, organised the way the knowledge graph sees them (app → project → document), completely de-duplicated (one entry per unique file with every location tracked) and kept in sync so moved or deleted files drop off automatically. Personal material (passports, tax, personal financials) is never indexed. First app live: YMC with ~2,900 documents across 6 projects.',
    ],
  },
];
