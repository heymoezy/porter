# Porter Admin — CLAUDE.md

## Identity
Porter Admin is the **SaaS control plane** — platform management + dev tools. This is NOT the user-facing product.

## Stack
- **Backend:** Fastify 5, TypeScript, raw PostgreSQL (pg pool)
- **Frontend:** React 19, React Router 7 (SPA), Tailwind CSS 4, shadcn/ui

## Ports
- **:5175** — Admin backend (Fastify) serving production build + API
- **:5176** — Frontend dev server (Vite) — dev only, proxies API to :5175
- **:3001** — Porter Brain Fastify backend (sibling at `../backend/`)
- Connects to Brain's PostgreSQL at `postgresql://lobster:porter@127.0.0.1:5432/porter`

## Commands
```bash
# Production (default)
cd backend && npx tsx src/index.ts   # Serves on :5175 (API + static frontend)

# Development (when editing frontend)
cd frontend && npm run dev           # Vite on :5176, proxies to :5175

# Build frontend
cd frontend && npx react-router build  # Output to build/client/
```

## Pages
### Dashboard
Command Center (standalone)

### Business
Customers, Revenue

### Agents
Forge, Skills, Tools, Org Chart, Email

### Ops
Brain, Bridge, Recall, Activity, Diagnostics

### Dev
Design System, Files, Architecture, Changelog

### Settings
Account, system info

## Rules
- Admin reuses product UI patterns — same shell, logo, nav style, theme toggle
- Never reinvent shared UI — import from product design system
- All admin API routes require auth (cookie-based, platform_admin only)
- No polling — use SSE for real-time updates, fetch once otherwise

## Monorepo Layout
This is part of the Porter monorepo (`heymoezy/porter`). Working dir: `/home/lobster/projects/porter/admin/`.
- **Brain:** `../backend/` — Fastify API, :3001, owns PostgreSQL
- **Admin:** this directory (`admin/backend/` + `admin/frontend/`)
