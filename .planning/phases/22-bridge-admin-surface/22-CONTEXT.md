# Phase 22: Bridge Admin Surface - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Bridge admin API surface: 7 admin endpoints exposing gateways, models, dispatch log, cost analytics, gateway CRUD, routing rule management, and SSE event verification. Also ensure API response shapes are designed as component-ready data contracts (DS-01/02/03 are about API structure, not frontend code — frontend is built separately). Pure backend API.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

Key constraints from requirements:
- ADM-01: GET /api/admin/bridge — gateway cards with live health, latency, uptime %, model count
- ADM-02: GET /api/admin/bridge/models — unified model catalog with capabilities, pricing, benchmarks
- ADM-03: GET /api/admin/bridge/dispatch-log — paginated routing decisions with model, reason, cost, latency
- ADM-04: GET /api/admin/bridge/costs — spend aggregated by gateway/model/day with date range params
- ADM-05: POST /api/admin/bridge/gateways — gateway CRUD (add, update, remove, validate)
- ADM-06: POST /api/admin/bridge/routing-rules — routing rule CRUD
- ADM-07: SSE events (bridge:health, bridge:dispatch, bridge:circuit-trip) already emitted — verify they stream to admin clients
- DS-01: API responses structured as component-ready data contracts (card shapes, list shapes)
- DS-02: API includes agent-ready fields (activity feeds, status indicators, briefing slots)
- DS-03: Follows existing admin route patterns (auth, role checks, envelope responses)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/routes/v1/bridge.ts` — existing bridge routes (GET /gateways, POST /redetect, GET /detect, setup wizard)
- `backend/src/services/bridge/routing-engine.ts` — logDispatch() already emits bridge:dispatch SSE
- `backend/src/services/bridge/health-probe.ts` — emits bridge:health SSE events
- `backend/src/services/bridge/circuit-breaker-registry.ts` — emits bridge:circuit-trip SSE events
- `backend/src/services/bridge/model-catalog.ts` — models table queries, calculateCostUsd
- `backend/src/db/schema.ts` — Drizzle schemas for gateways, models, bridgeDispatchLog, routingRules
- `backend/src/routes/v1/admin/*.ts` — existing admin routes pattern (users, templates, logs)

### Established Patterns
- Admin routes use requireAuth + admin capability check
- All responses wrapped in ok() / fail() envelopes
- Pagination via ?page=&limit= query params
- SSE via emitSSE() from scheduler.ts

### Integration Points
- New admin bridge route file: backend/src/routes/v1/admin/bridge.ts
- Register in v1 route index
- Use existing bridge service layer (routing-engine, model-catalog, health-probe)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
