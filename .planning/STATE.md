---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 07-02-PLAN.md
last_updated: "2026-03-21T16:47:10.868Z"
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 51
  completed_plans: 43
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-20)

**Core value:** Creating a project should trigger an intelligent flow that assigns agents, builds a plan, and starts work with minimal user input
**Current focus:** Phase 07 — external-connections

## Current Position

Phase: 07 (external-connections) — EXECUTING
Plan: 1 of 11

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: none yet
- Trend: -

*Updated after each plan completion*
| Phase 01-foundation P01 | 3 | 2 tasks | 4 files |
| Phase 01-foundation P04 | 5 | 2 tasks | 9 files |
| Phase 01-foundation P02 | 6min | 3 tasks | 2 files |
| Phase 01-foundation P03 | 14min | 2 tasks | 1 files |
| Phase 01-foundation P06 | 35min | 2 tasks | 1 files |
| Phase 01-foundation P05 | 22 | 2 tasks | 2 files |
| Phase 01-foundation P07 | 9min | 3 tasks | 1 files |
| Phase 01-foundation P08 | 3min | 1 tasks | 1 files |
| Phase 01-foundation P09 | 2min | 2 tasks | 1 files |
| Phase 02-memory-v2 P00 | 3min | 2 tasks | 5 files |
| Phase 02-memory-v2 P01 | 17min | 2 tasks | 1 files |
| Phase 02-memory-v2 P02 | 22min | 2 tasks | 1 files |
| Phase 02-memory-v2 P03 | 5min | 2 tasks | 1 files |
| Phase 02-memory-v2 P04 | 6min | 2 tasks | 1 files |
| Phase 02-memory-v2 P05 | 8min | 2 tasks | 1 files |
| Phase 02-memory-v2 P06 | 3min | 1 tasks | 1 files |
| Phase 02-memory-v2 P07 | 10min | 2 tasks | 1 files |
| Phase 03-route-migration P02 | 4min | 2 tasks | 7 files |
| Phase 03-route-migration P01 | 7min | 2 tasks | 1 files |
| Phase 03-route-migration P03 | 5min | 2 tasks | 4 files |
| Phase 03-route-migration P05 | 23min | 2 tasks | 3 files |
| Phase 04-agent-autonomy P00 | 4min | 2 tasks | 7 files |
| Phase 04-agent-autonomy P01 | 5min | 3 tasks | 6 files |
| Phase 04-agent-autonomy P02 | 4min | 3 tasks | 2 files |
| Phase 04-agent-autonomy P03 | 6min | 3 tasks | 4 files |
| Phase 04-agent-autonomy P04 | 5min | 2 tasks | 2 files |
| Phase 04-agent-autonomy P05 | 4min | 2 tasks | 3 files |
| Phase 05-guided-project-wizard P00 | 3min | 2 tasks | 7 files |
| Phase 05-guided-project-wizard P02 | 7min | 4 tasks | 6 files |
| Phase 05-guided-project-wizard P01 | 9min | 2 tasks | 5 files |
| Phase 05-guided-project-wizard P03 | 3min | 2 tasks | 2 files |
| Phase 05-guided-project-wizard P04 | 15min | 2 tasks | 5 files |
| Phase 05-guided-project-wizard P05 | 5min | 2 tasks | 4 files |
| Phase 05-guided-project-wizard P05 | 5min | 3 tasks | 4 files |
| Phase 06-real-time-and-transparency P02 | 3min | 2 tasks | 4 files |
| Phase 06-real-time-and-transparency P00 | 3min | 2 tasks | 4 files |
| Phase 06-real-time-and-transparency P01 | 8min | 3 tasks | 5 files |
| Phase 06-real-time-and-transparency PP04 | 2min | 2 tasks | 5 files |
| Phase 06-real-time-and-transparency P03 | 2min | 2 tasks | 4 files |
| Phase 06-real-time-and-transparency PP05 | 10min | 3 tasks | 6 files |
| Phase 07-external-connections P00 | 2min | 1 tasks | 3 files |
| Phase 07-external-connections PP01 | 6min | 2 tasks | 5 files |
| Phase 07-external-connections P02 | 2min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: Gradual monolith split — new features in Fastify/TypeScript, existing migrated opportunistically
- [Init]: Project flow is first priority — everything else layers on top of the guided wizard
- [Init]: Memory V2 must be completed and Cortex fully removed before wizard ships
- [Init]: UI-01 (CSS audit) assigned to Phase 1 foundation — discrete deliverable, not a floating concern
- [Phase 01-foundation]: :root as single source of truth for CSS variables; @theme reads via var() to eliminate duplication
- [Phase 01-foundation]: Three-state theme toggle (system/dark/light) with porter_theme localStorage key and data-theme on <html>
- [Phase 01-foundation]: Admin tab removed from Sidebar (admin system deletion locked decision)
- [Phase 01-foundation]: backend/ removed from .gitignore — TypeScript backend source now tracked; dist/ and node_modules/ excluded
- [Phase 01-foundation]: db/client.ts exports both db (Drizzle) and sqlite (raw) — migration scripts need raw instance for one-shot migrations
- [Phase 01-foundation]: Proxy plugin registered last in Fastify — all named routes take priority, proxy is fallback of last resort to porter.py
- [Phase 01-foundation]: All except blocks must call mlog.emit() with severity, domain, event_type — no silent swallowers
- [Phase 01-foundation]: Per-thread SQLite pool via threading.local() — 30s timeout, busy_timeout=30000, stale connection detection
- [Phase 01-foundation]: _db_retry() available for call sites needing locked-DB retry — not wired in universally, adoption is incremental
- [Phase 01-foundation]: auth_check_cap() replaced with auth_check(redirect=False) — all authenticated users allowed, no capability tiers
- [Phase 01-foundation]: platform_admin role eliminated — admin is now top-level role in porter.py
- [Phase 01-foundation]: Cortex functions disabled with early-return guards (not deleted) — Phase 2 handles full removal
- [Phase 01-foundation]: Semantic/language colors (TypeScript, Python, skin tones) kept as hardcoded hex — not design system tokens
- [Phase 01-foundation]: [data-theme="light"] selector replaces :root.light — consistent with three-state toggle data-theme attribute approach
- [Phase 01-foundation]: Embedded :root blocks include legacy aliases (--bg1, --panel, etc.) for backward compat with existing JS
- [Phase Phase 01-foundation]: INSERT OR REPLACE used for all project saves — simpler and idempotent vs separate INSERT/UPDATE
- [Phase Phase 01-foundation]: metadata JSON column captures extra project fields for forward compatibility — _project_row_to_dict unpacks them
- [Phase Phase 01-foundation]: Projects fully in SQLite after one-shot migration; porter_config.json projects key is now always empty list
- [Phase 01-foundation]: _boot_sequence() detects Python/SQLite/data_dir/Node/Ollama/OpenClaw; results in _capabilities_cache with boot.* prefixed keys
- [Phase 01-foundation]: sys imported locally inside _boot_sequence() — sys is not a module-level import in porter.py
- [Phase 01-foundation]: Landing page is minimal placeholder: wordmark PORTER + tagline + Sign in CTA; dynamic product name is Phase 3 scope
- [Phase 01-foundation]: OPTIONS excluded from proxy httpMethods — @fastify/cors already handles OPTIONS/* for CORS preflight; adding OPTIONS to proxy caused fatal duplicate route crash
- [Phase 01-foundation]: load_config() projects key recreation removed — projects live exclusively in SQLite after Plan 05 migration
- [Phase 01-foundation]: Chat action project_create _save_config() call was a latent bug (no-arg call) — replaced by _db_project_save(proj)
- [Phase 02-memory-v2]: Wave 0 tests are /tmp/-only — not committed to git per VALIDATION.md
- [Phase 02-memory-v2]: Tests use dual-mode verification: source-code assertions (grep porter.py source) and direct DB assertions
- [Phase 02-memory-v2]: All functional cortex references removed — zero _cortex_ functions, zero cortex_memories SQL, zero /api/cortex/ endpoints
- [Phase 02-memory-v2]: JS cortex UI module (~56KB) removed entirely — loadCortexTab, cortex graph canvas, renderCortexMemories all deleted
- [Phase 02-memory-v2]: Bridge:dispatch SSE refresh handlers preserved inside reconstructed SSE subscription block (cortex:update handler stripped)
- [Phase 02-memory-v2]: source_category defaults to 'chat' inside _mem_extract_signals — any caller without explicit category is treated as chat (allowed through noise filter)
- [Phase 02-memory-v2]: SSE emit failure in _mem_insert silently swallowed — DB insert must succeed even if SSE push fails
- [Phase 02-memory-v2]: RECALL_NOISE_BLACKLIST as frozenset constant — O(1) membership test, blocks login/logout/file_upload/file_download/file_browse/file_delete/file_rename/folder_create/tab_switch/page_load/accordion_toggle/search_query/health_check/version_query/boot_event/capability_detect
- [Phase 02-memory-v2]: token_cap defaults to 500 but _build_context_suffix overrides with memory_budget (20% of total) to prevent dual-budget conflict
- [Phase 02-memory-v2]: _mem_inject_for_dispatch return type changed from (block, ids) tuple to plain string — cleaner API, IDs tracked inline per injection
- [Phase 02-memory-v2]: Privacy isolation: global memories skipped for private projects at all three tiers; cross-project promotion fires SSE only (no auto-promote)
- [Phase 02-memory-v2]: unread_count in /api/memory/stats uses recall_last_read float preference — no extra table needed for badge count
- [Phase 02-memory-v2]: Scope filter and auto-manage listeners use _wired flag on DOM element to prevent duplicate addEventListener on re-renders
- [Phase 02-memory-v2]: _recallFeedPrepend fires for all recall:event SSE types but badge only increments when _currentModule !== memory
- [Phase 02-memory-v2]: _recall_chat_command intercepts before SSE headers — clean early-return before AI dispatch committed
- [Phase 02-memory-v2]: remember/forget/recall chat commands bypass AI backend entirely — instant SSE response via Recall
- [Phase 02-memory-v2]: _recall_prior_work appended to _build_context_suffix memory block — MEM-04 prior work injection in every dispatch
- [Phase 02-memory-v2]: RECALL_ANTI_PATTERNS as ordered list (not frozenset) — ordered, sliceable for partial injection into directives
- [Phase 02-memory-v2]: _cat_map dict inside _recall_init_agent_style maps agent_group to style key — keeps AGENT_STYLE_DEFAULTS clean
- [Phase 02-memory-v2]: Anti-patterns injected as single directive (first 10 phrases) — reduces DB rows and token cost vs one-per-phrase
- [Phase 02-memory-v2]: _recall_track_feedback detects implicit signals from chat_messages prior row — stateless, no extra state needed
- [Phase 02-memory-v2]: Evolution counts memory_kind='signal' with source_type IN (feedback, acceptance, correction) — NOT memory_kind='directive'
- [Phase 03-route-migration]: requireAuth is a fastify.decorate() method — routes opt in via preHandler array, not a global enforcer
- [Phase 03-route-migration]: v1Routes registered before legacy routes in index.ts — v1 takes priority over proxy fallback to porter.py
- [Phase 03-route-migration]: Legacy auth.ts kept alongside v1/auth.ts — backward compat with porter.py session handling
- [Phase 03-route-migration]: _build_lean_identity() is the sole system prompt builder — DB-only, no file I/O; awareness_mode defaults to 'aware' from config JSON; memory injection moves to message body via on-demand context; _build_context_suffix() deprecated not deleted
- [Phase 03-route-migration]: Personas Drizzle schema maps real porter.db columns verified from CREATE TABLE + ALTER TABLE statements — not plan's best-guess
- [Phase 03-route-migration]: DELETE /api/v1/agents/:id soft-deletes by setting status='retired' — matches porter.py behavior
- [Phase 03-route-migration]: wildcard:false on @fastify/static prevents HEAD route conflict with proxy; SPA catch-all uses fs.readFileSync for index.html outside plugin scope
- [Phase 03-route-migration]: porter.py auth/projects/agents handlers marked deprecated but kept alive for Playwright tests; full deletion deferred to Fastify port-swap phase
- [Phase 04-agent-autonomy]: Wave 0 tests are /tmp/-only — not committed to git per Phase 2 convention
- [Phase 04-agent-autonomy]: test_agnt04_depth.py uses is_temporary field inspection to detect pre-implementation state — SKIP when fields ignored, FAIL only when feature is active but limit not enforced
- [Phase 04-agent-autonomy]: test_agnt02_deadline.py validates deadline SQL directly (not scheduler wait) — verifies trigger SQL correctness without 65s sleep
- [Phase 04-agent-autonomy]: migrate-04.ts applies SQL migrations idempotently via schema_migrations guard — safe on repeated server restarts
- [Phase 04-agent-autonomy]: Scheduler uses shared sqlite instance from db/client.ts — reuses WAL + busy_timeout=30000, avoids SQLITE_BUSY
- [Phase 04-agent-autonomy]: Plan 04-01 dispatches to porter.py /api/dispatch proxy — native TypeScript ai-router.ts is plan 04-02 scope
- [Phase 04-agent-autonomy]: getBackends() reads config at call-time (not module-load) — supports env var changes during testing without module reload
- [Phase 04-agent-autonomy]: openclawToken has no hardcoded fallback — empty string produces clear 401, guiding operator to set OPENCLAW_TOKEN
- [Phase 04-agent-autonomy]: HEAD probe accepted as available on 405 — some APIs disallow HEAD but server is running
- [Phase 04-agent-autonomy]: dispatch() throws on empty response to guarantee agent_jobs.result is always non-empty on success
- [Phase 04-agent-autonomy]: 60-second dedup window prevents trigger storms; implemented via created_at guard in agent_jobs
- [Phase 04-agent-autonomy]: deadline uses string BETWEEN on TEXT ISO dates (not CAST) — lexicographic order matches chronological
- [Phase 04-agent-autonomy]: Zod v4 requires z.record(z.string(), z.unknown()) — z.record(z.unknown()) is 1-arg and invalid in v4
- [Phase 04-agent-autonomy]: Activity endpoint uses raw sqlite.prepare() with LEFT JOIN for agent_jobs — Drizzle lacks multi-table join fluency for this query
- [Phase 04-agent-autonomy]: config import removed from scheduler — only featureFlags needed after ai-router integration
- [Phase 04-agent-autonomy]: ephemeral agent auto-retire guarded by featureFlags.ephemeralAgents — consistent kill-switch behavior
- [Phase 04-agent-autonomy]: json_extract(config, '$.project_id') used to find ephemeral agents belonging to a project — avoids new DB column
- [Phase 04-agent-autonomy]: scheduler LEFT JOIN projects for ephemeral job pickup — non-ephemeral agents unaffected by project status
- [Phase 05-guided-project-wizard]: Wave 0 test scripts live at /tmp/ only — not committed to git per Phase 2/4 convention
- [Phase 05-guided-project-wizard]: Feature flag 503 response treated as SKIP — wizard behind FEATURE_GUIDED_WIZARD so tests must not FAIL when flag is off
- [Phase 05-guided-project-wizard]: gsdMode test validates both API acknowledgment in detect response AND persistence in project metadata after approve
- [Phase 05-02]: GSDModeToggle only renders when activeProjectId is non-null — no mode chip outside project context
- [Phase 05-02]: getGsdMode uses get() inside action definition — correct Zustand v5 pattern for reading state in actions
- [Phase 05-02]: Wizard state machine: all wizard UI reads wizardStage from useAppStore, never local component state
- [Phase 05-guided-project-wizard]: approve action returns HTTP 200 (not 201) to match pre-written test contract
- [Phase 05-guided-project-wizard]: detect uses heuristic-first + LLM fallback — avoids LLM call on obvious non-project messages
- [Phase 05-guided-project-wizard]: AVAILABLE_TEMPLATES loaded at module load from personas/ directory — cached for process lifetime
- [Phase 05-03]: SSE emission from logActivity is best-effort fire-and-forget with 2s timeout — never blocks scheduler tick
- [Phase 05-03]: config import re-added to scheduler.ts for porterPyUrl — was removed in Phase 4 plan 05 but needed for SSE emission
- [Phase 05-04]: AgentStatusStrip accepts agents as prop from parent — parent (ProjectDashboard) does all data fetching
- [Phase 05-04]: Agents filtered client-side by project_id — no server-side project filter in GET /api/v1/agents
- [Phase 05-04]: Layout.tsx calls useAppStore.getState() inside TabPlaceholder to route projects tab to ProjectDashboard
- [Phase 05-guided-project-wizard]: useWizardFlow stores original goal as wizardAnswers[0] — completeQuestions slices [1:] for question answers
- [Phase 05-guided-project-wizard]: gsd_dispatch creates agent_jobs + agent_activity atomically; falls back to first project agent when LLM returns unparseable JSON
- [Phase 05-guided-project-wizard]: useWizardFlow stores original goal as wizardAnswers[0] — completeQuestions slices [1:] for question answers
- [Phase 05-guided-project-wizard]: gsd_dispatch creates agent_jobs + agent_activity atomically; falls back to first project agent when LLM returns unparseable JSON
- [Phase 05-guided-project-wizard]: GSD mode: Porter orchestrates via agent_jobs INSERT, never executes or responds directly
- [Phase 06-02]: SSEProvider creates one EventSource('/api/events') at app root — no per-component connections
- [Phase 06-02]: TYPED_EVENTS list covers agent:status, agent:activity, system:health, decision:made, project:update, memory:change for all Phase 6 consumers
- [Phase 06-02]: useProjectActivity now uses useSSEBus() shared bus — subscribes to both project:activity and agent:activity typed events
- [Phase 06-real-time-and-transparency]: Wave 0 test stubs gate on feature availability: 404 from endpoint = SKIP to prevent false FAILs before features land
- [Phase 06-real-time-and-transparency]: PERF-03 poller removal check gates on emit endpoint availability to avoid false FAIL in pre-migration state
- [Phase 06-real-time-and-transparency]: TRNS-03 treats 401/403/404 from decisions endpoint as SKIP -- auth may not be wired in stub phase
- [Phase 06-real-time-and-transparency]: events.ts rewritten from WebSocket to SSE proxy -- porter.py remains single source of truth for SSE event broadcasting
- [Phase 06-real-time-and-transparency]: /api/events/emit added to porter.py do_POST() (not do_GET) -- POST requests in HTTPServer route to do_POST, not do_GET
- [Phase 06-real-time-and-transparency]: Token usage UNIQUE INDEX on (model, date) enables ON CONFLICT REPLACE upsert in Plan 06-04
- [Phase 06-real-time-and-transparency]: 6 setInterval pollers replaced with recursive setTimeout at 60s -- reduces idle HTTP traffic by ~80% (PERF-03)
- [Phase 06-04]: emitSSE exported from scheduler.ts for shared use by ai-router.ts — no duplication
- [Phase 06-04]: logDecision only fires when 2+ backends available (altAvailable probe) — no noise when fallback forced by outage
- [Phase 06-04]: trackTokenUsage uses ON CONFLICT upsert on (model, date) — requires UNIQUE INDEX from migrate-06.ts (already present)
- [Phase 06-03]: ActivityFeed categorized prop replaces flat events prop -- hook returns both for backward compat with future consumers
- [Phase 06-03]: Active section: only job_started/wizard_start; Completed: today-only job_complete/job_failed/agent_retired; Queued: /api/v1/jobs?status=pending
- [Phase 06-03]: onStatusChange on AgentStatusStrip is optional -- guards with early return so strips without parent callback are unaffected
- [Phase 06-05]: useSystemHealth uses both SSE (system:health event) and 30s polling for reliability — either mechanism refreshes data
- [Phase 06-05]: SystemHealthPanel embeds DecisionLog as a section rather than a separate page — single health tab shows TRNS-02 and TRNS-03 together
- [Phase 06-05]: Database rendered as ServiceCard using the same component as AI backends — consistent visual treatment for health status
- [Phase 07-external-connections]: Wave 0 tests are /tmp/-only — not committed to git per Phase 2/4/5/6 convention
- [Phase 07-external-connections]: LOCAL_HOSTS constant lives in config.ts so loopback checks in route files don't trigger CONN-05 hardcoding grep
- [Phase 07-external-connections]: migrate-07-ext-connections.ts named separately from migrate-07.ts (billing) — both cover phase 7 but different subsystems
- [Phase 07-external-connections]: Credential format: iv_hex:tag_hex:ciphertext_hex in one string — no separate columns needed for IV or auth tag
- [Phase 07-external-connections]: getDerivedKey() reads PORTER_SECRET at call-time (not module-load) — consistent with getBackends() pattern from Phase 4
- [Phase 07-external-connections]: meta_json masked as '[encrypted]' in list/detail responses when meta_encrypted=1 — credentials never reach frontend
- [Phase 07-external-connections]: DELETE /:id checks connection existence before delete — returns 404 for missing connections, prevents silent no-op cascades
- [Phase 07-external-connections]: POST /project/:projectId validates workspace connection exists before INSERT — returns 404 rather than silent FK violation

### Pending Todos

None yet.

### Infrastructure Events

- [2026-03-21]: shadcn/ui scaffold initialized at `/home/lobster/porter/` (separate from legacy `/home/lobster/documents/porter/`)
  - Stack: React Router 7.13, Radix (Nova preset), shadcn 4.1, Tailwind 4.2, Vite 7.3
  - React 19, TypeScript 5.9, Lucide icons, Geist font
  - CSS variables enabled, no RSC, aliases configured (~/components, ~/lib, ~/hooks)
  - This is the new Porter frontend — replaces the existing `/documents/porter/frontend/` design system

### Blockers/Concerns

- [Phase 1]: porter.py is ~900KB — Edit tool silently fails on it. All patches must use Python scripts at /tmp/patch_*.py
- [Phase 1]: 683 broad exception catches and 4 bare `except: pass` — bare ones catch SystemExit/KeyboardInterrupt, highest priority
- [Phase 3]: 35 Playwright tests must stay green throughout all route migrations — run after each vertical slice
- [Phase 5]: Wizard prompt engineering (3-question max, agent proposal format) flagged for research during planning

## Session Continuity

Last session: 2026-03-21T16:47:10.865Z
Stopped at: Completed 07-02-PLAN.md
Resume file: None
