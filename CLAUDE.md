# Porter — CLAUDE.md

Porter is a **background services platform** for AI applications. Three pillars: Bridge, Intelligence, Memory. Consumers (YMC, future apps) call Porter — Porter is never the product surface.

Business model: API metering. Any UI is just an API customer.

## Pillars

- **Bridge** — routes AI requests across backends (OpenClaw/GPT-5.4, Ollama, Claude CLI, Codex CLI, Gemini CLI). One bridge, many backends. Hub/spoke contract: `BRIDGE.md`. Adapters: `backend/src/services/bridge/adapters/`.
- **Intelligence** — signal extraction from CLI activity, classification, surfacing. Consumers subscribe.
- **Memory V2 — 4 layers:** Directives (operating rules, high trust) → Concepts (durable truths, high trust, FTS) → Episodes (time-bound, medium) → Signals (low trust, awaiting promotion). Tiered injection with token cap. Pipeline: `backend/src/services/memory-injection.ts`.

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

1. `cd admin/frontend && npx react-router build` (if frontend touched)
2. `cd backend && npm run build`
3. `pkill -9 -f "porter/backend"; sleep 4`
4. `systemctl --user start porter-fastify; sleep 8`
5. `curl -s http://127.0.0.1:3001/health` → expect current version
6. Update `CHECKPOINT.md`

Backend serves frontend statics. Rebuild without restart = blank screen. Always restart.

## Verification — Before Claiming Done

- [ ] `npx tsc --noEmit` zero errors
- [ ] Service restarted, `/health` returns current version
- [ ] Actual change tested (curl, browser, psql) — not "it compiled"
