---
phase: 02-memory-v2
plan: "00"
subsystem: testing
tags: [python, memory-v2, test-scaffolding, wave-0]

# Dependency graph
requires: []
provides:
  - "Five Wave 0 behavioral test scripts at /tmp/ covering MEM-01 through MEM-04"
  - "/tmp/test_grep_zero.py — cortex-zero assertions for MEM-01 (used by 02-01 verify)"
  - "/tmp/test_mem_noise.py — noise filter assertions for MEM-01 (used by 02-02 verify)"
  - "/tmp/test_recall_sse.py — recall:event SSE assertions for MEM-02 (used by 02-04 verify)"
  - "/tmp/test_scope_isolation.py — scope isolation assertions for MEM-03 (used by 02-03 verify)"
  - "/tmp/test_session_search.py — session search assertions for MEM-04 (used by 02-05 verify)"
affects: [02-01, 02-02, 02-03, 02-04, 02-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 test scaffolding: write tests first at /tmp/, run against live porter.py for behavioral verification"
    - "Source-code assertion tests: tests read porter.py source to verify structure/patterns exist before runtime tests"
    - "Runtime DB tests: tests connect directly to porter.db for state verification without HTTP auth"

key-files:
  created:
    - /tmp/test_grep_zero.py
    - /tmp/test_mem_noise.py
    - /tmp/test_recall_sse.py
    - /tmp/test_scope_isolation.py
    - /tmp/test_session_search.py
  modified: []

key-decisions:
  - "Wave 0 tests are /tmp/-only — not committed to git per VALIDATION.md (porter.py too large for diff tracking)"
  - "Tests use two verification modes: source-code assertions (grep porter.py) and runtime DB assertions (sqlite3 direct)"
  - "HTTP tests accept 401/400 as valid responses — endpoint existence is verified, not authenticated behavior"

patterns-established:
  - "Pattern 1: Source-code assertion tests — read porter.py and assert structure before implementation exists"
  - "Pattern 2: DB isolation test — insert test row, verify scope isolation via SQL query, cleanup after"
  - "Pattern 3: Permissive HTTP tests — accept auth errors as proof of endpoint existence (not 404)"

requirements-completed: [MEM-01, MEM-02, MEM-03, MEM-04]

# Metrics
duration: 3min
completed: 2026-03-20
---

# Phase 2 Plan 00: Wave 0 Test Scaffolding Summary

**Five behavioral test scripts at /tmp/ covering the full Memory V2 requirement set (MEM-01 through MEM-04), ready to gate plans 02-01 through 02-05**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-20T15:32:18Z
- **Completed:** 2026-03-20T15:34:49Z
- **Tasks:** 2
- **Files modified:** 5 (all at /tmp/)

## Accomplishments
- Created test_grep_zero.py — 6 assertions verifying cortex deletion and Memory V2 function presence
- Created test_mem_noise.py — 4 assertions verifying noise filter (RECALL_NOISE_BLACKLIST, no signals from login/health)
- Created test_recall_sse.py — 4 assertions verifying recall:event SSE emission and feed API
- Created test_scope_isolation.py — 4 assertions verifying project scope isolation and tiered injection labels
- Created test_session_search.py — 4 assertions verifying session-search endpoint and dispatch wiring

## Task Commits

Tasks 1 and 2 are captured in the plan metadata commit (no porter repo files were modified — all artifacts are at /tmp/ per VALIDATION.md).

**Plan metadata:** captured in final docs commit

_Note: /tmp/ test scripts are not committed to git per project conventions (porter.py is too large for diff tracking; tests run in-process against live porter)._

## Files Created/Modified
- `/tmp/test_grep_zero.py` - Source-code assertions for cortex deletion and Memory V2 function presence (MEM-01)
- `/tmp/test_mem_noise.py` - Noise filter assertions: HTTP login/health produce no signals, blacklist exists (MEM-01)
- `/tmp/test_recall_sse.py` - SSE recall:event emission and feed API assertions (MEM-02)
- `/tmp/test_scope_isolation.py` - DB scope isolation and tiered injection label assertions (MEM-03)
- `/tmp/test_session_search.py` - Session search endpoint and dispatch wiring assertions (MEM-04)

## Decisions Made
- Wave 0 tests are /tmp/-only — not committed to git per VALIDATION.md note about porter.py being too large for diff tracking
- Tests use dual-mode verification: source-code assertions (grep porter.py source) and direct DB assertions (sqlite3 connect to porter.db)
- HTTP tests accept 401/400 as valid — endpoint existence is what matters at this stage, not authenticated behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All five Wave 0 test scripts exist at /tmp/ and are syntactically valid
- Plans 02-01 through 02-05 can now reference these scripts in their verify blocks
- Tests will initially fail (red) for runtime checks — that's expected per Wave 0 design
- Source-code assertion tests will pass once plans 02-01 through 02-05 implement the features

---
*Phase: 02-memory-v2*
*Completed: 2026-03-20*
