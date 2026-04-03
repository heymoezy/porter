# Porter

AI orchestration platform. Single monorepo (`heymoezy/porter`).
Canonical Bridge contract: `BRIDGE.md` at repo root.

## Components

| Component | Port | Path |
|-----------|------|------|
| Brain + Admin (single Fastify process) | :3001 | `backend/` + `admin/` |

Business model: API metering. Any future UI/frontend is an API customer.

## Architecture
```
API Consumers -> Porter (:3001) -> PostgreSQL
                      |
                 Bridge Layer
                      |
        +-------------+-------------+
        |    |    |    |    |
   OpenClaw Ollama Claude Codex Gemini
```

## Development
```bash
cd backend && npm install && npm run dev   # Fastify API on :3001
```

## Tech Stack
Fastify 5 . TypeScript . Drizzle ORM . PostgreSQL 16
