---
phase: 02-memory-v2
plan: 03
subsystem: memory
tags: [sqlite, fts5, sse, injection, scoping, privacy]

# Dependency graph
requires:
  - phase: 02-memory-v2/02-01
    provides: Cortex removed, memories table live with full V2 schema
  - phase: 02-memory-v2/02-02
    provides: RECALL_NOISE_BLACKLIST, _mem_extract_signals re-enabled with noise filter
provides:
  - Tiered memory injection (directives > concepts > episodes) with token cap
  - _estimate_tokens, _get_directives, _get_concepts, _get_recent_episodes helper functions
  - _project_is_private reads metadata.private from projects table
  - Privacy toggle API: POST /api/projects/<id>/privacy
  - Cross-project promotion detection emitting recall:cross_project_match SSE
affects:
  - 02-04 (memory feed UI — injection and SSE events now wired)
  - 02-05 (FTS5 session search — same injection path)
  - Any dispatch path using _build_context_suffix (now gets token-budgeted tiered injection)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Frozen snapshot injection: directives > concepts > episodes, hard token cap"
    - "Privacy isolation: _project_is_private gates global memory access per project"
    - "Cross-project promotion: SSE event when FTS5 finds pattern in 2+ projects"

key-files:
  created: []
  modified:
    - porter.py

key-decisions:
  - "token_cap defaults to 500 but _build_context_suffix overrides with memory_budget (20% of total context budget) to prevent conflict between two budget systems"
  - "_mem_inject_for_dispatch returns a plain string (not tuple) — _build_context_suffix updated to match"
  - "_get_concepts uses FTS5 relevance search when query > 3 chars, falls back to importance DESC ordering"
  - "Cross-project promotion threshold is 1+ other projects matching (2+ total) — lightweight, SSE suggestion only (no auto-promote)"
  - "Privacy isolation: global memories skipped for private projects at all three tiers (directives, concepts, episodes)"

patterns-established:
  - "Pattern: Tiered token-budgeted injection — _estimate_tokens (len//4) for cap enforcement, break on budget exhaust"
  - "Pattern: Privacy gate — _project_is_private queried once per dispatch, result passed to all tier loops"

requirements-completed:
  - MEM-01
  - MEM-03

# Metrics
duration: 5min
completed: 2026-03-20
---

# Phase 02 Plan 03: Memory Injection + Scope Isolation Summary

**Tiered memory injection (directives > concepts > episodes) with 500-token cap, project privacy isolation, and cross-project promotion detection via FTS5**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-20T16:14:28Z
- **Completed:** 2026-03-20T16:19:40Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Rewrote `_mem_inject_for_dispatch` with frozen snapshot tiered priority: directives always first, concepts by FTS5 relevance, episodes only if under 80% budget
- Added `_estimate_tokens` (len//4), `_get_directives`, `_get_concepts`, `_get_recent_episodes` helper functions with proper scope filtering and exception handling
- Implemented `_project_is_private` reading `metadata.private` from projects table
- Added `POST /api/projects/<id>/privacy` to toggle project privacy flag
- Added cross-project promotion detection in `_mem_insert`: fires `recall:cross_project_match` SSE when pattern found in 2+ projects
- `_build_context_suffix` now passes `token_cap=memory_budget` to prevent dual-budget conflict

## Task Commits

1. **Task 1: Rewrite _mem_inject_for_dispatch with tiered priority and token cap** - `011ccb9` (feat)
2. **Task 2: Implement scope isolation with privacy toggle and cross-project promotion** - `e1ffb31` (feat)

**Plan metadata:** (see final metadata commit)

## Files Created/Modified

- `/home/lobster/documents/porter/porter.py` - All changes: helper functions, rewritten injection, privacy check, privacy API endpoint, cross-project detection

## Decisions Made

- `_mem_inject_for_dispatch` return type changed from `(block, ids)` tuple to plain string — `_build_context_suffix` updated to match. The injected ID tracking was redundant since `_mem_record_injection` is called inline per memory during injection.
- `_get_concepts` uses FTS5 when query > 3 chars, with regex sanitization before building FTS5 query terms. Falls back to importance/recency ordering.
- Privacy check (`_project_is_private`) queried once per dispatch call, not per memory — avoids repeated DB round trips.

## Deviations from Plan

None - plan executed exactly as written. The existing `_mem_inject_for_dispatch` was a tuple-returning function; the rewrite to return a plain string was an explicit plan requirement and not a deviation.

## Issues Encountered

None - both patches applied cleanly and Porter restarted with 5/5 self-checks passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Memory injection is now fully wired: tiered priority, token budgeting, scope isolation, privacy toggle
- `recall:cross_project_match` SSE event is live — ready for UI to surface promotion suggestions (02-05)
- Privacy API endpoint `/api/projects/<id>/privacy` is available — ready for project settings UI to expose it

---
*Phase: 02-memory-v2*
*Completed: 2026-03-20*

## Self-Check: PASSED

All files, commits, and key functions verified present.
