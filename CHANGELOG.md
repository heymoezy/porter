## v6.161.0 (2026-08-31) — inbound messages that were dropped, timeouts that were never retried, and a calendar that could not run

Three changes from a backlog session with Moe.

**WhatsApp intake dropped messages, two ways** (`routes/v1/webhooks-whatsapp.ts`, dev #108). The
handler read exactly `entry[0].changes[0].messages[0]`, then bailed on `if (!from || !messageText)`.

- Meta batches. Three messages sent quickly arrive in ONE POST; the second and third were discarded.
  All three levels are flattened now — entries, changes, messages — and handled in order.
- Only `text` carries `text.body`. Photo, voice note, forwarded PDF, quick-reply tap: empty body,
  treated as a status update, gone. Each type renders a description now. Reactions, stickers and
  unsupported messages are archived but deliberately NOT routed — a thumbs-up is not a question.

Both ended identically: a 200 to Meta, delivery ticks for the sender, no reply. Per-message error
isolation so one poisoned message does not cost the ones behind it, and anything still undeliverable
is written to `intellect_events` as `whatsapp.inbound_dropped`. Meta still gets a 200 in every case:
a non-200 replays the WHOLE batch, duplicating what succeeded to retry what did not. 14 tests.

**Timeouts were classified as permanent** (`services/bridge/retry.ts`, dev #127/#113).
`classifyError()` put a timeout in `'persistent'`, alongside 500 and ECONNREFUSED, so `withRetry()`
threw immediately and a gateway that timed out was never tried again.

Timeout is its own class now, retried at most ONCE and only when the chain's shared clock can hold a
further attempt as long as the one that just failed. No backoff before a timeout retry — the attempt
already spent minutes.

Three things deliberately NOT changed:
- `isTransientError()` still returns false for a timeout. It is the circuit breaker's `errorFilter`,
  where true means "do not hold this against the gateway", and a gateway that times out should be.
- A budget timeout (`[failover:budget-timeout]`) is never retried — it is the chain's own clock
  refusing, and retrying is exactly what it refused.
- `DEFAULT_CHAIN_BUDGET_MS` stays 300s. It equals one adapter ceiling, so on the default chat path a
  timeout consumes the whole budget and the retry is correctly refused. Raising it is not free:
  `job-executor`'s `DELEGATION_JOB_TIMEOUT_MS` is 300s, and a server ceiling above the client's
  wall-clock is the precise defect v6.159.0 fixed. That trade is Moe's.

So the retry fires where budgets are already generous — `/bridge/agent-message` admits a loopback
`budgetMs` up to 30 min. Where it cannot fire it now NAMES the budget left and the time an attempt
needs. 7 tests.

**The calendar was in two places, and this one could not run** (`services/calendar.ts`, deleted).
Moe: *"let's make sure calendar is one place — whenever you find access in more than one place always
try and consolidate so we don't have competing searches."*

Nothing in Porter has ever `INSERT`ed into `workspace_connections` — every reference is a `SELECT` —
so the connected `google_calendar` row it required, carrying access and refresh tokens, had to be
placed by hand. No OAuth flow, no callback, no admin route. It was additionally gated behind
`FEATURE_EXTERNAL_CONNECTIONS`, off by default. Had it run, it read `calendarId: 'primary'` from the
FIRST connected row into a table nothing reads.

Removed with the scheduler's 60s tick and `dispatchCalendar` (its provider-map entry and union member
with it). No caller anywhere passed `service:'calendar'`. The `calendar_events` TABLE stays —
dropping it is a data decision. CLAUDE.md records why it went so it is not rebuilt.

The calendar Moe asks about lives in ymc.capital (`lib/tom-google.ts`), which now reads
moe@ymc.partners AND moe@themozaic.com through each account's own credentials.

Full suite: 283 tests, 0 failures. Typecheck clean.

## v6.160.2 (2026-08-30) — document search said "nothing on file" about documents it held

`retrieveChunks()` in `backend/src/services/recall-query.ts` built its query with
`plainto_tsquery('english', $1)`, which **ANDs every content word**. A natural-language question
therefore had to have all of its terms inside ONE chunk (3,200 chars, 400 overlap) or it matched
nothing at all — and the caller renders that as `"Nothing on file."`, which is indistinguishable
from an empty corpus.

**Measured on a live store (941 sources / 5,965 chunks):**

| form | chunks matched |
|---|---|
| `plainto_tsquery` on a full natural question | **0** |
| the same question as OR-of-lexemes | **3,426** |
| `websearch_to_tsquery` on the key terms alone | 49 |

The top results under the OR form were the correct documents, because `ts_rank_cd` already rewards
a chunk covering more of the query's lexemes — breadth in the candidate set does not become noise
in the ranking.

**The cascade.** AND first (precise, and the right answer when it works) → OR-of-lexemes if that
returned zero → the existing trigram fallback.

⚠️ **The trigram fallback was never firing.** It compares `c.text % $1` — a 3,200-char chunk against
a short question — at the default `pg_trgm.similarity_threshold` of 0.3, which a chunk that size
essentially cannot clear. It only ran when the step above returned nothing, so it presented as a
safety net while catching nothing. Left in place (it costs nothing) but no longer relied on.

⚠️ **Lexemes are `quote_literal`'d before being joined.** They come out of `to_tsvector` already
normalised, and quoting them means no part of a user's question reaches `to_tsquery` as syntax —
verified with a question containing `& | ! ( ) :*` and apostrophes, which matched 895 chunks
rather than raising a syntax error. A question of pure stop-words yields a NULL tsquery, and
`tsv @@ NULL` is NULL, so it matches nothing instead of failing.

`QueryResult` now carries `retrieved_by: 'fts' | 'fts_or' | 'trgm' | 'none'` so the value of the OR
step is measured rather than assumed — that number is the input to any future decision about
embeddings, which this store does not have (the `embedding vector(1536)` column is 100% NULL with
no ANN index).

## v6.160.1 (2026-08-11) — sixty jobs had said "running" since April, and nothing ever asked

Moe: *"why are 60 agent_jobs stuck clean this up"*.

**Why they were stuck.** A row is moved to `running` by the claim query and moved out of it by the code that
finishes the job. If the process dies in between, the row is stranded — and there was no sweep of any kind, in
any file. Four months of that is the evidence. All 60 dated 04-04 → 04-14, none since, so this was old debris
rather than an active leak.

**Two populations, and they are not the same problem.**

| n | source / type | what it is |
|---|---|---|
| 52 | `system` / `learning_session` | a feature that no longer exists |
| 8 | `job-executor` / `scheduled` | genuine orphans of a process that died in April |

⚠️ **I NEARLY REPORTED THE 52 AS ACTIVE DAMAGE, AND CHECKED FIRST.** `scheduler.ts` guards enqueue with
`SELECT 1 … WHERE trigger_type = $1 AND status IN ('pending','running')`, keyed on trigger_type ALONE — so one
stranded row permanently suppresses that entire job type. That reads like four months of silently disabled
learning sessions. It was not: `scheduleSystemJob()` has **zero callers**, and `learning_session` appears
nowhere outside the schema. Nothing schedules it and nothing claims it — `job-executor` only takes
`source IN ('job-executor','delegation')`. The guard is real and the blockage was not, because there is no
caller left to block. **`scheduleSystemJob()` is deleted** rather than left as a loaded gun with no trigger.

**The fix is a hook, not a cleanup.** `reclaimOrphanedJobs()` runs at startup, before the claim loop.

⚠️ **THE TEST IS "IS ANYONE WORKING IT", NEVER "HAS IT BEEN A WHILE".** Elapsed time was always a poor proxy
and v6.160.0 made it an actively wrong one — a legitimate workspace session may now run twelve hours, so any
age-based sweep would kill precisely the long dev sessions that release exists to protect. Startup is the one
moment the answer is knowable without guessing: this process has just begun, holds no jobs, and is the only
executor, so anything still `running` is by definition abandoned. `inFlight` lives in memory, which is exactly
why a live long job can never be caught by it — it does not survive the restart that triggers the sweep.

⚠️ **FAILED, NOT RETRIED.** We cannot know how long a row has been orphaned, and re-dispatching a heartbeat
tick from April is noise, not recovery. A heartbeat is re-scheduled by the scan loop within seconds anyway. A
delegation matters more: its delegator polls the row, so a terminal state is how Tom learns the work died with
the process instead of waiting on it forever.

**Verified live.** 60 running before the restart, 0 after, with the breakdown logged:
`reclaimed 60 orphaned job(s) … system/learning_session=52 job-executor/scheduled=8`. A fresh job then ran
clean (3.5s, returned `ok`), so the dispatch path is intact.

⚠️ One earlier probe of that job looked like a regression — it sat `pending` for 40s. It was not: three
heartbeat dispatches were in flight and it was queued behind the concurrency cap, which is the cap working.
Worth recording because the first reading of a slow queue is always "it is broken".

## v6.160.0 (2026-08-11) — a dev session takes as long as the work takes, and no longer blocks the queue

Dev #109, filed by Moe: a dev session Tom starts *"should be independent of him once started… duration should
be irrelevant, whether it's 1 hour or 10+ hours. Tom should never treat a long-running session as timed out,
stuck, or a problem."*

**The ceiling and the concurrency had to move together, and that is the whole point.**

A workspace dispatch was killed at **30 minutes**. Lifting that alone would have been a worse bug wearing the
fix's clothes, because `runDueJobs()` claimed up to four jobs and then `await`ed them **one after another**
under a re-entrancy guard — so a single long session blocked the three jobs claimed beside it and every
heartbeat until it finished. The short ceiling was the only thing making a serial queue survivable. Raise one
without the other and "dev sessions get killed" becomes "one dev session freezes Porter for twelve hours".

- **Jobs now run independently.** Each is launched rather than awaited, bounded by `MAX_CONCURRENT_JOBS` (4,
  env-overridable). The claim query takes only what there is room to run — claiming marks a row `running`, and
  claiming more than can be worked would park jobs in a state that lies about what is happening to them.
- **The workspace ceiling is 12 hours**, and exists only to stop a WEDGED process holding a slot forever. It is
  deliberately set far beyond any real session rather than near it.
- **The client budget is DERIVED from the server's**, imported rather than re-declared. These two numbers have
  been set independently and disagreed twice — v6.141.0 put the client at 1,800s against the adapter's 300s,
  v6.159.0 found it at 240s against 300s — and both times the shorter won silently. A constant copied into the
  caller is a constant that will drift.

⚠️ **VERIFIED BY RUNNING IT, NOT BY READING THE DIFF.** Two jobs queued together both started at 17:06:42 and
both completed at 17:06:46 — overlapping windows, ~4.2s each. Serially the second could not have started
before 17:06:46. Both completed successfully, so the dispatch path is intact.

⚠️ **WHAT I DID NOT FIX, AND DID NOT PRETEND TO.** `agent_jobs` holds **60 rows stuck in `running`** from
earlier process lifetimes. They are harmless to this change — capacity is counted in memory, so stale rows
cannot starve the executor — but nothing reaps them, and with 12-hour jobs now legitimate, a sweep can no
longer use "it has been running a while" as its test. That needs its own fix.

⚠️ **AND THE CHAIN BUDGET IS A TRAP STILL SET.** `DEFAULT_CHAIN_BUDGET_MS` is 300s and `raceBudget()` enforces
it as a hard cap on a single attempt — but only on the `dispatchWithFailover` path. `/chat/stream`, which is
what job-executor uses, goes through `streamFromBridge` and never touches it. So it is not what was killing
dev sessions. It WOULD kill any long dispatch routed the other way, so the `budgetMs` clamp on
`/bridge/agent-message` — written on 08-06/07 for exactly that reason and left sitting uncommitted in the
tree ever since — ships here: a caller may set the chain budget (clamped 60s–30min, loopback only, the same
trust posture as `simulateFailure`). It does not fix the dev-session path, and its own comment says so.

Also `porter_search_vault` now describes what it actually does. It has searched Porter's concepts and
directives alongside the vault graph for some time — `searchVaultNodes` returns which store answered — while
the tool description still promised only graph nodes, so callers had no reason to use it for the memory it
could already reach.

## v6.159.0 (2026-08-11) — delegation has been dying on a ceiling we set ourselves, and the error never said so

Moe: *"tom still stalls when ingesting files... his worker delegation doesn't seem to be working too well
anymore."* It is not working at all: **2 jobs in the last 10 days, both failed**, against 15 on 07-31.

Every failure is `agent_dev` carrying the same string — `The operation was aborted due to timeout` — and every
one is a BUILD task (*"Build stage 1 of the prediction-market trading capability"*, *"Build an HTML document
text-extraction tool"*) dispatched with **no `repo`**.

Two defects, both ours:

- **The client gave up before the server did.** `job-executor` aborted a delegation at **240s** while the
  claude adapter allows `TIMEOUT_MS = 300s` for a non-workspace dispatch. The last 60 seconds of every
  delegated job was unreachable by construction — a race we could only ever lose. Now aligned at 300s.
- **The error explained nothing.** Diagnosing that string meant reading three files to discover that a
  code-changing job dispatched WITHOUT a `repo` gets the 5-minute chat ceiling instead of the 30-minute
  workspace one (`WORKSPACE_TIMEOUT_MS`). The timeout now says which budget was hit and why it was that low:

  > `timed out after 300s with NO WORKSPACE — a code-changing job must be dispatched with a \`repo\`, which
  > gives it the 1800s workspace budget instead of this one`

  Non-timeout errors pass through untouched.

The three magic numbers become named constants with the invariant written down: **a client wall-clock must
never be shorter than the server's ceiling for the same dispatch.**

⚠️ This makes the real problem visible rather than fixing it. Coding work does not finish in 5 minutes at any
budget, and a session with no workspace "would silently run in /tmp and report success having changed
nothing" (v6.141.0). The actual fix is that the delegator passes a `repo` — the API has accepted one since
v6.141.0 (`routes/v1/agents.ts:85,118`) and the caller has never sent it. That is a caller-side change and is
filed rather than smuggled in here.

## v6.158.0 (2026-08-04) — eight copies of a path, and capabilities that reset on boot

**`PROJECTS_ROOT` / `VAULT_ROOT` were hardcoded in EIGHT modules** — hot-context,
claude-rules-mirror, active-project, index.ts, release-kit/project-registry, vault-draft,
vault-mirror, vault-indexer, worker-knowledge. Porter's own first architecture rule is *"No
hardcoding. No paths, hosts, ports, tokens"*, and `config.ts` already carries the note about
`skillsDir` — "there were two and they disagreed". Eight copies is that defect waiting to happen
eight ways. Now `config.projectsDir` / `config.vaultDir`, env-overridable, derived from `$HOME`.
⚠️ Not cosmetic: `/home/lobster/projects` is an INPUT to the memory system (claude-rules-mirror
scans every CLAUDE.md under it), so a wrong value mints directives from the wrong tree.

**Gateway capabilities were overwritten on every boot.** `startup-detector.ts` upserted the
compile-time `GATEWAY_CAPABILITY_REGISTRY` with `capabilities = EXCLUDED.capabilities` at four call
sites, scoped `ON CONFLICT … WHERE source IN ('auto_detected','env_bootstrap')` — and all four live
gateways are `auto_detected`, so nothing was exempt. Any capability edited in the admin was silently
reverted on the next restart: compile-time data fighting its own database column. Now `COALESCE`,
so detection SEEDS a gateway and never overrules a stored value.

## v6.157.0 (2026-08-03) — THE one log: `GET/POST /api/v1/events`

Moe, on Buzz's unified event log: *"take this opportunity to consolidate everything — having all of
these various logs is a mess — one log is the best idea. one source of truth."*

Counted first: `tom_sent_log` 845, `tom_tasks` 54, `tom_knowledge` 14, `document_reviews` 492,
`contact_activities` 952, `agent_jobs` 4,518, `agent_activity` 9,317, `agent_messages` 2,977,
`intellect_events` 38,956, plus file logs.

⚠️ **NOT a merge of all of them.** Several are not logs — `tom_tasks` is a queue, `tom_knowledge` is
knowledge, `document_reviews` is a compliance record carrying a named reviewer. Folding those into
one table destroys what each means. The split that holds: **one truth for what HAPPENED** (this
append-only stream) and **one truth per domain for what IS** (the existing tables, untouched).

⚠️ **Reuses `intellect_events`, does not add an eleventh table.** It is already exactly this shape
and already holds 38,956 rows. The gap was never a missing table — it was that ymc's side never
reached this one. `GET /events` (filter by source/type/text/window), `GET /events/summary`
(what happened and how often), `POST /events` (record).

⚠️ **Additive, never authoritative, never blocking.** ymc's `recordEvent()` fires after the domain
write and swallows every error — a logging call that can fail a send is worse than no log. Nothing
may read this to decide whether an action already occurred; dedup and suppression stay on the
domain tables, because an append-only stream with a best-effort writer is the wrong thing to gate on.

Verified on a live send: 0 ymc events → send → 1 `ymc.send/message_sent` → verification rows removed.

## v6.156.0 (2026-08-03) — agent-memory concepts accept and store confidence

R7 Stage B prerequisite. `POST /api/v1/intellect/agent-memory` inserted concepts without ever
setting `confidence_score`, so ymc's mirrored `tom_knowledge` facts arrived with no confidence and
a repointed `renderGraphContext()` (which renders LIVE ONLY, `confidence >= 0.35`) could not tell a
current fact from a decayed one.

⚠️ **SCALE MISMATCH, caught only by reading the write back.** Callers think in 0..1;
`concepts.confidence_score` is an **INTEGER on a 0..100 scale** (the live corpus is 95/85/80/55).
The first backfill passed 0.7 straight through: Postgres rounded it to `1`, all five `UPDATE`
statements reported `UPDATE 1`, and every value silently became "1 out of 100" — the opposite of
what was meant. `UPDATE 1` is a row count, not a value confirmation. Conversion now happens at ONE
point in the route, so no caller has to know the storage scale.

`confidence` is optional and defaults to **NULL, not to a number** — a default would be
indistinguishable from a real high-confidence value and the reader could never fail safe.

## v6.155.0 (2026-08-02) — the concept-dedup blocker was not real; the actual one is elsewhere

R7 Stage B was parked behind: *"Porter does not dedup concepts the way it dedups directives, so a
paraphrase arriving by another path still stacks."* With R6's embeddings in place that looked one
query away. Measured instead (`scripts/measure-concept-duplication.ts`, 216 active concepts):

| cosine | pairs | structural-by-design | real duplicates |
|---|---|---|---|
| ≥ 0.97 | 16 | 16 | **0** |
| ≥ 0.93 | 36 | 36 | **0** |
| ≥ 0.88 | 54 | 52 | **2** |

Above 0.93, not one genuine duplicate. `[Ollama releases] v0.32.2-rc2` vs `v0.32.2-rc0` scores
0.989 and they are DIFFERENT RELEASES — embeddings barely move on a version number, so short
structured records dominate the top of the band. The two real duplicates need a 0.88 cut that also
merges 52 legitimate records: 26 false positives per true one. **Not built.** Deleting real release
history to merge two sentences is the 2026-07-31 re-key incident again (2,100 duplicates from
running into a deliberate dedup design).

The script is kept, with the reasoning in its header, so this is re-checkable rather than
re-litigated — and so nobody builds the destructive version later.

**The real Stage B blocker** (recorded in ymc `planning/tom-memory/RELEASE-SCHEDULE.md`):
`renderGraphContext()` renders live-only via `confidence >= 0.35`, and the Stage A mirror does not
carry confidence — `/api/v1/intellect/agent-memory` derives its own from salience and accepts none
from the caller. Repointing today would surface decayed facts as current. Coverage is NOT the
blocker: all 5 active `tom_knowledge` rows are already in Porter 1:1.

## v6.154.0 (2026-08-02) — R6: semantic recall, measured before and after

**The gate was re-taken first, as the plan required.** The original 4/8 was measured against a
corpus produced by a pipeline that was failing 97% of runs; re-measuring after v6.149.0 repaired
it, over 151 active concepts for agent:tom:

| retrieval | control misses | paraphrase misses |
|---|---|---|
| FTS, AND semantics | 3/8 | 5/5 testable (100%) |
| FTS, OR semantics (shipped R1 fix) | 0/8 | 4/8 (50%) |
| **FTS-OR ⊕ embeddings, RRF k=60** | **0/8** | **3/8 (38%)** |

The residual FTS cannot reach is real: *"who should I ask about anti money laundering paperwork"*
returns nothing while a concept about compliance/KYC sits in the table. Those strings share no
token, so stemming has nothing to work with.

**Honest reading of 4→3.** That is one probe recovered, which is a modest result and is reported
as one. Pure ANN independently answers 2 of the 5 hard probes at rank 1. And at least one
remaining "miss" is a HARNESS artifact, not a retrieval failure: the needle for the board-resolution
probe requires the literal phrase `board resolution`, while ANN's top hit reads *"resolutions of
the board"* — the harness tests for exact wording, which is precisely what embeddings exist to make
unnecessary, so it systematically under-credits them. The needles were deliberately NOT loosened
after seeing the result; fitting the test to the outcome would make the number meaningless.

**Design.**
- `nomic-embed-text` (768d) on the LOCAL ollama. No vendor, no key, no egress — same reasoning as
  Kokoro for TTS.
- `concepts.embedding vector(768)`, NULLABLE, with a PARTIAL HNSW index. A concept with no vector
  is still fully findable by FTS. HNSW not IVFFlat: IVFFlat needs a representative training sample
  and this table is small and grows nightly.
- **RRF, not score blending.** A `ts_rank` and a cosine distance are different units on different
  scales; any weighted sum of them is an invented number that looks principled. RRF discards the
  scores and fuses only the two ORDERINGS.
- **Fails open, always.** `embed()` returns null within 2s if ollama is down or slow, and the whole
  fusion block is skipped — FTS results stand untouched. Retrieval sits in front of a live reply;
  it may improve an answer, never delay one.

216/216 active concepts embedded, zero failures.

## v6.153.0 (2026-08-02) — docs described a system that does not exist

**Gateways: two → four.** `CLAUDE.md:9` named `claude_cli` and `codex_cli`. The DB has four
enabled — Claude CLI (10), Codex CLI (20), Antigravity CLI (30), Grok CLI (40) — and failover runs
across all of them. The contract file understated the system by half.

**`routing_rules` is read by NOTHING.** The table is created by `migrate-bridge-v2.ts` and
`RoutingRuleAction` is declared in `types.ts`, but no dispatch code reads it and the routing-engine
tests are all `it.todo`. Rows in it look exactly like live configuration and change nothing. Five
of them forced agents to a gateway called `openclaw`, gone for months. Deleted (recovery SQL kept
in the session scratchpad); `CLAUDE.md` now warns against "configuring" routing there.

**Not done, deliberately:** `0102_drop_dead_mail_forge_rpg.sql` is still unapplied. Its own header
says *"NOT applied automatically — the operator applies this deliberately"*, so this is a human
gate, not an oversight. Verified state for whenever that decision is made: all 18 tables still
exist and hold **28 rows in total** (mail_threads 11, forge_settings 5, agent_rpg_stats 4, the rest
0–2) — residue from Forge (deleted 2026-05-31), the RPG/arena strip, and the mail subsystem
disabled since Tranche 12. Apply with:
`psql -d porter -f backend/drizzle/0102_drop_dead_mail_forge_rpg.sql`

## v6.152.0 (2026-08-02) — correction: v6.151.0 would have made the workers queue a no-op

v6.151.0 gated `writeProposalDraft()` on KIND. Every workers proposal is kind `new_directive`,
so it would have been skipped — and `worker-knowledge.ts:66` states plainly that a workers
directive is inert (*"no session ever resolves silo 'workers' … the operative artifact is the U4
vault draft written on accept"*). Accepting one of the 10 pending workers items would therefore
have written an inert directive, no vault node, and changed nothing.

The rule is not "which kind" but **"does the directive actually take effect"**. Where it does,
the vault copy is redundant; where it cannot, the vault copy is the whole point. `workers` is now
an explicit inert-silo exception.

Caught by dry-running the weekly note that surfaces these, before any were accepted. Two of the
ten expire in two days.

## v6.151.0 (2026-08-02) — vault drafts were making live rules look unapplied

`writeProposalDraft()` fired on EVERY accepted proposal regardless of kind. All four kinds the
dream silos emit (`new_directive`, `merge`, `supersede`, `delete`) are **directive operations**,
and the U4 design is explicit that directive-shaped proposals keep the Porter directives path —
which they do: the directive is written inside the accept transaction, and that IS the injection
path. The vault node alongside it was a second, inert copy of a rule already live.

The cost was not the duplication. `vault/drafts/` accumulated five of them, read as a pile of
accepted-but-unapplied work, and an audit this morning concluded from it that accepted proposals
"never reached concepts/ and have had zero effect since". They had full effect. Each of the five
was verified individually against a live matching directive before removal — 5/5.

`writeProposalDraft` now returns `{skipped:true}` for a directive-shaped kind. Deliberately a
DENYlist of the four directive kinds rather than an allowlist of concept kinds: no concept-shaped
kind exists today, so an allowlist would silently drop the first one added.

## v6.150.0 (2026-08-02) — release registration had never once succeeded

`[porter-release register] · ymc.capital v1.974.0 — Porter returned 401 (non-fatal)` printed on
EVERY ship of every delegate repo. Nothing was ever recorded.

`porterServiceToken()` read `process.env.PORTER_SERVICE_TOKEN` with — correctly — no hardcoded
fallback, because the old default token leaked into 11 commits of this PUBLIC repo and was
rotated on 2026-07-13. But the caller is a **git post-commit hook**, which inherits git's
environment, not a shell profile and not a systemd unit. The variable was therefore empty on
every single invocation.

Two things kept it invisible:
- the result is deliberately marked `(non-fatal)` so it can never fail a release — which also
  means it can never get anyone's attention;
- a 401 reads as "auth is misconfigured, someone will fix it", not as "this has never worked".

Now falls back to `~/.config/porter/porter.env` (mode 600, deliberately outside this public
repo — a PATH is not a secret), overridable with `PORTER_ENV_FILE`, and strips a wrapping quote
pair since a quoted value fails auth in a way that looks identical to a wrong token.

Verified end to end on the real hook path: `✓ recorded ymc.capital v1.974.0`.

## v6.149.0 (2026-08-02) — three of four dream silos were producing nothing

Found by auditing plan-vs-shipped across both repos. Live numbers before this release:

| silo | runs | completed | failed | proposals |
|---|---|---|---|---|
| `software` | 681 | 22 | **659** | 75 |
| `admin` | 36 | 36 | 0 | **0, ever** |
| `data-room` | 22 | 22 | 0 | **0, ever** |
| `ymc` | 1 | 1 | 0 | 2 |

**1. A failed run did not count as an attempt.** `scheduler.ts` computed the cadence pointer from
`MAX(started_at) WHERE status IN ('completed','running')`, so a failure never advanced it and the silo
re-fired on the next tick — hourly, forever. That produced 594 identical
`claude_cli timed out after 180000ms`. Retrying a broken thing hourly is not resilience: it buries the
real error in hundreds of copies and burns the quota the next attempt needs. Now any run counts.

**2. `admin` had no corpus.** It detects on a `.admin-silo` marker that **did not exist anywhere on the
box**. 36 green runs over an empty set. Marker created at `admin/`.

**3. Markers did not match subdirectories.** `silo-detector.ts` checked only `path.join(cwd, marker)` —
the exact working directory — so a marker at `Funds/.data-room-silo` was invisible to a session in
`Funds/SomeFund/docs`, which is where anyone actually works. A marker marks a TREE. Now walks ancestors,
bounded at `$HOME`. Verified: a path three levels below the marker now matches.

**4. Self-monitoring watched the wrong table.** Its workflow signal reads `workflows.last_run_at`, and
per-silo dreams do not run as workflows — they fire from `runSiloCadenceCheck` against
`silos.cadence_seconds`. So the one signal claiming to watch scheduled work could not see the dream at
all. New `dreams` signal reports per-silo runs/completed/failed/proposals. ⚠️ It flags `empty`
separately from `failing`: completing every run and producing nothing is the quiet failure, and it reads
green on every other signal. Now: software FAILING, admin EMPTY, data-room EMPTY, ymc HEALTHY.

**5. The double-fire workflow row was being recreated on every boot.** `migrate-dreams-v1.ts` seeds
`'Software dream — weekly consolidation'`, runs at startup, and `migrate-multi-silo-v1.ts` deletes it
because a workflow row racing the cadence tick double-fires. Sequence was: migration deletes → restart →
seed re-inserts → `smoke-50.sh` SC-18 silently false. Seed removed rather than adding a third place that
deletes the row. Verified: row is 0 after a restart.

## v6.148.0 (2026-08-01) — vault search served archived rows; now spans graph + concepts + directives

⚠️ **`searchGraphNodes` never filtered `status`.** `porter_search_vault` has been returning archived
nodes as live knowledge — including the 1,702 Phoenix cold prospects Moe removed from the graph on
2026-07-13. `routes/v1/vault.ts:1022` learned this in July; this reader never got the same filter.
Added `AND n.status <> 'archived'`.

**Three arms, not a repoint.** `vault-lookup.ts` now merges the graph, `concepts` and `directives`.
Directives were added beyond the brief: archiving 61 duplicate directive nodes on the ymc side would
otherwise drop 61 rows of coverage outright, and the constraint was coverage up, not down. Memory hits
get a reserved third of the result budget so a document-heavy query cannot bury the one rule that
answers it. Memory arms filter on `status='active'` only — `concepts`/`directives` use memory scopes,
not `app_scope`, and filtering one by the other would drop Tom's memory from every ymc query.

`vault-indexer.ts`: added `flows` to `VAULT_FOLDERS`. 3 flow pages existed only as title-only graph
nodes. Ran it: 50 scanned, +3 inserted, 0 archived.

Coverage, measured before/after on real queries: Edward Chen 15→15, Stablekey cap table 15→15,
RMI redomiciliation 3→**5**, second brain rules 1→**7**, scheduler truth 1→**7**, ship ceremony 2→**8**.
`release flow` 15→11 because 8 of the 17 matches were archived rows the old reader was serving.

**One genuine loss, not papered over:** `useEffect` 1→0. Six `ui_rule`/`voice_rule` nodes came from
`~/vault/claude-memory` and have no row in `concepts` or `directives`. That folder was deliberately not
indexed — it holds personal-matters pages and the indexer writes `scope='global'` rows every agent
reads. Widening that is Moe's call. Those six were title-only in the graph anyway.

## v6.147.0 (2026-08-01) — accepted ymc dream rules now reach Tom

Accepting a proposal wrote `scope='silo', scope_id='ymc'`. Nothing read that scope:
`memory-injection.ts:117-131` selects `workspace` or `project`; `tom-directives.ts` fetched
`project/ymc.capital` and `agent/tom`. The push path renders silo sections but only for silos
`silo-detector.ts` matches on `cwd_markers`, and ymc's are empty on purpose.

Moe's four sealed priority-95 silo rules were inert too — none of them duplicated in `project/ymc.capital`.

Fix is one file: `tom-directives.ts` adds a `silo/ymc` fetch. Porter's directives endpoint is already
scope-generic, so no Porter API change. Teaching `memory-injection.ts` about silos would have threaded
a silo hint through the path all agent traffic uses, for one consumer.

Two problems found on the way:

**Silo rules evicted every existing rule.** Merged into the 2,000-char pool they are ~600 chars each at
priority 95 vs ≤90, so they took every slot — including "reply even when not tagged", "short bullet
points", "never claim an action you did not take". Own budget now, `SILO_CAP_CHARS = 3000`, sized from
live rows (seeds 1,734 chars, proposal average 591).

**Accept wrote priority through unclamped.** `dreams.ts` passed `proposed_metadata.priority` verbatim
on all kinds; a proposal asking for 95 would have landed level with Moe's seeds.
`routes/v1/intellect.ts:605` already clamped, this path did not. Now `clampProposedPriority()`, pinned
by `dream-accept-priority.test.ts` (6/6).

Verified with the real pending proposal, accepted through the live route: became directive
`d_a80524ef`, and Tom's rendered block shows 15 lines — 4 seeds, all 7 existing rules intact, the new
rule last.

## v6.146.0 (2026-08-01) — name-scrubbing before external dispatch; ymc dream silo ENABLED

Moe was asked whether to pin the CRM corpus to `claude_cli` so it could never reach Codex/Grok. His
answer: *"the whole point of bridge is never to fail right?"* Correct — and the trial proves it, since
claude_cli timed out and **codex_cli** answered (`dream_runs.model_used = 'Codex CLI'`). Pinning would
have produced nothing. But his standing rule is also *"always firewall our info"*, and that run sent
108 items of real CRM corpus outward with names in it.

So: **failover stays, names go.**

- `pii-scrub.ts` gains `scrubNames()` / `countNamesRedacted()`. ⚠️ **STABLE PSEUDONYMS, not
  `[REDACTED]`** — one token for every name destroys the relationships the corpus is read FOR:
  "A introduced B to C" is learnable, "[REDACTED] introduced [REDACTED] to [REDACTED]" is noise.
- ⚠️ **ONLY KNOWN NAMES, from the real records** — never guessing at capitalised words, which would
  shred prose and still miss anything unusual. Longest-first so "Wong Zhi Kang Clement" is consumed
  before "Clement" can leave a fragment.
- ⚠️ **THE FIRST CUT STILL LEAKED ONE NAME.** It read `users.display_name` + `investor_profiles.entity_name`
  and missed **"Mohamed Ibrahim"** — Moe's LEGAL name, which is all over the document corpus while his
  contact record says "Moe Ibrahim". `identities.full_name` is where legal names actually live. The
  person most present in the corpus was the one least redacted. Verified after: no principal's name
  survives in any spelling.
- ⚠️ **FAIL CLOSED**: if the name list cannot be loaded, sampling THROWS. An empty list would silently
  ship real names.

⚠️ **AND THE ISO-DATE BUG WAS STILL LIVE IN THE SHARED SCRUBBER.** `scrubPII`'s phone pattern matches
`2026-07-31` (digit, eight digits-and-hyphens, digit). A local workaround had been added inside
dream-sampler, which left it broken for the learner and transcript-capture. Fixed AT SOURCE, and the
duplicate workaround deleted. A scrubber that eats meaning is worse than none — the loss is invisible
downstream. Verified: 93 ISO dates survive a real 107-item sample; amounts intact.

**`UPDATE silos SET enabled = TRUE WHERE id = 'ymc';`** — the ymc dream silo is ON, daily. Proposals
land `pending` in `/dreams`; nothing becomes a directive without Moe accepting it. That review gate is
the real safety, which is why parking it disabled was the wrong call.

## v6.145.0 (2026-08-01) — recall could not find concepts by their OWN WORDS

Taking the measurement R6 was gated on, and finding a cheaper bug underneath it.

`planning/tom-memory/RELEASE-SCHEDULE.md:21` makes semantic recall CONDITIONAL — *"ONLY IF post-R2 logs
still show paraphrase misses… Measure residual paraphrase-miss rate. If material: [embeddings]"*. R6 sat
untouched for five weeks because **the gate was never evaluated**: the work was neither done nor ruled out.

`scripts/measure-paraphrase-miss.ts` (new) measures it over the 147 live `agent:tom` concepts, with a
CONTROL query (the concept's own words) beside each PARAPHRASE query.

| | control misses | paraphrase misses |
|---|---|---|
| **AND** (shipped) | **3/8** | 5/5 = **100%** |
| **OR** | **0/8** | 4/8 = **50%** |

⚠️ **THE CONTROL MISSES ARE THE REAL FINDING.** `websearch_to_tsquery` ANDs unquoted terms, and
`memory-injection.ts:297` — the path EVERY Tom turn goes through — used exactly that. So a question
required every word to be present and one absent stem returned nothing. Three probes could not retrieve
a concept **using that concept's own words**. That is not a paraphrase problem and no embedder would
have fixed it; it was being attributed to "we need R6".

RELEASE-SCHEDULE.md:16 specified FTS "(R1, OR)". The shipped code was AND — R1's OR never landed or
regressed, and nothing noticed because nothing measured.

FIX: **AND first, OR only when AND returns nothing.** AND-first keeps precision — when every term IS
present that is the precise answer and should rank — and the OR fallback stops recall failing on its own
words. Verified: all three control misses now resolve. Malformed input falls back to the AND result
rather than losing the injection.

**R6 verdict: still justified, on a smaller and better-understood residual.** 50% of paraphrases still
miss with OR, so meaning-matching has a real job to do — but it is now scoped against a measured 50%,
not an unmeasured 100%, and the cheap half was one query change rather than a resident model on an 8GB box.

## v6.144.0 (2026-08-01) — the YMC dream silo: Tom learns from the CRM corpus

Wave 5 / Phase 48.5, designed 2026-05-16 and parked as "BLOCKED on Porter v7.0 Phase 50".

⚠️ **THAT BLOCKER WAS STALE — verified, not assumed.** All three "missing" primitives exist: `silos`
already carries `prompt_path/cadence_seconds/default_model/detect_rules/enabled` with three live silos;
per-silo cadence runs at `scheduler.ts:190` (`runSiloCadenceCheck`) and `dream-worker.ts:394`; project-
scope layering is `silo-detector.ts` + `/context`. Enrolment is one INSERT and a prompt file.

⚠️ **AND ONE CORRECTION TO THE PLAN: you must NOT add a `workflows` row for this.**
`workflow-engine.ts:483-488` records that the "Software dream — weekly consolidation" workflow row was
deleted in Phase 50 *because a workflow row racing the per-silo cadence tick double-fires*.
`silos.cadence_seconds` + `enabled` **is** the schedule.

- `db/migrate-ymc-silo-v1.ts` — enrols `ymc` **disabled**, daily cadence, `detect_rules.corpus='ymc'`,
  plus 4 sealed `moe-direct` seeds transcribed from ymc's own non-negotiables. ⚠️ Seeds exist so the
  first dream has something to REFINE — a dream starting from zero can only append, which is the
  failure mode the refine-don't-append doctrine exists to prevent.
- `dream-sampler.ts:535-824` — `sampleYmcCorpus()` over a second lazy pool to `ymc_capital`
  (vault-ingest's pattern), reading `documents.extracted_text` + `contact_notes` + aggregated
  `audit_events`. 90-day window, 40KB budget, lanes 40/40/20, recency-first.
- `dream-prompts/ymc.md` — refine-don't-append, plus three rules the transcript prompts don't need:
  **a fact is not a rule**, **a complaint is not a rule** (cites the 2026-07-31 incident by name), and
  **never put an identifier in a directive**.
- `dream-worker.ts:497,528` — corpus selected from `detect_rules.corpus`, not branched on silo id.
  Dispatch untouched, so the run goes through `dispatchWithFailover`.

**Hand-run: 108 items sampled.** `claude_cli` timed out and **`codex_cli` answered via the failover
chain** (4m18s) — the failover work earning its keep. Produced 2 pending proposals; the substantive one
is an operating rule about recording a next action and owner on a reply that needs follow-up, traceable
through the persisted `corpus_index` to 7 real pinned contact notes. It carries no identifiers and
nothing became a directive.

⚠️ **TWO DEFECTS THE RUN EXPOSED, fixed for EVERY silo:** `scrubPII`'s phone pattern **matches ISO
dates** — every date in the corpus came back `[REDACTED]`, and every rule this silo exists to learn is
about dates; and `FRUSTRATION_REGEX` tagged **106 of 107** items (its `rant_caps` arm under `/i` is
effectively "any three words" on prose).

**OPEN — the loop is not closed.** Accepted `ymc` directives currently reach nothing:
`services/memory-injection.ts` (the Bridge path Tom uses) has no silo concept at all. That is
Phase 48.5-05 and it touches ymc's `tom-llm.ts`.
**PII posture needs a decision before enabling:** `pii-scrub.ts` catches emails/phones/handles but NOT
names. Structurally compensated (identity docs excluded, notes read without the contact) but a document
body can carry a name and the dream may be answered by an external gateway.

To enable after sign-off: `UPDATE silos SET enabled = TRUE WHERE id = 'ymc';` — that statement is also
what schedules it.

⚠️ **THE PRE-COMMIT SECRET SCAN CAUGHT TWO THINGS ON THE WAY IN, both worth recording.**
1. `getYmcPool()` carried a hardcoded fallback connection string **with a password**, on the reasoning
   that a trust-auth box makes it harmless. **heymoezy/porter is PUBLIC** — anything committed there is
   world-readable immediately and permanently, and rotating afterwards does not un-publish it. Removed;
   `YMC_DATABASE_URL` now comes from `~/.config/porter/porter.env` (600) and its absence THROWS, because
   a dream that cannot read its corpus must fail loudly rather than quietly sample nothing.
2. An untracked **DKIM private key** (`ops/mail/porter-dkim.private`) was swept into the staging area by
   a broad `git add -A`. Unstaged, and `ops/mail/*.private` is now gitignored so it cannot be staged
   again. It was never committed.

## v6.143.0 (2026-08-01) — v6.141.0's "preserved" branches were empty, and its 1,800s budget was dead

Both faults are mine, both shipped in v6.141.0, and both were found by reading the code rather than by
the smoke test — which passed happily either way.

**1. `removeWorkspace()`'s header claimed "THE BRANCH IS DELIBERATELY KEPT… it holds the only copy of
work a session just did". It held nothing.** `WORKSPACE_RULES` forbids the session to commit (right —
a session must not decide what lands), and `job-executor.ts`'s `finally` force-removed the worktree,
so the uncommitted work was destroyed and the branch pointed at the same commit as main.
⚠️ **Proof: both `porter-dev/*` branches that release left behind were 0 commits ahead of main.**
A comment describing a protection that does not exist is worse than no protection, because it stops
anyone from looking.
`commitWorkspace()` now commits onto the throwaway branch before cleanup — `--no-verify`, because the
release ceremony belongs to whoever decides to MERGE, not to a snapshot. The `node_modules` symlinks
this module creates are excluded, so a one-file job leaves one file (the first run committed three).

**2. `AbortSignal.timeout(1_800_000)` on the job was dead code.** The adapter kills the subprocess at
`TIMEOUT_MS = 300_000` first, so every workspace job actually got 5 minutes while the release notes
said 30. ⚠️ A ceiling set in the caller cannot raise one enforced in the callee.
`WORKSPACE_TIMEOUT_MS` (default 1,800s, env-overridable) now applies at the adapter when a dispatch
carries a workspace.

VERIFIED end-to-end twice: a real workspace job's branch is now **1 commit ahead** and contains exactly
the file the session wrote, with no symlink noise. Test branches deleted.

## v6.142.0 (2026-07-31) — two holes in v6.141.0's workspace sessions, closed

Both found by the automated commit security review, both real.

**1. The sanitised env was written and never wired up.** `workspace.ts` exports `workspaceEnv()` and its
header states the guarantee — "the subprocess gets a SANITISED env; no DATABASE_URL, no tokens, no
provider keys". The adapter then spawned with `env: { ...process.env }`. So a WRITE-ENABLED session
editing real code held Porter's full environment. Code contradicting its own documented guarantee is
worse than no guarantee. Wired at BOTH spawn sites, `isWorkspace` only — the sandbox path is unchanged.
**Verified against a live session:** `DATABASE_URL` not present, `PORTER_SERVICE_TOKEN` not present,
`printenv | wc -l` = 22.

**2. `repo` was unvalidated.** It arrives in an API body; any directory on the box containing a `.git`
would be worktree'd and a write-enabled session run inside it. The endpoint is service-token gated and
loopback-only, but "internal" is not a boundary — it is the assumption every SSRF write-up opens with.
`assertAllowedRepo()` resolves the REALPATH (a string check proves nothing against `../` or a symlink
out of the tree) and requires containment in `PORTER_WORKSPACE_ALLOWED_ROOTS` (default `$HOME/projects`).
A leading `-` is refused outright — `git -C` would read it as an option. `isAllowedRepo()` is exported so
`POST /agents/:id/jobs` rejects with 400 up front instead of failing at claim time.
**Verified:** `/home/lobster/.claude`, `/tmp`, `-o/tmp/x` all rejected; `~/projects/ymc.capital` accepted.

## v6.141.0 (2026-07-31) — Porter can run a code-changing job (one harness, at last)

Moe: *"is tom handing off jobs to porter or is he controlling a claude code cli session? porter is the
harness."* It was **both**, and the sandbox is why.

`adapters/claude-cli.ts` pins `cwd = SANDBOX_CWD` (a /tmp dir, no CLAUDE.md ancestors) with a read-only
tool set. Correct for a research worker — and it means a job that must EDIT CODE cannot run through
Porter at all. So ymc.capital grew `scripts/tom-dev-runner.ts`, spawning `claude` directly in a
worktree, **outside the router**, against the standing "Porter is ALWAYS the router" rule.

`POST /api/v1/agents/:id/jobs` now accepts `repo`. The executor creates a throwaway worktree, runs the
session in it, reports the real diff, removes the directory and keeps the branch.

- **`services/bridge/workspace.ts`** (new) — worktree lifecycle, ported guard-for-guard from
  tom-dev-runner: never the live tree · no deploy/commit/push/restart (`WORKSPACE_RULES`) · sanitised
  env allowlist (no `DATABASE_URL`, no tokens) · `node_modules` symlinked so the session can typecheck.
- **`DispatchRequest.workspace` + `resolveCwd()`** — the path must exist AND `.git` must be a FILE, not
  a directory. In a linked worktree `.git` is a file; in a primary checkout it is a directory. That
  distinction is what stops a write-enabled session being pointed at the live tree. Failure falls back
  to the sandbox and warns.
- **Default unchanged** — no `repo` → /tmp sandbox, caller's read-only allow-list, 240s. A workspace
  job gets the full agentic set and 1,800s: editing code with read-only tools is not a sandbox, it is
  a job that cannot work.
- **The branch survives cleanup deliberately** — it holds the only copy of what the session wrote.

⚠️ **Threading bug caught by testing, not reading.** First run: Porter created the worktree, logged it,
and the session still ran in /tmp. `selectStreamBackend` spreads unknown keys into `RoutingContext`, so
`workspace` was swept into routing state and never reached the adapter — anything not named explicitly
in `StreamOptions` is silently dropped. The agent itself flagged it: *"the working dir is not a git
worktree."*

Verified over three runs: toplevel = the worktree, file lands there, nothing committed, **live tree
untouched**, directory removed with branch kept, diff report accurate (it had claimed "3 file(s)
changed" for a one-file job — our own `node_modules` symlinks, now filtered in `workspaceDiff`; a
worktree's `info/exclude` is read from the COMMON git dir, so writing it would alter the shared repo).

## v6.140.0 (2026-07-29) — Tom was one long prompt away from going silent, and nothing was watching

`claude-cli.ts` passed the system prompt as a **single argv element**. Linux caps one argument at
`MAX_ARG_STRLEN` (32 pages = 131,072 bytes on this box) independently of `ARG_MAX`; over it, `spawn` fails
**E2BIG before claude runs**. The caller sees a dead gateway, not a model error — for Tom that surfaces in the
group chat as *"Something glitched on my end"*.

**This is the same fault that killed grok_cli on 2026-07-28** — *"the failover chain reached it and died E2BIG
on all four gateways"*. `grok-cli.ts:42` got `MAX_ARG_PROMPT_BYTES` + `--prompt-file` as the fix.
**`claude-cli.ts` never got the same treatment, and it is the adapter YMC Tom runs on.**

- Above 96 KB the system prompt now travels via `--system-prompt-file` (verified present in claude 2.x),
  written 0600 and unlinked in `finally` on both the dispatch and stream paths. Below it, the flag form stays.
- **It now says the size out loud.** Within 24 KB of the ceiling it warns with the exact byte count and
  remaining headroom. Nothing measured this before, which is why nobody knew how close Tom was.

**Proven, not reasoned about.** With a 140,050-byte system prompt against the real binary:

```
ARGV (before the fix): spawn THREW -> E2BIG
FILE (with the fix)  : code=0
```

and through the adapter itself: 1,053 bytes → argv path → OK; 140,053 bytes → file path → OK.

**Why it mattered now.** Tom's system prompt is SOUL.md (40 KB, grown from 21 KB) plus ~116 rendered tool
descriptions. Two independent measurements bracket it at **100–128 KB against the 131 KB ceiling** — headroom
somewhere between 3 KB and 31 KB, and no way to know which without this logging. Separately, a Porter skill
block was measured at 22,016 chars in v6.138.0; appending that to Tom's prompt would have crossed the limit
and taken him offline rather than degrading him. That work is parked behind this fix.

This protects every `claude_cli` consumer, not only Tom.

## v6.139.0 (2026-07-29) — the login form accepted unlimited password guesses

Round 2 of the security work opened by v6.128.0. Four items, one of them reversed by decision.

**`POST /api/v1/auth/login` had no brute-force budget at all.** The `rate_limits` tables in this repo
meter API and gateway usage and have never been consulted by the login path — so guessing was limited
only by how fast scrypt answers, against a form that fronts the box's only `platform_admin`. Now eight
failures per (ip, email) per 15 minutes, in `lib/login-rate-limit.ts`.

That module is copied from BYD's rather than ymc's, and the choice matters. **ymc burns the credential**
— NULLs `password_hash` — after five failures, which is only safe where the owner can recover, and ymc's
recovery is the emailed reset code. Porter's mail does not deliver (see below), so a burn here would be a
permanent lockout triggerable by anyone who knows the admin's address: a denial of service handed to the
attacker. A time-boxed counter costs the attacker the same and costs the owner fifteen minutes.

Keying on IP is only meaningful because v6.128.0 set `trustProxy`. Before that, every request off the
internet reported Caddy's own `127.0.0.1`, so an IP-keyed budget would have been one global bucket —
the first attacker would have locked out every visitor at once.

- **Reset codes now come from the CSPRNG.** `generateCode()` used `Math.random()`, a seeded xorshift
  whose state is recoverable from a handful of outputs. It feeds `reset_password`, so predicting it is
  account takeover. Now `crypto.randomInt(100000, 1000000)`.
- **And those codes now have a guess limit.** `verifyAuthToken()` charged nothing for a miss: 10^6 codes,
  a 15-minute TTL, unlimited attempts, unauthenticated. Five failures burns the token (`migrate-atk-v1`
  adds `auth_tokens.attempts`). The increment is a guarded `UPDATE`, not read-then-write, so concurrent
  guesses cannot race past the cap.
- **`GET /api/v1/health` no longer publishes the topology.** It was returning AI backend URLs and models,
  database engine and latency, and seven days of token usage to anonymous callers. Liveness stays public
  because monitoring needs it — anonymous now gets `status` + `porter_version`, which is everything the
  release smoke and `admin/deploy.sh` actually read. The full body is unchanged for a caller on loopback
  or a signed-in `platform_admin`.
- **The `system` row is no longer an account.** It held `moe@askporter.app` — the same address as `moe`
  until a parallel session split them this morning — while being nothing but the string background writes
  attribute to. Verified before touching it: `plugins/auth.ts` synthesises its `sessionUser` in memory and
  never reads the row, no foreign key references `users`, it had no sessions, and every other `'system'`
  in the codebase is a literal. Its email is now NULL and its credential empty, and `/login` refuses any
  row without a usable hash — so the rule is enforced in code, not just in data.

### Deliberately reverted: `/auth/change-password` still does not ask for the current password

A re-auth check was written and backed out the same day on Moe's call. It is a real hole — a stolen
`porter_session` cookie converts to permanent ownership of the account, and `sameSite:'strict'` does
nothing about a cookie that has actually been stolen. But in *this* deployment the fix would have been a
lockout mechanism: `smtp_host` is `127.0.0.1:587` with **no MTA listening**, so the emailed reset cannot
be delivered, and requiring a password nobody holds would leave direct database access as the only way
back in. The risk is accepted and recorded. Revisit when mail works — a test pins the revert so it does
not creep back in unnoticed.

**Open item, now tracked in CHECKPOINT:** Porter cannot send mail. This breaks password reset
platform-wide, not just one account. v6.132.0 made the failure soft rather than a 500; soft-failing is
still not delivering.

255 tests, 0 failures (13 new).

## v6.138.0 (2026-07-29) — 207 skills, 20 assigned, none ever loaded

`selectSkills()` runs on every dispatch and its disk read has always failed. `SKILLS_ROOT` resolved
`process.cwd() + '/skills'`, and the service runs with `WorkingDirectory=<repo>/backend` — so it looked in
`backend/skills`, a directory that has never existed. The skills live one level up.

The database chain was fine the whole time: 207 registered skills, 20 assigned and enabled across two
personas. Every dispatch selected the right skills, then read their `SKILL.md` from a path that isn't there
and injected a 160-character header with no content.

- **One definition instead of two.** The admin route hardcoded an absolute path to *this machine* — right by
  luck, broken on any other install (Architecture Rule 2). Both now read `config.skillsDir`, derived from
  `dataDir` so it moves with the install.
- **Verified by loading, not by compiling.** With the service's real environment the prompt block goes from
  160 chars to **22,016** — `healthcheck`, `handoff-director` and `worker-architect` selected for a
  diagnostic task, with their full bodies.

Two things worth stating plainly:

- **This adds roughly 5,500 tokens to an affected dispatch.** That is the fix working, not a regression, but
  it is not free. Scope is narrow: only `porter-core` (17 skills) and `skills-curator` (3) have assignments.
  Tom, the Claude CLI sessions and every other consumer are untouched — the remaining ~190 skills on disk are
  unassigned and still never load.
- **The `~/.porter` footgun is real and this surfaced it.** Run without `PORTER_DATA_DIR`, `skillsDir`
  resolves to `~/.porter/skills` — the dead pre-cutover data directory. The systemd unit sets the variable, so
  the service is correct; anything started by hand is not.

## v6.137.0 (2026-07-29) — one memory system: the second injection builder is gone

Moe: *"which one is live? if v1 is dead, it should be deleted. there should only be one memory system this is
exactly the stuff i told you i want resolved. we cannot have conflicting code and even you seem confused by
it."*

He was right to call that out — I had it backwards in an earlier summary. The evidence settles it:
`memory_injection_shadow` held **486 rows, every one `mode='shadow'`, `injected='v1'`. Zero canary rows.**

- **`memory-injection.ts` (V1) is the only builder that has ever served a request.**
- **`memory-injection-v2.ts` never served once.** It was computed, compared against V1, and thrown away.

So V2 was the dead one. Deleted, with `memory-projection.ts` (the vault-shaped shim it read through), the
shadow/canary machinery, and the `MEMORY_INJECTION_VAULT_SCOPES` flag. Three callers rewired to
`buildMemoryContext` directly: `memory-snapshot.ts`, `routes/v1/chat.ts`, and the fire-and-forget shadow block
on the `/context` hot path.

The abstraction was scaffolding for a future where the vault becomes the actual store — but
`memory-projection.ts` read the **same legacy tables V1 reads**, so it bought nothing today and cost a second
path to reason about. If that migration ever happens it should be built against the generic connectors, not
this shim.

**Verified byte-identical, not merely compiling.** A second instance on :3999 with V2 deleted, diffed against
live :3001 with V2 present: ymc.capital 7,160 = 7,160 · Porter 5,807 = 5,807 · Baan Yin Dee 4,103 = 4,103.
The builder was also exercised across all 15 live project scopes, zero failures.

## v6.136.0 (2026-07-29) — SMTP credentials are optional, so a local relay can actually be used

Groundwork for the standalone mail server (Moe's decision, twice reaffirmed after I flagged the risks: no
Google relay). Porter's stored SMTP settings already point at `127.0.0.1:587`; this makes that usable.

- **`getSmtpConfig` required `user` AND `pass`** and returned `null` without them. A relay on loopback needs
  neither — only processes on this box can reach `127.0.0.1`, so the network boundary *is* the
  authentication. The effect was that a correctly-configured local mail server would be rejected as
  "unconfigured" and every send would silently fall back to a console log.
- **The transport passed an `auth` block unconditionally.** Offering credentials to a server that does not
  advertise AUTH is an error, not a no-op, so that alone made an unauthenticated local relay unusable.
- Cleared the stored `smtp_user` / `smtp_pass` — `postmaster@askporter.app` with a 6-character placeholder,
  for a server that has never existed.

**Why standalone is the right shape for this domain, contrary to first instinct:** `askporter.app` publishes
`v=spf1 mx ip4:76.13.190.52 ~all` — it authorises *this box only*, and **not** Google. It also publishes
`p=quarantine`, the strictest DMARC policy in the workspace. So relaying Porter's mail through Google (as
ymc does for `ymc.capital`) would fail SPF *and* DKIM alignment for `askporter.app` and be quarantined.
Sending from this box is the configuration the DNS was actually built for.

The remaining risk is reputation, not authentication: reverse DNS says `srv1379868.hstgr.cloud`, not
`mail.askporter.app`. Outbound `:25` is open, which is the usual blocker and is not one here.

Prepared, needs sudo: `ops/mail/install-mailserver.sh` (Postfix send-only on loopback + OpenDKIM, new 2048-bit
key, selector `porter`) and `ops/mail/verify-mail.sh`, which reports the RECEIVING server's verdict — because
Porter fails soft, a `200` from `/forgot-password` proves nothing was delivered.

## v6.135.0 (2026-07-29) — uptime-counted scheduling froze every cadence

- The "runnables registry frozen" DEGRADED alert was **TRUE and far broader than the job it named**: ALL FIVE
  `every_30m` workflows were idle 79–109 minutes — memory_validate, dream_runs_stuck_sweep, memory_promote
  (Tom's learning), sweep_stale_sessions, runnables_reconcile.
- Root cause: they fired on `tickCount % 900` — an in-process counter reset to 0 on every restart, so it
  required **30 minutes of unbroken uptime**. Porter shipped six times that afternoon and never reached it.
- ⚠️ The same fault had already been found and fixed for `every_24h`/`every_week` — and that fix was itself
  gated on `tickCount % 900`. Re-implementing the disease one level up. The gate must not be uptime at ANY
  scale.
- All cadences now poll `runScheduledWorkflows()` once a minute; it decides due-ness from each workflow's
  PERSISTED `last_run_at`, so it is restart-proof and idempotent.
- Verified empirically: restarted cold, all five ran 75 seconds later.

## v6.134.0 (2026-07-29) — three runbooks documented a fix that would have broken the site

Docs + one script. No runtime behaviour changes.

Moe applied the durable Caddyfile with sudo, so every *"this routing is EPHEMERAL, re-apply it after a
reload"* warning became false — `admin/deploy.sh` printed one during the deploy that shipped v6.133.0.

Worse: `Porter/CLAUDE.md`, `admin/CLAUDE.md` and `_ops/askporter-login-fix.md` all still described a brain-ui
on `:5176` as a live secondary dashboard. **It was deleted as dead code in v6.61.0** and nothing listens on
that port. `_ops/askporter-login-fix.md` instructed pointing Caddy *at* `:5176` — so the documented fix for
this exact outage would have turned a 404 into a **502**. That file is rewritten with the working
configuration and the reason the site 404'd while its API stayed publicly reachable underneath.

`admin/CLAUDE.md` also gains the access-log tail command, since the host ran for weeks with no request
logging and that made "was this accessed?" unanswerable during a security review.

This is the same class of fault as the code bugs found this week: a document asserting something false is
worse than no document, because it is followed under pressure.

## v6.133.0 (2026-07-29) — the login screen can now recover an account

Requested after a lockout: *"porter admin login screen should have a show password icon and a forgot password
flow so i can change it when you go silent."* Both endpoints already existed and **nothing in the UI called
them** — `/forgot-password` and `/reset-password` were on the dead-endpoint purge list until this.

- **Show/hide password toggle**, on sign-in and on the new-password field, via one shared `PasswordField` so
  the two cannot drift. The toggle is `type="button"` deliberately: a bare `<button>` inside a `<form>`
  defaults to submit, so revealing a password would have posted the form.
- **Forgot-password flow** in the same card — request a code, then enter code + new password. Recovery must
  be reachable by someone who cannot get in, so it cannot sit behind a login.
- Wording matches the server's behaviour: it answers identically whether or not an address has an account, so
  the UI says *"if that address has an account"* rather than promising mail was sent. Claiming a definite send
  would re-introduce by implication the enumeration leak v6.132.0 just closed.
- The code field accepts digits only, is capped at 6, and uses `autocomplete="one-time-code"`; submit stays
  disabled until the code is 6 digits and the password is 8+ characters, matching the server's schema so a
  round-trip isn't spent learning that.

⚠️ Still true, and it limits how much this helps: **there is no mail server**, so the code lands in the
service log rather than an inbox. The screen is correct and ready; delivery is the open decision.

## v6.132.0 (2026-07-29) — password reset was impossible, and its failure leaked which emails have accounts

`sendEmailInternal` handled "SMTP not configured" and not "SMTP configured but unreachable". `smtp_host` is
`127.0.0.1:587` and **nothing listens there**, so `sendMail` threw, the throw escaped the route, and one gap
produced four faults:

- **Password reset could never work.** Every attempt returned `500 ECONNREFUSED`. The one flow that exists so
  an operator can recover access unaided was dead.
- **It leaked which addresses have accounts.** `/forgot-password` deliberately answers `{sent:true}` for
  everyone so it cannot confirm membership — but it only ATTEMPTS a send for a real user. Unknown address →
  `200`; real address → `500`. The status code was exactly the oracle the design removes. Confirmed live
  against the public host.
- **The 500 body carried the internal host and port** back to an unauthenticated caller.
- **The `[email-dev]` fallback never ran** — it exists so the code stays recoverable from the log, but the
  throw happened first.

Failing soft fixes all four: callers get the same answer either way, and the code is still retrievable from
the service log.

Not fixed here, and it is the substantive one: **there is still no mail server**, so a reset code cannot
reach a mailbox. Recovery today means reading the log on the box — which is not recovery for someone locked
out. Choosing a delivery channel is the open decision.

## v6.131.0 (2026-07-29) — a NUL byte made claude-rules-mirror.ts unreviewable

Self-inflicted, in v6.121.0. The set-hash separator was written as `.join('\x00')` where `.join(' ')` was
intended — a literal NUL byte in a TypeScript source file.

Functionally harmless: it is only a separator in a hash input, and any consistent separator produces a
stable idempotence key. The real cost was to review. **Git classifies a file containing NUL as binary**, so
since 2026-07-28 that file has produced `Bin 10234 -> 11809 bytes` instead of a diff — no line-level review,
no blame, and `grep` silently reports nothing. Two guard checks against it in this session returned "MISSING"
for code that was demonstrably present.

Removed. The hash changes once as a result, so the mirror re-renders on its next tick — the only observable
effect, and idempotence re-establishes immediately.

## v6.130.0 (2026-07-29) — an empty read must never mean "delete everything"

Three nightly sweeps destroy rows on the premise that "I can no longer see X" means "X was deleted". That is
right for a deleted page and catastrophic for an unreadable ROOT — and every reader here swallows a missing
directory as the fresh-start case, so the failure is completely silent.

- **`vault-indexer`** — `readVaultNodes()` `continue`s past a missing folder and returns `[]`, so every
  concept looks deleted and it archives **all** of them. A wrong vault path would empty the memory layer on
  the next 24h tick, thinning directives and quietly degrading every session.
- **`claude-rules-mirror`** — an unreadable `CLAUDE.md` yields zero rules, but `renderMirrorRows` still emits
  a workspace row containing nothing but its own header. The supersede lands and every session is handed a
  rules directive with no rules in it.
- **`runnables` reconcile** — a failed `systemctl` read gives `found=[]`, and the orphan prune then DELETEs
  every systemd runnable, blinding the registry whose entire job is noticing when something goes quiet.

Each now refuses on an empty read **where prior state exists**, logs it as a named event, and lets the next
tick recover. Zero-vs-nonzero only — deliberately not a ratio, because a partial loss is a legitimate bulk
delete and any threshold would either block real deletions or wave through a half-readable root.

This lands before the roots become configurable (the product work): a wrong path would otherwise be one typo
away from emptying the memory layer.

**Verified against the live database, not a mock.** With `fs.readdir` forced to throw, `runVaultIndexing`
aborted, archived 0, and left all 47 active vault concepts intact; the happy path re-verified after at 47
scanned / 47 unchanged / 0 archived. Worth recording that the isolation in the harness did NOT hold —
`runVaultIndexing` takes its own pool connection, so a `search_path` set on a separate connection never
applied and the run hit production. The guard is the only reason that was harmless. 5 unit tests pin the
shared predicate.

## v6.129.0 (2026-07-29) — dispatch logged the gateway's display name, not the model

- `bridge_dispatch_log.model_name` recorded **"Claude CLI" / "Grok CLI"** — gateway labels, not models. The
  log could not answer "which model produced this?", which is exactly what Moe asked Tom to be able to say.
  Cost lookups keyed off the same value.
- Root cause: **no gateway had `metadata.default_model` set**, and `resolveModelName()` falls back to
  `row.name`. Configured all four from each adapter's own `DEFAULT_MODEL` constant (claude-sonnet-4-6,
  codex/gpt-5.5, grok/grok-4.5, antigravity/default). The fallback now **warns**, so a newly-added gateway
  without one is noisy rather than silently mislabelled — Porter rule 5, never label unconfigured state as real.
- `logDispatch` records the **observed** model (`result.model` — what the adapter reported) instead of the
  configured one, so a failover answer is filed under the model that served it. Registry/pricing lookups
  deliberately keep `decision.modelName`; they join on the configured name.
- Verified live: `claude_cli → claude-opus-5[1m]`, `codex_cli → codex/gpt-5.6-terra`. Both previously read
  as the gateway's name.
- ⚠️ Known gap: the STREAMING path synthesises its log row with `model: decision.modelName` and never sees
  the adapter's detected model, so streamed turns still record the configured default.

## v6.128.0 (2026-07-29) — every privileged route on askporter.app was reachable without logging in

`askporter.app` proxies **every path** to this backend. Everything below was verified from outside the
network, returned 200 before, and returns 401/403 now.

- ⚠️ **The emailed reset code was never checked.** `routes/v1/auth.ts` called the `async` `verifyAuthToken`
  **without `await`** on both `/verify-email` and `/reset-password`, so `valid` was a Promise, a Promise is
  always truthy, and `if (!valid)` never fired. Both routes are public. Anyone who knew `moe@askporter.app`
  (the address on BOTH platform_admin rows) could set its password or mint a session with any six digits.
  TypeScript cannot see this — `Promise<boolean>` in a truthiness test is legal — and there is no runtime
  symptom, because the failure mode is silent success.
  `src/__tests__/await-guards.test.ts` now pins the CLASS, not the two lines: every credential check must be
  awaited, and no `async` function may sit in a boolean guard without `await`. Proven red against the
  pre-fix source. The same sweep found one more real instance (`routes/v1/webhooks-whatsapp.ts` logged
  `[object Promise]` as the routed agent and leaked rejections past its own try/catch) — fixed.
- ⚠️ **`requireAuth` never read `.role`.** It asserted only that *someone* was logged in. Seven route files
  whose own headers claim platform-admin — `v1/{files,vault,registry,recall,agents,bridge,chat}.ts` — were
  protected by it alone; exactly one route in the codebase checked role. `v1/files.ts` is rooted at
  `/home/lobster/projects` and the service runs `tsx` under `Restart=always`, so `POST /api/v1/files/upload`
  was arbitrary code execution as `lobster`, into Porter and every other project on the box. Each file now
  carries a plugin-level `requirePlatformAdmin` hook — the SAME guard the `/api/admin/*` files use, not a
  second one — so a route added later inherits it. `adminAuthPlugin` moved ahead of the route trees in
  `index.ts` so that decorator exists when `/api/v1` boots.
- ⚠️ **`trustProxy` was unset, so `request.ip` was always Caddy's `127.0.0.1`.** Every "127.0.0.1-only;
  relies on server bind" comment in this codebase was decorative: the whole internet passed those gates,
  rate limiting was one shared bucket, and the audit log attributed every event to loopback. Now
  `trustProxy: ['127.0.0.1','::1','::ffff:127.0.0.1']` — trusting ONLY loopback, so a forged
  `X-Forwarded-For` still resolves to the real peer. This is what makes the gates below enforceable.
- **`v1/intellect.ts` — 4 of ~44 routes were guarded.** Unauthenticated writes over Porter's memory
  (`/agent-memory`, `/memory`, `/prune`, `/promote`, `/active-project`) and billable job triggers
  (`/dream-run`, `/github-scan`, `/worker-knowledge-refresh`). One plugin-level `requireLoopbackOrAdmin`:
  a real on-box process, or a platform_admin session (which the service token resolves to). The seven
  credential-less Claude Code hooks keep working unchanged because they genuinely are on-box.
- **`v1/sessions.ts`** — `/search` was unauthenticated full-text search over every agent transcript on the
  box. **`admin/brain.ts`** — the only `/api/admin/*` file missing the hook every sibling has.
  **`admin/health.ts`** — `/logs` (the audit log, including login attempts and their IPs) and `/dashboard`
  were public; `/log-external` was an unauthenticated INSERT. `GET /` stays public for health checks.
- **`POST /api/v1/auth/register` never read `registration_mode`.** The setting has existed in admin settings
  since the beginning, defaults to `closed`, and nothing consulted it — the route minted `operator` accounts
  for anyone. Gated; `getSetting` returns null on a DB error, so the failure mode is closed too.
- **`backend/.env.r7bak2` was matched by no ignore rule.** `*.env` only matches names *ending* in `.env`, so
  a suffixed copy holding `DATABASE_URL` sat one `git add -A` away from a PUBLIC repo. `.env.*` added, with
  the `*.env.example` negations kept last.
- **Containment:** both platform_admin passwords rotated, all sessions deleted, outstanding auth tokens
  burned. Prior exploitation cannot be ruled out.

⚠️ Not fixed here, flagged: `/api/v1/auth/change-password` sets a new password without asking for the old
one; `moe` and `system` share one email, so `/auth/login` and `/reset-password` resolve by `LIMIT 1` /
`WHERE email` across both rows; `/api/v1/health` publicly lists backend URLs and DB state.

## v6.127.0 (2026-07-29) — dreaming completes again: corpus size, agentic preamble, empty-response

- **The 200KB default corpus was undigestible by every gateway.** A default-size run failed the whole chain
  (claude timeout → codex error → antigravity error → grok empty); the SAME silo at 40KB completed on codex
  with 4 proposals. `DEFAULT_BUDGET_BYTES` is now **40KB — the size observed to work**, not a guess. Raising
  it again is fine but must be proven with a completed run: the failure mode is silent and looks like the
  council being down.
- **The fallback gateways are AGENTIC CLIs, not completion endpoints.** grok opens with "I'll read the cited
  paths first…" before answering. The first fallback answer after yesterday's fix died on
  `Unexpected token 'I', "I'll read "...`. `parseDreamResponse` now extracts the outermost balanced `{...}`
  from surrounding prose — a **balanced scan, not a greedy regex**, so braces in trailing prose or inside
  string values can't break it. 5 shapes pass (plain/preamble/fenced/trailing-prose/brace-in-string);
  truncated and no-JSON still fail correctly.
- **An empty response on a clean exit was recorded as success** in all four adapters, so the real failure
  surfaced far downstream as `JSON.parse('')`. Now an error in claude/codex/antigravity/grok — which lets the
  chain try the next gateway instead of poisoning the caller.
- **The dream schedule had been deleted.** `dream_run` existed as a wired action with no workflow row using
  it (only the stuck-sweep and review-digest survived), so dreaming could only ever run by hand. Restored:
  `Software dream — weekly consolidation`, every_week, enabled.
- ✅ Verified end-to-end at the new default: `completed | model=Codex CLI | proposals=5 | turns=17`, answered
  by failover after claude timed out. First completed software dream since 2026-07-25.

## v6.126.0 (2026-07-29) — the "unused concept" pruner was a blanket 30-day delete on everything learned

`concepts.use_count` and `concepts.last_used_at` have existed since Memory V3 and **nothing has ever written
to them.** All 1,053 concepts read `use_count = 0`, `last_used_at = NULL`. That is not cosmetic, because the
pruner acts on it:

```
archiveUnusedConcepts()  →  WHERE use_count = 0 AND created_at < now-30d AND source_type <> 'vault'
```

With `use_count` permanently 0 the predicate reduces to **"archive every non-vault concept older than 30
days"** — a blanket expiry wearing the name of a usage-based pruner. It has fired 621 times. Of 879 non-vault
concepts, 877 are archived and exactly **2** older than 30 days remain active. The only durable knowledge that
survived is vault-sourced, because vault rows are explicitly exempt. The system learned, then deleted what it
learned on a timer.

- `services/intellect/concept-usage.ts` — `recordConceptUsage()`, fire-and-forget, never throws, logs on
  failure (a counter that silently stops writing is how this started).
- Wired at the two places a concept actually reaches a model: the SessionStart payload and tier 6 of the
  dispatch builder. **Only rendered rows count.** `/context` fetches 20 and renders 8; tier 6 fetches 10 and
  appends until the budget runs out. Counting the fetched set would make `use_count` another number that
  means nothing — the exact failure being fixed.
- `buildMemoryContext` takes `recordUsage` (default true). The shadow canary passes **false**: it builds a
  full V1 context purely to diff against V2 and throws it away, and that runs on every `/context` call. Left
  unguarded it would have inflated the counter for payloads nobody received.
- Verified on live data: two `/context` calls incremented exactly the 8 rendered concepts to `use_count = 2`,
  not the 20 fetched. Probe counters reset to 0 afterwards so the live counter starts clean.

⚠️ **This does not by itself make the knowledge loop compound, and it is worth being precise about why.**
Vault concepts get an additive `+80` on a 0-100 confidence scale (`VAULT_CONFIDENCE_BOOST`), and vault rows
carry `confidence_score = 0`, so they rank at exactly 80. In the scope `/context` reads (global + active
project) the only non-vault residents are 12 `subscription` concepts at confidence 30. They can never win a
rendered slot, so they will never be marked used, so they will still be pruned at 30 days. Agent-scoped
`distiller` concepts (112 active) are not in that scope at all and are only reachable through tier 6 FTS —
those now do benefit. Whether the vault boost *should* dominate is a knowledge-priority decision, not a bug,
so it is reported here rather than re-tuned.

## v6.125.0 (2026-07-28) — write down how memory actually reaches a model

Docs. `CLAUDE.md` described memory as "3 layers, pipeline: memory-injection.ts" — which is the path Tom
uses and NOT the one a Claude session gets. That single missing distinction is what let four context
builders grow, a priority scale get read in two directions at once, and a warm packet be written for two
weeks that nothing read.

- The Memory pillar now states the three delivery paths, who receives each, which file builds it, and the
  ordering it uses.
- Written down explicitly, because each was learned the hard way this session: priority runs LOW = generic
  / HIGH = binding and Moe sits at 90+; `workspace` scope reaches EVERY session so nothing project-specific
  belongs there; a new consumer consumes `getHotParts()` rather than becoming a fourth builder.
- ⚠️ `/home/lobster/projects/*` is an INPUT to the memory system — `claude-rules-mirror` scans every
  `CLAUDE.md` under it. Keep git worktrees out of it (`~/.worktrees/`). A worktree placed there during
  this session would have minted a directive from a scratch checkout.
- The unresolved V1/V2 fork is named in the file with its evidence, so the next session inherits the
  decision instead of rediscovering the fork.

## v6.124.0 (2026-07-28) — Porter's own rules were being given to every other project

Data curation, no code change. Completes the scoping thread from v6.121.0: that release fixed the mirror
that GENERATES directives, this one fixes the hand-written rows that predate it.

- **5 Porter-internal rules re-scoped from `workspace` to `project`/Porter.** Workspace reaches every
  session, so a Baan Yin Dee session was being told *"Read the canonical checkpoint at
  /home/lobster/projects/Porter/CHECKPOINT.md"*, *"You are a worker in Porter, an AI orchestration
  platform"*, and Porter's bridge-architecture rules. None of it actionable there.
  (`dir-identity-001`, `dir-arch-003`, `dir-arch-004`, `dir-arch-005`, `dir-context-001`)
- **`dir-arch-004` asserted a dead port.** It named the admin at `:5175`; the admin SPA has been served by
  Caddy at askporter.app for weeks and the inline brain-ui is `:5176`. Corrected while re-scoping — a
  directive that states a false fact is worse than no directive.
- **5 hand-written rules archived as duplicates of the `claude_rules_mirror`.** "Never guess", "Never ask
  shall I proceed", "Find root causes", "Delete dead code" and a restated ship sequence are all synced
  automatically from `/home/lobster/CLAUDE.md` now. A second hand-written copy cannot be updated by editing
  the source, so it can only drift out of agreement with it — and the restated ship sequence already
  conflicted with `_ops/DEPLOY.md`, which is the actual truth.
  (`dir-behavior-001`, `dir-behavior-002`, `dir-quality-001`, `dir-quality-002`, `dir-quality-003`)

Active workspace directives 18 → 8; Porter-scoped 1 → 6. Counts were predicted before running so a wrong
number would fail loudly. Reversible — see CHECKPOINT.md for the exact revert.

Cumulative effect of v6.120.0–v6.124.0 on the session-start payload:
Baan Yin Dee 2,131 → 1,021 tokens · ymc.capital 2,127 → 1,785 · Porter 1,790 → 1,447 — and what remains is
relevant, with the last session's handoff at the top instead of "Session (3 dispatches, 16m)".

## v6.123.0 (2026-07-28) — the directive priority scale was read backwards, so prompts got the filler and lost Moe's rules

The `directives.priority` scale runs LOW = generic, HIGH = binding, and every WRITER uses it that way:
`claude-rules-mirror` sets 60 "above default workspace guidance (50)", and the agent-write path clamps to
1-89 with the comment "never outrank moe-direct" — so Moe's own rules sit at 90+. The injection path read
it upside down.

- `memory-injection.ts` (and its V2 mirror's projection) ordered `priority ASC`, and `directive-scorer.ts`
  scored `10 - floor(priority/10)` — both ranking the LEAST binding rule highest.
- Measured on live data for ymc.capital: 12 directives were injected into a Bridge/chat prompt, in the order
  "You are a worker in Porter" → "The user is Moe" → "Never guess", stopping at priority 40. **The priority-90
  rule ("you need to reply to my messages even when I don't tag you directly") and the CLAUDE SESSION RULES
  mirror were both excluded entirely** — the token budget had been spent on filler before reaching them.
  After the fix the priority-90 rule leads.
- `ALWAYS_INJECT_THRESHOLD = 2` meant "priority <= 2 bypasses scoring". No directive has ever had a priority
  below 10, so the always-inject path had **never fired once** — it was dead code wearing the name of a safety
  feature. Now `ALWAYS_INJECT_MIN_PRIORITY = 90`: the moe-direct floor, the rules that must never be dropped
  to fit a budget.
- Both sort comparators (no-context fallback, and the score tiebreaker) flipped to DESC to match.

This affects every Bridge dispatch and `/chat` call — i.e. Tom's prompts. It does NOT affect the Claude
SessionStart payload, which sorts DESC already and was never wrong.

**`directive-scorer.ts` had no test.** That is why an inverted comparator in the code that chooses which rules
reach a prompt survived for months. Added `src/__tests__/directive-scorer.test.ts` — 6 tests pinning the
DIRECTION, not the values. Proven to have teeth: reverting the fix turns 4 of them red.

## v6.122.0 (2026-07-28) — dead code from the deleted Python era, and the MCP entrypoint that leaked

Cleanup pass out of the memory audit. Nothing here changes what a session is handed; it removes code that
could only mislead the next person reading it.

- **`Porter/.claude/` deleted.** Five hooks (PreCompact ×2, PostToolUse ×2, Stop) all pointed at
  `/home/lobster/documents/porter/.claude/hooks/` — a directory that does not exist — so every one had been
  a silent no-op since the repo moved. The scripts themselves survived locally and were worth reading before
  deleting: all five are built around **`porter.py`**, the Python SaaS deleted on 2026-07-06. `syntax-gate.sh`
  only ever fired on a `porter.py` edit. Obsolete config pointing at obsolete scripts for a deleted codebase.
- **Two MCP entrypoints collapsed to one.** `mcp/server.ts` and `mcp/porter-mcp-stdio.ts` both built the same
  server; `~/.claude.json` registers the stdio one. The one NOT registered was the one with SIGINT/SIGTERM
  handling and `pool.end()` — so the live MCP server, one process per CLI session, had no clean shutdown.
  Took the shutdown handling into the surviving entrypoint, deleted `server.ts`, repointed `npm run mcp`.
  Verified by handshake: `initialize` + `tools/list` return all 9 tools.
- **`Porter/memory/`** — 8 empty directories, 0 files, last touched 2026-03-24, zero code references. Gone.
- **Dead SQL builder in `GET /directives`** — built `args`/`sql`, spliced a parameter into the middle with
  the comment "awkward — rebuild", then discarded both and rebuilt cleanly. Kept the rebuild, deleted the rest.

## v6.121.0 (2026-07-28) — every session was handed every other project's rules

`claude-rules-mirror` rendered the global hard rules AND every project's non-negotiables into ONE
**workspace**-scoped directive. Workspace is injected into every session, so a Baan Yin Dee session was
handed ymc's ship ceremony, journeyful's version-bump rule and Porter's architecture rules — none of
which it can act on, all of which it pays for.

- **One row per scope.** Global hard rules → one workspace row (everyone needs them). Each project's
  non-negotiables → a row scoped to THAT project, which `/context` already injects only when the project
  is active. No route change was needed; the scoping was the bug.
- **The combined body was also being truncated mid-sentence.** Global + every project ran past the 2,400
  char cap, so the last project in alphabetical order got a severed rule and nothing said it was severed.
  Each body is now capped on its own — one long project can no longer eat another's rules.
- Idempotence moved from one body's hash to a hash over the whole SET, and the unchanged-check now
  compares row COUNT as well. Hash alone would not notice a row that went missing.

## v6.120.0 (2026-07-28) — the session-start payload never told a session where the last one got to

Porter wrote the warm packet on every session-end and no read path ever opened it. `hot_contexts` has been
filling since 2026-07-13; the block Claude actually receives at SessionStart is built inline by
`GET /api/v1/intellect/context`, which had its own episode query and had never heard of it. Porter was
telling every session the RULES and never the WORK.

- **The warm packet is now in the session-start payload.** `/context` renders a continuity block —
  handoffs a previous session deliberately left, then the real work that preceded this one — through
  `getHotParts()`, the SAME source `porter_bootstrap` (MCP) reads. Two mouths, one builder: the push
  path and the pull path can no longer drift, which is how they got here.
  Deliberately NOT the whole warm packet: the session-start hook chain already prints the active
  project's CHECKPOINT.md excerpt, so repeating the checkpoint head would bill the same bytes twice.
- **`porter_bootstrap`'s "Recent sessions" has never rendered once.** `hot-context.ts` queried
  `episodes.project` — a column that has never existed; the table is keyed `(scope, scope_id)`. It threw
  on every call into a bare `catch {}`. Fixed, and the catch now logs: fail-open is for "the table isn't
  there yet", not for hiding a query that cannot succeed.
- **The old "Recent Sessions" section was mostly junk, injected into every session.** It read episodes
  project-scoped OR **workspace**-scoped, and workspace is where the analyzer dumps
  `Session (3 dispatches, 16m)` when it has nothing to say. Of 758 project-scoped episodes, 681 (90%)
  carry no fact: the counter template, or the model declining to summarize a session it could not see
  (566 of 758 open in the first person), or provider quota text stored as if it were memory.
  Now filtered — validated across all 758, and the 15 highest-risk drops were hand-read: zero real
  summaries lost.
- The analyzer also *appends* `[Worked on **x** (41 transcript turns, 187m)]` to good summaries. That tag
  is stripped, not treated as a junk signal — judging the line without stripping first rejects every real
  summary that carries one.
- Cost: ymc.capital 2,127 → 2,031 tokens, Porter 1,790 → 1,521, and what remains is worth reading. A
  cold/unknown project renders nothing rather than an empty heading.

Root cause of the junk itself — the analyzer being handed sessions whose transcript it cannot see, and
gateway timeouts — is v6.119.0's territory, not this release's. This stops it reaching the prompt.

## v6.119.0 (2026-07-28) — Bridge had no failover where it mattered most; dreaming was dead for 3 days

- **Dreaming had stopped entirely** — no run of any silo since 2026-07-26. The `software` silo had logged
  **655 failed runs against 20 completed**: 594 `Gateway claude_cli failed: Timed out after 180000ms`,
  11 a quota message parsed as JSON, 3 a forced gateway that was not active.
- Root cause: **`routingEngine.selectWithFallback` does not fall back.** It selects ONE gateway, retries it
  behind the circuit breaker, and throws. `dispatchWithFailover` — the real chain — sat unused beside it.
  Five callers believed they were covered (dream-worker, worker-knowledge, session-analyzer, distiller,
  ai-router — the last with the comment "Dispatch with N-gateway fallback chain (GW-06)" above the call).
  All migrated; the old method is `@deprecated` and documents why.
- The unit test never caught it because **it never called the code** — it hand-writes its own candidate loop
  and asserts that. Green for months against a production path with no failover.
- `grok_cli` could never serve a large prompt: it passed the prompt as positional argv under the comment
  "Linux ARG_MAX ~2MB — big prompts are safe". A *single* argument is capped by MAX_ARG_STRLEN (128KB),
  so dream-sized prompts failed `spawn E2BIG` before the binary ran. Now uses grok's own `--prompt-file`
  above 96KB (0600, unlinked on every path).
- New `dispatchWithFailover` opt **`leadPreferred`**: a forced-but-inactive gateway demotes to the chain
  instead of throwing. Background work prefers a model but must never die for want of one; explicit user
  intent (bridge/agent-message) still hard-fails. Dream chain budget 420s — must exceed one adapter's 180s
  or the second candidate can never run.
- Verified live: `claude_cli:timeout → codex_cli:error → antigravity_cli:error → grok_cli:ok`.
- ⚠️ Still open: the run then failed `JSON parse failed: Unexpected end of JSON input` (grok answered; the
  dream parser could not read it), and **nothing schedules dreaming any more** — there is no timer.

## v6.117.0 (2026-07-16) — the health monitor was crying wolf about jobs that were fine

- The repeated "YMC system DEGRADED — stopped running (silent 2d)" alerts were FALSE: the jobs ran
  fine on systemd; the monitor's own refresh had stopped. The runnables registry (which tracks "has
  this job gone quiet") was seeded once when built on 2026-07-14 and never scheduled — so it froze,
  and its own staleness surfaced as the jobs being silent, +1 day each day, telling Moe to restart
  services that were healthy.
- Root cause: the `runnables_reconcile` action shipped without a workflow to drive it. It is now a
  scheduled every-30m builtin (re-seeded on boot, can't be forgotten), and reconcile now prunes
  vanished units so a deleted timer no longer lingers and false-alarms.

## v6.116.0 (2026-07-14) — 803 documents were in the vault and could not be seen

- **A privacy filter was hiding 803 real business documents.** The graph tombstones a document whose
  file locations are ALL absent — pruned personal-tax docs must not leak as ghost nodes (Moe,
  2026-07-10). Correct. But it required a `present = true` location to EXIST, and a **database-backed
  document has no location rows at all** — those are only ever written by the file scanner.
- So every db-sourced document was silently swallowed: **803 of them, including all 172 in "Needs
  Filing"** — the one pile in the vault that actually needs a human decision. LP updates, a BVI
  incorporation form, an executed subscription agreement, certificates of incorporation. They were in
  the vault, counted in every total, and invisible.
- **A privacy tombstone must fire on "this file is gone", never on "this was never a file."** Hidden
  is now exactly: *has location rows, and every one of them is absent.* Verified as a truth table — a
  pruned K-1 still hides; a database document now shows.
- Graph: 2,676 → **3,479 nodes** (2,100 → 2,903 documents).

## v6.115.0 (2026-07-14) — Codex has been dead for hours, and Bridge was quietly answering as Claude

- **Every "ask Codex for a second opinion" was silently returning Claude.** Bridge's failover chain
  did its job — codex_cli errored, so it fell through to claude_cli and returned a perfectly good
  answer. Which is the problem: **a second opinion that is secretly the same model is worse than no
  second opinion, because it manufactures agreement.** It ran for hours; the only trace was in the
  dispatch log.
- **Two causes, both duplicate-install rot:**
  1. `~/.codex/config.toml` set `model_reasoning_effort = "max"`, which the CLI does not accept
     (`none|minimal|low|medium|high|xhigh`). Codex exited 1 on *every* invocation.
  2. `which codex` resolved to a **stray v0.128.0** in `~/node_modules/.bin` — from an accidental
     `package.json` sitting in the home directory — while the real Codex is **v0.144.3** in
     `~/.npm-global/bin`. The tool registry recorded the stray one as canonical, and Bridge's
     boot-time discovery believed it.
- Both the tool detector and the Codex adapter now prefer the **canonical global install**. A stray
  `node_modules` in someone's home directory does not get to decide which version of a tool the whole
  platform runs.
- **A newly-installed job was invisible to staleness detection.** `max_silence_seconds` was derived
  purely from a timer's last-vs-next fire, so a timer that had *never fired* got `null` — which
  excludes it from the stale check entirely. The window where a job is most likely to be misconfigured
  was exactly the window where nothing was watching it. It now falls back to the last successful run.

## v6.114.0 (2026-07-14) — a node's label should be enough to tell it apart

- The graph drew **eleven identical squares labelled "Share Certificate.pdf"**. They are not
  duplicates — 11 distinct files, 11 distinct source rows. They are the Epic Games cap table, one
  certificate per investor, and the only thing distinguishing them was a folder name nobody was
  reading. **571 document nodes across 265 colliding names** were in that state.
- `/vault/graph` nodes now carry `parentTitle` and `titleAmbiguous`, so a label can read
  "Share Certificate.pdf — Yai Sukonthabhund" instead of leaving the reader to guess. The node keeps
  its real title: renaming source data to suit a canvas would be a lie. **How** a label uses this is
  a design decision; **having** the information is not.

## v6.113.0 (2026-07-14) — the vault overview was still counting the nodes we archived

- **The headline count was inflated by every archived node.** `/vault/overview` counted `vault_nodes`
  regardless of status, so it reported **5,220** when the vault actually holds **3,480** — the other
  1,740 being the archived Phoenix prospects. This is the same defect fixed in the graph in 6.109.0
  (*archiving that the reader ignores is not archiving*) still sitting in **the one number Moe looks
  at first**. Fixing an instance is not fixing a class.
- Archived nodes are now reported as their own figure (`archivedTotal`) rather than hidden — Phoenix
  is out of the graph, but it is not gone, and it returns when Phoenix is revamped.
- **Multi-tenancy verified end-to-end**, not assumed: the vault engine carries no hardcoded scope,
  and `scope=themozaic` correctly returns 0 with no leakage from `ymc`. The scope ladder
  (`porter → moe → ymc`) is real. Other products can have vaults whenever they have documents worth
  organizing; none is being built speculatively.

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
