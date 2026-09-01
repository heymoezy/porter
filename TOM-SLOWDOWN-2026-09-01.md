# Tom slowed down again — diagnosis (2026-09-01)

## What this is, and what it is not

This was diagnosed **without the box**. This session has no `:3001` (`curl` → connection
refused) and no database (`psql` → no socket at `/var/run/postgresql`), so nothing here was
measured live. It is a read of the dispatch path plus the release history since the last time
Tom was fast, and it ends in the **queries that settle it**, because Porter already logs the
per-turn number this argument is about: `bridge_dispatch_log.latency_ms`, with
`input_tokens`, `model_name` and `source_agent`.

Do not act on the ranking below before running §"Settle it in five minutes". Two of the five
candidates are disprovable in one query each.

## Correction — the code I read is not the code that is running

Added after v6.160.4 landed on master and flagged it:

> **PORTER HAS 12 UNCOMMITTED FILES, LAST TOUCHED 11-14 AUGUST, AND THEY ARE LIVE.** 233 insertions
> that exist in no commit. `porter-fastify` runs `npx tsx src/index.ts`, so it loads the working tree
> directly. **The job-executor timeout-derivation work is among it.**

Everything below was read against committed `HEAD` in a fresh clone. The box serves its **working
tree**. So there is a known, unread delta sitting exactly on the subject of candidate #1, first
touched **11 August** — the same date this diagnosis independently landed on from the release history
alone. That is either a coincidence or the answer, and one command tells you which:

```bash
cd /home/lobster/projects/Porter && git status --short && git diff --stat && git diff
```

**Read that diff before anything else in this document.** If it touches `job-executor.ts`,
`claude-cli.ts`, `dispatch-queues.ts` or `routing-engine.ts`, the ranking below is provisional and
those 233 insertions are the first suspect. They also need capturing on a branch regardless of this
investigation — three-week-old unreviewed code running in production is one `git checkout` from
being gone with no record of what it was.

## The path Tom actually runs on

Establishing this first, because three plausible-looking suspects are **not on it**.

```
openclaw (WhatsApp) → ymc.capital tom-llm.ts shim
  → POST /api/v1/chat/stream  { raw: true, system: <SOUL.md + tools>, tools: 'none', model: … }
  → chat.ts       → selectStreamBackend
  → stream-service.ts → routingEngine.selectStreamWithFallback
  → routing-engine.ts:629 dispatchStream          ← NOT queued, NOT budgeted
  → claude-cli.ts:410 stream() → spawn(claude, …) in /tmp/porter-bridge-sandbox
```

Ruled out, with the reason, so nobody re-opens them:

- **The concurrency-1 dispatch queue** (`dispatch-queues.ts:12`) does not gate Tom.
  `dispatchStream` never enqueues; only the non-streaming paths do. (It *does* serialise every
  non-streaming dispatch behind a single slot — real, but a different bug.)
- **Memory injection, and the R6 embedding call** (`memory-injection.ts:349`) are skipped for
  raw callers (`chat.ts:349`). Tom owns his own prompt. The embed call is capped at 2s and
  fails open anyway.
- **`logDispatch`** is a fire-and-forget IIFE that returns its id synchronously
  (`routing-engine.ts:154`, IIFE at `:177`). Its ~10 queries are not on the critical path.

So Porter's own per-turn work for Tom is small. What changed is **what else is running on the
box while he waits**, and **how big his prompt is**.

## Ranked

### 1. Interactive turns and 12-hour dev sessions now share a 4-vCPU box with nothing separating them

Since **v6.160.0 (2026-08-11)** — the release window that matches "again".

- `job-executor.ts:75` — `MAX_CONCURRENT_JOBS = 4`, jobs are now *launched*, not awaited.
- `claude-cli.ts:54` — `WORKSPACE_TIMEOUT_MS = 43_200_000` (12h). Before 08-11 the effective
  ceiling was **5 minutes** (the adapter killed first; v6.141.0's 1,800s was dead), and the
  queue was serial.
- A workspace dispatch gets the full agentic set — `--permission-mode auto --allowedTools
  WebSearch,WebFetch,Read,Write,Edit,Bash,Glob,Grep,Agent` (`claude-cli.ts:446`) — in a real
  git worktree. That is `npm`, `tsc`, `playwright`: **CPU**, not "waiting on a remote API".
- Nothing runs those at a lower priority. No `nice`, no reserved capacity for interactive traffic.
  Tom's turn is one more `spawn` of the same binary competing with them.

**And they are not competing for 4 vCPUs — they are competing for 1.8.**
`ops/systemd/porter-fastify.service` sets `CPUQuota=180%` and `MemoryMax=2G`, added 2026-05-11 "after
CPU saturation incident". A spawned `claude` stays in the unit's cgroup, so **every dev session, every
dream, every 30s health probe and Tom's live turn share one 180% quota**. When the cgroup exceeds it
the kernel throttles every task inside it — a dev session running `tsc` does not merely compete with
Tom's turn, it gets both throttled together. The quota was sized in May, when a workspace dispatch
could not outlive 5 minutes and jobs ran one at a time. Nothing revisited it on 11 August when four
of them became able to run for twelve hours.

The comment justifying concurrency 4 (`job-executor.ts:71`) says these sessions are
"overwhelmingly waiting on a remote API rather than burning CPU". That is true of a chat turn
and false of a dev session, which is the only kind of job the 12h ceiling exists for.

Two aggravations: the **streaming path has no concurrency limit at all**, so
`MAX_CONCURRENT_JOBS` bounds jobs but not total concurrent `claude` processes; and
`reclaimOrphanedJobs()` runs **only at startup**, so a wedged session holds one of four slots
for up to 12h and nothing notices until a restart.

### 2. Background LLM work that used to produce nothing now runs for real

2026-08-01 → 08-02: v6.135.0 unfroze every cadence, v6.146.0 enabled the ymc dream silo,
v6.149.0 fixed three of four silos that were "producing nothing". Each dream is a `claude_cli`
dispatch on the same box. This is background load that genuinely did not exist in July —
smaller than #1, same mechanism, and it landed a few days earlier.

### 3. Tom's prompt is parked against the kernel ceiling and nothing trends it

v6.140.0 measured his system prompt at **100–128 KB against a 131 KB limit** — SOUL.md alone
went 21 KB → 40 KB, plus ~116 rendered tool descriptions. That is ~25–32k tokens of prefill on
**every** turn, before he says a word. It is a floor on his latency and it only moves one way.

The warning added in v6.140.0 fires only within 24 KB of the ceiling and is written to the log,
not stored — so "is his prompt bigger this week than last?" is currently unanswerable from
Porter. It should not be: `bridge_dispatch_log.input_tokens` is right there.

### 4. A compression call that has never once worked sits on the tail of every reply

`routing-engine.ts:660` awaits `compressToolOutput(fullResponse)` before the stream generator
finishes. That calls `dispatchCompression()`, which POSTs to `/api/v1/chat/send`
(`context-compressor.ts:88`) **with no credentials** — and every route in that file is behind
`fastify.requirePlatformAdmin` (`chat.ts:33`). It is a guaranteed 401, so the function has
always returned `null` and `compression_stats` has always been absent.

Cost is a localhost round trip, so this is not why Tom is slow — but it is on the live reply
path, it fires on every reply over 500 tokens, and it is summarising **the assistant's final
answer**, not a tool output. It should be deleted, not fixed.

### 5. Confirm he is still on Sonnet

`claude-cli.ts:256/437` pass `--model` only when the caller sends one; **omitted → the CLI's
account default, which is Opus**. If the shim stopped sending `model`, Tom gets the same
answers several times slower and nothing errors. Since v6.129.0 the log records what actually
answered, so this is one query — cheap to rule out, expensive to assume.

## Settle it in five minutes

On the box. Read-only.

```sql
-- 1. Is he slower, when did it turn, and did his prompt grow with it?
SELECT date_trunc('day', to_timestamp(created_at)) AS day,
       count(*),
       round(avg(latency_ms))              AS avg_ms,
       percentile_disc(0.5)  WITHIN GROUP (ORDER BY latency_ms) AS p50,
       percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95,
       round(avg(input_tokens))            AS avg_in_tok
  FROM bridge_dispatch_log
 WHERE source_agent = 'tom' AND created_at > EXTRACT(EPOCH FROM NOW()) - 45*86400
 GROUP BY 1 ORDER BY 1;
```
Read it against three dates: **08-01/02** (dreams came alive), **08-11** (12h concurrent jobs),
and today. If `avg_ms` steps up while `avg_in_tok` is flat → #1/#2. If both climb together →
#3. A step change on a single day with no prompt growth is #1.

```sql
-- 2. #5 in one query: what actually answered?
SELECT model_name, count(*), round(avg(latency_ms)) AS avg_ms
  FROM bridge_dispatch_log
 WHERE source_agent = 'tom' AND created_at > EXTRACT(EPOCH FROM NOW()) - 7*86400
 GROUP BY 1 ORDER BY 2 DESC;
```
Anything other than the Sonnet id — especially `Claude CLI`, the gateway label — is the answer,
and it is a one-line fix on the shim.

```sql
-- 3. #1 directly: was a dev session in flight while Tom was slow?
SELECT id, agent_id, trigger_type, status,
       to_timestamp(started_at) AS started,
       round((EXTRACT(EPOCH FROM NOW()) - started_at)/60) AS mins_running
  FROM agent_jobs
 WHERE status = 'running' ORDER BY started_at;
```
Then overlay: Tom's slow turns from query 1 against those windows. If his p95 is bad *only*
inside them, #1 is proven and #3 is a red herring.

```bash
# 4. What the box is actually doing
uptime                                    # load average vs 4 vCPU
ps -eo pid,etimes,%cpu,rss,args | grep -c '[c]laude'   # concurrent CLI processes
journalctl --user -u porter-fastify --since '7 days ago' | grep 'system prompt'  # §3 headroom

# 5. THE decisive one for #1 — is the cgroup being throttled?
cat /sys/fs/cgroup/user.slice/user-$(id -u).slice/user@$(id -u).service/app.slice/\
porter-fastify.service/cpu.stat        # nr_throttled, throttled_usec
systemctl --user show porter-fastify -p CPUQuotaPerSecUSec -p MemoryMax
```
`nr_throttled` climbing while Tom is slow **is** #1, measured rather than argued. Sample it twice a
minute apart: if `throttled_usec` moves at all during a dev session, every turn taken in that window
paid for it.

## What I would fix, in order

1. **Separate interactive from background.** A dev session must not be able to take CPU from a
   turn a human is waiting on. Cheapest correct version: spawn workspace dispatches under
   `nice`/`ionice` (they have no deadline — that is the whole premise of dev #109), and drop
   `MAX_CONCURRENT_JOBS` to 2 until there is a measurement supporting 4; the number was inherited
   from the old claim batch size, not chosen. If the cgroup is throttling, the honest fix is a
   **separate slice for background work** with its own quota, so a dev session cannot spend the
   budget Tom's turn needs — raising `CPUQuota` alone just moves the saturation back onto the box
   the May incident was about.
2. **Bound total concurrent CLI processes**, not just jobs. Today the streaming path is
   unlimited; four jobs plus dreams plus Tom is already over-subscribed.
3. **Record prompt size per turn** so #3 is a trend and not a memory. `input_tokens` is already
   logged; alert on the byte count the v6.140.0 warning computes instead of only printing it
   near the ceiling.
4. **Delete the compression call** at `routing-engine.ts:660` and `dispatchCompression()` with
   it. It has never returned anything but `null`, and it is on the reply path.
5. **Reap orphaned jobs on a cadence**, not only at startup — keyed on liveness, never on age
   (age is actively wrong now that a legitimate session runs 12h).

## Found on the way, unrelated to Tom

`routing-engine.ts:365` writes an `agent_notes` row per agent per hour — *"Routed via claude_cli
(claude-sonnet-4-6) — normal response (4200ms)"* — `status='active'` forever. Tier 4 of the
injection builder selects `agent_notes` for the agent **with no `LIMIT`**
(`memory-injection.ts:202`). So every non-raw injection reads a table growing by ~24 rows per
agent per day, and that telemetry competes for the same 400-token tier as real learnings. Tom
is raw so this is not his problem; it is Porter's own chat path and the personas'.
