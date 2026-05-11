---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: The Orchestration Platform
status: ready_for_phase_verification
stopped_at: Completed 48.1-04-PLAN.md (phase 48.1 silo-foundation complete — ready for phase verification)
last_updated: "2026-05-11T14:13:00.463Z"
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
**Current focus:** Phase 48.1 — silo-foundation

## Current Position

Phase: 48.1 (silo-foundation) — COMPLETE (all 5 plans shipped, all 4 waves landed, Moe approved live-CLI checkpoint 2026-05-11)
Plan: 5 of 5 complete (plans 01 + 02 + 03 + 04 + 05 shipped)
Next step: `/gsd:verify-work 48.1` then orchestrator-level push (per "push after every phase" rule). Next phase = 48.2 Transcript Capture.

## Performance Metrics

**Velocity (from v1.0 through v5.0):**

- Total plans completed: 92 (v1.0: 51, v2.0: 2, v3.0: 19, v4.0: 17, v5.0: 3 additional)
- Phases completed: 38 across all milestones
- Average plan duration: ~6 min

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

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 28 (Battle Arena) deferred from v4.0 — still outstanding, not blocking v6.0
- SaaS billing (BIL-01/02/03) remains active but deferred — not blocking v6.0

## Session Continuity

Last session: 2026-05-11T13:50:00Z
Stopped at: Completed 48.1-04-PLAN.md — phase 48.1 silo-foundation complete; ready for phase verification.
Resume file: None
