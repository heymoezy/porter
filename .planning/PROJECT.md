# Porter

## What This Is

Porter is an AI orchestration platform where non-technical users create projects, agents auto-assign and work autonomously, and everything connects to the outside world. A SaaS product that lets you hop on, start a project, assign agents, and get shit done — with collaborative sessions where you can invite others to work with your projects and agents.

## Core Value

Creating a project should trigger an intelligent flow that assigns agents, builds a plan, and starts work with minimal user input — the "GSD-like flow" applied to everything Porter does.

## Current Milestone: v2.0 Backend Ready

**Goal:** Build a killer backend API layer — all features pure API, zero frontend. Frontend-v2 connects later.

**Target features:**
- API standardization (consistent envelopes, error codes, OpenAPI)
- Token-by-token streaming chat across all AI backends
- Collaborative sessions (invite, roles, shared agents)
- Unified chat (single conversation model for agents/projects/external)
- CRM backend (multi-email, multi-phone, social links, AI analysis)
- File associations (projects, contacts, conversations)
- 100 agent templates with complete specs
- Autonomous agent learning (web/social/GitHub knowledge acquisition)
- SaaS billing (Lemon Squeezy subscriptions, usage metering)
- Error capture API (frontend error logging)

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
- [ ] Agent templates (100 templates with complete skills/tools/system prompts)
- [ ] Autonomous learning (agents search web/social/GitHub, store as Memory V2 concepts)
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

Porter has been in development since Feb 18, 2026. Current version is v0.34.23. The codebase has two stacks:

**Fastify backend** (`backend/src/`): TypeScript, Drizzle ORM, 17 v1 route groups, AI router, scheduler, event triggers, external connections. This is the active stack — all new work goes here.

**porter.py** (~57K lines): Legacy Python monolith. Still handles some brain functions (memory injection, chat commands, system prompts). Shrinks gradually as functions migrate to Fastify. Proxy plugin forwards unhandled routes to it.

**frontend-v2** (`frontend-v2/`): React Router 7 + shadcn/ui + Tailwind 4. Being built by another Claude session. All v2 backend work is API-only — frontend connects later.

**frontend** (`frontend/`): Legacy React frontend. Being replaced by frontend-v2.

## Constraints

- **Architecture**: All v2 work is pure backend API. Zero frontend. Frontend-v2 connects later.
- **Runtime**: Linux VPS, 8GB RAM, 2 vCPU, no GPU — must stay performant
- **No pip installs**: Python backend is stdlib-only, new backend work goes to Node/TypeScript
- **Backwards compatibility**: Existing 35 Playwright tests must keep passing
- **Single DB**: SQLite with WAL mode, architecture should allow future PostgreSQL migration
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

---
*Last updated: 2026-03-22 after Phase 13 (Autonomous Learning) completion*
