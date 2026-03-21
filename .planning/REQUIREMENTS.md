# Requirements: Porter

**Defined:** 2026-03-20
**Core Value:** Creating a project should trigger an intelligent flow that assigns agents, builds a plan, and starts work with minimal user input

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Foundation

- [x] **FOUND-01**: Replace broad exception catches with specific types + structured logging across porter.py
- [x] **FOUND-02**: Implement SQLite connection pooling with busy_timeout and retry logic for concurrent agent access
- [x] **FOUND-03**: Migrate projects from config JSON to SQLite table with full query capability
- [x] **FOUND-04**: Remove all deprecated Cortex code and hard cutover to Memory V2
- [x] **FOUND-05**: Boot sequence — detects missing dependencies, installs/configures what it can, prompts for API keys and external credentials, organizes directory structure, verifies everything works before starting, badges unavailable features

### Memory

- [x] **MEM-01**: Complete Memory V2 with structured directives/concepts/signals and noise filtering (no login/upload/file-browse signals)
- [x] **MEM-02**: Real-time memory feed showing what Porter learned, forgot, or updated as it happens
- [x] **MEM-03**: Memory scoping with clear boundaries (global, project, agent, task-level)
- [x] **MEM-04**: FTS5 cross-session search — agents can search their own past sessions for prior work before asking users to repeat (ref: hermes-agent pattern)

### Project Flow

- [x] **PROJ-01**: Guided project creation wizard (describe project → Porter proposes agents/plan → approve → work starts)
- [x] **PROJ-02**: Auto agent assignment based on project type and requirements
- [x] **PROJ-03**: Project dashboard showing progress, active agents, recent activity, and next steps
- [x] **PROJ-04**: GSD plan mode in chat — toggleable structured planning mode (question → research → requirements → roadmap → execute) vs free chat

### Agents

- [x] **AGNT-01**: Scheduled agent work (wake on configurable intervals, execute assigned tasks, report back)
- [x] **AGNT-02**: Event-driven triggers (new file, message, deadline approaching → agent responds)
- [x] **AGNT-03**: Agent activity log (user-readable feed: what each agent did, when, why, what's queued)
- [x] **AGNT-04**: Ephemeral project-scoped agents that auto-retire when project completes or on explicit dismissal

### Connections

- [x] **CONN-01**: GitHub integration (connect repos via OAuth, agents can read/write code, create PRs)
- [x] **CONN-02**: Email integration (Porter sends notifications via SendGrid, agents can send/receive email)
- [x] **CONN-03**: Calendar integration (sync deadlines via Google Calendar API, agents aware of schedules)
- [x] **CONN-04**: WhatsApp bidirectional bridge (send/receive messages via Meta Cloud API, agent-specific chat, group chats)
- [x] **CONN-05**: All external connections configurable via UI — no hardcoded API keys, tokens, paths, or service URLs anywhere in codebase

### Transparency

- [x] **TRNS-01**: Agent activity feed (real-time: what agents are doing now, did today, what's queued)
- [x] **TRNS-02**: System health panel (which services are up, token usage, response times)
- [x] **TRNS-03**: Decision log (why Porter chose X model, routed to Y agent, skipped Z task)

### Performance

- [x] **PERF-01**: System prompt audit — cap interactive prompts at 2K tokens, eliminate bloat causing slowness
- [x] **PERF-02**: Core route migration to Fastify (auth, projects, agents) via strangler fig proxy
- [x] **PERF-03**: SSE real-time hub replacing polling with server-sent events for live updates

### UI Quality

- [x] **UI-01**: CSS audit and consolidation — consistent styling across all Porter views, no regressions to existing UI
- [x] **UI-02**: Proper dark/light mode implementation — complete, consistent theming across all views with clean toggle

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Collaboration

- **COLLAB-01**: Invite people to projects by email with assigned role
- **COLLAB-02**: Custom per-person roles (view, chat, edit, admin)
- **COLLAB-03**: Collaborators can chat with and direct project agents

### Business

- **BIZ-01**: SaaS billing (subscription management, usage tracking)
- **BIZ-02**: Usage-based pricing model

## Out of Scope

| Feature | Reason |
|---------|--------|
| Visual workflow canvas | Anti-feature — signals developer tool, incompatible with non-technical user target |
| Mobile native app | Responsive web serves mobile needs now |
| Self-hosting support | SaaS-only for this milestone |
| Custom model training/fine-tuning | Per-agent directives provide equivalent customization |
| Integration marketplace (400+ connectors) | Depth over breadth — 3 solid connections beat 400 shallow ones |
| Full monolith rewrite | Gradual migration via strangler fig pattern instead |
| Agent-to-agent debate loops | Noise that non-technical users cannot interpret |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 1 | Complete |
| FOUND-04 | Phase 1 | Complete |
| FOUND-05 | Phase 1 | Complete |
| UI-01 | Phase 1 | Complete |
| UI-02 | Phase 1 | Complete |
| MEM-01 | Phase 2 | Complete |
| MEM-02 | Phase 2 | Complete |
| MEM-03 | Phase 2 | Complete |
| MEM-04 | Phase 2 | Complete |
| PERF-01 | Phase 3 | Complete |
| PERF-02 | Phase 3 | Complete |
| AGNT-01 | Phase 4 | Complete |
| AGNT-02 | Phase 4 | Complete |
| AGNT-03 | Phase 4 | Complete |
| AGNT-04 | Phase 4 | Complete |
| PROJ-01 | Phase 5 | Complete |
| PROJ-02 | Phase 5 | Complete |
| PROJ-03 | Phase 5 | Complete |
| PROJ-04 | Phase 5 | Complete |
| TRNS-01 | Phase 6 | Complete |
| TRNS-02 | Phase 6 | Complete |
| TRNS-03 | Phase 6 | Complete |
| PERF-03 | Phase 6 | Complete |
| CONN-01 | Phase 7 | Complete |
| CONN-02 | Phase 7 | Complete |
| CONN-03 | Phase 7 | Complete |
| CONN-04 | Phase 7 | Complete |
| CONN-05 | Phase 7 | Complete |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-20*
*Last updated: 2026-03-20 — phase mapping complete*
