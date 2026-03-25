# Porter

## What This Is

Porter is an AI orchestration platform where non-technical users create projects, agents auto-assign and work autonomously, and everything connects to the outside world. A SaaS product that lets you hop on, start a project, assign agents, and get shit done — with collaborative sessions where you can invite others to work with your projects and agents.

## Core Value

Creating a project should trigger an intelligent flow that assigns agents, builds a plan, and starts work with minimal user input — the "GSD-like flow" applied to everything Porter does.

## Current Milestone: v3.0 Porter Bridge — AI Gateway & Model Intelligence

**Goal:** Build the unified AI gateway layer that manages all model providers, routing, capability detection, and runtime orchestration. Database-backed, commercially-quality system replacing the old hardcoded config approach.

**Target features:**
- Gateway registry (detect, configure, manage all AI backends — Ollama, OpenClaw, Codex CLI, direct API keys)
- Model catalog (unified view across all gateways — capabilities, context windows, pricing, benchmarks)
- Smart routing (complexity-based, cost-aware, availability-aware with transparent decision logging)
- Bridge admin surface (gateways, models, health, routing decisions, cost tracking)
- First-run setup (guided gateway detection + configuration for new users)
- OpenClaw for messaging (WhatsApp/Telegram), not just model access
- Bridge agents (Bridge Operator for health, Model Scout for discovery, Route Analyst for optimization)
- Memory/Recall integration (Bridge decisions feed into Memory V3, agents learn model preferences)
- Commercial quality (circuit breakers, retry logic, rate limiting, graceful degradation)

## Requirements

### Validated

- ✓ User authentication with RBAC (4 roles) — existing
- ✓ Session management with cookies and expiry — existing
- ✓ Multi-model AI routing (Claude, Gemini, Qwen, Ollama, OpenClaw) — existing
- ✓ Chat with streaming responses (SSE) — existing
- ✓ Project CRUD with milestones, tasks, artifacts — existing
- ✓ Agent/Persona system with templates and identity — existing
- ✓ Memory V2 system (4-layer: directives, concepts, episodes, signals) — v1.0 Phase 2
- ✓ Background workflow system (7 registered workflows) — existing
- ✓ File management with upload, serve, path traversal protection — existing
- ✓ Connections infrastructure (GitHub, email, calendar, WhatsApp) — v1.0 Phase 7
- ✓ People module (CRM with user cards, stats) — existing
- ✓ Invite system with registration page — existing
- ✓ Audit logging (structured via mlog.emit) — existing
- ✓ Workspace identity with dynamic branding — existing
- ✓ React frontend with Zustand + React Query — existing
- ✓ Playwright test suite (35 tests) — existing
- ✓ RBAC API protection on admin endpoints — existing
- ✓ Guided project creation wizard — v1.0 Phase 5
- ✓ Agent autonomy (scheduled + event-driven) — v1.0 Phase 4
- ✓ Ephemeral project-scoped agents — v1.0 Phase 4
- ✓ Transparency dashboard (activity, health, decisions) — v1.0 Phase 6
- ✓ SSE real-time hub replacing polling — v1.0 Phase 6

### Active

- ✓ API standardization (consistent /api/v1/* surface, envelopes, error codes, OpenAPI) — v2.0 Phase 8
- ✓ Streaming chat (token-by-token SSE from all AI backends, cancellation) — v2.0 Phase 9
- ✓ Collaborative sessions (invite by email, per-person roles, shared project/agent access) — v2.0 Phase 10
- ✓ Unified global chat (single conversation model — agents, projects, external channels) — v2.0 Phase 11
- ✓ CRM backend (multi-email, multi-phone, social links, contact auto-creation from channels) — v2.0 Phase 11
- ✓ File associations (registry with atomic upload, link to projects/contacts/conversations) — v2.0 Phase 11
- ✓ Agent templates (100 templates with complete skills/tools/system prompts) — v2.0 Phase 12
- ✓ Skills & tools architecture (DB registry, CRUD APIs, junction tables, visibility controls, forge integration) — v2.0 Phase 15
- ✓ Autonomous learning (agents search web/social/GitHub, store as Memory V2 concepts) — v2.0 Phase 13
- ✓ Gateway foundation (DB schema, adapter interface, startup detection, credential masking, Bridge API) — v3.0 Phase 16
- ✓ Resilience layer (circuit breakers, health probes, retry with backoff, N-gateway fallback chains) — v3.0 Phase 18
- ✓ Model catalog (unified model registry, capabilities, pricing, version tracking, cost per dispatch) — v3.0 Phase 19
- ✓ First-run setup (detection endpoint, zero-config Ollama, guided setup API, OpenClaw dual-role) — v3.0 Phase 21
- ✓ Smart routing engine (DB-driven gateway selection, routing rules, dispatch logging, concurrency queuing, session context) — v3.0 Phase 20
- [ ] SaaS billing (Lemon Squeezy subscriptions, usage metering, plan limit enforcement)
- ✓ Error capture (frontend error POST endpoint with stack traces, component context) — v2.0 Phase 8
- [ ] Codebase migration (gradual — porter.py shrinks as features move to Fastify)

### Out of Scope

- Frontend UI for v2 features — frontend-v2 being built separately
- Full porter.py deprecation — gradual shrink, not a v2 goal
- Mobile native app — web-first, responsive design
- Self-hosting support — SaaS-only for now
- Custom model training — use existing model providers via routing
- Video/voice calling — chat and messaging only
- AARRR analytics — being built by another Claude session

## Context

Porter has been in development since Feb 18, 2026. Current version is v2.2.0 (Fastify backend; legacy porter.py v0.34.23 deprecated). The codebase has two stacks:

**Fastify backend** (`backend/src/`): TypeScript, Drizzle ORM, 17 v1 route groups, AI router, scheduler, event triggers, external connections. This is the active stack — all new work goes here.

**porter.py** (~57K lines): Legacy Python monolith. Still handles some brain functions (memory injection, chat commands, system prompts). Shrinks gradually as functions migrate to Fastify. Proxy plugin forwards unhandled routes to it.

**frontend-v2** (`frontend-v2/`): React Router 7 + shadcn/ui + Tailwind 4. Being built by another Claude session. All v2 backend work is API-only — frontend connects later.

**frontend** (`frontend/`): Legacy React frontend. Being replaced by frontend-v2.

## Constraints

- **Architecture**: All v2 work is pure backend API. Zero frontend. Frontend-v2 connects later.
- **Runtime**: Linux VPS, 8GB RAM, 2 vCPU, no GPU — must stay performant
- **No pip installs**: Python backend is stdlib-only, new backend work goes to Node/TypeScript
- **Backwards compatibility**: Existing 35 Playwright tests must keep passing
- **Single DB**: PostgreSQL 16 — single source of truth (SQLite fully eliminated)
- **Coordination**: Another Claude session building frontend-v2 and admin analytics — avoid conflicts on shared files

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Gradual monolith split (porter.py → Fastify) | 900KB monolith unmaintainable, but full rewrite too risky | ✓ Working — v1.0 migrated core routes |
| Project flow is first priority | Core value is "create project, agents work" — everything else builds on this | ✓ Shipped — guided wizard in Phase 5 |
| SaaS product model with collaborative sessions | Unique differentiator: invite people to work with your projects and agents | — v2.0 scope |
| Account-level + project-level connections | Flexibility: connect GitHub once, override per project if needed | ✓ Shipped Phase 7 |
| Memory V2 must filter noise (logins, uploads) | Current system captures everything, dilutes actual learning | ✓ Shipped Phase 2 |
| v2.0 is backend-only | Frontend-v2 being built separately. All v2 features are pure API. | — v2.0 |
| porter.py gradual shrink | Don't spend v2 time on migration. Brain migrates naturally as features move. | — v2.0 |

| porter.py fully deprecated | All AI routing, SSE, streaming now in Fastify. porter.py stopped+disabled. | ✓ Completed 2026-03-24 |
| SQLite fully eliminated | Both Brain and Admin on PostgreSQL. better-sqlite3 removed. | ✓ Completed 2026-03-25 |
| Bridge as major innovation | AI gateway management is Porter's differentiator — first-run detection, smart routing, cost tracking | — v3.0 scope |

---
*Last updated: 2026-03-25 after Phase 21 First-Run Setup complete — detection endpoint, zero-config Ollama, guided setup wizard API*
