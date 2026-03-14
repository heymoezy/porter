# Porter Projects V2 — Complete Redesign Plan

**Author:** Claude Opus 4.6
**Date:** 2026-03-12
**Status:** PLAN — awaiting Moe review
**Scope:** This is the biggest Porter feature to date.

---

## Problem Statement

Projects in Porter are half-built scaffolding:
- **Artifacts tab is useless** — no upload, no real deliverables, just 12 template files
- **6 governance docs per project** nobody will fill in (PROJECT_BRIEF, SUCCESS_CRITERIA, etc.)
- **MEMORY.md still created** despite being deprecated for STATE.md
- **"Launchpad" starter project** has a bad name and doesn't teach agent creation
- **No project lifecycle** — can't archive, complete, or reopen
- **No linked projects** — can't relate a website project to its design project
- **No project types** — a website project looks the same as a research project
- **Giant hero panel** wastes screen space with marketing copy
- **3 duplicate functions** (GPT-5.4 copy-paste: _normalize_project_name, _migrate_project_workspace_root, _normalize_project_registry_names — each defined twice)
- **YMC Capital hardcoded** as example text in creation prompts
- **No agent recommendations** — project doesn't suggest what workers to create

---

## Design Principles

1. **Projects are Porter's core value.** Everything flows through projects.
2. **Every project type has a shape.** Websites need repos + deploys. Presentations need files + versions. Research needs sources + findings. Each gets a tailored experience.
3. **Agents emerge from projects.** As work progresses, Porter recommends creating specialists. "This project needs a frontend worker."
4. **Artifacts are deliverables, not scaffolds.** Real files: screenshots, docs, code repos, links. Not empty markdown templates.
5. **Projects can link to projects.** A "Company Website" can depend on "Brand Design" which depends on "Market Research."
6. **State is live, not static.** Project state should update as work happens, not require manual notes.
7. **The training project teaches by doing.** It walks you through creating your first real project AND your first worker.

---

## Project Types (Templates)

When creating a project, Porter offers guided templates:

| Type | Key Artifacts | Suggested Workers | Links |
|------|--------------|-------------------|-------|
| **Website** | Repo URL, live URL, screenshots, sitemap | Frontend dev, content writer, QA tester | Domain registrar, hosting |
| **App / Software** | Repo URL, builds, release notes | Backend dev, frontend dev, QA, devops | CI/CD, issue tracker |
| **Presentation** | Slide deck, speaker notes, handouts | Writer, designer, fact-checker | Related research projects |
| **Research** | Sources, findings doc, summary | Researcher, analyst, fact-checker | Projects consuming the research |
| **Content / Marketing** | Blog posts, social assets, analytics | Writer, designer, SEO specialist | Website project |
| **Design** | Figma/files, brand guide, assets | Designer, brand strategist | Projects consuming designs |
| **Operations** | Runbooks, checklists, dashboards | Ops worker, monitor | Dependent services |
| **Custom** | User-defined | User-defined | User-defined |

Each template pre-populates:
- Relevant artifact categories (not empty files — just categories for later)
- Suggested agent roles (Porter offers to create them during setup)
- Default state structure (objectives, milestones, not governance docs)

---

## Data Model Changes

### Project Object (porter_config.json → eventually SQLite)

```
{
  "id": str (UUID),
  "name": str,
  "type": str,          // "website" | "app" | "presentation" | "research" | "content" | "design" | "ops" | "custom"
  "description": str,
  "status": str,        // "active" | "paused" | "completed" | "archived"
  "objectives": [str],  // replaces success_bar — list of concrete objectives
  "created_at": float,
  "updated_at": float,
  "completed_at": float | null,
  "assigned_personas": [str],
  "linked_projects": [  // NEW — project relationships
    { "project_id": str, "relationship": str }  // "depends_on" | "feeds_into" | "related"
  ],
  "links": {            // NEW — external links
    "repo": str,        // GitHub/GitLab URL
    "live_url": str,    // deployed URL
    "docs": str,        // documentation URL
    "custom": [{ "label": str, "url": str }]
  },
  "milestones": [       // NEW — progress tracking
    { "name": str, "done": bool, "due": str | null }
  ]
}
```

### Artifact Model (keep in SQLite, but add categories)

```sql
-- Add to project_artifacts:
ALTER TABLE project_artifacts ADD COLUMN category TEXT DEFAULT 'general';
-- Categories: "deliverable" | "reference" | "screenshot" | "export" | "generated"
```

### Remove
- `00_SHARED/` governance templates (6 files) — kill the scaffold
- `MEMORY.md` — stop creating, it's deprecated
- `success_bar` field — replaced by `objectives[]`
- `memory_isolation` field — unused
- `workflows` field — unused
- `tokens_used` / `time_spent_mins` — move to computed metrics

---

## UI Redesign

### Project List View

**Remove:**
- Giant hero panel ("Porter keeps each project in one clean lane" — 32px headline)
- "Project Control" marketing copy
- "Start With Porter" duplicate button (already in header)

**Keep:**
- Header with title + "Create Project" button
- Stats bar (total, active, completed)
- Project cards

**Improve project cards:**
- Show project type icon/badge
- Show milestone progress (e.g., "3/5 objectives done")
- Show linked project count
- Show active worker count
- Show last activity timestamp
- Color-code by status (active=accent, paused=gray, completed=green)

### Project Detail View

**Tabs redesign:**

| Old Tab | New Tab | Changes |
|---------|---------|---------|
| Chat | **Chat** | Real project-scoped Porter chat. Keep. |
| Activity | **Activity** | Keep. Show dispatch logs, agent work, state changes. |
| Agents | **Workers** | Rename. Show assigned + Porter's recommendations for new ones. |
| Artifacts | **Deliverables** | Rename. Only real files. Upload button. Categories. No scaffold docs. |
| State | **Overview** | Rename. Move to first tab. Show objectives, milestones, links, linked projects. |

**New tab order:** Overview → Chat → Workers → Deliverables → Activity

**Overview tab (new first tab):**
- Project name + type badge + status
- Objectives checklist (toggle done/not-done)
- Milestones with optional due dates
- External links (repo, live URL, docs, custom)
- Linked projects (click to navigate)
- Quick stats: workers assigned, deliverables count, last activity

**Workers tab improvements:**
- Show current workers with their recent activity on THIS project
- "Porter recommends" section — based on project type, suggest workers to create
- Remove/reassign workers

**Deliverables tab improvements:**
- Upload button (drop zone)
- Category filters (deliverable, reference, screenshot, export)
- File preview for images
- Download links
- Delete artifacts
- No more scaffold docs listed here

---

## Training Project (rename "Launchpad" → "First Mission")

**Name: "First Mission"** — action-oriented, not jargon.

The training project is a guided walkthrough that teaches:

1. **Step 1: Define an objective** — Porter asks "What do you want to build?" and creates the project
2. **Step 2: Create your first worker** — Porter says "This project needs a specialist. Let's create one." Walks through worker creation.
3. **Step 3: Assign the worker** — Show how to attach workers to projects
4. **Step 4: Add a deliverable** — Upload or create a first artifact
5. **Step 5: Review state** — Show how project state tracks progress
6. **Step 6: Link a project** — "Want to connect this to another project?"

Each step is a guided chat interaction with Porter. Porter tracks progress via milestones.

---

## Linked Projects

Projects can reference each other:

- **depends_on:** "Brand Design" must be done before "Website Launch"
- **feeds_into:** "Market Research" feeds into "Product Strategy"
- **related:** "iOS App" and "Android App" share context

**UI:** In the Overview tab, linked projects show as clickable chips. Clicking navigates to that project's detail view.

**API:** POST `/api/projects` action `link_project` / `unlink_project`

---

## Legacy Cleanup (must happen first)

### Delete:
1. `_bootstrap_shared_docs()` and all 6 governance templates
2. `MEMORY.md` creation in `scaffold_project_dir()` (keep STATE.md)
3. Duplicate functions (lines 3509-3576 — second copies of _normalize_project_name, _migrate_project_workspace_root, _normalize_project_registry_names)
4. "YMC Capital" hardcoded example text (lines 18049, 18220)
5. Giant hero panel HTML (lines 12217-12227)
6. `_seed_launchpad_workspace()` — replace with new training project seeder
7. `_seed_launchpad_state()` — replace with milestone-based state
8. Legacy `_migrate_legacy_porter_app_project()` — one-time migration, can be removed
9. `_load_projects_dashboard()` and `/api/projects-dashboard` — reads external projects.md, not part of the product
10. SPRINT_PLAN.md, tasks/checkpoint.md, tasks/lessons.md from project file chain — these are dev artifacts, not product features

### Rename:
1. "Launchpad" → "First Mission" everywhere
2. "Artifacts" tab → "Deliverables" tab
3. "State" tab → "Overview" tab (and move to first position)
4. "Agents" tab → "Workers" tab

### Fix:
1. Project cards — remove oversized styling (18px font-weight 800 titles, 20px border-radius, translateY hover)
2. Artifact listing — stop showing scaffold docs as artifacts
3. Project creation — offer type selection, not just name+description
4. Chat delete — add error handling (already patched in v0.31.10)

---

## Implementation Order

### Phase 1: Cleanup (no new features, just remove dead weight)
1. Delete duplicate functions
2. Delete governance template system
3. Stop creating MEMORY.md in projects
4. Remove hero panel
5. Remove YMC Capital example text
6. Remove projects-dashboard endpoint
7. Remove scaffold docs from artifacts/file chain
8. Clean up Launchpad seeding
9. Version bump + ship

### Phase 2: Data Model (foundation for new features)
1. Add `status`, `objectives`, `linked_projects`, `links`, `milestones` to project object
2. Add `category` column to project_artifacts
3. Migration: convert existing projects to new schema (success_bar → objectives)
4. API: add link_project/unlink_project actions
5. API: add milestone CRUD
6. Version bump + ship

### Phase 3: UI Overhaul
1. Redesign project list (compact cards with type badges, milestone progress)
2. Reorder detail tabs: Overview → Chat → Workers → Deliverables → Activity
3. Build Overview tab (objectives, milestones, links, linked projects)
4. Rename Agents → Workers, add recommendation section
5. Rebuild Deliverables tab (upload, categories, no scaffold docs)
6. Project creation with type selection
7. Version bump + ship

### Phase 4: Training Project
1. Rename Launchpad → "First Mission"
2. Build guided 6-step walkthrough
3. Step 2 teaches agent/worker creation
4. Milestone-based progress tracking
5. Version bump + ship

### Phase 5: Polish
1. Linked project navigation
2. Project type icons
3. Status lifecycle UI (archive, complete, reopen)
4. Activity feed improvements
5. Final version bump + ship

---

## Estimated Scope

- **Phase 1:** ~3 patch scripts, 1 version
- **Phase 2:** ~2 patch scripts, 1 version
- **Phase 3:** ~4-5 patch scripts, 2-3 versions
- **Phase 4:** ~2 patch scripts, 1 version
- **Phase 5:** ~2 patch scripts, 1 version

Total: ~14 patches across ~6-8 versions.

---

## Open Questions for Moe

1. **"First Mission" as training project name?** Alternatives: "Getting Started", "Your First Project", "Bootcamp"
2. **Project types — are these 8 right?** Any to add/remove?
3. **Linked projects — is depends_on/feeds_into/related enough?** Or simpler (just "linked")?
4. **Should we migrate projects from JSON config to SQLite now?** It would be cleaner but bigger scope.
5. **File upload for deliverables — direct upload or just link to existing files on disk?**
