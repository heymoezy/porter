---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Porter Bridge
status: unknown
stopped_at: Completed 19-01-PLAN.md
last_updated: "2026-03-25T10:53:30Z"
progress:
  total_phases: 8
  completed_phases: 4
  total_plans: 13
  completed_plans: 12
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-25)

**Core value:** Every AI backend is visible, manageable, and intelligently routed — nothing hidden, everything in the database.
**Current focus:** Phase 19 — model-catalog

## Current Position

Phase: 19 (model-catalog) — EXECUTING
Plan: 2 of 2

## Performance Metrics

**Velocity (from v1.0 + v2.0):**

- Total plans completed: 53 (51 from v1.0, 2 from v2.0)
- Phases completed: 16 (7 from v1.0, 9 from v2.0)
- Average plan duration: ~6 min

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v3.0]: Bridge as major innovation — AI gateway management is Porter's differentiator
- [v3.0]: No agent forging — Bridge agent templates created but not instantiated (deferred to v4.0)
- [v3.0]: Three new npm packages only: opossum, p-queue, which
- [v3.0]: Delegation pattern — services/bridge/ wraps existing ai-router.ts and stream-service.ts without modifying them
- [v3.0]: Agent-First UI (formerly v3.0 phases 20-24) renumbered to v4.0 phases 24-28
- [Phase 16]: Raw SQL for startup detector — runs at boot before Drizzle initialized
- [Phase 16]: detectAndUpsertGateways() runs after scheduler.start() — never blocks HTTP readiness
- [Phase 16]: Deterministic SHA-256 credential ID for idempotent upserts across restarts
- [Phase 16-gateway-foundation]: Bridge API uses requireAuth preHandler + sessionUser.role consistent with rest of codebase
- [Phase 16-gateway-foundation]: maskRow mappers at route layer guarantee encrypted_value never reaches API responses (GW-07)
- [Phase 17-provider-adapters]: OllamaAdapter uses /api/chat (not /api/generate) — message.content field for token extraction
- [Phase 17-provider-adapters]: OpenClawAdapter.health() two-part check: /health liveness then GET /v1/chat/completions (404=disabled, report config fix)
- [Phase 17]: Prompt delivery varies by CLI: positional arg for Codex, stdin for Claude, -p flag for Gemini
- [Phase 17]: Codex timeout 120s vs 60s for Claude/Gemini — Codex CLI is measurably slower
- [Phase 17-provider-adapters]: StreamNormalizer is intentionally thin — no format conversion, only abort propagation and error boundary; ADAPTER_MAP keys use GatewayType strings matching DB values; createAdapter() returns null for unknown types
- [Phase 20-live-dashboard]: p-queue v9.1.0 chosen (ESM-only, type=module compatible); CLI gateways concurrency=1, HTTP gateways concurrency=3; PQueue singleton map keyed by gateway type; Wave 0 test stubs use node:test + tsx
- [Phase 20-02]: RoutingEngine singleton class; fire-and-forget logging via async IIFE; selectStreamBackend() changed to async; gitignore false positive on admin/ directory resolved with git add -f
- [Phase 18-01]: opossum loaded via createRequire (CJS in ESM project) — breakers keyed by gatewayId not gatewayType — errorFilter=isTransientError suppresses 429/503 — circuit_state column is observability-only
- [Phase 18-02]: mock.module unavailable in Node v22.22.0 — used DI pattern (runHealthProbeWithDeps) instead — startup guard uses tickCount > HEALTH_PROBE_INTERVAL (strict) — circuit_state defaults to closed when getBreakerState is null
- [Phase 18-resilience-layer]: selectAllCandidates() includes stale gateways (status IN active,stale) — stale=degraded but functional, only unavailable excluded from fallback chain
- [Phase 18-resilience-layer]: ai-router.ts removes model from BridgeDispatchRequest — each adapter resolves model internally; stream-service.ts uses selectAllCandidates() not selectWithFallback() for streaming backend class selection
- [Phase 19-01]: lookupMetadata uses prefix matching in both directions so future model versions (e.g., claude-sonnet-4-7) get enriched metadata automatically
- [Phase 19-01]: refreshModelsForGateway accepts gatewayStatus param — only marks models inactive for 'active' gateways, not 'stale' (stale may have incomplete model lists)
- [Phase 19-01]: calculateCostUsd uses pool parameter not singleton import — avoids circular dependency with startup-detector.ts context
- [Phase 19-01]: Cached tokens billed at 10% of input price — standard prompt cache discount model

### Pending Todos

None yet.

### Completed Plans

- [16-01]: gateways + gateway_credentials tables (migration + Drizzle), GatewayAdapter interface — 2026-03-25
- [16-02]: Startup detector — which-based PATH scan + env bootstrap + Fastify boot wiring — 2026-03-25
- [19-01]: models + model_versions tables, Drizzle schema, model-catalog.ts service (refreshModelsForGateway, refreshAllGateways, calculateCostUsd) — 2026-03-25

### Blockers/Concerns

- [Phase 17]: CLI adapter edge cases — Codex CLI and Claude CLI subprocess dispatch under error conditions needs a spike during planning
- [Phase 16]: opossum v9 types — @types/opossum v8 typings may not fully cover v9 API; verify at install time
- [Coordination]: Another Claude session building frontend-v2 — check recent git log before any schema work

## Session Continuity

Last session: 2026-03-25T10:53:30Z
Stopped at: Completed 19-01-PLAN.md
Resume file: None
