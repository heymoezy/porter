# Feature Research

**Domain:** AI orchestration platform — v2.0 Backend Ready (streaming, collaboration, CRM, billing, observability)
**Researched:** 2026-03-21
**Confidence:** HIGH (cross-referenced Lemon Squeezy docs, Sentry patterns, SSE production guides, CRM market analysis, agent platform comparisons)

---

## Scope

This document covers only the v2.0 new features. Existing v1.0 features (RBAC, project CRUD, agent system, Memory V2, connections, SSE hub) are treated as **already built dependencies** — noted where they enable or constrain new features.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in a production SaaS platform. Missing any of these makes the product feel broken or pre-release.

| Feature | Why Expected | Complexity | v1 Dependency | Notes |
|---------|--------------|------------|---------------|-------|
| Token-by-token chat streaming | Every major AI product (ChatGPT, Claude, Gemini) streams. Users stare at spinners without it — perceived as broken | MEDIUM | SSE hub exists | Must propagate from LLM provider through proxy to client; Ollama and OpenClaw both support streaming; 10-20x perceived speed improvement |
| Stream cancellation | Users click "stop" when responses go wrong. Not stopping burns tokens and wastes their time | LOW | AbortController pattern | Backend must detect client disconnect and halt LLM generation; not just closing the SSE connection |
| Consistent API response envelopes | Frontend devs expect `{ok, data, error}` — inconsistent shapes cause integration bugs and signal immaturity | LOW | Fastify v1 route groups | Must cover all 17 existing route groups, not just new ones |
| Meaningful error codes | "Something went wrong" is useless. Error codes + trace IDs let users report issues and let the team debug | LOW | Existing error handling | Request ID in every response header; error codes in a registry, not ad-hoc strings |
| Invitation-based collaboration | SaaS products grow through invite loops. Invite by email is baseline — every project tool has it | MEDIUM | Invite system exists | Existing invite flow sends registration link; needs project-scoped roles on top |
| Chat history search | Users need to find past conversations and outputs. No search = no productivity | MEDIUM | chat_messages table exists | Full-text search on message content; filter by agent, project, date range |
| Contact multi-email and multi-phone | Real people have multiple emails and phone numbers. Single-value fields are a CRM anti-pattern | LOW | People module exists | Currently single email/phone; requires schema migration |
| Social links on contacts | LinkedIn, GitHub, X are standard CRM fields in 2026. Missing them forces workarounds | LOW | People module exists | Simple stored fields; no verification required at this stage |
| File upload with context association | Files uploaded to a project should belong to that project. Files uploaded in a conversation should be findable from that conversation | MEDIUM | File management exists | Upload endpoint exists but associations are loose; needs explicit project_id, contact_id, conversation_id on file records |
| Frontend error visibility | Production bugs that only appear in frontend are invisible without a reporting endpoint. Teams expect errors to surface somewhere | LOW | None required | Simple POST endpoint; capture stack trace, component name, user context, severity |
| Subscription management | SaaS users expect to self-serve their plan, upgrade, and cancel without contacting support | HIGH | None required | Lemon Squeezy handles the payment UI; Porter needs webhook handler and plan state in DB |

### Differentiators (Competitive Advantage)

Features that make Porter stand out. Not universally expected, but they drive retention and word-of-mouth.

| Feature | Value Proposition | Complexity | v1 Dependency | Notes |
|---------|-------------------|------------|---------------|-------|
| Per-project collaboration with granular roles | Most platforms offer workspace-level roles. Per-project roles (view/chat/edit/admin) with enforcement on every API call is rare and enables fine-grained access for agencies and teams | HIGH | RBAC exists (4 workspace roles); invite system exists | Requires a new project_collaborators table; role check middleware must apply per project, not just per workspace |
| External channels surfaced in unified chat | WhatsApp messages and emails appearing in the same conversation thread as agent responses is genuinely novel. Users do not have to switch contexts | HIGH | Connections infrastructure exists (WhatsApp, email) | Requires a unified conversation model with message origin tracking; CHAT-01 through CHAT-04 |
| AI-powered contact analysis from interaction history | CRMs store contact data. Porter can synthesize what an agent has learned from all interactions with a contact — a brief, current, AI-generated profile — automatically | HIGH | Memory V2 exists; People module exists | LLM call on demand, stored as a concept in Memory V2 scoped to contact; refreshed on interaction |
| Agent-authored concepts from web learning | Agents that autonomously search web/Reddit/GitHub and store structured knowledge as Memory V2 concepts with source attribution — building expertise over time | HIGH | Memory V2 exists; workflow registry exists | Must rate-limit learning sessions to avoid runaway resource use; learning logs required for trust |
| Metered billing with hard/soft limit enforcement | Usage-based billing where heavy users pay more creates a sustainable revenue model and aligns incentives. Few small AI platforms implement proper plan enforcement — they just cut users off unexpectedly | HIGH | None required | Lemon Squeezy metered billing API; usage tracked per workspace in DB; enforcement as middleware |
| OpenAPI spec auto-generated from route definitions | Self-documenting API enables frontend-v2 to generate TypeScript types, enables future SDK generation, and signals maturity to enterprise buyers | LOW | Fastify routes exist | @fastify/swagger plugin; low effort relative to value |
| Agent templates searchable by category | 100 templates that users can actually discover by role (marketer, developer, analyst) rather than scrolling a flat list reduces time-to-first-agent | MEDIUM | Agent template system exists | Needs category metadata + search endpoint; template quality matters more than count |
| Threaded messages with parent/child | Conversations that branch into sub-threads allow focused discussions without losing context. Slack proved this pattern; chat interfaces that lack it feel flat | MEDIUM | chat_messages table exists | Parent message ID on every message; client renders as threads |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time presence indicators ("User X is typing") | Chat apps have it; collaboration feels more alive | Requires WebSockets or long-poll per active user. On 2 vCPU, 8GB RAM this will saturate the server under concurrent sessions. Adds stateful connection management complexity | Focus SSE on AI responses (the actual bottleneck). Presence is noise in an agent-focused tool |
| Chat reactions and emoji | Feels social and expressive | In an agent-centric platform this is decoration, not functionality. Engineering cost is non-trivial (polymorphic associations) with near-zero user value for the target use case | Invest the same time in message threading which provides real value |
| Full audit event streaming to client | Enterprises sometimes want to watch every system event in real-time | Turns the client into a log viewer. Audit data should be queryable, not streamed. Streaming every event would overwhelm SSE connections and create noise | Queryable audit log endpoint with filters; SSE only for chat events and task status changes |
| Per-message billing to end users | Seems granular and "fair" | Creates usage anxiety and unpredictable bills. Zapier's per-task billing is widely criticized. Non-technical users will under-use the product to avoid surprise charges | Workspace-level seat billing with metered overages above plan limit — predictable for users, revenue-aligned for Porter |
| External contact enrichment (calling ZoomInfo, Clearbit) | CRM users expect automated data enrichment | Third-party data costs money, adds compliance surface area (GDPR), creates dependency on external APIs that change pricing unpredictably | AI-powered analysis of interaction history is the differentiator — internal knowledge Porter already has, not external lookups |
| WebSocket-first architecture | WebSockets are "more modern" than SSE | Porter's SSE hub already handles the real-time use case. WebSockets add bidirectional complexity and connection state management. SSE is the correct protocol for server-push LLM streams | Keep SSE for AI streams, use standard HTTP for client-initiated actions |
| Agent-to-agent debate loops (visible to user) | AutoGen-style multi-agent coordination looks powerful in demos | Non-technical users cannot interpret agent debate logs. They generate noise, increase latency, and reduce trust. Even AutoGen's own team acknowledges this is not production-ready for business workflows | Role-based sequential/parallel task assignment through Porter as orchestrator — clean output, no visible debate |
| 1000+ connector marketplace | Users want coverage | Maintenance burden is prohibitive. Broken connectors generate support tickets. Most users use 3-5 integrations | Depth over breadth: GitHub, email, calendar, WhatsApp done excellently |

---

## Feature Dependencies

```
API Standardization (API-01, API-02, API-03)
    └──enables──> All other API work (consistent envelopes required first)
    └──requires──> @fastify/swagger installed

Streaming Chat (STRM-01, STRM-02, STRM-03)
    └──requires──> Existing SSE hub
    └──requires──> AI router (Ollama, OpenClaw already connected)
    └──enables──> Unified Chat (better UX foundation)
    STRM-03 (cancellation)
        └──requires──> AbortController on backend + client disconnect detection

Collaborative Sessions (COLLAB-01 through COLLAB-04)
    └──requires──> Existing invite system (registration link flow)
    └──requires──> Existing RBAC (4 workspace roles)
    └──requires──> New: project_collaborators table (project-scoped roles)
    └──requires──> New: per-project permission middleware on every route
    └──enables──> Unified Chat (collaborators need shared conversation access)

Unified Chat (CHAT-01 through CHAT-04)
    └──requires──> Existing chat_messages table
    └──requires──> Existing connections (WhatsApp, email) for CHAT-04
    └──requires──> Collaborative Sessions (CHAT-03 multi-user history)
    CHAT-02 (threading)
        └──requires──> parent_message_id column on messages

CRM (CRM-01 through CRM-04)
    └──requires──> Existing People module (contact records)
    └──requires──> Schema migration (multi-email, multi-phone, social links)
    CRM-03 (AI analysis)
        └──requires──> Unified Chat (interaction history to analyze)
        └──requires──> Memory V2 (store analysis as concept)
    CRM-04 (activity timeline)
        └──requires──> Unified Chat (all touchpoints surfaced)

File Handling (FILE-01 through FILE-03)
    └──requires──> Existing file upload endpoint
    └──requires──> Schema migration (file_associations table)
    └──enhances──> Unified Chat (files linked to conversations)
    └──enhances──> CRM (files linked to contacts)

Agent Templates (TMPL-01 through TMPL-03)
    └──requires──> Existing agent system
    └──requires──> Template quality pass (100 templates with complete specs)
    └──enhances──> Guided project creation (wizard pulls from template library)

Autonomous Learning (LEARN-01 through LEARN-03)
    └──requires──> Memory V2 (store learned concepts)
    └──requires──> Web search capability (external HTTP calls)
    └──requires──> Workflow registry (schedule learning sessions)
    └──enhances──> CRM-03 (agents can research contacts)

Billing (BILL-01 through BILL-03)
    └──requires──> Lemon Squeezy account + webhook endpoint
    └──requires──> Usage metering table (per workspace)
    BILL-03 (plan enforcement)
        └──requires──> BILL-02 (metering data to enforce against)
        └──requires──> Middleware layer (check plan before serving request)

Observability (OBS-01, OBS-02)
    └──requires──> New /api/v1/errors endpoint
    └──no other dependencies
    └──enhances──> All features (errors surface silently without it)
```

### Dependency Notes

- **API standardization is the true Phase 1.** All other features build on consistent envelopes and error codes. Building COLLAB before API is consistent creates rework debt.
- **Streaming is high-value, low-dependency.** It requires existing SSE hub and AI router (both exist). Can be shipped as its own phase immediately after API standardization.
- **Collaborative sessions are the v2 centerpiece.** They depend on invite system (exists) and RBAC (exists) but require new project-scoped permission tables and middleware. Every subsequent social feature (unified chat multi-user, CRM contact sharing) depends on this.
- **CRM-03 (AI analysis) requires Unified Chat to be meaningful.** Without interaction history, there is nothing to analyze. Build Unified Chat first, AI analysis second.
- **Autonomous learning requires Memory V2 (already complete).** The V2 4-layer system with concepts layer is exactly where learned knowledge belongs. This is a force-multiplier unlock from v1.0 work.
- **Billing must be last.** Plan enforcement middleware touches every request. Building billing before the core features are stable risks blocking active development with quota checks. BILL-03 (enforcement) should be the final piece, after BILL-01 (subscriptions) and BILL-02 (metering) are running silently.
- **Error capture (OBS) is independent and low-cost.** No dependencies. Should be included early — errors from streaming and collaboration phases will be invisible without it.

---

## v2.0 Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Phase Fit | Priority |
|---------|------------|---------------------|-----------|----------|
| API standardization | HIGH (enabler) | LOW | Phase 1 | P1 |
| OpenAPI spec | MEDIUM | LOW | Phase 1 | P1 |
| Error capture (OBS) | HIGH (ops safety) | LOW | Phase 1 | P1 |
| Streaming chat (STRM-01, -02) | HIGH | MEDIUM | Phase 2 | P1 |
| Stream cancellation (STRM-03) | MEDIUM | LOW | Phase 2 | P1 |
| Collaborative sessions (COLLAB) | HIGH | HIGH | Phase 3 | P1 |
| Unified chat model (CHAT-01, -02, -03) | HIGH | MEDIUM | Phase 4 | P1 |
| External channels in chat (CHAT-04) | HIGH (differentiator) | MEDIUM | Phase 4 | P2 |
| CRM schema upgrade (CRM-01, -02) | MEDIUM | LOW | Phase 5 | P1 |
| CRM activity timeline (CRM-04) | MEDIUM | MEDIUM | Phase 5 | P2 |
| CRM AI analysis (CRM-03) | HIGH (differentiator) | HIGH | Phase 5 | P2 |
| File associations (FILE-01, -02, -03) | MEDIUM | MEDIUM | Phase 5 | P2 |
| Agent templates 100x (TMPL) | MEDIUM | MEDIUM | Phase 6 | P2 |
| Autonomous learning (LEARN) | HIGH (differentiator) | HIGH | Phase 6 | P2 |
| Billing subscriptions (BILL-01) | HIGH (revenue) | HIGH | Phase 7 | P1 |
| Usage metering (BILL-02) | HIGH (revenue) | MEDIUM | Phase 7 | P1 |
| Plan enforcement (BILL-03) | HIGH (revenue) | MEDIUM | Phase 7 | P2 |

**Priority key:**
- P1: Required for v2.0 backend to be viable
- P2: Required for v2.0 backend to be competitive
- P3: Future — do not build in v2.0

---

## Per-Feature Analysis

### Streaming Chat

**Table stakes.** Every AI product streams. Not streaming makes Porter feel like a 2022 product.

**What production looks like:** LLM provider sends `data: {"token": "..."}` chunks. Backend proxies each chunk immediately to client SSE. Client appends tokens to the message buffer. No full-response buffering at any layer.

**Complexity notes:** Ollama's `/api/chat` with `stream: true` returns NDJSON. OpenClaw returns OpenAI-compatible SSE. The AI router already knows which backend to use — it just needs to pipe the stream through rather than buffering. Cancellation via AbortController: client sends DELETE request or closes SSE connection; backend detects disconnect via `req.raw.on('close')` and aborts the upstream fetch.

**Risk:** Backpressure — if the client is slow and the LLM is fast, the SSE buffer can grow. Implement a simple drain-or-drop policy.

**Existing v1 dependency:** SSE hub already handles multiplexed SSE connections. Streaming chat is a new event type on the same infrastructure.

---

### Collaborative Sessions

**Differentiator, but expected by teams.** Solo use is not the growth vector. Collaboration is where viral loops start.

**What production looks like:** User A creates project, invites User B by email with role "editor". User B gets email with registration link (or login link if existing). Both can now interact with project agents, see shared conversation history, and see each other's messages. Owner can revoke at any time.

**Role model for projects (4 roles):**
- `view` — read project, read chat history, no chat capability
- `chat` — can chat with agents, cannot edit project
- `edit` — full project edit + chat
- `admin` — edit + revoke others' access (cannot revoke owner)

**Data model:** `project_collaborators (project_id, user_id, role, invited_by, invited_at, accepted_at)`. Middleware checks this table for every project-scoped endpoint.

**Complexity notes:** The hard part is not the invite — it's permission enforcement on every API route. Each of the 17 Fastify route groups that touches project data needs to call the collaborator check middleware. Missing one endpoint = a security hole.

**Existing v1 dependency:** Workspace invite system sends registration links. Collaborative sessions reuse this but scope to a project rather than a workspace. Workspace roles (4 roles) are the baseline; project roles override them.

---

### Unified Chat

**Differentiator.** Most platforms have separate agent chat, project chat, and channel notifications. Unifying them is the product vision.

**What production looks like:** One conversation record links a context (project, agent, or global). Messages have `origin` field: `agent`, `user`, `whatsapp`, `email`. Client renders them in a single thread with appropriate attribution. History persists. Full-text search across all origins.

**Threading:** Parent message ID on every message. Top-level messages have `parent_id = NULL`. Replies carry `parent_id`. Client collapses replies under parent. This is the pattern Slack, Linear, and Notion all use.

**External channel integration (CHAT-04):** Requires Connections infrastructure (already built). WhatsApp inbound message arrives at webhook → creates a message record in the unified conversation with `origin: 'whatsapp'` → SSE event fires → collaborators see it in real-time. No new infrastructure needed — just the routing logic.

**Complexity notes:** The schema design is the hard decision. Options: (a) one polymorphic messages table with context_type/context_id, or (b) separate tables with a view. Option (a) is simpler for search and simpler for SSE. Use option (a).

---

### CRM Backend

**Table stakes at schema level; differentiator at AI analysis level.**

**Schema upgrade (table stakes):** `contact_emails (contact_id, email, label, is_primary)`, `contact_phones (contact_id, phone, country_code, label, is_primary)`, `contact_social_links (contact_id, platform, handle, url)`. Migration from single-value columns to junction tables. Country code as ISO 3166-1 alpha-2 (two-letter), stored alongside phone number.

**AI analysis (differentiator):** On demand (not automatic — too expensive to run continuously), an LLM call synthesizes all interaction history with a contact into a structured analysis: communication style, key topics, relationship health, last touchpoint. Store the analysis as a Memory V2 concept scoped to the contact. Refresh triggered by user or on new interaction (debounced, not immediate).

**Activity timeline:** All touchpoints across projects — messages, file uploads, meetings, emails — ordered chronologically. This is a JOIN across unified chat messages, file_associations, and connection events filtered by contact. Read-only aggregated view; no new write paths.

**Complexity notes:** The schema migration is LOW complexity. The AI analysis is HIGH complexity because of cost management (don't call LLM on every page load), caching (store result with TTL), and quality (system prompt engineering for useful output). Tackle schema and timeline first; AI analysis last.

---

### File Associations

**Table stakes.** Users upload files in context. They expect those files to be findable from that context.

**What production looks like:** Upload request includes `context_type` (project/contact/conversation) and `context_id`. Server stores file + creates a `file_associations` record. Search/filter endpoint accepts context filters. Files not associated with anything are "unattached" — visible in a global files view.

**Schema:** `file_associations (file_id, context_type, context_id, created_by, created_at)`. Polymorphic — one file can have multiple associations (a file associated with both a project and a conversation).

**Complexity notes:** LOW. The file upload endpoint exists. This is schema migration + association lookup. The only non-trivial part is the drag-drop upload API specification (multipart form data with context fields) — frontend-v2 will need this documented clearly.

---

### Agent Templates (100x)

**Table stakes for discovery; differentiator for quality.**

**What production looks like:** 100 templates across 8-10 categories (marketing, development, operations, research, sales, support, design, finance). Each template has: name, description, category, system prompt (complete, not placeholder), skills list, tools list, appearance spec (pixel portrait). Templates are searchable and filterable by category via API.

**Key insight from research:** Relevance AI, Beam AI, and MindStudio all compete on template count (200+, 1000+). Count is marketing; quality is the product. A Porter template must instantiate a fully working agent — not a skeleton with "TODO: customize this prompt."

**Complexity notes:** Template instantiation (TMPL-03) is LOW complexity — it's essentially a copy of the template record into the agents table with workspace binding. The real cost is content creation: writing 100 complete system prompts that actually work. This is editorial work, not engineering work.

**Phasing recommendation:** Do not block on 100. Ship 30 high-quality templates, search/filter endpoint, and instantiation API. Label it "30+ templates" in the API. Add remaining templates incrementally.

---

### Autonomous Learning

**Differentiator. Rare in production.** Only 11% of organizations have agentic AI in production (Deloitte 2026). Learning agents that build expertise over time are genuinely novel.

**What production looks like:** An agent's learning workflow runs on a schedule (e.g., weekly). It searches web/Reddit/GitHub for topics relevant to its role. For each search result, it extracts key facts and creates Memory V2 concepts with source attribution, confidence score, and retrieval timestamp. A learning log records what was searched, what was found, what was stored, and what was discarded.

**Constraints for the VPS environment:** Web scraping must be rate-limited. Each learning session should be bounded: max N sources, max M concepts per session, timeout after T minutes. The 2 vCPU / 8GB RAM constraint means learning sessions must not run concurrently with active chat sessions.

**Source strategy:** Web search (Brave API or similar), GitHub repository READMEs and issues, Reddit via Pushshift or direct API. Do not attempt PDF parsing or video transcription in v2.

**Complexity notes:** HIGH. The engineering challenges are: (1) reliable web content extraction without a headless browser, (2) quality filtering (not every search result is worth storing), (3) resource management (concurrent learning vs active use), (4) Memory V2 deduplication (don't store the same concept twice). Each of these is solvable but each takes time.

**Risk:** Agents learning incorrect information and injecting it as high-trust concepts. Mitigation: all autonomously learned knowledge gets `trust_level: LOW` in Memory V2 and must be promoted by a human action before becoming `MEDIUM` or higher.

---

### SaaS Billing

**Revenue-critical. Not a differentiator — it's required to operate.**

**Lemon Squeezy fit:** Acquired by Stripe in 2024, which removes viability risk. Supports: subscriptions at any frequency, metered/usage-based billing, webhook events for subscription lifecycle, license key delivery (not needed for SaaS). Built-in tax compliance (VAT, GST) — critical for Singapore-based operation selling globally.

**Usage metering implementation:** Track per workspace: `usage_events (workspace_id, metric, value, recorded_at)`. Aggregate on billing cycle. Report to Lemon Squeezy via their usage report API. Metrics to meter: AI tokens consumed, API calls made, storage bytes used, active agent count.

**Plan enforcement:** A middleware layer that runs before any metered resource is consumed. Checks `workspace_billing_state` for plan limits. Hard limits block the request and return `402 Payment Required` with upgrade prompt. Soft limits allow the request and flag the overage for billing.

**Critical ordering:** BILL-01 (webhook handler + subscription state) → BILL-02 (metering collection, silent) → BILL-03 (enforcement middleware). Never enable enforcement (BILL-03) before metering is validated (BILL-02). Premature enforcement locks out paying users.

**Complexity notes:** HIGH for architecture, MEDIUM for implementation. The Lemon Squeezy API is well-documented. The hard parts are: (1) webhook idempotency (events can be delivered multiple times), (2) enforcement middleware that is fast enough to not add perceptible latency, (3) graceful degradation (billing system down should not take down the product).

---

### Error Capture

**Table stakes for production operations. LOW complexity.**

**What production looks like:** Frontend catches unhandled errors (`window.onerror`, React error boundaries) and POSTs to `/api/v1/errors` with: stack trace, component name, user ID, session ID, severity (info/warning/error/critical), browser/OS context. Backend stores in SQLite. Admin query endpoint with filters by severity, component, and time range.

**Why not just use Sentry:** Sentry is the obvious choice for standalone error monitoring. But Porter is building a self-contained SaaS. Having errors POST to Porter's own API means: (a) zero external dependency, (b) errors are visible in the admin panel users already have, (c) no Sentry subscription cost. The implementation is a POST endpoint and a SQLite table — 2 hours of engineering work.

**Source map limitation:** Without source maps uploaded to a service, stack traces in production show minified code. The error capture endpoint should accept both raw stack traces and a `component` field filled by the React error boundary — `component` is more useful than a minified stack trace for triage.

---

## Competitor Feature Analysis

| Feature | ChatGPT Team | Notion AI | Lindy | Porter v2 Approach |
|---------|--------------|-----------|-------|-------------------|
| Streaming | Yes, token-by-token | Yes, for AI writes | Yes | SSE proxy from all backends; same UX bar |
| Collaboration | Workspace sharing, no project-scoped roles | Workspace sharing, page permissions | Not core | Per-project roles with granular enforcement — more fine-grained than any competitor |
| Unified chat | No (separate chat per thread) | No (separate AI per page) | No | Single conversation model across agents, projects, external channels — genuinely novel |
| CRM | No | No | Basic contact tracking | Multi-value fields + AI analysis from interaction history — agent-native CRM |
| File associations | Yes (per conversation) | Yes (per page) | No | Cross-context association (project + contact + conversation) — more flexible |
| Agent templates | 30 GPTs | No | ~20 templates | 100 quality templates with category search — coverage + discoverability |
| Autonomous learning | No | No | No | Web/GitHub/Reddit learning stored as Memory V2 concepts — novel |
| Billing | OpenAI billing (token cost) | Notion seat billing | Seat billing | Lemon Squeezy metered billing with plan enforcement — transparent + scalable |
| Error capture | Sentry external | Sentry external | Unknown | Self-hosted in Porter DB — no external dependency |
| API spec | OpenAI-compatible | No public API | No public API | Auto-generated OpenAPI from Fastify routes — enables SDK generation |

---

## Sources

- [SSE streaming production patterns 2026](https://procedure.tech/blogs/the-streaming-backbone-of-llms-why-server-sent-events-(sse)-still-wins-in-2025)
- [AbortController cancellation in Node.js](https://blog.appsignal.com/2025/02/12/managing-asynchronous-operations-in-nodejs-with-abortcontroller.html)
- [Lemon Squeezy usage-based billing docs](https://docs.lemonsqueezy.com/guides/tutorials/usage-based-subscriptions)
- [Lemon Squeezy metered billing](https://docs.lemonsqueezy.com/help/products/usage-based-billing)
- [Stripe acquired Lemon Squeezy — Stripe vs Lemon Squeezy 2026](https://designrevision.com/blog/stripe-vs-lemonsqueezy)
- [SaaS billing enforcement patterns — rate limiting as billing control](https://kinde.com/learn/billing/billing-infrastructure/api-rate-limiting-as-a-billing-control-mechanism/)
- [Usage-based billing implementation guide](https://schematichq.com/blog/why-usage-based-billing-is-taking-over-saas)
- [AI CRM table stakes 2026](https://monday.com/blog/crm-and-sales/crm-with-ai/)
- [AI agent templates competitive landscape](https://beam.ai/agents)
- [Agentic AI production readiness 2026 — Deloitte](https://www.deloitte.com/us/en/insights/industry/technology/technology-media-and-telecom-predictions/2026/saas-ai-agents.html)
- [Autonomous learning SaaS trends 2026](https://machinelearningmastery.com/7-agentic-ai-trends-to-watch-in-2026/)
- [Fastify OpenAPI auto-generation — @fastify/swagger](https://www.speakeasy.com/openapi/frameworks/fastify)
- [Frontend error monitoring patterns — Sentry](https://docs.sentry.io/product/sentry-basics/integrate-frontend/)
- [Multi-tenant SaaS RBAC patterns](https://www.enterpriseready.io/features/role-based-access-control/)
- [SaaS collaboration invite patterns](https://userpilot.com/blog/onboard-invited-users-saas/)
- [Omnichannel messaging unified API](https://www.centripe.ai/omnichannel-messaging-guide)

---

*Feature research for: Porter v2.0 Backend Ready — streaming, collaboration, CRM, billing, observability*
*Researched: 2026-03-21*
