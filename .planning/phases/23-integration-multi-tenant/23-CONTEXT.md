# Phase 23: Integration & Multi-Tenant - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire Bridge into Memory V3 and Brain health, add per-agent dispatch queryability, session routing history access, per-user API keys, per-workspace gateway overrides, and usage attribution. Pure backend API — final phase of v3.0 milestone.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

Key constraints from requirements:
- INT-01: Routing decisions → Memory V3 signals so agents learn model preferences
- INT-02: Dispatch log queryable by agent_id (model used, tokens, latency, performance)
- INT-03: Session routing history per conversation — which model handled each turn
- INT-04: Bridge gateway health exposed in Brain health dashboard
- MT-01: Per-user API key storage for direct provider access
- MT-02: Per-workspace gateway overrides (admin configures available gateways)
- MT-03: Usage attribution — costs attributed to user/project/agent for billing

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/services/bridge/routing-engine.ts` — logDispatch() already writes to bridge_dispatch_log with agent_id, project_id, chat_id
- `backend/src/services/bridge/routing-engine.ts` — recordSessionTurn() already writes to session_routing_context
- `backend/src/routes/v1/health.ts` — existing health endpoint
- `backend/src/routes/v1/admin/bridge.ts` — dispatch-log and costs endpoints already have agent/project filtering
- `backend/src/services/bridge/health-probe.ts` — runHealthProbe() with gateway status
- Memory V2 system with signals layer (backend/src/services/memory.ts or similar)
- `bridge_dispatch_log` table has agent_id, project_id, chat_id, estimated_cost_usd columns
- `session_routing_context` table has chat_id, message_sequence, model info

### Established Patterns
- Memory signals: low-trust extracted observations that can be promoted
- Gateway credentials: encrypted storage via encryptCredential()
- Admin routes with role checks
- JSONB metadata columns for flexible configuration

### Integration Points
- logDispatch(): emit Memory V3 signal after dispatch logging
- health.ts: add bridge gateway status summary
- New migration for user_api_keys and workspace_gateway_overrides tables
- Existing dispatch-log endpoint: already supports agent_id filter

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
