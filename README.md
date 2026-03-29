# Porter

AI orchestration platform. Single monorepo (`heymoezy/porter`).
Canonical Bridge contract: `BRIDGE.md` at repo root.

## Components

| Component | Port | Path |
|-----------|------|------|
| Brain (Fastify API) | :3001 | `backend/` |
| Admin (SaaS control plane) | :5175 | `admin/` |

Business model: API metering. Any future UI/frontend is an API customer.

## Architecture
```
API Consumers -> Porter Brain (:3001) -> PostgreSQL
                      ^         |
Porter Admin (:5175) -+    Bridge Layer
                            |
                  +---------+---------+
                  |    |    |    |    |
               OpenClaw Ollama Claude Codex Gemini
```

## Development
```bash
cd backend && npm install && npm run dev   # Fastify API on :3001
```

## Tech Stack
Fastify 5 . TypeScript . Drizzle ORM . PostgreSQL 16

## Legacy
`porter.py` — Original Python monolith (~900KB). Deprecated.
