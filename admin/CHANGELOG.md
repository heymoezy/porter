# Porter Admin — Changelog

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
