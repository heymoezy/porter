# Roadmap: Porter

## Milestones

- ✅ **v1.0 Foundation + Core Platform** — Phases 1-7 (shipped 2026-03-21)
- ✅ **v2.0 Backend Ready** — Phases 8-15 (shipped 2026-03-24)
- ✅ **v3.0 Porter Bridge** — Phases 16-23 (shipped 2026-03-25) — AI gateway, model intelligence, smart routing
- ⏸️ **v4.0 The Arena** — Phases 24-30 (6/7 shipped, Phase 28 Battle Arena deferred)
- 🚧 **v5.0 Living Skills** — Phases 31-37 (active) — Skills as live behavioral modules

## Phases

<details>
<summary>v1.0 Foundation + Core Platform (Phases 1-7) — SHIPPED 2026-03-21</summary>

| Phase | Name | Key Deliverables |
|-------|------|------------------|
| 1 | Foundation | CSS variable architecture, exception handling, SQLite pooling, project migration, Fastify baseline, boot sequence |
| 2 | Memory V2 | 4-layer memory (directives/concepts/episodes/signals), Cortex removal (194KB deleted), noise filter, real-time feed |
| 3 | Route Migration | Lean system prompts, Fastify /api/v1/* for auth/projects/agents, React login/register, design tokens |
| 4 | Agent Autonomy | Scheduler (2s tick), AI router, event triggers, activity log, ephemeral agents, feature flags |
| 5 | Guided Wizard | Conversational project creation, auto agent assignment, project dashboard, GSD plan mode |
| 6 | Real-Time Transparency | SSE singleton, 6 pollers killed, agent activity feed, health panel, decision log |
| 7 | External Connections | Credential encryption, GitHub/email/calendar/WhatsApp integrations, OAuth flows, external dispatcher |

30/30 requirements complete. 35 Playwright tests green. Version v0.34.23.

</details>

<details>
<summary>v2.0 Backend Ready (Phases 8-15) — SHIPPED 2026-03-24</summary>

- [x] Phase 8: API Foundation — Consistent envelopes, error codes, trace IDs, OpenAPI spec (2026-03-21)
- [x] Phase 9: Streaming Chat — Token-by-token SSE from all AI backends, mid-stream cancellation (2026-03-22)
- [x] Phase 10: Collaborative Sessions — Invite by email, per-project roles, RBAC enforcement (2026-03-22)
- [x] Phase 11: Unified Chat & CRM Schema — Single conversation model, multi-value CRM, file associations (2026-03-22)
- [x] Phase 12: CRM Intelligence & Agent Templates — AI contact analysis, 103 agent templates, one-call instantiation (2026-03-22)
- [x] Phase 13: Autonomous Learning — Web/GitHub/Reddit knowledge acquisition, concept storage with source attribution (2026-03-22)
- [x] Phase 13.05: PostgreSQL Migration — SQLite to PostgreSQL 16 + pgvector, all schemas/queries/FTS ported (2026-03-24)
- [x] Phase 13.1: Memory V3 State Engine — Structured directives/notes, tiered injection, consolidation, agent self-edit (2026-03-24)
- [x] Phase 15: Skills & Tools Architecture — DB registry, CRUD APIs, junction tables, visibility controls, forge integration (2026-03-24)

38/41 requirements complete (3 billing deferred).

</details>

<details>
<summary>v3.0 Porter Bridge (Phases 16-23) — SHIPPED 2026-03-25</summary>

- [x] Phase 16-23: Gateway foundation, provider adapters, resilience, model catalog, smart routing, first-run setup, bridge admin, integration & multi-tenant

46/46 requirements complete. Version v3.3.2.

</details>

<details>
<summary>v4.0 The Arena (Phases 24-30) — PARTIAL (6/7 shipped)</summary>

- [x] Phase 24: Schema Migration — RPG tables, battle tables, session registry, intelligence patterns
- [x] Phase 25: RPG Engine — Stat calculation, XP/level/star/rarity, .md regeneration
- [x] Phase 26: Forge Unification — Nav merge, 4-tab shell, armory absorbs skills/tools
- [x] Phase 27: Character Sheet UI — Pentagon stats, rarity borders, vitals, passive tree
- [ ] Phase 28: Battle Arena — DEFERRED to v6.0
- [x] Phase 29: Session Registry + Message Bus — Per-session tokens, context pressure, envelope protocol
- [x] Phase 30: Intelligence Loop + Bridge Operator — Pattern extraction, concept promotion, Vigil surfaces

</details>

---

### v5.0 Living Skills (Active)

**Milestone Goal:** Transform skills from a static catalog into live behavioral modules that are selected at runtime, injected into dispatch prompts, measured for effectiveness, and evolved through feedback. Fix the broken source of truth, build real authoring UX, implement runtime selection, close the feedback loop, and replace fake quality tiers with real measurement.

- [x] **Phase 31: Source of Truth Cleanup** — DB assignments canonical, SKILLS.md = generated manifest (completed 2026-04-02)
- [x] **Phase 32: Skill Pack Explorer** — View/edit real .md files, quality diagnostics (completed 2026-04-02)
- [x] **Phase 33: Runtime Skill Selector** — Rank skills per task, inject packs, log selection (completed 2026-04-02)
- [x] **Phase 34: Feedback Telemetry** — Capture signals, effectiveness scoring (completed 2026-04-02)
- [ ] **Phase 35: Agent Evolution Loop** — Recommendations, proposed changes, supervised apply
- [x] **Phase 36: Skill Quality Scoring** — Real quality tiers, audit job (completed 2026-04-03)
- [ ] **Phase 37: Template Skill UX** — Assignment authoring, effectiveness display

## Phase Details

### Phase 31: Source of Truth Cleanup
**Goal**: template_skills and persona_skills junction tables are the single source of truth for all skill assignments — SKILLS.md is a thin generated manifest, skills_text is deprecated, and no skill data is duplicated across DB columns and files
**Depends on**: Phase 30 (v4.0 complete)
**Requirements**: SOT-01, SOT-02, SOT-03, SOT-04, SOT-05, SOT-06
**Success Criteria** (what must be TRUE):
  1. Running `SELECT COUNT(*) FROM template_skills` returns a number matching the total skill assignments across all 107 templates (migrated from JSONB arrays)
  2. persona_skills references skill IDs (not names) and the existing 17 porter-core rows are migrated to use skill IDs
  3. Instantiating a template creates persona_skills rows from template_skills and generates a thin SKILLS.md manifest (not from skills_text)
  4. The generated SKILLS.md contains only skill IDs, short descriptions, pack paths, and runtime rules — no prose duplication
  5. Modifying a persona's skill assignments via API regenerates its SKILLS.md within the same request
  6. skills_text column is preserved for backwards compatibility but never read during instantiation
**Plans:** 3/3 plans complete
Plans:
- [x] 31-01-PLAN.md — Schema update + migration script (template_skills population, persona_skills.skill_id)
- [x] 31-02-PLAN.md — Instantiation rewrite + forge Station 2 + SKILLS.md manifest generator
- [x] 31-03-PLAN.md — API toggle/delete endpoints + rpg-engine alignment + regeneration triggers

### Phase 32: Skill Pack Explorer
**Goal**: Admin can inspect and edit the actual skill pack files (.md, guides, examples, metadata) from the browser — not just DB metadata fields — with quality diagnostics that reveal scaffold vs real content
**Depends on**: Phase 31
**Requirements**: PKX-01, PKX-02, PKX-03, PKX-04, PKX-05
**Success Criteria** (what must be TRUE):
  1. Clicking a skill in the admin opens a file tree showing all files in that skill's pack directory
  2. Selecting a file shows its content in an editor pane; saving writes back to disk via API
  3. Pack diagnostics badge shows a quality score: file count, non-empty file count, word count, and scaffold detection (generic boilerplate matching)
  4. Template and agent detail pages have a clickable link on each assigned skill that opens the pack explorer for that skill
  5. Missing or empty files are flagged with warnings in the file tree
**Plans:** 4/4 plans complete
Plans:
- [x] 32-00-PLAN.md — Wave 0 test scaffold (Playwright tests for PKX-01 through PKX-05)
- [x] 32-01-PLAN.md — Backend quality diagnostics + PUT file write endpoint
- [x] 32-02-PLAN.md — Frontend pack explorer page (CodeMirror editor, file tree, diagnostics)
- [x] 32-03-PLAN.md — Quality badges + navigation wiring (skills-studio, marketplace, agent-detail)

### Phase 33: Runtime Skill Selector
**Goal**: Porter selects the right skills at dispatch time — gathering assigned skills, ranking them against the task, injecting only the top matches into the prompt, and logging what was used and why
**Depends on**: Phase 31
**Requirements**: RTS-01, RTS-02, RTS-03, RTS-04, RTS-05
**Success Criteria** (what must be TRUE):
  1. A dispatch for an agent with 5 assigned skills selects 0-3 based on task relevance — not all 5
  2. The skill selector uses description, triggers, tags, and historical success rate to rank candidates
  3. Selected skill pack content (prompt.md + SKILL.md) is injected into the dispatch system prompt between memory tiers and gateway instructions
  4. Every dispatch record in bridge_dispatch_log includes a skills_used JSONB column with candidate list, selected list, and scores
  5. An agent with no assigned skills or no relevant skills dispatches normally without skill injection
**Plans:** 2/2 plans complete
Plans:
- [x] 33-01-PLAN.md — Migration (skills_used JSONB) + skill-selector.ts service (scoring, pack reading)
- [x] 33-02-PLAN.md — Chat pipeline wiring + dispatch logging integration

### Phase 34: Feedback Telemetry
**Goal**: Every dispatch outcome produces a structured feedback signal linked to the skills that were used — enabling per-skill effectiveness measurement that actually means something
**Depends on**: Phase 33
**Requirements**: FBK-01, FBK-02, FBK-03, FBK-04, FBK-05
**Success Criteria** (what must be TRUE):
  1. skill_feedback_events table exists with persona_id, skill_id, dispatch_id, event_type (positive/negative/correction/retry/abandon/success), and note columns
  2. Thumbs up/down on a chat response creates feedback events for all skills that were active during that dispatch
  3. Each persona_skill row has live aggregated stats: times_selected, times_completed, positive/negative counts, effectiveness_score (computed from feedback ratio)
  4. Admin can view per-skill effectiveness on skill detail, agent detail, and template detail pages
  5. Effectiveness scores are queryable via API: GET /api/admin/skills/:id/effectiveness and GET /api/admin/agents/:id/skill-effectiveness
**Plans:** 4/4 plans complete
Plans:
- [x] 34-00-PLAN.md — Playwright test scaffold for FBK-01 through FBK-05 (Wave 0)
- [ ] 34-01-PLAN.md — Migration (skill_feedback_events + persona_skills counters) + dispatch_id lifecycle + times_selected
- [ ] 34-02-PLAN.md — Feedback POST endpoint + chat thumbs-up/down UI
- [ ] 34-03-PLAN.md — Admin effectiveness API endpoints + UI on detail pages

### Phase 35: Agent Evolution Loop
**Goal**: Feedback patterns drive concrete skill recommendations that admin can review and approve — closing the loop from "skill was used" to "skill inventory changed because of measured performance"
**Depends on**: Phase 34
**Requirements**: EVO-01, EVO-02, EVO-03, EVO-04, EVO-05
**Success Criteria** (what must be TRUE):
  1. A background job (runs every 6 hours) analyzes feedback patterns per agent and generates recommendations: add skill, remove skill, rewrite prompt, enrich examples
  2. Recommendations are stored in a skill_evolution_proposals table with proposed_change JSONB, reasoning, triggering_feedback_ids, and status (pending/approved/rejected)
  3. Admin UI shows pending proposals with diffs (what would change) and approve/reject buttons
  4. Approving a proposal updates persona_skills, regenerates SKILLS.md, and logs the evolution event
  5. Evolution event log shows timeline of what changed, why, which feedback triggered it, and whether effectiveness improved after the change
**Plans**: TBD

### Phase 36: Skill Quality Scoring
**Goal**: Every skill has a measurable quality score that distinguishes scaffold filler from production-ready content — admin can see at a glance which skills are real and which need work
**Depends on**: Phase 34
**Requirements**: QLT-01, QLT-02, QLT-03, QLT-04, QLT-05
**Success Criteria** (what must be TRUE):
  1. Every skill has a quality_score (0-100) computed from: file completeness (20%), content specificity (20%), example count (15%), guide richness (15%), prompt uniqueness (10%), usage frequency (10%), effectiveness score (10%)
  2. Quality tiers are derived from score: scaffold (0-25), baseline (26-50), production (51-75), high-performing (76-100), stale (any score + no usage in 30 days)
  3. Skills table and marketplace show quality tier badges with color coding instead of ready/partial/missing
  4. Admin can filter skills by quality tier in both table and grid views
  5. A quality audit API endpoint scores all skills and returns a report of scaffolds needing enrichment
**Plans**: TBD

### Phase 37: Template Skill UX
**Goal**: Template detail view is the command center for skill configuration — showing what's assigned, why, how effective each skill is, and letting admin author the skill loadout with priorities and auto-detect settings
**Depends on**: Phase 36
**Requirements**: TUX-01, TUX-02, TUX-03, TUX-04, TUX-05
**Success Criteria** (what must be TRUE):
  1. Template detail shows all assigned skills from template_skills with each skill's description, quality tier, and assignment rationale
  2. Admin can add, remove, and reorder skills on a template with drag-and-drop or manual sort
  3. Each skill on a template can be marked mandatory (always selected) or optional (subject to runtime auto-detection)
  4. Template detail shows aggregated skill effectiveness across all agents spawned from that template
  5. A "preview" feature shows which skills would be auto-selected for a sample task prompt
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in order: 31 → 32 → 33 (can parallel 32) → 34 → 35 (can parallel 36) → 36 → 37.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7 | v1.0 | - | Complete | 2026-03-21 |
| 8-15 | v2.0 | - | Complete | 2026-03-24 |
| 16-23 | v3.0 | - | Complete | 2026-03-25 |
| 24-30 | v4.0 | 17/17 | Partial (28 deferred) | 2026-04-02 |
| 31. Source of Truth | v5.0 | 3/3 | Complete | 2026-04-02 |
| 32. Skill Pack Explorer | v5.0 | 4/4 | Complete | 2026-04-02 |
| 33. Runtime Skill Selector | v5.0 | 2/2 | Complete | 2026-04-02 |
| 34. Feedback Telemetry | 4/4 | Complete   | 2026-04-02 | - |
| 35. Agent Evolution Loop | v5.0 | 0/TBD | Not started | - |
| 36. Skill Quality Scoring | v5.0 | Complete    | 2026-04-03 | - |
| 37. Template Skill UX | v5.0 | 0/TBD | Not started | - |
