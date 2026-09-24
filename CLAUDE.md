# Porter — CLAUDE.md

Porter is a **background services platform** for AI applications. Three pillars: Bridge, Intelligence, Memory. Consumers (YMC, future apps) call Porter — Porter is never the product surface.

Business model: API metering. Any UI is just an API customer.

## Pillars

- **Bridge** — routes AI requests across backends. **Four** failover gateways, all enabled: Claude CLI (`claude_cli`, priority 10), Codex CLI (`codex_cli`, 20), Antigravity CLI (`antigravity_cli`, 30), Grok CLI (`grok_cli`, 40). Failover runs in that priority order. A fifth, **`local_llm`** (Ollama `qwen3:4b-instruct`, priority 90, v6.161.0), is **opt-in only**: it answers only when a caller names it, is never anyone's fallback, and a job sent to it never fails over to a paid gateway (`OPT_IN_ONLY_GATEWAYS` in `failover.ts`). One bridge, many backends. Hub/spoke contract: `BRIDGE.md`. Adapters: `backend/src/services/bridge/adapters/`.
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

## Design System — Non-Negotiable

The admin SPA at askporter.app has one design system. Every UI change uses it; nothing is freehanded.
Load the skill `design-system-guard` before touching any `.tsx` or `.css` in `admin/frontend.archived/`.

- **Token truth:** `admin/frontend.archived/app/app.css` (`:root` values, mapped to Tailwind names in
  `@theme inline`). Geist, indigo `--accent-porter` `#4F46E5`, light only. No hex, `rgb()`, default
  Tailwind palette (`bg-blue-500`), `text-[13px]` or `dark:` in feature code.
- **Primitives:** shadcn, in `admin/frontend.archived/app/components/ui/` (registered by
  `components.json`). Use a component or variant before writing markup. A missing one is added to
  `components/ui/` and shown on the `/design-system` route (`app/routes/design-system.tsx`, the living
  style guide), then used.
- **The ratchet:** `ds-ratchet` (`_ops/bin/ds-ratchet.mjs`) counts freehand styling per file against
  `.ds-baseline.json`, configured by `.ds-ratchet.json` at the repo root. A count may fall and may never
  rise; a new file starts at zero. It runs in `deploy/git-hooks/pre-commit`, in `ship`, and after every
  Claude edit. When it refuses, use the component or token it names. Never raise the baseline, never add
  an exemption to get past it. After a conversion, `ds-ratchet --write` lowers the baseline.

## Verification — Before Claiming Done

- [ ] `npx tsc --noEmit` zero errors
- [ ] Service restarted, `/health` returns current version
- [ ] Actual change tested (curl, browser, psql) — not "it compiled"
