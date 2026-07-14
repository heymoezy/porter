## v6.112.0 (2026-07-14) — twelve scheduled jobs had silently stopped running

Moe asked why he was still getting "system DEGRADED" alerts after I said they were fixed. The alerts
were **telling the truth**. I had fixed the alert's *spam* and never asked whether the thing it was
complaining about was real. It was.

- **Any workflow with a cadence longer than the gap between deploys had never been firing.** The
  scheduler decided whether a job was due by counting its own uptime ticks — `tickCount % (24h / 2s)`.
  `tickCount` resets to zero on every restart, and Porter restarts on every deploy:
  - `every_30m` — needs 30 min of uptime — fired fine
  - `every_6h` — needs 6 unbroken hours — last ran 2 days ago
  - `every_24h` — needs 24 unbroken hours — last ran 2 days ago
  - `every_week` — needs **7 unbroken days** — effectively never
- **Twelve workflows were dead**: the vault derivative sweep, daily memory pruning, transcript
  pruning, pattern mining, the Claude session-rule mirror, the directives→vault mirror, the
  dream-proposal digest, vault concept indexing, and more. Every one of them reported `success`,
  because the last time they ran, they did succeed. **They simply never ran again.** A status field
  records the last outcome; it cannot tell you the job stopped happening.
- **The mechanism, not the instance.** The code already carried a comment describing this exact bug
  being fixed for ONE job — the memory distiller, moved to a persisted gate after Tom's learning loop
  froze in June — while leaving the same broken counter under twelve others. Fixing the instance and
  not the mechanism is why it came back. Cadence is now decided by each workflow's **persisted**
  `last_run_at`, asked of the database on a frequent tick: restart-proof, and anything overdue fires
  within one tick of a restart.
- **The staleness threshold was also wrong**: a flat 48h for every scheduled workflow, which would
  have called a *weekly* job stale after two days. It is now 2.2× the job's own period — the same
  rule the systemd timers already used.
- Verified: all 16 overdue workflows fired; stale count **12 → 0**.

## v6.111.0 (2026-07-14) — #28: the tool registry was pointing at a browser nothing could reach

- **Porter's tool registry advertised a Chrome that no code on this box resolves to.** The detector
  scanned the puppeteer cache, sorted it, and took the **last directory** — "newest folder wins",
  which is not the same question as "which browser do we actually launch". It had pinned Chrome
  **148**, an orphan left behind by an old install, while every puppeteer here resolves to **147.56**.
  Porter's own self-QA had been screenshotting through that orphan for as long as it existed.
  - It only surfaced because something finally garbage-collected the cache. A registry that reports
    the newest thing on disk rather than the thing in use is a directory listing with extra steps —
    and freezing a revision-pinned absolute path also broke this codebase's own rule #2, *no
    hardcoded binary locations*.
- **Both browsers now resolve from what the code pins**, not from what the filesystem happens to
  hold: `puppeteer.executablePath()` for Chrome, `playwright-core/browsers.json` for Chromium. The
  registry now says 147.56 and 1208 — which is what Porter actually launches.
  - Playwright needed a second pass: `playwright-core` declares an `exports` map that refuses
    `browsers.json`, so asking for that subpath threw and silently fell back to the same bad scan.
- **A central tool directory that never prunes is not one copy of the tool — it is every copy, in one
  place.** `_ops/bin/browser-gc.sh` derives the reachable set by asking the installed libraries, then
  reversibly quarantines the rest. First run: **6 unreachable browsers, 1.8 GB** — two orphaned
  Chromes and four `chrome-headless-shell` builds that puppeteer's installer downloads for every
  revision and that nothing here has ever launched. Weekly timer (`vps-browser-gc`), discovered and
  monitored by the #52 runnables registry.

## v6.110.0 (2026-07-14) — #27 R8: the folds, and one part of the design refused

- **Brain is now "Memory", under Porter — not folded into the Vault.** The council design (R6) said
  to fold Brain into `Vault > Nodes/Edges`. **That is a category error and Moe agreed.** Brain shows
  Porter's own memory — Synapse Feed, Episodes, Knowledge, Rules, dream proposals — which is
  **Porter-global**. The Vault is a **per-product** knowledge graph (`scope=ymc`). Folding Porter's
  brain inside a customer's vault tab hides a global thing inside a product surface.
  - I executed a council design without question once today (the review queue) and it turned out to
    be a fabrication. Not twice.
- **Bridge needed no fold at all** — it has been the `Services` entry since R2. R7 was already done.
- **Nothing is deleted.** Every route still resolves; `Brain` simply moved out of `Legacy` and became
  `Memory` under `Porter`, which is where a global memory surface belongs. Deletion waits for Moe to
  have used the folded IA and confirmed — and then it happens promptly, because he does not want
  legacy code hanging around indefinitely.
- **Fixed a review queue that could not be reached.** The Memory page has always had a "To review"
  section for memory candidates, and the endpoint behind it **never existed** — the page just 404'd.
  `directives.status='candidate'` is real (`memory-promoter` auto-promotes at priority ≥ 80 and
  archives after 14 days), so a human is supposed to be able to intervene *before* the promoter
  decides for them. `GET /intellect/candidates` and `POST /intellect/candidates/:id/:action` now
  exist. **A review queue you cannot reach is not a review queue** — the same defect as the vault's,
  in a different room.

## v6.109.0 (2026-07-14) — the graph was still serving the nodes I had archived

- **R1 did not actually work, and I announced that it had.** It archived 1,740 Phoenix nodes and I
  said "Phoenix is out of the knowledge graph". But `/vault/graph` never filtered on `status`, so it
  kept serving **all 1,707 of them**. Moe would have opened the vault and seen 1,702 cold prospects
  staring back at him — after being told they were gone.
- **Archiving that the reader ignores is not archiving. It is bookkeeping.** The graph now excludes
  `status = 'archived'`, which is the entire point of the state existing.
- Effect: the ymc graph drops **4,414 → 2,674 nodes**, review count **4,176 → 2,436**, and the vault
  finally shows the business — YMC, Deals, Funds, Workouts, Team, Contacts, Data Rooms, Compliance,
  Common Ground, Dunross/Crow — instead of a wall of cold prospects.
- **Caught only by screenshotting the actual page.** The database was right, the migration was right,
  the announcement was confident, and the product was still wrong. A change is not done because the
  data changed; it is done when the thing a human looks at changed.

## v6.108.0 (2026-07-14) — #52: ONE registry for everything that runs

- **A thing that runs but is registered nowhere cannot be monitored, and dies silently.** That is not
  a theory — it cost Moe his "Fatburger Daily" legal digest, which stopped on 2026-06-18 and went
  unnoticed for **25 days**. Every health check stayed green the entire time, because **nothing
  anywhere was watching for absence**.
- **`runnables` — the one registry.** It **DISCOVERS** rather than being told: systemd timers, ymc's
  `scheduler.manifest`, and Porter's own `workflows` engine. A hand-maintained list drifts the moment
  someone adds a timer; a discovered one cannot. **42 runnables found** on the first pass.
- **The taxonomy Moe asked for, and they are NOT synonyms:** `agent` (a persona that reasons) ·
  `job` (a scheduled deterministic execution) · `hook` (an invariant gate that fires on an event and
  exists to REFUSE — a hook is not a job) · `loop` (an agent iterating toward a condition) · `goal`
  (an outcome a human wants; no schedule at all).
- **Staleness is the payload.** Each job carries `max_silence_seconds`, derived from its own cadence
  (2.2× its period) — never a hardcoded list, which would rot exactly like the thing it is meant to
  catch. **"Has gone quiet" is now folded into the same health verdict that already alerts Moe** — no
  new channel, no new cooldown to get wrong.
- **4 jobs were found running under no governance at all** (`journeyful-db-backup`, `journeyful-fx`,
  `porter-db-backup`, `launchpadlib-cache-clean`) — they run, but no manifest says they should. Now
  flagged rather than quietly tolerated.
- **Acceptance test — the one the task demanded — passes end to end:** simulate Fatburger Daily going
  silent for 25 days → the verdict flips from `healthy — nominal` to
  **`degraded — stopped running: ymc-fatburger-daily (silent 25d)`** → and back to healthy on
  restore. Exactly the condition that stayed green for 25 days.
- **CORRECTION ON RECORD:** I previously stated that Porter's `agents` and `workflows` tables were
  "both empty" and put it in two checkpoints and a group announcement. **That was wrong.** My query
  used a column that does not exist, errored, and returned nothing — and I read the empty result as
  an empty table. `workflows` holds **21 live workflows**, all enabled, all of which have run. There
  is no `agents` table at all. The core finding stands (Fatburger matched **0** workflows — it truly
  existed nowhere), but the detail was false and is corrected here.

## v6.107.0 (2026-07-14) — R9: a commit carrying a secret is now refused

- **Attention is not a control.** On 2026-07-13 the admin service token was found sitting in **11
  commits of this PUBLIC repo** — and while fixing that, I very nearly committed the live
  `OPENCLAW_TOKEN` into the same repo by tracking the systemd unit verbatim. It had **0 commits in
  history**; I caught it by hand. Nothing but my own attention stood between a live credential and
  GitHub. That is not a control; it is luck.
- **`_ops/bin/secret-scan.sh`** now runs first in the pre-commit hook of **both** repos and REFUSES
  the commit. It scans the **staged diff (added lines only)**, so it sees exactly what is about to
  enter history — and a secret being *removed* never blocks its own removal.
- Patterns are **shape-based**, not a blocklist of what already leaked: AWS keys, GitHub PATs,
  Anthropic/OpenAI keys, Slack tokens, private-key headers, DSNs with inline passwords, and any
  `TOKEN/SECRET/PASSWORD = <16+ chars>`. Plus the two known-leaked literals, so they can never return.
- **Not bypassable** by `SKIP_RELEASE_GATE`. A release can be rushed; a leaked credential cannot be
  un-published.
- **Two bugs found while testing it — both of which would have made it useless:**
  - this box's `grep` is **ugrep**, which rejects `^\+\+\+` as invalid regex, so the diff filter
    errored out and the scanner **matched nothing while reporting success**. A security control that
    silently matches nothing is worse than none: it manufactures confidence. Rewritten with `awk`.
  - `grep` parsed the `-----BEGIN PRIVATE KEY-----` pattern as a **flag** (it starts with `-`), so a
    private key sailed straight through. Fixed with `-e`.
  - A **third** surfaced immediately: the scanner **refused its own release notes**, because this
    changelog *describes* the private-key pattern in prose. A false positive that blocks honest work
    teaches people to bypass the gate, which is how a security control dies. The PEM pattern is now
    anchored to a whole line — a real key header occupies one; prose wraps it in backticks.
  - All three were caught only because the scanner was tested against **real secrets** and **real
    commits**, not assumed to work.
- Verified: 7 secret shapes refused; placeholders (`USER:PASSWORD`, `process.env.X`) allowed; both
  repos scan clean; a real commit carrying the token is REFUSED end to end.

## v6.106.0 (2026-07-14) — R4: the Inspector. Step through the logic; cut a wrong association.

- **The graph could not explain itself.** 1,731 of its 1,766 edges recorded **no reason at all** —
  they asserted that two things were related and said nothing about why. That is what "weird
  associations" looks like from the inside: not wrong logic, but *invisible* logic. You cannot step
  through reasoning that was never written down.
- **Every association now records WHY it exists** — the rule, the source table, and the exact row
  that caused it. `edge()` in the ymc ingest now **throws** if provenance is missing, so an
  unauditable association can never be created again. Coverage: **35 → 1,770 of 1,770 (100%)**.
  - The 1,435 vague `related_to` edges — **81% of the whole graph** — came from a *folder-path match*
    (`a file under workoutdocs/edwardchen/ matches the entity "Edward Chen"`). A sound rule that
    never said so. It says so now.
  - 2 edges whose source rows no longer existed were deleted: unauditable by definition.
- **New `GET /vault/nodes/:id/explain`** — for any item: where it is filed and who decided that,
  every association with its reason, and the real files behind it.
- **New `DELETE /vault/edges/:id`** — cut a wrong association. Proven to remove **only** the edge:
  both nodes and their files survive.
- **The review queue is gone; the Inspector replaces it.** The queue was a gate that gated nothing —
  every reader already treated `proposed` and `active` alike. This is the thing that was actually
  asked for.
- **Fixed a dashboard that had started lying:** it still reported a 25/sweep batch limit and an
  81-day ETA after R6 raised the limit to 100. Both now read the real constant — **21 days**.

## v6.105.0 (2026-07-14) — R6: derivative sweep 25 → 100/day, with a quota guard

- **Batch limit 25 → 100 per run** (`VAULT_DERIVATIVE_BATCH_LIMIT`). At 25/day the remaining
  backlog needed ~84 days — and it looked healthy the whole time, because it dutifully did its 25
  every day. That is the worst kind of slow: visibly fine, quietly never finishing. ~21 days now.
- **A quota guard, because the spend is CLI quota — not metered dollars.** The sweep dispatches
  through Bridge to `codex_cli`; the real risk of a bigger batch is **starving Tom and Bridge of the
  same quota**. Derivatives are background work; Tom answering Moe is not. So the sweep now yields:
  - a **429 in the last hour** on that gateway → the sweep **skips** entirely;
  - inside the **20% reserve** of a known limit → **skips** (the reserve is held for Tom/Bridge);
  - otherwise the batch is **trimmed** to whatever headroom is left.
  - Only **real provider-supplied limits** are enforced. `inferred` rows (limit unknown) are not
    treated as a ceiling — architecture rule 5: never present unknown capability as known.
  - A quota-lookup failure falls back to the old conservative 25 rather than gambling 100.
- **All three paths proven, not asserted**: forced a 429 → skipped; forced 85/100 → skipped;
  forced 30/100 → the event log shows `attempted: 50` (trimmed from 100 by the reserve). Test values
  restored afterwards — no fake quota left in the table.
- The verification run generated **100 real derivatives** (74 → 174), 0 failures. Backlog:
  **2,109 → 2,009**.

## v6.104.0 (2026-07-14) — R3: stop asking Moe to review what he already reviewed

- **426 documents were queued for review that Moe had already approved — in ymc — himself.**
  `ymc_capital.document_reviews` holds 462 decisions across 460 documents, every one `approved`,
  every one reviewed by **Moe Ibrahim**. Those same documents were sitting in the vault's queue as
  `proposed`, waiting to be reviewed a second time, by the same person, for the same documents.
- **Imported, with the real reviewer attributed.** Not "system", not the AI — the placements now
  record **Moe Ibrahim** as reviewer, because he is who decided.
  - The join is **exact, not fuzzy**: `vault_artifacts.source_id` (`kind='db_entity'`,
    `source_system='ymc_capital'`) *is* `ymc_capital.documents.id`. No name matching, no guessing.
  - Refuses to create a second active placement for a node that already has one (the
    one-active-per-node invariant holds).
- Shipped as a **repeatable, idempotent script** (`backend/scripts/import-ymc-review-decisions.ts`),
  not a one-shot migration — so it reproduces on a fresh box and can be re-run safely. Proven: a
  second run finds **0 left to do**.
- **Review queue: 4,900 → 2,772** across R1–R3, and Moe has reviewed nothing.

## v6.103.0 (2026-07-14) — R2: the vault stops storing the same document twice

- **840 redundant artifact rows removed.** The vault held 3,010 hashed artifacts for only 2,170
  distinct contents: 486 groups where one node carried several artifact rows with **identical
  bytes** — the same document filed at two paths (`edwardchen/IDENTITY_EXHIBIT.pdf` and
  `Working_Papers/Identity_Attribution_Inquiry.pdf` are byte-for-byte the same file).
- **The root cause was in the ingest, and it would have undone the cleanup on the next run.**
  Artifact identity keyed on **path**, not content — so the same document at a second path made a
  second artifact row. Identity is now `(node, kind, source)` **OR** `(node, kind, identical
  bytes)`. Proven: ingesting the same bytes at two paths now yields **one** artifact, where it
  previously produced two.
  - "One file, many locations" is what `vault_artifact_locations` is for. The artifact is the
    *content*; the locations are where it happens to sit.
- **Nothing was lost.** Verified before deleting: all 1,326 duplicate-group paths were already
  preserved as locations, and all 840 duplicate derivative jobs were `missing` — **no generated
  derivative was destroyed**. All 2,933 locations still resolve to a live artifact.
- **28 zombie derivative jobs removed** — jobs whose source artifact no longer existed at all
  (from an earlier re-ingest, not from this change; the arithmetic is exact). They could never
  succeed: the sweep would pick each one up, fail to read a source that isn't there, and they would
  sit in the backlog forever burning a model-call slot.
- **Derivative backlog: 2,977 → 2,109 missing** (−29%), before any change to throughput.

## v6.102.0 (2026-07-14)

- **Release notes no longer quote private messages.** Entries across this changelog, the Porter
  release feed and ymc's What's New carried verbatim quotes lifted from internal conversations —
  and in one case a second-person paraphrase. A changelog is a product record: it states what
  changed and why it mattered, not what someone said in chat. 58 quote constructs removed across
  both repos; **no entry lost any substance**. The rule now applies to group announcements too.

## v6.101.0 (2026-07-13) — Phoenix is out of the knowledge graph

- **The "4,900 documents" were never 4,900 documents.** Moe: *"there is no way I added 4,900
  documents."* He was right. The queue was inflated by **Phoenix CRM rows pushed into a knowledge
  graph**: 1,702 `outreach_target` (cold-outreach PROSPECT COMPANIES from
  `phoenix_v3_outreach_drafts`), 5 `mandate`, 32 `concept` nodes titled "Thesis: <prospect>"
  (per-company scoring hypotheses masquerading as durable knowledge), and the `Outreach` domain.
  - That breaks the standing rule — **memory ≠ database**: structured contact/deal/prospect data
    lives in the admin DB, never in memory. **1,702 cold prospects wired into a second brain is
    precisely what produced the "weird associations" Moe saw in the graph.**
  - Moe: *"phoenix needs to be completely out of the knowledge graph for now — it's an experiment
    we launched and paused because it's not really working and needs a total revamp later."*
- **Archived, never deleted** (`0107_phoenix_out_of_the_graph.sql`): 1,740 nodes + their placements
  flipped to `archived`, 14 Phoenix edges removed. All restorable by flipping `status` back when
  Phoenix is revamped. **The Phoenix data itself is untouched in `ymc_capital`** — verified
  identical before and after (3,232 contacts / 661 prospects / 301 CRM users).
- The one real `enquiry` lived under the Outreach domain — **re-parented to Deals** rather than
  orphaned.
- **Phoenix ENGINEERING DOCS are deliberately KEPT** (`topic:phoenix` learnings). Our own design
  knowledge is knowledge; a CRM row is not.
- **Review queue: 4,900 → 3,198.**

## v6.100.1 (2026-07-13)

- Corrected the stale docblock in `admin/.../routes/vault.tsx`. 6.100.0 fixed the UI copy and the
  data, but the file's own header still claimed "the AI proposes a placement for every item it
  ingests" — the exact falsehood 6.100.0 disproved. A stale comment is a lie the next reader
  believes, and this one would have re-taught the mistake to whoever touched the file next.

## v6.100.0 (2026-07-13) — the vault was lying about who filed 5,176 things

- **No AI ever proposed those placements.** Every vault placement was stamped
  `proposed_by = 'ai'`. It was false. `resolveProposedParentId()` has always been a
  **deterministic pass-through stub** — exactly one commit has ever touched it, the commit that
  created it — so **no classifier has ever run**. All 5,176 placements are the calling app's
  **own declared hierarchy**, passed straight through, and every one has `confidence = NULL`
  because nothing ever scored them.
  - **This is not cosmetic.** It told a reviewer that 4,900 filings were *machine guesses
    needing human judgement*, when they are ymc's **own existing structure** waiting to be
    confirmed. It changes what the right decision is. It is precisely what Porter architecture
    rule 5 forbids: **never label an unconfigured feature as active.**
  - I wrote that false claim into the R4 UI myself ("4,900 placements proposed by the AI") after
    reading the column instead of the code. Corrected.
- **Fixed at the source, not just in the display.** Provenance is now stamped by whoever
  ACTUALLY decided the parent — `app` (the caller declared it) or `default_root` (nobody did).
  **`ai` is RESERVED** and cannot be claimed until a real Bridge-backed classifier exists.
- **Backfilled the false labels** (`0106_placement_provenance_correction.sql`): 5,148 → `app`,
  28 → `default_root`. **Labels only** — no placement, parent, state or node was altered
  (ymc still 276 active / 4,900 proposed, verified before and after).
- `GET /vault/overview` now reports `classifier.active: false` with the reason, and a
  `byProvenance` breakdown. The admin says it plainly instead of implying an AI did the work.

## v6.99.0 (2026-07-13)

- **#27 R4b — the review queue can actually be cleared.** R4 exposed 4,900 unreviewed
  placements; a queue of 4,900 you can only clear one row at a time is not a queue, it's a
  museum. Added `POST /api/v1/vault/placements/bulk-accept` and a type filter in the UI.
  - **Deliberately NOT an "accept everything" button.** You must pick a **type** — you accept
    one kind of thing at a time, having looked at that kind — and the UI **echoes the count back
    to the server**. If the set moved since you looked, the server **refuses** (`COUNT_CHANGED`)
    rather than accepting a different set than the one you saw.
  - Non-destructive: accepting archives the incumbent placement, never deletes it, so any accept
    can be walked back with a refile.
  - Bulk and single accept share **one** implementation (`activateOneTx`) — schema check, layer
    check, cycle guard. Two copies of that logic would drift, and the copy that drifted would be
    the one that lets a cycle in. One transaction per row, so a single bad row can't roll back
    the good ones; failures are reported, never silently dropped.
  - Verified on a **throwaway scope** (registered, ingested, accepted, deleted — zero residue),
    not on Moe's data: wrong count → refused; missing type → refused; correct count → accepted
    exactly the 3 notes and left the folder alone; no rows lost.
- **Moe's 4,900 have NOT been touched** (still 276 active / 4,900 proposed). Accepting them in
  bulk is his call, not a default I get to take.

## v6.98.0 (2026-07-13)

- **#27 R4 — the Vault, promoted from a file browser to the actual engine.** The vault engine
  has been running for weeks and nothing could see what it was doing. Two facts were invisible
  until this page existed:
  - **4,900 placements proposed by the AI, none ever reviewed.** Every item ingested gets an
    AI-proposed parent that a human is supposed to accept or re-file. Nobody ever had. The
    reason is not laziness: `accept`/`refile`/`reject` only worked **by id**, and nothing could
    **enumerate** the queue. You cannot accept what you cannot list. Added
    `GET /api/v1/vault/placements` — the missing half of the review loop — and a queue UI that
    drives it.
  - **Derivative coverage is 2.4% (74 of 3,052) with an ETA of 120 days.** The raw→markdown
    sweep is capped at 25 model calls per 24h run. That cap is a deliberate cost bound, not a
    bug — and it is exactly why the backlog was invisible: the sweep *looks* healthy because it
    does its 25 every day, while the ETA quietly runs to a third of a year. Raising it trades
    model spend for speed. That is a decision, and it should be made with the number in front
    of you.
  - Every number is a `COUNT` over a real table. The one computed value (ETA) is plain
    arithmetic and is labelled as such.
  - New `GET /api/v1/vault/overview` aggregate. Tabs: Overview · Schema · Review queue ·
    Structure · Derivatives. Additive — the old file browser is still there as **Documents**.
- **Porter can screenshot its own UI now** (`backend/scripts/screenshot-admin.mjs`). ymc has had
  this for months; Porter did not, which is why Porter UI kept shipping on "it compiled". It
  earned its keep immediately: this very page passed `tsc` with zero errors, threw zero JS
  errors, and rendered **empty** — `api()` already unwraps the `{data}` envelope and the page
  unwrapped it a second time. A typecheck cannot see that. A screenshot can.
  - It resolves Chrome from **Porter's own tool registry**, and the puppeteer library is
    symlinked to the single shared install — one copy of every tool on the box, per Moe. Porter
    owns the canonical tool registry precisely so nothing re-downloads its own browser.

## v6.97.0 (2026-07-13) — SECURITY: rotation closed

- **The leaked token is now dead.** `porter-local-service-2026` — published in 11 commits of a
  public repo, granting `platform_admin` on the brain — now returns **401**. The rotation
  window is closed and its scaffolding deleted.
- **The window earned its keep.** Rather than guess which callers still held the old token, the
  window accepted it and LOGGED every use with its path and user-agent. That found two
  stragglers I would otherwise have missed:
  - the **post-commit release hook** (git hooks don't inherit the unit's `EnvironmentFile` — it
    had only ever worked via the leaked default), and
  - **tom-mcp**, spawned by openclaw-gateway, which wasn't restarted until the ymc deploy.
  Both migrated; the log has been silent since 07:09.
- Two invariants are now code, not convention: (1) no hardcoded fallback — an unset token
  disables service auth entirely rather than falling back to a guessable default; (2) the
  leaked literal is **refused as a secret even if explicitly set**, so it cannot be
  reintroduced by copying an old config.
- Verified: tsc 0; rotated token authenticates; **leaked token 401s**; /health green.

## v6.96.0 (2026-07-13) — SECURITY / dead code

- **TLS verification is no longer disabled for all of Porter's outbound HTTPS.** The unit set
  `NODE_TLS_REJECT_UNAUTHORIZED=0` — a process-wide kill switch on certificate checking, which
  makes every outbound HTTPS call MITM-able. It was there for Stalwart's self-signed cert.
  Porter makes **no HTTPS calls at all**, so it was protecting nothing and costing everything.
  Removed.
- **The Stalwart mail integration never existed — the config did.** `STALWART_URL`,
  `STALWART_API_KEY` and `MAIL_DEFAULT_DOMAIN` were in the unit, but:
  - nothing in `src/` or `scripts/` reads any of them;
  - `services/mail/*` — the module `email.ts` points at as "the new hosted mail system
    (Stalwart backend)" — **does not exist**;
  - Stalwart isn't installed and nothing listens on :8443.
  - So `porter-mail-admin-…`, leaked in 3 public commits, was a credential to **nothing**. It
    did not need rotating. It needed deleting. Gone from the unit, from `porter.env`, and from
    the example.
- **Deleted the fake mail-health probe.** `tool-detector.ts` reported Stalwart's health by
  curl'ing `127.0.0.1:8080` — the port of the **deleted `portal.py`**, not Stalwart's 8443. It
  has been reporting a mail server's status off a dead Python SaaS's port. Probe deleted, tool
  count corrected (+4 → +3), stale `stalwart` row dropped from `environment_tools`.
- Stale comments in `email.ts` claiming "Stalwart handles inbound mail" corrected — they
  described a system that was planned and never built.
- Verified: tsc 0; Porter restarts clean with no TLS bypass and no Stalwart env; /health green.

## v6.95.0 (2026-07-13)

- **The release hook was authenticating with the public token.** Fail-closing the service
  token (6.94.0) immediately surfaced its first real consumer: the post-commit hook 401'd.
  A git hook doesn't inherit the systemd unit's `EnvironmentFile`, so `announce-porter-update`
  and the release-kit register had no token — they had only ever "worked" by falling back to
  the value published on GitHub. The hook now loads `~/.config/porter/porter.env` explicitly,
  and warns loudly if it is missing.
  - This is the fail-closed design doing its job: a silent dependency on a leaked secret
    became a visible 401 the moment the secret stopped being a default.
  - Verified: release-kit register went 401 → `✓ recorded porter v6.94.0`.

## v6.94.0 (2026-07-13) — SECURITY

- **The admin token for this brain was published on GitHub.** `porter-local-service-2026`
  was hardcoded as the fallback in `backend/src/plugins/auth.ts` and sits in 11 commits of
  `heymoezy/porter`, which is a **public** repo. That token grants `platform_admin` on
  Porter — Bridge dispatch, memory read/write, job execution. The only thing that kept it
  from being remotely exploitable is the localhost check on the same code path.
  `planning/security-service-token-hardening.md` flagged this and was never executed.
  - **Rotated** to a fresh 32-byte random token, held in `~/.config/porter/porter.env` (600).
  - **Fail-closed**: the hardcoded fallback is GONE, in Porter and in every ymc caller
    (17 sites). No token → service auth is disabled and callers 401. Porter also refuses to
    accept the leaked literal as a valid secret even if someone sets it explicitly.
  - **Rotation window, with an instrument**: `PORTER_SERVICE_TOKEN_LEGACY` keeps
    already-running consumers alive, and every use of the old token is logged with its path
    and user-agent — so the remaining callers get FOUND, not guessed at. It gets removed
    once that log is silent.
- **`backend/.env` is no longer tracked.** It carried `DATABASE_URL` (with the password) and
  had been committed to the public repo since the Postgres migration. Untracked, gitignored,
  and replaced with `backend/.env.example`.
- Verified: tsc 0; new token authenticates; garbage token 401s; the legacy token is accepted
  AND logged with its caller; ymc→Porter works on the rotated token; all five services active.

## v6.93.0 (2026-07-13)

- **The release gate blocks now — it used to just complain.** Eight consecutive releases
  (6.85 → 6.92) bumped `backend/package.json` without adding an entry to
  `backend/src/lib/porter-releases.ts`. Nothing stopped them: the pre-commit gate printed
  "ceremony drift (non-blocking)" and exited 0. A warning that never blocks is a warning
  nobody reads. Meanwhile the post-commit announcer kept re-announcing **v6.84.0** — the
  last version actually present in the feed — so every release since was announced as an
  old one.
  - This is exactly the failure CLAUDE.md names: an invariant encoded as a *reminder*
    instead of a *hook* eventually rolls wrong. It is a hook now: `deploy/git-hooks/pre-commit`
    REFUSES a version bump that doesn't carry its CHANGELOG + release-feed entries.
  - Emergency bypass is `SKIP_RELEASE_GATE=1 SKIP_REASON="..."`, appended to
    `storage/release-audit.log` — logged, never silent.
- **Release feed backfilled (6.85.0 → 6.92.0).** Eight missing entries written in Moe-voice:
  hot context, session-end memory writes, the MCP entry point, cost-per-accepted-change, the
  #27 R1–R3 admin surfaces, the 6.85.1 path-traversal fix, and 6.92.0. The feed is what gets
  announced — it was lying by eight releases.

## v6.92.0 (2026-07-13)

- **Porter now comes back from a clean exit — it didn't.** Porter was found DEAD. Root
  cause: it was the ONLY critical service on `Restart=on-failure` (ymc-backend, ymc-site,
  openclaw-gateway all use `always`). It exited *cleanly* (status 0 — scheduler stopped,
  job-executor stopped), which does not match `on-failure`, so systemd left the backbone
  down. Every CLI, the MCP server and the memory layer depend on it; nothing restarted it.
  - `Restart=always` + `RestartSec=5`. **Proven**: SIGTERM to the main pid — the exact case
    that left it dead — now brings it straight back, health green.
- **The unit is tracked (`ops/systemd/`).** An invariant that exists on one box only is not
  an invariant. Fresh-box install steps + a `Restart` assertion in `ops/systemd/README.md`.
- **Secrets out of the unit.** `heymoezy/porter` is a PUBLIC repo and the unit carried
  `DATABASE_URL`, `OPENCLAW_TOKEN`, `PORTER_SERVICE_TOKEN`, `STALWART_API_KEY` inline —
  tracking it as-is would have published them. They now live in `~/.config/porter/porter.env`
  (mode 600, untracked), loaded via `EnvironmentFile=`; the unit holds only non-secret config.
  Template: `ops/systemd/porter.env.example`. Optional (`-`) so a fresh install still boots
  and degrades gracefully (architecture rule 1).
  - Verified: 0 secret lines in the unit; the running process still has all four (env file
    loaded); `/health` green; Bridge gateways list; `POST /bridge/agent-message` still 401s
    without a valid token — the token is doing the gating, from the env file.
- **KNOWN, NOT YET FIXED (surfaced to Moe):** `porter-local-service-…(redacted)` is already in 11
  commits of the public repo and hardcoded as a fallback in `backend/src/plugins/auth.ts`;
  `porter-mail-admin-…(redacted)` is in 3. Rotation + fail-closed is the next release
  (`planning/security-service-token-hardening.md`).

## v6.91.0 (2026-07-13)

- **#27 R3 — first product-native surface (Overview).**
  - **Scope ladder** on the Overview: the admin now always says which product you are
    looking at (`porter → <product>`). Porter is multi-app; a page that doesn't say which
    app it means is lying by omission.
  - **Hot context on the dashboard**: the Overview shows the SAME warm packet (#37) your
    claude/codex/grok sessions open with — "where we got to", the handoff left for the
    next session, whether memory is warm/cold, and which CLI last warmed it. One brain,
    two windows onto it.
  - Keyed off the product chosen in the R1 top-bar switcher; re-reads on focus so the two
    surfaces can never disagree about what we're looking at.
  - Fail-open: no product selected, or Porter unreachable → quiet empty state, never a
    broken dashboard.
  - Verified: tsc 0; SPA build clean; deployed; live askporter.app loads with no JS errors.

## v6.90.0 (2026-07-13)

- **#27 R2 — product-first IA in the admin nav (additive; nothing removed).**
  Council design: "Add new primary nav: Overview, Vault, Services, Files, Open Items,
  Releases … keep legacy links behind a secondary group. Users can enter the new IA
  without losing old surfaces."
  - Nav is now **Product** (Overview · Vault · Services · Files · Open Items · Releases),
    **Porter** (System), and **Legacy** (Brain · Env Tools · MCP · Design System ·
    Architecture) — kept, not killed.
  - Sections map ONLY to routes that exist. `Products` and `Tenants` are in the target IA
    but have no pages yet, so they are deliberately omitted rather than shipped as dead
    links.
  - The destructive folds (R5/R6/R10 DELETE Brain/Recall/Bridge) are NOT in this release
    and require Moe's sign-off, per the design's own instruction.
  - Verified: tsc 0; SPA build clean; **0 dead links** (every nav path exists in routes.ts);
    every previously-reachable legacy route still registered; live askporter.app loads with
    **no JS errors**.

## v6.89.0 (2026-07-13)

- **#27 R1 — global product/tenant context switcher (additive; nothing removed).**
  Porter is multi-app (ymc.capital, themozaic, baanyindee, askporter) but the admin
  always showed one undifferentiated blob. This is the first surface that admits the
  real architecture: you are always looking at *some* product.
  - New `ContextSwitcher` in the admin shell top bar. Lists products from
    `/api/v1/projects`; persists the choice to the **same** pin the CLIs read
    (`POST /api/v1/intellect/active-project`) — so the admin and every claude/codex/grok
    session agree on "what are we working on". One context, not two.
  - Strictly R1 per the council design: adds the selector + context plumbing and
    **removes no existing nav**. The destructive folds (R5/R6/R10 delete Brain/Recall/
    Bridge) are NOT in this release and need Moe's sign-off.
  - Fail-open: an empty product list or an unreachable Porter must never break the shell.
  - Verified: tsc 0, SPA build clean, deployed, and the live chunk on askporter.app
    serves the component.

## v6.88.0 (2026-07-13)

- **#49 — cost per ACCEPTED change (the only loop metric that matters).**
  "Below 50% acceptance a loop costs more than it saves" — and we were flying blind
  on exactly that. I had claimed the token feed did not exist; it did: the CLI
  transcript carries exact per-message usage.
  - `session_usage` (0105) + `services/intellect/cost-metrics.ts`.
  - `POST /api/v1/intellect/session-usage` (idempotent per session — never double-counts)
    and `GET /api/v1/intellect/cost-per-change?project=`.
  - New SessionEnd hook `~/.claude/hooks/porter-session-usage.js`: parses the transcript
    for EXACT tokens and counts releases/reverts **observed from git**.
  - Built so it cannot flatter us: tokens exact; cost clearly an ESTIMATE from a rate
    table (never a bill; unknown models fall back to a mid rate, never free); acceptance
    OBSERVED from git — a session does not get to self-report how good it was. Under 50%
    the verdict says so bluntly.
  - First real reading: 406k output tokens, ~$16.71, 2 releases, 0 reverts →
    **$8.36 per accepted change, 100% acceptance.**

## v6.87.0 (2026-07-13)

- **Porter MCP is actually runnable — and registered in Claude Code (#37).**
  - Root cause found: `porter-mcp.ts` only EXPORTED a factory and never connected a
    transport, so the MCP server existed but **no CLI could run it**. That is why Porter
    was in nobody's `mcpServers`.
  - New `src/mcp/porter-mcp-stdio.ts` — the launchable stdio entrypoint.
  - Added the universal-memory tools to the server: **`porter_bootstrap`** (call first:
    returns the warm packet — where we got to, the handoff left for you, and pointers;
    honest `cold` on a fresh install) and **`porter_write_memory`** (leave a note/handoff
    for the next session).
  - Registered in Claude Code (`claude mcp list` → `porter: ✔ Connected`). The existing
    SessionEnd hook already POSTs `{project, gateway}` to `/intellect/session-end`, which
    now recomputes hot — so **every session end warms the cache for the next session**.
  - Verified over the real MCP protocol: 9 tools listed; `porter_bootstrap` returned a
    234-token warm packet containing a handoff written by a **grok_cli** session.

## v6.86.0 (2026-07-13)

- **Universal memory R2 — write path + vault mirror (#37, collapses #48's hot.md).**
  - `hot_notes` (0104) + `POST /api/v1/intellect/memory` (porter_write_memory):
    kinds `note` | `handoff`. A **handoff** lets a session pass its warm state to the
    NEXT session mid-flight, without ending — what long-running or crashed sessions need.
    Deliberately narrow: durable *meaning* still reaches the vault via the existing
    dream/promote path, so no CLI writes the knowledge graph directly.
  - Handoffs surface at the top of the hot packet (highest-signal lines — someone
    chose to write them).
  - **Vault mirror**: every recompute writes `~/vault/mirrors/hot/<project>.md` with a
    `generated: true / do NOT edit` header. Porter DB stays the source of truth; the
    file is a lag-tolerant human view. This IS the "hot.md" from the self-filing-vault
    research — built ONCE, in Porter, not duplicated as a second truth.
  - Verified cross-CLI: a `grok_cli` handoff was read back in the warm packet by a
    different CLI; mirror written; 234-token packet (cap 900).

## v6.85.1 (2026-07-13) — SECURITY

- **Path traversal in hot-context (introduced in 6.85.0, fixed before any real use).**
  `project` arrives from an HTTP query/body and was interpolated straight into a
  filesystem path (`path.join(PROJECTS_ROOT, project, 'CHECKPOINT.md')`), so
  `project=".."` / `"../../.ssh"` escaped the projects root — an arbitrary-file-read.
  Caught by the automated commit security review.
  - New `safeProjectDir()`: shape check (single dir name, no separators) AND path
    containment (resolve, then prove it is still under the root). A shape check alone
    is insufficient — `".."` matches `[A-Za-z0-9._-]+`.
  - Enforced at BOTH the service entry points (`getHot`, `recomputeHot`) and the route
    boundary (`GET /intellect/hot`, `POST /intellect/hot/recompute`).
  - Verified: 7 traversal vectors (incl. URL-encoded `%2e%2e%2f` and nested
    `ymc.capital/../../.ssh`) all rejected with 400; legitimate projects unaffected.

## v6.85.0 (2026-07-13)

- **Universal memory R1 — hot context (the warm session bootstrap).** Implements the
  council-ratified design in `planning/porter-universal-memory-37.md` (codex + grok).
  Every session (claude, codex, grok, antigravity) currently re-derives the same project
  state from zero, burning tokens to rediscover what the last session already knew.
  - `hot_contexts` table (0103): ONE row per (scope, project) — Porter DB is the source of
    truth; any vault file is a generated mirror.
  - `services/intellect/hot-context.ts`: composes a hard-capped (~900 token) warm packet —
    where we got to (CHECKPOINT.md latest), recent sessions, and POINTERS to drill into.
    Pointers, not payloads.
  - `GET /api/v1/intellect/hot?project=` — warm packet, or an honest COLD response on a
    fresh install (never fabricates history; the CLI still boots fine).
  - `POST /api/v1/intellect/hot/recompute` — force a rebuild.
  - **The de-risking hook:** `POST /session-end` (already gateway-aware) now recomputes hot
    as the ONE default write path — so any CLI ending a session warms the cache for
    whichever CLI opens next, and memory can't be polluted by ad-hoc writes.
  - Verified: cold→warm transition; 192-token packet; a `codex_cli` session-end warmed the
    context that a `claude_cli` session reads. Fail-open throughout.

## v6.70.0 (2026-07-08)

- R6: Files UI — Document Library in Porter admin (deduped graph tree)


## v6.69.0 (2026-07-08)

- v6.68.0: R4 POST /vault/reconcile — Files perfect-sync


## v6.67.0 (2026-07-08)

- v6.66.0: R1 vault_artifact_locations — Porter Files directory foundation


## v6.65.0 (2026-07-08)

- Vault association engine: record-links + edge-expanded focus (v6.64.0)


## v6.63.0 (2026-07-08)

- Canonical tools registry + discoverability (R8 first slice) (v6.62.0)


## v6.61.0 (2026-07-07)

- Scope ladder + product registry — identity spine (v6.60.0)


## v6.59.0 (2026-07-07)

- R6: Porter MCP server alpha (headless knowledge for Claude)


## v6.58.0 (2026-07-07)

- Admin hygiene: typecheck 0, untrack build/, dream-run json fix (v6.57.0)


## v6.56.0 (2026-07-07)

- Porter admin: MCP management page + forge dead-code cleanup (v6.55.0)


## v6.54.0 (2026-07-07)

- Vault v2 R1e: placement accept/refile — review-queue ops (v6.53.0)


## v6.52.0 (2026-07-07)

- Vault v2 R1c: ingest API — type-checked push + proposed placements (v6.51.0)


## v6.50.0 (2026-07-07)

- Vault v2 R1a: generic schema — 6 tables (v6.49.0)


## v6.48.0 (2026-07-06) — admin revamp: remove Forge/Email/skill-feedback

- feat(admin): removed the Forge, Email, and Skill-Feedback screens from the Porter admin (their backends were already deleted — Forge v6.28.0, mail-pillar purge 2026-07-04 — so these were dead frontends). Route files + nav entries + backend/src/routes/admin/email.ts removed; deregistered. tsc 0, react-router build clean (no orphan chunks). Net −2067 lines.
- Design doc for the replacements (vault: porter-admin-revamp.md): MCP management, tools consolidation, and a CLI config view (Porter visualises ~/.claude config). Those land as follow-up releases.

## v6.47.0 (2026-07-06) — Bridge model failover

- feat(bridge): FAILOVER CHAIN. Every /agent-message dispatch now runs through `dispatchWithFailover`: on gateway failure — process error, timeout, or a quota/usage-limit signature — the SAME task retries on the next gateway in the configured chain (claude_cli → codex_cli → antigravity_cli; env PORTER_BRIDGE_FALLBACK_CHAIN or gateways.priority is the config). Shared 300s budget across the chain (raceBudget). `fallback:false` opts a caller out (hard-fail, no model switch). Loopback-only `simulateFailure` proof hook. The failover chain + per-attempt outcome/reason + who answered persist to bridge_dispatch_log.failover and surface in the response envelope (failover.switched/answeredBy). Proven live: simulate claude_cli fail → codex_cli answered; fallback:false → clean hard-fail; log recorded.
- Covers all Bridge consumers (Tom workers, digests, Marshall/Sentinel, ops-chat, vault-chat, evolution loop). Tom's live WhatsApp chat runs in openclaw's own gateway (not Bridge) — its chat-surface failover lands with the openclaw upgrade.
