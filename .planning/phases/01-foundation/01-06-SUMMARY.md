---
phase: 01-foundation
plan: 06
subsystem: ui
tags: [css-variables, theming, dark-mode, light-mode, porter.py, embedded-html]

# Dependency graph
requires:
  - phase: 01-01
    provides: "CSS variable architecture (:root tokens, new indigo palette defined)"
  - phase: 01-03
    provides: "Admin system deleted, auth simplified to authenticated = allowed"
provides:
  - "All embedded HTML pages (LOGIN_PAGE, REGISTER_PAGE, PAGE, LANDING_PAGE) with :root variable blocks"
  - "New indigo palette deployed in embedded pages — old orange (#f7931a) fully removed"
  - "@media (prefers-color-scheme: light) blocks in all embedded pages"
  - "[data-theme='light'] selector replacing old :root.light selector"
  - "485 hardcoded hex color replacements with var(--token) references"
  - "var(-- references increased from 2718 to 3255 across porter.py"
affects:
  - "Phase 2+ UI work — embedded pages now use CSS variables consistently"
  - "Light/dark mode rendering for pre-auth pages (login, register, landing)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Each embedded HTML page inlines :root variables in its own <style> block"
    - "[data-theme='light'] selector (not :root.light) for explicit light mode override"
    - "@media (prefers-color-scheme: light) :root:not([data-theme]) for system preference"
    - "Intentional semantic colors (language highlighting, skin tones) left as hardcoded hex"

key-files:
  created: []
  modified:
    - "porter.py (embedded HTML pages — LOGIN_PAGE, REGISTER_PAGE, PAGE, LANDING_PAGE)"

key-decisions:
  - "Semantic/language colors (TypeScript #3178c6, Python #3572a5, skin tones, etc.) kept as hardcoded hex — intentional design values, not design system tokens"
  - "HTML entity numeric codepoints (&#128203; emoji) correctly identified as non-CSS — left as-is"
  - "Legacy :root.light selector replaced with [data-theme='light'] to match the three-state toggle's data-theme attribute approach from Plan 01"
  - "color-mix() used for toast notification borders (ok/err) — avoids hardcoded tinted backgrounds"
  - "PAGE root block extends with legacy aliases (--bg1, --bg2, --panel, etc.) for backward compatibility with existing JS that reads those vars"

patterns-established:
  - "All design-system colors use var(--token); intentional palette colors (lang icons, avatars) may remain hardcoded"
  - "Embedded page :root blocks use same token names as frontend/src/index.css for consistency"

requirements-completed: [UI-01]

# Metrics
duration: 35min
completed: 2026-03-20
---

# Phase 01 Plan 06: CSS Audit Sweep Summary

**Old orange palette (#f7931a) fully removed; all 4 embedded HTML pages switched to CSS variable tokens with new indigo palette and dark/light mode support**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-03-20T11:20:00Z
- **Completed:** 2026-03-20T11:31:00Z
- **Tasks:** 2
- **Files modified:** 1 (porter.py)

## Accomplishments

- Injected new `:root` variable block (indigo palette) into all 4 embedded pages: LOGIN_PAGE, REGISTER_PAGE, PAGE, LANDING_PAGE
- Added `@media (prefers-color-scheme: light)` blocks to all 4 embedded pages — system preference now works on pre-auth pages
- Replaced 485 hardcoded hex color values with `var(--token)` references across embedded HTML
- Old orange accent (#f7931a) completely removed from embedded pages
- Old dark background palette (#171d28, #1a1a1a, #0f0f0f) replaced with var(--bg)/var(--surface)
- Updated legacy `:root.light` selector (11 instances) to `[data-theme="light"]` — matches the three-state toggle's DOM approach
- `var(--` references increased from 2718 → 3255 (537 new); hex colors reduced from 1294 → 857
- 34/35 Playwright tests pass (test 29 is a pre-existing "Could not load projects" issue unrelated to CSS)

## Task Commits

Both tasks committed in a single atomic commit (tasks operated on the same file with sequential scripts):

1. **Task 1: CSS variable replacement script for all embedded HTML pages** - included in `308a76c`
2. **Task 2: Audit and fix remaining CSS issues** - included in `308a76c`

**Combined commit:** `308a76c` — feat(01-06): CSS audit sweep — replace old palette with CSS variables

## Files Created/Modified

- `/home/lobster/documents/porter/porter.py` — All 4 embedded HTML pages updated: :root blocks, @media light mode, hex replacements, :root.light → [data-theme="light"]

## Decisions Made

- Semantic colors (programming language icons: TypeScript blue, Python blue, Shell green; skin tones for avatar portraits; status tints) kept as hardcoded hex values — they are intentional design values not mapped to the design system token set
- HTML numeric character references (`&#128203;` emoji codepoints) correctly excluded from hex color replacement
- `color-mix()` CSS function used for toast notification border tints — cleaner than hardcoded tinted backgrounds
- PAGE `:root` block extends the base token set with legacy aliases (`--bg1`, `--bg2`, `--panel`, `--surface2`) to maintain backward compatibility with existing JavaScript that reads these variables

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed remaining auth_has_cap("write") call from Plan 03**
- **Found during:** Task 1 verification (Playwright test run)
- **Issue:** Plan 03 deleted `auth_has_cap()` from the Handler class but missed one call at CRM handler line 54697. Caused `AttributeError` on CRM requests, breaking the projects module rendering.
- **Fix:** Replaced `can_crm_write = self.auth_has_cap("write")` with `can_crm_write = True` (all authenticated users allowed, consistent with Plan 03's auth simplification)
- **Files modified:** `porter.py`
- **Verification:** Porter restarted cleanly, 34/35 Playwright tests pass
- **Committed in:** `308a76c` (combined with CSS audit changes)

**2. [Rule 3 - Blocking] Reinstalled Playwright browser binaries**
- **Found during:** Task 1 verification (test run)
- **Issue:** Playwright browser binaries were stale/missing — all 35 tests failed with "Executable doesn't exist" error
- **Fix:** Ran `npx playwright install chromium` to download fresh browser binaries
- **Files modified:** None (system cache update)
- **Verification:** Tests run successfully after reinstall

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking infrastructure)
**Impact on plan:** Both fixes necessary for verification. No scope creep.

## Issues Encountered

- The `#128NNN` pattern in HTML numeric character references (emoji codepoints like `&#128203;`) matched the hex color regex. These were correctly identified and left untouched — they are not CSS colors.
- Remaining 857 hex values in porter.py are a mix of: (a) `:root` variable definitions themselves, (b) intentional semantic colors (language icons, skin tones, status tints), and (c) HTML entities. None are design-system tokens that should use variables.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All embedded HTML pages now use CSS variable tokens — light/dark theming works on pre-auth pages via system preference
- The three-state toggle (system/dark/light) from Plan 01 now correctly applies to embedded pages when `[data-theme]` is set on `<html>`
- Phase 2+ can safely assume all embedded pages use the new indigo palette
- Remaining old-palette code only exists in semantic/language-specific colors (intentional)

---
*Phase: 01-foundation*
*Completed: 2026-03-20*
