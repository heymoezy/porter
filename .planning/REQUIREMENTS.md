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
- [x] **API-03**: OpenAPI spec auto-generated from route definitions

### Streaming

- [x] **STRM-01**: Chat responses stream token-by-token via SSE to the client
- [x] **STRM-02**: Streaming works across all AI backends (Ollama, OpenClaw, any future provider)
- [x] **STRM-03**: Client can cancel a streaming response mid-stream and the backend stops generation

### Collaboration

- [x] **COLLAB-01**: User can invite people to a project by email with an assigned role
- [x] **COLLAB-02**: Per-person roles (view, chat, edit, admin) with granular permission checks on every API call
- [x] **COLLAB-03**: Collaborators can chat with and direct project agents
- [x] **COLLAB-04**: Project owner can revoke collaborator access

### Unified Chat

- [x] **CHAT-01**: Single conversation API covering agent, project, and external channel messages
- [x] **CHAT-02**: Threaded messages with parent/child relationships
- [x] **CHAT-03**: Chat history persists across sessions with full-text search
- [x] **CHAT-04**: External channel messages (WhatsApp, email) surface in unified conversation stream

### CRM

- [x] **CRM-01**: Contact model supports multiple emails and phone numbers with country codes
- [x] **CRM-02**: Social links (LinkedIn, X, GitHub) stored on contact records
- [x] **CRM-03**: AI-powered contact analysis generated from interaction history
- [x] **CRM-04**: Contact activity timeline aggregates all touchpoints across projects

### File Handling

- [x] **FILE-01**: Files can be associated with projects, contacts, and conversations via API
- [x] **FILE-02**: Upload endpoint accepts files with target context (project_id, contact_id, conversation_id)
- [x] **FILE-03**: File metadata searchable and filterable by association, type, and date

### Agent Templates

- [x] **TMPL-01**: 100 agent templates with complete skills, tools, and system prompt definitions
- [x] **TMPL-02**: Templates searchable and filterable by category via API
- [x] **TMPL-03**: Template instantiation creates a fully configured, ready-to-work agent

### Autonomous Learning

- [x] **LEARN-01**: Agents can search external sources (web, X, Reddit, GitHub) for domain knowledge
- [x] **LEARN-02**: Learned knowledge stored as concepts in Memory V2 with source attribution
- [x] **LEARN-03**: Learning sessions logged with sources, confidence scores, and what was retained

### PostgreSQL Migration

- [x] **PG-01**: All Drizzle schemas ported from SQLite to PostgreSQL (types, constraints, indexes)
- [x] **PG-02**: All raw SQL queries converted from SQLite dialect to PostgreSQL
- [x] **PG-03**: FTS5 virtual tables replaced with tsvector + GIN indexes
- [ ] **PG-04**: Data migration script moves all existing SQLite data to PostgreSQL with zero loss

### Memory V3

- [x] **MEMV3-01**: Structured state tables (directives, project_notes, agent_notes) with migration from concepts
- [x] **MEMV3-02**: Tiered injection pipeline reading structured state before archival search
- [x] **MEMV3-03**: Concept consolidation service merging similar concepts by content similarity
- [x] **MEMV3-04**: Agent self-edit memory API (promote/dismiss/edit concepts during runs)
- [x] **MEMV3-05**: Admin memory aggregation endpoints (counts per agent, health scores, pending review queue)

### Billing

- [ ] **BILL-01**: Subscription management via Lemon Squeezy (create, upgrade, cancel, webhook handling)
- [ ] **BILL-02**: Usage metering tracks API calls, tokens consumed, and storage per workspace
- [ ] **BILL-03**: Plan limits enforced at API level (rate limiting, storage caps, agent count)

### Skills & Tools Architecture

- [ ] **SKL-01**: skills PostgreSQL table with full schema (name, description, category, source, enabled/visible/featured toggles, icon, color, cover_image, short_label, sort_order, config_schema) + 37 skills seeded from SKILL_CATALOG
- [ ] **SKL-02**: tools PostgreSQL table with full schema (name, description, category, type system/integration, enabled/visible/featured toggles, icon, color, cover_image, short_label, sort_order, config_schema, requires, version) + 15 tools seeded (6 system + 9 integration)
- [ ] **SKL-03**: template_skills and template_tools junction tables populated from existing agent_templates JSONB arrays, replacing JSONB as relational source of truth
- [ ] **SKL-04**: Admin skills CRUD API (GET list/single/categories/featured, POST create, PUT update, DELETE) with Zod validation — SKILL_CATALOG constant removed
- [ ] **SKL-05**: Admin tools CRUD API (GET list/single/categories/featured, POST create, PUT update, DELETE) with Zod validation — environment_tools replaced by tools table
- [ ] **SKL-06**: Forge Station 2 (Trainer) and Station 3 (Outfitter) read from junction tables with JSONB fallback
- [ ] **SKL-07**: Template instantiation writes deployed_by field on persona and sources skills/tools config from junction tables

### Observability

- [x] **OBS-01**: Frontend errors POST to /api/v1/errors with stack trace, component, user context
- [x] **OBS-02**: Error reports queryable by severity, component, and time range

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
| API-03 | Phase 8 | Complete |
| OBS-01 | Phase 8 | Complete |
| OBS-02 | Phase 8 | Complete |
| STRM-01 | Phase 9 | Complete |
| STRM-02 | Phase 9 | Complete |
| STRM-03 | Phase 9 | Complete |
| COLLAB-01 | Phase 10 | Complete |
| COLLAB-02 | Phase 10 | Complete |
| COLLAB-03 | Phase 10 | Complete |
| COLLAB-04 | Phase 10 | Complete |
| CHAT-01 | Phase 11 | Complete |
| CHAT-02 | Phase 11 | Complete |
| CHAT-03 | Phase 11 | Complete |
| CHAT-04 | Phase 11 | Complete |
| CRM-01 | Phase 11 | Complete |
| CRM-02 | Phase 11 | Complete |
| FILE-01 | Phase 11 | Complete |
| FILE-02 | Phase 11 | Complete |
| FILE-03 | Phase 11 | Complete |
| CRM-03 | Phase 12 | Complete |
| CRM-04 | Phase 12 | Complete |
| TMPL-01 | Phase 12 | Complete |
| TMPL-02 | Phase 12 | Complete |
| TMPL-03 | Phase 12 | Complete |
| LEARN-01 | Phase 13 | Complete |
| LEARN-02 | Phase 13 | Complete |
| LEARN-03 | Phase 13 | Complete |
| PG-01 | Phase 13.05 | Complete |
| PG-02 | Phase 13.05 | Complete |
| PG-03 | Phase 13.05 | Complete |
| PG-04 | Phase 13.05 | Pending |
| MEMV3-01 | Phase 13.1 | Complete |
| MEMV3-02 | Phase 13.1 | Complete |
| MEMV3-03 | Phase 13.1 | Complete |
| MEMV3-04 | Phase 13.1 | Complete |
| MEMV3-05 | Phase 13.1 | Complete |
| BILL-01 | Phase 14 | Pending |
| BILL-02 | Phase 14 | Pending |
| BILL-03 | Phase 14 | Pending |
| SKL-01 | Phase 15 | Pending |
| SKL-02 | Phase 15 | Pending |
| SKL-03 | Phase 15 | Pending |
| SKL-04 | Phase 15 | Pending |
| SKL-05 | Phase 15 | Pending |
| SKL-06 | Phase 15 | Pending |
| SKL-07 | Phase 15 | Pending |

**Coverage:**
- v2 requirements: 48 total
- Mapped to phases: 48
- Unmapped: 0

---
*Requirements defined: 2026-03-21*
*Last updated: 2026-03-24 — Phase 15 Skills & Tools requirements added (SKL-01 through SKL-07)*
