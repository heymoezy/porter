---
phase: 34-feedback-telemetry
plan: "00"
subsystem: testing
tags: [playwright, skill-feedback, test-scaffold, fbk]

requires: []
provides:
  - Playwright test scaffold for FBK-01 through FBK-05 with all tests skipped pending wave implementations
affects: [34-01, 34-02, 34-03, 34-04]

tech-stack:
  added: []
  patterns:
    - "test.describe.configure({ mode: serial }) for DB-dependent sequential test groups"
    - "execSync psql column checks for schema verification in Playwright tests"
    - "page.evaluate() for authenticated admin API calls within Playwright browser context"

key-files:
  created:
    - tests/skill-feedback.spec.js
  modified: []

key-decisions:
  - "Tests skipped with wave-specific TODO comments so enabling them requires only removing test.skip(true, ...) — no logic changes needed"
  - "psql execSync approach for DB column checks matches Phase 32 test patterns for schema verification"
  - "FBK-03 UI test targets data-feedback attributes and title attributes as flexible selectors tolerant of implementation details"

patterns-established:
  - "Pattern: serial test group configure + test.describe nesting for inter-related DB + API + UI tests in a single spec file"
  - "Pattern: loginAdmin() helper reused across all describe blocks (same as skill-pack-explorer.spec.js)"

requirements-completed: [FBK-01, FBK-02, FBK-03, FBK-04, FBK-05]

duration: 2min
completed: 2026-04-02
---

# Phase 34 Plan 00: Feedback Telemetry Test Scaffold Summary

**Playwright test scaffold with 9 skipped stubs covering all 5 FBK requirements — DB schema, feedback API, effectiveness endpoints, and admin UI verification targets**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-02T17:57:25Z
- **Completed:** 2026-04-02T17:59:00Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments

- Created `tests/skill-feedback.spec.js` with 5 `test.describe` blocks, one per FBK requirement
- 9 test stubs covering DB column checks (FBK-01/02), API endpoint validation (FBK-03/04), and UI element assertions (FBK-05)
- All tests skipped with wave-specific TODO comments pointing to the correct implementation wave
- File parses cleanly with no syntax errors

## Task Commits

1. **Task 1: Create Playwright test scaffold** - `e783661` (test)

**Plan metadata:** (pending final commit)

## Files Created/Modified

- `tests/skill-feedback.spec.js` - 302-line Playwright scaffold with 9 test stubs for FBK-01 through FBK-05

## Decisions Made

- Tests use `test.skip(true, 'TODO: ...')` with wave-specific messages rather than `test.todo()` — this makes enabling tests a single-line removal with no structural changes needed
- psql execSync used for FBK-01/02 DB column checks (same approach as other Phase 32+ tests)
- FBK-03 UI test uses flexible locator selectors (data-feedback, title, aria-label) to tolerate multiple valid implementation approaches
- FBK-04 API tests use `page.evaluate()` to fire admin API calls from within an authenticated browser context rather than separate `request` contexts (avoids auth cookie plumbing complexity)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Test scaffold ready for Phase 34 Wave 1 (migrate-fbk-v1.ts DB migration)
- Remove `test.skip(true, ...)` from FBK-01 and FBK-02 describe blocks after Wave 1 ships
- Remove `test.skip(true, ...)` from FBK-03 after Wave 2 (feedback.ts route + chat-panel.tsx thumbs) ships
- Remove `test.skip(true, ...)` from FBK-04 after Wave 3 (admin effectiveness endpoints) ships
- Remove `test.skip(true, ...)` from FBK-05 after Wave 4 (admin UI extensions) ships

---
*Phase: 34-feedback-telemetry*
*Completed: 2026-04-02*
