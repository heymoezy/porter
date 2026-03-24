# Roadmap: Porter

## Milestones

- ✅ **v1.0 Foundation + Core Platform** — Phases 1-7 (shipped 2026-03-21)
- ✅ **v2.0 Backend Ready** — Phases 8-15 (shipped 2026-03-24)
- 🚧 **v3.0 Agent-First UI** — Phases 20-24 (active) — agents own every surface

## Phases

<details>
<summary>✅ v1.0 Foundation + Core Platform (Phases 1-7) — SHIPPED 2026-03-21</summary>

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
<summary>✅ v2.0 Backend Ready (Phases 8-15) — SHIPPED 2026-03-24</summary>

- [x] Phase 8: API Foundation — Consistent envelopes, error codes, trace IDs, OpenAPI spec (2026-03-21)
- [x] Phase 9: Streaming Chat — Token-by-token SSE from all AI backends, mid-stream cancellation (2026-03-22)
- [x] Phase 10: Collaborative Sessions — Invite by email, per-project roles, RBAC enforcement (2026-03-22)
- [x] Phase 11: Unified Chat & CRM Schema — Single conversation model, multi-value CRM, file associations (2026-03-22)
- [x] Phase 12: CRM Intelligence & Agent Templates — AI contact analysis, 103 agent templates, one-call instantiation (2026-03-22)
- [x] Phase 13: Autonomous Learning — Web/GitHub/Reddit knowledge acquisition, concept storage with source attribution (2026-03-22)
- [x] Phase 13.05: PostgreSQL Migration — SQLite→PostgreSQL 16 + pgvector, all schemas/queries/FTS ported (2026-03-24)
- [x] Phase 13.1: Memory V3 State Engine — Structured directives/notes, tiered injection, consolidation, agent self-edit (2026-03-24)
- [x] Phase 15: Skills & Tools Architecture — DB registry, CRUD APIs, junction tables, visibility controls, forge integration (2026-03-24)
- ~~Phase 14: Billing Enforcement — Deferred to future milestone~~

38/41 requirements complete (3 billing deferred). See milestones/v2.0-ROADMAP.md for full details.

</details>

---

### v3.0 Agent-First UI (Active)

**Milestone Goal:** Every surface in Porter is visually owned by an agent. Agents aren't hidden behind a chat bubble — they're the first thing you see, already working, surfacing what matters. When you walk into Porter, you walk into an office full of agents at their desks.

- [ ] **Phase 20: Live Dashboard** — Replace hardcoded mock dashboard with real agent data, SSE-powered live updates
- [ ] **Phase 21: Agent Workspace** — Full-page agent workspace with chat, activity, concepts, config, jobs tabs
- [ ] **Phase 22: Section Ownership** — Every product module visually shows which agent manages it
- [ ] **Phase 23: Proactive Surfaces** — Agents push insights, suggestions, and flags to their owned sections
- [ ] **Phase 24: Agent Management** — Template browsing, one-click instantiation, chat-first agent creation

## Phase Details

### Phase 20: Live Dashboard
**Goal**: Replace the hardcoded mock dashboard with real agent data — every supervisor card, activity item, and stat tile reflects actual agent state from the API, powered by SSE for real-time updates
**Depends on**: v2.0 complete
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04
**Success Criteria** (what must be TRUE):
  1. Dashboard supervisor cards fetch from `GET /api/v1/agents` and render real agent names, roles, pixel portraits from `appearance_spec`, and live status — zero hardcoded agent data remains in the component
  2. Activity feed connects to SSE and shows real `agent_activity` events as they happen — new events appear within 2 seconds of creation without page refresh
  3. Stats tiles (active agents, running jobs, token usage, project count) pull from real API endpoints and update live — values match what `curl` returns within 1 second
  4. Dashboard renders correctly with 0 agents (empty state), 1 agent, and 20+ agents — no layout breaks, no phantom cards
**Plans**: TBD

### Phase 21: Agent Workspace
**Goal**: Each agent gets a full-page workspace at `/agents/:id` with tabbed views for chat, activity timeline, concepts/memory, config, and job queue — this is where you go to see what an agent is doing and talk to them
**Depends on**: Phase 20
**Requirements**: AGWS-01, AGWS-02, AGWS-03, AGWS-04, AGWS-05
**Success Criteria** (what must be TRUE):
  1. Navigating to `/agents/:id` renders a full-page workspace with the agent's pixel portrait, name, role, status badge, and tabbed content — not a slide-out panel
  2. The Chat tab streams messages via SSE using the Phase 9 streaming API — first token appears under 2 seconds, the agent's persona and memory are injected as context
  3. The Activity tab shows a chronological feed from `GET /api/v1/agents/:id/activity` with event type icons, timestamps, and expandable detail — pagination loads more on scroll
  4. The Concepts tab shows the agent's learned knowledge from Memory V2 with source attribution and confidence scores — editable by the user (add/dismiss)
  5. The Jobs tab shows the agent's pending/running/completed jobs from `GET /api/v1/agents/:id/jobs` with status badges, trigger types, and duration — cancel button for pending jobs
**Plans**: TBD

### Phase 22: Section Ownership
**Goal**: Every product module (Projects, CRM, Chat, Files) visually shows which agent manages it — the agent's portrait appears in the section header, their recent actions show inline, and clicking the portrait navigates to their workspace
**Depends on**: Phase 21
**Requirements**: SECT-01, SECT-02, SECT-03, SECT-04
**Success Criteria** (what must be TRUE):
  1. Each module page (Projects list, CRM contacts, Conversations, Files) renders a section owner bar showing the assigned agent's pixel portrait, name, status, and last action — clicking navigates to `/agents/:id`
  2. `GET /api/v1/agents` returns an `owned_sections` field (JSON array) for each agent; `PUT /api/v1/agents/:id` accepts section assignments — the dashboard reflects ownership changes immediately
  3. The Projects list page shows inline agent annotations: which agent last touched each project, what they did, and when — derived from `agent_activity` joined to `project_id`
  4. The CRM contacts page shows the last analysis result per contact and which agent produced it — clicking opens the analysis detail without leaving the page
**Plans**: TBD

### Phase 23: Proactive Surfaces
**Goal**: Agents push insights, suggestions, and flags to their owned sections without being asked — when you arrive at a page, the agent has already been working and has things to tell you
**Depends on**: Phase 22
**Requirements**: PROACT-01, PROACT-02, PROACT-03, PROACT-04
**Success Criteria** (what must be TRUE):
  1. Each section owner agent generates a "briefing" — top 3 items needing attention — visible as a collapsible card at the top of their section, updated on every page load from `GET /api/v1/agents/:id/briefing`
  2. The backend `POST /api/v1/agents/:id/briefing/generate` creates briefings asynchronously by analyzing the agent's owned data (projects, contacts, conversations) — briefings are cached and refreshed on a configurable interval (default 1 hour)
  3. Agents surface anomalies (overdue projects, contacts going cold, unread conversations) as notification-style badges on their section — badge count updates via SSE
  4. Clicking a briefing item navigates directly to the relevant entity (project, contact, conversation) with the agent's analysis pre-expanded — zero dead-end clicks
**Plans**: TBD

### Phase 24: Agent Management
**Goal**: Users can create, configure, and assign agents through the UI — template browsing, one-click instantiation, section assignment, skill/tool editing, and appearance customization — all through Porter's chat-first interaction model
**Depends on**: Phase 23
**Requirements**: AGMGMT-01, AGMGMT-02, AGMGMT-03, AGMGMT-04
**Success Criteria** (what must be TRUE):
  1. `/agents` route renders a grid of agent cards (pixel portrait, name, 1-2 word role, status indicator, owned section badge) — uniform card sizing, sorted by `sort_order`
  2. "New Agent" flow starts as a Porter chat conversation ("What kind of agent do you need?") that guides through role, skills, tools, appearance, and section assignment — creates via `POST /api/v1/agents` on confirmation
  3. `/agents/templates` shows the 30+ template catalog from `GET /api/v1/templates` with category filters and search — clicking "Use this template" calls `POST /api/v1/templates/:id/instantiate` and navigates to the new agent's workspace
  4. The PixelPortraitEditor component lets users customize skin, hair, eyes, shirt, and hair style — changes save to `appearance_spec` via `PUT /api/v1/agents/:id` and reflect everywhere the agent appears within 1 second
**Plans**: TBD

## Progress

| Phase | Milestone | Status | Completed |
|-------|-----------|--------|-----------|
| 1-7 | v1.0 | Complete | 2026-03-21 |
| 8-15 | v2.0 | Complete | 2026-03-24 |
| 20. Live Dashboard | v3.0 | Not started | — |
| 21. Agent Workspace | v3.0 | Not started | — |
| 22. Section Ownership | v3.0 | Not started | — |
| 23. Proactive Surfaces | v3.0 | Not started | — |
| 24. Agent Management | v3.0 | Not started | — |
