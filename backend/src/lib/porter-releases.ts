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
    version: '6.106.0',
    date: '2026-07-14',
    title: 'You can now ask the vault why — and cut a wrong association',
    bullets: [
      'The graph could not explain itself: 1,731 of its 1,766 connections recorded no reason at all. That is what a "weird association" really is — not wrong logic, but invisible logic. Every connection now records why it exists: the rule that made it, the table it was read from, and the exact row to blame. It is impossible to create an unexplainable connection now; the code refuses.',
      'The biggest group — 81% of the graph — turned out to be a sensible rule that simply never said so: a file living in the folder workoutdocs/edwardchen/ was linked to Edward Chen. Now it says so, so you can judge it.',
      'Pick any item and see where it is filed, who decided that, and every connection with its reason — then cut the wrong ones with one click. Cutting a connection removes only the connection; the documents and their filing are untouched.',
    ],
  },
  {
    version: '6.105.0',
    date: '2026-07-14',
    title: 'Document conversion runs 4x faster, and will never starve Tom to do it',
    bullets: [
      'The job that converts your raw files into readable summaries was capped at 25 a day, which meant the remaining backlog would have taken about 84 months-worth of patience — roughly 84 days. It now does 100 a day, so it finishes in about three weeks.',
      'The cost here is CLI quota, not a bill — and the danger of a bigger batch is that it eats the quota Tom needs to answer you. So the job now checks first: if the gateway was rate-limited in the last hour it skips entirely, and it always keeps 20% of any known limit in reserve for Tom and for live agent work. Background work yields to you, never the other way round.',
      'Proven by forcing each condition rather than assuming it. The check run also converted 100 real documents with no failures.',
    ],
  },
  {
    version: '6.104.0',
    date: '2026-07-14',
    title: 'The vault stops asking you to review documents you already approved',
    bullets: [
      '426 documents were sitting in the vault\'s review queue that had already been approved in ymc — by you, personally. The two queues did not know about each other, so the same documents were waiting for a second decision from the same person. Those decisions are now imported, and they are recorded under your name, because you are who made them.',
      'The match is exact rather than by filename: each vault record carries the ymc document id it came from. Nothing is guessed.',
      'Across the last three changes the review queue has gone from 4,900 items to 2,772 — and you have not had to review anything.',
    ],
  },
  {
    version: '6.103.0',
    date: '2026-07-14',
    title: 'The vault stops storing the same document twice',
    bullets: [
      'The vault was holding 3,010 file records for only 2,170 actual files. The same document filed in two folders — byte-for-byte identical — was being stored twice, and each copy queued its own conversion job. 840 redundant records removed, and nothing was lost: every folder location is still recorded, and no converted document was destroyed.',
      'The cause was in the importer, which identified a file by its PATH rather than its contents — so the same document in a second folder looked like a new document. It now recognises identical content, which means the clean-up cannot quietly undo itself on the next import.',
      'A further 28 dead conversion jobs were removed — jobs pointing at files that no longer exist, which could never have succeeded and would have sat in the queue forever. The conversion backlog drops by 29% before any change to how fast it runs.',
    ],
  },
  {
    version: '6.102.0',
    date: '2026-07-14',
    title: 'Release notes no longer quote private messages',
    bullets: [
      'Release notes across Porter and ymc carried verbatim quotes taken from internal conversations. A changelog should state what changed and why it mattered, not reproduce what was said in chat. All 58 are rewritten as plain fact, with no loss of substance, and the same rule now applies to the group announcements.',
    ],
  },
  {
    version: '6.101.0',
    date: '2026-07-13',
    title: 'Phoenix is out of the knowledge graph — the "4,900 documents" were never documents',
    bullets: [
      'The vault review queue showed 4,900 items, which was never a real document count. Roughly 1,740 of them were Phoenix cold-outreach prospects and their scoring notes — CRM rows read out of the database and filed as knowledge. That is what was generating the odd associations in the graph.',
      'They are archived, not deleted, and the Phoenix data itself is untouched — it simply stops being treated as knowledge. When Phoenix is revamped it can be brought back deliberately.',
      'The review queue drops from 4,900 to 3,198 as a result. Phoenix\'s own design docs are kept — engineering knowledge is knowledge; a prospect record is not.',
    ],
  },
  {
    version: '6.100.1',
    date: '2026-07-13',
    title: 'Removed the last place the code still claimed an AI did the filing',
    bullets: [
      'The vault page\'s own header comment still repeated the claim that an AI files these documents, even after that was proven false. Corrected, so the next person reading the code is not taught the same mistake.',
    ],
  },
  {
    version: '6.100.0',
    date: '2026-07-13',
    title: 'The vault was crediting an AI for work no AI did',
    bullets: [
      'Every one of the 5,176 filings in the vault was recorded as having been proposed by an AI. None of them were. The auto-filing classifier was never actually built — it is a placeholder that just passes through whatever structure the app already declared. So those 4,900 items waiting for your review are not machine guesses you need to second-guess; they are ymc\'s own existing structure waiting to be confirmed. That changes what you should do with them.',
      'Fixed where it was wrong, not just where it showed: filings now record who actually decided them, and "AI" is reserved until a real classifier exists and can earn the label. The 5,176 mislabelled records were corrected — labels only, nothing moved.',
    ],
  },
  {
    version: '6.99.0',
    date: '2026-07-13',
    title: 'You can now clear the filing queue without clicking 4,900 times',
    bullets: [
      'The review queue can be filtered to one kind of thing and approved in one go. It is deliberately not an "approve everything" button: you pick a type, you see the count, and the system refuses if that count has changed since you looked — so you can never approve a different set than the one in front of you.',
      'Nothing is ever deleted. Approving a filing archives the previous one, so any decision can be walked back later.',
      'Your 4,900 pending filings have NOT been touched. Approving them is your call.',
    ],
  },
  {
    version: '6.98.0',
    date: '2026-07-13',
    title: 'The Vault will now tell you what it has been doing',
    bullets: [
      'The vault engine has been running for weeks with nothing able to show its state. Two things were quietly true and now are visible: 4,900 filings the AI proposed that no human has ever reviewed, and a document-conversion backlog that is only 2.4% done.',
      'Nobody had reviewed those 4,900 because it was impossible to: you could approve a filing if you knew its id, but nothing could list them. That is fixed — there is a queue now, and you can approve or re-file from it. Nothing is ever deleted.',
      'The conversion backlog will take about 120 days to clear at its current speed limit of 25 documents a day. That limit is deliberate — it caps what we spend on the AI — and it is why the backlog stayed hidden: the job looks perfectly healthy doing its 25 a day. Speeding it up costs money, so it is your call, not a default.',
    ],
  },
  {
    version: '6.97.0',
    date: '2026-07-13',
    title: 'The token that was on GitHub no longer opens anything',
    bullets: [
      'The old admin token is now rejected outright. During the changeover it was kept working on purpose, but every use of it was logged with the caller — which is how two hidden users got caught: the release hook, and Tom\'s tool server. Both were quietly relying on a password published on the internet. Both are fixed, and the old token is now dead.',
      'It also cannot come back: Porter refuses that specific value as a password even if someone pastes it into a config again.',
    ],
  },
  {
    version: '6.96.0',
    date: '2026-07-13',
    title: 'Turned certificate checking back on, and deleted a mail server that was never there',
    bullets: [
      'Porter was running with HTTPS certificate verification switched off globally — meaning any outbound secure connection could have been intercepted. It was switched off for a mail server (Stalwart) that turns out not to exist: no such service is installed, nothing listens on its port, and the code module it was supposedly talking to was never built. Verification is back on.',
      'That also means the mail admin password leaked in the public repo was a password to nothing. It did not need rotating — it needed deleting, and it is gone.',
      'The dashboard was reporting the mail server\'s health by pinging port 8080 — which belonged to the old Python app deleted last week, not to any mail server. That fake health check is deleted.',
    ],
  },
  {
    version: '6.95.0',
    date: '2026-07-13',
    title: 'The release hook was quietly using the leaked token — fixed',
    bullets: [
      'Removing the hardcoded token immediately exposed its first hidden user: the git hook that announces releases had no token of its own and had only ever worked by falling back to the public one. It now reads the real secret, and says so loudly if it cannot find it.',
    ],
  },
  {
    version: '6.94.0',
    date: '2026-07-13',
    title: 'Security: the admin token for the brain was published on GitHub — rotated',
    bullets: [
      'Porter\'s service token was written into the source as a default and is sitting in 11 commits of a public GitHub repo. That token is full admin on the brain: it can dispatch through Bridge, read and write memory, and run jobs. Only the localhost-only check stopped it being usable from the internet.',
      'Rotated to a fresh random token, kept in a permission-locked file outside the repo. The hardcoded default is gone from all 17 places it appeared, so an unset token now fails loudly instead of silently falling back to a public one.',
      'The old token still works for a short window so nothing breaks mid-flight — but every use of it is logged with the caller, so the last stragglers get found rather than guessed at.',
      'The database URL had also been committed to the public repo since the Postgres migration. That file is now untracked.',
    ],
  },
  {
    version: '6.93.0',
    date: '2026-07-13',
    title: 'The release gate blocks now — it used to just complain',
    bullets: [
      'Eight releases in a row shipped without writing to this feed, so every one of them was announced as v6.84.0 — the last version the feed actually knew about. The check that was supposed to catch it printed a warning and let the commit through. It now refuses the commit.',
      'The eight missing releases have been written back into the feed, so the release history is true again.',
    ],
  },
  {
    version: '6.92.0',
    date: '2026-07-13',
    title: 'Porter comes back from a clean exit — and its secrets left the public repo',
    bullets: [
      'Porter was found DEAD. It exited cleanly and systemd left it down: it was the only critical service set to restart on-failure, and a clean exit isn\'t a failure. Every CLI, the MCP server and the memory layer depend on Porter, and nothing was bringing it back. It now always restarts, proven by killing it and watching it return.',
      'The systemd unit is now tracked in the repo, so the fix survives a rebuild — a fix that lives on one machine dies with that machine.',
      'The unit had the database password and three API tokens written into it, and the Porter repo is public. Those moved to a private, permission-locked file outside the repo.',
    ],
  },
  {
    version: '6.91.0',
    date: '2026-07-13',
    title: 'The admin now shows the same memory your CLI sessions open with',
    bullets: [
      'The Overview page shows, for the product you have selected: where the last session got to, the handoff it left for the next one, and which CLI last touched it. One brain, two windows onto it.',
      'Every page states which product it means, instead of showing an undifferentiated blob.',
    ],
  },
  {
    version: '6.90.0',
    date: '2026-07-13',
    title: 'Product-first navigation',
    bullets: [
      'The sidebar is organised the way Porter actually works — Overview, Vault, Services, Files, Open Items, Releases — with the old links kept, not killed. Nothing you could reach before is unreachable now.',
    ],
  },
  {
    version: '6.89.0',
    date: '2026-07-13',
    title: 'Product switcher — the admin and your CLI sessions agree on what you are working on',
    bullets: [
      'A product/tenant selector in the top bar. Picking one pins the same active-project that every Claude/codex/grok session reads, so the admin and the CLIs can never disagree about what is being worked on.',
    ],
  },
  {
    version: '6.88.0',
    date: '2026-07-13',
    title: 'Cost per accepted change',
    bullets: [
      'Porter now tracks what a shipped change actually costs. Tokens are exact (read from the session transcript, not estimated), and whether the change was ACCEPTED is observed from git — a session does not get to grade its own homework. First reading: $8.36 per accepted change, 100% acceptance.',
    ],
  },
  {
    version: '6.87.0',
    date: '2026-07-13',
    title: 'Porter memory is available inside every CLI',
    bullets: [
      'Porter\'s MCP server was never actually runnable — it defined its tools but had no entry point. Fixed, and registered in Claude, codex and grok. A handoff written by one CLI is now read back by another: proven end-to-end.',
    ],
  },
  {
    version: '6.86.0',
    date: '2026-07-13',
    title: 'Memory writes itself at session end',
    bullets: [
      'Ending a session writes what happened to Porter and mirrors it into the vault, so the next session — in any CLI — starts warm instead of re-reading the repo.',
    ],
  },
  {
    version: '6.85.1',
    date: '2026-07-13',
    title: 'Security fix: path traversal in the memory endpoint',
    bullets: [
      'A project name from the URL was used to build a file path without validation, which could have been used to read files outside the projects directory. Caught by the automated security review before any real use, and fixed with both a shape check and a containment check. Seven attack strings now rejected.',
    ],
  },
  {
    version: '6.85.0',
    date: '2026-07-13',
    title: 'Hot context — sessions start warm',
    bullets: [
      'A small, hard-capped packet per project (where we got to, what is open, what the last session handed off) that every CLI reads at startup. Pointers, not payloads — it stays under ~900 tokens so it cannot bloat your context.',
    ],
  },
  {
    version: '6.84.0',
    date: '2026-07-10',
    title: 'Vault graph no longer shows ghost (removed) documents',
    bullets: [
      'The knowledge graph was still drawing document nodes whose files are no longer present — including personal tax documents (K-1s) that were pruned for privacy after an earlier index. The graph now hides any document with no present file location, matching the Files view, so removed/moved/privacy-pruned files can\'t linger as ghost nodes. The lingering K-1 nodes were also deleted outright.',
    ],
  },
  {
    version: '6.83.0',
    date: '2026-07-10',
    title: 'Extraction hardening (security review)',
    bullets: [
      'Hardened the new document-text extraction against argument injection: a file named to start with a dash could have been parsed as a tool flag. Paths are now guarded, pdftotext gets an end-of-options marker, and office files are copied to a controlled name before conversion. Flagged by the automated security review of the previous release.',
    ],
  },
  {
    version: '6.82.0',
    date: '2026-07-10',
    title: 'Markdown mirrors now read real PDFs',
    bullets: [
      'The markdown-mirror generator can finally read binary documents: PDFs are extracted with pdftotext and Office files (docx/xlsx/ppt…) via LibreOffice before the mirror is written — so a mirror now contains the document\'s actual text instead of a placeholder. This unblocks generating the ~2,900 missing mirrors; the nightly sweep and the on-demand sweep both use it.',
    ],
  },
  {
    version: '6.81.0',
    date: '2026-07-09',
    title: 'Document Library shows .md-mirror status (Grok-designed)',
    bullets: [
      'The Document Library now shows, per file, whether its markdown (.md) mirror exists — a teal ".md" chip when it does, a muted "No mirror" when it doesn\'t — plus a per-project coverage bar ("X/Y mirrored") so gaps are obvious at a glance. First slice of the Grok-designed file-inventory view: you can finally see which of your documents are missing their mirror. Generating the missing ones is the next step.',
    ],
  },
  {
    version: '6.80.0',
    date: '2026-07-09',
    title: 'Files now report their markdown-mirror status',
    bullets: [
      'The Document Library API now tells you, for every file, whether its markdown (.md) mirror exists yet — plus a per-project and app-wide coverage count ("X of Y mirrored"). This is the data foundation for the new file-inventory view: you can finally see which documents are missing their mirror. (Today that answer is honest and stark — almost none of the ~2,900 files have one yet; generating them is the next step.)',
    ],
  },
  {
    version: '6.79.0',
    date: '2026-07-09',
    title: 'Usage monitoring across every AI backend',
    bullets: [
      'Bridge now reports how much each model backend is actually being used — calls, tokens, cost and latency per gateway (Claude, Codex, Grok, Antigravity) over rolling 5-hour / 24-hour / 7-day windows, from real dispatch data. It is honest consumption tracking rather than a fake quota scraper: the CLIs do not expose provider quotas, so this shows what we actually spent per backend, the early-warning signal for leaning too hard on one model. (Claude also has real provider rate-limit data via the capacity view.)',
    ],
  },
  {
    version: '6.78.0',
    date: '2026-07-09',
    title: 'Full changelog history restored',
    bullets: [
      'The in-app changelog was only showing releases back to v6.69 — everything before it was missing. Nothing was lost; the feed the changelog reads was simply created at 6.69 and never backfilled. Restored the complete platform history from v6.0.0 (the Orchestration Platform, 4 Apr) up to today, so the changelog now shows every release Porter has shipped.',
    ],
  },
  {
    version: '6.77.0',
    date: '2026-07-09',
    title: 'Porter now follows its own release rules',
    bullets: [
      'Porter adopted the same release-kit every other product uses: it carries a release manifest, its commit hooks record each ship, and the cross-project release audit now shows Porter itself as fully wired — so the one product that enforces release consistency is no longer an exception to it. No change to how Porter builds, deploys, or announces.',
    ],
  },
  {
    version: '6.76.0',
    date: '2026-07-09',
    title: 'Release reconciler hardened (no more mis-announces)',
    bullets: [
      'Fixed the announce reconciler after it posted a garbled update: it now only announces a version when the release notes for that EXACT version exist (never forces a version onto stale notes), reads notes from the typed feed only (no fragile text parsing), and auto-announces Porter only — other apps announce through their own release flow. Safe by construction.',
    ],
  },
  {
    version: '6.75.0',
    date: '2026-07-08',
    title: 'Admin version + changelog now tell the truth (and previews zoom)',
    bullets: [
      'The Porter admin was showing a stale v6.3.0 in the sidebar/footer and a frozen changelog. Both now bake from the ONE backend release truth at deploy — the version matches what is actually running, and the changelog shows the same release notes the group announce uses. Also: the document preview now has zoom in/out/reset controls so an expanded PDF or image can be read at any size.',
    ],
  },
  {
    version: '6.74.0',
    date: '2026-07-08',
    title: 'Release announces are now enforced, not optional',
    bullets: [
      'The group release announcement is no longer something a session has to remember to run — Porter now re-asserts the announce for every project\'s current shipped version every 10 minutes, idempotently. If a release ever ships without its announce (any session, or none), Porter fills the gap automatically within minutes. The ceremony is structural now, not manual.',
    ],
  },
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
  {
    version: '6.68.0',
    date: '2026-07-08',
    title: 'Files perfect-sync',
    bullets: [
      'Added a reconcile pass (POST /vault/reconcile) so the document index exactly matches what is on disk — moved or deleted files are corrected automatically, no drift.',
    ],
  },
  {
    version: '6.67.0',
    date: '2026-07-08',
    title: 'One entry per unique file',
    bullets: [
      'Documents are now de-duplicated by content: the same file appearing in several places collapses to a single indexed entry with every location tracked, instead of many near-duplicate rows.',
    ],
  },
  {
    version: '6.66.0',
    date: '2026-07-08',
    title: 'Document Library foundation',
    bullets: [
      'Laid the groundwork for the Porter Files directory — a table that records every place a given document lives across an app, so the library can show one file with all its locations.',
    ],
  },
  {
    version: '6.65.0',
    date: '2026-07-08',
    title: 'Reorg tooling (dry-run)',
    bullets: [
      'Added config-generation plus move/de-dup runbooks that preview every change before anything is touched — safe planning for large file reorganisations.',
    ],
  },
  {
    version: '6.64.0',
    date: '2026-07-08',
    title: 'Knowledge graph associations',
    bullets: [
      'Vault association engine: records can now link to each other and a focused view expands along those edges, so related knowledge surfaces together instead of in isolation.',
    ],
  },
  {
    version: '6.63.0',
    date: '2026-07-08',
    title: 'Vault-reader shadow canary',
    bullets: [
      'Internal safety step: ran the new vault reader in shadow mode with all flags off to prove zero risk before it goes live.',
    ],
  },
  {
    version: '6.62.0',
    date: '2026-07-07',
    title: 'Tools registry',
    bullets: [
      'First slice of a canonical tools registry so every tool Porter can call is discoverable in one place rather than scattered.',
    ],
  },
  {
    version: '6.61.0',
    date: '2026-07-07',
    title: 'Dead-code cleanup',
    bullets: [
      'Removed the retired brain-ui :5176 surface and unused mail/forge/rpg tables — less dead weight, clearer system.',
    ],
  },
  {
    version: '6.60.0',
    date: '2026-07-07',
    title: 'Identity spine — scope ladder + product registry',
    bullets: [
      'Introduced a scope ladder and product registry so every piece of knowledge and every service knows which app/project/product it belongs to — the backbone for clean multi-app separation.',
    ],
  },
  {
    version: '6.59.0',
    date: '2026-07-07',
    title: 'Porter MCP server (alpha)',
    bullets: [
      'First alpha of the Porter MCP server — lets Claude pull Porter knowledge directly (headless), plus vault review-queue engine operations.',
    ],
  },
  {
    version: '6.58.0',
    date: '2026-07-07',
    title: 'Review-queue placement IDs',
    bullets: [
      'The knowledge-graph read now returns a placement ID for each proposed item so the review queue can accept or refile it precisely.',
    ],
  },
  {
    version: '6.57.0',
    date: '2026-07-07',
    title: 'Admin hygiene',
    bullets: [
      'Housekeeping: zero type-check errors, stopped tracking build artefacts in git, and fixed a dream-run JSON bug.',
    ],
  },
  {
    version: '6.56.0',
    date: '2026-07-07',
    title: 'Graph edges API',
    bullets: [
      'Added edge ingestion (POST /vault/edges) so apps can declare relationships between knowledge nodes, not just the nodes themselves.',
    ],
  },
  {
    version: '6.55.0',
    date: '2026-07-07',
    title: 'MCP management page',
    bullets: [
      'New MCP management screen in the Porter admin, plus removal of dead Forge code.',
    ],
  },
  {
    version: '6.54.0',
    date: '2026-07-07',
    title: 'Derivative loop — raw to markdown',
    bullets: [
      'Vault now derives clean markdown from raw source documents and keeps it fresh, re-generating when the source changes (stale-aware).',
    ],
  },
  {
    version: '6.53.0',
    date: '2026-07-07',
    title: 'Placement accept/refile',
    bullets: [
      'Review-queue operations: a proposed knowledge placement can now be accepted or refiled to a better spot.',
    ],
  },
  {
    version: '6.52.0',
    date: '2026-07-07',
    title: 'Scoped graph reads',
    bullets: [
      'Knowledge-graph reads can now be filtered by layer and focused on a subtree, so an app sees just its slice instead of the whole graph.',
    ],
  },
  {
    version: '6.51.0',
    date: '2026-07-07',
    title: 'Type-checked ingest',
    bullets: [
      'New ingest API accepts type-checked knowledge pushes and returns proposed placements for review before anything is committed.',
    ],
  },
  {
    version: '6.50.0',
    date: '2026-07-07',
    title: 'Apps declare their node types',
    bullets: [
      'Added a register-schema API so each app can declare the kinds of knowledge nodes it produces — the graph adapts per app instead of a fixed shape.',
    ],
  },
  {
    version: '6.49.0',
    date: '2026-07-07',
    title: 'Vault v2 — generic schema',
    bullets: [
      'Foundation of the v2 knowledge graph: a generic six-table schema that can hold any app’s knowledge, replacing the old fixed layout.',
    ],
  },
  {
    version: '6.48.0',
    date: '2026-07-06',
    title: 'Admin revamp — dead screens removed',
    bullets: [
      'Removed the Forge, Email and Skill-Feedback screens from the admin (their backends were already gone, so these were dead frontends) — trimming ~2,000 lines and clearing the way for the MCP, tools and CLI-config views that follow.',
    ],
  },
  {
    version: '6.47.0',
    date: '2026-07-06',
    title: 'Bridge model failover',
    bullets: [
      'Tom no longer breaks when Claude hits a quota or error: every Bridge dispatch now automatically retries the same task on the next model in the chain (Claude → Codex → Antigravity), with the whole failover recorded. Callers can opt out for hard-fail behaviour.',
    ],
  },
  {
    version: '6.46.0',
    date: '2026-07-06',
    title: 'Cleanup + telemetry fix',
    bullets: [
      'Removed the dead documents-tree code, fixed Codex cost/telemetry reporting, and shipped the second slice of the email verdict work.',
    ],
  },
  {
    version: '6.45.0',
    date: '2026-07-06',
    title: 'Knowledge-evolution loop',
    bullets: [
      'A background worker now researches on the cheap model tier and scans GitHub for improvements, filing proposals only — Porter suggests, a human still approves.',
    ],
  },
  {
    version: '6.44.0',
    date: '2026-07-06',
    title: 'Antigravity gateway',
    bullets: [
      'Registered and proved the Antigravity CLI (agy) as a Bridge gateway — another model backend Porter can route to.',
    ],
  },
  {
    version: '6.43.0',
    date: '2026-07-06',
    title: 'Memory unification (U5+U6)',
    bullets: [
      'Shipped the final slices of the memory-unification work that brings Porter memory and the vault into one consistent store.',
    ],
  },
  {
    version: '6.42.0',
    date: '2026-07-05',
    title: 'Rules learned from failures',
    bullets: [
      'New rule-distillation loop: repeated failures now turn into proposed operating rules for review, so Porter learns from what went wrong.',
    ],
  },
  {
    version: '6.41.0',
    date: '2026-07-05',
    title: 'Memory unification (U3+U4)',
    bullets: [
      'Memory injection now prefers the vault as its source, and nightly dream drafts write back into the vault — one knowledge home, not two.',
    ],
  },
  {
    version: '6.40.0',
    date: '2026-07-05',
    title: 'Memory unification (U1+U2)',
    bullets: [
      'Began unifying memory with the vault: a live mirror of memory into the vault plus a concept indexer, so structured knowledge and freeform memory stop drifting apart.',
    ],
  },
  {
    version: '6.39.0',
    date: '2026-07-04',
    title: 'Dream reviewer + docs-match-reality',
    bullets: [
      'Added a reviewer for the nightly dream proposals and a check that flags when documentation no longer matches the running system.',
    ],
  },
  {
    version: '6.38.0',
    date: '2026-07-04',
    title: 'Dead-code batch + mail shutdown',
    bullets: [
      'Cleared a batch of dead code and closed the old mail ports Porter no longer uses.',
    ],
  },
  {
    version: '6.37.0',
    date: '2026-07-04',
    title: 'Unjammed the memory pruner',
    bullets: [
      'Fixed the nightly memory pruner that had stalled, so old low-value memory is cleaned up again.',
    ],
  },
  {
    version: '6.36.1',
    date: '2026-07-02',
    title: 'Active-project fallback + version fix',
    bullets: [
      'The /context endpoint now falls back to the pinned active project when it can’t infer one, and a hardcoded version that had drifted out of sync was fixed.',
    ],
  },
  {
    version: '6.36.0',
    date: '2026-06-25',
    title: 'Nightly memory dream',
    bullets: [
      'The memory distiller became Tom’s nightly “dream” — each night Porter turns the day’s episodes into durable, reviewed knowledge.',
    ],
  },
  {
    version: '6.35.0',
    date: '2026-06-25',
    title: 'Rules supersede on conflict',
    bullets: [
      'When a new operating rule conflicts with an old one, the newer rule now supersedes it cleanly instead of both lingering.',
    ],
  },
  {
    version: '6.34.0',
    date: '2026-06-25',
    title: 'Surprise-salience write-gate',
    bullets: [
      'Memory now only saves what’s genuinely new or surprising, keeping the brain focused instead of hoarding routine noise.',
    ],
  },
  {
    version: '6.33.0',
    date: '2026-06-25',
    title: '“Where we left off” recall',
    bullets: [
      'Added session-scoped recall so Porter can pick up exactly where a previous session left off.',
    ],
  },
  {
    version: '6.32.0',
    date: '2026-06-24',
    title: 'Better recall + durable distiller',
    bullets: [
      'Recall now matches on any of the query terms (broader, more relevant results) and the memory distiller survives restarts.',
    ],
  },
  {
    version: '6.31.3',
    date: '2026-06-14',
    title: 'Agent persona text',
    bullets: [
      'GET /agents/:id now returns the agent’s full persona text.',
    ],
  },
  {
    version: '6.31.2',
    date: '2026-06-13',
    title: 'Bridge stream fix',
    bullets: [
      'Fixed the Claude CLI gateway double-emitting stream chunks.',
    ],
  },
  {
    version: '6.31.1',
    date: '2026-06-11',
    title: 'System screen cleanup',
    bullets: [
      'Stripped the fake “theater” out of the admin System screen and repaired the changelog generator.',
    ],
  },
  {
    version: '6.31.0',
    date: '2026-06-10',
    title: 'Ops revamp',
    bullets: [
      'Rebuilt the admin Ops area on a clean light-only design system, added a Bridge console, and merged the Brain views into one screen.',
    ],
  },
  {
    version: '6.30.1',
    date: '2026-06-10',
    title: 'Honest model lineup',
    bullets: [
      'Refreshed the stale model list and corrected the cost labels so the numbers shown are honest.',
    ],
  },
  {
    version: '6.30.0',
    date: '2026-06-10',
    title: 'Brain cleanup',
    bullets: [
      'Cleaned up the brain: only meaningful episodes are kept, old telemetry is purged, and dead signals were removed from the UI.',
    ],
  },
  {
    version: '6.29.0',
    date: '2026-06-10',
    title: 'Agents read/write the brain',
    bullets: [
      'Non-CLI agents can now read from and write to Porter’s memory directly through a dedicated agent-memory surface.',
    ],
  },
  {
    version: '6.28.1',
    date: '2026-06-02',
    title: 'Per-request model choice',
    bullets: [
      'The Claude CLI gateway now honours a --model passthrough so a specific model can be requested per dispatch.',
    ],
  },
  {
    version: '6.28.0',
    date: '2026-05-31',
    title: 'Leaner backbone',
    bullets: [
      'Stripped the agent-hub “theater” down to a lean backbone — less decoration, clearer core.',
    ],
  },
  {
    version: '6.27.0',
    date: '2026-05-31',
    title: 'Removed Atlas + org chart',
    bullets: [
      'Removed the unused Atlas autonomous agent and the admin org-chart screen.',
    ],
  },
  {
    version: '6.26.0',
    date: '2026-05-29',
    title: 'Dropped the old SaaS surface',
    bullets: [
      'Trimmed the dead client-app SaaS code and the People/Costs admin tabs, sharpening Porter as a backbone rather than a product.',
    ],
  },
  {
    version: '6.25.0',
    date: '2026-05-23',
    title: 'Tom “wrong surface” fix',
    bullets: [
      'Passed --strict-mcp-config to the Claude CLI so Tom stops picking up the wrong toolset and producing noise.',
    ],
  },
  {
    version: '6.24.0',
    date: '2026-05-22',
    title: 'System prompt wiring',
    bullets: [
      'Bridge now routes the system prompt to Claude’s dedicated --system-prompt flag, so agent instructions land correctly.',
    ],
  },
  {
    version: '6.23.0',
    date: '2026-05-19',
    title: 'Directives lookup',
    bullets: [
      'Added a /directives endpoint so agents can fetch the current promoted operating rules on demand.',
    ],
  },
  {
    version: '6.22.0',
    date: '2026-05-18',
    title: 'Porter identity split',
    bullets: [
      'Separated Porter’s own identity from the active project: an active-project pin plus a rewritten session hook, so sessions resolve the right project cleanly.',
    ],
  },
  {
    version: '6.21.0',
    date: '2026-05-18',
    title: 'Codex adapter + Tom fixes',
    bullets: [
      'Shipped the Codex CLI adapter and a batch of Tom bug fixes.',
    ],
  },
  {
    version: '6.18.0',
    date: '2026-05-18',
    title: 'Recall document Q&A',
    bullets: [
      'Recall can now answer questions over ingested documents end-to-end — schema, ingest, retrieval and Codex-synthesised answers.',
    ],
  },
  {
    version: '6.17.1',
    date: '2026-05-15',
    title: 'Checkpoint bump',
    bullets: [
      'Housekeeping release rolling up the Dream Silos work.',
    ],
  },
  {
    version: '6.17.0',
    date: '2026-05-13',
    title: 'Dream Silos — review surface',
    bullets: [
      'Completed the Dream Silos series with an admin review surface: browse, run, and accept or reject the nightly memory proposals.',
    ],
  },
  {
    version: '6.16.0',
    date: '2026-05-13',
    title: 'Software dream worker',
    bullets: [
      'Added the software-silo dream worker and a manual trigger (POST /dream-run) so improvement proposals can be generated on demand.',
    ],
  },
  {
    version: '6.15.0',
    date: '2026-05-12',
    title: 'Raw passthrough',
    bullets: [
      'Added a raw:true passthrough on /chat/stream for callers that want the model output unmodified.',
    ],
  },
  {
    version: '6.14.0',
    date: '2026-05-12',
    title: 'Isolated Claude subprocess',
    bullets: [
      'The Claude CLI backend is now spawned in an isolated working directory so it can’t accidentally inherit Porter’s own operating context.',
    ],
  },
  {
    version: '6.13.0',
    date: '2026-05-11',
    title: 'Transcript capture',
    bullets: [
      'Porter now captures session transcripts, the raw material the memory system learns from.',
    ],
  },
  {
    version: '6.12.0',
    date: '2026-05-11',
    title: 'Silo foundation',
    bullets: [
      'Laid the multi-silo foundation that lets memory and dreams be scoped per domain rather than lumped together.',
    ],
  },
  {
    version: '6.11.0',
    date: '2026-05-10',
    title: 'Bridge console revived',
    bullets: [
      'Restored the Bridge tabs, summary metrics and live activity ticker in the admin.',
    ],
  },
  {
    version: '6.10.0',
    date: '2026-05-10',
    title: 'Honest dispatch metrics',
    bullets: [
      'Separated CLI tool-observability events from real model dispatches so the Bridge numbers reflect actual work.',
    ],
  },
  {
    version: '6.9.0',
    date: '2026-04-17',
    title: 'Bridge simplified to Claude CLI',
    bullets: [
      'Simplified the Bridge down to the Claude CLI backend, cutting the tangle of half-working gateways.',
    ],
  },
  {
    version: '6.8.1',
    date: '2026-04-15',
    title: 'Removed direct API gateway',
    bullets: [
      'Removed the direct Anthropic API gateway in favour of routing through the CLI.',
    ],
  },
  {
    version: '6.8.0',
    date: '2026-04-13',
    title: 'Model correction + DB enforcement',
    bullets: [
      'Corrected the model metadata and added database-trigger enforcement so bad data can’t be written.',
    ],
  },
  {
    version: '6.7.0',
    date: '2026-04-12',
    title: 'Autonomy launch',
    bullets: [
      'Launched the first autonomy features alongside fixes to the openclaw Bridge path.',
    ],
  },
  {
    version: '6.5.0',
    date: '2026-04-10',
    title: 'Intellect, Forge, tools & skills',
    bullets: [
      'Shipped Intellect phases 1–3 plus Forge, the tools and skills registries, and subscriptions — a large capability drop.',
    ],
  },
  {
    version: '6.4.0',
    date: '2026-04-10',
    title: 'Operational roadmap',
    bullets: [
      'Rolled up the tools, skills and evolution work and set the operational Porter roadmap.',
    ],
  },
  {
    version: '6.3.0',
    date: '2026-04-04',
    title: 'Nothing left hidden',
    bullets: [
      'Exposed the remaining five hidden data surfaces as admin pages — every part of Porter’s data is now visible in the admin.',
    ],
  },
  {
    version: '6.2.0',
    date: '2026-04-04',
    title: 'Platform intelligence surfaces',
    bullets: [
      'Surfaced eight previously hidden data areas as new admin pages.',
    ],
  },
  {
    version: '6.1.0',
    date: '2026-04-04',
    title: 'Porter Mail Platform',
    bullets: [
      'Added the Porter Mail platform (later retired) as part of the v6 build-out.',
    ],
  },
  {
    version: '6.0.0',
    date: '2026-04-04',
    title: 'The Orchestration Platform',
    bullets: [
      'The v6 milestone that reframed Porter as the orchestration platform / backbone — the foundation the whole current system is built on.',
    ],
  },
];
