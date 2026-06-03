## 2026-05-17 (discovered during 50-02 execution) — RESOLVED in 50-04

**RESOLVED 2026-05-17 by Plan 50-04 commit `bb421d0` (auto-fix Rule 3 — blocking).** The BUILTIN_WORKFLOWS entry was removed because it directly blocked smoke-50 SC-18 (Plan 50-04's own deliverable). Production DB row also cleared in same deploy. Post-fix psql confirms count=0 across restarts. smoke-48.3 DRW-08 also rebased (commit `fa54b9d`) to assert per-silo cadence wiring instead of the legacy `every_week` workflow row — same stale-invariant rebase pattern Plan 50-03 used for smoke-48.1 SC-4.

---

**BUILTIN_WORKFLOWS re-seeds the legacy "Software dream — weekly consolidation" workflow row on every Porter startup.** (original entry, retained for context)

- Found during: 50-02 live verification (post-restart psql query showed `count=1` for the legacy row even though Plan 50-01's migration DELETEd it)
- Source: `backend/src/services/intellect/workflow-engine.ts:352` — `BUILTIN_WORKFLOWS` array still contains the row with `trigger_value='every_week'` and `action_type='dream_run'`
- Impact: The per-silo cadence tick (Plan 50-01) AND the legacy weekly workflow BOTH fire weekly. Skip-recent guard dedups, so functionally harmless, but `dream_runs` audit logs will show extra rows + the source-of-truth principle from 50-01 ("single source of truth = silos.cadence_seconds") is violated.
- Scope boundary: NOT a 50-02 bug — this is a missed coupling in Plan 50-01's "delete legacy workflow row" task (the migration DELETE handled the DB row, but the BUILTIN_WORKFLOWS startup seed re-installs it). Belongs to a 50-01 follow-up or Phase 51.
- Fix: Remove the `'Software dream — weekly consolidation'` entry from `BUILTIN_WORKFLOWS` in workflow-engine.ts (the only legitimate seed path is via migration now). One-line deletion, ~10 LOC removed from the array.
- Verification post-fix: After restart, `psql -d porter -tAc "SELECT count(*) FROM workflows WHERE name = 'Software dream — weekly consolidation'"` returns 0.
