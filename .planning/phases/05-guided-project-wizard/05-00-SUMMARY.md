---
phase: 05-guided-project-wizard
plan: "00"
subsystem: testing
tags: [python3, behavioral-tests, wave-0, wizard-api, agent-matching, activity-feed, gsd-mode]

# Dependency graph
requires:
  - phase: 04-agent-autonomy
    provides: activity endpoint pattern (agent_activity table + GET /api/v1/agents/:id/activity)
provides:
  - 6 Python3 stdlib behavioral test scripts at /tmp/ covering PROJ-01 through PROJ-04
  - Wave 0 test baseline: all scripts SKIP before wizard endpoint exists, FAIL on partial, PASS when complete
affects:
  - 05-guided-project-wizard (plans 01-05 will use these scripts as automated verification)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 test pattern: urllib.request, SKIP on 404/503, PASS on correct behavior, FAIL on broken behavior"
    - "Auth handling: try /api/v1/auth/me first; if 401, try_login() with multiple credential fallbacks"
    - "Feature flag guard: 503 response from wizard endpoint treated as SKIP (FEATURE_GUIDED_WIZARD off)"

key-files:
  created:
    - /tmp/test_proj01_wizard_api.py
    - /tmp/test_proj01_detect.py
    - /tmp/test_proj01_approve.py
    - /tmp/test_proj02_agent_match.py
    - /tmp/test_proj03_activity.py
    - /tmp/test_proj04_gsd_mode.py
  modified:
    - .planning/phases/05-guided-project-wizard/05-VALIDATION.md

key-decisions:
  - "Wave 0 test scripts live at /tmp/ only — not committed to git per Phase 2/4 convention"
  - "Feature flag 503 response treated as SKIP — wizard is behind FEATURE_GUIDED_WIZARD flag so tests must not FAIL when flag is off"
  - "gsdMode test (PROJ-04) validates both API acknowledgment in detect response AND persistence in project metadata after approve"
  - "activity test (PROJ-03) creates a fresh project via POST /api/v1/projects if no existing projects found — self-sufficient"
  - "agent matching test uses WEBSITE_RELEVANT_ROLES set with substring matching — tolerates varied role naming conventions"

patterns-established:
  - "SKIP on 404: endpoint not yet implemented (pre-implementation state)"
  - "SKIP on 503: feature flag off (wizard behind FEATURE_GUIDED_WIZARD)"
  - "SKIP on URLError: backend not running — not a test failure"
  - "SKIP on auth failure: backend unreachable in test context — not a test failure"

requirements-completed: [PROJ-01, PROJ-02, PROJ-03, PROJ-04]

# Metrics
duration: 3min
completed: 2026-03-21
---

# Phase 5 Plan 00: Wave 0 Behavioral Tests Summary

**6 Python3 stdlib test scripts covering PROJ-01 to PROJ-04 wizard API behaviors with SKIP/PASS/FAIL tri-state logic**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-21T05:45:10Z
- **Completed:** 2026-03-21T05:48:29Z
- **Tasks:** 2
- **Files modified:** 1 (05-VALIDATION.md); 6 test scripts at /tmp/ (not git-tracked)

## Accomplishments

- Created 4 scripts for PROJ-01/02: wizard endpoint existence, detect classification, approve atomicity, agent-to-type matching
- Created 2 scripts for PROJ-03/04: project activity feed array structure, gsdMode flag persistence through detect + approve
- All 6 scripts exit 0 with [SKIP] against current codebase (wizard endpoint not yet implemented)
- Updated 05-VALIDATION.md with wave_0_complete: true and all 6 checkboxes marked

## Task Commits

Each task was committed atomically:

1. **Task 1: Create PROJ-01 and PROJ-02 test scripts** - `61ce153` (test)
2. **Task 2: Create PROJ-03 and PROJ-04 test scripts** - `ff384aa` (test)

## Files Created/Modified

- `/tmp/test_proj01_wizard_api.py` - POST /api/v1/projects/wizard endpoint existence + 400 validation + detect returns isProject
- `/tmp/test_proj01_detect.py` - detect action classifies bakery message as isProject=true with clarity; hello as isProject=false
- `/tmp/test_proj01_approve.py` - approve action creates project atomically; verifies projectId exists via GET
- `/tmp/test_proj02_agent_match.py` - propose action returns agents array with name/role/whyChosen; at least one website-relevant role
- `/tmp/test_proj03_activity.py` - GET /api/v1/projects/:id/activity returns JSON array; each item has event_type/summary/created_at
- `/tmp/test_proj04_gsd_mode.py` - gsdMode flag acknowledged in detect response + persisted in project metadata after approve
- `.planning/phases/05-guided-project-wizard/05-VALIDATION.md` - wave_0_complete: true; all 6 Wave 0 checkboxes marked

## Decisions Made

- Wave 0 test scripts live at /tmp/ only — not committed to git (Phase 2/4 convention already established in STATE.md)
- 503 response from wizard endpoint treated as SKIP — wizard is behind FEATURE_GUIDED_WIZARD flag so tests remain valid when flag is off
- gsdMode test checks both detect response acknowledgment and project metadata persistence after approve — comprehensive coverage for PROJ-04
- activity test auto-creates a fresh project if none exist — self-sufficient test that doesn't depend on pre-existing data

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All 6 Wave 0 test scripts ready for use by plans 05-01 through 05-05
- Scripts will automatically transition from SKIP to FAIL (partial) to PASS as wizard endpoint is implemented
- Activity endpoint test (PROJ-03) reuses the pattern established in Phase 4 agent activity test

---
*Phase: 05-guided-project-wizard*
*Completed: 2026-03-21*

## Self-Check: PASSED

- FOUND: /tmp/test_proj01_wizard_api.py
- FOUND: /tmp/test_proj01_detect.py
- FOUND: /tmp/test_proj01_approve.py
- FOUND: /tmp/test_proj02_agent_match.py
- FOUND: /tmp/test_proj03_activity.py
- FOUND: /tmp/test_proj04_gsd_mode.py
- FOUND commit: 61ce153 (Task 1)
- FOUND commit: ff384aa (Task 2)
- All 6 scripts exit 0 with [SKIP] output verified
