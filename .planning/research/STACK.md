# Stack Research

**Domain:** AI Orchestration SaaS Platform (multi-agent, collaborative, external integrations)
**Researched:** 2026-03-20
**Confidence:** MEDIUM-HIGH (core stack HIGH, integration specifics MEDIUM)

---

## Context: What This Covers

Porter already has a working stack: Python monolith + React 19 + Vite 8 + Tailwind 4 + Drizzle + better-sqlite3 + Fastify 5 (reference-only). This research focuses on what's **needed to activate and extend** the Fastify backend for new features:

- Guided project creation (agent-driven wizard)
- Autonomous agent scheduling (cron + event-driven)
- Collaborative sessions (multi-user real-time presence)
- External connections (GitHub, Mail, Calendar)
- WhatsApp integration (bidirectional, agent-specific)
- Gradual migration from porter.py to Fastify (strangler fig)

Everything already installed (Fastify, Drizzle, Zod, better-sqlite3, React Query, Zustand) is confirmed working and should NOT be replaced.

---

## Recommended Stack

### Core Technologies (already installed — keep)

| Technology | Version | Purpose | Why Keep |
|------------|---------|---------|----------|
| Fastify | 5.7.4 | HTTP server for new backend | Fastest Node.js framework, excellent TypeScript support, plugin architecture fits module-by-module migration |
| Drizzle ORM | 0.45.1 | Database abstraction | Type-safe SQL that maps 1:1 with schema, no magic, easy SQLite → PostgreSQL path |
| better-sqlite3 | 12.6.2 | SQLite driver | Synchronous API performs well under load, no async overhead for simple queries on 2 vCPU |
| Zod | 4.3.6 | Runtime validation | First-class TypeScript inference, integrates with Fastify's schema validation |
| React 19 | 19.2.0 | Frontend UI | Already deployed, concurrent features, server actions if needed later |
| TailwindCSS | 4.2.1 | Styling | Already configured, utility-first fits component-level iteration |
| React Query | 5.90.21 | Server state | Cache invalidation, background refetch, SSE stream support |
| Zustand | 5.0.11 | Client state | Minimal API, works well alongside React Query for auth/UI state |

### New Libraries Needed

#### Agent Scheduling

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| @fastify/schedule | 6.0.0 | Fastify-native job scheduler | Official Fastify plugin, wraps toad-scheduler, integrates into Fastify lifecycle cleanly |
| toad-scheduler | 3.1.0 | Underlying interval/cron engine | TypeScript-native, lightweight, no Redis dependency, runs in-process (fits 2 vCPU VPS) |
| node-schedule | 2.1.1 | Complex cron expressions (backup) | Only needed if you need "run at 3rd Tuesday at 14:20" style schedules; defer until needed |

Use `@fastify/schedule` + `toad-scheduler` for agent heartbeats and recurring workflows. This replaces the Python `_run_if_due()` pattern in the Fastify layer.

**Do NOT use BullMQ** — it requires Redis, which adds another service to manage on a 2 vCPU VPS with 8GB RAM. The current load profile (single-tenant, ~10 concurrent users) does not justify Redis.

#### Real-Time Communication

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| @fastify/websocket | 11.2.0 | WebSocket support | Already installed; use for collaborative session presence and agent-to-agent events |
| @fastify/sse | (built-in) | Server-Sent Events | Use existing SSE pattern (already works in porter.py) for AI response streaming |

**Pattern decision:** Keep SSE for AI response streaming (unidirectional, works over HTTP/1.1, no protocol upgrade). Use WebSocket only for collaborative session presence (bidirectional: user joins/leaves, cursor updates). Do not consolidate — they serve different purposes.

#### GitHub Integration

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| octokit | 5.0.5 | GitHub REST + GraphQL API client | Official GitHub SDK, TypeScript-first, full API coverage, handles auth and pagination |
| @fastify/oauth2 | 8.2.0 | OAuth2 flow for GitHub auth | Official Fastify plugin, requires @fastify/cookie (already installed) |

Use `@fastify/oauth2` to handle the GitHub OAuth2 authorization code flow. Use `octokit` for all subsequent GitHub API calls (repos, issues, PRs, commits). Octokit handles token refresh and retry automatically.

#### Mail Integration

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| nodemailer | 8.0.3 | Send emails (SMTP) | Most widely deployed Node.js email library, zero runtime deps, TypeScript support |
| imapflow | 1.2.16 | Read emails (IMAP) | Modern Promise-based IMAP client from the nodemailer ecosystem, supports OAuth2, built-in IDLE for push notifications |

Use `nodemailer` for outbound (transactional, agent notifications). Use `imapflow` for inbound (reading inbox, triggering agent tasks from email). Both support OAuth2 for Gmail/Outlook — do NOT store raw passwords.

#### Calendar Integration

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| googleapis | 171.4.0 | Google Calendar API | Official Google SDK, handles OAuth2 token refresh, full Calendar API coverage |

For Microsoft 365 Calendar, use `@microsoft/microsoft-graph-client` when needed (defer until user demand). For now, Google Calendar via `googleapis` covers the primary use case.

**Note:** Store OAuth2 refresh tokens in the `workspace_connections` table (already exists). Never store credentials in porter_config.json.

#### WhatsApp Integration

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| whatsapp (official SDK) | 0.0.5-Alpha | WhatsApp Cloud API client | Official Meta SDK; **however**, this is Alpha and incomplete |

**WhatsApp is a special case.** The official SDK is in Alpha (0.0.5). The recommended path:

1. **Phase 1:** Call the WhatsApp Cloud API directly via `fetch`/`axios` — the API is stable even if the SDK is not. Use the REST API at `https://graph.facebook.com/v21.0/` with a bearer token from a WhatsApp Business Account.
2. **Phase 2:** Adopt the official SDK once it reaches stable release.

Do NOT use `whatsapp-web.js` — it works by automating WhatsApp Web via Puppeteer, violates Terms of Service, and will get numbers banned.

**WhatsApp webhook:** Use a Fastify route as the webhook receiver. Meta sends POST events to your endpoint. Requires a public-facing URL (the VPS needs to be accessible at port 443 or behind nginx/caddy).

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| tsx | 4.21.0 | TypeScript execution in dev | Already installed, use for `backend/src/index.ts` dev server |
| drizzle-kit | latest | Schema migrations and introspection | Run `npx drizzle-kit generate` after schema changes, `npx drizzle-kit migrate` to apply |
| Playwright | 1.58.2 | E2E regression suite | 35 tests must stay green throughout migration |

---

## Migration Stack: Strangler Fig Pattern

The migration from `porter.py` to Fastify uses the Strangler Fig pattern: a routing layer intercepts requests and forwards them either to porter.py (existing) or Fastify (new). Over time, Fastify handles more routes and porter.py shrinks.

**Routing strategy:**

```
Browser → porter.py (port 8877)
  → If route is NEW (in Fastify): proxy to localhost:3001
  → If route is LEGACY: handle in porter.py
```

porter.py already has `_proxy_to_backend()` capability. New Fastify routes are registered at `/api/v2/` to avoid collision with legacy `/api/` routes. Frontend calls both during migration.

**Migration order:**
1. Agent scheduling (new feature — Fastify first)
2. Connections endpoints (new feature — Fastify first)
3. Projects API (migrated — highest debt, highest value)
4. Chat API (last — most complex, most tested)

---

## Database Migration Path

Current: `better-sqlite3` via Drizzle ORM.
Future: PostgreSQL when concurrent writes become a bottleneck (>50 concurrent users writing simultaneously).

**Why not migrate to PostgreSQL now:** The 2 vCPU/8GB VPS would need to run PostgreSQL alongside Node.js and Python. SQLite in WAL mode handles the current load profile without issue. Drizzle ORM makes the future migration surgical — change driver, update schema dialect, run migrations.

**When to migrate to PostgreSQL:** When `PRAGMA wal_checkpoint` becomes a bottleneck in logs, or when you add more than 2 server instances.

---

## Installation

```bash
# Agent scheduling (add to backend/package.json)
npm install @fastify/schedule toad-scheduler

# GitHub integration
npm install octokit @fastify/oauth2

# Mail integration
npm install nodemailer imapflow
npm install -D @types/nodemailer

# Calendar integration
npm install googleapis

# WhatsApp (direct API approach — no SDK needed for Phase 1)
# Just use fetch or axios (already installed)
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| @fastify/schedule + toad-scheduler | BullMQ | BullMQ requires Redis; adds operational complexity on a 2 vCPU VPS; current load doesn't justify it |
| @fastify/schedule + toad-scheduler | Trigger.dev | Managed cloud service; adds external dependency and cost; Porter should be self-contained |
| toad-scheduler | node-cron | node-cron has less TypeScript integration; toad-scheduler is the official dependency behind @fastify/schedule |
| better-sqlite3 (keep) | libSQL/Turso | Turso is cloud-hosted SQLite; adds network latency and external dependency; benchmarks show better-sqlite3 is faster for read-heavy workloads |
| SSE for AI streaming | WebSocket for AI streaming | SSE is simpler, works over HTTP/1.1, auto-reconnects natively, less overhead; WebSocket is reserved for bidirectional presence |
| octokit | @octokit/rest | octokit v5 is the batteries-included version; @octokit/rest is lower-level and requires more wiring |
| imapflow | node-imap | node-imap is unmaintained (last commit 2019); imapflow is actively maintained and from the nodemailer ecosystem |
| googleapis | custom OAuth + fetch | googleapis handles token refresh, retry, and pagination automatically; reimplementing is error-prone |
| Direct WhatsApp REST API | whatsapp-web.js | whatsapp-web.js violates Meta ToS, uses Puppeteer (memory-heavy), unreliable |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| BullMQ | Requires Redis; adds ~200MB RAM overhead on constrained VPS | @fastify/schedule + toad-scheduler |
| whatsapp-web.js | ToS violation, Puppeteer memory bloat, number ban risk | WhatsApp Cloud API via fetch/official SDK |
| Prisma | Heavy ORM with migration-generate complexity; Drizzle already installed and lighter | Drizzle ORM (already in use) |
| Socket.IO | Heavy abstraction over WebSocket with reconnection complexity; @fastify/websocket is simpler | @fastify/websocket (already installed) |
| express | Fastify is already the new backend target; mixing frameworks creates confusion | Fastify 5 |
| agenda | MongoDB-backed job scheduler; Porter has no MongoDB and no plans for it | @fastify/schedule + toad-scheduler |
| NestJS | Full framework rewrite; Porter is already built on Fastify | Fastify 5 (already in use) |
| libSQL / Turso | Adds network hop; benchmarks show better-sqlite3 is ~100x faster on some queries | better-sqlite3 (already in use) |

---

## Stack Patterns by Feature

**Agent autonomous scheduling:**
- Use `@fastify/schedule` to register named jobs at Fastify startup
- Jobs call the same business logic functions used by HTTP handlers
- Jobs persist state to `workflow_stats` table (already exists in schema)
- Fastify's graceful shutdown hooks stop scheduled jobs cleanly

**Collaborative sessions (multi-user):**
- WebSocket connection per user session joining a project
- Server broadcasts presence events (user_joined, user_left, agent_working)
- No WebSocket message persistence — presence is ephemeral
- Chat messages still go via POST /api/chat (not WebSocket)

**OAuth2 connection flow (GitHub, Google):**
- @fastify/oauth2 registers `/auth/github/start` and `/auth/github/callback` routes
- Callback stores access_token + refresh_token in `workspace_connections` table
- All subsequent API calls use stored tokens
- Token refresh handled by octokit / googleapis libraries automatically

**WhatsApp bidirectional:**
- Outbound: POST to WhatsApp Cloud API (`https://graph.facebook.com/v21.0/{phone_number_id}/messages`)
- Inbound: Fastify webhook route receives POST from Meta, validates signature, routes to agent
- Agent-specific numbers: each agent can have a dedicated WhatsApp phone number mapped in DB

**Strangler fig routing:**
- All new routes live at `/api/v2/` prefix in Fastify
- porter.py detects `/api/v2/` prefix and proxies to `localhost:3001`
- Frontend conditionally calls v2 endpoints as they come online
- No breaking changes to existing `/api/` routes until explicitly migrated

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| @fastify/schedule@6.0.0 | Fastify@5.x | Requires Fastify 5; incompatible with Fastify 4 |
| toad-scheduler@3.1.0 | Node.js 18+ | Peer dependency of @fastify/schedule |
| @fastify/oauth2@8.2.0 | Fastify@5.x, @fastify/cookie@11 | Requires @fastify/cookie registered first (already installed at v11.0.2) |
| octokit@5.0.5 | Node.js 18+ | Requires `"moduleResolution": "node16"` in tsconfig |
| nodemailer@8.0.3 | Node.js 18+ | Major version 8; API is stable, no breaking changes from v7 except TypeScript types |
| imapflow@1.2.16 | Node.js 18+ | From nodemailer ecosystem, compatible with nodemailer 8 |
| googleapis@171.4.0 | Node.js 18+ | Large package (~40MB); tree-shake or use individual @googleapis/* packages |

---

## Sources

- npmjs.com registry — versions verified for bullmq (5.71.0), node-schedule (2.1.1), octokit (5.0.5), nodemailer (8.0.3), imapflow (1.2.16), whatsapp (0.0.5-Alpha), googleapis (171.4.0), @fastify/oauth2 (8.2.0), toad-scheduler (3.1.0), @fastify/schedule (6.0.0), ioredis (5.10.1) — HIGH confidence
- [BullMQ Redis requirement discussion](https://github.com/taskforcesh/bullmq/discussions/2412) — confirms Redis is non-optional — HIGH confidence
- [toad-scheduler GitHub](https://github.com/kibertoad/toad-scheduler) — TypeScript-native, no Redis, in-memory — HIGH confidence
- [WhatsApp Nodejs SDK GitHub](https://github.com/WhatsApp/WhatsApp-Nodejs-SDK) — official SDK is 0.0.5-Alpha — HIGH confidence
- [Octokit v5 GitHub](https://github.com/octokit/octokit.js/) — all-batteries-included SDK — HIGH confidence
- [ImapFlow docs](https://imapflow.com/) — modern IMAP client from nodemailer ecosystem — HIGH confidence
- [better-sqlite3 vs libsql benchmark](https://sqg.dev/blog/sqlite-driver-benchmark) — better-sqlite3 ~100x faster on some queries — MEDIUM confidence (single benchmark)
- [Strangler Fig pattern — AWS prescriptive guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/strangler-fig.html) — confirms routing layer approach — HIGH confidence
- [SSE vs WebSocket for AI streaming](https://dev.to/polliog/server-sent-events-beat-websockets-for-95-of-real-time-apps-heres-why-a4l) — SSE preferred for unidirectional streaming — MEDIUM confidence (community post, consistent with other sources)
- [Multi-tenant RBAC Fastify + Drizzle starter](https://arshiash80.com/projects/multi-tenant-rbac-fastify-and-drizzle-api-starter) — confirms Fastify 5 + Drizzle as standard pattern — MEDIUM confidence

---

*Stack research for: AI Orchestration SaaS Platform (Porter)*
*Researched: 2026-03-20*
