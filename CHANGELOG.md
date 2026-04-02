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
