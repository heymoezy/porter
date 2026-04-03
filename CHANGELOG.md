## v5.0.1 (2026-04-03)

### Fixes
- Port ALL v5.0 skill routes from dead admin backend to Brain :3001 — skills were invisible
- Skill detail, file read/write, effectiveness, proposals all now served by Brain
- Quality scoring ported from admin backend to Brain — audit endpoint, tier computation, DB persistence
- File tree entries now include name, extension, and size — fixes blank sidebar in pack explorer
- CodeMirror editor follows system theme (light/dark) instead of hardcoded dark
- Scrollable file tree sidebar and editor area for long content
- Breadcrumb navigation: Forge > Skills > Skill Name with proper back links
- Skills Curator agent created (Knowledge Base Manager template) for skill library management
- All :5175 port references replaced with :3001 across tests, configs, docs
- All /home/lobster/documents/porter/ paths replaced with /home/lobster/projects/porter/
- Removed 560MB dead code: frontend/, frontend-v2/, diagrams/, docs/, archive/, chat/, portal.db
- Deleted porter-admin and porter-website standalone repos (archived/merged)
- Stale .md files updated: porter.py refs removed, SQLite refs removed, persona deliverables updated
- Version consistency enforced across all package.json files, health endpoint, CLAUDE.md, PROJECT.md

## v5.0.0 (2026-04-03)

### Living Skills Milestone — 7 Phases, 36 Requirements

**Phase 31: Source of Truth Cleanup**
- template_skills and persona_skills junction tables are the canonical source for all skill assignments
- SKILLS.md is a thin generated manifest, skills_text deprecated

**Phase 32: Skill Pack Explorer**
- Full-page pack explorer at /skills/:id/pack with VSCode-style split layout
- CodeMirror 6 editor for .md and .json files with syntax highlighting
- File tree with folder groups, empty file badges, missing file warnings
- Quality diagnostics card with scaffold detection (word count + boilerplate matching)
- Manual save with dirty indicator and navigate-away warning
- SkillQualityBadge component with 4-tier color coding

**Phase 33: Runtime Skill Selector**
- selectSkills() gathers assigned skills from persona_skills at dispatch time
- Keyword scoring ranks candidates by description, triggers, tags, name
- Top 0-3 skill packs injected into dispatch system prompt
- skills_used JSONB logged on every dispatch in bridge_dispatch_log
- Graceful zero-skill fallback — dispatch proceeds normally without injection

**Phase 34: Feedback Telemetry**
- skill_feedback_events table captures per-dispatch effectiveness signals
- Thumbs up/down on chat messages creates feedback events for all active skills
- persona_skills tracks times_selected, times_completed, positive/negative counts, effectiveness_score
- dispatch_id surfaced in SSE done events for feedback linkage
- Admin effectiveness API: per-skill, per-agent, per-template aggregated scores
- SkillEffectivenessBar component on skill detail, agent detail, template detail pages

**Phase 35: Agent Evolution Loop**
- Background analyzer (6-hour interval) scans feedback patterns per agent
- Generates proposals: add_skill, remove_skill, rewrite_prompt, enrich_examples
- skill_evolution_proposals table with JSONB diffs, reasoning, triggering feedback IDs
- Admin UI Evolution tab on Skills page — pending proposals with diffs, approve/reject buttons
- Approval mutates persona_skills, regenerates SKILLS.md, logs evolution event
- History timeline with reasoning, feedback counts, review status

**Phase 36: Skill Quality Scoring**
- quality_score (0-100) computed from 7 weighted components
- Quality tiers: scaffold (0-25), baseline (26-50), production (51-75), high-performing (76-100), stale
- Tier badges replace old pack_status (ready/partial/missing) across all skill surfaces
- Tier filter pills in skills table and marketplace grid views
- Quality audit API endpoint: batch-scores all 207 skills, persists to DB, returns enrichment report

**Phase 37: Template Skill UX**
- Template detail is the command center for skill configuration
- Assigned skills table with quality badges, inline rationale editing, mandatory toggle
- Add/remove skills with searchable dropdown, drag-to-reorder with arrow buttons
- Aggregated effectiveness across all spawned agents from the template
- Preview auto-detection: enter a sample task, see which skills would be selected with scores


## v4.5.0 (2026-04-02)

**Projects + Agent Identity Overhaul**

### Projects System
- `/home/lobster/documents` renamed to `/home/lobster/projects` — each folder is a project
- Every project has `PROJECT.md` + `CHECKPOINT.md` at root
- Projects Curator agent (Atlas) manages the index
- Nav: Projects section moved below Dashboard with FolderOpen icon
- Full path shown in column header, breadcrumb only when in subfolder

### File Manager
- Drag-drop files into folder rows to move them (POST /api/v1/files/move)
- Delete confirmation dialog (replaces inline trash icon)
- New Folder button with inline name input
- Upload limit raised from 10MB to 100MB
- Real upload progress with XHR (actual % bar, not fake pulse)
- Upload path uses refs (immune to re-renders) — files go to correct subfolder
- Multi-file sequential upload with per-file progress rows
- Nav link resets to project root

### Agent Template/Instance Model
- Clear distinction: templates are components, personas are instances
- Instance view shows "Component: [template name]" badge linking to parent
- Template view shows instances below SOUL editor (not separate tab)
- Born = has soul_hash (only Porter is born). All others show as unborn/greyscale
- Instances endpoint added to brain templates route (was missing — instances tab was always empty)
- All 8 personas have correct template_id mappings

### Agent Personas Created
- Vigil → Bridge Operator template
- Compass → Route Optimizer template
- Ledger → Cost Controller template
- Atlas → Projects Curator template (new template)
- Quill → Storyteller, Sage → Training Specialist, Anvil → Platform Engineer

### Other
- Chat panels removed from Forge and Org Chart
- Forge station cards link to templates (not instance IDs)
- Agent detail: Deploy tab removed, SKILLS.md always visible
- Auth: brain accepts both porter_session and porter_admin_session cookies


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
