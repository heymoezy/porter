## v0.2.14 (2026-03-22)

- Dashboard URL: /dashboard (with / redirect). Sidebar, TopBar, active state all updated
- Browser tab title: "Porter Dashboard" (was "Porter Admin")
- Route /dashboard added alongside index redirect

## v0.2.13 (2026-03-22)

- Scrollbar: opt-in .scrollbar-thin class — all scrollbars hidden globally by default
- Only elements with .scrollbar-thin get consistent 3px auto-hide scrollbars
- Applied to: dashboard projects, activity, admin-shell content, sidebar nav
- Eliminated competing scrollbar from outer shell container

## v0.2.12 (2026-03-22)

- Scrollbar design system tokens: --scrollbar-size (3px), --scrollbar-thumb, --scrollbar-thumb-hover
- Scrollbars invisible by default, fade in on container hover, consistent everywhere
- Dark mode: white 15%/25% opacity. Light mode: black 15%/30% opacity
- Removed pr-1 buffer padding (no longer needed with auto-hide scrollbars)

## v0.2.11 (2026-03-22)

- Dashboard: full design system sweep — all hardcoded values replaced with CSS tokens
- Added design tokens: --terminal-bg, --bottom-bar-height, --duration-long, --duration-chart
- Added animate-slide-down utility class for activity feed entrance
- Removed dead code: unused imports (HardDrive, Cpu), unused state (logsLoaded), unused fields
- Timeline capped at 200 entries to prevent memory leak
- Stat tiles refactored to data-driven config
- Scrollbars: thinner (4px), Firefox support (scrollbar-width: thin), buffer padding on scroll areas
- All stagger delays use --stagger-delay token, all durations use motion tokens

## v0.2.10 (2026-03-22)

- TopBar: route-aware page titles with icons on every page (Dashboard, Customers, Agents, etc.)
- Activity feed: 50 entries, no cap on timeline growth, scrollable fills available space
- Activity feed: removed border and background shading — clean flat look

## v0.2.9 (2026-03-22)

- System Health: added concurrent users (distinct users active in last 5min) — shows '1 online' etc
- Concurrent != sessions (44 stale tokens vs 1 actual user right now)
- System monitor shows: MEM% · CPU% · DSK% · concurrent online · load · cores · uptime

## v0.2.8 (2026-03-22)

- Projects + Activity: both fill available space (flex-1 overflow-y-auto)
- Projects: scrolling list with push animation — new projects slide in from top every 8s
- Activity: fills remaining vertical space, scrollable
- Dashboard stretches to use full viewport height

## v0.2.7 (2026-03-22)

- System Health: redesigned as terminal-style monitor (matches LLM terminal aesthetic) with horizontal progress bars for MEM/CPU/DSK, load/cores/uptime line
- User Logs: filtered out browser noise (MetaMask, extensions, ResizeObserver) — only Porter-related errors
- Noise filter applied server-side in /api/admin/health/logs

## v0.2.6 (2026-03-22)

- User Logs terminal: now pulls REAL data from audit_log + error_log (not fake)
- Combined /api/admin/health/logs merges user actions + system errors
- Errors show in red (MetaMask failures, CRM 500s visible immediately)
- System Health: replaced 'sessions' with LOAD gauge (actual system stress indicator)
- Auto-refreshes logs every 10s

## v0.2.5 (2026-03-22)

- Hero: fixed stats to +62% vs last month, ~124 hrs saved, $2,480 value (not orchestrations)
- Projects: card list with sparklines, progress bars, agent counts (from project-list.tsx pattern)
- Activity: live feed with fake user data (Moe logged in, Jacob created project, etc.) — ActivityFeed pattern
- System Health: vertical bar monitor (not cards) showing MEM/DISK/CPU fill levels + sessions
- User Logs: terminal showing real user actions and errors (replaces generic system log)
- Removed SaaS metrics from dashboard (moved to Revenue page)
- Stat tiles: 'today' sub text on Tasks instead of 'runs'

## v0.2.4 (2026-03-22)

- Dashboard: exact match to user dashboard layout from dashboard-mockup.tsx
- Hero: Post to X button, animated bar chart with dates, task counter, orchestrations/saved/value stats
- Stat tiles: same component pattern as stat-tiles.tsx with text-[9px] sub text
- Two columns: User Activity feed (ActivityFeed pattern) + SaaS Metrics
- Bottom bar: System Health (replaces Project Ideas) + System Log terminal (replaces LLM Activity)
- LLMTerminal component: copied from frontend-v2, added configurable title prop
- All patterns sourced from frontend-v2 components, not reinvented

## v0.2.3 (2026-03-22)

- Dashboard: matches user dashboard exactly — hero gradient with animated bar chart, stat tiles (Projects/Agents/Tasks/Decisions/Tokens) with AnimCount + hover lift, SaaS metrics row, user activity feed, live system gauges
- Same component patterns: rounded-lg, text-[9px] labels, text-lg bold values, tabular-nums, hover:-translate-y-px
- AnimCount animated counters on all numbers
- Nav: "Agent Templates" label, Revenue at #2

## v0.2.2 (2026-03-22)

- Dashboard: hero banner with gradient, metric cards matching user dashboard pattern (Projects, Agents, Tasks, Decisions, Tokens), SaaS row, user activity feed, live system gauges
- Nav: Revenue moved to #2 position below Dashboard
- Template detail: Overview removed, replaced with "Who Is" preview button showing what users see
- All metric cards are clickable links to their detail pages

## v0.2.1 (2026-03-22)

- Dashboard hero banner: Porter pixel portrait, platform name, runtime health dots, token counter, version
- Summary line: customers, agents, messages at a glance

## v0.2.0 (2026-03-22)

- Templates: card grid restored (was table — Moe prefers cards)
- Template detail: full .md file editor tabs (Soul, Identity, Role Card, Skills, Deliverables, Mission) + Overview tab with soul/mission/inputs/outputs/authority
- Template files saved to templates/<id>/ directory (strangler fig)
- Green dot indicator on tabs with existing files

## v0.1.9 (2026-03-22)

- Dashboard: full platform command center — 4 hero metrics (Projects, Agents, Conversations, Customers), 6 activity counters (Messages, Agent Msgs, Tasks, Orchestrations, Skills, Learnings), token usage, system gauges, live activity feed
- New /api/admin/health/dashboard endpoint aggregating all platform data
- 15s auto-refresh on dashboard

## v0.1.8 (2026-03-22)

- Fixed logout button (drizzle ORM mismatch → raw sqlite)
- Removed redundant changelog title from release notes
- Version synced to v0.1.7 across all locations

## v0.1.7 (2026-03-22)

- Template detail pages: full agent spec view with soul, mission, inputs, outputs, authority, communication style
- Templates list: table layout with pixel portraits linking to detail views
- Nav: Templates before User Agents. "Agents" → "User Agents". "Direct Line" → "Direct Chat"
- Back navigation for /agents/ and /templates/ detail pages

## v0.1.6 (2026-03-22)

- Dashboard rewritten as command center: 6-metric row (Customers, MRR, Agents, Skills, Sessions, Events)
- System gauges: memory/disk/CPU with progress bars, runtime health dots
- Recent activity feed on dashboard with "View all" link
- Useful pre-launch with zero customers

## v0.1.5 (2026-03-21)

- Skills page rewritten: full catalog with 30 skills, descriptions, categories, sources, agent assignments
- Email compose: from selector (Porter, Growth, Retention, Security, Billing, Support, Moe), rich text toolbar
- Agents page excludes Porter (has own dedicated tab)
- Release notes page at /changelog, linked from sidebar version
- Changelog endpoint moved to correct path

## v0.1.4 (2026-03-21)

- Full email system: inbox, sent, drafts, trash (Gmail-style)
- Compose, save drafts, send, delete to trash, permanent delete
- email_messages DB table with folder management

## v0.1.3 (2026-03-21)

- Agent management system: list all personas with skills, files, deployments
- Agent detail page: .md file editors, skills toggles, project deployments
- Removed global search from top bar (pages have contextual search)

## v0.1.2 (2026-03-21)

- Activity feed: 5746 audit entries with action type filtering
- Learnings tab: 35 extracted session learnings from Porter
- Nav: added Activity to Ops, renamed Billing to Revenue

## v0.1.1 (2026-03-21)

- Email engine: SMTP config form, queue table
- Revenue page: MRR, cost, margin, LTV, customer funnel, token breakdown
- System monitor: memory, disk, CPU, uptime, Porter runtimes
- Tools: compact tables with visibility toggles, server/runtime separation
- Skills: search filter, enable/disable toggles per agent
- Theme toggle fix: reads localStorage on mount

## v0.1.0 (2026-03-21)

**Initial release — Platform Control Plane**

### Pages
- **Dashboard** — Revenue cockpit: AARRR scores, margin, LTV, churn risk, conversion candidates, viral leaders
- **Customers** — Customer table with health, churn, MRR, LTV scores. Filters by plan status. Team endpoint separates admins from customers.
- **Porter** — God console: editable identity files (Soul, Identity, Role Card, Skills, User), tiered skill profile (core/internal/reserve with purposes), dispatch stats, Direct Line chat to Porter
- **Templates** — 100+ agent templates proxied from porter.py, category filtering, search, expandable detail with soul/mission/inputs/outputs/authority
- **Models** — 5 gateway health cards, token usage table with cost estimates, DB health, feature flags (read-only)
- **Tools** — Environment tools from DB, workspace connections
- **Skills** — Global skill registry with agent counts per skill, expandable agent lists
- **Agents** — Admin AI agents (growth/retention/security/social) with task queue
- **Diagnostics** — Error collection from both frontends + server, recurring error grouping, severity filtering
- **Email** — Queue stats (pending/sent/failed), SMTP config status
- **Billing** — Subscription stats and table

### Backend
- Fastify 5.7 on :5180, shared SQLite WAL with porter.py
- Session auth with platform_admin guard
- Customer intelligence scoring engine (MRR, cost, margin, health, conversion, churn, viral, LTV)
- Admin AI agent task queue with execute/skip actions
- Error log collection from product frontends
- Porter identity file read/write (personas/porter-core/)
- Porter skill profile with tiers and purposes
- Direct Line chat proxy to porter.py dispatch
- Template proxy to porter.py /api/templates
- Environment tools and workspace connections from DB
- Global skills registry with persona joins

### Design System
- Dark/light theme with CSS variables
- Compact density: p-3 cards, size-6 icon containers, tight grids
- Card deal-in animations with stagger delays
- Pulse badge animations for live status indicators
- Consistent 11px uppercase tracking headers

### Infrastructure
- Version endpoint: GET /api/admin/health/version
- Version: both package.json files synced
- Frontend: React Router 7 SPA, React 19, TanStack Query, shadcn/ui, Tailwind 4
