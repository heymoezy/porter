# Porter

## What This Is

Porter is an AI orchestration platform where non-technical users create projects, agents auto-assign and work autonomously, and everything connects to the outside world. A SaaS product that lets you hop on, start a project, assign agents, and get shit done — with collaborative sessions where you can invite others to work with your projects and agents.

## Core Value

Creating a project should trigger an intelligent flow that assigns agents, builds a plan, and starts work with minimal user input — the "GSD-like flow" applied to everything Porter does.

## Current Milestone: v7.0 The Living Memory

**Status (2026-05-16):** Phase 49 Pattern Detection complete 2026-05-16. Phase 50 Multi-Silo Foundation is next. 4 phases (49-52), ~17 requirements. Trigger: 2026-05-16 YMC logo freehand incident exposed that the Dream Silos system was capturing the recurring-failure signal in transcripts but the dream worker was extracting generic structural patterns instead. v7.0 fixes that, scales memory beyond software silo, and activates the dormant Phase 43 inter-agent delegation loop.

**Phases:**
- **Phase 49 Pattern Detection (LRN-*):** Frustration-marker boost in sampler, dream prompt rewrite to extract recurring-failure patterns, project-level directive scoping (`scope='project'`).
- **Phase 50 Multi-Silo Foundation (MSF-*):** Admin silo + data-room silo + silo enrollment workflow + per-silo dream cadence.
- **Phase 51 Dreams Review UX (DRX-*):** Bulk accept/reject, edit-in-place on proposals, proposal search, live silos list endpoint.
- **Phase 52 Closed Loop Activation (CLA-*):** Task-planner agent-selection (activates Phase 43 delegation), PCP-02 tool-restrictions, deeper Bridge cleanup.

**Deferred to v8.0:** SIM-01..03 (Self-Improvement), BIL-01..03 (SaaS Billing).

**Run `/gsd:plan-phase 49` to start execution.**

**Completed milestones:**
- v1.0 Foundation + Core Platform (2026-03-21) — 7 phases, 30/30 reqs
- v2.0 Backend Ready (2026-03-24) — 9 phases, 38/41 reqs (3 billing deferred)
- v3.0 Porter Bridge (2026-03-25) — 8 phases, 46/46 reqs
- v4.0 The Arena (2026-04-02) — 6 phases, 17/17 plans (Phase 28 Battle Arena deferred)
- v5.0 Living Skills (2026-04-03) — 9 phases, 30/30 reqs
- **v6.0 The Orchestration Platform (2026-05-13)** — 12 phases, 41 plans, 60/60 reqs, archived 2026-05-15. See `.planning/milestones/v6.0-ROADMAP.md`

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
- ✓ API standardization (consistent /api/v1/* surface, envelopes, error codes, OpenAPI) — v2.0 Phase 8
- ✓ Streaming chat (token-by-token SSE from all AI backends, cancellation) — v2.0 Phase 9
- ✓ Collaborative sessions (invite by email, per-person roles, shared project/agent access) — v2.0 Phase 10
- ✓ Unified global chat (single conversation model — agents, projects, external channels) — v2.0 Phase 11
- ✓ CRM backend (multi-email, multi-phone, social links, contact auto-creation from channels) — v2.0 Phase 11
- ✓ File associations (registry with atomic upload, link to projects/contacts/conversations) — v2.0 Phase 11
- ✓ Agent templates (100 templates with complete skills/tools/system prompts) — v2.0 Phase 12
- ✓ Skills & tools architecture (DB registry, CRUD APIs, junction tables, visibility controls, forge integration) — v2.0 Phase 15
- ✓ Autonomous learning (agents search web/social/GitHub, store as Memory V2 concepts) — v2.0 Phase 13
- ✓ Gateway foundation (DB schema, adapter interface, startup detection, credential masking, Bridge API) — v3.0 Phase 16
- ✓ Resilience layer (circuit breakers, health probes, retry with backoff, N-gateway fallback chains) — v3.0 Phase 18
- ✓ Model catalog (unified model registry, capabilities, pricing, version tracking, cost per dispatch) — v3.0 Phase 19
- ✓ First-run setup (detection endpoint, zero-config Ollama, guided setup API, OpenClaw dual-role) — v3.0 Phase 21
- ✓ Bridge admin surface (7 admin endpoints, gateway CRUD, routing rules, cost analytics, SSE events) — v3.0 Phase 22
- ✓ Integration & multi-tenant (Memory V3 signals, per-agent stats, session history, user API keys, workspace overrides, usage attribution) — v3.0 Phase 23
- ✓ Smart routing engine (DB-driven gateway selection, routing rules, dispatch logging, concurrency queuing, session context) — v3.0 Phase 20
- ✓ Error capture (frontend error POST endpoint with stack traces, component context) — v2.0 Phase 8
- ✓ Bridge task dispatch (CLI subprocess + HTTP agent loop for real code execution) — v5.2
- ✓ Gateway capability registry (strengths, cost_tier, context_window, tool_support, agentic flag per gateway) — v6.0 Phase 40
- ✓ Session intelligence (frozen memory snapshots, cross-session FTS search, outcome-driven routing confidence) — v6.0 Phase 41
- ✓ Task decomposition engine (classifier → DAG → parallel executor → joiner → synthesis) — v6.0 Phase 42
- ✓ Inter-agent messaging (Porter-coordinated delegation, correlation IDs, hop limits, peer-to-peer guard) — v6.0 Phase 43
- ✓ Autonomous job queue (agent_jobs lifecycle, skill+gateway matched assignment, self-scheduled jobs) — v6.0 Phase 44
- ✓ Porter control plane (delegation doctrine, depth limits, approval gates for high-risk actions) — v6.0 Phase 45
- ✓ Project monitoring (web_search/email/rss/custom watchers, findings in activity feed, notifications) — v6.0 Phase 46
- ✓ Project substrate (canonical /_system/ directory, intelligence ingress, Atlas structural agent) — v6.0 Phase 47
- ✓ Silo foundation (silos registry table, software seed, silo-aware /context injection, /silo CLI command) — v6.0 Phase 48.1
- ✓ Transcript capture (Stop + UserPromptSubmit hooks, PII scrub, 30-day retention, /silo none kill switch) — v6.0 Phase 48.2
- ✓ Software dream worker (weekly Sonnet 4.6 raw-passthrough consolidation, refine-don't-append doctrine, memory_proposals) — v6.0 Phase 48.3
- ✓ Dream review surface (admin /dreams page, transactional 4-kind accept matrix, auto-expiry, SSE-driven UI) — v6.0 Phase 48.4
- ✓ Pattern detection — frustration-marker sampling boost (Pass A0 + recency-first force-include), dream prompt rewrite for recurring-failure extraction (failure_patterns), project-level directive scoping (`scope='project'` + partial index), cwd→project derivation (detectProject + detectContext), smoke harness — v7.0 Phase 49 (LRN-01..05)

### Active (v7.0 Living Memory — 12 requirements remaining)

- [ ] **MSF-01..04:** Multi-silo foundation — admin + data-room silos, enrollment workflow, per-silo cadence (Phase 50)
- [ ] **DRX-01..04:** Dreams review UX — bulk actions, edit-in-place, search, silos endpoint (Phase 51)
- [ ] **CLA-01..03:** Closed loop activation — task-planner agent-selection, PCP-02 tool-restrictions, Bridge deeper cleanup (Phase 52)

### Out of Scope

- Mobile native app — web-first, responsive design
- Self-hosting support — SaaS-only for now
- Custom model training — use existing model providers via routing
- Video/voice calling — chat and messaging only

## Context

Porter has been in development since Feb 18, 2026. Current version is v6.12.0. Single monorepo, single Fastify process on :3001.

**Phase 48.1 silo-foundation (2026-05-11):** Dream Silos series substrate landed. `silos` table seeded with the software development silo, deterministic cwd-based detection injects a labeled `## Silo: Software Development — Operating Rules` section into `/api/v1/intellect/context` for code-project sessions, `/silo software | none | <id>` slash command persists per-session overrides via UserPromptSubmit hook, and the SessionStart hook now forwards `session_id` + `cwd` so the silo header reaches fresh Claude CLI sessions. Moe-direct directives are sealed at the DB layer (`directive_immutable_moe_direct` trigger) with a `SET LOCAL` bypass for memory-pruner. First piece of the silo-scoped reinforcement-learning system Moe specified in feedback_dream_silos.

**Phase 48.2 transcript-capture (2026-05-13):** Raw substrate for the dream worker (48.3). `session_transcript_turns` table with composite index `(silo_id, captured_at DESC)` for the 48.3 read pattern, single-writer endpoint `POST /api/v1/intellect/transcript/turn` orchestrating silo lookup → /silo none kill switch → shared PII scrub → server-assigned `turn_index` with single retry on race + content+timestamp dedup. Two hooks deployed: extended `porter-user-prompt.js` (third branch captures user turns, skips `/silo` commands) and NEW `porter-stop.js` (tails transcript JSONL from per-session byte-offset bookmark, advances only past successfully-POSTed lines). 30-day hard-delete retention runs daily via the workflow engine + manual `/transcript/retention-run` endpoint. Global kill switch `intellect.transcriptCaptureEnabled` layered on top of per-session `/silo none`. 633 live captures already in DB by phase verification time — pipeline is live and working autonomously across all active CLI sessions.

**Phase 48.3 software-dream-worker (2026-05-13):** Consciousness layer of the Dream Silos series. `dream-worker.ts` orchestrates a weekly pipeline: deterministic stratified sampling (40/30/20/10 by recency + imperative-phrasing force-include + byte cap) of the software silo's last 7 days of transcript turns → direct `routingEngine.selectWithFallback` dispatch with raw passthrough by omission (no buildMemoryContext / no skill selection / no doctrine wiring, proven empirically by NULL `agent_id`/`project_id`/`chat_id`/`skills_used`/`dispatch_strategy` in bridge_dispatch_log) → Zod-validated JSON parse → three-layer Refinement Doctrine enforcement (prompt template → `validateRefinementDoctrine` → DB `sort_order` column) → all-or-nothing transactional INSERT into `memory_proposals`. `dream_runs` table tracks each invocation with dispatch_id audit trail. 5 pre-flight guards (concurrency, skip-recent, empty-corpus, sealed-seed, hallucinated-target). Manual trigger via `POST /api/v1/intellect/dream-run` (127.0.0.1-only, 202 + setImmediate). Stuck-run sweep every 30 minutes. **Live verification with real Sonnet 4.6 dispatch (6362 output tokens) proved Layer 2 doctrine fires on production data — the refine-before-append guardrail works.** Surfaced and fixed 4 dormant production bugs during live-verify, most critically the Bridge circuit breaker `action` had been a no-op since opossum 9 adoption (dormant repo-wide because chat goes through dispatchStream which bypasses `breaker.fire`; dream-worker was the first non-streaming consumer to await the result).

**Phase 48.4 review-surface (2026-05-13):** Final phase. Closes the Dream Silos loop. `backend/src/routes/admin/dreams.ts` (469 LOC) exposes 5 admin endpoints (list proposals + accept + reject + list runs + run detail) all gated by `requirePlatformAdmin`. Transactional 4-kind accept matrix with FOR UPDATE row locks, pre-flight `SEALED_SEED` + `SILO_MISMATCH` + `TARGET_GONE` checks, soft-delete via `status='archived'`, audit `intellect_events` row with correct `sessionUser.username` (caught and fixed a wrong-property bug in planning), post-commit SSE broadcasts. Reject endpoint symmetric — also transactional. Auto-expiry via new `memory_proposals_expire` workflow action tagged `every_24h`. Frontend `/dreams` route in Admin with sidebar Moon nav, list view (silo filter + status filter + Run Now button), `ProposalDetailDrawer` with `DiffBlock` preview for merge/supersede, sonner toasts for 6 failure codes, Dialog confirmation for delete-kind. **The SSE refactor (`use-admin-sse.ts` from `onmessage` → 20 `addEventListener` calls) flushed a SECOND dormant repo-wide infrastructure bug — backend has been broadcasting named SSE events since v3.0 that the frontend EventSource never received because `onmessage` only fires for unnamed events. After this phase ships, every existing live-update surface (bridge dispatch ticker, capacity bars, gateway cards, msg-bus feed, profile updates) starts working for the first time. Autonomous 9-step live verification (Moe unavailable) ran the full pipeline end-to-end: mock dream-run → SSE pulse received → accept endpoint → new directive landed in `directives` table → injected into next CLI session's silo context. **Dream Silos series complete: 4 phases, 20 plans, 40 requirements, full closed loop (capture → dispatch → propose → review → directive update → next-session refinement).**

**Backend** (`backend/src/`): TypeScript, Fastify 5, Drizzle ORM, PostgreSQL. Brain + Admin merged. All routes on :3001.

**Admin** (`admin/frontend/`): React Router 7 + shadcn/ui + Tailwind 4. Served as static files by Brain.

**Bridge** (`backend/src/services/bridge/`): 5 gateway adapters (Claude CLI, Codex CLI, Gemini CLI, OpenClaw, Ollama). Routing engine, circuit breakers, dispatch logging, task execution (CLI + HTTP). Inter-agent messaging endpoint exists but coordination layer missing.

**Key gap:** Bridge is currently a chat router, not an orchestration platform. The coordination layer (task decomposition, job queues, agent-to-agent delegation, autonomous operation) was designed in research docs but never built. v6.0 closes this gap.

## Constraints

- **Architecture**: Single Fastify process on :3001. Brain serves admin frontend static files.
- **Runtime**: Linux VPS, 8GB RAM + 8GB swap, 2 vCPU AMD EPYC, 96GB disk, no GPU
- **Single DB**: PostgreSQL 16 — single source of truth
- **Backwards compatibility**: Existing Playwright tests must keep passing
- **All gateways**: Bridge must support ALL 5 gateways equally (Claude CLI, Codex CLI, Gemini CLI, OpenClaw, Ollama)
- **No port 5175**: Everything on :3001. Dead admin backend must never be referenced.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Gradual monolith split (porter.py → Fastify) | 900KB monolith unmaintainable, but full rewrite too risky | ✓ Working — v1.0 migrated core routes |
| Project flow is first priority | Core value is "create project, agents work" — everything else builds on this | ✓ Shipped — guided wizard in Phase 5 |
| SaaS product model with collaborative sessions | Unique differentiator: invite people to work with your projects and agents | ✓ Shipped v2.0 Phase 10 |
| Account-level + project-level connections | Flexibility: connect GitHub once, override per project if needed | ✓ Shipped Phase 7 |
| Memory V2 must filter noise (logins, uploads) | Current system captures everything, dilutes actual learning | ✓ Shipped Phase 2 |
| porter.py fully deprecated | All AI routing, SSE, streaming now in Fastify. porter.py stopped+disabled. | ✓ Completed 2026-03-24 |
| SQLite fully eliminated | Both Brain and Admin on PostgreSQL. better-sqlite3 removed. | ✓ Completed 2026-03-25 |
| Bridge as major innovation | AI gateway management is Porter's differentiator — first-run detection, smart routing, cost tracking | ✓ Shipped v3.0 |
| Skills must be live behavioral modules, not catalog entries | OpenClaw audit revealed skills_text is static prose, template_skills empty, no runtime selection, no feedback loop | ✓ Shipped v5.0 |
| DB assignments are source of truth for skills | skills_text / JSONB arrays are legacy; template_skills + persona_skills junction tables are canonical | ✓ Shipped v5.0 |
| SKILLS.md is a thin manifest, not prose | Generated from DB assignments at instantiate-time, points to pack roots, no duplication | ✓ Shipped v5.0 |
| Bridge task dispatch (v5.2) | CLI subprocess + HTTP agent loop for real code execution | ✓ Verified — Claude + Codex + Gemini all working |
| Brain + Admin merge | One process, one port, one version number | ✓ Shipped v5.0 |
| porter.py deleted | Fastify is sole backend | ✓ Complete |
| Orchestration is THE feature | Not a chat router — task decomposition + agent coordination | ✓ Shipped v6.0 |
| Bridge consolidated to claude_cli only | OpenClaw/Ollama/Codex/Gemini removed during v6.0 (v6.9.0 strip, v6.14/v6.15 isolation+raw, v6.0.1 admin cleanup). Single-backend posture is the new floor. | ✓ Shipped v6.0 |
| Three-layer Refinement Doctrine for Dream Silos | Prompt instruction + worker `validateRefinementDoctrine` + DB `sort_order` enforce refine-before-append at write-time AND display-time | ✓ Shipped v6.0 Phase 48.3 |
| Raw passthrough by omission (not a flag) | Dream-worker omits `agentId`/`projectId`/`skillsUsed`/`directiveStats`/`dispatchStrategy` instead of `raw: true`. Memory V3 / skills / doctrine only engage when fields are set. Verified empirically on live Sonnet dispatch. | ✓ Shipped v6.0 Phase 48.3 |
| Silo-scoped reinforcement learning is first-class scope | `scope='silo'`, parallel to global/project/agent. Cross-silo bleed impossible by construction. Software silo seeded with 4 sealed `moe-direct` directives. | ✓ Shipped v6.0 Phase 48 series |
| Wave 0 smoke harness pattern | Phases 48.1-48.4 each shipped tests/smoke-48.X.sh BEFORE implementation plans. Every downstream task got a single-shot `<verify>` command. Pattern established as standard for future complex phases. | ✓ Shipped v6.0 |
| Hooks live outside Porter repo | `porter-user-prompt.js` + `porter-stop.js` are global Claude Code hooks at `/home/lobster/.claude/hooks/`. Deliberately uncommitted; full contents reproduced in plan SUMMARYs for re-deployment. | ✓ Shipped v6.0 Phase 48.1-48.2 |

---
*Last updated: 2026-05-16 — Phase 49 Pattern Detection complete; Phase 50 Multi-Silo Foundation is next.*
