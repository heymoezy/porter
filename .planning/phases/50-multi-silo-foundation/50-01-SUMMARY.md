---
phase: 50-multi-silo-foundation
plan: 01
subsystem: intellect
tags: [scheduler, dream-worker, silos, cadence, postgres, fastify]

requires:
  - phase: 48.1-silo-foundation
    provides: silos table with cadence_seconds column + directive_immutable_moe_direct trigger
  - phase: 48.3-software-dream-worker
    provides: dream-worker + dream_runs table + every_week workflow row
  - phase: 49-pattern-detection
    provides: directives_scope_idx_v1 migration registered before loadSiloCache
provides:
  - migrate-multi-silo-v1 migration scaffold (idempotent, all-or-nothing BEGIN/COMMIT, schema_migrations stamp at end)
  - Per-silo dream cadence tick — runSiloCadenceCheck() runs hourly, reads silos.cadence_seconds, dispatches runDreamWorker per cadence-elapsed silo
  - dream-worker checkSkipRecent refactored to read per-silo cadence_seconds from DB (95% floor)
  - Legacy "Software dream — weekly consolidation" workflow row deleted by migration (single source of truth = silos.cadence_seconds)
  - MSF-03 audit deliverable: both surviving 'software' defaults documented as anti-fragile fallbacks
  - Placeholder comment blocks in migrate-multi-silo-v1.ts so Plans 50-02 + 50-03 can add silo + directive INSERTs into the same atomic tx
affects: [50-02-admin-silo, 50-03-data-room-silo, 50-04-smoke, future silo additions]

tech-stack:
  added: []
  patterns:
    - "Per-silo cadence tick — additive sibling to existing weekly workflow tick; reads metadata from silos table instead of hardcoded constants"
    - "Shared multi-silo migration scaffold — single BEGIN/COMMIT shared across Wave 2 plans via literal placeholder comments (PLAN 50-02:, PLAN 50-03:); all-or-nothing posture preserved across plan boundaries"
    - "MSF-03 documented fallback pattern — survive 'software' defaults retained but annotated with 'SAFE DEFAULT (Phase 50 MSF-03)' greppable hook"

key-files:
  created:
    - "backend/src/db/migrate-multi-silo-v1.ts (75 LOC scaffold with placeholder blocks)"
  modified:
    - "backend/src/services/scheduler.ts (+46 LOC: constant + runSiloCadenceCheck + tick branch + runDreamWorker import)"
    - "backend/src/services/intellect/dream-worker.ts (+15/-7 LOC: per-silo cadence refactor)"
    - "backend/src/services/intellect/workflow-engine.ts (+2 LOC doc comment)"
    - "backend/src/routes/v1/intellect.ts (+2 LOC doc comment)"
    - "backend/src/index.ts (+4 LOC: import + call + comment)"

key-decisions:
  - "Per-silo cadence reads silos.cadence_seconds (not a hardcoded constant) — enrollment is now truly data-driven; INSERT silos (...cadence_seconds=N) and the scheduler picks it up"
  - "95% cadence floor in checkSkipRecent mirrors prior 6.5/7 software ratio — admin (3d → 246240s floor), data-room (7d → 574560s floor), software unchanged from prior 6.5d behavior within rounding"
  - "Hourly tick granularity (1800 ticks × 2s) — per-silo cadence is day-scale, hourly is plenty; manual /dream-run remains responsive (skip-recent guard only fires for triggeredBy='schedule')"
  - "Single migration file shared across 50-01/50-02/50-03 — all-or-nothing posture spans plans; placeholders are literal greppable comments (PLAN 50-02:, PLAN 50-03:) so downstream plans find their insertion points without re-reading this plan"
  - "MSF-03 surviving 'software' defaults retained as anti-fragile fallbacks (not retired) — both annotated with 'SAFE DEFAULT (Phase 50 MSF-03)' hook for discoverability; explicit silo_id ALWAYS overrides; documented over deleted because deletion would break missing-silo-id callers"
  - "schema_migrations INSERT remains the LAST statement in the tx — by 50-02/50-03 each plan adds INSERTs above this marker, so any failure rolls back including the stamp; partial migrations re-run cleanly on next boot"

patterns-established:
  - "Per-silo metadata-driven scheduling — silos.cadence_seconds is the single source of truth, no code changes for new cadence values"
  - "Cross-plan shared migration with literal placeholder comments — Wave 2 plans can land into the same atomic tx without restructuring"
  - "Greppable hook strings for audit deliverables — 'SAFE DEFAULT (Phase 50 MSF-03)' returns both fallback sites in one grep"

requirements-completed: [MSF-04, MSF-03]

duration: 48 min
completed: 2026-05-17
---

# Phase 50 Plan 01: Scheduler refactor + per-silo cadence + multi-silo migration scaffold Summary

**Per-silo dream cadence tick (1h granularity) reading silos.cadence_seconds from DB + dream-worker checkSkipRecent per-silo refactor + idempotent migrate-multi-silo-v1 scaffold (DELETE legacy software-weekly workflow row + Plan 50-02/03 placeholder blocks) + MSF-03 documented fallbacks. Software silo continues to dream weekly via the new tick; admin (3d) + data-room (7d) auto-run once their silos rows land in Wave 2.**

## Performance

- **Duration:** 48 min
- **Started:** 2026-05-17T01:30:00Z
- **Completed:** 2026-05-17T02:18:00Z
- **Tasks:** 4
- **Files modified:** 5 + 1 created (6 total)

## Accomplishments

- New `migrate-multi-silo-v1.ts` (75 LOC) — idempotent BEGIN/COMMIT migration scaffold; deleted 1 legacy workflow row in production on first boot; placeholder comment blocks (`PLAN 50-02:`, `PLAN 50-03:`) reserved so Wave 2 plans land silo + directive INSERTs into the same atomic transaction
- New `runSiloCadenceCheck()` in scheduler.ts (+46 LOC) — runs hourly, single SQL query joins enabled silos with last started_at from dream_runs, fires `runDreamWorker({siloId, triggeredBy:'schedule'})` per silo where cadence elapsed; per-silo errors caught (one failing silo never blocks others)
- `dream-worker.checkSkipRecent` rewritten to read per-silo `cadence_seconds` from DB (95% floor mirrors prior 6.5/7 software ratio); deleted hardcoded `SKIP_RECENT_THRESHOLD_S = 6.5 * 86400`; `dream_run_skipped` payload upgraded with `cadenceSeconds` + reason `recent_run_within_cadence_floor`
- MSF-03 audit deliverable: both surviving `'software'` defaults (`workflow-engine.ts:112`, `intellect.ts:625`) annotated with the greppable hook `// SAFE DEFAULT (Phase 50 MSF-03):` explaining the anti-fragile fallback posture
- Migration registered in `index.ts` between Phase 49 (`migrateDirectivesScopeIdxV1`) and `loadSiloCache` so the cache picks up new silos on first boot without restart

## Task Commits

Each task was committed atomically:

1. **Task 1: Create migrate-multi-silo-v1.ts scaffold + register in index.ts + delete legacy workflow row** — `d50c34d` (feat)
2. **Task 2: Refactor dream-worker checkSkipRecent + delete SKIP_RECENT_THRESHOLD_S constant + update reason string** — `31602ca` (refactor)
3. **Task 3: Add SILO_CADENCE_CHECK_INTERVAL + runSiloCadenceCheck() + tick branch in scheduler.ts** — `c1c0dbe` (feat)
4. **Task 4: Document the two surviving 'software' defaults as MSF-03 fallbacks** — `34d0d8b` (docs)

**Plan metadata commit:** _(appended after this SUMMARY is written)_

## Files Created/Modified

- `backend/src/db/migrate-multi-silo-v1.ts` (NEW, 75 LOC) — Idempotent multi-silo migration scaffold. Body: DELETE legacy workflow row + schema_migrations stamp. Two literal placeholder blocks reserve insertion points for Plans 50-02 (admin silo + 4 directives) and 50-03 (data-room silo + 5 directives).
- `backend/src/services/scheduler.ts` (+46 LOC) — Imports `runDreamWorker`; new `SILO_CADENCE_CHECK_INTERVAL = 1800`; new async `runSiloCadenceCheck()` at line 345; new tick branch at line 466 alongside `INTELLECT_WEEKLY_INTERVAL`.
- `backend/src/services/intellect/dream-worker.ts` (+15/-7 LOC) — `SKIP_RECENT_THRESHOLD_S` constant deleted; `checkSkipRecent` rewritten as single-query LATERAL-style SELECT (last started_at + silos.cadence_seconds) with 95% floor; `dream_run_skipped` payload includes `cadenceSeconds` + reason `recent_run_within_cadence_floor`.
- `backend/src/services/intellect/workflow-engine.ts` (+2 LOC) — `SAFE DEFAULT (Phase 50 MSF-03):` doc comment above `dream_run` handler `siloId` fallback (line 112).
- `backend/src/routes/v1/intellect.ts` (+2 LOC) — Same `SAFE DEFAULT` doc comment above POST /dream-run `siloId` fallback (line 625).
- `backend/src/index.ts` (+4 LOC) — Import `migrateMultiSiloV1`; call between `migrateDirectivesScopeIdxV1` and `loadSiloCache` with a comment explaining cache-load ordering.

## Decisions Made

See `key-decisions` in frontmatter. Six decisions, each tied to a deliberate architectural posture (data-driven scheduling, 95% floor, hourly granularity, shared migration, anti-fragile fallbacks, schema_migrations stamp ordering).

## Live verification snapshot (post-deploy)

```
$ psql -d porter -tAc "SELECT count(*) FROM workflows WHERE name = 'Software dream — weekly consolidation'"
0

$ psql -d porter -tAc "SELECT count(*) FROM schema_migrations WHERE id = 'multi_silo_v1'"
1

$ psql -d porter -tAc "SELECT id, cadence_seconds, enabled FROM silos WHERE enabled = TRUE"
software|604800|t

$ grep -n "runSiloCadenceCheck\|SILO_CADENCE_CHECK_INTERVAL" backend/src/services/scheduler.ts
41:const SILO_CADENCE_CHECK_INTERVAL = 1800; // 1800 ticks × 2s = 1h. Per-silo cadence is day-scale; hourly granularity is plenty.
345:async function runSiloCadenceCheck(): Promise<void> {
466:    if (tickCount > 0 && tickCount % SILO_CADENCE_CHECK_INTERVAL === 0) {
467:      runSiloCadenceCheck().catch((err) =>

$ journalctl --user -u porter-fastify -n 200 | grep migrate-multi-silo-v1
[migrate-multi-silo-v1] deleted 1 legacy workflow row(s) (Software dream — weekly consolidation)
[migrate-multi-silo-v1] complete
```

DELETE rowCount = 1 (the production legacy row). schema_migrations stamped. Software silo intact post-migration. Only `software` silo enabled (admin + data-room land in Wave 2).

## Deviations from Plan

None — plan executed exactly as written. All four task `<verify>` blocks passed on first build/grep cycle; the only retry was a shell-quoting hiccup on the `grep -B1` spot check (had to use `-F` for the literal `?.` in the search string — purely a verification-script artifact, not a code change).

## Issues Encountered

None during execution. One operational note: the first `systemctl --user stop ; sleep 3 ; pkill ; sleep 3 ; systemctl --user start` compound command returned non-zero (likely a transient pkill exit), but `systemctl --user start porter-fastify` immediately after brought the service up cleanly with the migration applied. Standard Porter ship process — captured in CLAUDE.md ship discipline.

## Authentication Gates

None.

## Regression check (5 phase smokes)

All 5 prior-phase smoke harnesses re-ran post-deploy:

- `tests/smoke-48.1.sh` — all SC-1..SC-6 green
- `tests/smoke-48.2.sh` — all TRC-01..TRC-08 green
- `tests/smoke-48.3.sh` — all DRW-* green for current wave
- `tests/smoke-48.4.sh` — all RVS-* green (RVS-07b expected non-blocking skip)
- `tests/smoke-49.sh` — all LRN-* green

No regression introduced by per-silo cadence tick or migration. The new tick adds work only at hourly boundaries on enabled silos (today: just `software`), so steady-state behavior is identical to pre-deploy until Wave 2 adds the admin + data-room rows.

## Next Phase Readiness

**Ready for Wave 2 (50-02 admin silo + 50-03 data-room silo, SERIALIZED).** Both plans land their silo + directive INSERTs into the same `migrate-multi-silo-v1.ts` file at the documented placeholder comments:

- `// ── PLAN 50-02: INSERT ADMIN SILO + DIRECTIVES HERE ──────────────────────`
- `// ── PLAN 50-03: INSERT DATA-ROOM SILO + DIRECTIVES HERE ──────────────────`

When 50-02 + 50-03 ship, the runSiloCadenceCheck tick will auto-pick up `admin` (3d cadence → 246240s floor) and `data-room` (7d cadence → 574560s floor) without any further scheduler change. The DB trigger `directive_immutable_moe_direct` continues to seal moe-direct directives in both new silos.

**Carry-forward for orchestrator:** This plan does NOT push (orchestrator pushes after Wave 1 complete per execution constraint). Plan metadata commit (this SUMMARY + STATE + ROADMAP) will be appended below by the executor's final step.

## Self-Check: PASSED

- `backend/src/db/migrate-multi-silo-v1.ts` — exists on disk (verified via `test -f`)
- `backend/src/services/scheduler.ts` — `runSiloCadenceCheck` + `SILO_CADENCE_CHECK_INTERVAL` present (verified via grep at lines 41, 345, 466)
- `backend/src/services/intellect/dream-worker.ts` — `cadence_seconds FROM silos WHERE id` present; `SKIP_RECENT_THRESHOLD_S` deleted (verified via grep + negative grep)
- `backend/src/services/intellect/workflow-engine.ts` + `backend/src/routes/v1/intellect.ts` — both contain `SAFE DEFAULT (Phase 50 MSF-03)` (1 hit each, verified)
- Commits `d50c34d`, `31602ca`, `c1c0dbe`, `34d0d8b` — all present in `git log --oneline -6`
- Production DB: `multi_silo_v1` stamped in `schema_migrations` (verified via psql)
- All 5 phase smokes (48.1, 48.2, 48.3, 48.4, 49) — re-ran post-deploy, all green

---
*Phase: 50-multi-silo-foundation*
*Completed: 2026-05-17*
