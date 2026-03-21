# Requirements: Porter

**Defined:** 2026-03-21
**Core Value:** Creating a project should trigger an intelligent flow that assigns agents, builds a plan, and starts work with minimal user input

## v1 Requirements (COMPLETE)

All 30 v1 requirements shipped in Milestone v1.0 (Phases 1-7). See MILESTONES.md for details.

- [x] **FOUND-01** through **FOUND-05**: Foundation (exception handling, SQLite pooling, project migration, Cortex removal, boot sequence)
- [x] **MEM-01** through **MEM-04**: Memory V2 (structured memory, real-time feed, scoping, FTS5 search)
- [x] **PROJ-01** through **PROJ-04**: Project Flow (guided wizard, auto agent assignment, dashboard, GSD plan mode)
- [x] **AGNT-01** through **AGNT-04**: Agents (scheduled work, event triggers, activity log, ephemeral agents)
- [x] **CONN-01** through **CONN-05**: Connections (GitHub, email, calendar, WhatsApp, configurable UI)
- [x] **TRNS-01** through **TRNS-03**: Transparency (activity feed, health panel, decision log)
- [x] **PERF-01** through **PERF-03**: Performance (system prompt audit, route migration, SSE hub)
- [x] **UI-01** through **UI-02**: UI Quality (CSS audit, dark/light mode)

## v2 Requirements

Requirements for Milestone v2.0: Backend Ready. All pure API — zero frontend. Frontend-v2 connects later.

### API Surface

- [x] **API-01**: All endpoints follow /api/v1/* with consistent JSON response envelopes ({ok, data, error})
- [x] **API-02**: All error responses include error code, message, and request trace ID
- [ ] **API-03**: OpenAPI spec auto-generated from route definitions

### Streaming

- [ ] **STRM-01**: Chat responses stream token-by-token via SSE to the client
- [ ] **STRM-02**: Streaming works across all AI backends (Ollama, OpenClaw, any future provider)
- [ ] **STRM-03**: Client can cancel a streaming response mid-stream and the backend stops generation

### Collaboration

- [ ] **COLLAB-01**: User can invite people to a project by email with an assigned role
- [ ] **COLLAB-02**: Per-person roles (view, chat, edit, admin) with granular permission checks on every API call
- [ ] **COLLAB-03**: Collaborators can chat with and direct project agents
- [ ] **COLLAB-04**: Project owner can revoke collaborator access

### Unified Chat

- [ ] **CHAT-01**: Single conversation API covering agent, project, and external channel messages
- [ ] **CHAT-02**: Threaded messages with parent/child relationships
- [ ] **CHAT-03**: Chat history persists across sessions with full-text search
- [ ] **CHAT-04**: External channel messages (WhatsApp, email) surface in unified conversation stream

### CRM

- [ ] **CRM-01**: Contact model supports multiple emails and phone numbers with country codes
- [ ] **CRM-02**: Social links (LinkedIn, X, GitHub) stored on contact records
- [ ] **CRM-03**: AI-powered contact analysis generated from interaction history
- [ ] **CRM-04**: Contact activity timeline aggregates all touchpoints across projects

### File Handling

- [ ] **FILE-01**: Files can be associated with projects, contacts, and conversations via API
- [ ] **FILE-02**: Upload endpoint accepts files with target context (project_id, contact_id, conversation_id)
- [ ] **FILE-03**: File metadata searchable and filterable by association, type, and date

### Agent Templates

- [ ] **TMPL-01**: 100 agent templates with complete skills, tools, and system prompt definitions
- [ ] **TMPL-02**: Templates searchable and filterable by category via API
- [ ] **TMPL-03**: Template instantiation creates a fully configured, ready-to-work agent

### Autonomous Learning

- [ ] **LEARN-01**: Agents can search external sources (web, X, Reddit, GitHub) for domain knowledge
- [ ] **LEARN-02**: Learned knowledge stored as concepts in Memory V2 with source attribution
- [ ] **LEARN-03**: Learning sessions logged with sources, confidence scores, and what was retained

### Billing

- [ ] **BILL-01**: Subscription management via Lemon Squeezy (create, upgrade, cancel, webhook handling)
- [ ] **BILL-02**: Usage metering tracks API calls, tokens consumed, and storage per workspace
- [ ] **BILL-03**: Plan limits enforced at API level (rate limiting, storage caps, agent count)

### Observability

- [ ] **OBS-01**: Frontend errors POST to /api/v1/errors with stack trace, component, user context
- [ ] **OBS-02**: Error reports queryable by severity, component, and time range

## Out of Scope

| Feature | Reason |
|---------|--------|
| Frontend UI for any v2 feature | Frontend-v2 being built separately — all v2 work is pure API |
| porter.py full deprecation | Gradual shrink — brain migrates naturally as features move to Fastify |
| Visual workflow canvas | Anti-feature — signals developer tool, incompatible with non-technical users |
| Mobile native app | Responsive web serves mobile needs |
| Self-hosting support | SaaS-only for this milestone |
| Custom model training | Per-agent directives provide equivalent customization |
| AARRR analytics | Being built by another Claude session in admin |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| API-01 | Phase 8 | Complete |
| API-02 | Phase 8 | Complete |
| API-03 | Phase 8 | Pending |
| OBS-01 | Phase 8 | Pending |
| OBS-02 | Phase 8 | Pending |
| STRM-01 | Phase 9 | Pending |
| STRM-02 | Phase 9 | Pending |
| STRM-03 | Phase 9 | Pending |
| COLLAB-01 | Phase 10 | Pending |
| COLLAB-02 | Phase 10 | Pending |
| COLLAB-03 | Phase 10 | Pending |
| COLLAB-04 | Phase 10 | Pending |
| CHAT-01 | Phase 11 | Pending |
| CHAT-02 | Phase 11 | Pending |
| CHAT-03 | Phase 11 | Pending |
| CHAT-04 | Phase 11 | Pending |
| CRM-01 | Phase 11 | Pending |
| CRM-02 | Phase 11 | Pending |
| FILE-01 | Phase 11 | Pending |
| FILE-02 | Phase 11 | Pending |
| FILE-03 | Phase 11 | Pending |
| CRM-03 | Phase 12 | Pending |
| CRM-04 | Phase 12 | Pending |
| TMPL-01 | Phase 12 | Pending |
| TMPL-02 | Phase 12 | Pending |
| TMPL-03 | Phase 12 | Pending |
| LEARN-01 | Phase 13 | Pending |
| LEARN-02 | Phase 13 | Pending |
| LEARN-03 | Phase 13 | Pending |
| BILL-01 | Phase 14 | Pending |
| BILL-02 | Phase 14 | Pending |
| BILL-03 | Phase 14 | Pending |

**Coverage:**
- v2 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

---
*Requirements defined: 2026-03-21*
*Last updated: 2026-03-21 — traceability complete, all 32 requirements mapped to Phases 8-14*
