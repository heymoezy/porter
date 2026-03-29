# Bridge Overhaul — Design Document

> **Status:** Research complete, design ready for review
> **Author:** Claude Code (2026-03-27)
> **For:** Moe

---

## The Problem

The Bridge page has 4 agent stations at the top that do nothing. Below them, data is organized by technical category (gateways, dispatch log, costs) rather than by responsibility. The page tells you what happened but doesn't help you understand who's responsible for what or give you controls to optimize.

## The Vision

**Each agent becomes a tab.** When you click an agent, the page transforms to show that agent's perspective — their data, their activity, their controls. The agents aren't decoration; they're the navigation.

## Agent Tab Architecture

### Tab 1: Bridge Operator — "Health & Control"
**What you see:**
- Gateway cards with live health status, circuit breaker state, latency
- Per-gateway config: enable/disable, validate, speed test
- System prompt / config file viewer for each gateway
- Health timeline: when did gateways go up/down
- Activity log: recent health probe results, circuit trips, failovers

**User controls:**
- Enable/disable gateways
- Force circuit breaker reset
- Re-detect gateways
- Speed test (individual + all)

**Data sources:**
- GET /api/admin/bridge (gateways + summary)
- POST /api/admin/bridge/gateways (CRUD)
- POST /api/admin/bridge/speed-test
- SSE: bridge:health, bridge:circuit-trip

### Tab 2: Model Scout — "Discovery & Catalog"
**What you see:**
- Full model catalog across all gateways
- Capabilities matrix (coding/writing/analysis/vision per model)
- Context windows, pricing comparison
- Model version history
- Which models are active vs stale

**User controls:**
- Refresh model catalog
- Toggle model active/inactive
- Compare models side-by-side

**Data sources:**
- GET /api/admin/bridge/models
- GET /api/admin/bridge/models/:id/versions
- Model metadata from model-catalog.ts

### Tab 3: Route Analyst — "Decisions & Rules"
**What you see:**
- Dispatch log with full decision reasoning
- Routing rules editor
- Per-agent routing stats (which agent uses which model)
- Session routing history (drill into any chat)
- Decision pattern analysis

**User controls:**
- Create/edit/delete routing rules
- **Optimize for:** Speed / Quality / Cost toggle (sets routing preference)
- Filter dispatch log by model, gateway, agent
- View session-level routing

**Data sources:**
- GET /api/admin/bridge/dispatch-log
- POST /api/admin/bridge/routing-rules
- GET /api/admin/bridge/agent-stats
- GET /api/admin/bridge/session/:chatId/routing
- SSE: bridge:dispatch

### Tab 4: Cost Controller — "Spend & Attribution"
**What you see:**
- Total spend dashboard with daily trend
- Cost breakdown by gateway, model, agent, project, user
- Token usage metrics
- Cost per request averages
- Workspace gateway overrides
- User API key management

**User controls:**
- Date range filtering
- Attribution grouping (agent/project/user)
- Workspace overrides (enable/disable gateways per workspace)
- User API key management (rotate, delete)

**Data sources:**
- GET /api/admin/bridge/costs
- GET /api/admin/bridge/attribution
- POST /api/admin/bridge/workspace-config
- GET/POST /api/admin/bridge/user-keys

---

## Status Bar (persistent across all tabs)

Always visible at the top:
- Health summary: X healthy, Y degraded, Z down
- Total models across all gateways
- Open circuit breakers count
- Current optimization mode: Speed / Quality / Cost

---

## What Gets Exposed That's Currently Hidden

| Endpoint | Currently | After |
|----------|-----------|-------|
| /attribution | No UI | Cost Controller tab |
| /agent-stats | Buried in dispatch log | Route Analyst tab (dedicated panel) |
| /session/:chatId/routing | Buried in dispatch log expand | Route Analyst tab (session view) |
| /models/:id/versions | No UI | Model Scout tab (version history) |
| /user-keys | Component exists, not rendered | Cost Controller tab |
| /workspace-config | Component exists, not rendered | Cost Controller tab |
| SSE events | Partially consumed | All tabs react to relevant events |

---

## Implementation Phases

### Phase A: Tab Shell + Bridge Operator (foundation)
- Replace agent strip + expandable sections with tab navigation
- Agent pixel portraits as tab icons
- Bridge Operator tab: gateway cards + config + health activity
- Status bar persistent across tabs

### Phase B: Model Scout + Route Analyst
- Model Scout tab: full catalog, capabilities matrix, version history
- Route Analyst tab: dispatch log, rules editor, optimization toggle
- Per-agent stats as dedicated panel (not buried)

### Phase C: Cost Controller + Polish
- Cost Controller tab: spend dashboard, attribution, user keys, workspace overrides
- SSE integration across all tabs
- Performance: only active tab queries data

---

## Open Questions for Moe

None — proceeding with this design. The agent-as-tabs concept directly maps to the 4 agents already defined, each owning their natural data domain.
