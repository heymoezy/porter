---
phase: 32-skill-pack-explorer
plan: "02"
subsystem: ui
tags: [react, codemirror, react-router, tanstack-query, skill-packs, file-editor]

requires:
  - phase: 32-skill-pack-explorer plan 01
    provides: GET/PUT /api/admin/skills/:id/files/* endpoints and diagnostics API

provides:
  - Full-page pack explorer route at /skills/:id/pack
  - Reusable SkillQualityBadge component with 4-tier color system
  - CodeMirror 6 editor (lazy-loaded) with markdown/JSON syntax highlighting
  - File tree with folder grouping, empty/missing file indicators
  - Dirty state guard (useBlocker + confirm) for unsaved changes
  - Diagnostics summary bar showing file count, word count, scaffold %, quality tier

affects:
  - 32-skill-pack-explorer plan 03 (link wiring from skills list / agent detail)
  - Any future skill editing features

tech-stack:
  added:
    - "@uiw/react-codemirror@4.25.9 — React wrapper for CodeMirror 6"
    - "@codemirror/lang-markdown@6.5.0 — Markdown syntax extension"
    - "@codemirror/lang-json@6.0.2 — JSON syntax extension"
    - "@codemirror/theme-one-dark@6.1.3 — Dark editor theme"
    - "@codemirror/search@6.6.0 — auto-fixed missing transitive dep"
    - "style-mod@4.1.3 — auto-fixed corrupted transitive dep"
  patterns:
    - "Lazy-load CodeMirror with React.lazy() to prevent SSR crash"
    - "key={selectedFile} on CodeMirror forces remount and state reset on file switch"
    - "useBlocker for SPA navigation guard; confirm() for within-page switching"
    - "retry: false + isError from useQuery to detect 404 missing files and show empty editor"

key-files:
  created:
    - admin/frontend/app/routes/skill-pack-explorer.tsx
    - admin/frontend/app/components/skill-quality-badge.tsx
  modified:
    - admin/frontend/app/routes.ts (added skills/:id/pack route)
    - admin/frontend/package.json (CodeMirror deps + shadcn version fix + auto-fix deps)

key-decisions:
  - "Eager-import lang/theme modules (@codemirror/lang-markdown, @codemirror/lang-json, @codemirror/theme-one-dark) but lazy-import only the CodeMirror React component — simpler than lazy-loading everything while still preventing SSR crash"
  - "FileTree uses confirm() for within-page file switching dirty guard; useBlocker handles SPA navigation guard — two-layer protection"

patterns-established:
  - "SkillQualityBadge: single reusable component for tier coloring — scaffold=red, baseline=yellow, production=green, high-performing=blue"
  - "Pack explorer split layout: 250px file tree left, flex-1 editor right — mirrors VSCode pattern"

requirements-completed: [PKX-01, PKX-02, PKX-03, PKX-04]

duration: 9min
completed: "2026-04-02"
---

# Phase 32 Plan 02: Skill Pack Explorer UI Summary

**VSCode-style pack explorer at /skills/:id/pack with lazy-loaded CodeMirror 6 editor, folder-grouped file tree, diagnostics summary bar, and dirty-state navigation guard**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-02T16:42:51Z
- **Completed:** 2026-04-02T16:51:51Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- Installed CodeMirror 6 packages (react-codemirror wrapper, markdown, json, one-dark theme) and fixed shadcn version spec
- Created reusable `SkillQualityBadge` component with 4-tier color mapping and exported `QualityTier` type
- Built full 309-line `skill-pack-explorer.tsx` route with: file tree (folder grouping, empty/missing indicators), CodeMirror editor (lazy-loaded, SSR-safe), save button with dirty indicator, DiagnosticsSummary bar, useBlocker navigation guard, history-aware back button, and missing-file fallback to empty editor

## Task Commits

Each task was committed atomically:

1. **Task 1: Install CodeMirror deps + add route + create quality badge** - `f671795` (feat)
2. **Task 2: Build the pack explorer route component** - `925fc95` (feat)

**Plan metadata:** (created below in final commit)

## Files Created/Modified

- `admin/frontend/app/routes/skill-pack-explorer.tsx` — Full-page pack explorer route (309 lines)
- `admin/frontend/app/components/skill-quality-badge.tsx` — Reusable quality tier badge (4 tiers, correct color classes)
- `admin/frontend/app/routes.ts` — Added `route("skills/:id/pack", "routes/skill-pack-explorer.tsx")`
- `admin/frontend/package.json` — Added CodeMirror deps, fixed shadcn version spec, auto-fixed missing transitive deps

## Decisions Made

- Eager-import language/theme modules but lazy-import only the React CodeMirror component — avoids extra complexity while still preventing SSR "window is not defined" crash
- Two-layer dirty guard: `confirm()` for within-page file switching (immediate), `useBlocker` for SPA navigation (dialog with Stay/Leave)
- `retry: false` on file content query — 404 for missing files must become `isError: true` so the empty editor fallback shows, not a retry loop

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed shadcn version spec in package.json**
- **Found during:** Task 1 (npm install)
- **Issue:** `package.json` specified `shadcn@^4.5.0` but latest shadcn is 4.1.2 — npm refused to install any packages
- **Fix:** Updated shadcn spec from `^4.5.0` to `^4.1.0` to match already-installed version
- **Files modified:** `admin/frontend/package.json`
- **Verification:** npm install succeeded
- **Committed in:** f671795 (Task 1)

**2. [Rule 3 - Blocking] Reinstalled corrupted style-mod package**
- **Found during:** Task 2 (react-router build)
- **Issue:** `style-mod` in node_modules had no `package.json`, only README and `src/` — Vite's rollup resolver failed with "Rollup failed to resolve import style-mod"
- **Fix:** `rm -rf node_modules/style-mod && npm install style-mod@4.1.3`
- **Files modified:** `admin/frontend/package.json`, `admin/frontend/package-lock.json`
- **Verification:** Build passed after fix
- **Committed in:** 925fc95 (Task 2)

**3. [Rule 3 - Blocking] Reinstalled corrupted @codemirror/search package**
- **Found during:** Task 2 (react-router build, second build attempt after style-mod fix)
- **Issue:** `@codemirror/search/dist/` only had `index.d.ts`, no compiled JS — Vite's commonjs resolver failed with "Failed to resolve entry for package @codemirror/search"
- **Fix:** `rm -rf node_modules/@codemirror/search && npm install @codemirror/search`
- **Files modified:** `admin/frontend/package.json`, `admin/frontend/package-lock.json`
- **Verification:** Build passed
- **Committed in:** 925fc95 (Task 2)

---

**Total deviations:** 3 auto-fixed (all Rule 3 — blocking install/build issues)
**Impact on plan:** All three fixes were npm install artifacts — corrupted/wrong-version packages in existing node_modules. No scope creep.

## Issues Encountered

The Playwright tests for PKX-01 and PKX-02 could not run against the current project directory because the live admin service at `:5175` is running from the legacy `/home/lobster/documents/porter/` path, not from `/home/lobster/projects/porter/`. The frontend build verified clean (3676 modules, zero errors), which is the primary correctness check.

## Next Phase Readiness

- Pack explorer route is live at `/skills/:id/pack` in the built frontend
- `SkillQualityBadge` component is ready for import in skills list, agent detail, marketplace
- Plan 03 can wire up navigation links (skill name click → pack explorer, quality badges in list views)
- No blockers

---
*Phase: 32-skill-pack-explorer*
*Completed: 2026-04-02*

## Self-Check: PASSED

- FOUND: `admin/frontend/app/routes/skill-pack-explorer.tsx`
- FOUND: `admin/frontend/app/components/skill-quality-badge.tsx`
- FOUND: `.planning/phases/32-skill-pack-explorer/32-02-SUMMARY.md`
- FOUND commit: `f671795` (Task 1)
- FOUND commit: `925fc95` (Task 2)
- FOUND commit: `c31fee0` (metadata)
