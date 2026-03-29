## v2.10.0 (2026-03-28)

**System Prompt Pipeline — see exactly what Porter sends to each gateway.**

- New prompt-pipeline service: constructs initialization prompt per gateway
  - Layer 1: Agent identity (Bridge Operator system prompt from DB)
  - Layer 2: Agent soul (SOUL.md from personas dir)
  - Layer 3: Directives (workspace rules from DB)
  - Layer 4: Gateway-specific instructions
- Prompt button (📄) on each gateway card shows:
  - Current hardcoded PORTER_SYSTEM prompt (what IS sent today)
  - Prompt layers (what SHOULD be sent — the gap is visible)
  - Config files: openclaw.json, config.toml, settings.json, GEMINI.md, credentials.json, ollama.service
  - Full file contents readable in-place
- Bridge agent system prompts populated in DB (Bridge Operator, Model Scout, Route Analyst, Cost Controller)
- API: GET /api/admin/bridge/prompts returns all profiles
- Phase 31: foundation for wiring prompts into Brain's dispatch pipeline

## v2.9.0 (2026-03-28)

**Intelligence Feed — Porter's self-evolution engine.**

- New "Intelligence" page in Dev section — central feed where agents dump discoveries, blockers, ideas, and capabilities
- DB table: intelligence_feed with type/status/agent/metadata fields
- API: GET (list + filter + counts), POST (create), POST /batch (bulk), PUT /:id/status, DELETE
- Frontend: filter by status (new/reviewed/acted/dismissed), filter by type (capability/blocker/idea/gap/learning), search, create dialog
- Expandable entry cards with status transition buttons (Review → Act/Dismiss)
- Batch endpoint for agents to bulk-insert discoveries (changelog analysis, etc.)

## v2.8.0 (2026-03-27)

**Architecture page rebuilt + full code review pass.**

- Architecture page: complete rewrite with live system status, 87-endpoint API surface, accurate DB tables, SSE events, Bridge agent domains, merge roadmap
- Fixed critical SSE bug: dispatch-log-summary and costs-summary now invalidated on bridge:dispatch events
- Fixed React anti-pattern: index-based keys replaced with value-based keys in agent-detail badges
- Added staleTime to all BridgeActivityTab queries (prevents unnecessary refetches)
- Full codebase review: no unused imports, no dead code, no broken links, no SQLite refs, no port 5180 refs

## v2.7.0 (2026-03-27)

**Bridge agents roam free + Activity tab on agent detail.**

- Bridge agents no longer boxed in a strip — each agent lives inside the content they own
- Click any Bridge agent → navigates to their detail page
- Agent detail page: new ACTIVITY tab for Bridge agents (Operator/Scout/Analyst/Controller)
  - Operator: live gateway health, circuit breakers, model counts
  - Scout: full model catalog with capabilities and context windows
  - Analyst: recent dispatch log with model, reason, latency, cost
  - Controller: total spend, token usage, cost breakdown by gateway and model
- Tab pills handle content switching independently from agent navigation
- 48px portraits with specialist titles ("The Watcher", "The Seeker", etc.)

## v2.6.0 (2026-03-27)

**Bridge Overhaul — agents are now tabs, not decoration.**

- Bridge page: 4 decorative agent stations → 4 functional tabs (Operator/Scout/Analyst/Controller)
- Operator tab: gateway health cards with speed test, circuit breakers, model rows, enable/disable
- Scout tab: full model catalog with search, filter, sort, capabilities matrix, version history
- Analyst tab: dispatch log with pagination + routing rules CRUD
- Controller tab: cost analytics + user API key manager + workspace gateway overrides
- Agent pixel portraits: grayscale when inactive, full color when active tab
- Status bar persistent across all tabs (health, models, circuit breakers, Test All)
- Fixed SSE bug: bridge:health events now correctly invalidate gateway cards (was targeting wrong query key)
- Deleted gateway-dashboard.tsx (superseded by inline operator panel)
- Removed ~280 lines of dead code (unused Snapshot types, helpers, HeartbeatLine, ExpandSection)
- 3 previously hidden components now rendered: UserKeyManager, WorkspaceGatewayOverrides, ModelCatalog
- Phase 27 complete: TopBar cleaned, stale pageTitles entries removed

## v2.5.0 (2026-03-27)

**Architecture updated, dead code cleanup prep.**

- Architecture page: all 5180 port references updated to 5175
- Phase 27 (dead code cleanup) planned and ready for execution

## v2.4.0 (2026-03-27)

**Nav reorganized into 6 sections — everything in its right place.**

- Sidebar restructured: Dashboard, Business, Agents, Ops, Dev, Settings
- Email moved to Agents section (was in Ops)
- Org Chart moved to Agents section (was in Dev)
- Changelog promoted from footer link to Dev nav item
- Settings promoted from footer icon to standalone nav item
- All 18 pages keep their own routes — zero merging

## v2.3.0 (2026-03-27)

**Bug fixes and optimization — cleaner, safer, faster.**

- Users page filter chain memoized (was re-running 5 filters on every render)
- Fake 2-second chat loading animation removed from customer detail
- Session null guard in AdminShell (was crashing on null assertion)
- Design System page lazy-loaded (4,638 lines no longer in initial bundle)
- Email body HTML sanitized against XSS (script, iframe, event handlers stripped)

## v2.2.0 (2026-03-27)

**Instant tab switching — the admin finally feels fast.**

- Animated preloader on every login warms all API data into React Query cache
- Tab switching is now instant — pages render from cache, zero network wait
- AdminShell is a layout route — sidebar, topbar, and SSE stay alive across navigation
- All 115 JS modules preloaded via modulepreload tags on initial page load
- Consolidated to single port 5175 (killed 5180) — production build served directly
- Killed 25 polling queries site-wide — only Brain health (30s) and dashboard (60s) remain
- Bridge duplicate query fixed (was fetching same endpoint twice)
- Recall search debounced (was firing API call per keystroke)

## v2.1.0 (2026-03-27)

**Performance overhaul — the admin no longer hammers the backend.**

- Killed all 4 dashboard timers that re-rendered 200 items every second
- Brain page polling reduced from 18 requests/min to 8 (unified 30s interval)
- Forge page stops double-fetching — SSE alone drives updates now
- Login redirect no longer crashes the page (React Router Navigate replaces window.location)
- Skills table rows stop flickering (missing React key fixed)
- SSE events stream in real time through Vite proxy (no more buffering)

## v2.0.0 (2026-03-26)

**Customer Intelligence — the admin becomes an AI-first CRM.**

- Notes and tasks on every customer record, rendered with markdown
- Unified activity timeline merging AI events, system events, and admin annotations
- Contact info with inline editing, domain peer grouping, PIRATE health scores in header
- Pipeline kanban view with drag-and-drop between stages (Acquired → Activated → Revenue → Churned)
- Customer segmentation: tags, multi-filter, saved segments as persistent tabs
- Agent-to-agent conversations visible on customer detail (read-only)

## v1.0.0 (2026-03-25)

**Bridge Intelligence UI — see what every AI model is doing.**

- Unified /bridge page with 5 tabs: Dashboard, Models, Routing, Costs, Settings
- Live gateway health cards with circuit breaker state and latency
- Model catalog with capabilities, pricing, and version history
- Dispatch log showing every routing decision with cost and reasoning
- Cost analytics with date range, attribution by user/project/agent
- Gateway CRUD, routing rules, user API keys, workspace overrides
- Real-time SSE updates for health changes and dispatch events

## v0.7.0 — v0.7.6 (2026-03-25)

Bridge UI built incrementally — gateway dashboard, model catalog, dispatch log, cost analytics, routing config, user keys, workspace config, SSE wiring.

## v0.6.0 — v0.6.3 (2026-03-23 — 2026-03-24)

Agent Forge assembly line, admin chat engine, template detail redesign, Brain/Bridge/Recall pages, org chart, design system expansion, pixel portrait system.

## v0.5.0 — v0.5.1 (2026-03-22)

CRM cockpit redesign with autonomous growth metrics, revenue tracking, Porter chat with slash commands, dashboard agent supervisors, AI health scores. TypeScript zero-error milestone.

## v0.4.0 (2026-03-22)

Customer detail rewrite — gamification timeline, AI next-action carousel, plan controls, revenue cards, LLM terminal activity log, SSE real-time updates, auth separation between admin and product.

## v0.3.0 (2026-03-22)

Customer hub redesign with KPI bar, 5-tab detail layout, dense CRM form, billing timeline, design system page with tabs.

## v0.2.0 — v0.2.19 (2026-03-22)

Rapid iteration: dashboard command center, template card grid and .md editors, notification system, scrollbar design tokens, route-aware page titles, system health terminal, real audit log integration.

## v0.1.0 — v0.1.9 (2026-03-21)

**Initial release.** Platform control plane with dashboard, customers, revenue, agents, templates, models, tools, skills, diagnostics, email, billing. Fastify 5 backend on SQLite, React Router 7 SPA with shadcn/ui.
