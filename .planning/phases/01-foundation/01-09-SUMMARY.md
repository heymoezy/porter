---
phase: 01-foundation
plan: 09
subsystem: database
tags: [sqlite, porter.py, project-migration, exception-handling, mlog]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Plan 05: SQLite project migration (_db_project_save, _project_dict_to_row)"
  - phase: 01-foundation
    provides: "Plan 01: mlog.emit() structured logging (debug/info/error severity)"
provides:
  - "Zero project creation paths bypass SQLite — all use _db_project_save()"
  - "load_config() no longer recreates the projects key on every boot"
  - "Three silent exception handlers (stale conn close, 2x rate-limit parse) now emit mlog.emit(debug)"
affects: ["02-cortex-removal", "03-fastify-migration", "05-wizard"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "All project writes go through _db_project_save() — no direct _config mutation"
    - "Silent except blocks upgraded to mlog.emit('debug', ...) — no bare pass"

key-files:
  created: []
  modified:
    - porter.py

key-decisions:
  - "load_config() projects key recreation removed — projects live exclusively in SQLite after Plan 05 migration"
  - "Chat action project_create _save_config() call was a latent bug (called without cfg argument) — replaced by _db_project_save()"

patterns-established:
  - "Project creation pattern: always call _db_project_save(dict) — never append to _config['projects']"
  - "Exception logging pattern: except ExcType as _e: mlog.emit('debug', domain, event_type, str(_e), extra={...})"

requirements-completed: [FOUND-01, FOUND-03]

# Metrics
duration: 2min
completed: 2026-03-20
---

# Phase 01 Plan 09: Fix Project Migration Bypass Paths and Silent Exception Handlers Summary

**Closed two project creation bypass paths (config append -> _db_project_save) and upgraded three silent except-pass blocks to mlog.emit(debug) observability**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-20T13:49:44Z
- **Completed:** 2026-03-20T13:51:59Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- `_create_user_first_mission()` now calls `_db_project_save(project)` instead of appending to `_config` and calling `save_config()`
- Chat action `project_create` now calls `_db_project_save(proj)` instead of `_config.setdefault("projects", []).append(proj)` + broken `_save_config()` call
- `load_config()` no longer unconditionally recreates the `projects` key in porter_config.json on every boot
- `_db_conn()` stale connection close failure now emits `mlog.emit("debug", "db", "conn.stale_close_failed", ...)`
- Unified rate-limit header parse `ValueError` now emits `mlog.emit("debug", "ai", "ratelimit.parse_failed", ...)`
- Fallback rate-limit header parse `(ValueError, ZeroDivisionError)` now emits `mlog.emit("debug", "ai", "ratelimit.parse_failed", ...)`

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix project creation bypass paths and load_config projects key** - `7b80f30` (fix)
2. **Task 2: Add debug mlog.emit() to three silent exception handlers** - `84b35e4` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `porter.py` - Three project creation bypass paths fixed; three silent exception handlers upgraded to mlog.emit(debug)

## Decisions Made
- The `_save_config()` call in the chat action `project_create` handler was actually a latent bug — the function signature is `_save_config(cfg: dict)` and it was being called with no arguments. Replacing it with `_db_project_save(proj)` fixed both the bypass path and the latent bug simultaneously.
- The `load_config()` projects key recreation was unconditional on every boot — this prevented porter_config.json from ever being fully decommissioned as a project store. Removing it closes the gap established in Plan 05.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - all patch scripts ran cleanly on the first attempt. Porter restarted successfully and returned valid version response.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- FOUND-01 (all except blocks call mlog.emit) and FOUND-03 (all project writes via SQLite) are both satisfied
- Zero project creation paths now bypass the SQLite store
- Observability is complete for the three highest-priority silent exception handlers
- Phase 01 foundation plans are now complete — ready for Phase 02 (Cortex removal)

---
*Phase: 01-foundation*
*Completed: 2026-03-20*
