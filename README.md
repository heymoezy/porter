# Porter Brain

API backend and database owner for Porter — the AI orchestration platform.

## Port Map
| Service | Port | Repo |
|---------|------|------|
| Porter Brain | :8877 | `heymoezy/porter` |
| Porter UI | :5174 | `heymoezy/porter-ui` |
| Porter Admin | :5175 / :5180 | `heymoezy/porter-admin` |

## Architecture
```
Browser -> Porter UI (:5174) -> Porter Brain (:8877) -> SQLite (porter.db)
                                     ^
         Porter Admin (:5175) -------+
```

## Development
```bash
cd backend && npm install && npm run dev   # Fastify API on :8877
```

## Tech Stack
Fastify 5 . TypeScript . Drizzle ORM . SQLite (WAL) . better-sqlite3

## Legacy
`porter.py` — Original Python monolith (~900KB). Being deprecated via strangler fig pattern.
