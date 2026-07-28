# Porter — CLAUDE.md

Porter is a **background services platform** for AI applications. Three pillars: Bridge, Intelligence, Memory. Consumers (YMC, future apps) call Porter — Porter is never the product surface.

Business model: API metering. Any UI is just an API customer.

## Pillars

- **Bridge** — routes AI requests across backends. Two registered gateways: Claude CLI (`claude_cli`, priority 10) and Codex CLI (`codex_cli`, priority 20). One bridge, many backends. Hub/spoke contract: `BRIDGE.md`. Adapters: `backend/src/services/bridge/adapters/`.
- **Intelligence** — signal extraction from CLI activity, classification, surfacing. Consumers subscribe.
- **Memory — 3 layers:** Directives (operating rules, high trust) → Concepts (durable truths, high trust, FTS) → Episodes (time-bound, medium), plus **hot context** (`hot_contexts` / `hot_notes`) — the warm packet a session opens with.

### Memory — how it actually reaches a model (read this before touching injection)

There are **two delivery paths, and they are not the same code**:

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

`memory-injection-v2.ts` is a vault-projection mirror of V1 behind a shadow canary. 456 observations
show it token-identical to V1 with zero missing directives — but it has **never actually been injected**
(`observeShadow()` logs `injected='v1'` unconditionally). Decide it or delete it; do not leave the fork.

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
Caddy picks up new files immediately, no restart needed). The lightweight inline
brain-ui on :5176 (`backend/src/routes/brain-ui.ts`) still exists as a secondary
monitoring dashboard served by the same backend process — restart porter-fastify
after a backend rebuild for that one. See `admin/CLAUDE.md` for the full admin
ship story, including the caveat that Caddy's askporter.app routing is currently
an ephemeral admin-API reload (see `_ops/askporter-login-fix.md` for the durable
fix, which needs one sudo line from Moe).

## Verification — Before Claiming Done

- [ ] `npx tsc --noEmit` zero errors
- [ ] Service restarted, `/health` returns current version
- [ ] Actual change tested (curl, browser, psql) — not "it compiled"
