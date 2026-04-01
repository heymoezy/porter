---
phase: 27-character-sheet-ui
plan: "01"
subsystem: admin-frontend
tags: [rpg, character-sheet, recharts, css-animations, react-components]
dependency_graph:
  requires: []
  provides: [CharacterCard, RpgStats, WorkshopData, rarity-keyframes]
  affects: [admin/frontend/app/components/character-card.tsx, admin/frontend/app/app.css]
tech_stack:
  added: [recharts@3.8.1]
  patterns: [RadarChart pentagon, SVG arc progress, CSS keyframe rarity borders]
key_files:
  created:
    - admin/frontend/app/components/character-card.tsx
  modified:
    - admin/frontend/package.json
    - admin/frontend/app/app.css
decisions:
  - "Progress component lacks indicatorClassName — used custom div with xp-bar-fill class instead (inline approach, no change to shadcn component)"
  - "recharts@3.8.1 (^3.x) accepted — both v2 and v3 export RadarChart"
metrics:
  duration: "220s"
  completed_date: "2026-04-01"
  tasks_completed: 2
  files_modified: 3
---

# Phase 27 Plan 01: CharacterCard Component + Rarity CSS Summary

**One-liner:** Game-style agent character sheet with recharts stat pentagon, SVG star arc, and animated rarity border keyframes for all 5 tiers (common/rare/epic/legendary/mythic).

## What Was Built

### Task 1: recharts install + rarity CSS keyframes
- Installed `recharts@3.8.1` into `admin/frontend`
- Appended 5 rarity border classes to `app.css` with full keyframe animations:
  - `.rarity-common` — static gray border
  - `.rarity-rare` — 3s blue breathing pulse
  - `.rarity-epic` — 2.5s purple glow pulse
  - `.rarity-legendary` — 2s gold shimmer (3-keyframe color sweep)
  - `.rarity-mythic` — 1.5s red particle multi-shadow dance
- Added `.xp-bar-fill` gradient and `.star-progress-track` / `.star-progress-fill` SVG classes

### Task 2: CharacterCard component
Created `admin/frontend/app/components/character-card.tsx` with:

1. **Rarity border wrapper** — outer `<div>` applies the appropriate `rarity-*` class
2. **Header row** — agent name, rarity badge (color-coded), ELO badge, level badge
3. **XP bar** — custom gradient fill div showing `xp % (level*100)` progress
4. **Star display** — 5 star icons + SVG arc showing progress to next star gate (or crown at max)
5. **Stat pentagon** — recharts `RadarChart` with `PolarGrid`, `PolarAngleAxis`, `Radar` — always renders even with all-zero stats
6. **Shell + Intelligence** — two-column grid with shell name and primary model
7. **Skills** — up to `skill_slots` skills with success-rate mini progress bars
8. **Supports** — list with measured_impact in success color
9. **Equipment** — 2-column grid for up to 6 slots
10. **Specialties** — up to 3 badge pills (section omitted if empty)
11. **Full null skeleton** — when both `rpg` and `workshop` are null, shows forge prompt

## Exports

- `CharacterCard` — main component function
- `RpgStats` — interface (consumed by Plan 03)
- `WorkshopData` — interface (consumed by Plan 02/03)
- `CharacterCardProps` — prop interface

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Progress component lacks indicatorClassName**
- **Found during:** Task 2
- **Issue:** shadcn Progress component in this codebase does not accept `indicatorClassName` prop — uses `ProgressPrimitive.Indicator` with hardcoded className
- **Fix:** Replaced Progress component with custom `<div>` wrapper (relative container + absolute fill div) using `xp-bar-fill` class directly
- **Files modified:** `admin/frontend/app/components/character-card.tsx`
- **Commit:** 6503c66

No other deviations — plan executed cleanly.

## Verification Results

- `recharts` in package.json: `"recharts": "^3.8.1"` ✓
- Rarity CSS class count in app.css: 13 matches ✓
- Export count in character-card.tsx (CharacterCard + RpgStats + WorkshopData): 3 ✓
- TS errors mentioning character-card: 0 ✓
- RadarChart import from 'recharts': present ✓
- All 5 RARITY_CLASS keys: present ✓

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | 334eaaa | chore(27-01): install recharts and add rarity border CSS keyframes |
| 2 | 6503c66 | feat(27-01): build CharacterCard component with stat pentagon and rarity border |

## Self-Check: PASSED

- `admin/frontend/app/components/character-card.tsx` exists ✓
- `admin/frontend/app/app.css` has rarity classes ✓
- Both commits present in git log ✓
- Zero TS errors in character-card.tsx ✓
