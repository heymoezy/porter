# Porter Admin

Part of the Porter monorepo (`heymoezy/porter`). SaaS control plane for Porter — the AI orchestration platform.

## Port Map
| Service | Port | Path |
|---------|------|------|
| Admin Backend (Fastify) | :5175 | `admin/backend/` |
| Admin Frontend (Vite dev) | :5176 | `admin/frontend/` |
| Brain Backend (Fastify) | :3001 | `backend/` (sibling) |

## Development
```bash
# Backend
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

## Pages
- **Platform:** Dashboard, Customers, Revenue, Porter, Templates, Agents, Skills, Models, Tools
- **Ops:** Activity, Diagnostics, System, Email
- **Dev:** Architecture, Design System, Migration Status

## Tech Stack
Fastify 5 · React 19 · React Router 7 · TypeScript · Tailwind CSS 4 · shadcn/ui · PostgreSQL (shared with Brain)
