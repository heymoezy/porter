# Roadmap: Porter

## Milestones

- **v1.0 Foundation + Core Platform** - Phases 1-7 (shipped 2026-03-21) — see MILESTONES.md
- **v2.0 Backend Ready** - Phases 8-14 (active)

## Phases

<details>
<summary>v1.0 Foundation + Core Platform (Phases 1-7) — SHIPPED 2026-03-21</summary>

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

---

### v2.0 Backend Ready (Active)

**Milestone Goal:** A complete, consistent, API-first backend — all v2 features accessible via curl before any frontend connects.

- [x] **Phase 8: API Foundation** - Standardize all endpoints to /api/v1/*, add error codes with trace IDs, auto-generate OpenAPI spec, capture frontend errors (completed 2026-03-21)
- [x] **Phase 9: Streaming Chat** - Native token-by-token SSE streaming from all AI backends with clean mid-stream cancellation (completed 2026-03-22)
- [x] **Phase 10: Collaborative Sessions** - Invite by email, per-project roles (view/chat/edit/admin), RBAC enforcement on every project-scoped route (completed 2026-03-22)
- [ ] **Phase 11: Unified Chat and CRM Schema** - Single conversation model for all message sources, multi-value CRM contacts, file associations via single upload endpoint
- [ ] **Phase 12: CRM Intelligence and Agent Templates** - AI-powered contact analysis from interaction history, searchable 30+ agent template catalog with one-call instantiation
- [ ] **Phase 13: Autonomous Learning** - Agents search web/GitHub/Reddit, store GDPR-safe concepts in Memory V2 with source attribution and confidence scores
- [ ] **Phase 14: Billing Enforcement** - Lemon Squeezy subscription management, usage metering, atomic plan limit enforcement on all resource-creating routes

## Phase Details

### Phase 8: API Foundation
**Goal**: Every API endpoint returns a consistent `{ok, data, error}` envelope, every error carries a SCREAMING_SNAKE_CASE code and trace ID, a machine-readable OpenAPI spec is auto-generated from existing Zod schemas, and frontend errors can be POSTed and queried
**Depends on**: Phase 7 (v1.0 complete)
**Requirements**: API-01, API-02, API-03, OBS-01, OBS-02
**Success Criteria** (what must be TRUE):
  1. `curl /api/v1/projects` returns `{"ok": true, "data": [...]}` — same envelope structure verified across all 17 route groups, not just new ones
  2. `curl /api/v1/nonexistent` returns `{"ok": false, "error": {"code": "NOT_FOUND", "message": "...", "trace_id": "uuid"}}` with the same trace ID echoed in the X-Request-ID response header
  3. `curl /api/v1/openapi.json` returns a valid OpenAPI 3.x document with all routes, request schemas, and response envelopes documented
  4. `curl -X POST /api/v1/errors -d '{"message":"TypeError","component":"ChatPanel","stack":"...","user_id":1}'` returns 201; `curl /api/v1/errors?severity=error&component=ChatPanel` returns the stored report
**Plans:** 2/2 plans complete

Plans:
- [x] 08-01-PLAN.md — Envelope upgrade + trace ID + route conformance (API-01, API-02)
- [x] 08-02-PLAN.md — OpenAPI spec generation + frontend error capture (API-03, OBS-01, OBS-02)

### Phase 9: Streaming Chat
**Goal**: Chat responses stream token-by-token to clients via SSE — first token arrives under 2 seconds, cancellation stops upstream AI generation, and all AI backends stream through the same code path
**Depends on**: Phase 8
**Requirements**: STRM-01, STRM-02, STRM-03
**Success Criteria** (what must be TRUE):
  1. `curl -N /api/v1/chat/stream -d '{"message":"explain recursion"}'` receives the first `data:` SSE event within 2 seconds — time_to_first_token is measurably less than total response time
  2. Closing the curl connection mid-stream causes Ollama and OpenClaw generation to abort within 1 second — no orphaned backend processes continue consuming CPU or tokens
  3. Switching the AI router to any registered backend (Ollama, OpenClaw, future provider) produces the same SSE event format — no provider-specific code paths exist in the route handler or stream service
**Plans:** 2/2 plans complete

Plans:
- [ ] 09-01-PLAN.md — StreamService with StreamBackend interface, Ollama + OpenClaw backends, unit tests (STRM-01, STRM-02, STRM-03)
- [ ] 09-02-PLAN.md — POST /api/v1/chat/stream SSE route, legacy stub cleanup, integration validation (STRM-01, STRM-02, STRM-03)

### Phase 10: Collaborative Sessions
**Goal**: Project owners can invite people by email, assign roles, and every subsequent API call on that project enforces the caller's role — collaborators with chat access can direct agents, revocation is immediate
**Depends on**: Phase 8
**Requirements**: COLLAB-01, COLLAB-02, COLLAB-03, COLLAB-04
**Success Criteria** (what must be TRUE):
  1. `POST /api/v1/projects/:id/collaborators` with `{"email":"alice@example.com","role":"chat"}` creates a pending invitation and triggers an email — the invited user can accept and access the project
  2. A user with role "view" on project A receives 403 on any mutation endpoint (POST/PATCH/DELETE) for that project — the check happens in a shared middleware, not duplicated in each handler
  3. A user with role "chat" on a project can `POST /api/v1/projects/:id/messages` and receive a response from an assigned agent — the agent receives the collaborator's identity in its context
  4. `DELETE /api/v1/projects/:id/collaborators/:user_id` by the project owner returns 200 and immediately blocks that user's subsequent requests with 403
  5. A collaborator authenticated to project A who sends requests to project B's endpoints receives 403 — IDOR is blocked at the `requireProjectAccess` middleware layer, not in individual handlers
**Plans:** 3/3 plans complete

Plans:
- [ ] 10-01-PLAN.md — Schema, migration, role types, requireProjectAccess middleware (COLLAB-02)
- [ ] 10-02-PLAN.md — Collaborator CRUD routes, invite/accept flow, email, drip scheduling (COLLAB-01, COLLAB-04)
- [ ] 10-03-PLAN.md — Route enforcement across all project endpoints, agent identity injection (COLLAB-02, COLLAB-03)

### Phase 11: Unified Chat and CRM Schema
**Goal**: All messages — agent, project, WhatsApp inbound, email inbound — flow through a single conversations/messages API; CRM contacts hold multiple emails, phones, and social links; files attach to any entity atomically
**Depends on**: Phase 10
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CRM-01, CRM-02, FILE-01, FILE-02, FILE-03
**Success Criteria** (what must be TRUE):
  1. `GET /api/v1/conversations/:id/messages` returns both AI-generated messages and inbound WhatsApp/email messages in a single chronological array — no separate endpoints or joined arrays needed
  2. `POST /api/v1/conversations/:id/messages` with `{"parent_id": 42, "content": "..."}` creates a threaded reply; `GET` returns messages with `children` arrays preserving the parent/child tree
  3. `GET /api/v1/conversations?q=budget+review` returns conversations with matching message content, ranked by relevance — FTS5 search across the full message corpus
  4. `PATCH /api/v1/contacts/:id` with `{"emails":[{"value":"a@b.com","label":"work"}],"phones":[{"value":"+6591234567","country_code":"SG"}],"social":{"linkedin":"...","x":"..."}}` stores all multi-value fields and returns them on subsequent GET
  5. `POST /api/v1/files/upload` with `project_id=X` uploads the file and creates the association atomically — if the insert fails, the file is not stored; `GET /api/v1/files?project_id=X` returns it; same behavior for `contact_id` and `conversation_id`
**Plans:** 4/5 plans executed

Plans:
- [ ] 11-01-PLAN.md — Schema migration, Drizzle definitions, FTS5 triggers, smoke test script (all reqs)
- [ ] 11-02-PLAN.md — Conversations API: CRUD, threading, FTS5 search (CHAT-01, CHAT-02, CHAT-03)
- [ ] 11-03-PLAN.md — CRM contacts + file registry with atomic upload (CRM-01, CRM-02, FILE-01, FILE-02, FILE-03)
- [ ] 11-04-PLAN.md — WhatsApp inbound channel integration (CHAT-04)
- [ ] 11-05-PLAN.md — Email inbound + outbound message archival (CHAT-04)

### Phase 12: CRM Intelligence and Agent Templates
**Goal**: Contacts get AI-powered analysis generated asynchronously from their real interaction history; 30+ agent templates are searchable by category and instantiate into fully configured, ready-to-work agents in one API call
**Depends on**: Phase 11
**Requirements**: CRM-03, CRM-04, TMPL-01, TMPL-02, TMPL-03
**Success Criteria** (what must be TRUE):
  1. `POST /api/v1/contacts/:id/analyze` returns 202 immediately and queues an async job; after the job completes, `GET /api/v1/contacts/:id` includes `{"ai_analysis": "..."}` derived from that contact's actual message history — not a generic template
  2. `GET /api/v1/contacts/:id/timeline` returns all touchpoints (messages sent/received, project events, file uploads) in descending chronological order with type labels — no touchpoint type missing
  3. `GET /api/v1/templates?category=marketing` returns all templates in that category, each with `skills`, `tools`, and `system_prompt` fields fully populated — zero templates with empty required fields
  4. `POST /api/v1/templates/:id/instantiate` returns a ready agent record (201) when required backends and tools are available; returns 422 with a specific reason when they are not — no silent partial instantiation
**Plans**: TBD

### Phase 13: Autonomous Learning
**Goal**: Agents can be directed to acquire domain knowledge from web, GitHub, and Reddit; learned knowledge is stored as Memory V2 concepts with full attribution and confidence scores; no personal identifiers are stored; session caps and robots.txt are respected
**Depends on**: Phase 12
**Requirements**: LEARN-01, LEARN-02, LEARN-03
**Success Criteria** (what must be TRUE):
  1. `POST /api/v1/agents/:id/learn` with `{"topic":"TypeScript streaming patterns","sources":["web","github"]}` returns 202; after the session completes, `GET /api/v1/memory/concepts?agent_id=:id` shows new concepts attributed to source URLs from this session
  2. Every concept stored from a learning session has `source_url` and `confidence_score` fields populated — grepping the stored concept corpus for email addresses, @usernames, or full personal names returns zero results
  3. `GET /api/v1/agents/:id/learning-sessions` returns a log with `sources_visited`, `concepts_retained`, `confidence_distribution`, and `capped: true` for any session that hit the 20-request limit — all fields present on every record
**Plans**: TBD

### Phase 14: Billing Enforcement
**Goal**: Lemon Squeezy subscriptions are created, updated, and cancelled via idempotent webhook handling; every resource-creating route meters usage atomically; plan limits are enforced under concurrent load with no bypass possible
**Depends on**: Phase 13
**Requirements**: BILL-01, BILL-02, BILL-03
**Success Criteria** (what must be TRUE):
  1. Replaying the same Lemon Squeezy `subscription_created` webhook 3 times results in exactly one subscription record — idempotency key enforced in a single transaction
  2. `GET /api/v1/billing/usage` returns current-period counts for API calls, tokens consumed, storage bytes, and agent count — each count is accurate within 1 request of the true value
  3. A workspace at its Free plan agent limit receives 402 on `POST /api/v1/agents` with `{"code":"PLAN_LIMIT_EXCEEDED","upgrade_url":"..."}` — sending 10 concurrent creation requests results in exactly N successful agents where N equals the plan limit
  4. When the billing service is unreachable, resource-creating routes log the failure, allow the request through, and return 2xx — not 500
**Plans**: TBD

## Progress

**Execution Order:** 8 -> 9 -> 10 -> 11 -> 12 -> 13 -> 14

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7. Foundation through Connections | v1.0 | 51/51 | Complete | 2026-03-21 |
| 8. API Foundation | v2.0 | 2/2 | Complete | 2026-03-21 |
| 9. Streaming Chat | 2/2 | Complete   | 2026-03-22 | - |
| 10. Collaborative Sessions | 3/3 | Complete    | 2026-03-22 | - |
| 11. Unified Chat and CRM Schema | 4/5 | In Progress|  | - |
| 12. CRM Intelligence and Agent Templates | v2.0 | 0/TBD | Not started | - |
| 13. Autonomous Learning | v2.0 | 0/TBD | Not started | - |
| 14. Billing Enforcement | v2.0 | 0/TBD | Not started | - |
