# Phase 39: Bridge Task Dispatch - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Bridge can dispatch real tasks to CLI gateways (Codex, Gemini, Claude) where the model has full tool access — reading files, running commands, editing code. Chat dispatch unchanged.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase. Key areas:
- task() method on GatewayAdapter interface (optional, alongside stream())
- POST /api/v1/tasks/dispatch endpoint with cwd, prompt, gateway selection
- bridge_tasks table for lifecycle tracking (queued → running → complete/failed)
- SSE progress events (bridge:task-progress, bridge:task-complete)
- Separate p-queue per gateway for task isolation
- --bare flag for Claude CLI, --dangerously-bypass-approvals-and-sandbox for Codex
- 1MB output cap with truncation
- Admin UI for task monitoring

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- backend/src/services/bridge/adapters/ — 5 gateway adapters with spawn patterns
- backend/src/services/bridge/routing-engine.ts — dispatch routing, queue management
- backend/src/services/admin/sse-hub.ts — SSE event broadcasting
- backend/src/db/schema.ts — Drizzle ORM patterns

### Integration Points
- New task() method on GatewayAdapter interface
- New POST /api/v1/tasks/dispatch route
- bridge_tasks table for persistence
- SSE events for real-time progress
- Admin bridge panel for task visibility

</code_context>

<specifics>
## Specific Ideas
No specific requirements — infrastructure phase.
</specifics>

<deferred>
## Deferred Ideas
None
</deferred>
