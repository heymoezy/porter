---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: The Orchestration Platform
status: unknown
stopped_at: Completed 44-01-PLAN.md
last_updated: "2026-04-03T13:53:43.774Z"
progress:
  total_phases: 17
  completed_phases: 12
  total_plans: 37
  completed_plans: 37
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-02)

**Core value:** Porter is the orchestration platform — you tell Porter what you want, Porter figures out how to get it done across multiple AI models.
**Current focus:** Phase 44 — Autonomous Job Queue

## Current Position

Phase: 44 (Autonomous Job Queue) — EXECUTING
Plan: 2 of 2

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

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 28 (Battle Arena) deferred from v4.0 — still outstanding, not blocking v6.0
- SaaS billing (BIL-01/02/03) remains active but deferred — not blocking v6.0

## Session Continuity

Last session: 2026-04-03T13:53:43.771Z
Stopped at: Completed 44-01-PLAN.md
Resume file: None
