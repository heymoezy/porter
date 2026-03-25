# Roadmap: Porter

## Milestones

- ✅ **v1.0 Foundation + Core Platform** — Phases 1-7 (shipped 2026-03-21)
- ✅ **v2.0 Backend Ready** — Phases 8-15 (shipped 2026-03-24)
- 🚧 **v3.0 Porter Bridge** — Phases 16-23 (active) — AI gateway, model intelligence, smart routing
- 📋 **v4.0 Agent-First UI** — Phases 24-28 (planned) — agents own every surface

## Phases

<details>
<summary>v1.0 Foundation + Core Platform (Phases 1-7) — SHIPPED 2026-03-21</summary>

| Phase | Name | Key Deliverables |
|-------|------|------------------|
| 1 | Foundation | CSS variable architecture, exception handling, SQLite pooling, project migration, Fastify baseline, boot sequence |
| 2 | Memory V2 | 4-layer memory (directives/concepts/episodes/signals), Cortex removal (194KB deleted), noise filter, real-time feed |
| 3 | Route Migration | Lean system prompts, Fastify /api/v1/* for auth/projects/agents, React login/register, design tokens |
| 4 | Agent Autonomy | Scheduler (2s tick), AI router, event triggers, activity log, ephemeral agents, feature flags |
| 5 | Guided Wizard | Conversational project creation, auto agent assignment, project dashboard, GSD plan mode |
| 6 | Real-Time Transparency | SSE singleton, 6 pollers killed, agent activity feed, health panel, decision log |
| 7 | External Connections | Credential encryption, GitHub/email/calendar/WhatsApp integrations, OAuth flows, external dispatcher |

30/30 requirements complete. 35 Playwright tests green. Version v0.34.23.

</details>

<details>
<summary>v2.0 Backend Ready (Phases 8-15) — SHIPPED 2026-03-24</summary>

- [x] Phase 8: API Foundation — Consistent envelopes, error codes, trace IDs, OpenAPI spec (2026-03-21)
- [x] Phase 9: Streaming Chat — Token-by-token SSE from all AI backends, mid-stream cancellation (2026-03-22)
- [x] Phase 10: Collaborative Sessions — Invite by email, per-project roles, RBAC enforcement (2026-03-22)
- [x] Phase 11: Unified Chat & CRM Schema — Single conversation model, multi-value CRM, file associations (2026-03-22)
- [x] Phase 12: CRM Intelligence & Agent Templates — AI contact analysis, 103 agent templates, one-call instantiation (2026-03-22)
- [x] Phase 13: Autonomous Learning — Web/GitHub/Reddit knowledge acquisition, concept storage with source attribution (2026-03-22)
- [x] Phase 13.05: PostgreSQL Migration — SQLite to PostgreSQL 16 + pgvector, all schemas/queries/FTS ported (2026-03-24)
- [x] Phase 13.1: Memory V3 State Engine — Structured directives/notes, tiered injection, consolidation, agent self-edit (2026-03-24)
- [x] Phase 15: Skills & Tools Architecture — DB registry, CRUD APIs, junction tables, visibility controls, forge integration (2026-03-24)
- ~~Phase 14: Billing Enforcement — Deferred to future milestone~~

38/41 requirements complete (3 billing deferred). See milestones/v2.0-ROADMAP.md for full details.

</details>

---

### v3.0 Porter Bridge (Active)

**Milestone Goal:** Build the unified AI gateway layer that manages all model providers, routing, capability detection, and runtime orchestration. Database-backed, commercial-quality system replacing hardcoded config. Every AI backend is visible, manageable, and intelligently routed — nothing hidden, everything in the database.

- [ ] **Phase 16: Gateway Foundation** — DB schema, adapter interface, config migration, auto-detection, key masking
- [ ] **Phase 17: Provider Adapters** — Concrete adapters for all backends + unified stream normalizer
- [ ] **Phase 18: Resilience Layer** — Background health probes, circuit breakers, retry/backoff, N-backend fallback
- [ ] **Phase 19: Model Catalog** — Models table, auto-population, capability metadata, version tracking, cost tracking
- [ ] **Phase 20: Smart Routing Engine** — DB-driven model selection, routing rules, decision logging, concurrency, session context
- [ ] **Phase 21: First-Run Setup** — Gateway detection endpoint, guided setup API, zero-config path, OpenClaw integration
- [ ] **Phase 22: Bridge Admin Surface** — 7 admin API endpoints, SSE events, design system components, agent-ready layout
- [ ] **Phase 23: Integration & Multi-Tenant** — Brain/Recall integration, per-user keys, workspace overrides, usage attribution

## Phase Details

### Phase 16: Gateway Foundation
**Goal**: Every AI backend Porter can talk to is registered in PostgreSQL with typed metadata, encrypted credentials, and a clean adapter contract — the data substrate all Bridge features build on
**Depends on**: v2.0 complete
**Requirements**: GW-01, GW-03, GW-07, GW-08, CLI-01
**Success Criteria** (what must be TRUE):
  1. `gateways` table exists in PostgreSQL with columns for type, URL, auth method, health status, priority, and JSONB metadata — queryable via Drizzle ORM
  2. On Fastify boot, `startup-detector` scans PATH for Ollama, OpenClaw, Codex CLI, Claude CLI, and Gemini CLI binaries and upserts discovered gateways into the DB automatically
  3. API key values stored in the `gateways` table are encrypted at rest and masked to last 4 characters in all API responses — full keys are never returned after initial save
  4. Existing env vars (OLLAMA_URL, etc.) bootstrap gateway rows on first run; after that the DB is authoritative, env is fallback only — system works whether env vars exist or not
  5. A `GatewayAdapter` TypeScript interface exists with typed methods (detect, health, dispatch, stream, listModels) that all provider adapters must implement
**Plans:** 1/3 plans executed
Plans:
- [ ] 16-01-PLAN.md — Schema, Drizzle definitions, and GatewayAdapter interface contract
- [ ] 16-02-PLAN.md — Startup detector, env-to-DB bootstrap, wire into Fastify boot
- [ ] 16-03-PLAN.md — Bridge API routes with credential masking and admin redetect

### Phase 17: Provider Adapters
**Goal**: Every supported AI backend has a concrete adapter implementing the GatewayAdapter interface, with a stream normalizer that converts all output formats into a single unified AsyncIterable
**Depends on**: Phase 16
**Requirements**: CLI-02, CLI-03, CLI-04, CLI-05, CLI-06, CLI-07
**Success Criteria** (what must be TRUE):
  1. OllamaAdapter wraps native Ollama API calls (not OpenAI compat layer) for accurate token counts and tool call support — dispatch and streaming both work against a running Ollama instance
  2. OpenClawAdapter wraps OpenAI-compatible calls to the OpenClaw gateway and handles auth, error responses, and model enumeration
  3. CodexCLIAdapter and ClaudeCLIAdapter spawn subprocess calls with proper stdin/stdout streaming, timeout handling, and error parsing — output appears as streamed tokens, not dumped blocks
  4. GeminiCLIAdapter dispatches via subprocess with output parsing and model detection from the installed binary
  5. StreamNormalizer converts Ollama NDJSON, OpenAI SSE, Codex JSONL, and Claude JSON output formats into a single `AsyncIterable<string>` consumed by all downstream code
**Plans**: TBD

### Phase 18: Resilience Layer
**Goal**: The Bridge layer handles backend failures gracefully — unhealthy backends are detected in seconds, broken backends stop receiving traffic automatically, transient errors retry intelligently, and requests fall through a priority-ordered chain of alternatives
**Depends on**: Phase 17
**Requirements**: GW-02, GW-04, GW-05, GW-06
**Success Criteria** (what must be TRUE):
  1. A background health probe runs every 30 seconds via the existing scheduler, updates gateway status in the DB, and emits SSE events when any gateway changes state (online/degraded/offline)
  2. Each gateway has an independent circuit breaker (via opossum) with Closed/Open/Half-Open states — the breaker uses a three-class error taxonomy (transient/persistent/configuration) so rate limits do not trip the breaker the same way auth failures do
  3. Transient errors (429, 503) trigger retry with exponential backoff (separate from circuit breaker logic) — a 429 retries after delay, a 401 does not retry
  4. When a dispatch fails, the fallback chain tries the next gateway in priority order (N gateways deep, not binary cheap/strong) — the user's request succeeds as long as any gateway in the chain is healthy
**Plans**: TBD

### Phase 19: Model Catalog
**Goal**: Every model across all gateways is cataloged in one table with capabilities, pricing, and version history — Porter knows exactly what it can do, what it costs, and which version answered each question
**Depends on**: Phase 18
**Requirements**: MOD-01, MOD-02, MOD-03, MOD-04, MOD-05
**Success Criteria** (what must be TRUE):
  1. `models` table exists in PostgreSQL with gateway_id FK, model name, capability tags (coding, writing, analysis, vision), context window size, pricing (input/output per million tokens), and benchmark scores
  2. When a gateway is detected or on periodic refresh (daily), Porter queries each gateway's adapter for available models and upserts them into the catalog automatically
  3. Each model carries capability metadata (strengths) that the routing engine can use to match task type to model — not just cost tier
  4. Model versions are tracked: when a model updates, the old version is logged, and every dispatch record includes which model version was used
  5. Every dispatch logs input tokens, output tokens, cached tokens, and cost in USD to `bridge_dispatch_log` — cost is calculated from the model's pricing metadata
**Plans**: TBD

### Phase 20: Smart Routing Engine
**Goal**: AI dispatch is driven by database rules and model capabilities instead of hardcoded heuristics — every routing decision is logged with reasoning, alternatives are visible, and concurrent dispatches are queued per-backend to prevent VPS saturation
**Depends on**: Phase 19
**Requirements**: RT-01, RT-02, RT-03, RT-04, RT-05
**Success Criteria** (what must be TRUE):
  1. The hardcoded `getBackends()` and `shouldRouteCheap()` logic is replaced by a DB-driven routing engine that selects gateways and models based on health, capability match, cost, and priority
  2. A `routing_rules` table stores operator-configurable overrides (force a model for an agent, cap cost per project, prefer local models, etc.) — rules are evaluated before heuristic fallback
  3. Every routing decision is logged to `bridge_dispatch_log` with: chosen model, reason for selection, alternatives considered, estimated cost — queryable via API
  4. Per-backend dispatch queues (via p-queue) enforce concurrency limits so multiple concurrent agent dispatches do not saturate the VPS
  5. Session routing context tracks which model handled which conversation turn — enabling context-aware re-routing and tied to Brain for memory continuity
**Plans**: TBD

### Phase 21: First-Run Setup
**Goal**: A new Porter installation discovers available AI backends automatically and guides the user through configuration — if Ollama is already running, everything works with zero user action
**Depends on**: Phase 20
**Requirements**: FRS-01, FRS-02, FRS-03, FRS-04
**Success Criteria** (what must be TRUE):
  1. A detection endpoint returns all discovered gateways with their connection status, available models, and health — usable by both the guided setup flow and admin dashboard
  2. The guided setup API walks through steps: detect local runtimes, prompt for API keys for cloud providers, validate each connection, and persist to DB — each step is independently callable
  3. If Ollama is running locally when Porter starts, Bridge works immediately with no user configuration — zero-config path is the default, not an edge case
  4. OpenClaw gateway is detected and registered both as a multi-model fallback for AI dispatch and as a messaging gateway for WhatsApp/Telegram channels
**Plans**: TBD

### Phase 22: Bridge Admin Surface
**Goal**: The Bridge admin page exposes every gateway, model, routing decision, and cost metric through stunning, agent-ready APIs — designed as design system components first, following the admin shell, with layout slots for future Bridge agents
**Depends on**: Phase 21
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04, ADM-05, ADM-06, ADM-07, DS-01, DS-02, DS-03
**Success Criteria** (what must be TRUE):
  1. `GET /api/admin/bridge` returns gateway cards with live health status, latency, uptime percentage, and model count per gateway — sufficient data for a dashboard that feels alive
  2. `GET /api/admin/bridge/models` returns the unified model catalog across all gateways with capability tags, pricing, and benchmark scores — sortable and filterable
  3. `GET /api/admin/bridge/dispatch-log` returns paginated routing decisions with model used, routing reason, cost, and latency — `GET /api/admin/bridge/costs` returns spend aggregated by gateway, model, and day with configurable date ranges
  4. Gateway CRUD (`POST /api/admin/bridge/gateways`) and routing rule management (`POST /api/admin/bridge/routing-rules`) enable full operator control — add, update, remove, validate connections
  5. SSE events (`bridge:health`, `bridge:dispatch`, `bridge:circuit-trip`) stream real-time Bridge state changes to connected admin clients — the admin surface is never stale
**Plans**: TBD

### Phase 23: Integration & Multi-Tenant
**Goal**: Bridge routing decisions feed into Memory V3 so agents learn model preferences, dispatch history is queryable per agent, and each user/workspace can bring their own API keys and gateway configuration
**Depends on**: Phase 22
**Requirements**: INT-01, INT-02, INT-03, INT-04, MT-01, MT-02, MT-03
**Success Criteria** (what must be TRUE):
  1. Routing decisions are written as Memory V3 signals — agents accumulate knowledge about which models work best for which task types, enabling preference learning over time
  2. Bridge dispatch log is queryable by agent_id: "what model did agent X use, how many tokens, what was the latency?" — per-agent model performance is visible
  3. Per-conversation session routing history records which models handled which turns — enabling context-aware re-routing when a model goes down mid-conversation
  4. Bridge gateway health is exposed as part of the Brain health dashboard — system health includes AI backend availability
  5. Each user can store their own API keys for direct provider access; workspace admins can configure which gateways are available to their workspace; token costs are attributed to user/project/agent for future billing integration

## Progress

**Execution Order:**
Phases execute in numeric order: 16 through 23.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7 | v1.0 | - | Complete | 2026-03-21 |
| 8-15 | v2.0 | - | Complete | 2026-03-24 |
| 16. Gateway Foundation | 1/3 | In Progress|  | - |
| 17. Provider Adapters | v3.0 Bridge | 0/TBD | Not started | - |
| 18. Resilience Layer | v3.0 Bridge | 0/TBD | Not started | - |
| 19. Model Catalog | v3.0 Bridge | 0/TBD | Not started | - |
| 20. Smart Routing Engine | v3.0 Bridge | 0/TBD | Not started | - |
| 21. First-Run Setup | v3.0 Bridge | 0/TBD | Not started | - |
| 22. Bridge Admin Surface | v3.0 Bridge | 0/TBD | Not started | - |
| 23. Integration & Multi-Tenant | v3.0 Bridge | 0/TBD | Not started | - |

---

### v4.0 Agent-First UI (Planned)

**Milestone Goal:** Every surface in Porter is visually owned by an agent. Agents are the first thing you see, already working, surfacing what matters. When you walk into Porter, you walk into an office full of agents at their desks.

- [ ] **Phase 24: Live Dashboard** — Replace hardcoded mock dashboard with real agent data, SSE-powered live updates
- [ ] **Phase 25: Agent Workspace** — Full-page agent workspace with chat, activity, concepts, config, jobs tabs
- [ ] **Phase 26: Section Ownership** — Every product module visually shows which agent manages it
- [ ] **Phase 27: Proactive Surfaces** — Agents push insights, suggestions, and flags to their owned sections
- [ ] **Phase 28: Agent Management** — Template browsing, one-click instantiation, chat-first agent creation

*Phase details for v4.0 will be defined when this milestone is activated.*
