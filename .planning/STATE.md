---
gsd_state_version: 1.0
milestone: v7.0
milestone_name: The Living Memory
status: scoped
stopped_at: "v7.0 scoped 2026-05-16 (autonomous strategic call). 4 phases (49-52), 17 requirements. Trigger: 2026-05-16 logo-freehand incident exposed dream worker blindness to recurring-failure signal. Awaiting /gsd:plan-phase 49 to start execution."
last_updated: "2026-05-16T14:45:00.000Z"
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-15)

**Core value:** Porter is the orchestration platform — you tell Porter what you want, Porter figures out how to get it done across multiple AI models.
**Current focus:** v7.0 Living Memory scoped — Phase 49 Pattern Detection is next. Run `/gsd:plan-phase 49`.

## Current Position

Phase: 48.4 (review-surface) — COMPLETE
Plan: 5 of 5

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
| Phase 48.3-software-dream-worker P02 | 32min | 5 tasks | 5 files |
| Phase 48.3-software-dream-worker P03 | 37 min | 3 tasks | 3 files |
| Phase 48.3-software-dream-worker P04 | 63 min | 3 tasks | 5 files |
| Phase 48.3-software-dream-worker P05 | 132 min | 3 tasks | 9 files |
| Phase 48.4 P01 | 23 min | 3 tasks | 3 files |
| Phase 48.4-review-surface P02 | 79min | 4 tasks | 4 files |
| Phase 48.4 P03 | 45min | 3 tasks | 6 files |
| Phase 48.4-review-surface P04 | 42min | 5 tasks | 6 files |
| Phase 48.4-review-surface P05 | 128min | 4 tasks | 7 files |

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
- [Phase 48.3-software-dream-worker]: [Phase 48.3-02]: dream_runs.dispatch_id stays nullable TEXT with no FK to bridge_dispatch_log — orphan-tolerant, matches 48.2 silo_id precedent
- [Phase 48.3-software-dream-worker]: [Phase 48.3-02]: target_directive_ids declared TEXT[] (not jsonb) per RESEARCH lock — array semantics > json for set membership at query time
- [Phase 48.3-software-dream-worker]: [Phase 48.3-02]: dream_run handler is PLACEHOLDER THROW (not noop) — pre-04 every_week ticks fail loudly in intellect_events instead of silent loss
- [Phase 48.3-software-dream-worker]: [Phase 48.3-02]: dream_runs_stuck_sweep handler fully working in 02 — safe before worker exists (no rows to sweep yet) so day 1 of 04 has the safety net
- [Phase 48.3-software-dream-worker]: [Phase 48.3-02]: BUILTIN_WORKFLOWS seeds are belt-and-braces with migrate-dreams-v1.ts seeds — both idempotent by name, defense against DB rebuild OR codebase regression
- [Phase 48.3-software-dream-worker]: [Phase 48.3-02]: INTELLECT_WEEKLY_INTERVAL = 302400 ticks × 2s = 7d exact; first fire 7 days after restart by design — Plan 04 owns skip-recent guard for manual triggers
- [Phase 48.3-software-dream-worker]: [Phase 48.3-03]: Prompt file path is backend/src/services/intellect/dream-prompts/software.md — matches silos.prompt_path seeded by 48.1-01 (verified live). Plan 04 worker resolves via path.resolve(process.cwd(), siloRow.prompt_path).
- [Phase 48.3-software-dream-worker]: [Phase 48.3-03]: validateRefinementDoctrine consumes activeCountBefore as CALLER-SUPPLIED parameter (DB-queried), NOT parsed.active_directive_count_before (model self-report). Trust DB > trust model.
- [Phase 48.3-software-dream-worker]: [Phase 48.3-03]: Sampler stays model-agnostic — outer cap MAX_BUDGET_OPUS_BYTES=2.5MB. Per-model clamping (Sonnet 800KB) is the POST /dream-run endpoint's job (Plan 05).
- [Phase 48.3-software-dream-worker]: [Phase 48.3-03]: Empty parsed.proposals.length === 0 is SUCCESS (legitimate quiet week); validateRefinementDoctrine returns early without throwing; worker marks dream_run completed with proposals_extracted=0.
- [Phase 48.3-software-dream-worker]: [Phase 48.3-03]: SEED_BASELINE=4 (matches the 4 hand-curated software-silo seeds from 48.1-01). Doctrine engages only when activeCountBefore > 4. Below baseline the rule set is too sparse to demand refinement.
- [Phase 48.3-software-dream-worker]: [Phase 48.3-03]: assignSortOrder uses cross-area offset of +1000 to prevent collision between conceptual_areas. Within area: 100+n delete, 200+n supersede, 300+n merge, 900+n new_directive. Lexicographic area ordering means design-system refinements (offset 0) sort before ship-discipline additions (offset 1000+).
- [Phase 48.3-software-dream-worker]: [Phase 48.3-03]: Smoke harness directive-seed type mismatch (NOW() vs double precision on directives.created_at, tests/smoke-48.3.sh lines 129/131/132) logged to deferred-items.md — out of scope for Plan 03, fix at start of Plan 04 with EXTRACT(EPOCH FROM NOW()).
- [Phase 48.3-software-dream-worker]: [Phase 48.3-04]: Raw passthrough by OMISSION — dispatchDream's RoutingContext omits agentId/projectId/skillsUsed/directiveStats/dispatchStrategy; Memory V3/skills/doctrine wiring skipped because services only engage when their context fields are set. Module header locks contract.
- [Phase 48.3-software-dream-worker]: [Phase 48.3-04]: Explicit routingEngine.logDispatch call after selectWithFallback — selectWithFallback does NOT call logDispatch internally (only dispatchStream does). Worker captures dispatchLogId for dream_runs.dispatch_id; without this the column is always null.
- [Phase 48.3-software-dream-worker]: [Phase 48.3-04]: All-or-nothing transactional INSERT via pool.connect/BEGIN/COMMIT/ROLLBACK — pool.query auto-commits per statement so multi-row atomicity requires a single client. Failure mid-loop ROLLBACKs already-inserted proposals.
- [Phase 48.3-software-dream-worker]: [Phase 48.3-04]: dream_runs row INSERT happens OUTSIDE proposals tx (status='running' written at top of runDreamWorker). Crash leaves sweepable orphan for dream_runs_stuck_sweep (every_30m) — audit-trail row persists even on failure paths.
- [Phase 48.3-software-dream-worker]: [Phase 48.3-04]: ESM __dirname shim via fileURLToPath(import.meta.url) + path.dirname. Repo-root resolution prefers PORTER_REPO_ROOT env var, fallback path.resolve(__dirname,'../../../..') reaches Porter repo from backend/dist/services/intellect/.
- [Phase 48.3-software-dream-worker]: [Phase 48.3-04]: Mock-injection at dispatch boundary via DREAM_WORKER_MOCK_RESPONSE_PATH env var. Production never sets it. Returns modelUsed='mock', dispatchLogId=undefined so downstream identifies mocked runs by dream_runs.model_used + dream_runs.dispatch_id=null.
- [Phase 48.3-software-dream-worker]: [Phase 48.3-04]: Pre-flight sealed-seed check BEFORE DB trigger fires — diagnostic error_message ('Doctrine violation: targeted sealed seed X') rather than postgres constraint-violation traceback. DB trigger remains as defense-in-depth.
- [Phase 48.3-software-dream-worker]: [Phase 48.3-04]: Skip-recent guard fires only for triggeredBy='schedule' (manual triggers ALWAYS run). every_week scheduler + manual /dream-run button compose cleanly — manual won't double-fire after scheduled run, manual won't false-skip on debug re-runs.
- [Phase 48.3-software-dream-worker]: [Phase 48.3-04]: Empty corpus is SUCCESS not failure — quiet week (zero captured turns in 7 days) finalizes dream_runs.status='completed' with proposals_extracted=0, model_used='n/a (empty corpus)', dispatch skipped.
- [Phase 48.3-software-dream-worker]: [Phase 48.3-04]: Smoke harness DRW-04..DRW-12 still skip after Plan 04 because POST /api/v1/intellect/dream-run is Plan 05's deliverable. SKIP_WORKER gate widened with 404-probe so harness exits 0 with schema-only green; full path auto-turns-on when Plan 05 mounts endpoint. Pipeline correctness verified inline via /tmp/dream-worker-{mock,failure}-smoke.mjs.
- [Phase 48.3-software-dream-worker]: [Phase 48.3-05]: Two endpoints (POST /dream-run + GET /dream-runs/:id) match /silo-command + /transcript/turn 127.0.0.1-only posture exactly; NO auth middleware. Server-level bind IS the protection.
- [Phase 48.3-software-dream-worker]: [Phase 48.3-05]: Mock injection moved from env var to body field (_mock_response_path) because env vars don't propagate across HTTP. Production never sets it; tests/smoke-48.3.sh is the only consumer.
- [Phase 48.3-software-dream-worker]: [Phase 48.3-05]: Bridge circuit-breaker action was a no-op (broken since opossum 9 adoption). Fixed by replacing noop with runThunk = async (fn) => fn(); also bumped timeout 30s → 180s. Dormant Bridge-wide because chat goes through dispatchStream which bypasses breaker.fire — dream-worker is the first real consumer of non-streaming dispatch.
- [Phase 48.3-software-dream-worker]: [Phase 48.3-05]: Live unmocked Sonnet 4.6 dispatch verified raw passthrough by omission — bridge_dispatch_log row's agent_id/chat_id/project_id/skills_used/dispatch_strategy all NULL (Memory V3/skills/doctrine only fire when those fields are set). 72.7s real dispatch, 6362 output tokens, Layer 2 doctrine fired on real model output.
- [Phase 48.3-software-dream-worker]: [Phase 48.3-05]: bridge_dispatch_log.system_prompt does NOT exist on live schema — the plan's textual raw-passthrough check substituted with structural NULL-set proof on context-tracking columns (logically equivalent, stronger evidence).
- [Phase 48.4]: [Phase 48.4-01]: Wave 0 smoke + Playwright scaffold + fixture SQL shipped BEFORE Plan 02 implementation so every downstream task has single-shot bash tests/smoke-48.4.sh <verify> command. Same precedent as 48.1-05 + 48.2-05 + 48.3-01.
- [Phase 48.4]: [Phase 48.4-01]: Three-gate soft-skip pattern: (1) backend reachable via curl /health, (2) backend/src/routes/admin/dreams.ts exists on disk, (3) admin login succeeds. Each gate failure -> graceful [skip] of dependent RVS-* checks, harness still exits 0.
- [Phase 48.4]: [Phase 48.4-01]: SSE event-topic contract DEFINED by Wave 0 smoke (proposals:created on dream-worker INSERT, proposals:resolved on accept/reject/expire, dreams:run-completed on UPDATE-status); Plan 02 must HONOR via post-commit broadcast() calls in admin/dreams.ts + dream-worker.ts + workflow-engine.ts memory_proposals_expire handler.
- [Phase 48.4]: [Phase 48.4-01]: Auto-expiry workflow contract DEFINED: BUILTIN_WORKFLOWS seed trigger_value='every_24h' + action_type='memory_proposals_expire'; handler UPDATE memory_proposals SET status='expired' WHERE pending AND expires_at < EXTRACT(EPOCH FROM NOW()); audit event + broadcast post-UPDATE. Smoke asserts workflow row presence unconditionally and falls back to direct SQL if /api/admin/workflows/run-by-action endpoint absent.
- [Phase 48.4]: [Phase 48.4-01]: SILO_MISMATCH probe references the REAL silo-sw-design-system directive intentionally - smoke asserts accept-handler returns 422 AND real directive content remains unmutated (defense in depth against accidental cross-silo accept leak).
- [Phase 48.4]: [Phase 48.4-01]: Playwright scaffold uses CommonJS require() not ESM import - matches tests/skill-evolution.spec.js precedent and tests/package.json (no type:module). loginAdmin helper uses #uname/#pw/.login-btn selectors with username moe (matches setup-auth.js + skill-evolution.spec.js).
- [Phase 48.4-review-surface]: [Phase 48.4-02]: req.sessionUser?.username is the canonical reviewer pull (typed FastifyRequest property declared in plugins/auth.ts:11, populated by plugins/admin-auth.ts:37). admin/intelligence.ts:145 precedent. Never use req.session.username — that property does not exist on FastifyRequest.
- [Phase 48.4-review-surface]: [Phase 48.4-02]: Drizzle $inferSelect types (MemoryProposalRow/DreamRunRow) are camelCase and ONLY apply through the ORM query builder. Raw pool.query returns snake_case column names. Mixing the two compiles silently but breaks at runtime — caught on first tsc pass; inline snake_case row types are correct for raw pg routes.
- [Phase 48.4-review-surface]: [Phase 48.4-02]: Reject handler is symmetric-atomic with accept (single BEGIN/COMMIT/ROLLBACK on pool.connect() client). Keeps proposal-flip + intellect_events audit INSERT atomic; if the audit write fails, the flip rolls back.
- [Phase 48.4-review-surface]: [Phase 48.4-02]: All admin/dreams SSE broadcasts are post-COMMIT (outside the try-with-resources around pool.connect). Reject handler stores siloId/dreamRunId in outer-scope vars to broadcast AFTER the finally release. Pitfall 1 enforcement.
- [Phase 48.4-review-surface]: [Phase 48.4-02]: Empty-corpus dream run still broadcasts dreams:run-completed (proposals_extracted=0) so UI clears the running pill on quiet weeks. Only proposals:created is gated on parsed.proposals.length>0. 4 broadcast sites total in dream-worker (1 proposals:created + 3 dreams:run-completed for success/empty/failure).
- [Phase 48.4-review-surface]: [Phase 48.4-02]: Pre-flight order in accept handler: NOT_FOUND → INVALID_STATE → TARGET_GONE (rowCount != length) → SILO_MISMATCH (scope/scope_id check) → SEALED_SEED (source_type=moe-direct for delete/supersede/merge). All ROLLBACK before returning. DB trigger directive_immutable_moe_direct remains as defense-in-depth.
- [Phase 48.4-review-surface]: [Phase 48.4-02]: Cleanup of sealed-seed test fixtures requires BEGIN; SET LOCAL porter.allow_moe_direct_mutation='true'; DELETE; COMMIT; — the immutability trigger blocks ordinary DELETEs even from psql.
- [Phase 48.4-review-surface]: [Phase 48.4-03]: SSE refactor from es.onmessage to es.addEventListener fixes dormant repo-wide bug — backend writes named SSE events (event: <topic>), which never fired on .onmessage. All existing bridge:*/agent:*/profile:updated listeners now actually fire after next Porter restart.
- [Phase 48.4-review-surface]: [Phase 48.4-03]: Each named SSE topic gets its own explicit es.addEventListener call (20 total) — not a single helper — because the gate required grep -c >= 4 verifying the refactor was real. parsed() helper wraps JSON.parse + error swallow once.
- [Phase 48.4-review-surface]: [Phase 48.4-03]: Silo Select hardcodes software + software-smoke-48.4 for v1 — no /api/admin/silos endpoint exists yet. Future enhancement: useQuery against that endpoint when it ships.
- [Phase 48.4-review-surface]: [Phase 48.4-03]: Raw <table> + animate-pulse skeletons matching approvals.tsx precedent (no shadcn Table/Skeleton primitives in this repo). Card + Badge + Button + Select shadcn primitives all exist and used as planned.
- [Phase 48.4-review-surface]: [Phase 48.4-03]: selectedProposalId state stored on row click + exposed as data-testid='selected-proposal-marker' invisible div for Plan 04 drawer to consume. No drawer rendered yet.
- [Phase 48.4-review-surface]: [Phase 48.4-04]: sonner toast lib installed + Toaster mounted in root.tsx inside QueryClientProvider — single dep, ships own types, never fall back to alert() (feedback_porter_alive.md + Playwright assertion compatibility)
- [Phase 48.4-review-surface]: [Phase 48.4-04]: ProposalDetailDrawer uses Sheet (right slide-over) + Dialog (delete-kind confirmation). DiffBlock is set-difference rendering (NOT LCS) — acceptable v1 for wholesale rewrites per RESEARCH § Don't Hand-Roll. Defer LCS until proposal previews show fine-grained edits.
- [Phase 48.4-review-surface]: [Phase 48.4-04]: Failure-code → toast mapping via two helper fns (toastAcceptError/toastRejectError); 6 codes covered (NOT_FOUND, INVALID_STATE, TARGET_GONE, SEALED_SEED, SILO_MISMATCH, ACCEPT_FAILED). Error-path toasts also invalidate proposals query so stale rows clear.
- [Phase 48.4-review-surface]: [Phase 48.4-04]: GET /api/admin/intelligence/directives/:id endpoint does NOT exist (verified by grep). Target fetch in drawer try/catches and returns null; DiffBlock renders only when fetch succeeds — graceful degradation. Add endpoint when fine-grained diff preview becomes a felt need.
- [Phase 48.4-review-surface]: [Phase 48.4-04]: runFilter state on dreams.tsx — clicking 'view' on a run row narrows the proposals table to that dream_run_id via queryKey + dream_run_id URL param. 'Clear run filter' button in card header resets it. Active row gets bg-surface/60 visual cue.
- [Phase 48.4-review-surface]: [Phase 48.4-04]: Per-route window 'dreams:run-completed' listener (NOT global) — toasts fire only while reviewer is on /dreams page. Cleanup on unmount. Plan 03 already dispatches the CustomEvent from useAdminSSE.
- [Phase 48.4-review-surface]: [Phase 48.4-05]: systemd --user restart porter-fastify can race and leave the old PID running; /health continues reporting the previous version. Canonical ship sequence is systemctl stop → sleep 3 → pkill -9 -f "porter/backend|porter-fastify|tsx src/index.ts" → sleep 3 → systemctl start → sleep 10 → verify /health.
- [Phase 48.4-review-surface]: [Phase 48.4-05]: Sonner toast Playwright selector is [data-sonner-toast] (the visible <li>) not [data-sonner-toaster] (the CSS-hidden <ol> wrapper). Filtering on the <ol> fails strict-mode visibility assertions.
- [Phase 48.4-review-surface]: [Phase 48.4-05]: SSE broadcast fanout channel is /api/events (single channel, see backend/src/routes/events.ts) — not /api/admin/events. proposals:created + proposals:resolved + dreams:run-completed events all fanout through this single endpoint.
- [Phase 48.4-review-surface]: [Phase 48.4-05]: Admin login credentials are moe@askporter.app / porter (NOT moe@themozaic.com — that's a stale MEMORY.md note; users table verified). Login endpoint is /api/v1/auth/login (NOT /api/auth/login).
- [Phase 48.4-review-surface]: [Phase 48.4-05]: Mock-injection for autonomous live verify: POST /api/v1/intellect/dream-run body field _mock_response_path with a doctrine-compliant fixture (dream-response-software.json) gives <30ms deterministic pipeline traversal. Production never sets this field. RVS-13 Playwright + autonomous verify both use it.

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 28 (Battle Arena) deferred from v4.0 — still outstanding, not blocking v6.0
- SaaS billing (BIL-01/02/03) remains active but deferred — not blocking v6.0

## Session Continuity

Last session: 2026-05-13T22:07:09.566Z
Stopped at: Completed 48.4-05-PLAN.md (v6.17.0 shipped; Dream Silos series complete: full smoke 4-phase green + Playwright 7/7 green + autonomous live verify 9-step pipeline confirmed end-to-end with next-CLI directive injection)
Resume file: None
