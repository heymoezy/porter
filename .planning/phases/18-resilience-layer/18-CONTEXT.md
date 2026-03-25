# Phase 18: Resilience Layer - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the resilience infrastructure for the Bridge layer: background health probes, circuit breakers, retry with backoff, and N-gateway fallback chains. Pure backend infrastructure — no UI, no user-facing changes.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

Key constraints from requirements:
- GW-02: Health probe every 30s via existing scheduler, updates gateway status in DB, SSE events on state changes
- GW-04: Circuit breaker per gateway using opossum library, Closed/Open/Half-Open states, configurable thresholds, SSE on trips
- GW-05: Retry with exponential backoff for transient errors (429, 503), separate from circuit breaker
- GW-06: Fallback chain — N gateways in priority order through routing engine

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/services/scheduler.ts` — existing scheduler with polling loop and emitSSE()
- `backend/src/services/bridge/adapters/*.ts` — 5 adapters each implement health() method returning HealthResult
- `backend/src/services/bridge/routing-engine.ts` — select() queries gateways table, can be extended for fallback
- `backend/src/services/bridge/dispatch-queues.ts` — PQueue per gateway type
- `backend/src/services/bridge/types.ts` — GatewayAdapter interface with health(), GatewayStatus type

### Established Patterns
- Gateway status stored in `gateways` table (status column: 'active' | 'stale' | 'unavailable')
- SSE events emitted via `emitSSE(event, data)` from scheduler.ts
- Migrations follow pool.connect() -> BEGIN -> schema_migrations guard pattern
- Fire-and-forget logging pattern (try/catch with empty catch) used in routing-engine.ts

### Integration Points
- Scheduler: register health probe as a new scheduled task
- Routing engine: select() needs fallback chain when primary gateway fails
- Gateway adapters: health() already exists on each adapter
- startup-detector.ts: initial gateway detection on boot

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
