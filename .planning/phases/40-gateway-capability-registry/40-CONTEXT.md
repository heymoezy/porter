# Phase 40: Gateway Capability Registry - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Every gateway has a structured capability record (strengths, cost_tier, context_window, tool_support, agentic flag) driving dispatch decisions. Task dispatch selects gateway based on requirements matched against capabilities. Dynamic tool schema strips unsupported tools. All 5 gateways work through unified task dispatch.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase. Key areas:
- Capability schema on gateways table (JSONB or dedicated columns)
- Strength categories (reasoning, coding, analysis, writing, speed, cost)
- Cost tier enum (premium, standard, budget)
- Tool support detection (which tools each gateway can handle)
- Dynamic tool filtering before dispatch
- Capability matching algorithm for task routing

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- backend/src/services/bridge/types.ts — GatewayAdapter interface, GatewayRow with capabilities[]
- backend/src/services/bridge/routing-engine.ts — select(), filterByCapabilities(), heuristic routing
- backend/src/services/bridge/startup-detector.ts — detectAndUpsertGateways() probes on startup
- backend/src/services/bridge/task-executor.ts — TASK_CAPABLE_TYPES, CLI dispatch
- backend/src/services/bridge/http-task-executor.ts — HTTP agent loop with tools
- backend/src/db/schema.ts — gateways table with capabilities jsonb

### Integration Points
- startup-detector must populate capability records on detect
- routing-engine.select() must use capabilities for matching
- task dispatch must filter tool schema per gateway
- admin bridge panel needs capability display

</code_context>

<specifics>
No specific requirements — infrastructure phase.
</specifics>

<deferred>
None
</deferred>
