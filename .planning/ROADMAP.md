# Roadmap: Porter

## Overview

Porter evolves from a ~900KB Python monolith prototype into a reliable autonomous agent platform. The journey moves through structural repair, then memory coherence, then route migration, then agent autonomy, then the flagship guided wizard, then real-time transparency, and finally external integrations. Each phase delivers a verifiable capability. No phase depends on the next being started — 35 Playwright tests stay green throughout.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Eliminate silent failures, fix SQLite concurrency, migrate projects to DB, wire Fastify baseline, CSS audit, proper dark/light mode
- [ ] **Phase 2: Memory V2** - Complete structured memory, cut over from Cortex, wire noise filtering and real-time feed
- [ ] **Phase 3: Route Migration** - Move auth/projects/agents to Fastify via strangler fig, all 35 tests green
- [ ] **Phase 4: Agent Autonomy** - Scheduled + event-driven agents, activity log, ephemeral agents
- [ ] **Phase 5: Guided Project Wizard** - Conversational project creation, auto agent assignment, project dashboard
- [ ] **Phase 6: Real-Time and Transparency** - SSE hub replaces polling, agent feed, system health, decision log
- [ ] **Phase 7: External Connections** - GitHub, email, and calendar integrations with project-level overrides

## Phase Details

### Phase 1: Foundation
**Goal**: The codebase is safe to build on — no silent failures, no lock errors, no config-file data, Fastify can serve its first request, and the UI is visually consistent
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, UI-01, UI-02
**Success Criteria** (what must be TRUE):
  1. Any exception raised in porter.py is logged via structured mlog — grepping for bare `except: pass` returns zero results
  2. Concurrent agent database writes no longer produce "database is locked" errors under test load
  3. Projects load from SQLite — porter_config.json is no longer the source of truth for project data
  4. Fastify starts on its configured port and proxies unknown routes to porter.py without dropping requests
  5. All Porter views pass a visual consistency check — no mismatched fonts, inconsistent spacing, or broken component styles
  6. Dark mode and light mode both render correctly across all views — no hard-coded colors, all values use CSS variables
**Plans**: TBD

Plans:
- [ ] 01-01: Exception handling — replace all broad catches and bare `except: pass` with specific types and mlog.exception()
- [ ] 01-02: SQLite concurrency — threading.local() pooling, 30s timeout, exponential backoff on OperationalError
- [ ] 01-03: Projects to DB — Drizzle schema, one-time migration from porter_config.json to SQLite projects table
- [ ] 01-04: Fastify baseline — db/client.ts, plugins/auth.ts, plugins/proxy.ts, config.ts, feature flag skeleton
- [ ] 01-05: CSS audit — consolidate styles across all views, remove regressions, document component tokens
- [ ] 01-06: Dark/light mode — proper theming with consistent CSS variables, clean toggle, no broken views in either mode

### Phase 2: Memory V2
**Goal**: Memory V2 is the only active memory system — Cortex is deleted, signals are clean, and the memory feed is visible in real time
**Depends on**: Phase 1
**Requirements**: MEM-01, MEM-02, MEM-03
**Success Criteria** (what must be TRUE):
  1. Logging in, uploading a file, or browsing project files produces zero signals in the Memory V2 queue
  2. Grepping the codebase for Cortex write paths returns zero results
  3. Agent context injection at dispatch time includes directives, concepts, and relevant episodes — visible in debug output
  4. The memory feed UI shows what Porter learned, updated, or forgot in real time as it happens
  5. Memory items have clear scope labels (global, project, agent) and the scope boundary is enforced — project-scoped memory does not leak across projects
**Plans**: TBD

Plans:
- [ ] 02-01: Cortex removal — delete all Cortex code paths, verify grep-zero, set Memory V2 as sole active system
- [ ] 02-02: Noise filter — audit and block login/upload/file-browse from producing V2 signals
- [ ] 02-03: Memory injection — wire directives/concepts/episodes into Fastify agent dispatch context
- [ ] 02-04: Scoping enforcement — global/project/agent scope implementation with isolation tests
- [ ] 02-05: Memory feed UI — real-time panel showing memory changes as they happen

### Phase 3: Route Migration
**Goal**: Auth, projects, and agents are fully owned by Fastify — porter.py no longer handles these routes, and all 35 Playwright tests pass without modification
**Depends on**: Phase 1, Phase 2
**Requirements**: PERF-01, PERF-02
**Success Criteria** (what must be TRUE):
  1. Logging in and out works end-to-end through Fastify — porter.py login/logout handlers are deleted
  2. Creating, reading, updating, and deleting a project goes through Fastify routes backed by the SQLite projects table
  3. Agent CRUD (create, list, update, retire) is served by Fastify — porter.py agent handlers are deleted
  4. All 35 Playwright tests pass with Fastify as the primary backend
  5. Interactive system prompts at login/project-load are measured and capped at 2,000 tokens — no route exceeds this
**Plans**: TBD

Plans:
- [ ] 03-01: System prompt audit — measure all interactive prompts, cap at 2K tokens, eliminate bloat
- [ ] 03-02: Auth routes — /login, /logout, /api/me migrated to Fastify with session middleware
- [ ] 03-03: Projects routes — /api/projects/* migrated, dual-write flag active then disabled
- [ ] 03-04: Agents routes — /api/agents/* migrated, CRUD endpoints operational in Fastify
- [ ] 03-05: Playwright regression pass — all 35 tests green after each route handoff

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
**Plans**: TBD

Plans:
- [ ] 04-01: Job table + scheduler — agent_jobs table, services/scheduler.ts, 2s poll, atomic UPDATE pickup
- [ ] 04-02: AI router service — services/ai-router.ts, model selection, openclaw dispatch, streaming response
- [ ] 04-03: Event triggers — file-created, deadline-approaching, message-received triggers wired to job queue
- [ ] 04-04: Activity log — per-agent readable feed of runs, results, and queue state
- [ ] 04-05: Ephemeral agents — project-scoped creation, auto-retire on project complete or explicit dismissal
- [ ] 04-06: Feature flags — agent_scheduling, event_triggers, ephemeral_agents kill switches in config

### Phase 5: Guided Project Wizard
**Goal**: A user describes a project goal in plain language and Porter responds with a proposed agent team and plan — approve once and work starts
**Depends on**: Phase 4
**Requirements**: PROJ-01, PROJ-02, PROJ-03
**Success Criteria** (what must be TRUE):
  1. A user with no prior configuration can describe a project goal and receive an agent proposal and plan within 3 conversational turns
  2. Approving the proposal creates a real project in the DB with milestones, tasks, and assigned agents — not a placeholder record
  3. Work starts immediately after approval — at least one agent job is queued and visible in the activity log
  4. The project dashboard shows real-time progress, active agents, recent activity, and next steps — no empty states
  5. Auto-assigned agents are appropriate for the project type — a writing project gets a writer, a code project gets a developer
**Plans**: TBD

Plans:
- [ ] 05-01: Wizard flow — conversational UI, 3-question max, Porter proposes agents + plan
- [ ] 05-02: Agent proposal engine — project type detection, agent selection logic, plan generation
- [ ] 05-03: Approval-to-execution pipeline — proposal approval triggers project creation + job queue
- [ ] 05-04: Project dashboard — progress view, active agents panel, activity feed, next steps
- [ ] 05-05: Token budget enforcement — interactive wizard calls hard-capped at 2,000 tokens system context

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
**Plans**: TBD

Plans:
- [ ] 06-01: SSE hub — plugins/realtime.ts, Map<projectId, Set<sender>>, /api/events endpoint
- [ ] 06-02: Frontend SSE integration — React Query invalidation on events, remove polling intervals
- [ ] 06-03: Agent activity feed — real-time: what agents are doing now, did today, what's queued
- [ ] 06-04: System health panel — service status, token usage, response times, DB health
- [ ] 06-05: Decision log — model selection reasoning, agent routing rationale, skipped task explanations

### Phase 7: External Connections
**Goal**: Porter agents can read and write GitHub code, send and receive email, and are aware of calendar deadlines — each connection works at workspace level with project-level overrides
**Depends on**: Phase 6
**Requirements**: CONN-01, CONN-02, CONN-03
**Success Criteria** (what must be TRUE):
  1. A connected GitHub account allows an agent to read the repo, create a branch, and open a PR — all from a Porter task
  2. Porter sends an email notification when an agent completes a task and can receive an email that triggers an agent response
  3. Project deadlines from Google Calendar appear on the project dashboard and agents factor them into scheduling
  4. A project can override the workspace-level connection credentials — using a different GitHub repo or email account per project
  5. All external API calls are queued to background workers — no HTTP handler blocks waiting for an external response
**Plans**: TBD

Plans:
- [ ] 07-01: GitHub integration — @fastify/oauth2 flow, token in workspace_connections, octokit for API calls
- [ ] 07-02: Email integration — nodemailer outbound, imapflow IMAP IDLE inbound, OAuth2 (no raw passwords)
- [ ] 07-03: Calendar integration — googleapis, Google Calendar read/write, deadline sync to project dashboard
- [ ] 07-04: Project-level overrides — per-project connection credentials override workspace defaults
- [ ] 07-05: External call queuing — all external API calls routed through background worker, never blocking HTTP path

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/6 | Not started | - |
| 2. Memory V2 | 0/5 | Not started | - |
| 3. Route Migration | 0/5 | Not started | - |
| 4. Agent Autonomy | 0/6 | Not started | - |
| 5. Guided Project Wizard | 0/5 | Not started | - |
| 6. Real-Time and Transparency | 0/5 | Not started | - |
| 7. External Connections | 0/5 | Not started | - |
