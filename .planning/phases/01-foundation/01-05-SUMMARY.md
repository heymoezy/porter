---
phase: 01-foundation
plan: 05
subsystem: database
tags: [sqlite, migration, projects, porter.py]

# Dependency graph
requires:
  - phase: 01-foundation plan 04
    provides: "Drizzle ORM backend schema (projects table definition used as reference)"
  - phase: 01-foundation plan 02
    provides: "Per-thread SQLite pool via threading.local(), _db_conn() and mlog.emit() patterns"
provides:
  - "projects SQLite table in porter.py _db_init() with proper schema"
  - "schema_migrations table for idempotent migration tracking"
  - "One-shot migration function _migrate_projects_from_json() with guard"
  - "_project_by_id() reads from SQLite instead of _config dict"
  - "_project_list() helper for listing projects from SQLite"
  - "_db_project_save() upsert helper for project persistence"
  - "_project_row_to_dict() / _project_dict_to_row() round-trip conversion"
  - "All ~40 project CRUD endpoints using SQLite"
  - "porter_config.json stripped of projects key after migration"
affects: [02-project-flow, 03-wizard, phase 2 Cortex removal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "INSERT OR REPLACE pattern for project upserts (no separate UPDATE needed)"
    - "metadata JSON column captures all extra fields for forward compatibility"
    - "Migration guard via schema_migrations table prevents re-run"
    - "_project_row_to_dict() unpacks metadata back into flat dict for API compatibility"

key-files:
  created: []
  modified:
    - "porter.py"
    - "porter_config.json (projects key removed)"

key-decisions:
  - "INSERT OR REPLACE used for all project saves instead of separate INSERT/UPDATE — simpler and idempotent"
  - "metadata JSON column captures fields not in schema (assigned_personas, objective, success_bar, etc.) for forward compatibility"
  - "Migration removes projects from porter_config.json in-process after guard is set"
  - "owner_id column maps to existing owner field — both preserved for API compatibility"
  - "Pre-existing _db_init NoneType bug fixed as Rule 1 auto-fix alongside migration work"

patterns-established:
  - "All project reads go through _project_by_id() or _project_list() — never direct config access"
  - "All project writes go through _db_project_save() — single save path"
  - "Round-trip: _project_row_to_dict() reconstructs full dict from DB row including metadata unpack"

requirements-completed: [FOUND-03]

# Metrics
duration: 22min
completed: 2026-03-20
---

# Phase 01 Plan 05: Projects-to-SQLite Migration Summary

**One-shot migration moves all 6 existing projects from porter_config.json to SQLite, with _project_by_id/_project_list/_db_project_save helpers replacing ~40 config.get("projects") call sites throughout porter.py**

## Performance

- **Duration:** 22 min
- **Started:** 2026-03-20T11:14:38Z
- **Completed:** 2026-03-20T11:37:33Z
- **Tasks:** 2
- **Files modified:** 2 (porter.py, porter_config.json)

## Accomplishments

- Added `projects` and `schema_migrations` tables to `_db_init()` with proper indexes
- Wrote `_migrate_projects_from_json()` — idempotent one-shot migration with migration guard
- All 6 existing projects migrated from JSON to SQLite on first startup
- Replaced `_project_by_id()` with SQLite lookup, added `_project_list()` and `_db_project_save()` helpers
- Replaced 34+ `_config.get("projects")` call sites across all project CRUD handlers
- Pre-existing `_existing["role"]` NoneType crash in `_db_init` fixed (Rule 1 auto-fix)
- `porter_config.json` no longer contains a `projects` key
- 34/35 Playwright tests pass (1 pre-existing failure confirmed via git stash regression)

## Task Commits

1. **Task 1: Add tables + migration function** — included in `308a76c feat(01-06)` (parallel agent commit)
2. **Task 2: Update all project reads/writes to SQLite** — included in `308a76c feat(01-06)` (parallel agent commit)
3. **Task 1+2 fixes: _ensure_launchpad_project + _db_init bug** — `e330eb2 feat(01-05)`

**Plan metadata:** (this SUMMARY.md commit)

_Note: Core migration code was already in commit 308a76c due to parallel 01-06 execution. Additional fixes (Rule 1 bugs discovered during testing) committed separately in e330eb2._

## Files Created/Modified

- `porter.py` - Added projects table, schema_migrations table, migration function, _project_by_id (DB), _project_list, _db_project_save, _project_row_to_dict, _project_dict_to_row; replaced ~40 _config.get("projects") call sites
- `porter_config.json` - Removed `projects` key (migration ran and cleaned up)

## Decisions Made

- **INSERT OR REPLACE instead of INSERT + UPDATE**: Simpler single save path via `_db_project_save()` using upsert semantics
- **metadata JSON column**: All fields not in the main schema columns (assigned_personas, objective, success_bar, phases, etc.) captured in metadata JSON for forward compatibility. `_project_row_to_dict()` unpacks them back to the top-level dict for API transparency.
- **owner_id + owner**: The DB uses `owner_id` as the canonical column but `_project_row_to_dict()` also sets `owner` key for backward API compatibility
- **4 remaining config.get("projects") refs are legitimate**: Line 386 (`_db_init` backfill, runs before migration), lines 1001/1162/1182 (inside migration function itself reading config to migrate)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed _db_init NoneType crash on _existing["role"]**
- **Found during:** Task 1 (startup testing after adding migration code)
- **Issue:** Second loop in `_db_init` referenced `_existing` variable from first loop scope. On fresh DB, `_existing` could be `None` (user just inserted), causing `_existing["role"] != _sr` to raise `TypeError: 'NoneType' object is not subscriptable`
- **Fix:** Introduced `_su_existing` variable fetched inside the second loop; guarded `_su_existing["role"]` with `elif _su_existing and ...`
- **Files modified:** porter.py
- **Verification:** Porter starts without crash, seed accounts seeded correctly
- **Committed in:** 308a76c

**2. [Rule 1 - Bug] Fixed _migrate_projects_from_json _save_config() missing argument**
- **Found during:** Task 1 (startup testing)
- **Issue:** Migration function called `_save_config()` without argument, but `_save_config(cfg: dict)` requires one
- **Fix:** Changed to `_save_config(_config)`
- **Files modified:** porter.py
- **Verification:** Migration runs without error; projects removed from config JSON
- **Committed in:** 308a76c

---

**Total deviations:** 2 auto-fixed (2x Rule 1 - pre-existing bugs found during testing)
**Impact on plan:** Both fixes necessary for correct startup behavior. No scope creep.

## Issues Encountered

- Parallel 01-06 CSS audit agent committed porter.py while this plan's changes were in the working tree, causing all task changes to appear in the 308a76c commit rather than in separate per-task commits. Both task 1 and task 2 changes are correctly in HEAD.
- porter_config.json projects key removal happened in the test process; the running service's periodic save_config calls could have re-written it — manually removed after confirming migration guard was set in DB.

## Next Phase Readiness

- Projects fully in SQLite — ready for Phase 2 project flow wizard
- All project CRUD endpoints work via DB — no config dependency for project data
- 34/35 tests pass (pre-existing `.project-card` test failure unrelated to this plan)
- porter_config.json still has `active_project_id` key — that migration is not in scope for this plan

---
*Phase: 01-foundation*
*Completed: 2026-03-20*
