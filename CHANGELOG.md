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

- Phase 31-34 execution (see v5.0.0 above for details)
- Projects directory migration: /home/lobster/documents/ → /home/lobster/projects/
- porter-admin standalone repo archived, merged into monorepo

## v4.4.0 (2026-04-01)

- Skills 10x: 207 skills across 20 categories with complete on-disk packs
- SkillsStudio CRUD UI, marketplace grid view, tag filters, import system
- Admin nav restructure, System page merge, Files→Projects
