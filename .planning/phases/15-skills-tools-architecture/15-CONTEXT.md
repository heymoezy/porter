# Phase 15: Skills & Tools Architecture - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Define proper data models, APIs, and registry for skills and tools. Skills = capabilities (what agents CAN do). Tools = integrations (what agents USE). Both get DB tables, CRUD APIs, template assignment via junction tables, visibility/enabled/featured toggles, and rich visual metadata. Agent templates remain immutable components; deploying creates deep-cloned instances. Product site pulls agent data from admin/forge (single source of truth). Global (platform-level) scope for v2.

</domain>

<decisions>
## Implementation Decisions

### Skill Data Model
- Proper `skills` PostgreSQL table — migrate SKILL_CATALOG from hardcoded constant in admin/skills.ts to DB with full CRUD
- Schema: id, name, description, category, source, enabled, visible, featured, icon, color, cover_image, short_label, sort_order, config_schema (JSONB)
- Keep existing 10 categories (Orchestration, Memory, Infrastructure, Creative, Writing, Research, Operations, Quality, Development, AI)
- Junction table `template_skills` replacing the skills JSONB array on agent_templates — proper relational model

### Tool Data Model
- Proper `tools` PostgreSQL table — unified tool registry replacing legacy environment_tools
- Schema: id, name, description, category, type (system/integration), enabled, visible, featured, icon, color, cover_image, short_label, sort_order, config_schema (JSONB), requires (JSONB), version
- Two types: `system` (infra tools like git, node) and `integration` (external services like GitHub, Slack)
- workspace_connections become "configured instances" of integration-type tools
- Junction table `template_tools` replacing the tools JSONB array on agent_templates — mirrors skill pattern
- API shapes must support rich, visual card-based presentation — not garbage text lists

### Template-to-Instance Lifecycle
- Deep clone on deploy — instantiation copies all template data into persona row + .md files; instance is fully self-contained
- Templates are fully immutable read-only components — only admins update via admin API
- Instance customization: name, avatar, appearance_spec, config overrides (skills on/off, tool preferences)
- `is_internal` flag on template + `deployed_by` field on persona for Porter-internal vs customer distinction

### Visibility & Admin Control
- Three-state visibility: `enabled` (functional on/off) + `visible` (UI on/off) + `featured` (highlighted/promoted)
- Rich visual fields: icon (emoji or icon name), color (hex for category tint), cover_image (optional URL), short_label (1-2 words for cards)
- Ordering: sort_order per item + category_order on categories lookup + featured_order for promoted items
- Global (platform-level) scope only for v2 — per-workspace availability is future

### Claude's Discretion
- Migration strategy for existing SKILL_CATALOG → DB table
- Exact API endpoint paths and response shapes
- Index strategy for the new tables
- Seed data for system tools registry

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SKILL_CATALOG` constant in `backend/src/routes/v1/admin/skills.ts` — 37 skills with name, description, category, source
- `persona_skills` junction table already exists — pattern for skill assignment
- `environment_tools` table pattern in porter.py — field structure for system tools
- `workspace_connections` + `project_connections` — external tool integration model
- `seed-templates.ts` — 103 templates with skills[] and tools[] arrays to migrate
- `forge.ts` — 3-station pipeline already maps skills and tools during agent assembly

### Established Patterns
- Drizzle ORM for all PostgreSQL schema definitions (schema.ts)
- JSONB columns for flexible config (personas.config, workspace_connections.tools_json)
- Zod validation on all route inputs
- ok()/err() response envelope pattern
- migrate-consolidated.ts for DDL

### Integration Points
- `backend/src/routes/v1/admin/skills.ts` — replace SKILL_CATALOG with DB queries
- `backend/src/routes/v1/admin/tools.ts` — replace environment_tools with unified registry
- `backend/src/routes/v1/templates.ts` — template creation now uses junction tables
- `backend/src/routes/v1/agents.ts` — agent instantiation (deep clone lifecycle)
- `backend/src/services/forge.ts` — Station 2 (Trainer) and Station 3 (Outfitter) read from new tables
- `seed-templates.ts` — migrate skills/tools arrays to junction table inserts

</code_context>

<specifics>
## Specific Ideas

- Skills and tools design must be visually impressive, not weak — data model supports beautiful card-based UI
- Rich visual metadata (icon, color, cover_image, short_label) on every skill and tool
- Three-state admin visibility is the "god power" — admin controls exactly what users see
- Featured items for curated, promoted presentation
- Category-level ordering for visual arrangement control

</specifics>

<deferred>
## Deferred Ideas

- Per-workspace skill/tool availability (future phase — v2 is global only)
- Custom user-created tools (third tool type beyond system/integration)
- Skill versioning and changelog
- Tool health monitoring and auto-detection refresh

</deferred>
