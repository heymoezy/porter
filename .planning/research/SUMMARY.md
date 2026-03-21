# Project Research Summary

**Project:** Porter v2.0 Backend Ready
**Domain:** AI Orchestration SaaS Platform — Fastify/Drizzle/SQLite backend extension
**Researched:** 2026-03-21
**Confidence:** HIGH

## Executive Summary

Porter v2.0 is a backend-only expansion of an existing, functioning AI orchestration platform. The foundation (Fastify 5.7.4, Drizzle ORM, SQLite WAL, cookie-based auth, SSE hub, AI router, billing service skeleton) is already in production. This research covers 10 feature groups added on top: native streaming, collaborative sessions, unified chat, CRM, file associations, agent templates, autonomous learning, billing enforcement, error capture, and OpenAPI documentation. The consensus recommendation is a strangler-fig extension — add new tables, new routes, and new services without disturbing the existing 17 v1 route groups or the porter.py Python monolith that still owns memory and SSE broadcast.

The recommended approach sequences around three hard dependency rules: schema migrations precede routes that use them, auth extensions precede routes that use them, and billing enforcement must come last because it touches every request. API standardization (envelopes, error codes, OpenAPI spec) and error capture come first — they are zero-dependency and make all subsequent work more debugable and consistent. Streaming chat follows immediately because it unblocks the frontend-v2 experience. Collaborative sessions, unified chat, and CRM form the social core, each building on the previous. Agent templates, autonomous learning, and finally billing enforcement close out the v2.0 scope.

The dominant risks are architectural rather than implementational. Block-dump streaming (proxying through porter.py instead of calling AI backends directly), cross-project IDOR vulnerabilities from missing project-scope RBAC checks, webhook idempotency failures in billing, race conditions in plan limit enforcement, and GDPR exposure from autonomous learning are all critical. Every one of them is a "looks done but isn't" failure — the code appears to work in testing and breaks silently in production. Each has a clear mitigation pattern documented in PITFALLS.md.

## Key Findings

### Recommended Stack

The existing stack requires only 4-5 new npm packages. Everything else is schema additions and new route files using existing infrastructure. The Fastify 5.7.4 + Drizzle 0.45.1 + better-sqlite3 12.6.2 + Zod 4.3.6 core is stable and should not be changed.

**New libraries needed:**
- `ollama` (0.6.3): Official Ollama JS SDK — enables native AsyncIterable token streaming; replaces the porter.py proxy for Ollama calls
- `@fastify/swagger` (9.7.0) + `@fastify/swagger-ui` (5.2.5) + `fastify-type-provider-zod` (6.1.0): Auto-generated OpenAPI spec from existing Zod schemas; low effort, high value signal for enterprise buyers
- `@fastify/rate-limit` (10.3.0): Per-plan API rate limiting with async max function; plugs into existing `resolvePlan()` in billing service
- `cheerio` (1.2.0): Lightweight HTML parsing for autonomous learning; no headless browser needed on the 2 vCPU VPS

**Optional quality upgrade:** `@lemonsqueezy/lemonsqueezy.js` (4.0.0) — the existing raw-fetch billing implementation works; adopt the official SDK when refactoring billing.ts in the billing phase.

**What NOT to add:** Playwright/Puppeteer (headless browser kills the VPS), BullMQ/Redis (toad-scheduler is sufficient), LangChain (40MB+ for routing Porter already handles), Socket.IO (@fastify/websocket is installed and sufficient), any external error monitoring service (self-hosted is the architecture decision).

### Expected Features

**Must have (table stakes):**
- Token-by-token streaming chat — every major AI product streams; spinners feel broken in 2026
- Stream cancellation — users click stop; not cancelling burns tokens and degrades trust
- Consistent API response envelopes — `{ok, data, error}` across all 17 route groups (not just new ones)
- Meaningful error codes — SCREAMING_SNAKE_CASE registry, request IDs in every response header
- Project collaboration via email invite — SaaS growth vector; baseline for every project tool
- Full-text chat history search — no search means no productivity for returning users
- Contact multi-email and multi-phone — single-value CRM fields are an anti-pattern
- File upload with entity association — files must be findable from the context they were uploaded in
- Frontend error capture endpoint — production frontend bugs are invisible without it
- Subscription management self-serve — required to operate as SaaS

**Should have (competitive differentiators):**
- Per-project RBAC (view/chat/edit/admin) — more granular than any major competitor
- External channels (WhatsApp, email) surfaced in unified chat — genuinely novel, no competitor does this
- AI-powered contact analysis from interaction history — agent-native CRM, not a lookup service
- Agent-authored concepts from web/GitHub/Reddit learning — rare in production, drives retention
- Metered billing with hard/soft enforcement — transparent, sustainable, revenue-aligned
- OpenAPI spec auto-generated from routes — enables SDK generation, signals maturity
- 100 agent templates with category search — quality matters more than count; ship 30 excellent ones first

**Defer to v2+:**
- Real-time presence indicators (WebSocket burden on 2 vCPU VPS)
- Agent-to-agent debate loops (non-technical users cannot interpret; AutoGen admits this)
- 1000+ connector marketplace (maintenance burden; depth over breadth)
- External contact enrichment via ZoomInfo/Clearbit (cost, GDPR, vendor lock)
- Per-message billing to end users (usage anxiety kills engagement)

### Architecture Approach

Porter's Fastify backend extends via new route files and services attached to the existing infrastructure. The `routes/v1/` directory gets 6 new files (errors, collaborators, conversations, contacts, templates, learning) and 3 modified files (chat for streaming, files for associations, billing for enforcement). Services get 2 new files (stream.ts, learning.ts). The DB gets 4 sequential migrations (08-11) with content-addressed IDs. One new plugin (rate-limit.ts) handles billing enforcement as a Fastify decorator.

The critical boundary to maintain: Fastify never writes directly to porter.py's SQLite memory tables. Memory V2 writes from learning sessions go via `POST /api/memory/concepts` HTTP call to porter.py. porter.py owns SSE broadcast for coarse-grained events; Fastify writes streaming chat tokens directly to `reply.raw` (never through the SSE hub — that would add an HTTP round-trip per token, making streaming latency-sensitive throughput collapse).

**Major components:**
1. `services/stream.ts` — `dispatchStream()` extending ai-router.ts; owns the full AI call without proxying; writes tokens directly to reply.raw
2. `plugins/auth.ts` (extended) — adds `requireProjectAccess(minRole)` decorator; all project-scoped route protection goes here, never inline in handlers
3. DB migrations 08-11 — sequential, idempotent, content-addressed IDs (not numbers) to avoid multi-session conflicts
4. `services/learning.ts` — search-summarize-store loop; scheduled asynchronously via agent_jobs, never inline in HTTP handlers; max 20 external requests per session, separate scheduler to avoid blocking main job queue
5. `plugins/rate-limit.ts` — `enforceLimit(dimension)` decorator applied as preHandler on all resource-creating routes; uses `BEGIN EXCLUSIVE` transactions to prevent concurrent plan limit bypass

**Key patterns to follow:**
- Migration discipline: one migration file per feature group; content-addressed IDs (`v2_collab_project_collaborators`), not sequence numbers; schema.ts is backend-session-only
- Service isolation: services import from db/client.ts and other services only; routes never share logic with services
- Envelope consistency: `ok(data)` and `err(code, message)` from lib/envelope.ts on every new route without exception
- SSE emission: `emitSSE()` for coarse-grained events (job complete, collab events, learning complete); direct `reply.raw.write()` for streaming tokens only

### Critical Pitfalls

1. **Block-dump streaming (Pitfall 1)** — the existing GET /api/v1/chat/stream proxies through porter.py and accumulates the full response before forwarding. True streaming requires Fastify calling Ollama/OpenClaw directly via native streaming APIs, forwarding each chunk immediately, checking `reply.raw.write()` backpressure return value, and sending 15-second SSE heartbeats. Test by measuring `time_to_first_token` — it should be under 2 seconds, not equal to total generation time.

2. **Per-project RBAC leaking (Pitfall 3)** — IDOR vulnerability where a collaborator on project A can access project B's endpoints because global role checks pass. Prevention: create `requireProjectAccess(minRole)` middleware in auth.ts that checks `project_collaborators` table for every project-scoped request. Apply via a `registerProjectRoute()` wrapper that makes the minimum role parameter mandatory — impossible to add a route without specifying it.

3. **Webhook idempotency failure (Pitfall 5)** — Lemon Squeezy retries webhooks up to 3 times. The dedup check and event record insert must be in the same SQLite transaction. Respond 200 immediately after the transaction commits; do not make external API calls before responding. Failure produces double subscriptions and double billing.

4. **Plan limit race conditions (Pitfall 6)** — concurrent `POST /api/v1/projects` requests both pass a `COUNT(*)` check, both insert, user ends up with more resources than their plan allows. Mitigation: `enforceLimit()` must use `BEGIN EXCLUSIVE` transaction wrapping the count check and insert atomically. Test with 10 concurrent creation requests; exactly N should succeed where N is the plan limit.

5. **Autonomous learning GDPR exposure (Pitfall 7)** — learning agents that scrape and store author names, @usernames, or email addresses from public pages create a personal data store without legal basis. Strip all personal identifiers before storing as Memory V2 concepts; use official APIs only (not HTML scraping); hard cap of 20 external requests per session, 3 sessions per agent per day; implement robots.txt checking per domain.

6. **Two-session schema drift (Pitfall 8)** — concurrent Claude sessions (backend + frontend-v2) adding migrations with the same sequence number or modifying schema.ts simultaneously. Use content-addressed migration IDs, designate schema.ts as backend-session-only, maintain `.planning/STATE.md` as a coordination document updated before any session starts schema work.

## Implications for Roadmap

Based on combined research, the suggested 7-phase structure:

### Phase 1: Foundation Hardening
**Rationale:** Zero-dependency work that makes every subsequent phase more debugable and consistent. API standardization is identified as the "true Phase 1" in FEATURES.md — inconsistent envelopes create rework debt in every other phase.
**Delivers:** Consistent `{ok, data, error}` envelopes across all 17 route groups; OpenAPI spec auto-generated from Zod schemas; frontend error capture endpoint; migration naming convention documented; `PRAGMA foreign_keys = ON` added to db/client.ts
**Addresses:** API-01, API-02, API-03, OBS-01, OBS-02
**Avoids:** Multi-session schema drift (Pitfall 8 — migration naming established here); invisible frontend bugs during all subsequent phases
**Research flag:** Standard patterns, skip research-phase.

### Phase 2: Streaming Chat
**Rationale:** High value, low dependency. Unblocks frontend-v2's most important UX improvement. The existing SSE hub and AI router are ready — this is an extension, not new infrastructure.
**Delivers:** Native token-by-token streaming from Ollama and OpenClaw via services/stream.ts; client disconnect detection and AbortController propagation to upstream AI backends; 15-second SSE heartbeats; `time_to_first_token < 2s` verified via automated test
**Addresses:** STRM-01, STRM-02, STRM-03
**Avoids:** Block-dump streaming (Pitfall 1); incomplete cancellation that doesn't stop Ollama CPU (Pitfall 2)
**Research flag:** Skip research-phase. Patterns are confirmed in STACK.md and ARCHITECTURE.md. Verify OpenClaw streaming response format via curl before implementation.

### Phase 3: Collaborative Sessions
**Rationale:** Required before unified chat (multi-user conversations need project-scoped roles first). Collaboration is the primary SaaS growth vector — invites drive new user acquisition. auth.ts extension here enables every subsequent social feature.
**Delivers:** `project_collaborators` table; `requireProjectAccess(minRole)` decorator in auth.ts; invitation email flow via existing nodemailer; role management API (4 roles: view/chat/edit/admin); IDOR integration test suite
**Addresses:** COLLAB-01, COLLAB-02, COLLAB-03, COLLAB-04
**Avoids:** Cross-project RBAC leakage (Pitfall 3)
**Research flag:** Skip research-phase. ARCHITECTURE.md has complete implementation detail; middleware pattern is established Fastify.

### Phase 4: Unified Chat and CRM Schema
**Rationale:** Unified chat needs collaborator roles (Phase 3) to enable multi-user history. CRM schema upgrade is low complexity and unblocks AI analysis in Phase 5. Group these because they share the same design principle: build new tables, do not extend old ones.
**Delivers:** New `conversations` + `messages` tables (do not extend existing chats/chat_messages); FTS5 full-text search via raw SQL migration; external channel fan-in from WhatsApp/email inbound handlers; CRM schema with multi-email, multi-phone, social links tables; file_associations pivot table
**Addresses:** CHAT-01, CHAT-02, CHAT-03, CHAT-04, CRM-01, CRM-02, FILE-01, FILE-02, FILE-03
**Avoids:** Unified chat schema that cannot evolve (Pitfall 4); CRM schema sprawl (anti-pattern 3 from ARCHITECTURE.md); orphaned files from non-atomic upload (Pitfall 9)
**Research flag:** Research-phase recommended for unified chat schema design. The polymorphic messages approach is recommended but schema decisions here are hard to reverse without data migration.

### Phase 5: CRM Intelligence and Agent Templates
**Rationale:** CRM AI analysis (CRM-03) requires the interaction history built in Phase 4. Agent templates are a self-contained catalog linking only to the stable agents system. Group them as the "intelligence" phase since both involve LLM-assisted content.
**Delivers:** AI-powered contact analysis dispatched asynchronously via agent_jobs (202 Accepted pattern); async-buffered contact activity timeline with covering index on (contact_id, created_at DESC); 30+ high-quality agent templates with category search; template instantiation with workspace validation (rejects with 422 if required backends/tools unavailable)
**Addresses:** CRM-03, CRM-04, TMPL-01, TMPL-02, TMPL-03
**Avoids:** CRM activity timeline write bottleneck (Pitfall 12); template instantiation producing broken agents (Pitfall 10)
**Research flag:** Skip research-phase. ARCHITECTURE.md has complete detail. Note: writing 30 complete system prompts is the real constraint — plan content creation separately from engineering work.

### Phase 6: Autonomous Learning
**Rationale:** Requires stable agent + job infrastructure (all previous phases), Memory V2 (complete), and the scheduler pattern established in earlier phases. Highest risk phase due to external API dependencies and GDPR constraints — isolated to its own phase.
**Delivers:** `services/learning.ts` with per-domain rate limiting (1 req/sec max); official APIs only (Brave Search API, GitHub API via octokit, Reddit OAuth); 20-request-per-session hard cap; GDPR personal identifier stripping before concept storage; learning session log with sources and confidence scores; separate learningScheduler (does not share main scheduler tick); SSE progress events per learning step
**Addresses:** LEARN-01, LEARN-02, LEARN-03
**Avoids:** Autonomous learning getting Porter banned or triggering GDPR violation (Pitfall 7)
**Research flag:** Research-phase recommended. Verify Brave Search API current pricing and rate limits, Reddit OAuth 2.0 current requirements (post-2023 API changes), and DuckDuckGo JSON API reliability as free fallback.

### Phase 7: Billing Enforcement
**Rationale:** Must be last. Plan enforcement middleware touches every resource-creating request. Building it before other features are stable risks blocking active development with quota errors. BILL-01 webhooks and BILL-02 metering need to run silently before BILL-03 enforcement goes live.
**Delivers:** Complete BILL-02 with storage and contact dimensions added to usage rollup; atomic metering writes via `INSERT ... ON CONFLICT DO UPDATE SET col = col + ?`; `enforceLimit()` plugin using `BEGIN EXCLUSIVE` transactions as preHandlers on all resource-creating routes; 402 responses with upgrade_url on limit breach; graceful degradation when billing service is down
**Addresses:** BILL-01 (complete existing wiring), BILL-02, BILL-03
**Avoids:** Webhook idempotency failure (Pitfall 5); plan limit race conditions (Pitfall 6); token metering undercounting (Pitfall 11)
**Research flag:** Skip research-phase. Lemon Squeezy webhook patterns and SQLite atomic update patterns are fully documented.

### Phase Ordering Rationale

- Foundation first: API inconsistency creates rework in every other phase; error capture surfaces bugs immediately
- Streaming second: zero dependencies on other v2 features; highest-impact user-facing change; unblocks frontend-v2
- Collaboration before unified chat: multi-user conversation context requires project-scoped roles to be enforced first
- Unified chat before CRM intelligence: AI contact analysis needs interaction history to be meaningful
- Autonomous learning isolated late: requires full agent/job/scheduler infrastructure; highest complexity and external risk
- Billing enforcement last: touches every other feature's routes; premature enforcement blocks development with quota errors

### Research Flags

**Phases needing research-phase during planning:**
- **Phase 4** (Unified Chat schema): Polymorphic conversations/messages design is recommended but the schema decisions are difficult to reverse. Verify the single-table approach against specific query patterns before writing the migration.
- **Phase 6** (Autonomous Learning): Verify Brave Search API pricing, Reddit OAuth 2.0 current behavior (post-2023 API changes), and DuckDuckGo JSON API reliability as free fallback.

**Phases with standard patterns (skip research-phase):**
- **Phase 1:** @fastify/swagger registration is standard; envelope pattern already implemented
- **Phase 2:** Ollama streaming via AsyncIterable confirmed in official docs; AbortController pattern established
- **Phase 3:** RBAC middleware is standard Fastify; invitation flow reuses existing nodemailer
- **Phase 5:** AI analysis via agent_jobs dispatch is established; template catalog is editorial work
- **Phase 7:** Lemon Squeezy patterns fully documented; SQLite atomic updates are standard SQL

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All new library versions verified against live npm registry; compatibility constraints (Fastify ^5.5.0, Zod >=4.1.5) confirmed against existing installed versions |
| Features | HIGH | Cross-referenced Lemon Squeezy docs, SSE production guides, CRM market analysis, competitor feature analysis; Deloitte 2026 agentic AI production baseline for learning feature positioning |
| Architecture | HIGH | Based entirely on direct codebase inspection of backend/src/ — zero training-data inference; existing patterns confirmed working in production |
| Pitfalls | HIGH | All critical pitfalls grounded in actual code paths identified by line number (streaming proxy in chat.ts; schema constraints missing in schema.ts; billing race confirmed by implementation inspection) |

**Overall confidence:** HIGH

### Gaps to Address

- **Brave Search API cost:** Primary web search source for autonomous learning. Pricing should be confirmed before committing to it in the roadmap. DuckDuckGo JSON API is the free fallback but its stability is less certain.
- **Reddit OAuth 2.0 current requirements:** Reddit changed their API terms in 2023. The exact current requirements (OAuth app type, rate limits, content restrictions) need verification before implementing the learning service.
- **Drizzle FTS5 support status:** Issue #2046 confirms no native FTS5 as of v0.45.1. Re-check at implementation time — if it ships before the unified chat phase, the raw SQL workaround in STACK.md can be replaced.
- **OpenClaw streaming format:** Verify that OpenClaw's streaming response matches `data: {"choices":[{"delta":{"content":"..."}}]}` via curl before wiring to Phase 2 route. One-time check, not ongoing uncertainty.
- **Template system prompt content:** Template instantiation engineering is low complexity. The blocking constraint is writing 30 complete, high-quality system prompts that instantiate working agents. This is editorial work requiring a content plan before Phase 5.

## Sources

### Primary (HIGH confidence)
- npm registry (live) — ollama@0.6.3, @fastify/swagger@9.7.0, fastify-type-provider-zod@6.1.0, @fastify/rate-limit@10.3.0, cheerio@1.2.0 — versions and peer deps verified
- `/home/lobster/documents/porter/backend/src/` — direct codebase inspection of all files, 2026-03-21
- `/home/lobster/documents/porter/backend/src/db/schema.ts` — existing schema inventory confirming missing tables and constraints
- `/home/lobster/documents/porter/backend/src/services/billing.ts` — billing implementation state: webhook handler complete, enforcement absent
- `/home/lobster/documents/porter/backend/src/routes/v1/chat.ts` — streaming proxy implementation (block-dump pattern identified)
- fastify-type-provider-zod GitHub — Fastify ^5.5.0 + Zod >=4.1.5 peer deps confirmed
- Drizzle FTS5 issue #2046 — confirms raw SQL workaround required for FTS5 virtual tables

### Secondary (MEDIUM confidence)
- Lemon Squeezy docs — usage-based subscriptions, webhook retry behavior (3 retries with exponential backoff), metered billing
- SSE production patterns 2026 — X-Accel-Buffering, backpressure handling, heartbeat interval requirements
- Deloitte 2026 agentic AI report — 11% production adoption baseline for autonomous learning competitive positioning
- Multi-tenant SaaS RBAC patterns (enterpriseready.io) — per-project role enforcement patterns
- @fastify/rate-limit async max function — community documentation for per-plan limit pattern

### Tertiary (LOW confidence — validate before implementation)
- DuckDuckGo JSON API stability as free search fallback (community-documented, not officially supported)
- Reddit OAuth 2.0 current rate limits post-2023 API changes (requires verification against current docs)
- Brave Search API pricing tier details (requires account verification)

---
*Research completed: 2026-03-21*
*Ready for roadmap: yes*
