# Phase 19: Model Catalog - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the model catalog: a `models` table that catalogs every model across all gateways with capabilities, pricing, context windows, and version history. Auto-populate from gateway adapters. Wire cost tracking into dispatch logging. Pure backend infrastructure.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

Key constraints from requirements:
- MOD-01: Models table with gateway_id FK, model name, capability tags (coding, writing, analysis, vision), context window, pricing (input/output per M tokens), benchmarks
- MOD-02: Auto-population — query each gateway adapter's listModels() on detection and daily refresh
- MOD-03: Capability-based routing — model strengths inform routing engine selection, not just cost tier
- MOD-04: Model version tracking — detect updates, store version history, log version per dispatch
- MOD-05: Cost tracking per-dispatch — input/output/cached tokens + USD cost from model pricing metadata, logged to bridge_dispatch_log

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/services/bridge/adapters/*.ts` — 5 adapters each implement listModels() returning string[]
- `backend/src/services/bridge/routing-engine.ts` — select() and selectWithFallback() query gateways table
- `backend/src/services/bridge/startup-detector.ts` — detectAndUpsertGateways() runs on boot
- `backend/src/db/schema.ts` — Drizzle schema with gateways, gatewayCredentials, bridgeDispatchLog tables
- `backend/src/services/scheduler.ts` — tick loop with interval-based task execution
- `bridge_dispatch_log` table already has estimated_cost_usd, input_tokens, output_tokens columns (Phase 20)

### Established Patterns
- Migrations: pool.connect() -> BEGIN -> schema_migrations guard -> DDL -> COMMIT
- Drizzle ORM for table definitions in schema.ts
- Gateway adapters implement GatewayAdapter interface with listModels()
- Fire-and-forget logging in routing-engine.ts logDispatch()

### Integration Points
- startup-detector.ts: after gateway detection, trigger model discovery
- scheduler.ts: daily model refresh task
- routing-engine.ts: use model capabilities for smarter selection
- logDispatch(): calculate and log USD cost from model pricing

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
