# Bridge Overhaul — Research Synthesis

> Compiled: 2026-03-27
> Sources: 3 deep codebase explorations, historical research review (20+ docs), Cog repo study

---

## Key Findings

### From Cog (github.com/marciopuga/cog)

Not a software project — a set of markdown conventions for LLM memory. But 6 patterns directly apply:

1. **4 agents with rigid ownership boundaries** — reflect/evolve/foresight/housekeeping maps perfectly to Bridge's 4 tabs. Each agent has explicit "do NOT touch" boundaries. Bridge Operator doesn't edit routing rules. Route Analyst doesn't manage health probes.

2. **Briefing bridge pattern** — structured handoff files between agents. Bridge agents should produce structured outputs that other agents consume, not query each other's raw data.

3. **L0/L1/L2 progressive context loading** — one-liner summaries → section headers → full content. Bridge agents should scan gateway summaries first, drill into details only when relevant.

4. **Self-auditing "evolve" agent** — audits rules themselves, not content. Maps to Route Analyst: "are the routing thresholds right? Is the fallback chain effective?"

5. **SSOT enforcement** — every fact in exactly one place, views are windows into canonical data. Gateway health in one table, cost in one table, agent views are projections.

6. **Append-only observations → distilled patterns → active state** — raw dispatch logs → trend analysis → dashboard view.

### From Historical Research (20+ Porter docs)

**Bridge is the substrate, not a feature.** Every dispatch — user, agent, decomposition, scheduler — flows through Bridge. This means:

- Add `source_type` to dispatch logging (user/agent/decomposition/scheduler)
- Dispatch log must include `task_node_id` for decomposition integration
- Memory V3 reads Bridge audit trail (no chat extraction)
- Routing rules must support task-type conditions for decomposition engine

**Hermes patterns applicable:**
1. TodoStore per Bridge agent (structured task list surviving compression)
2. Event hooks for all Bridge lifecycle events
3. Frozen memory snapshot at dispatch (rules captured at request start)
4. Context compression for Route Analyst 7-day analysis

**Settled decisions (don't re-research):**
- PostgreSQL 16, Fastify 5, opossum circuit breakers, p-queue dispatch queues
- Porter is master orchestrator, agents are workers
- Memory is state engine, not extraction
- No external gateway APIs (Porter orchestrates local tools only)

### From API Inventory

**Currently hidden (no UI):**
- `/attribution` — cost attribution by user/project/agent
- `/models/:id/versions` — model version history
- `/session/:chatId/routing` — per-turn routing in conversations
- `/user-keys` — component exists but not rendered
- `/workspace-config` — component exists but not rendered
- `/agent-stats` — buried in dispatch log, no dedicated view

**SSE events defined but underused:**
- `bridge:health` — gateway status changes
- `bridge:dispatch` — every dispatch completion
- `bridge:circuit-trip` — circuit breaker state changes

---

## Agent Tab Design (Refined)

### Tab 1: Bridge Operator — "Health & Control"
- **Owns:** gateways table, health probes, circuit breakers
- **Cannot touch:** routing rules, cost data, model catalog
- Gateway cards with live health, circuit state, latency
- Config viewer (system prompts, env vars used — NOT values)
- Health timeline (when gateways went up/down)
- Activity log: health probe results, circuit trips, failovers
- Controls: enable/disable, force reset, speed test, re-detect

### Tab 2: Model Scout — "Discovery & Catalog"
- **Owns:** models table, model_versions, capabilities metadata
- **Cannot touch:** gateway config, routing rules, cost attribution
- Full model catalog with capabilities matrix
- Context window + pricing comparison across gateways
- Model version history (what changed, when)
- Which models are active vs stale
- Controls: refresh catalog, toggle active/inactive

### Tab 3: Route Analyst — "Decisions & Rules"
- **Owns:** routing_rules, bridge_dispatch_log analysis
- **Cannot touch:** gateway health, model catalog, cost attribution
- Dispatch log with full decision reasoning ("why this model?")
- Routing rules CRUD with scope visualization
- Per-agent stats (which agent uses which model)
- Session routing drilldown (per-conversation turn-by-turn)
- **Optimize for:** Speed / Quality / Cost toggle
- Controls: create/edit/delete rules, optimization mode

### Tab 4: Cost Controller — "Spend & Attribution"
- **Owns:** cost aggregation, workspace overrides, user API keys
- **Cannot touch:** gateway health, routing rules
- Spend dashboard with daily trend
- Breakdown by gateway, model, agent, project, user
- Token usage metrics, cost per request
- Workspace gateway overrides
- User API key management
- Controls: date range, attribution grouping, overrides, key rotation

### Status Bar (persistent)
- Health: X healthy, Y degraded, Z down
- Models: N active across M gateways
- Circuit breakers: N open
- Optimization mode: Speed / Quality / Cost

---

## Implementation Phases

### Phase A: Tab Shell + Bridge Operator
- Replace agent strip + accordions with tab navigation
- Agent pixel portraits as tab headers
- Bridge Operator tab: gateway cards, health, config
- Status bar persistent across all tabs
- SSE: bridge:health → live updates

### Phase B: Model Scout + Route Analyst
- Model Scout: catalog, capabilities, versions
- Route Analyst: dispatch log, rules, optimization toggle
- Per-agent stats as dedicated panel
- SSE: bridge:dispatch → live dispatch feed

### Phase C: Cost Controller + Polish
- Cost Controller: spend, attribution, user keys, workspace overrides
- All hidden APIs exposed
- Performance: only active tab fires queries
