---
phase: 05-guided-project-wizard
plan: "02"
subsystem: ui
tags: [react, zustand, framer-motion, lucide-react, design-system, wizard, gsd]

# Dependency graph
requires:
  - phase: 05-00
    provides: Phase 5 context, wizard flow architecture decision (wizard lives in main chat)
  - phase: 01-foundation
    provides: Design system tokens (tokens.ts), CSS custom properties (:root vars)
provides:
  - Zustand store extended with wizard state machine (WizardStage, WizardProposal types)
  - GSD per-project mode with localStorage persistence (porter_gsd_modes)
  - Active project ID tracking in global store (activeProjectId)
  - WizardCard component: animated proposal card with agent strip, milestone timeline, approve button
  - WizardQuestion component: numbered structured option buttons with hover/tap animations
  - GSDModeToggle component: per-project mode chip (Free chat / GSD Plan)
  - ChatView updated: wizard components inline in message stream, GSD toggle header
  - Layout.tsx migrated to design system CSS variables
  - ChatView.tsx fully migrated to design system CSS variables
affects:
  - 05-03: backend wizard API — frontend now expects /api/v1/projects/wizard POST endpoint
  - Any future chat/project modules using useAppStore wizard/GSD state

# Tech tracking
tech-stack:
  added: []
  patterns:
    - framer-motion layoutId for shared layout animations across wizard stages
    - Zustand getGsdMode accessor pattern (reads from get() inside action)
    - CSS variable arbitrary values in Tailwind (bg-[var(--surface)], text-[var(--accent)])
    - Wizard state machine with 6 discrete stages (idle/detecting/questioning/proposing/refining/approved)

key-files:
  created:
    - frontend/src/modules/chat/WizardCard.tsx
    - frontend/src/modules/chat/WizardQuestion.tsx
    - frontend/src/modules/chat/GSDModeToggle.tsx
  modified:
    - frontend/src/store/app.ts
    - frontend/src/modules/chat/ChatView.tsx
    - frontend/src/components/Layout.tsx

key-decisions:
  - "GSDModeToggle only renders when activeProjectId is non-null — no mode chip outside project context"
  - "Role-based agent colors use semantic Tailwind (blue/purple/pink/green) not design system tokens — semantic/language colors exempt per Phase 1 decision"
  - "getGsdMode uses get() inside action definition — correct Zustand v5 pattern for reading state in actions"
  - "WizardCard max-w-lg enforced to keep card scannable, not full-width"

patterns-established:
  - "WizardStage state machine: all wizard UI reads wizardStage from useAppStore, never local state"
  - "Design system migration: replace neutral-* with var(--text/text2/text3/border/surface/bg/raised), orange-* with var(--accent)"
  - "Wizard components render inline in message stream (not modal/panel) — locked decision from 05-00"

requirements-completed: [PROJ-01, PROJ-04]

# Metrics
duration: 7min
completed: 2026-03-21
---

# Phase 5 Plan 02: Frontend Wizard UI Summary

**Zustand state machine + WizardCard/WizardQuestion/GSDModeToggle React components integrated inline into ChatView with framer-motion animations and design system CSS variables**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-21T05:45:09Z
- **Completed:** 2026-03-21T05:52:52Z
- **Tasks:** 4
- **Files modified:** 6

## Accomplishments
- Extended Zustand store with 6-stage wizard state machine, per-project GSD mode (localStorage-persisted), and active project ID context
- Created WizardCard with framer-motion entry animation, staggered agent portrait strip, milestone timeline, and approve button
- Created WizardQuestion with numbered clickable options and whileHover/whileTap micro-animations
- Created GSDModeToggle chip that reads/writes per-project GSD mode with BrainCircuit/MessageCircle icons
- Integrated all wizard components inline into ChatView message stream with GSD toggle header bar
- Migrated ChatView.tsx and Layout.tsx from hardcoded neutral-* and orange-* to design system CSS variables
- All 35 Playwright regression tests pass after each change

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend Zustand store** - `d31f456` (feat)
2. **Task 2: Create WizardCard, WizardQuestion, GSDModeToggle** - `02b8b77` (feat)
3. **Task 3: Integrate wizard into ChatView, migrate colors** - `cabc634` (feat)
4. **Task 4: Migrate Layout.tsx colors** - `dd9d876` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `frontend/src/store/app.ts` - Added WizardStage/WizardProposal types, wizard state machine, GSD per-project mode, activeProjectId
- `frontend/src/modules/chat/WizardCard.tsx` - Animated proposal card with agent strip, milestone timeline, approve button
- `frontend/src/modules/chat/WizardQuestion.tsx` - Numbered structured option buttons with framer-motion micro-animations
- `frontend/src/modules/chat/GSDModeToggle.tsx` - Per-project mode toggle chip (Free chat / GSD Plan)
- `frontend/src/modules/chat/ChatView.tsx` - Wizard components integration + full color migration to design system
- `frontend/src/components/Layout.tsx` - Color migration to design system CSS variables

## Decisions Made
- GSDModeToggle only renders when `activeProjectId` is non-null — no mode chip in sessions without project context
- Role-based agent portrait colors use semantic Tailwind colors (blue/purple/pink) not design system tokens, consistent with Phase 1 decision that semantic/language colors remain hardcoded hex
- `getGsdMode` reads via `get()` inside store action — correct Zustand v5 accessor pattern
- WizardCard capped at `max-w-lg` (500px) per plan spec to keep proposal card scannable

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Frontend wizard components ready; waiting for 05-03 backend wizard API to wire up real data
- `useAppStore` wizard fields (wizardStage, wizardProposal, wizardQuestions) ready to be driven by SSE events from backend
- `/api/v1/projects/wizard` POST endpoint expected by WizardCard onApprove handler

## Self-Check: PASSED

All 6 files confirmed present on disk. All 4 task commits (d31f456, 02b8b77, cabc634, dd9d876) confirmed in git log.

---
*Phase: 05-guided-project-wizard*
*Completed: 2026-03-21*
