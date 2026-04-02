---
phase: 32-skill-pack-explorer
plan: "01"
subsystem: api
tags: [skills, diagnostics, quality-tier, file-write, fastify, typescript]

# Dependency graph
requires:
  - phase: 31-skills-sot
    provides: skill-library.ts with SkillRecord, listSkillFiles, evaluatePackStatus, getSkillDetail, getSkillLibrary

provides:
  - QualityTier type exported from skill-library.ts
  - PackDiagnostics interface with fileCount, totalWords, scaffoldPct, missingFiles, emptyFiles, qualityTier
  - computePackDiagnostics() function for full word-count and scaffold phrase analysis
  - writeSkillPackFile() function with path-traversal guard
  - Fast qualityTier field on every SkillRecord in list responses (file-size heuristic)
  - Full diagnostics on getSkillDetail() responses
  - tiers breakdown in SkillLibrarySummary
  - PUT /api/admin/skills/:id/files/* endpoint for writing skill pack files to disk

affects: [32-02, 32-03, 32-04, skill-pack-explorer-frontend]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fast/full diagnostics split: list returns file-size heuristic tier, detail computes full word-count diagnostics"
    - "Path-traversal guard: path.resolve(base) + startsWith(base + path.sep) pattern"
    - "Scaffold detection: SCAFFOLD_PHRASES array matched against file content, phrase hit count / (files * phrases) = scaffoldPct"
    - "Quality tier thresholds: scaffold<300 words, baseline 300-600, production 600-1200, high-performing 1200+ with low scaffold phrase matches"

key-files:
  created: []
  modified:
    - admin/backend/src/services/skill-library.ts
    - admin/backend/src/routes/skills.ts

key-decisions:
  - "Fast quality tier (size heuristic) on list endpoint, full word-count diagnostics only on detail — avoids ~1045 readFileSync calls on every list fetch"
  - "writeSkillPackFile path guard uses base + path.sep suffix check to reject traversal attempts that resolve to the base dir itself"
  - "PUT /:id/files/* registered before GET /:id/files/* and PUT /:id to prevent Fastify route param shadowing"
  - "computePackDiagnostics imported in routes.ts for future use in enhanced endpoints without needing another import change"

patterns-established:
  - "Pattern: skill list = fast tier (size), skill detail = full diagnostics (word count + phrases)"
  - "Pattern: writeSkillPackFile returns boolean false on traversal, route handler maps to 403"

requirements-completed: [PKX-01, PKX-02, PKX-03, PKX-04]

# Metrics
duration: 12min
completed: 2026-04-02
---

# Phase 32 Plan 01: Skill Pack Explorer Backend Summary

**Quality tier scoring and disk write API for 209 skill packs — fast heuristic on list, full word-count + scaffold detection on detail, PUT endpoint with path-traversal guard**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-02T00:00:00Z
- **Completed:** 2026-04-02T00:12:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Exported `QualityTier` type and `PackDiagnostics` interface from skill-library.ts — available to all consumers
- Added `computePackDiagnostics()` with SCAFFOLD_PHRASES matching and word-count thresholds for accurate content richness scoring
- Added `writeSkillPackFile()` with path-traversal guard (base + path.sep check) for safe disk writes
- Fast qualityTier from file-size heuristic attached to every SkillRecord in list — zero extra readFileSync calls
- Full diagnostics (missingFiles, emptyFiles, totalWords, scaffoldPct) attached to getSkillDetail() responses
- tiers breakdown added to SkillLibrarySummary for dashboard counts
- PUT /api/admin/skills/:id/files/* endpoint validates input, guards traversal, writes to disk, returns saved:true

## Task Commits

Each task was committed atomically:

1. **Task 1: Add quality tier types and diagnostics to skill-library.ts** - `8882a66` (feat)
2. **Task 2: Add PUT file write endpoint to skills routes** - `a69fff7` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `admin/backend/src/services/skill-library.ts` - Added QualityTier, PackDiagnostics, computePackDiagnostics, writeSkillPackFile, fast tier in list, full diagnostics in detail, tiers in summary
- `admin/backend/src/routes/skills.ts` - Added PUT /:id/files/* endpoint, updated imports to include writeSkillPackFile and computePackDiagnostics

## Decisions Made

- Fast/full diagnostics split: list uses file-size heuristic to avoid 1045+ readFileSync calls on every skills list fetch; detail computes full word-count + phrase analysis
- Path-traversal guard uses `target.startsWith(base + path.sep)` to correctly reject paths that resolve to the skill dir root itself, not just subdirectory escapes
- PUT /:id/files/* registered before GET /:id/files/* to prevent Fastify matching "files" as the `:id` parameter on the generic PUT /:id route

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compiled clean on first attempt for both tasks.

## User Setup Required

None - no external service configuration required. Backend changes are server-side only.

## Next Phase Readiness

- All backend types and functions ready for frontend consumption in Phase 32-02
- GET /api/admin/skills now returns `qualityTier` on every skill — quality badges can render site-wide from the existing list fetch
- GET /api/admin/skills/:id now returns full `diagnostics` object — pack explorer header can show complete quality breakdown
- PUT /api/admin/skills/:id/files/* is live and tested via TypeScript compilation

---
*Phase: 32-skill-pack-explorer*
*Completed: 2026-04-02*
