# Porter Brain — CLAUDE.md

Porter Brain is the **API backend and database owner**. It runs the Fastify API, manages PostgreSQL, handles AI routing, and owns all business logic.

---

## Project Facts

- **Backend:** `backend/` — Fastify 5, TypeScript, Drizzle ORM
- **Legacy:** `porter.py` (single file, stdlib only, ~900KB, being deprecated)
- **Port:** `8877`, bound to `127.0.0.1` only
- **Service:** `systemctl --user start|stop|restart|status porter`
- **Service file:** `~/.config/systemd/user/porter.service`
- **Config:** `porter_config.json` (via `PORTER_DATA_DIR` env var)
- **Database:** PostgreSQL (Drizzle ORM) — Brain owns this, siblings connect to it
- **Tests:** `cd tests && npx playwright test` (35 tests)

## Sibling Repos

| Repo | Port | Purpose |
|------|------|---------|
| **Porter UI** (`heymoezy/porter-ui`) | :5174 | User product frontend |
| **Porter Admin** (`heymoezy/porter-admin`) | :5175 / :5180 | SaaS control plane + dev tools |
| **Porter Brain** (`heymoezy/porter`) | :8877 | This repo — API, DB, AI router |

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
├── backend/          <- Fastify API (TypeScript)
│   ├── src/routes/   <- v1 API endpoints
│   ├── src/services/ <- AI router, scheduler, integrations
│   └── src/db/       <- Schema, migrations
├── porter.py         <- Legacy monolith (being deprecated)
├── drizzle/          <- Drizzle migrations
├── memory/           <- Memory V2 data
├── personas/         <- Agent persona definitions
├── runtime/          <- Agent runtime
├── tests/            <- 35 Playwright tests
├── research/         <- Architecture/design specs
└── scripts/          <- Helper scripts
```

## Dependencies

### openclaw + Qwen Local Bridge
- **Gateway:** `http://127.0.0.1:18789`, auth token `lobster-2026`
- **Local Ollama:** `http://127.0.0.1:11434`, model `qwen2.5-coder:1.5b`

## Release Governance

1. No route handler changes without design review.
2. 35-test regression pass required before commit.
3. Version must match in all strings (docstring, badge, startup, SSE, health, changelog).
4. Ship process: version bump -> git add + commit -> push -> restart -> verify health -> update projects.md.

## Common Commands

```bash
systemctl --user status porter
systemctl --user restart porter
cd backend && npm run dev                    # Fastify dev server
cd tests && npx playwright test              # regression
curl http://127.0.0.1:11434/api/tags         # list Ollama models
```
