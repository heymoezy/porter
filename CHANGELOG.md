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
