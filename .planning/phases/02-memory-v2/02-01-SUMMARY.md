---
phase: 02-memory-v2
plan: 01
subsystem: database
tags: [cortex-removal, memory-v2, sqlite, cleanup, porter-py]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Phase 1 disabled cortex with early-return guards — deletion safe
  - phase: 02-00
    provides: Wave-0 test scaffolding including test_grep_zero.py
provides:
  - Cortex-free porter.py with Memory V2 as sole memory system
  - All ~30 _cortex_* function definitions removed
  - cortex_memories table CREATE and indexes removed from _db_init()
  - All /api/cortex/* endpoint handlers removed
  - Cortex JS module (~56KB) removed from embedded frontend
  - FTS5 rebuild safety added to startup
affects:
  - 02-02 (noise filter — can now wire _mem_extract_signals without cortex interference)
  - 02-03 (injection — clean dispatch paths, no cortex intermediary)
  - 02-05 (feed UI — cortex-module HTML removed, memory-module is sole UI)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Patch scripts at /tmp/patch_*.py for all porter.py modifications (file too large for Edit tool)"
    - "String-marker-based deletion (never line numbers — lines shift with each patch)"
    - "Multiple patch scripts for staged cleanup: patch main block, cleanup helpers, fix breakage"
    - "Pre-commit hook nav-syntax-gate.sh validates JS syntax before every commit"

key-files:
  created: []
  modified:
    - porter.py (removed ~194KB of cortex code, file went from 3136KB to 2942KB)

key-decisions:
  - "All functional cortex references removed — zero _cortex_ functions, zero cortex_memories SQL, zero /api/cortex/ endpoints"
  - "JS cortex UI module (~56KB) removed entirely — loadCortexTab, cortex graph canvas, renderCortexMemories all deleted"
  - "Bridge:dispatch SSE refresh handlers preserved inside reconstructed SSE subscription block (cortex:update handler stripped)"
  - "cortex_ids variable in session code renamed to _legacy_ids (functional noop, empty list)"
  - "FTS5 rebuild safety inserted after _migrate_to_memory_v2 call in _db_init"
  - "4 remaining 'cortex' string references are acceptable: 2 in comments, 1 in JS noise filter, 1 in self-heal log message"

patterns-established:
  - "Multi-pass patching: first pass removes core blocks, subsequent passes fix orphaned helpers/callers"
  - "JS structure validation via pre-commit hook — catches mismatched braces from incomplete block removal"

requirements-completed: [MEM-01]

# Metrics
duration: 17min
completed: 2026-03-20
---

# Phase 02 Plan 01: Cortex Deletion Summary

**Deleted all ~30 _cortex_* functions, cortex_memories table, and all /api/cortex/* endpoints — Memory V2 is now the sole memory system**

## Performance

- **Duration:** 17 min
- **Started:** 2026-03-20T15:38:56Z
- **Completed:** 2026-03-20T15:56:00Z
- **Tasks:** 2
- **Files modified:** 1 (porter.py)

## Accomplishments
- Removed entire cortex function family (~30 functions, 33KB of Python code) using string-marker-based patch scripts
- Removed cortex_memories CREATE TABLE, all indexes, and ALTER TABLE migration from _db_init()
- Removed all 8 /api/cortex/* endpoint handlers (consolidate, memories, stats, graph, batch-extract, config, /update, /status, /delete)
- Removed ~56KB JS cortex module (loadCortexTab, cortex graph canvas with force simulation, renderCortexMemories)
- Replaced both _cortex_extract_and_route call sites with comments pointing to Phase 2 plan 02-02
- All 6 Memory V2 functions intact (_mem_insert, _mem_search, _mem_promote, _mem_dismiss, _mem_inject_for_dispatch, _mem_extract_signals)
- Porter starts cleanly, health endpoint operational, Playwright Memory tab test passes

## Task Commits

1. **Task 1: Delete all Cortex code via patch script** - `d7389e2` (feat)
2. **Task 2: Verify Porter starts and Memory tab loads** - no additional commit (verification only)

## Files Created/Modified
- `/home/lobster/documents/porter/porter.py` - Cortex deletion: ~194KB removed, file 3136KB → 2942KB (55,357 lines)

## Decisions Made
- None additional — plan executed as specified with no architectural changes needed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed broken JS SSE subscription block after cortex:update removal**
- **Found during:** Task 1 (pre-commit hook caught JS syntax error)
- **Issue:** Removing the cortex:update SSE handler block cut out a partial block, leaving orphaned `}` and bridge:dispatch handlers with no surrounding function context
- **Fix:** Reconstructed SSE subscription block as `_overviewSseId` without cortex handlers, preserving bridge:dispatch refresh calls
- **Files modified:** porter.py (JS section)
- **Verification:** Pre-commit hook `nav-syntax-gate.sh` passed, Playwright Memory tab test passed
- **Committed in:** d7389e2 (Task 1 commit, included in same commit after fix)

**2. [Rule 2 - Missing Critical] Removed cortex API endpoints and session code not mentioned in plan**
- **Found during:** Task 1 (grep scan revealed 209 cortex references vs ~30 functions)
- **Issue:** Plan described function/table/preference/dispatch deletion but missed: 8 API endpoints, JS cortex module, session distill calls, _parse_cortex_json usage, _CORTEX_STOP_WORDS constants, project state brief cortex queries, and /api/personas/stats cortex queries
- **Fix:** Multi-pass patch scripts removed all functional cortex references; /api/personas/stats updated to query memories V2 table
- **Files modified:** porter.py
- **Verification:** test_grep_zero.py passes (0 _cortex_ function defs, 0 cortex_memories refs, 0 call sites, all V2 functions present)
- **Committed in:** d7389e2 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug fix, 1 missing critical scope)
**Impact on plan:** Both fixes required for correctness. Bug fix prevented crash on startup. Scope expansion necessary to fully satisfy "zero functional cortex references" criterion.

## Issues Encountered
- porter.py is ~3MB — multiple patch scripts needed (5 total) because each pass discovered additional cortex references that the previous pass missed
- Pre-commit hook nav-syntax-gate.sh is essential — caught JS structural error before commit

## Next Phase Readiness
- porter.py has zero functional cortex references (confirmed by test_grep_zero.py)
- _mem_extract_signals() still has early-return `return 0` — ready to be enabled in Plan 02-02 (noise filter)
- All V2 memory functions intact and operational
- FTS5 index rebuild safety added — memories_fts consistent on startup
- No blockers for 02-02

---
*Phase: 02-memory-v2*
*Completed: 2026-03-20*
