# Phase 41: Session Intelligence - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Memory frozen at session start (injected in system prompt, never mutated mid-session). FTS5 cross-session search so agents can query past sessions. Dispatch outcome scoring feeds back into routing confidence.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- backend/src/services/memory-injection.ts — buildMemoryContext() tiers
- backend/src/services/session-registry.ts — session tracking, token accounting
- backend/src/services/bridge/routing-engine.ts — select(), dispatch logging
- backend/src/db/schema.ts — session_registry, bridge_dispatch_log tables

### Integration Points
- Freeze memory snapshot at buildMemoryContext() call time, cache per session
- FTS5 virtual table over agent_messages or bridge_dispatch_log
- Routing confidence: aggregate dispatch outcomes per gateway, feed into select()

</code_context>

<specifics>
No specific requirements.
</specifics>

<deferred>
None
</deferred>
