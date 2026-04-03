## v4.5.0 (2026-04-03)

- fix: port all v5.0 skill routes from dead admin backend to Brain :3001
- docs(v5.0): all debt fixed — audit passed, 36/36 requirements
- fix(36): port quality scoring from admin/backend to Brain backend
- fix: port 5175→3001 in tests, check QLT boxes, add Phase 34 verification
- docs(v5.0): milestone audit — tech_debt status, 30/36 requirements
- docs(phase-37): complete phase execution
- docs(37-02): complete template-skill-ux frontend plan
- feat(37-02): wire TemplateSkillsTab into agent-detail.tsx
- feat(37-02): create TemplateSkillsTab component
- docs(37-01): complete template-skill-ux backend foundation plan
- feat(37-01): Five template skill API endpoints on admin backend
- feat(37-01): DB migration + schema update for template_skills columns
- docs(37-template-skill-ux): create phase plan
- docs(37): research phase template skill ux
- docs(phase-35): complete phase execution
- fix(35): close SC-5 gaps — reasoning+feedback in history, effectiveness_after backfill
- docs(35-03): complete evolution-panel UI plan
- feat(35-03): wire EvolutionPanel into SkillsStudio
- feat(35-03): create EvolutionPanel component
- docs(35-02): add final commit hash to SUMMARY.md
- docs(35-02): complete agent evolution loop plan 02
- feat(35-02): add approve/reject endpoints + inline SKILLS.md regeneration
- feat(35-02): add GET /proposals list + detail endpoints
- docs(35-01): complete agent evolution loop plan 01
- feat(35-01): Evolution analyzer service + scheduler hook
- feat(35-01): Wave 0 test scaffold + migration for evolution tables
- docs(35): create phase plan for Agent Evolution Loop
- docs(35): research agent evolution loop phase
- docs(phase-36): mark complete (executed by Gemini)
- feat(36): full phase implementation - quality scoring, telemetry join, and UI filters
- feat(36): implement skill quality scoring infrastructure and UI badges
- docs(35-37): minimal context for remaining phases
- docs: checkpoint — phases 31-34 complete, 35-37 remaining
- docs(34-03): add self-check results to SUMMARY.md
- docs(34-03): complete effectiveness API + admin UI plan
- feat(34-03): wire effectiveness metrics into skill/agent/template detail pages
- feat(34-03): add effectiveness API endpoints + SkillEffectivenessBar component
- docs(34-02): complete feedback API + chat UI plan
- feat(34-02): thumbs-up/down feedback UI on chat assistant messages
- feat(34-02): POST /api/v1/feedback/:dispatchId endpoint
- docs(34-01): complete feedback telemetry schema plan
- feat(34-01): surface dispatch_id in SSE done event + increment times_selected
- docs(34-00): complete feedback telemetry test scaffold plan
- feat(34-01): migration + schema for skill feedback telemetry
- test(34-00): add Playwright test scaffold for FBK-01 through FBK-05
- fix(34): revise plans based on checker feedback
- docs(34-feedback-telemetry): create phase plan — 3 plans across 3 waves
- docs(34): research phase feedback-telemetry
- docs(34): minimal context for infrastructure phase
- docs(phase-33): complete phase execution
- docs(33-02): complete runtime-skill-selector wiring plan
- feat(33-02): wire selectSkills into chat.ts dispatch pipeline
- feat(33-02): extend RoutingContext and logDispatch for skills_used telemetry
- docs(33-01): complete skill selector foundation plan
- feat(33-01): implement skill-selector.ts with selectSkills and scoreSkill
- test(33-01): add failing tests for skill-selector service
- feat(33-01): add skills_used JSONB column migration and schema update
- docs(33): create phase plan for runtime skill selector
- docs(33): research runtime skill selector phase
- docs(33): minimal context for infrastructure phase
- docs(phase-32): complete phase execution
- docs(32-03): complete badge integration and navigation wiring plan
- docs(32-02): complete skill-pack-explorer frontend UI plan
- feat(32-03): add pack explorer link to agent detail skills tab
- feat(32-03): add quality badges and pack explorer links to skills-studio and marketplace
- feat(32-02): build SkillPackExplorer route with file tree, CodeMirror editor, dirty guard
- feat(32-02): install CodeMirror, register pack explorer route, add SkillQualityBadge
- docs(32-01): complete skill-pack-explorer backend plan
- docs(32-00): complete Skill Pack Explorer test scaffold plan
- feat(32-01): add PUT /:id/files/* endpoint to skills routes
- feat(32-01): add QualityTier, PackDiagnostics, computePackDiagnostics, writeSkillPackFile to skill-library
- test(32-00): add Playwright test scaffold for Phase 32 Skill Pack Explorer
- fix(32): revise plans based on checker feedback
- docs(32): create phase plan for Skill Pack Explorer
- docs(phase-32): add validation strategy
- docs(32): research phase for Skill Pack Explorer
- docs(32): smart discuss context
- docs(phase-31): complete phase execution
- docs(31-03): complete Skills SOT API + RPG Engine plan
- feat(31-03): align rpg-engine SKILLS.md generation with skill_id JOIN
- feat(31-03): update toggle and delete endpoints with skill_id + manifest regeneration
- docs(31-02): complete skills SOT query layer plan
- feat(31-02): rewrite instantiation and forge Station 2 to use template_skills as canonical source
- feat(31-02): create skills-manifest.ts service for DB-driven SKILLS.md generation
- docs(31-01): complete Skills SOT Migration plan
- feat(31-01): add migration script to populate template_skills and persona_skills.skill_id
- feat(31-01): add skill_id column to persona_skills schema and migration
- docs(31): plan Phase 31 Source of Truth Cleanup (3 plans, 3 waves)


## v4.0.1 (2026-04-02)

- docs: start milestone v5.0 Living Skills (7 phases, 36 requirements)


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

## v4.2.0 (2026-04-02)

**Skill Catalog Expansion — 207 Skills**

- 170 new skills across 20 categories with complete on-disk packs
- Each skill has domain-specific SKILL.md, prompt.md, qa-checklist, examples, metadata
- Idempotent seed script at scripts/seed-skills-expansion.sh

## v4.1.1 (2026-04-02)

**SkillsStudio CRUD UI**

- SkillCreateDialog: name/id/description/category/source form with auto-slug
- SkillEditSheet: full metadata editor, switches, pack status badge, generate/delete
- Pack status column in SkillsStudio table (ready/partial/missing badges)

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

## v4.0.5 (2026-04-01)

**Build Tab + RPG Component Redesign**

- Sheet tab renamed to BUILD with Wrench icon
- CharacterCard: larger text, section dividers, equipped-only equipment display
- VitalsBar: icons, taller bars, 50% threshold markers, faster animation
- PassiveTreeView: larger nodes/text, full labels, unlock level display

## v4.0.4 (2026-04-01)

**Full-Featured Files Page**

- Ported from frontend-v2: breadcrumb nav, drag-drop upload, download, rename, delete
- File preview panel (text, image, PDF), compact/comfortable toggle, search filter

## v4.0.3 (2026-04-01)

**System Page Merge**

- System + Activity + Diagnostics merged into single /system page with 3 sub-tabs

## v4.0.2 (2026-04-01)

**Admin Nav Restructure**

- Intelligence moved from Dev to Ops
- Changelog removed from nav (linked in footer)
- Settings as gear icon next to logout
- Files gets its own nav section

## v4.0.1 (2026-04-01)

**Forge Fixes + Template Card Polish**

- Forge station agents renamed with proper template links
- Template cards: description wraps, category badges
- SHEET tab crash fix, graceful empty state for unborn agents

## v4.0.0 (2026-04-01)

**The Arena — Agent RPG System + Bridge Intelligence**

- RPG engine: 5 core stats, XP, levels, stars, rarity, specialties
- Agent identity files auto-regenerated from DB
- Forge unification: Templates, Skills, Tools, Workshop, Arena tabs
- Character sheet with stat pentagon, vitals bars, passive tree
- Session registry, intelligence loop, Bridge operator
