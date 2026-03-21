# Porter

## What This Is

Porter is an AI orchestration platform where non-technical users create projects, agents auto-assign and work autonomously, and everything connects to the outside world. A SaaS product that lets you hop on, start a project, assign agents, and get shit done — with collaborative sessions where you can invite others to work with your projects and agents.

## Core Value

Creating a project should trigger an intelligent flow that assigns agents, builds a plan, and starts work with minimal user input — the "GSD-like flow" applied to everything Porter does.

## Requirements

### Validated

- ✓ User authentication with RBAC (4 roles) — existing
- ✓ Session management with cookies and expiry — existing
- ✓ Multi-model AI routing (Claude, Gemini, Qwen, Ollama, OpenClaw) — existing
- ✓ Chat with streaming responses (SSE) — existing
- ✓ Project CRUD with milestones, tasks, artifacts — existing
- ✓ Agent/Persona system with templates and identity — existing
- ✓ Memory V2 system (4-layer: directives, concepts, episodes, signals — complete) — Validated in Phase 2: memory-v2
- ✓ Background workflow system (7 registered workflows) — existing
- ✓ File management with upload, serve, path traversal protection — existing
- ✓ Connections infrastructure (3-table model) — existing
- ✓ People module (CRM with user cards, stats) — existing
- ✓ Invite system with registration page — existing
- ✓ Audit logging (structured via mlog.emit) — existing
- ✓ Workspace identity with dynamic branding — existing
- ✓ React frontend with Zustand + React Query — existing
- ✓ Playwright test suite (35 tests) — existing
- ✓ RBAC API protection on admin endpoints — existing

### Active

- ✓ Guided project creation wizard (collaborative questioning, agent proposal, plan generation) — Validated in Phase 5: guided-project-wizard
- ✓ Agent autonomy (scheduled + event-driven work, AI router, activity logs) — Validated in Phase 4: agent-autonomy
- ✓ Persistent and temporary agents (ephemeral project-scoped agents with auto-retire) — Validated in Phase 4: agent-autonomy
- [ ] Collaborative sessions (invite people to projects, share agents, custom per-person roles)
- [ ] Unified global chat (all conversations in one interface — agents, projects, external)
- [ ] WhatsApp integration (bidirectional, agent-specific chat, group chats via WhatsApp)
- [ ] Connections (GitHub, Mail, Calendar at account-level defaults + project-level overrides)
- ✓ Memory V2 completion (structured, noise-free, real-time visibility, no signal noise from logins/uploads) — Validated in Phase 2: memory-v2
- ✓ Transparency dashboard (agent activity, memory changes, system health, decision log — all visible) — Validated in Phase 6: real-time-and-transparency
- ✓ Performance overhaul (SSE replaces polling, 6 pollers killed, single EventSource) — Validated in Phase 6: real-time-and-transparency
- [ ] Codebase migration (gradual move from porter.py monolith to Fastify backend, new features in TypeScript)
- [ ] SaaS billing (subscription management, usage tracking — deferred until core works)

### Out of Scope

- Full monolith rewrite — gradual migration instead, porter.py shrinks over time
- Mobile native app — web-first, responsive design
- Self-hosting support — SaaS-only for now
- Custom model training — use existing model providers via routing
- Video/voice calling — chat and messaging only

## Context

Porter has been in development since Feb 18, 2026. Current version is v0.33.28. The codebase is a ~900KB Python monolith (`porter.py`) that served as rapid prototyping but accumulated significant tech debt:

- 683 broad exception catches masking real errors
- Duplicate function definitions (3 functions defined twice)
- ~~Deprecated Cortex memory system~~ — fully removed in Phase 2 (194KB deleted)
- No connection pooling, 5-second SQLite timeout under concurrent load
- Global mutable state (_sessions, _login_attempts, _wf_registry, _config)
- Projects stored in JSON config file instead of database
- Heavy system prompts causing slowness across the app

A Fastify backend (`backend/src/`) exists with Drizzle ORM, route structure, and TypeScript types but is currently reference-only — all logic lives in porter.py.

The frontend (React 19 + Vite 8 + TailwindCSS 4) is functional but coupled to the Python backend's API surface.

## Constraints

- **Timeline**: Days, not weeks — ruthlessly prioritize project flow first
- **Architecture**: Gradual migration — new features in Fastify/TypeScript, existing features migrated opportunistically
- **Runtime**: Linux VPS, 8GB RAM, 2 vCPU, no GPU — must stay performant under these constraints
- **No pip installs**: Python backend is stdlib-only, new backend work goes to Node/TypeScript
- **Backwards compatibility**: Existing 35 Playwright tests must keep passing throughout migration
- **Single DB**: SQLite for now, but architecture should allow future PostgreSQL migration

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Gradual monolith split (porter.py → Fastify) | 900KB monolith unmaintainable, but full rewrite too risky | — Pending |
| Project flow is first priority | Core value is "create project, agents work" — everything else builds on this | — Pending |
| SaaS product model with collaborative sessions | Unique differentiator: invite people to work with your projects and agents | — Pending |
| Account-level + project-level connections | Flexibility: connect GitHub once, override per project if needed | — Pending |
| Memory V2 must filter noise (logins, uploads) | Current system captures everything, dilutes actual learning | — Pending |

---
*Last updated: 2026-03-21 after Phase 6 (Real-Time and Transparency) completion*
