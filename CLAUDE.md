# Porter Brain — CLAUDE.md

Porter Brain is the **API backend and database owner**. Together with Porter Admin, this IS the product. Fastify API, PostgreSQL, AI routing, Bridge layer, Memory V3, all business logic.

---

## Project Facts

- **Backend:** `backend/` — Fastify 5, TypeScript, Drizzle ORM
- **Legacy:** `porter.py` — DELETED. Fastify is the sole backend.
- **Port:** `3001`, bound to `127.0.0.1`
- **Service:** `systemctl --user start|stop|restart|status porter-fastify`
- **Service file:** `~/.config/systemd/user/porter-fastify.service`
- **Config:** `porter_config.json` (via `PORTER_DATA_DIR` env var)
- **Database:** PostgreSQL (Drizzle ORM) — Brain owns this, Admin connects to it
- **Tests:** `cd tests && npx playwright test` (35 tests)
- **Version:** v6.1.0

## Monorepo Structure

Porter is a **single monorepo** (`heymoezy/porter`). Brain and Admin live side by side:

| Component | Path | Port | Purpose |
|-----------|------|------|---------|
| **Brain** | `backend/` | :3001 | Fastify API, PostgreSQL, AI Router, Bridge, Memory V3 |
| **Admin** | `admin/backend/` + `admin/frontend/` | :3001 | SaaS control plane, Bridge UI, Intelligence, CRM (served by Brain) |

Business model: API metering. Any future UI/frontend is just an API customer — a separate product.

## Shared Memory System

- **Canonical checkpoint:** `CHECKPOINT.md` (repo root) — all models read/update this
- **Directives table:** operating rules injected into every AI dispatch
- **Concepts table:** project state, searchable via FTS
- **Memory injection:** `backend/src/services/memory-injection.ts` — tiered injection pipeline
- **System prompt:** `backend/src/services/stream-service.ts` — reads directives from DB

## Bridge Layer

Canonical hub/spoke contract: `/home/lobster/projects/porter/BRIDGE.md`

5 gateway adapters in `backend/src/services/bridge/adapters/`:
- OpenClaw (GPT-5.4) — primary strong model, :18789
- Ollama (Qwen 2.5 Coder 1.5B) — local cheap/fast, :11434
- Claude CLI — subprocess
- Codex CLI — subprocess
- Gemini CLI — subprocess

Routing engine, circuit breakers, fallback chains, dispatch logging.

## Architecture — Non-Negotiable Rules

1. **Fresh-start assumption.** First-time user has nothing configured. Must work from zero.
2. **No hardcoding.** No paths, hosts, ports, usernames, tokens, binary locations. Everything from config, env vars, or runtime detection.
3. **Capability detection first.** Detect available tools, services, credentials on startup.
4. **Graceful degradation.** Missing dependency → feature hidden or badged "unavailable".
5. **Explicit environment model.** Know where tools run (local, VPS, container, remote).
6. **Guided bootstrap.** First-run wizard provisions dependencies step by step.
7. **Trust UX.** Show real capability state only. Never label unconfigured features as active.

## Key Directories

```
porter/
├── backend/          <- Brain Fastify API (:3001, TypeScript)
│   ├── src/routes/   <- v1 API endpoints
│   ├── src/services/ <- AI router, Bridge, scheduler, memory
│   └── src/db/       <- Schema, migrations
├── admin/            <- Admin monorepo subfolder
│   ├── backend/      <- Admin Fastify API (merged into :3001)
│   └── frontend/     <- Admin React frontend (Vite, shadcn/ui)
├── drizzle/          <- Drizzle migrations
├── memory/           <- Memory data files
├── personas/         <- Agent persona definitions
├── runtime/          <- Agent runtime
├── tests/            <- 35 Playwright tests
├── research/         <- Architecture/design specs
└── scripts/          <- Helper scripts
```

## Common Commands

```bash
systemctl --user status porter-fastify
systemctl --user restart porter-fastify
cd backend && npm run dev                    # Fastify dev server
cd tests && npx playwright test              # regression
curl http://127.0.0.1:3001/health            # health check
psql -d porter                               # direct DB access
```

## Ship Process — Porter Specific

Every change follows this atomic sequence. Never skip steps:
1. Frontend build: `cd admin/frontend && npx react-router build`
2. Backend build: `cd backend && npm run build`
3. Kill stale processes: `pkill -9 -f "porter/backend"`
4. Wait: `sleep 4`
5. Start: `systemctl --user start porter-fastify`
6. Wait: `sleep 8`
7. Verify: `curl -s http://127.0.0.1:3001/health`

**CRITICAL:** Backend serves frontend static files. If you rebuild frontend without restarting backend, assets 404 and the page goes blank. Always restart after frontend build.

## Verification Checklist — Before Claiming "Done"

- [ ] `npx tsc --noEmit` in backend (or `npm run build`) — zero type errors
- [ ] `npx react-router build` in admin/frontend — builds clean
- [ ] Service restarted and health returns current version
- [ ] Tested the actual change (curl, browser, psql) — not just "it compiled"
