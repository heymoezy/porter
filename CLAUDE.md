# Porter — CLAUDE.md

Porter is a **background services platform** for AI applications. Three pillars: Bridge, Intelligence, Memory. Consumers (YMC, future apps) call Porter — Porter is never the product surface.

Business model: API metering. Any UI is just an API customer.

## Pillars

- **Bridge** — routes AI requests across backends. **Four** registered gateways, all enabled: Claude CLI (`claude_cli`, priority 10), Codex CLI (`codex_cli`, 20), Antigravity CLI (`antigravity_cli`, 30), Grok CLI (`grok_cli`, 40). Failover runs in that priority order. One bridge, many backends. Hub/spoke contract: `BRIDGE.md`. Adapters: `backend/src/services/bridge/adapters/`.
  - ⚠️ **`routing_rules` is NOT consumed by anything.** The table exists (`migrate-bridge-v2.ts`) and `RoutingRuleAction` is declared in `types.ts`, but no dispatch code ever reads it — the routing engine is unbuilt and its tests are `it.todo`. Rows in it look like live configuration and change nothing. Five rows forcing agents to a gateway named `openclaw`, which has not existed for months, were deleted on 2026-08-02 (recovery SQL kept). Do not "configure" routing there until something reads it.
- **Intelligence** — signal extraction from CLI activity, classification, surfacing. Consumers subscribe.
- **Memory — 3 layers:** Directives (operating rules, high trust) → Concepts (durable truths, high trust, FTS) → Episodes (time-bound, medium), plus **hot context** (`hot_contexts` / `hot_notes`) — the warm packet a session opens with.

### Memory — how it actually reaches a model (read this before touching injection)

There are **three delivery paths, and they are not the same code**:

| Path | Who gets it | Built by | Ordering |
|---|---|---|---|
| **Push** — `GET /api/v1/intellect/context` | Claude Code SessionStart (via `cli/claude-silo-shim.cjs`) | inline in `routes/v1/intellect.ts` | `priority DESC` |
| **Pull** — `porter_bootstrap` (MCP) | any CLI, mid-session | `services/intellect/hot-context.ts` | n/a |
| **Dispatch** — Bridge / `/chat` | Tom, ymc, all agent traffic | `services/memory-injection.ts` (6 tiers, 2000-tok budget) | `priority DESC` |

**`directives.priority` runs LOW = generic, HIGH = binding.** Moe's own rules sit at 90+
(`ALWAYS_INJECT_MIN_PRIORITY`); agent-written ones clamp to ≤89 so they can never outrank him. Both
readers sort DESC. This was inverted in the dispatch path until v6.123.0 and cost Moe's rules their
place in every Tom prompt — `src/__tests__/directive-scorer.test.ts` now pins the direction.

**Scope decides who sees a rule.** `workspace` reaches EVERY session — put nothing project-specific
there. Porter's own rules are `scope='project', scope_id='Porter'`. `claude-rules-mirror` emits one
workspace row (global hard rules) plus one row per project (that project's non-negotiables).

**Continuity is the point.** `POST /session-end` recomputes `hot_contexts`; the push path renders the
handoff + recent real work through `getHotParts()` — the SAME function `porter_bootstrap` uses, so the
two mouths cannot drift. If you add a third consumer, consume `getHotParts()`; do not write a fourth
builder.

⚠️ `/home/lobster/projects/*` is an INPUT to the memory system (`claude-rules-mirror` scans every
`CLAUDE.md` there). Keep git worktrees OUT of it — use `~/.worktrees/`.

**One builder, no fork.** `services/memory-injection.ts` is the only injection builder and the only thing
that has ever served a request. A second implementation (`memory-injection-v2.ts`, reading through a
vault-shaped `memory-projection.ts` shim behind a shadow canary) was **deleted in v6.137.0** — 486 of 486
logged injections were V1, and V2 never served once in production. Its abstraction pointed at the same
legacy tables V1 reads, so it bought nothing today and cost a second path to reason about.

If the vault ever becomes the actual store, rebuild that read path against the generic connectors, not
against the deleted shim.

## Calendar — one place, and it is not here

⚠️ **Porter has no calendar integration. Do not add a second one.** `services/calendar.ts` (a Google
Calendar sync into `calendar_events`, plus `pushMilestoneToCalendar` on the external dispatcher) was
**deleted on 2026-08-31**. It could not run: nothing in Porter has ever written a row to
`workspace_connections`, so the `google_calendar` connection it required had to be inserted by hand, and
it was additionally gated behind `FEATURE_EXTERNAL_CONNECTIONS`. Even had it run, it read
`calendarId: 'primary'` off the FIRST connection only, into a table no route or query ever read —
`checkCalendarDeadlines` was its sole consumer.

The calendar Moe actually asks about lives in **ymc.capital** (`backend/src/lib/tom-google.ts`,
`listUpcoming` / `listUpcomingDetailed`), which reads moe@ymc.partners AND moe@themozaic.com through
each account's own credentials. That is the one place. Two calendar readers means two answers to
"what's on Tuesday", and the dead one here was a standing invitation to build the second.

The `calendar_events` table is left in the schema — dropping it is a data decision, not a code one — but
nothing reads or writes it.

If a calendar service ever belongs in Porter (it plausibly does; Porter is the platform and YMC is a
consumer), build it against the generic connectors with a real OAuth flow. Do not resurrect the deleted
file, and do not leave both alive at once.

## Stack

- Backend: `backend/` — Fastify 5, TypeScript, Drizzle ORM
- Database: PostgreSQL (one schema, one truth)
- Port: `3001`, bound to `127.0.0.1`
- Service: `systemctl --user {start|stop|restart|status} porter-fastify`
- Config: `porter_config.json` via `PORTER_DATA_DIR`
- Version: see `backend/package.json`

## Architecture Rules — Non-Negotiable

1. Fresh-start assumption. Must work from zero config.
2. No hardcoding. No paths, hosts, ports, tokens, binary locations.
3. Capability detection on startup; graceful degradation when missing.
4. Agnostic backends. No model-specific bridges.
5. Show real capability state. Never label unconfigured features as active.
6. **claude_cli backend must NOT inherit Porter's operating context.** Subprocess is spawned in an isolated cwd so it doesn't auto-discover this CLAUDE.md.

## Common Commands

```bash
systemctl --user restart porter-fastify
cd backend && npm run dev
cd backend && npx tsc --noEmit
cd tests && npx playwright test
curl http://127.0.0.1:3001/health
psql -d porter
```

## Ship Process — Atomic

1. `cd backend && npm run build`
2. `systemctl --user restart porter-fastify; sleep 8`
   (never `pkill -f "porter/backend"` — the path is capital-P `Porter/`, the pattern never matches)
3. `curl -s http://127.0.0.1:3001/health` → expect current version
4. Update `CHECKPOINT.md`

The admin SPA (`admin/frontend.archived/`, name is a historical artifact — it was
un-archived and is LIVE) is a static React Router build served by Caddy at
**askporter.app**, with `/api/*` reverse-proxied to this Fastify brain on :3001.
Ship it with `bash admin/deploy.sh` (build → rsync to `/home/websites/porter/admin`;
Caddy picks up new files immediately, no restart needed).

The Caddy routing is **durable as of 2026-07-29** — Moe applied the static-root +
`/api` block and a JSON access log to `/etc/caddy/Caddyfile`. It is no longer an
ephemeral admin-API patch and no longer needs re-applying after a reload.

⚠️ There is **no brain-ui on :5176**. It was deleted as dead code in v6.61.0 and
nothing listens on that port. Earlier revisions of this file and
`_ops/askporter-login-fix.md` said otherwise; following that advice turns a
working site into a 502. The only Porter process is porter-fastify on :3001.

## Verification — Before Claiming Done

- [ ] `npx tsc --noEmit` zero errors
- [ ] Service restarted, `/health` returns current version
- [ ] Actual change tested (curl, browser, psql) — not "it compiled"
