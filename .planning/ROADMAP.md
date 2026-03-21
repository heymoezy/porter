# Roadmap: Porter

## Overview

Porter evolves from a ~900KB Python monolith prototype into a reliable autonomous agent platform. The journey moves through structural repair, then memory coherence, then route migration, then agent autonomy, then the flagship guided wizard, then real-time transparency, and finally external integrations. Each phase delivers a verifiable capability. No phase depends on the next being started — 35 Playwright tests stay green throughout.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Eliminate silent failures, fix SQLite concurrency, migrate projects to DB, Fastify baseline, CSS audit, dark/light mode, boot sequence (completed 2026-03-20)
- [x] **Phase 2: Memory V2** - Complete structured memory, cut over from Cortex, wire noise filtering and real-time feed (completed 2026-03-20)
- [x] **Phase 3: Route Migration** - Move auth/projects/agents to Fastify via strangler fig, all 35 tests green (completed 2026-03-20)
- [x] **Phase 4: Agent Autonomy** - Scheduled + event-driven agents, activity log, ephemeral agents (completed 2026-03-21)
- [x] **Phase 5: Guided Project Wizard** - Conversational project creation, auto agent assignment, project dashboard (completed 2026-03-21)
- [x] **Phase 6: Real-Time and Transparency** - SSE hub replaces polling, agent feed, system health, decision log (completed 2026-03-21)
- [ ] **Phase 7: External Connections** - GitHub, email, calendar, WhatsApp integrations — all credentials configurable via UI, nothing hardcoded

## Phase Details

### Phase 1: Foundation
**Goal**: The codebase is safe to build on — no silent failures, no lock errors, no config-file data, Fastify can serve its first request, and the UI is visually consistent
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, UI-01, UI-02
**Success Criteria** (what must be TRUE):
  1. Any exception raised in porter.py is logged via structured mlog — grepping for bare `except: pass` returns zero results
  2. Concurrent agent database writes no longer produce "database is locked" errors under test load
  3. Projects load from SQLite — porter_config.json is no longer the source of truth for project data
  4. Fastify starts on its configured port and proxies unknown routes to porter.py without dropping requests
  5. All Porter views pass a visual consistency check — no mismatched fonts, inconsistent spacing, or broken component styles
  6. Dark mode and light mode both render correctly across all views — no hard-coded colors, all values use CSS variables
  7. Boot sequence detects, installs, and configures all dependencies — a fresh machine can run Porter after completing the first-run wizard
**Plans**: 9 plans

Plans:
- [ ] 01-01-PLAN.md — CSS variable architecture, dark/light theming, React sidebar cleanup (Wave 1)
- [ ] 01-02-PLAN.md — Exception handling reform + SQLite connection pooling (Wave 1)
- [ ] 01-03-PLAN.md — Admin system deletion + Cortex disable + dead code removal (Wave 2)
- [ ] 01-04-PLAN.md — Fastify baseline: config, DB client, proxy plugin, projects schema (Wave 1)
- [ ] 01-05-PLAN.md — Projects migration from JSON to SQLite (Wave 3)
- [ ] 01-06-PLAN.md — CSS audit sweep: 1,767 hardcoded colors to variables (Wave 3)
- [ ] 01-07-PLAN.md — Boot sequence, hardcoding fixes, landing page, final verification (Wave 4)
- [ ] 01-08-PLAN.md — [GAP] Fix Fastify OPTIONS crash, build backend (Wave 5)
- [ ] 01-09-PLAN.md — [GAP] Fix project migration bypass paths, add exception logging (Wave 5)

### Phase 2: Memory V2
**Goal**: Memory V2 is the only active memory system — Cortex is deleted, signals are clean, and the memory feed is visible in real time
**Depends on**: Phase 1
**Requirements**: MEM-01, MEM-02, MEM-03, MEM-04
**Success Criteria** (what must be TRUE):
  1. Logging in, uploading a file, or browsing project files produces zero signals in the Memory V2 queue
  2. Grepping the codebase for Cortex write paths returns zero results
  3. Agent context injection at dispatch time includes directives, concepts, and relevant episodes — visible in debug output
  4. The memory feed UI shows what Porter learned, updated, or forgot in real time as it happens
  5. Memory items have clear scope labels (global, project, agent) and the scope boundary is enforced — project-scoped memory does not leak across projects
**Plans**: 8 plans

Plans:
- [ ] 02-00-PLAN.md — Wave 0 test scaffolding: create all behavioral test scripts (Wave 0)
- [ ] 02-01-PLAN.md — Cortex deletion: remove all cortex functions, table, preferences, workflow entries (Wave 1)
- [ ] 02-02-PLAN.md — Noise filter: blacklist, re-enable signal extraction, inline Recall noted indicator (Wave 2)
- [ ] 02-03-PLAN.md — Memory injection: tiered priority, token cap, scope isolation, privacy toggle (Wave 2)
- [ ] 02-04-PLAN.md — Memory feed UI: compact real-time feed, badge count, auto-manage toggle (Wave 3)
- [ ] 02-05-PLAN.md — FTS5 session search, dispatch wiring, chat remember/forget commands (Wave 3)
- [ ] 02-06-PLAN.md — Agent writing styles, anti-pattern block list, agent init wiring (Wave 4)
- [ ] 02-07-PLAN.md — Feedback tracking, agent evolution trigger, respawn animation (Wave 4)

### Phase 3: Route Migration
**Goal**: Auth, projects, and agents are fully owned by Fastify — porter.py handlers are deprecated, system prompts are razor-thin, design system tokens established, React login/register pages built, and all 35 Playwright tests pass
**Depends on**: Phase 1, Phase 2
**Requirements**: PERF-01, PERF-02
**Success Criteria** (what must be TRUE):
  1. System prompts are 200-300 tokens (identity + guardrails only) — _build_lean_identity() replaces _build_context_suffix()
  2. Fastify owns /api/v1/auth/*, /api/v1/projects/*, /api/v1/agents/* with response envelope and request tracing
  3. All v1 routes use shared db/client.ts with WAL and busy_timeout — no per-route Database instantiation
  4. Design system tokens (TypeScript + CSS) established for all new React components
  5. React login page feels alive with motion and energy — React Router handles /login, /register, /* routes
  6. Frontend API client points to /api/v1/* paths
  7. All 35 Playwright tests pass throughout
**Plans**: 5 plans

Plans:
- [ ] 03-01-PLAN.md — System prompt overhaul: _build_lean_identity(), circuit breaker, awareness toggle (Wave 1)
- [ ] 03-02-PLAN.md — API v1 infrastructure: response envelope, auth plugin, logger, auth routes (Wave 1)
- [ ] 03-03-PLAN.md — Projects + agents route migration to /api/v1/* with Drizzle schemas (Wave 2)
- [ ] 03-04-PLAN.md — Design system tokens + React Router + login/register pages with motion (Wave 2)
- [ ] 03-05-PLAN.md — Frontend API cutover + Fastify SPA serving + legacy handler deprecation (Wave 3)

### Phase 4: Agent Autonomy
**Goal**: Agents do scheduled and event-triggered work autonomously, report what they did, and can be scoped to a single project and auto-retired
**Depends on**: Phase 3
**Requirements**: AGNT-01, AGNT-02, AGNT-03, AGNT-04
**Success Criteria** (what must be TRUE):
  1. An agent configured with a schedule wakes up at the configured interval, executes its assigned task, and writes a result — without manual triggering
  2. A new file upload or approaching deadline triggers the configured agent to respond within the polling interval
  3. Every agent has a readable activity log — a user can see what each agent did, when it ran, and what it produced
  4. An ephemeral project-scoped agent auto-retires when the project is marked complete, leaving no orphaned jobs
  5. All autonomous features are controlled by config-level feature flags — disabling a flag stops execution within one polling cycle
**Plans**: 6 plans

Plans:
- [ ] 04-00-PLAN.md — Wave 0 test scaffolding: 7 behavioral test scripts for AGNT-01 through AGNT-04 (Wave 0)
- [ ] 04-01-PLAN.md — Job table + scheduler: agent_jobs/agent_activity schema, services/scheduler.ts 2s poll, atomic pickup, job CRUD routes — Task 2 split into 2a (scheduler.ts) and 2b (jobs.ts + wiring) (Wave 1)
- [ ] 04-02-PLAN.md — AI router: config.ts gains ollamaUrl/openclawUrl/openclawToken, services/ai-router.ts smart routing, openclaw dispatch, context compressor (Wave 1)
- [ ] 04-03-PLAN.md — Event triggers: file-created, deadline-approaching, message-received with deduplication, wired to scheduler tick and backend/src/routes/files.ts (Wave 2)
- [ ] 04-04-PLAN.md — Activity log + AI router integration: per-agent activity feed API, scheduler dispatch via ai-router (Wave 2)
- [ ] 04-05-PLAN.md — Ephemeral agents: project-scoped creation, depth=2 limit, auto-retire on project complete, feature flag verification (Wave 3)

### Phase 5: Guided Project Wizard
**Goal**: A user describes a project goal in plain language and Porter responds with a proposed agent team and plan — approve once and work starts
**Depends on**: Phase 4
**Requirements**: PROJ-01, PROJ-02, PROJ-03, PROJ-04
**Success Criteria** (what must be TRUE):
  1. A user with no prior configuration can describe a project goal and receive an agent proposal and plan within 3 conversational turns
  2. Approving the proposal creates a real project in the DB with milestones, tasks, and assigned agents — not a placeholder record
  3. Work starts immediately after approval — at least one agent job is queued and visible in the activity log
  4. The project dashboard shows real-time progress, active agents, recent activity, and next steps — no empty states
  5. Auto-assigned agents are appropriate for the project type — a writing project gets a writer, a code project gets a developer
  6. Chat has a toggleable GSD plan mode — switching it on enters structured planning flow, switching it off returns to free chat
**Plans**: 6 plans

Plans:
- [ ] 05-00-PLAN.md — Wave 0 test scaffolding: 6 behavioral test scripts for PROJ-01 through PROJ-04 (Wave 0)
- [ ] 05-01-PLAN.md — Wizard backend: types, endpoint, migration, intent detection, proposal generation, approval transaction (Wave 1)
- [ ] 05-02-PLAN.md — Frontend wizard UI: Zustand state, WizardCard, WizardQuestion, GSDModeToggle, ChatView integration, design system pass (Wave 1)
- [ ] 05-03-PLAN.md — Dashboard backend: activity feed endpoint, SSE emission from scheduler (Wave 2)
- [ ] 05-04-PLAN.md — Project dashboard frontend: ActivityFeed, AgentStatusStrip, SSE subscription, Sidebar design system pass (Wave 3)
- [ ] 05-05-PLAN.md — End-to-end wiring: wizard flow hooks, GSD mode hooks, GSD dispatch action, ChatView message flow, human verification (Wave 4)

### Phase 6: Real-Time and Transparency
**Goal**: All live updates flow through SSE push instead of polling, and users have full visibility into what agents are doing, why Porter made each decision, and the health of every connected service
**Depends on**: Phase 4, Phase 5
**Requirements**: TRNS-01, TRNS-02, TRNS-03, PERF-03
**Success Criteria** (what must be TRUE):
  1. Agent activity, memory changes, and project events appear in the browser within 2 seconds of occurring — no page refresh or poll needed
  2. The agent feed shows what each agent is doing right now, did today, and has queued next
  3. The system health panel shows live status for every connected service (AI backends, database, external APIs) and current token usage
  4. The decision log shows why Porter chose a specific model or routed to a specific agent — readable by a non-technical user
  5. Removing all polling-interval calls from the frontend reduces outbound HTTP requests to the server by at least 80% during idle periods
**Plans**: 6 plans

Plans:
- [ ] 06-00-PLAN.md — Wave 0 test scaffolding: behavioral test stubs for TRNS-01, TRNS-02, TRNS-03, PERF-03 (Wave 0)
- [ ] 06-01-PLAN.md — SSE backend infrastructure: Fastify events.ts WebSocket-to-SSE rewrite, DB migration, porter.py /api/events/emit + poller kill (Wave 1)
- [ ] 06-02-PLAN.md — Frontend SSE singleton: SSEProvider context, useSSEHub hook, refactor useProjectActivity to shared bus (Wave 1)
- [ ] 06-03-PLAN.md — Agent activity feed: three-section layout (Active/Completed/Queued), expandable detail, agent grouping (Wave 2)
- [ ] 06-04-PLAN.md — Health + decisions backend: GET /api/v1/health, GET /api/v1/decisions, decision logging in AI router (Wave 2)
- [ ] 06-05-PLAN.md — Health panel + decision log UI: SystemHealthPanel, DecisionLog, health tab routing, visual verification (Wave 3)

### Phase 7: External Connections
**Goal**: Porter agents can read and write GitHub code, send and receive email, are aware of calendar deadlines, and chat via WhatsApp — all external credentials are configurable via UI with zero hardcoded values in the codebase
**Depends on**: Phase 6
**Requirements**: CONN-01, CONN-02, CONN-03, CONN-04, CONN-05
**Success Criteria** (what must be TRUE):
  1. A connected GitHub account allows an agent to read the repo, create a branch, and open a PR — all from a Porter task
  2. Porter sends an email notification when an agent completes a task and can receive an email that triggers an agent response
  3. Project deadlines from Google Calendar appear on the project dashboard and agents factor them into scheduling
  4. A project can override the workspace-level connection credentials — using a different GitHub repo or email account per project
  5. All external API calls are queued to background workers — no HTTP handler blocks waiting for an external response
  6. WhatsApp bridge sends and receives messages — agents can be chatted with via WhatsApp
  7. Zero hardcoded API keys, tokens, service URLs, or file paths in codebase — all configurable via UI settings
**Plans**: 11 plans

Plans:
- [ ] 07-00-PLAN.md — Wave 0 test scaffolding: behavioral test script for CONN-01 through CONN-05 (Wave 0)
- [ ] 07-01-PLAN.md — Credential encryption (AES-256-GCM), DB migration, Drizzle schemas, feature flag (Wave 1)
- [ ] 07-02-PLAN.md — Connections CRUD API: workspace + project connection routes (Wave 2)
- [ ] 07-03-PLAN.md — Connections UI: service cards, status badges, sidebar nav, API key form (Wave 2)
- [ ] 07-04-PLAN.md — Hardcoding purge: remove all hardcoded paths/IPs/ports from backend + porter.py (Wave 2)
- [ ] 07-05-PLAN.md — GitHub integration: @fastify/oauth2 flow + octokit service module (Wave 3)
- [ ] 07-06-PLAN.md — Email integration: Google OAuth, nodemailer outbound, imapflow IMAP IDLE inbound (Wave 3)
- [ ] 07-07-PLAN.md — Calendar integration: googleapis sync, deadline triggers, scheduler wiring (Wave 3)
- [ ] 07-08-PLAN.md — WhatsApp bridge: Meta Cloud API send, webhook receiver, agent routing (Wave 3)
- [ ] 07-09-PLAN.md — External call dispatcher with blocked-status gating, queueExternalCall utility, OAuth UI finalization, human verification (Wave 4)
- [ ] 07-10-PLAN.md — Calendar events route + dashboard display, project connection override UI (Wave 4)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 9/9 | Complete    | 2026-03-20 |
| 2. Memory V2 | 8/8 | Complete   | 2026-03-20 |
| 3. Route Migration | 5/5 | Complete   | 2026-03-20 |
| 4. Agent Autonomy | 6/6 | Complete   | 2026-03-21 |
| 5. Guided Project Wizard | 6/6 | Complete   | 2026-03-21 |
| 6. Real-Time and Transparency | 6/6 | Complete   | 2026-03-21 |
| 7. External Connections | 10/11 | In Progress|  |
