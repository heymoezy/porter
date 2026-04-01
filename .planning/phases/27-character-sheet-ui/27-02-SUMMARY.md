---
phase: 27-character-sheet-ui
plan: 02
subsystem: ui
tags: [react, shadcn, react-query, sse, rpg, character-sheet, vitals, passive-tree]

requires:
  - phase: 27-01
    provides: "RpgStats interface and reliability/dispatchCount props shape"
  - phase: 25-rpg-engine
    provides: "rpg.reliability and dispatchCount stored in agent_rpg_stats"
provides:
  - VitalsBar component with 3 live bars (Tokens/Health/Focus) fetching from /api/admin/bridge/capacity
  - PassiveTreeView component with 4x2 node grid, 3 render states (active/unlocked/locked)
  - SSE invalidation of bridge:capacity on every bridge:dispatch event
affects: [27-03-character-sheet-assembly, 28-battle-arena]

tech-stack:
  added: []
  patterns:
    - "Derived vitals from gateway capacity data — tokenPct = 100 - (used/limit * 100)"
    - "Focus proxy via dispatchCount % 50 window — replaced with real session data in Phase 29"
    - "Passive tree as static NODE_DEFS record with runtime lookup from props.nodes array"

key-files:
  created:
    - admin/frontend/app/components/vitals-bar.tsx
    - admin/frontend/app/components/passive-tree-view.tsx
  modified:
    - admin/frontend/app/hooks/use-admin-sse.ts

key-decisions:
  - "VitalsBar prefixes templateId prop with _ to mark it unused until Phase 29 session registry — avoids TS unused variable warning while preserving API contract"
  - "PassiveTreeView skips unknown node_ids silently — NODE_DEFS is the canonical list, not props.nodes"
  - "Focus derivation is a proxy (dispatchCount % 50) not a real session measurement — documented as Phase 29 replacement"
  - "No SVG for passive tree connections — plan spec says 1px dashed border sufficient, grid layout makes lines unnecessary"

patterns-established:
  - "VitalBarRow: label/value header + h-1.5 rounded progress bar with transition-all duration-700"
  - "Color thresholds: blue>=50/yellow>=20/red for tokens; green>=80/yellow>=50/red for health; purple>=70/yellow>=40/red for focus"
  - "NodeState resolved as active > unlocked > locked — locked = not in props OR unlocked=false"

requirements-completed: [UI-03, UI-06, VIT-01, VIT-02, VIT-03]

duration: 4min
completed: 2026-04-01
---

# Phase 27 Plan 02: Character Sheet UI Summary

**VitalsBar (Tokens/Health/Focus from live gateway capacity + rpg.reliability) and PassiveTreeView (8-node 4x2 grid with active/unlocked/locked states) built as standalone components**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-01T07:59:32Z
- **Completed:** 2026-04-01T08:03:23Z
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments
- VitalsBar renders 3 color-coded bars from real data: Tokens from /api/admin/bridge/capacity, Health from rpg.reliability prop, Focus from dispatch recency proxy
- PassiveTreeView renders all 8 canonical passive nodes in a 4x2 grid with three distinct visual states
- SSE hook updated so every bridge:dispatch event triggers bridge:capacity invalidation, keeping the Tokens bar live

## Task Commits

1. **Task 1: Build VitalsBar component** - `01b5a73` (feat)
2. **Task 2: Build PassiveTreeView component** - `c0f0f3e` (feat)

## Files Created/Modified
- `admin/frontend/app/components/vitals-bar.tsx` - VitalsBar with Tokens/Health/Focus bars, fetches /api/admin/bridge/capacity
- `admin/frontend/app/components/passive-tree-view.tsx` - PassiveTreeView with 8 NODE_DEFS, 4x2 grid, active/unlocked/locked states
- `admin/frontend/app/hooks/use-admin-sse.ts` - Added bridge:capacity invalidation inside bridge:dispatch case

## Decisions Made
- Prefixed `templateId` with `_` to satisfy TypeScript while preserving the prop for Phase 29 session registry integration
- Used static `NODE_DEFS` record as the canonical node catalog — props.nodes only provides runtime state, not structure
- Focus bar uses `dispatchCount % 50` proxy; real context window pressure from Phase 29 session registry replaces this

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TS error in `agent-detail.tsx` (Type 'unknown' not assignable to ReactNode at line 193) — out of scope, not caused by this plan's changes. Logged to deferred items.

## Next Phase Readiness
- VitalsBar and PassiveTreeView ready to be composed into the full character sheet in Plan 27-03
- Both components accept the same RpgStats shape established by Plan 27-01
- No blockers

---
*Phase: 27-character-sheet-ui*
*Completed: 2026-04-01*
