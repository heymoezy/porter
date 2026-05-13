---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: The Orchestration Platform
status: unknown
stopped_at: Completed 48.3-01-PLAN.md (Wave 0 smoke harness tests/smoke-48.3.sh + 3 response fixtures; mock-injection contract DREAM_WORKER_MOCK_RESPONSE_PATH defined for Plan 04; baseline exits 1 on DRW-01 as expected)
last_updated: "2026-05-13T06:07:26.024Z"
progress:
  total_phases: 18
  completed_phases: 17
  total_plans: 50
  completed_plans: 51
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-02)

**Core value:** Porter is the orchestration platform — you tell Porter what you want, Porter figures out how to get it done across multiple AI models.
**Current focus:** Phase 48.3 — software-dream-worker

## Current Position

Phase: 48.3 (software-dream-worker) — EXECUTING
Plan: 2 of 5

## Performance Metrics

**Velocity (from v1.0 through v5.0):**

- Total plans completed: 92 (v1.0: 51, v2.0: 2, v3.0: 19, v4.0: 17, v5.0: 3 additional)
- Phases completed: 38 across all milestones
- Average plan duration: ~6 min

**v6.0 Recent plans:**

| Phase-Plan | Duration | Tasks | Files |
|------------|----------|-------|-------|
| 48.2-02    | 40 min   | 3     | 4     |
| Phase 48.2-transcript-capture P03 | 28 min | 3 tasks | 4 files |
| Phase 48.2 P04 | 42 min | 5 tasks | 6 files |
| 48.3-01    | 18 min   | 2     | 4     |

## Accumulated Context

### Decisions

- [v6.0 scoping]: GWC (gateway capabilities) is the foundation — everything else depends on knowing what each gateway can do
- [v6.0 scoping]: SIN (session intelligence) can run in parallel with Phase 40 — frozen memory is independent of capability registry
- [v6.0 scoping]: AJQ depends on both TDE + IAM — autonomous jobs need decomposition and messaging layers first
- [v6.0 scoping]: PMN (project monitoring) watchers are autonomous jobs — depends on AJQ (Phase 44)
- [v6.0 scoping]: PSB (project substrate) intake intelligence depends on PMN signals — comes last
- [v5.0]: Bridge task dispatch complete — CLI subprocess + HTTP agent loop verified for Claude, Codex, Gemini
- [Phase 40]: GatewayRow.capabilities kept as string[] — getLegacyTags() bridges old and new without touching all callers
- [Phase 40]: Migration uses jsonb_typeof = 'array' guard for idempotency — rows already structured by startup-detector are untouched
- [Phase 40]: normalizeCapabilities called on each row in auto-select path — cheap type check, O(n) but n<=10 gateways
- [Phase 40]: admin/backend/src/routes/bridge.ts is legacy dead code — active route is backend/src/routes/admin/bridge.ts
- [Phase 41]: Used dynamic import() for clearSnapshot in rotateSession to avoid circular dependency between session-registry and memory-snapshot
- [Phase 41]: upsertSession called with 0 tokens in ai-router to resolve session ID before snapshot lookup — idempotent, no token side-effects
- [Phase 41]: getOrBuildSnapshot uses two-layer cache: in-memory LRU Map first, DB fallback on process restart
- [Phase 41]: Route registered in v1/index.ts barrel (not index.ts directly) — matches all other v1 routes pattern
- [Phase 41-session-intelligence]: Sync cache reader (getGatewayConfidenceSync) avoids making selectByHeuristic async — keeps routing hot path synchronous
- [Phase 41-session-intelligence]: Confidence nudge formula (avgScore - 3.0) * confidence * 0.2 keeps nudge gentle so priority still dominates gateway selection
- [Phase 42]: classifyFast uses word count thresholds of 25 (simple) and 80 (complex) with conjunction/list heuristics for zero-cost classification
- [Phase 42]: Classifier fail-safe: all errors return simple — classifier failures never block normal chat flow
- [Phase 42-02]: validateDAG uses Kahn's algorithm (in-degree BFS) — detects all cycle types including self-deps and N-node rings
- [Phase 42-02]: planTasks prefers ollama (cheap) with graceful fallback — retries once with error feedback on validation failure
- [Phase 42-02]: insertTaskTree uses pool.connect() BEGIN/COMMIT transaction — atomicity for root+subtasks insertion
- [Phase 42-02]: handleFailure: attempt < maxAttempts-1 retries; >50% tree failed triggers cancelTree
- [Phase 42-02]: propagateResult uses JSONB @> containment operator to find tasks depending on completed task
- [Phase 42-03]: joinResults uses 4-path decision tree: all complete -> synthesized, all failed -> failed, >50% complete -> partial, >50% failed -> replan
- [Phase 42-03]: decomposeAndExecute returns immediately after insertTaskTree — pipeline runs fire-and-forget to avoid blocking SSE response
- [Phase 42-03]: Classifier gate in chat.ts has double try/catch — classifier errors and decomposition errors both fall through to direct dispatch
- [Phase 42-03]: v1 replan marks root as failed with note; no automatic re-execution (bounded to prevent infinite loops)
- [Phase 42-04]: Dependency detail resolution uses ANY($1::text[]) for batch fetch — single DB round-trip regardless of dep count
- [Phase 42-04]: camelCase mapping done in JS (not SQL aliases) — consistent with TypeScript types in types.ts
- [Phase 43-01]: porter-delegation used as routing username in RoutingContext to distinguish in-process delegation from HTTP agent-message calls
- [Phase 43-01]: Peer-to-peer guard checks sourceAgent !== undefined to allow admin-UI/direct API calls (no sourceAgent) through unblocked — only explicit non-Porter agents with targetAgent are blocked
- [Phase 43-01]: violation intent in msg_bus_events is the audit-trail pattern for all policy enforcement decisions in the Bridge layer
- [Phase 44-01]: selectBestAgent uses effectiveness_score DESC with enabled=1 filter for skill-based agent matching
- [Phase 44-01]: selectBestGateway uses JSONB ->> operator with field:value format for flexible capability matching
- [Phase 44-01]: scheduleSystemJob dedup checks trigger_type + source='system' + status IN (pending, running)
- [Phase 44-01]: Gateway assignment happens between job claim and executeJob in tick() — keeps claim logic unchanged
- [Phase 44]: Used api() helper instead of raw fetch for JobQueuePanel — consistent auth/envelope handling
- [Phase 44]: JobQueuePanel embedded in operator tab — fits existing bridge page layout hierarchy
- [Phase 44]: Queue tab 10s refetchInterval via React Query; history tabs on-demand — balances freshness with resources
- [Phase 45-01]: decideDoctrine is pure synchronous — no LLM calls, builds on classifyFast heuristics with question-word and action-verb checks
- [Phase 45-01]: Escalation sends clarification message via SSE and persists to chat history — no silent drops
- [Phase 45-01]: dispatch_strategy is nullable TEXT column (not enum) to support existing rows without backfill
- [Phase 45-01]: Both bridge.ts (HTTP) and agent-delegation.ts (in-process) enforce depth=3 independently — defense in depth
- [Phase 45]: classifyRisk is pure synchronous with regex-based pattern matching -- no LLM calls, instant classification
- [Phase 45]: High-risk actions throw typed error with .code='APPROVAL_REQUIRED' so DAG executor can distinguish approval blocks from real failures
- [Phase 45]: All approval lifecycle events (requested, granted, rejected) logged to msg_bus_events for audit trail
- [Phase 45]: Approval endpoints restricted to platform_admin role only -- consistent with bridge management endpoints
- [Phase 46-01]: Watcher dedup uses JSONB @> containment operator for flexible trigger_data matching
- [Phase 46-01]: Custom watcher routes to Ollama (qwen2.5-coder:1.5b) for cheap local inference with graceful fallback
- [Phase 46-01]: Watcher jobs use source='watcher' (not 'system') to distinguish from system jobs in queries
- [Phase 46-03]: Client-side filtering for watchers — count <100, avoids extra API complexity
- [Phase 46-02]: logWatcherFinding kept internal (not exported) to encapsulate notification pipeline within watcher execution
- [Phase 46-02]: Email notification failures are non-blocking -- finding already stored, email is best-effort
- [Phase 46-02]: DELETE watcher cascades findings manually (no FK cascade) for explicit control
- [Phase 47]: Classification is pure function (no LLM) -- instant extension-based lookup with ambiguous-extension config filename detection
- [Phase 47]: Ingress pipeline is best-effort: errors logged but never block the upload response
- [Phase 47]: Cross-device move fallback: fs.rename first, copy+unlink on EXDEV error
- [Phase 47]: provisionProjectStructure is non-blocking: errors log but never throw, so provisioning failure does not prevent project creation
- [Phase 47]: Wizard provisioning is fire-and-forget (after COMMIT) to avoid rolling back DB on filesystem errors
- [Phase 47]: Existing _system/ files preserved on re-provisioning (idempotent)
- [Phase 47]: Project root resolved from porter_config.json projects mount with fallback to dataDir/projects
- [Phase 47]: Missing canonical directories auto-repaired; missing _system files only flagged (content files are sacred)
- [Phase 47]: Atlas runs every 30 min (900 ticks) -- structural drift is slow-changing, first run at tick 900 to avoid startup load
- [Phase 48.1-05]: Wave 0 smoke harness shipped BEFORE implementation plans so each downstream task has a single-shot <verify> command (`bash tests/smoke-48.1.sh`)
- [Phase 48.1-05]: Smoke script self-degrades — SC-1/SC-6 (schema) run on bare DB via psql; SC-2..SC-5 gated behind `curl -sf /health`, exit 0 with warn line when Fastify offline
- [Phase 48.1-05]: SC-6 row-existence guard required to prevent vacuous pass — UPDATE/DELETE on missing target returns 0 rows (no error) which would falsely satisfy trigger test
- [Phase 48.1-05]: SC-4b verifies DRM-03 null-return path: callers omitting cwd param must see zero silo sections (backward compat)
- [Phase 48.1-01]: Trigger guard OLD.source_type IS DISTINCT FROM 'moe-direct' returns early before any check — non-moe-direct UPDATE/DELETE bypass the function entirely so memory-pruner dedup keeps working
- [Phase 48.1-01]: Bypass via current_setting('porter.allow_moe_direct_mutation', true) with SET LOCAL — per-tx setting auto-clears on COMMIT/ROLLBACK, forcing explicit opt-in per mutation
- [Phase 48.1-01]: silos.enabled is BOOLEAN (not INTEGER) per CONTEXT schema lock; schema.ts imports boolean + timestamp from drizzle-orm/pg-core
- [Phase 48.1-01]: Migration registered after migrateBornCheckV1 in runMigrations() to preserve causal order with prior wave
- [Phase 48.1]: Phase 48.1-01 trigger guard returns early on OLD.source_type != 'moe-direct' so memory-pruner dedup keeps working
- [Phase 48.1-02]: silo-detector cache is module-level + lazy-loaded with explicit startup warmup; .catch() on warmup so DB hiccups never crash Fastify boot
- [Phase 48.1-02]: Detection algorithm priority is override (24h TTL in SQL predicate) → project-type prefix match → cwd_markers fs.existsSync → []; multi-silo aggregated via Map dedup
- [Phase 48.1-02]: silo_id IS NULL in session_silo_overrides means "explicit none" and returns []; absence of row falls through to detection — Plan 03 uses this for /silo none
- [Phase 48.1-02]: Silo section sits BETWEEN System Directives and Project Directives in /context markdown — silos amplify workspace rules, project rules customize on top
- [Phase 48.1-02]: /context detection failures are warn-logged and skipped (fail-open); never break /context because of silo errors
- [Phase 48.1-02]: cwd missing AND no session override → return [] — guarantees DRM-03 backward-compat for pre-upgrade callers
- [Phase 48.1-02]: Smoke SC-2 directive-body check must parse data.context from JSON before grep -qF; raw-JSON grep breaks on directives starting with literal quote (silo-sw-compact-means-padding)
- [Phase 48.1-silo-foundation]: [Phase 48.1-03]: /silo-command endpoint mounted under /api/v1/intellect/ prefix — co-locates with /context (the consumer), keeps all silo logic in one route group
- [Phase 48.1-silo-foundation]: [Phase 48.1-03]: Hook fail-closed on backend failure — /silo always blocks, even on HTTP timeout, so the literal command never leaks to the model
- [Phase 48.1-silo-foundation]: [Phase 48.1-03]: porter-user-prompt.js hook is NOT in the Porter repo (global Claude Code hook); deliberately uncommitted, reproduced verbatim in SUMMARY for re-deployment
- [Phase 48.1-silo-foundation]: [Phase 48.1-03]: Block-format empirically verified — Claude Code UserPromptSubmit honors {decision:block, reason, hookSpecificOutput:{additionalContext}} envelope (Risk 2 retired)
- [Phase 48.2-05]: Wave-0 smoke harness shipped alongside Plan-01 in Wave 1 (disjoint files: tests/ only) — every downstream task has a single-shot `bash tests/smoke-48.2.sh` <verify> command from this point
- [Phase 48.2-05]: Hook absence is graceful-skip not failure — TRC-02/TRC-03/TRC-08 auto-skip when /home/lobster/.claude/hooks/porter-stop.js or porter-user-prompt.js missing, so smoke runs cleanly in Wave 1 before Plan 03 ships hooks
- [Phase 48.2-05]: Backend reachability is a soft gate — TRC-01 (schema-only via psql) always runs; TRC-02..TRC-08 skip with warn-exit-0 when Fastify offline. Schema validation never requires the API to be up.
- [Phase 48.2-05]: Poll-with-timeout (20 × 0.5s = 10s ceiling) for async hook → backend INSERT round-trip — eliminates fixed-sleep flakiness in TRC-02/03/08
- [Phase 48.2-05]: TRC-07 (kill switch) inserts NULL-silo override row BEFORE posting and asserts NO row written — verifies capture-side privacy gate end-to-end, not just /silo-command endpoint
- [Phase 48.2-05]: trap cleanup EXIT — sweeps `session_id LIKE 'smoke-48.2-%'` from both session_transcript_turns + session_silo_overrides + bookmark sidecars under /tmp/porter-transcript-bookmark/ on any exit path
- [Phase 48.2-01]: silo_id stays nullable TEXT with NO FK to silos.id — orphan-tolerant against future silo rename/disable; mirrors session_silo_overrides precedent from 48.1
- [Phase 48.2-01]: cwd captured as nullable TEXT per RESEARCH Open Question #5 — tiny cost, future-proofs 48.3 per-project sub-filtering
- [Phase 48.2-01]: Retention workflow row seeded in TWO places (migration AND BUILTIN_WORKFLOWS in workflow-engine.ts) — both idempotent by name, defense in depth against DB rebuild OR codebase regression
- [Phase 48.2-01]: Drizzle siloCapturedIdx defaults ASC at ORM layer; raw SQL migration installs DESC at DB layer — DB-level DESC is what serves 48.3's query planner, Drizzle binding is for $inferSelect type-safety only
- [Phase 48.2-01]: transcript_retain handler captures pool from workflow-engine module scope (already imported from ../../db/client.js), matching every other action handler in the file
- [Phase 48.2-01]: New v1 migration pattern established — runs after migrateSilosV1, mirrors migrate-silos-v1.ts exactly (BEGIN, schema_migrations guard, DDL IF NOT EXISTS, conditional seeds, INSERT migration row, COMMIT, ROLLBACK + release in finally)
- [Phase 48.2-02]: scrubPII + PII_PATTERNS extracted to backend/src/services/intellect/pii-scrub.ts — single source of truth across learner and transcript-capture; verbatim from learner.ts lines 193-205 with inline provenance comment so future readers do not "modernize" without re-checking source
- [Phase 48.2-02]: Kill switch fires BEFORE detectSilos AND before any INSERT — capture endpoint queries session_silo_overrides directly to disambiguate "explicit /silo none" (silo_id IS NULL) from "no silo detected" (no row); detectSilos returns [] for both, only direct query distinguishes
- [Phase 48.2-02]: Server-assigned turn_index inside BEGIN/COMMIT via SELECT COALESCE(MAX(turn_index), -1) + 1 — hooks never count; UNIQUE constraint catches dup races; ON CONFLICT DO NOTHING handles duplicate atomically
- [Phase 48.2-02]: Single retry on ON CONFLICT race inside same tx (recompute MAX+1, retry once); if still conflict return {ok:true, inserted:false, reason:'concurrent_race'} and warn-log — accepted drop-on-race tradeoff: duplicates worse than drops for the Dream Worker
- [Phase 48.2-02]: 32KB content cap applied AFTER scrubPII so truncation can never reveal cleartext that was redacted; truncation suffix '... [truncated: N chars]' is a signal the Dream Worker can act on (re-fetch JSONL if needed in 48.3)
- [Phase 48.2-02]: POST /api/v1/intellect/transcript/turn auth posture mirrors /silo-command: 127.0.0.1-only via server bind, no auth middleware on this route group, inline comment documents the parallel
- [Phase 48.2-02]: learner.ts imports only scrubPII (not PII_PATTERNS) — keeps tsc --strict clean under unused-import detection; PII_PATTERNS remains exported from pii-scrub.ts for future consumers
- [Phase 48.2-transcript-capture]: [Phase 48.2-03]: TRC-08 idempotency required a backend dedup pre-check on (session_id, role, captured_at, content) — UNIQUE(session_id, turn_index) alone could not catch bookmark-cleared re-parses because backend assigns turn_index via MAX+1, so a re-fire allocates a fresh distinct index. Pre-check fires only when captured_at supplied (Stop hook path); user-prompt path with fresh ISO timestamps is a no-op (correct).
- [Phase 48.2-transcript-capture]: [Phase 48.2-03]: Per-turn bookmark advance (not end-of-file write) — guarantees partial-batch failure retries only the failed lines on next Stop fire; lastSuccessOffset tracks byte position past each successfully-handled (or skipped) line, loop breaks on per-turn POST failure leaving bookmark at last-success.
- [Phase 48.2-transcript-capture]: [Phase 48.2-03]: Hook files (porter-user-prompt.js extension + NEW porter-stop.js + settings.json Stop registration) deliberately uncommitted — live in global Claude Code config at /home/lobster/.claude/hooks/, outside Porter repo. Full contents reproduced verbatim in SUMMARY for re-deployment. Same precedent as 48.1-03.
- [Phase 48.2-04]: Config flag default=TRUE (capture on); privacy opt-out via /silo none per-session or INTELLECT_TRANSCRIPT_CAPTURE_ENABLED=false global. Gate placed BEFORE input validation so disabled instance returns stable neutral envelope.
- [Phase 48.2-04]: SessionEnd belt-and-braces via spawn(porter-stop.js, {detached:true})+child.unref() — NOT a new flush endpoint. Reuses Stop's existing byte-offset bookmark; backend dedup pre-check (48.2-03) makes any re-fire a no-op. Detached+unref non-negotiable: without both, child dies with SessionEnd parent before POST completes.
- [Phase 48.2-04]: Plan 04 checkpoint verified autonomously 2026-05-13 (Moe unavailable). 624 live captured turns in production DB across ~48h of real CLI use (597 software-silo + 28 NULL non-code cwd) plus direct endpoint tests for PII/cwd/kill-switch/retention plus smoke harness 8/8 — stronger evidence than a single fresh-CLI walk-through.
- [Phase 48.2-04]: Porter version leapfrogged 48.2-04's v6.13.0 to v6.15.0 via Tom-Unblock follow-on (commits 30b7729 v6.14.0 claude_cli cwd isolation, 54d76ea v6.15.0 raw:true SSE passthrough). 48.2 backend code intact and live at v6.15.0; no rollback or interference.
- [Phase 48.3-01]: Wave 0 smoke harness shipped BEFORE implementation plans so every downstream task (Plans 02-05) has a single-shot `bash tests/smoke-48.3.sh` <verify> command. Same precedent as 48.1-05 + 48.2-05.
- [Phase 48.3-01]: Mock-injection contract DEFINED here for Plan 04 to honor — env var `DREAM_WORKER_MOCK_RESPONSE_PATH`. When set, `dispatchDream()` reads the file and returns its contents instead of calling `routingEngine`. Production code paths must NEVER set or read this variable. Smoke harness is the only consumer.
- [Phase 48.3-01]: Three response fixtures, three distinct assertion paths — dream-response-software.json (happy: DRW-04/07/11/12), dream-response-malformed.json (DRW-10 parse-failure), dream-response-doctrine-violation.json (DRW-06 validateRefinementDoctrine reject). Single-purpose fixtures mean smoke failures point to the exact path that broke.
- [Phase 48.3-01]: Throwaway silo_id='software-smoke-48.3' isolation pattern — INSERTed at run start with real software.md prompt_path (so DRW-03 still validates production file), 6 directives pre-seeded (4 mp-smoke-seed-* moe-direct + 2 mp-smoke-target-* dream_worker) to fire active_count > 4 doctrine boundary, all DELETEd by trap cleanup EXIT.
- [Phase 48.3-01]: Wave-0 baseline behavior is intentional non-zero exit at DRW-01 ('memory_proposals table missing'); will turn green as Plans 02-05 land tables / prompt / worker / endpoints. Same failing-baseline-by-design precedent as 48.1-05 + 48.2-05.

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 28 (Battle Arena) deferred from v4.0 — still outstanding, not blocking v6.0
- SaaS billing (BIL-01/02/03) remains active but deferred — not blocking v6.0

## Session Continuity

Last session: 2026-05-13T06:02:47Z
Stopped at: Completed 48.3-01-PLAN.md (Wave 0 smoke harness tests/smoke-48.3.sh + 3 response fixtures; mock-injection contract DREAM_WORKER_MOCK_RESPONSE_PATH defined for Plan 04; baseline exits 1 on DRW-01 as expected)
Resume file: None
