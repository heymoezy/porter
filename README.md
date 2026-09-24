# Porter

AI orchestration platform. Single monorepo (`heymoezy/porter`).
Canonical Bridge contract: `BRIDGE.md` at repo root.

## Components

| Component | Port | Path |
|-----------|------|------|
| Brain (headless Fastify API) | :3001 | `backend/` |
| Admin SPA (askporter.app, static build served by Caddy) | — | `admin/frontend.archived/` |

The brain-ui on :5176 was deleted in v6.61.0. The admin SPA in `admin/frontend.archived` (the name is historical) is live at askporter.app.
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
