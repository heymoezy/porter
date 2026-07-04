# Porter

AI orchestration platform. Self-hosted SaaS that manages workers, projects, models, chat, and memory across multiple AI backends.

## What It Does

Porter is the AI orchestrator that runs on your machine -- routing requests across multiple AI models, injecting persistent memory into every call, managing failovers, and coordinating agents. You install it once, connect your API keys, and every AI tool on your machine becomes part of one intelligent system.

Porter is headless (admin SPA archived 2026-07-04). The inline brain-ui dashboard on `:5176` shows memory, learning flow, and recent intellect events; everything else is API-first (`/api/v1/*`, `/api/admin/*`).

## The Pillars

- **Bridge** -- The hub. AI requests route through a smart router across the registered gateways (Claude CLI, Codex CLI) based on capability, cost, and health.
- **Recall** -- The shared brain. Directives, concepts, and episodes -- a tiered memory system that ensures no model starts cold.

## Stack

- **Backend:** Fastify 5, TypeScript, Drizzle ORM, PostgreSQL 16
- **Legacy:** `porter.py` — DELETED (was ~900KB Python monolith, fully replaced by Fastify); admin React SPA — ARCHIVED (`admin/frontend.archived`, 2026-07-04)
- **Repo:** `heymoezy/porter` (single monorepo)
- **Port:** `:3001` (headless Fastify API) + `:5176` (inline brain-ui)

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
  backend/           Brain Fastify API (:3001) — sole running process (admin routes at backend/src/routes/admin/)
  admin/frontend.archived/  Old admin React SPA — archived 2026-07-04, not served
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
- **Version:** v6.0.0
- **Start date:** Feb 18, 2026
