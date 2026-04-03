---
phase: 37-template-skill-ux
plan: 02
subsystem: ui
tags: [react, shadcn, tanstack-query, skills, templates]

# Dependency graph
requires:
  - phase: 37-01
    provides: "Five template skill API endpoints: GET/POST/DELETE/PATCH /api/admin/templates/:id/skills, skills-preview, skill-effectiveness"

provides:
  - "TemplateSkillsTab component: full CRUD for template skill assignments"
  - "agent-detail.tsx: template-skills-tab wired in for non-instance (template) views"
  - "Preview feature: shows which skills auto-select for a sample prompt with scored candidates"
  - "Effectiveness section: aggregated metrics across all spawned agents from template"

affects: [phase-38, agent-detail, template-detail]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-contained tab component receiving only templateId prop and managing all its own queries"
    - "Click-to-edit inline rationale using local editingSkillId/editingRationale state"
    - "Searchable dropdown with useRef for outside-click dismissal"
    - "Two useMutation calls per sort swap to exchange sort_order values atomically"

key-files:
  created:
    - admin/frontend/app/components/template-skills-tab.tsx
  modified:
    - admin/frontend/app/routes/agent-detail.tsx

key-decisions:
  - "TemplateSkillsTab is fully self-contained — parent passes only templateId, no prop drilling of query data"
  - "Removed unused templateEffectiveness useQuery from agent-detail.tsx parent — effectiveness now owned by TemplateSkillsTab"
  - "Template SKILLS tab (!isInstance) and born-agent SKILLS tab (hasApi) coexist with same label but different values"

patterns-established:
  - "Template-only UI gated by !isInstance && templateIdForLookup in agent-detail.tsx"
  - "Effectiveness display lives inside TemplateSkillsTab, not the parent page"

requirements-completed: [TUX-01, TUX-02, TUX-03, TUX-04, TUX-05]

# Metrics
duration: 5min
completed: 2026-04-03
---

# Phase 37 Plan 02: Template Skill UX — Frontend Summary

**TemplateSkillsTab component with CRUD, reorder, mandatory toggle, inline rationale editing, searchable attach dropdown, effectiveness display, and skill-selection preview**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-03T01:52:22Z
- **Completed:** 2026-04-03T01:57:00Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Created `template-skills-tab.tsx` (503 lines) with all 4 sections: assigned skills table, add-skill dropdown, effectiveness summary, preview auto-detection
- Wired TemplateSkillsTab into `agent-detail.tsx` behind `!isInstance` guard — templates see authoring tab, born agents retain runtime skills tab
- Removed duplicate skill effectiveness block from build-tab in agent-detail.tsx (it now lives inside TemplateSkillsTab)
- Frontend builds clean with zero type errors in new/modified files

## Task Commits

1. **Task 1: Create TemplateSkillsTab component** - `2fe3b09` (feat)
2. **Task 2: Wire TemplateSkillsTab into agent-detail.tsx** - `9cca2d5` (feat)

## Files Created/Modified
- `admin/frontend/app/components/template-skills-tab.tsx` - Self-contained skills management component with 4 sections
- `admin/frontend/app/routes/agent-detail.tsx` - Added import, TabsTrigger, TabsContent; removed duplicate effectiveness

## Decisions Made
- `TemplateSkillsTab` is fully self-contained — only needs `templateId` prop. All queries live inside the component, avoiding prop drilling.
- Removed unused `templateEffectiveness` useQuery from agent-detail.tsx parent after the build-tab effectiveness block was removed. No dead query references.
- Template SKILLS tab and born-agent SKILLS tab coexist with the same "SKILLS" label but different tab values (`template-skills-tab` vs `skills-tab`) and different rendering logic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Dead Code] Removed unused templateEffectiveness useQuery from agent-detail.tsx**
- **Found during:** Task 2 (wiring)
- **Issue:** After removing the build-tab effectiveness block, `templateEffectiveness` query variable became unused — dead query still firing on every template view
- **Fix:** Removed the `useQuery` declaration entirely since TemplateSkillsTab now owns effectiveness fetching
- **Files modified:** admin/frontend/app/routes/agent-detail.tsx
- **Verification:** tsc --noEmit passes, no unused variable warnings
- **Committed in:** 9cca2d5 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 dead code)
**Impact on plan:** Cleanup only — removes a query that would have fired unnecessarily. No scope creep.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Phase 37 complete: full template skill UX shipped (backend endpoints + frontend authoring tab)
- Template detail page shows SKILLS tab for templates with CRUD, effectiveness, preview
- Ready for Phase 38: Adaptive Agent Context

---
*Phase: 37-template-skill-ux*
*Completed: 2026-04-03*
