# Requirements: Porter v5.0 — Living Skills

**Defined:** 2026-04-02
**Core Value:** Skills must be live behavioral modules — selected at runtime, injected into prompts, measured for effectiveness, and evolved through feedback.

## v5.0 Requirements

### Source of Truth

- [x] **SOT-01**: template_skills junction table is the canonical source for template→skill mappings (populated from existing JSONB arrays via migration)
- [x] **SOT-02**: persona_skills junction table is the canonical source for agent→skill mappings (uses skill_id not skill_name)
- [x] **SOT-03**: SKILLS.md is a thin manifest generated from DB assignments at instantiate-time — contains skill IDs, short descriptions, pack paths, and runtime rules only
- [x] **SOT-04**: Instantiation flow reads skills from template_skills junction table, not from skills_text column
- [x] **SOT-05**: skills_text column on agent_templates is deprecated — migration preserves data but instantiation ignores it
- [x] **SOT-06**: Changing skill assignments in DB triggers SKILLS.md regeneration for affected personas

### Skill Pack Explorer

- [x] **PKX-01**: Admin can view a skill pack's file tree (SKILL.md, prompt.md, guides/*, examples/*, meta/skill.json) from the skill detail view
- [x] **PKX-02**: Admin can read and edit any file in a skill pack from the browser
- [x] **PKX-03**: Admin can save edited pack files back to disk via API
- [x] **PKX-04**: Pack diagnostics show missing files, empty files, generic scaffold detection, and word count/richness score per skill
- [x] **PKX-05**: Template and agent detail pages have "open assigned skills" link that navigates to the skill pack explorer

### Runtime Skill Selection

- [x] **RTS-01**: Every dispatch gathers the agent's assigned skills from persona_skills
- [x] **RTS-02**: A skill selector ranks candidate skills against the task using description, triggers, tags, and historical success
- [x] **RTS-03**: Only the top 0-3 most relevant skill packs are injected into the dispatch prompt context
- [x] **RTS-04**: Every dispatch logs which skills were candidates, which were selected, and the ranking scores
- [x] **RTS-05**: Dispatches with no relevant skills proceed without skill injection (graceful zero-skill path)

### Feedback Telemetry

- [x] **FBK-01**: skill_feedback_events table captures per-dispatch skill effectiveness signals (positive, negative, correction, retry, abandon, success)
- [x] **FBK-02**: Each persona_skill record tracks times_selected, times_completed, positive_feedback_count, negative_feedback_count, last_used_at, effectiveness_score
- [x] **FBK-03**: Thumbs up/down on a dispatch response stores a skill_feedback_event linked to the selected skills
- [x] **FBK-04**: Skill effectiveness scores are aggregated and queryable per skill, per agent, and per template
- [x] **FBK-05**: Admin UI shows effectiveness metrics on skill detail, agent detail, and template detail pages

### Agent Evolution

- [x] **EVO-01**: A background job analyzes feedback patterns and generates skill recommendations (add, remove, rewrite prompt, enrich examples)
- [x] **EVO-02**: Recommendations are stored as proposed changes visible in admin UI with diffs
- [x] **EVO-03**: Admin can approve or reject proposed skill changes (supervised mutation)
- [x] **EVO-04**: Approved changes update persona_skills and regenerate SKILLS.md automatically
- [x] **EVO-05**: Evolution events are logged (what changed, why, which feedback cluster triggered it)

### Skill Quality

- [x] **QLT-01**: Every skill has a computed quality score based on: file completeness, specificity, example count, guide richness, prompt uniqueness, recent usage, success rate, user feedback
- [x] **QLT-02**: Quality tiers replace pack_status: scaffold, baseline, production, high-performing, stale
- [x] **QLT-03**: Skills table and marketplace show quality tier badges instead of ready/partial/missing
- [x] **QLT-04**: Admin can filter skills by quality tier
- [x] **QLT-05**: A quality audit job can score all skills and flag scaffolds for enrichment

### Template Skill UX

- [x] **TUX-01**: Template detail view shows assigned skills from template_skills with why each is attached
- [x] **TUX-02**: Admin can attach, detach, and reorder skills on a template from the template detail page
- [x] **TUX-03**: Template authoring supports marking skills as mandatory vs optional and setting priority
- [x] **TUX-04**: Template detail shows recent skill effectiveness across all spawned agents using that template
- [x] **TUX-05**: Template detail shows what runtime auto-detection will select for sample task prompts

## v6.0 Requirements (Deferred)

### Battle Arena
- **BTL-01**: Head-to-head battles with same prompt, blind judge ensemble, Elo ratings
- **BTL-02**: Pre-launch calibration (50 battles, positional win-rate delta < 10%)

### Autonomous Evolution
- **AEV-01**: Controlled auto-evolution for low-risk changes (manifest-only, example additions)
- **AEV-02**: Agent identity boundaries — evolution never silently rewrites soul/identity

### Skill Content Enrichment
- **SCE-01**: AI-assisted skill pack enrichment (generate domain-specific prompts, examples, guides)
- **SCE-02**: Skill pack versioning with rollback

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full autonomous evolution (Level 3) | Safety risk — supervised mutation first, auto-evolution in v6.0 |
| Skill marketplace/sharing between workspaces | Single-tenant first, multi-tenant later |
| Real-time skill injection during streaming | Skill selection happens before dispatch, not mid-stream |
| Custom skill DSL/programming language | Skills are markdown + JSON, not code |
| Skill dependencies/composition | Individual skills first, composition later |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SOT-01 | Phase 31 | Complete |
| SOT-02 | Phase 31 | Complete |
| SOT-03 | Phase 31 | Complete |
| SOT-04 | Phase 31 | Complete |
| SOT-05 | Phase 31 | Complete |
| SOT-06 | Phase 31 | Complete |
| PKX-01 | Phase 32 | Complete |
| PKX-02 | Phase 32 | Complete |
| PKX-03 | Phase 32 | Complete |
| PKX-04 | Phase 32 | Complete |
| PKX-05 | Phase 32 | Complete |
| RTS-01 | Phase 33 | Complete |
| RTS-02 | Phase 33 | Complete |
| RTS-03 | Phase 33 | Complete |
| RTS-04 | Phase 33 | Complete |
| RTS-05 | Phase 33 | Complete |
| FBK-01 | Phase 34 | Complete |
| FBK-02 | Phase 34 | Complete |
| FBK-03 | Phase 34 | Complete |
| FBK-04 | Phase 34 | Complete |
| FBK-05 | Phase 34 | Complete |
| EVO-01 | Phase 35 | Complete |
| EVO-02 | Phase 35 | Complete |
| EVO-03 | Phase 35 | Complete |
| EVO-04 | Phase 35 | Complete |
| EVO-05 | Phase 35 | Complete |
| QLT-01 | Phase 36 | Pending |
| QLT-02 | Phase 36 | Pending |
| QLT-03 | Phase 36 | Pending |
| QLT-04 | Phase 36 | Pending |
| QLT-05 | Phase 36 | Pending |
| TUX-01 | Phase 37 | Complete |
| TUX-02 | Phase 37 | Complete |
| TUX-03 | Phase 37 | Complete |
| TUX-04 | Phase 37 | Complete |
| TUX-05 | Phase 37 | Complete |

**Coverage:**
- v5.0 requirements: 36 total
- Mapped to phases: 36
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after milestone v5.0 definition*
