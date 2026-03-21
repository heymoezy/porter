# Phase 6: Real-Time and Transparency - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

All live updates flow through SSE push instead of polling. Users get full visibility into what agents are doing, why Porter made each decision, and the health of every connected service. Requirements: TRNS-01, TRNS-02, TRNS-03, PERF-03.

</domain>

<decisions>
## Implementation Decisions

### Agent Activity Feed (TRNS-01)
- Inline real-time stream embedded in project dashboard (extend Phase 5's ActivityFeed component)
- Each entry shows: action summary + expandable detail on click
- Grouped by agent with time-ordered entries within each agent
- Three sections: Active (now), Completed (today), Queued (next) — clear state machine
- Agent status strip (Phase 5) already shows per-agent state — feed adds the detail layer beneath

### System Health Panel (TRNS-02)
- Dedicated panel accessible from settings/admin area — not cluttering main workspace
- Monitor all AI backends (Claude, Gemini, OpenClaw, Ollama) + SQLite DB + any external API connections
- Token usage: per-model running totals with daily/weekly rollups — actionable for cost management
- Updates via SSE push for status changes, 30s heartbeat for latency metrics
- Service cards with colored status dots (green/yellow/red) — consistent with existing backend health patterns

### Decision Log (TRNS-03)
- Visible to all users in non-technical language (success criterion 4)
- Dual presentation: contextual tooltips on agent/model badges + dedicated filterable log view
- Log three decision types: model selection ("Used Claude because…"), agent routing ("Assigned to Writer because…"), task skipping ("Skipped task because…")
- Keep all decisions, paginated oldest-first — debugging needs full history
- Each entry: timestamp, decision type, chosen option, reasoning (1 sentence), alternatives considered

### SSE Migration (PERF-03)
- Replace all `setInterval` polling with SSE event listeners — keep 60s fallback for missed events (proven pattern from v0.30.x)
- Extend existing porter.py SSE hub (`/api/events` at line 49599) — don't create a second hub
- Also add Fastify SSE route for v1 API consumers (gradual migration)
- Fine-grained typed events: `agent:status`, `agent:activity`, `system:health`, `decision:made`, `project:update`, `memory:change`
- Frontend: single `EventSource` connection, client-side event type filtering (already using this pattern via `_sseBus`)
- Target: 80% reduction in idle HTTP requests (success criterion 5)

### Claude's Discretion
- Exact health panel layout and card arrangement
- Decision log tooltip positioning and interaction
- SSE reconnection backoff strategy
- Activity feed animation/transition details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### SSE Infrastructure
- `porter.py` lines 49599-49636 — Existing SSE hub implementation (`/api/events`, queue-based, heartbeat)
- `porter.py` line 38469 — Frontend SSE bus initialization (`_sseBus = new EventSource('/api/events')`)
- `backend/src/services/scheduler.ts` lines 144-158 — Fastify SSE emission helper (`emitSSE()`)

### Existing Polling to Replace
- `porter.py` line 20976 — Persona refresh timer (`_personaRefreshTimer`)
- `porter.py` line 23579 — Project activity poller (`_projActivityPoller`)
- `porter.py` line 25856 — Ops pulse poller (`_pulseOpsPoller`)
- `porter.py` line 25942 — Gateway activity poller (`_gatewayActivityPoller`)
- `porter.py` line 26148 — Coordination panel poller (`_coordinationPanelPoller`)
- `porter.py` line 29951 — MC metrics timer (`_mcMetricsTimer`)

### Phase 5 Components to Extend
- `frontend/src/hooks/useProjectActivity.ts` — SSE subscription hook (project:activity, agent:activity events)
- `frontend/src/modules/projects/ActivityFeed.tsx` — Time-grouped event cards
- `frontend/src/modules/projects/AgentStatusStrip.tsx` — Agent status indicators

### Requirements
- `.planning/REQUIREMENTS.md` — TRNS-01, TRNS-02, TRNS-03, PERF-03 definitions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ActivityFeed.tsx`: Time-grouped event cards with relative timestamps — extend for agent-specific grouping
- `AgentStatusStrip.tsx`: Horizontal agent strip with framer-motion stagger — extend with activity detail
- `useProjectActivity.ts`: SSE subscription hook — pattern for all new SSE hooks
- `_sseBus` (porter.py): Single EventSource connection — already consolidates multiple SSE paths
- `emitSSE()` (scheduler.ts): Fire-and-forget SSE emission — pattern for decision log emissions
- `mlog.emit()` (porter.py): Structured logging with SSE broadcast — decision log can piggyback

### Established Patterns
- Single SSE bus (`_sseBus`) — all events through one connection, client-side filtering
- Event type namespacing — `agent:status`, `project:activity` (Phase 5 convention)
- 30s heartbeat on SSE connection (porter.py line 49622)
- Fire-and-forget emission with `.catch(() => {})` (scheduler.ts) — never blocks caller
- Fallback polling with teardown on tab leave (v0.30.x pattern: `clearInterval` on `switchModule`)

### Integration Points
- porter.py `/api/events` handler — add new event types for health/decisions
- porter.py `_emit_event()` — broadcast function for new event types
- Frontend `Layout.tsx` — add System Health nav item or settings panel route
- Frontend `ChatView.tsx` — decision tooltips on model/agent badges in messages
- `backend/src/services/scheduler.ts` — emit decision events alongside activity events

</code_context>

<specifics>
## Specific Ideas

- Decision log should explain routing in plain English: "Used Claude Opus because your message mentioned code review, and Claude has the highest code analysis score" — not technical jargon
- Health panel should feel like a server status page (think GitHub Status or Vercel Status) — clean, at-a-glance, colored dots
- Activity feed must feel ALIVE (core Porter principle) — real-time entries sliding in, not a static refreshing list
- Polling removal is a measurable goal: count outbound requests before/after, target 80% reduction during idle

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-real-time-and-transparency*
*Context gathered: 2026-03-21*
