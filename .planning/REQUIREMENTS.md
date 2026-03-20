# Requirements: Porter

**Defined:** 2026-03-20
**Core Value:** Creating a project should trigger an intelligent flow that assigns agents, builds a plan, and starts work with minimal user input

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Foundation

- [ ] **FOUND-01**: Replace broad exception catches with specific types + structured logging across porter.py
- [ ] **FOUND-02**: Implement SQLite connection pooling with busy_timeout and retry logic for concurrent agent access
- [ ] **FOUND-03**: Migrate projects from config JSON to SQLite table with full query capability
- [ ] **FOUND-04**: Remove all deprecated Cortex code and hard cutover to Memory V2

### Memory

- [ ] **MEM-01**: Complete Memory V2 with structured directives/concepts/signals and noise filtering (no login/upload/file-browse signals)
- [ ] **MEM-02**: Real-time memory feed showing what Porter learned, forgot, or updated as it happens
- [ ] **MEM-03**: Memory scoping with clear boundaries (global, project, agent, task-level)

### Project Flow

- [ ] **PROJ-01**: Guided project creation wizard (describe project → Porter proposes agents/plan → approve → work starts)
- [ ] **PROJ-02**: Auto agent assignment based on project type and requirements
- [ ] **PROJ-03**: Project dashboard showing progress, active agents, recent activity, and next steps

### Agents

- [ ] **AGNT-01**: Scheduled agent work (wake on configurable intervals, execute assigned tasks, report back)
- [ ] **AGNT-02**: Event-driven triggers (new file, message, deadline approaching → agent responds)
- [ ] **AGNT-03**: Agent activity log (user-readable feed: what each agent did, when, why, what's queued)
- [ ] **AGNT-04**: Ephemeral project-scoped agents that auto-retire when project completes or on explicit dismissal

### Connections

- [ ] **CONN-01**: GitHub integration (connect repos via OAuth, agents can read/write code, create PRs)
- [ ] **CONN-02**: Email integration (Porter sends notifications via SendGrid, agents can send/receive email)
- [ ] **CONN-03**: Calendar integration (sync deadlines via Google Calendar API, agents aware of schedules)

### Transparency

- [ ] **TRNS-01**: Agent activity feed (real-time: what agents are doing now, did today, what's queued)
- [ ] **TRNS-02**: System health panel (which services are up, token usage, response times)
- [ ] **TRNS-03**: Decision log (why Porter chose X model, routed to Y agent, skipped Z task)

### Performance

- [ ] **PERF-01**: System prompt audit — cap interactive prompts at 2K tokens, eliminate bloat causing slowness
- [ ] **PERF-02**: Core route migration to Fastify (auth, projects, agents) via strangler fig proxy
- [ ] **PERF-03**: SSE real-time hub replacing polling with server-sent events for live updates

### UI Quality

- [ ] **UI-01**: CSS audit and consolidation — consistent styling across all Porter views, no regressions to existing UI

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Collaboration

- **COLLAB-01**: Invite people to projects by email with assigned role
- **COLLAB-02**: Custom per-person roles (view, chat, edit, admin)
- **COLLAB-03**: Collaborators can chat with and direct project agents

### Messaging

- **MSG-01**: WhatsApp bidirectional bridge (send/receive via Meta Cloud API)
- **MSG-02**: Agent-specific WhatsApp chat (message a specific agent)
- **MSG-03**: WhatsApp group chats with multiple agents

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
| FOUND-01 | TBD | Pending |
| FOUND-02 | TBD | Pending |
| FOUND-03 | TBD | Pending |
| FOUND-04 | TBD | Pending |
| MEM-01 | TBD | Pending |
| MEM-02 | TBD | Pending |
| MEM-03 | TBD | Pending |
| PROJ-01 | TBD | Pending |
| PROJ-02 | TBD | Pending |
| PROJ-03 | TBD | Pending |
| AGNT-01 | TBD | Pending |
| AGNT-02 | TBD | Pending |
| AGNT-03 | TBD | Pending |
| AGNT-04 | TBD | Pending |
| CONN-01 | TBD | Pending |
| CONN-02 | TBD | Pending |
| CONN-03 | TBD | Pending |
| TRNS-01 | TBD | Pending |
| TRNS-02 | TBD | Pending |
| TRNS-03 | TBD | Pending |
| PERF-01 | TBD | Pending |
| PERF-02 | TBD | Pending |
| PERF-03 | TBD | Pending |
| UI-01 | TBD | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 0
- Unmapped: 24 ⚠️

---
*Requirements defined: 2026-03-20*
*Last updated: 2026-03-20 after initial definition*
