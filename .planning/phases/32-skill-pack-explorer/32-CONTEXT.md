# Phase 32: Skill Pack Explorer - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can inspect and edit the actual skill pack files (.md, guides, examples, metadata) from the browser — not just DB metadata fields — with quality diagnostics that reveal scaffold vs real content.

</domain>

<decisions>
## Implementation Decisions

### File Editor UX
- Use CodeMirror 6 as editor library — modular (~500KB), modern, good markdown support
- Full-page view layout: file tree left panel, editor right panel (VSCode-like) at /skills/:id/pack
- Syntax highlighting for Markdown and JSON only (the only file types in skill packs)
- Manual save with dirty indicator — explicit Save button, unsaved changes warning on navigate-away

### Quality Diagnostics
- Scaffold detection via word count + boilerplate string matching (generic phrases like "TODO", "Add examples", template placeholders)
- Quality badge: colored dot + tier label — scaffold(red), baseline(yellow), production(green), high-performing(blue)
- Badges shown everywhere skills appear — skill list, marketplace grid, template detail, agent detail
- Summary diagnostics card in pack explorer — file count, non-empty count, total words, scaffold %

### Navigation & Access
- Click skill name in skill list → pack explorer (replaces current edit sheet pattern)
- Clickable skill chips on template/agent detail pages → navigate to pack explorer with back nav
- Dedicated route: /skills/:id/pack
- Breadcrumb navigation: Skills > {Skill Name} > Pack Explorer

### File Operations Scope
- No file creation — pack structure is fixed by convention
- No file deletion — only clear content (preserve pack structure)
- Show empty/missing files as grayed entries with "Empty" badge, click to populate
- Flat file tree with folder groups: SKILL.md, prompt.md, guides/, examples/, meta/

### Claude's Discretion
- CodeMirror 6 specific configuration and keybindings
- Exact scaffold detection phrases and thresholds
- File tree visual styling details
- Error handling for file read/write failures

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `admin/backend/src/services/skill-library.ts` — getSkillDetail(), getSkillPackText(), SkillFileSummary interface
- `admin/backend/src/routes/skills.ts` — GET /:id/files/* already reads pack files with path traversal protection
- `admin/frontend/app/components/forge/skills-studio.tsx` — existing skill list/grid UI
- `admin/frontend/app/components/forge/skills-marketplace.tsx` — existing marketplace grid view
- shadcn/ui Badge, Button, Switch, Input components already in use

### Established Patterns
- React Router 7 SPA routes at admin/frontend/app/routes/
- React Query (useQuery/useMutation) for data fetching
- Fastify routes with requirePlatformAdmin auth
- skill-library.ts resolves pack directories from PORTER_SKILLS_DIR env var
- SkillFileSummary already has path, name, ext, size, kind fields

### Integration Points
- Route: add /skills/:id/pack to React Router config
- API: add PUT /:id/files/* endpoint to skills.ts for writing files
- Nav: skill name click in skills-studio.tsx → navigate to pack explorer
- Template/Agent detail: skill chips need onClick → /skills/:id/pack

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
