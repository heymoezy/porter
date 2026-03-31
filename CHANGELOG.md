## v3.4.1 (2026-03-31)

**Bridge UX polish**

- refactor: merged Model Scout + Route Analyst into single "Models & Routing" tab (3 tabs instead of 4)
- fix: admin UI served at root / instead of /admin/ prefix
- fix: operator activity card height — proper border, no overlap with gateway cards
- fix: Ollama shows 0% used with ∞ No limit (local model, no provider limits)
- fix: OpenClaw usage from `openclaw status --usage` — real provider quota, not session context
- fix: day parsing in OpenClaw reset countdown ("3d 0h" was returning null)

## v3.4.0 (2026-03-31)

**Multi-model session: usage collection overhaul + gateway sniffer**

- feat: Codex JSONL rate-limit parsing — reads `token_count` events for real % (Codex CLI)
- feat: `upsertUsageFallback` prevents raw SQLite counts from overwriting provider percentages
- feat: `POST /api/admin/bridge/capacity/refresh` — force fresh collection with token refresh
- feat: Refresh Usage button on gateway cards calls backend instead of just invalidating cache
- feat: gateway activity sniffer — detects session transitions, emits `bridge:activity` SSE
- feat: Claude OAuth auto-refresh — collector refreshes expired tokens via refresh_token grant
- feat: Bridge nav badge — warning counter for pending updates/installs
- feat: hooks detail view — click to expand actual hook configurations inline
- fix: admin version in lower nav — was reading wrong package.json (3 levels up vs 2)
- fix: changelog page back button
- test: `extractCodexRateLimitsFromJsonl` unit tests (Codex CLI)

## v3.3.2 (2026-03-29)

- docs: make `BRIDGE.md` canonical location explicit from repo root and backend workspace
- fix: standardize stream request naming on `backend` instead of legacy `backendHint`
- fix: align repo version markers (`package.json`, backend package, workspace docs)

## v3.3.1 (2026-03-29)

- feat: hooks badge clickable — opens file editor to view/edit hooks
- feat: operator activity shows live CLI usage from all gateways
- fix: gateway card UX — refresh icon, confirm restart, inline config, usage refresh
- fix: remove token count from usage bars
- feat: REAL Claude usage from Anthropic headers — 1 Haiku call, exact %
- feat: Claude usage API (/api/oauth/usage) wired into collector
- fix: pct used from requests or tokens, shows tracking when no limit
- feat: anthropic-ratelimit-* header support + CLI rate limit detection
- fix: show % used in label, tokens only below bar, drop request count
- fix: usage blocks show requests + tokens together, human-readable reset times
- feat: local CLI usage collector — real usage data from Claude JSONL + Codex SQLite
- fix: real provider limits + proper period labels
- fix: usage limits show exactly 2 rows — Quota + Weekly
- feat: per-model rate limits with daily/weekly/hourly periods
- feat: Claude-style usage meters — percentage, reset countdown, clean bars
- fix: RPM → Requests/min, TPM → Tokens/min — plain English labels
- fix: capacity bars + metrics — data key mismatch, latency formatting, 429 display
- feat: rate limit tracking + capacity UI on Bridge gateway cards
- feat: Bridge unification — all chat streams through routing engine
- fix: center OrgConnector on architecture page
- fix: Bridge green, Forge red, Recall blue + OrgConnector replaces arrows
- fix: Forge color distinct from Bridge, bidirectional pulsing arrows
- fix: "Pixel portrait identity" → "Unique avatar for each agent"
- fix: move tagline to How it works section, add description
- fix: remove all ports from architecture page, rename section to "What is Porter?"
- fix: remove system stats from architecture top, rewrite intro
- fix: architecture — Recall as shared memory layer, remove data layer, rename repo section
- feat: architecture page rebuilt around Bridge, Forge, Recall pillars
- docs: PRODUCT.md — Bridge, Forge, Recall as the 3 pillars
- docs: add quick version to REVENUE.md
- fix: admin frontend base path /admin/ so assets load on :3001
- docs: REVENUE.md — plain English revenue model
- fix: root route redirects to /admin/
- feat: porter setup CLI + PRODUCT.md


## v3.3.0 (2026-03-29)

**PORT MERGE — one Fastify, one port.**

- Brain (:3001) absorbs Admin (:5175) — single process, single port
- Admin routes at /api/admin/*, Brain routes at /api/v1/*, admin frontend at /admin/*
- Admin SSE endpoint merged into Brain
- Gateway version probing runs from Brain startup
- Admin auth plugin (porter_admin_session + porter_session cookies)
- Killed porter-admin.service — one systemd unit (porter-fastify)
- "Porter Admin" → "Porter" across all UI
- Unified changelog (admin + brain merged into one file)
- Install button on gateway cards for uninstalled gateways
- Changelog parser handles prefixed versions (Admin v2.10.0, Brain v3.0.1)

## v3.2.0 (2026-03-29)

- **MONOREPO MERGE:** Porter Brain + Porter Admin merged into single repo
- feat: system prompt pipeline — directives from Brain DB injected into every dispatch
- feat: memory-injection wired into ai-router.ts (was missing for agent dispatches)
- feat: porter-ctx CLI launcher — context banner, gateway status, project picker
- feat: SessionStart hook auto-loads checkpoint, git log, directives for Claude Code
- feat: hook visibility on Bridge gateway cards (detect per-gateway hook configs)
- feat: update button on gateway cards with "Update" label
- feat: operator activity log shows health, circuits, versions, intelligence feed
- fix: OpenClaw model name (openclaw not openai-codex/gpt-5.4), auth token, chatCompletions enabled
- fix: killed all :8877 references — Brain is :3001
- fix: removed porter-ui as active product — Porter = Brain + Admin, API metering model
- fix: Brain directives (15) + concepts (9) populated (were empty)
- fix: all gateway workspace files (OpenClaw, Gemini, Codex) updated with correct architecture
- fix: architecture page — removed porter-ui, added Bridge + Memory V3, removed planned agents
- chore: nav reorder (Bridge → Recall → System), Brain renamed to System
- chore: stale checkpoints deleted, one canonical checkpoint for all models
- chore: deprecated .agent-collab/ mailbox — use Bridge API

## Admin v2.10.0 (2026-03-28)

**System Prompt Pipeline — see exactly what Porter sends to each gateway.**

- New prompt-pipeline service: constructs initialization prompt per gateway
  - Layer 1: Agent identity (Bridge Operator system prompt from DB)
  - Layer 2: Agent soul (SOUL.md from personas dir)
  - Layer 3: Directives (workspace rules from DB)
  - Layer 4: Gateway-specific instructions
- Prompt button (📄) on each gateway card shows:
  - Current hardcoded PORTER_SYSTEM prompt (what IS sent today)
  - Prompt layers (what SHOULD be sent — the gap is visible)
  - Config files: openclaw.json, config.toml, settings.json, GEMINI.md, credentials.json, ollama.service
  - Full file contents readable in-place
- Bridge agent system prompts populated in DB (Bridge Operator, Model Scout, Route Analyst, Cost Controller)
- API: GET /api/admin/bridge/prompts returns all profiles
- Phase 31: foundation for wiring prompts into Brain's dispatch pipeline

## Admin v2.9.0 (2026-03-28)

**Intelligence Feed — Porter's self-evolution engine.**

- New "Intelligence" page in Dev section — central feed where agents dump discoveries, blockers, ideas, and capabilities
- DB table: intelligence_feed with type/status/agent/metadata fields
- API: GET (list + filter + counts), POST (create), POST /batch (bulk), PUT /:id/status, DELETE
- Frontend: filter by status (new/reviewed/acted/dismissed), filter by type (capability/blocker/idea/gap/learning), search, create dialog
- Expandable entry cards with status transition buttons (Review → Act/Dismiss)
- Batch endpoint for agents to bulk-insert discoveries (changelog analysis, etc.)

## Admin v2.8.0 (2026-03-27)

**Architecture page rebuilt + full code review pass.**

- Architecture page: complete rewrite with live system status, 87-endpoint API surface, accurate DB tables, SSE events, Bridge agent domains, merge roadmap
- Fixed critical SSE bug: dispatch-log-summary and costs-summary now invalidated on bridge:dispatch events
- Fixed React anti-pattern: index-based keys replaced with value-based keys in agent-detail badges
- Added staleTime to all BridgeActivityTab queries (prevents unnecessary refetches)
- Full codebase review: no unused imports, no dead code, no broken links, no SQLite refs, no port 5180 refs

## Admin v2.7.0 (2026-03-27)

**Bridge agents roam free + Activity tab on agent detail.**

- Bridge agents no longer boxed in a strip — each agent lives inside the content they own
- Click any Bridge agent → navigates to their detail page
- Agent detail page: new ACTIVITY tab for Bridge agents (Operator/Scout/Analyst/Controller)
  - Operator: live gateway health, circuit breakers, model counts
  - Scout: full model catalog with capabilities and context windows
  - Analyst: recent dispatch log with model, reason, latency, cost
  - Controller: total spend, token usage, cost breakdown by gateway and model
- Tab pills handle content switching independently from agent navigation
- 48px portraits with specialist titles ("The Watcher", "The Seeker", etc.)

## Admin v2.6.0 (2026-03-27)

**Bridge Overhaul — agents are now tabs, not decoration.**

- Bridge page: 4 decorative agent stations → 4 functional tabs (Operator/Scout/Analyst/Controller)
- Operator tab: gateway health cards with speed test, circuit breakers, model rows, enable/disable
- Scout tab: full model catalog with search, filter, sort, capabilities matrix, version history
- Analyst tab: dispatch log with pagination + routing rules CRUD
- Controller tab: cost analytics + user API key manager + workspace gateway overrides
- Agent pixel portraits: grayscale when inactive, full color when active tab
- Status bar persistent across all tabs (health, models, circuit breakers, Test All)
- Fixed SSE bug: bridge:health events now correctly invalidate gateway cards (was targeting wrong query key)
- Deleted gateway-dashboard.tsx (superseded by inline operator panel)
- Removed ~280 lines of dead code (unused Snapshot types, helpers, HeartbeatLine, ExpandSection)
- 3 previously hidden components now rendered: UserKeyManager, WorkspaceGatewayOverrides, ModelCatalog
- Phase 27 complete: TopBar cleaned, stale pageTitles entries removed

## Admin v2.5.0 (2026-03-27)

**Architecture updated, dead code cleanup prep.**

- Architecture page: all 5180 port references updated to 5175
- Phase 27 (dead code cleanup) planned and ready for execution

## Admin v2.4.0 (2026-03-27)

**Nav reorganized into 6 sections — everything in its right place.**

- Sidebar restructured: Dashboard, Business, Agents, Ops, Dev, Settings
- Email moved to Agents section (was in Ops)
- Org Chart moved to Agents section (was in Dev)
- Changelog promoted from footer link to Dev nav item
- Settings promoted from footer icon to standalone nav item
- All 18 pages keep their own routes — zero merging

## Admin v2.3.0 (2026-03-27)

**Bug fixes and optimization — cleaner, safer, faster.**

- Users page filter chain memoized (was re-running 5 filters on every render)
- Fake 2-second chat loading animation removed from customer detail
- Session null guard in AdminShell (was crashing on null assertion)
- Design System page lazy-loaded (4,638 lines no longer in initial bundle)
- Email body HTML sanitized against XSS (script, iframe, event handlers stripped)

## Admin v2.2.0 (2026-03-27)

**Instant tab switching — the admin finally feels fast.**

- Animated preloader on every login warms all API data into React Query cache
- Tab switching is now instant — pages render from cache, zero network wait
- AdminShell is a layout route — sidebar, topbar, and SSE stay alive across navigation
- All 115 JS modules preloaded via modulepreload tags on initial page load
- Consolidated to single port 5175 (killed 5180) — production build served directly
- Killed 25 polling queries site-wide — only Brain health (30s) and dashboard (60s) remain
- Bridge duplicate query fixed (was fetching same endpoint twice)
- Recall search debounced (was firing API call per keystroke)

## Admin v2.1.0 (2026-03-27)

**Performance overhaul — the admin no longer hammers the backend.**

- Killed all 4 dashboard timers that re-rendered 200 items every second
- Brain page polling reduced from 18 requests/min to 8 (unified 30s interval)
- Forge page stops double-fetching — SSE alone drives updates now
- Login redirect no longer crashes the page (React Router Navigate replaces window.location)
- Skills table rows stop flickering (missing React key fixed)
- SSE events stream in real time through Vite proxy (no more buffering)

## Admin v2.0.0 (2026-03-26)

**Customer Intelligence — the admin becomes an AI-first CRM.**

- Notes and tasks on every customer record, rendered with markdown
- Unified activity timeline merging AI events, system events, and admin annotations
- Contact info with inline editing, domain peer grouping, PIRATE health scores in header
- Pipeline kanban view with drag-and-drop between stages (Acquired → Activated → Revenue → Churned)
- Customer segmentation: tags, multi-filter, saved segments as persistent tabs
- Agent-to-agent conversations visible on customer detail (read-only)

## Brain v3.0.1 (2026-03-26)

- feat(bridge): version detection in all 5 adapters + speed-test endpoint

## Admin v1.0.0 (2026-03-25)

**Bridge Intelligence UI — see what every AI model is doing.**

- Unified /bridge page with 5 tabs: Dashboard, Models, Routing, Costs, Settings
- Live gateway health cards with circuit breaker state and latency
- Model catalog with capabilities, pricing, and version history
- Dispatch log showing every routing decision with cost and reasoning
- Cost analytics with date range, attribution by user/project/agent
- Gateway CRUD, routing rules, user API keys, workspace overrides
- Real-time SSE updates for health changes and dispatch events

## Admin v0.7.0 — v0.7.6 (2026-03-25)

Bridge UI built incrementally — gateway dashboard, model catalog, dispatch log, cost analytics, routing config, user keys, workspace config, SSE wiring.

## Brain v3.0.0 (2026-03-25)

- docs(phase-23): complete phase execution — v3.0 milestone complete
- docs(23-02): complete multi-tenant bridge phase
- feat(23-02): MT-01 user API key CRUD + MT-02 workspace overrides + MT-03 attribution
- feat(23-02): bridge_v5 migration + username propagation
- docs(23-01): complete integration-multi-tenant plan 01
- feat(23-01): INT-02/INT-03 agent-stats + session routing history endpoints
- feat(23-01): INT-01/INT-04 Memory V3 signal + bridge health dashboard

## Brain v2.6.0 (2026-03-25)

- docs(phase-22): complete phase execution
- docs(22-02): complete bridge admin surface plan — ADM-05, ADM-06, ADM-07
- feat(22-02): add POST /gateways and POST /routing-rules to admin bridge surface
- test(22-01): scaffold admin-bridge test stubs for ADM-01 through ADM-07 and DS-03
- feat(22-01): create admin bridge route with 4 GET endpoints

## Brain v2.5.0 (2026-03-25)

- docs(phase-21): complete phase execution
- docs(21-02): complete setup-wizard-endpoints plan
- feat(21-02): add smoke-phase21.sh covering FRS-01 through FRS-04
- feat(21-02): add 4 setup wizard POST endpoints to bridge.ts
- docs(21-01): complete first-run-setup detection endpoint plan
- feat(21-01): add GET /bridge/detect endpoint surfacing DetectionReport
- feat(21-01): refactor startup-detector.ts to return DetectionReport

## Brain v2.4.0 (2026-03-25)

- docs(phase-19): complete phase execution
- docs(19-02): complete model-catalog plan 02 — startup/scheduler wiring, cost logging, capability routing
- feat(19-02): wire cost calculation, model_version_id, and capability filtering into routing engine
- feat(19-02): wire model refresh into startup-detector and scheduler
- docs(19-01): complete model-catalog plan 01 — models table, model_versions, catalog service
- feat(19-01): model-catalog.ts service with auto-population, version tracking, cost calculation
- feat(19-01): bridge_v4 migration, Drizzle schema, types update
- test(19-01): add failing test stubs for model-catalog (MOD-01, MOD-02, MOD-04, MOD-05)

## Brain v2.3.0 (2026-03-25)

- fix(18): wire migrate-bridge-v3 into boot sequence
- docs(phase-18): complete phase execution
- docs(18-03): complete fallback-chain plan — selectWithFallback, ai-router wired, 10 tests green
- feat(18-03): wire selectWithFallback into ai-router and stream-service
- feat(18-03): add selectAllCandidates() and selectWithFallback() to RoutingEngine
- test(18-03): add fallback-chain.test.ts — TDD RED for selectWithFallback()
- docs(18-02): complete health-probe plan — bridge:health SSE, DB status+circuit_state updates, 11 tests green
- feat(18-02): implement health-probe.ts and wire into scheduler tick loop
- test(18-02): add failing tests for health probe with dependency injection pattern
- docs(18-01): complete circuit-breaker and retry primitives plan
- feat(18-01): install opossum, circuit-breaker-registry, retry wrapper

## Brain v2.2.0 (2026-03-25)

- docs(phase-20): evolve PROJECT.md after phase completion
- docs(phase-20): complete phase execution
- docs(20-02): complete smart routing engine plan — routing-engine.ts, ai-router refactor, stream-service async
- feat(20-02): wire routing engine into ai-router.ts + stream-service.ts, update callers
- feat(20-02): create routing-engine.ts with DB-driven selection and dispatch logging
- docs(20-01): complete smart routing engine foundation plan
- feat(20-01): extend bridge types, add Drizzle schema exports, create dispatch-queues
- feat(20-01): install p-queue, create bridge v2 migration with 3 tables
- test(20-01): add Wave 0 test stubs for RT-01 through RT-05

## Brain v2.1.0 (2026-03-25)

- docs(phase-17): evolve PROJECT.md after phase completion
- docs(phase-17): complete phase execution
- docs(17-03): complete StreamNormalizer and adapters barrel plan
- feat(17-03): add adapters barrel export with ADAPTER_MAP and createAdapter factory
- feat(17-03): add StreamNormalizer with error boundary and abort propagation
- docs(17-02): complete CLI adapter plan — CodexCLI, ClaudeCLI, GeminiCLI
- docs(17-01): complete OllamaAdapter + OpenClawAdapter plan
- feat(17-02): implement GeminiCLIAdapter
- feat(17-01): implement OpenClawAdapter for /v1/chat/completions with SSE streaming
- feat(17-02): implement ClaudeCLIAdapter
- feat(17-01): implement OllamaAdapter for /api/chat with NDJSON streaming
- feat(17-02): implement CodexCLIAdapter
- docs(17): create phase plan — 3 plans for provider adapters
- docs(phase-17): add validation strategy
- docs(17): research phase provider-adapters
- docs(phase-16): evolve PROJECT.md after phase completion
- docs(phase-16): complete phase execution
- docs(16-03): complete Bridge API routes plan — gateway masking + redetect endpoint
- feat(16-03): register bridge routes at /api/v1/bridge prefix
- feat(16-03): create Bridge API routes with masked gateway credentials
- docs(16-02): complete startup-detector plan — gateway PATH scan + env bootstrap
- feat(16-02): wire bridge migration and gateway detector into Fastify boot
- feat(16-02): install which package and create startup-detector.ts
- docs(16-01): complete gateway-foundation schema and types plan
- feat(16-01): add gateways + gateway_credentials migration and Drizzle schema
- feat(16-01): add GatewayAdapter interface and bridge type definitions
- docs(16-gateway-foundation): create phase plan
- docs(16): add validation strategy
- docs(16): research phase Gateway Foundation
- docs(state): record phase 16 context session
- docs(16): capture phase context
- docs: create v3.0 Bridge roadmap (8 phases, 46 requirements)
- docs: define v3.0 Bridge requirements (45 requirements across 9 categories)
- docs: complete project research
- docs: start milestone v3.0 Porter Bridge — AI Gateway & Model Intelligence
- chore: remove last porter.py comment from admin chat route
- docs: defer scale-proof todo - product first
- docs: capture todo - Scale-proof Porter backend for concurrent agents
- docs(20): UI design contract — Live Dashboard
- fix: forge queue shows display name instead of DB slug
- chore: complete v2.0 Backend Ready milestone
- docs: v2.0 milestone audit — tech_debt status, 38/41 requirements, forge pipeline defects
- docs: close v2.0 roadmap — Phase 15 complete, Phase 14 deferred
- docs(phase-15): evolve PROJECT.md after phase completion
- docs(15-02): complete skills+tools admin API rewrite plan
- docs(15-03): complete forge junction table migration plan
- feat(15-02): rewrite admin/tools.ts — full CRUD from tools DB table
- feat(15-03): update template instantiation with junction-table sources and deployed_by
- feat(15-02): rewrite admin/skills.ts — full CRUD from skills DB table
- feat(15-03): update Forge Station 2 and 3 to read from junction tables
- docs(15-01): complete skills/tools data foundation plan
- feat(15-01): add Drizzle schema exports and wire migration to server startup
- feat(15-01): add migrate-15.ts with skills/tools DDL, seed data, and junction population
- docs(15): create phase plan — 3 plans in 2 waves for skills & tools architecture
- docs(phase-15): add validation strategy
- docs(15): research skills & tools architecture phase
- docs(15): smart discuss context
- docs(phase-13.1): complete phase execution — Memory V3 State Engine
- docs(13.1-03): complete consolidation+self-edit+admin plan execution summary
- docs(13.1-02): complete tiered memory injection plan execution summary
- feat(13.1-03): complete smoke test scaffold with MEMV3-02..05 checks
- feat(13.1-03): add consolidation service, self-edit API, admin overview
- feat(13.1-02): wire memory injection into chat streaming endpoint
- feat(13.1-02): create tiered memory injection service
- docs(13.1-01): complete Memory V3 schema plan execution summary
- feat(13.1-01): add smoke test scaffold for all MEMV3 requirements
- feat(13.1-01): add Memory V3 schema tables and idempotent migration
- chore: cleanup legacy files — keep porter.py for models tab extraction
- chore: cleanup — archive stale tasks, delete legacy scripts
- docs(13.1): add validation strategy + complete phase planning

## Brain v2.0.1 (2026-03-24)

- docs(13.1): create phase plan — 3 plans, 2 waves
- docs(13.1): research memory v3 state engine phase
- docs(13.1): smart discuss context — infrastructure phase
- docs(phase-13.05): complete phase execution
- chore(13.05): remove SQLite completely — delete migration script, uninstall better-sqlite3
- docs(phase-15): add Skills & Tools Architecture phase to v2.0 roadmap
- chore: bump to v2.0.1 — PG migration script, FTS upgrades, health version
- feat(13.05-05): create SQLite to PostgreSQL data migration script
- docs(13.05-03): complete critical FTS and boot sequence plan
- docs(13.05-02): complete services postgresql migration plan
- docs(13.05-04): complete remaining routes PG migration plan
- feat(13.05-03): add db_engine field to health endpoint (PG-01 gate)
- feat(13.05-03): replace plainto_tsquery with websearch_to_tsquery in FTS searches
- docs(13.05-01): complete postgresql schema foundation plan
- fix: version strings v2.0.0 in package.json, health endpoint, release notes
- docs: v2.0.0 release notes — PostgreSQL migration
- feat: PostgreSQL migration — SQLite → PG 16 + pgvector (Phase 13.05)
- fix(13.05): revise plans based on checker feedback
- docs(13.05): create phase plan — 4 plans, 3 waves for PostgreSQL migration
- docs(phase-13.05): add validation strategy
- docs(13.05): research postgresql migration phase
- docs(state): record phase 13.05 context session
- docs(13.05): capture phase context
- docs(phase-13): evolve PROJECT.md after phase completion
- docs(phase-13): complete phase execution
- docs(13-03): complete scheduler-integration and API routes plan
- fix(13-03): fix smoke-phase13 auth URL, response parsing, and DB path detection
- feat(13-03): add memory/concepts API route and learning-sessions endpoint
- feat(13-03): wire learning_session trigger, bootstrap, and cadence into scheduler
- docs(13-02): complete learner.ts research engine plan
- feat(13-02): create learner.ts autonomous learning engine
- chore(13-02): install duck-duck-scrape 2.2.7 and robots-parser 3.0.1
- docs(13-01): complete autonomous-learning DB foundation plan
- feat(13-01): add Drizzle definitions, wire migration, create smoke test
- feat(13-01): create migrate-13.ts with concepts + learning_sessions + FTS5
- docs(phase-13): fix key_link misdeclaration in plan 03
- docs(13): create phase plan — 3 plans, 3 waves
- docs(phase-13): add validation strategy
- docs(13): research phase autonomous-learning
- remove 27k lines of inline HTML from porter.py
- update frontend-v2 submodule to v0.1.6 (version fix)
- update frontend-v2 submodule to v0.1.6
- docs(state): record phase 13 context session
- docs(13): capture phase context
- update frontend-v2 submodule: dashboard overhaul
- fix: seed accounts use unique emails, INSERT OR IGNORE
- docs(phase-12): evolve PROJECT.md after phase completion
- docs(phase-12): complete phase execution — verification passed
- fix(12): correct smoke test port (8877→3001) and timeline response key (items→timeline)
- docs(12-04): complete agent template catalog plan

## Admin v0.6.0 — v0.6.3 (2026-03-23 — 2026-03-24)

Agent Forge assembly line, admin chat engine, template detail redesign, Brain/Bridge/Recall pages, org chart, design system expansion, pixel portrait system.

## Admin v0.5.0 — v0.5.1 (2026-03-22)

CRM cockpit redesign with autonomous growth metrics, revenue tracking, Porter chat with slash commands, dashboard agent supervisors, AI health scores. TypeScript zero-error milestone.

## Admin v0.4.0 (2026-03-22)

Customer detail rewrite — gamification timeline, AI next-action carousel, plan controls, revenue cards, LLM terminal activity log, SSE real-time updates, auth separation between admin and product.

## Admin v0.3.0 (2026-03-22)

Customer hub redesign with KPI bar, 5-tab detail layout, dense CRM form, billing timeline, design system page with tabs.

## Admin v0.2.0 — v0.2.19 (2026-03-22)

Rapid iteration: dashboard command center, template card grid and .md editors, notification system, scrollbar design tokens, route-aware page titles, system health terminal, real audit log integration.

## Admin v0.1.0 — v0.1.9 (2026-03-21)

**Initial release.** Platform control plane with dashboard, customers, revenue, agents, templates, models, tools, skills, diagnostics, email, billing. Fastify 5 backend on SQLite, React Router 7 SPA with shadcn/ui.
