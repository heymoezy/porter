## v4.0.1 (2026-04-02)

- docs: update checkpoint to v4.4.0 — Skills 10x complete
- feat: skills marketplace UI + tags + discovery system v4.4.0
- feat: skill import from external GitHub repos v4.3.0
- feat: expand skill catalog to 207 skills across 20 categories v4.2.0
- feat: SkillsStudio CRUD UI — create dialog, edit sheet, pack badges v4.1.1
- feat: skills CRUD API + pack generation for all 37 skills v4.1.0
- docs: update checkpoint to v4.0.6
- feat: rich agent skills tab + skills API join v4.0.6
- feat: rename Sheet → Build tab + improve RPG component design v4.0.5
- feat: full-featured Files page + multipart upload proxy v4.0.4
- fix: version 4.0.3 in main health endpoint
- feat: combine System + Activity + Diagnostics into single System page v4.0.3
- fix: restore full skill-library.ts content (was empty)
- fix: admin skills wildcard route pattern for Fastify
- feat: skill-library service + CRUD skills API (admin backend)
- refactor: extract SkillsStudio + ToolsStudio into shared components
- feat: restructure admin nav v4.0.2
- fix: forge tabs — split Armory into Skills + Tools tabs
- fix: clean skills/tools pages + forge station agent links
- fix: version 4.0.1 in health endpoints (was reverted by Gemini)


## v4.4.0 (2026-04-02)

**Skills Marketplace — Discovery + Tags**

- SkillsMarketplace component: card grid view with featured section, tag filters, search
- Tags column added to skills table, all 207 skills tagged (2-4 tags each)
- 8 featured skills seeded (project-architect, prompt-architect, code-implementer, etc.)
- Brain API: search, category/featured/packStatus query filters, allTags summary
- Table/Grid view toggle in SkillsStudio
- Tag editor in SkillEditSheet (add/remove inline)

## v4.3.0 (2026-04-02)

**Skill Import System**

- skill-importer.ts: clone external GitHub repos, scan SKILL.md files, parse frontmatter
- Import API: scan + execute endpoints, proxied through Brain
- SkillImportDialog: 3-step UI (source → preview with checkboxes → results)
- Pre-configured sources: VoltAgent, Anthropic, Supabase + custom URL
- Conflict detection, overwrite support

## v4.2.0 (2026-04-02)

**Skill Catalog Expansion — 207 Skills**

- 170 new skills across 20 categories with complete on-disk packs
- Categories: Engineering, Data & AI, Business, Content, Research, Creative, Design, Domain, Infrastructure, Legal, Support
- Each skill has domain-specific SKILL.md, prompt.md, qa-checklist, examples, metadata
- Idempotent seed script at scripts/seed-skills-expansion.sh

## v4.1.1 (2026-04-02)

**SkillsStudio CRUD UI**

- SkillCreateDialog: name/id/description/category/source form with auto-slug
- SkillEditSheet: full metadata editor, switches, pack status badge, generate/delete
- Pack status column in SkillsStudio table (ready/partial/missing badges)
- "+ New" and "Generate Missing" buttons in header

## v4.1.0 (2026-04-02)

**Skills CRUD API + Pack Generation**

- Brain skills route: POST create, PUT update, DELETE, pack proxy endpoints
- admin-proxy.ts utility for Brain→Admin backend forwarding
- generate-all endpoint for bulk pack generation
- pack_status column added to skills table
- All 37 original skills now have complete on-disk packs

## v4.0.6 (2026-04-01)

**Agent Skills Tab Enrichment**

- Agent detail Skills tab joins skills table for description, category, source
- Skills table with 4 columns instead of 2

## v4.0.5 (2026-04-01)

**Build Tab + RPG Component Redesign**

- Sheet tab renamed to BUILD with Wrench icon
- CharacterCard: larger text, section dividers, equipped-only equipment display
- VitalsBar: icons, taller bars, 50% threshold markers, faster animation
- PassiveTreeView: larger nodes/text, full labels, unlock level display

## v4.0.4 (2026-04-01)

**Full-Featured Files Page**

- Ported from frontend-v2: breadcrumb nav, drag-drop upload, download, rename, delete
- File preview panel (text, image, PDF)
- Compact/comfortable view toggle, search filter

## v4.0.3 (2026-04-01)

**System Page Merge**

- System + Activity + Diagnostics merged into single /system page with 3 sub-tabs
- Redirects from /brain, /activity, /diagnostics for backwards compat

## v4.0.2 (2026-04-01)

**Admin Nav Restructure**

- Intelligence moved from Dev to Ops
- Changelog removed from nav (linked in footer)
- Settings as gear icon next to logout
- Files gets its own nav section

## v4.0.1 (2026-04-01)

**Forge page fixes + template card polish**

- Forge station agents renamed: Quill (Soul Writer), Sage (Skill Trainer), Anvil (Gear Outfitter), Warden (Queue Keeper)
- Removed broken links to nonexistent forge agent templates
- Template cards: description wraps instead of truncating, category shown as badge
- Porter card only appears in "all" filter (not every category)
- SHEET tab: fixed crash from wrong capacity API shape (VitalsBar expected flat limits, API returns nested models.limits)
- SHEET tab: graceful empty state for unborn agents

## v4.0.0 (2026-04-01)

**The Arena — Agent RPG System + Bridge Intelligence**

Porter agents become RPG characters with real stats, progression, and an intelligence loop that makes routing smarter over time. Forge unified into one page. 6 phases shipped.

### RPG Engine
- 5 core stats (Quality, Speed, Efficiency, Reliability, Combo) derived from real dispatch data
- XP from dispatches, feedback, battles, multi-agent chains
- Level 1-100, star progression 1-5★, rarity system (Common → Mythic)
- Specialties auto-detected from usage patterns
- 49 unit tests for all stat formulas
- Background recalculation every 5 minutes

### Agent Identity Files
- SOUL.md, IDENTITY.md, SKILLS.md, TOOLS.md auto-regenerated from DB on progression events
- Files are derived output, not editable source — anti-gaming by design

### Forge Unification
- Skills + Tools + Agent Forge merged into single "Forge" nav item
- 4 tabs: Templates (catalog), Armory (tools + skills), Workshop (build screen), Arena (coming soon)
- Birth animation: pixel portrait grayscale → color with particle sparks
- Workshop shows live skill success rates and support modifiers

### Character Sheet
- Full character card with stat pentagon (recharts RadarChart)
- 3 vitals bars: Mana (token budget), Reliability (error rate), Focus (context pressure)
- Rarity-colored borders: gray, blue glow, purple pulse, gold shimmer, red particles
- Star display with SVG progress arc
- Passive tree: 8-node specialization grid

### Session Registry + Message Bus
- Porter tracks every dispatch session with token count and context window %
- Context pressure warning at 80%, auto-rotation at 95%
- Session rotation writes Recall concept summarizing closed session
- Structured message envelope for inter-gateway communication
- Every agent-message logged to msg_bus_events with correlation IDs

### Intelligence Loop
- Background job extracts 4 pattern types from dispatch history (latency, model strengths, failures, cost)
- High-confidence patterns (≥80%) auto-promoted to Recall concepts
- Routing engine reads learned concepts before selecting gateways
- Vigil's operator activity shows sessions, messages, and intelligence patterns live

### Bridge Improvements
- All 4 gateways respond through Bridge (session hook bypass with PORTER_BRIDGE_DISPATCH)
- OpenClaw auth token fix (reads OPENCLAW_TOKEN env)
- CLI health probe timeout increased 5s → 10s (prevents false offline)
- 3 Bridge agents profiled: Vigil (Bridge Operator), Atlas (Route Optimizer), Ledger (Cost Controller)

### Admin Cleanup
- Agent templates rationalized: 104 → 92 (12 duplicates removed)
- Template IDs cleaned to plain slugs (bridge-operator, not sys-bridge-operator)
- Agent lifecycle types: persistent (heartbeat), event-driven, one-shot
- Template detail page rebuilt: SOUL/IDENTITY/ROLE/SKILLS/TOOLS/HEARTBEAT + INSTANCES tabs
- CLAUDE.md updated with mechanical overrides for verification, context management, edit safety

### Schema
- 8 new PostgreSQL tables: agent_rpg_stats, battles, battle_rounds, battle_judgments, agent_bonds, session_registry, msg_bus_events, intelligence_patterns
- 14 RPG columns on agent_templates, 3 performance columns on template_skills
- 17 indexes across all new tables

## v3.4.2 (2026-03-31)

**Gemini usage collection overhaul**

- Real Gemini quota from Google Cloud Code API (remainingFraction)
- Hourly usage estimated from Porter dispatch logs (50 req/hour baseline)

## v3.4.1 (2026-03-31)

**Bridge UX polish**

- Merged Model Scout + Route Analyst into "Models & Routing" tab (4 tabs → 3)
- Admin UI served at root / (removed /admin/ prefix)
- Operator activity card height fixed
- Ollama: 0% used with ∞ No limit
- OpenClaw usage from `openclaw status --usage` (real provider quota)

## v3.4.0 (2026-03-31)

**Usage collection overhaul + gateway sniffer**

- Codex JSONL rate-limit parsing for real usage %
- Claude OAuth auto-refresh (tokens no longer go stale)
- Gateway activity sniffer (session transitions via SSE)
- Bridge nav badge for pending updates
- Manual capacity refresh endpoint

## v3.3.2 (2026-03-29)

- BRIDGE.md canonical location, stream request naming fix, version alignment

## v3.3.1 (2026-03-29)

**Bridge operator goes live**

- Real Claude usage from Anthropic rate-limit headers (1 Haiku call)
- Local CLI usage collector (Claude JSONL + Codex SQLite)
- Operator activity log with health, circuits, capacity alerts
- Gateway card UX: restart, pause, inline config, usage bars

## v3.3.0 (2026-03-29)

**Port merge — one Fastify, one port**

- Brain (:3001) absorbs Admin (:5175) — single process
- Admin routes, SSE, auth plugin all merged
- Unified changelog

## v3.2.0 (2026-03-29)

**Monorepo merge + system prompt pipeline**

- Brain + Admin merged into single repo
- Directives from DB injected into every dispatch
- SessionStart hooks for all CLIs
- Gateway hooks detection on Bridge cards

## v3.0.0 (2026-03-25)

**Porter Bridge — AI Gateway & Model Intelligence (v3.0 milestone)**

8 phases (16-23), 46 requirements. Gateway registry, 5 provider adapters, circuit breakers, health probes, smart routing, model catalog, cost tracking, admin APIs, first-run setup, Memory V3 signals.

## v2.0.0 (2026-03-24)

**Backend Ready (v2.0 milestone)**

9 phases (8-15). API standardization, streaming chat, collaborative sessions, unified chat + CRM, 103 agent templates, PostgreSQL migration, Memory V3 state engine, skills & tools registry.

## v1.0.0 (2026-03-21)

**Foundation + Core Platform (v1.0 milestone)**

7 phases (1-7), 30 requirements. CSS architecture, Memory V2, route migration, agent autonomy, guided wizard, real-time transparency, external connections.
