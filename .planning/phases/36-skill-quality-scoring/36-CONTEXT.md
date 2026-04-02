# Phase 36: Skill Quality Scoring - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Every skill has a measurable quality score that distinguishes scaffold filler from production-ready content — admin can see at a glance which skills are real and which need work.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase. Key areas:
- Quality score formula: file completeness (20%), content specificity (20%), example count (15%), guide richness (15%), prompt uniqueness (10%), usage frequency (10%), effectiveness score (10%)
- Quality tiers: scaffold (0-25), baseline (26-50), production (51-75), high-performing (76-100), stale (any score + no usage in 30 days)
- Replace existing packStatus (ready/partial/missing) with quality tier badges + color coding
- Admin filtering by quality tier in table and grid views
- Quality audit API endpoint that scores all skills and returns enrichment report

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `admin/backend/src/services/skill-library.ts` — Phase 32: computePackDiagnostics() already computes file count, word count, scaffold detection
- `admin/frontend/app/components/skill-quality-badge.tsx` — Phase 32: SkillQualityBadge with 4-tier coloring
- `backend/src/db/schema.ts` — persona_skills with effectiveness_score, times_selected, usage counters (Phase 34)

### Integration Points
- Extend computePackDiagnostics to compute numeric quality_score (0-100)
- Add usage_frequency and effectiveness_score from persona_skills into the formula
- Replace SkillQualityBadge tier derivation with score-based tiers
- Quality audit API endpoint for batch scoring

</code_context>

<specifics>
## Specific Ideas
No specific requirements — infrastructure phase.
</specifics>

<deferred>
## Deferred Ideas
None
</deferred>
