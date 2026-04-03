# Porter

AI orchestration platform. Self-hosted SaaS that manages workers, projects, models, chat, and memory across multiple AI backends.

## What It Does

Porter is the AI orchestrator that runs on your machine -- routing requests across multiple AI models, injecting persistent memory into every call, managing failovers, and coordinating agents. You install it once, connect your API keys, and every AI tool on your machine becomes part of one intelligent system.

The web interface is the window into what Porter is doing. Gateway health, dispatch logs, costs, memory, agent activity -- all visible in real-time at `/admin`.

## The 3 Pillars

- **Bridge** -- The hub. Every AI model plugs into Porter through a smart router that decides which model handles each request based on capability, cost, and health.
- **Forge** -- The factory. Create AI agents from templates, train them on your domain, and evolve them over time based on feedback and real dispatch data.
- **Recall** -- The shared brain. Directives, concepts, episodes, and signals -- a tiered memory system that ensures no model starts cold.

## Stack

- **Backend:** Fastify 5, TypeScript, Drizzle ORM, PostgreSQL 16
- **Admin UI:** React 19, React Router 7, Tailwind CSS 4, shadcn/ui
- **Legacy:** `porter.py` — DELETED (was ~900KB Python monolith, fully replaced by Fastify)
- **Repo:** `heymoezy/porter` (single monorepo)
- **Port:** `:3001` (single Fastify process serves API + Admin UI)

## Revenue Model

Usage-based. Bring your own API keys. Porter charges for the orchestration layer -- routing intelligence, memory injection, agent coordination, dispatch logging -- not the raw tokens.

| Tier | Price | Dispatches | Agents |
|------|-------|------------|--------|
| Free | $0 | 500/mo | 2 |
| Pro | $29/mo | 25K/mo | 10 |
| Team | $99/mo + $19/seat | 100K/mo | 50 |
| Enterprise | Custom | Custom | Custom |

~95% gross margin. A dispatch costs a database query and an HTTP redirect.

## Key Paths

```
porter/
  backend/           Brain Fastify API (:3001) — sole running process, serves Admin UI
  admin/backend/     Admin routes (merged into Brain :3001)
  admin/frontend/    Admin React frontend (Vite, shadcn/ui) — built to backend/public/
  drizzle/           Drizzle migrations
  skills/            207 skill packs across 20 categories
  personas/          Agent persona definitions
  tests/             35 Playwright tests
  research/          Architecture/design specs
  scripts/           Helper scripts
```

## Status

- **Type:** Software product
- **Status:** Active -- Alpha
- **Version:** v5.2.0
- **Start date:** Feb 18, 2026
