# Porter

AI orchestration platform. Single monorepo (`heymoezy/porter`).
Canonical Bridge contract: `BRIDGE.md` at repo root.

## Components

| Component | Port | Path |
|-----------|------|------|
| Brain (headless Fastify API) | :3001 | `backend/` |
| Brain UI (inline dashboard) | :5176 | `backend/src/routes/brain-ui.ts` |

Headless since 2026-07-04 — the old admin SPA is archived at `admin/frontend.archived`.
Business model: API metering. Any future UI/frontend is an API customer.

## Architecture
```
API Consumers -> Porter (:3001) -> PostgreSQL
                      |
                 Bridge Layer
                      |
              +-------+-------+
              |               |
         Claude CLI       Codex CLI
```

## Development
```bash
cd backend && npm install && npm run dev   # Fastify API on :3001
```

## Tech Stack
Fastify 5 . TypeScript . Drizzle ORM . PostgreSQL 16
