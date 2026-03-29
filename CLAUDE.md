# Porter Brain — CLAUDE.md

Porter Brain is the **API backend and database owner**. Together with Porter Admin, this IS the product. Fastify API, PostgreSQL, AI routing, Bridge layer, Memory V3, all business logic.

---

## Project Facts

- **Backend:** `backend/` — Fastify 5, TypeScript, Drizzle ORM
- **Legacy:** `porter.py` (deprecated, ~900KB, do not modify)
- **Port:** `3001`, bound to `127.0.0.1`
- **Service:** `systemctl --user start|stop|restart|status porter-fastify`
- **Service file:** `~/.config/systemd/user/porter-fastify.service`
- **Config:** `porter_config.json` (via `PORTER_DATA_DIR` env var)
- **Database:** PostgreSQL (Drizzle ORM) — Brain owns this, Admin connects to it
- **Tests:** `cd tests && npx playwright test` (35 tests)
- **Version:** v3.3.2

## Monorepo Structure

Porter is a **single monorepo** (`heymoezy/porter`). Brain and Admin live side by side:

| Component | Path | Port | Purpose |
|-----------|------|------|---------|
| **Brain** | `backend/` | :3001 | Fastify API, PostgreSQL, AI Router, Bridge, Memory V3 |
| **Admin** | `admin/backend/` + `admin/frontend/` | :5175 | SaaS control plane, Bridge UI, Intelligence, CRM |

Business model: API metering. Any future UI/frontend is just an API customer — a separate product.

## Shared Memory System

- **Canonical checkpoint:** `tasks/checkpoint.md` — all models read/update this
- **Directives table:** operating rules injected into every AI dispatch
- **Concepts table:** project state, searchable via FTS
- **Memory injection:** `backend/src/services/memory-injection.ts` — tiered injection pipeline
- **System prompt:** `backend/src/services/stream-service.ts` — reads directives from DB

## Bridge Layer

Canonical hub/spoke contract: `/home/lobster/documents/porter/BRIDGE.md`

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
│   ├── backend/      <- Admin Fastify API (:5175, TypeScript)
│   └── frontend/     <- Admin React frontend (Vite, shadcn/ui)
├── porter.py         <- Legacy monolith (DEPRECATED)
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
