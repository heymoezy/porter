---
phase: 49-pattern-detection
plan: 03
subsystem: intellect
tags: [context-endpoint, project-scope, lrn-03, server-derivation, symmetric-scoping, partial-index]

# Dependency graph
requires:
  - phase: 49-04
    provides: detectContext composite (silos + projectId) in silo-detector.ts
  - phase: 48.1-silo-foundation
    provides: directives table accepts scope='project' (already in production, 83+ rows)
provides:
  - /context handler with server-side cwd→projectId derivation (LRN-03)
  - effectiveProject = explicit ?project= ?? detectedContext.projectId with explicit-wins precedence
  - Symmetric project-scope queries across directives + concepts + episodes
  - "— server-derived" suffix on Project Directives header when projectId came from cwd
  - stats.projectIdSource ('query'|'cwd'|'none') + stats.effectiveProject observability
  - Forward-investment partial index idx_directives_scope_scope_id_status on (scope, scope_id, status) WHERE status='active'
affects:
  - 49-05 (smoke harness will assert the cwd-only path end-to-end)
  - Phase 50 MSF-* (admin/data-room silos may extend cwd→project derivation)
  - Phase 51 DRX-02 (accept handler can later read failure_pattern proposed_metadata.suggested_scope)
  - Phase 52 CLA-01 (task-planner agent selection from project scope)

# Tech tracking
tech-stack:
  added: []  # zero new dependencies
  patterns:
    - "Composite call replaces standalone detectSilos — single detectContext call at handler top yields both silos[] and projectId, eliminating a duplicate DB lookup"
    - "Explicit-wins back-compat — porter-session-start hook passes BOTH ?project= and ?cwd= today; explicit param continues to win so live hook behavior is unchanged while future cwd-only callers gain auto-derivation"
    - "Symmetric scoping — project-directive AND project-scope-concept AND project-scope-episode queries all key off the SAME effectiveProject variable; no asymmetry between what cwd-only callers see and what explicit-?project= callers see"
    - "Forward-investment partial index — CREATE INDEX IF NOT EXISTS ... WHERE status='active' kept small (active rows only); idempotent re-run guard"
    - "TS shim around .sql artifact — migration runner is TS-module-based but the canonical SQL lives in a separate file for audit/rollback; the shim reads it once at boot and stamps the standard schema_migrations row"

key-files:
  created:
    - backend/src/db/migrations/049-directives-scope-index.sql
    - backend/src/db/migrate-directives-scope-idx-v1.ts
  modified:
    - backend/src/routes/v1/intellect.ts
    - backend/src/index.ts

key-decisions:
  - "Composite detectContext call at handler top (not split into separate detectSilos + detectProject calls inside the handler) — saves one DB round trip, locks the silo result so the silo-section try/catch reads from the pre-captured value, and centralizes the fail-open posture in one try/catch around the composite call."
  - "Explicit ?project= wins over server-derived projectId — back-compat-first. Live porter-session-start hook still passes both query params, so production behavior is byte-identical. cwd-only callers (future Phase 51+ dream-worker per-turn attribution, future MSF callers) get the auto-derivation for free."
  - "Symmetric scoping across directives + concepts + episodes — all three queries swap `project` → `effectiveProject`. Without symmetry, cwd-only callers would see project directives but global-only concepts (or vice versa), which is exactly the asymmetry LRN-03 is closing."
  - "Cosmetic 'server-derived' suffix on Project Directives header — purely informational. A client reading the markdown can tell whether the project directives appeared because of their explicit param vs because of cwd derivation. Helpful for debugging but doesn't change machine-readable behavior."
  - "TS shim around .sql artifact (not just embed SQL in TS migration body). The 49-03 plan locks the .sql file path and verbatim contents as the artifact contract. Porter's migration convention is TS modules registered in index.ts, so the shim bridges the two — reads the .sql once at boot and stamps schema_migrations.id='directives_scope_idx_v1'. Double-safe on re-run via both the schema_migrations guard AND the CREATE INDEX IF NOT EXISTS inside the SQL."
  - "stats.projectIdSource as a string-union ('query'|'cwd'|'none') NOT a boolean — three states. 'query' means the client passed ?project=. 'cwd' means it was derived. 'none' means neither path applied. Boolean would lose the 'none' distinction."

patterns-established:
  - "Pattern: composite-detector + downstream consumers — when a handler needs multiple pieces of context (silos + projectId), a single composite call at the top + downstream consumers reading from the captured result is cleaner than scattered direct calls. Generalizes to future Phase 50/51 if more context types land (e.g. task scope, agent scope)."
  - "Pattern: explicit-wins fallback — server-side derivation as a fallback when an explicit query param is absent. Keeps back-compat while incrementally moving toward server-as-source-of-truth."
  - "Pattern: forward-investment partial index — CREATE INDEX IF NOT EXISTS with a WHERE clause for the dominant query pattern. Pays off lazily as the row count grows; idempotent and zero-risk."

requirements-completed: [LRN-03]

# Metrics
duration: 40 min
completed: 2026-05-16
---

# Phase 49 Plan 03: Project-Scope Layering in /context Summary

**`/context` handler refactored to derive `effectiveProject` from explicit `?project=` OR cwd-derived `projectId` (explicit wins for back-compat); symmetric scoping across project-directive + concept + episode queries; new `stats.projectIdSource` + `effectiveProject` observability fields; `— server-derived` suffix on the Project Directives section header when projectId came from cwd. Plus a forward-investment partial index `idx_directives_scope_scope_id_status` on `(scope, scope_id, status) WHERE status='active'` applied via a TS migration shim around a `.sql` artifact.**

## Performance

- **Duration:** 40 min
- **Started:** 2026-05-16T19:48:22Z
- **Completed:** 2026-05-16T20:29:07Z
- **Tasks:** 2
- **Files modified:** 2 (intellect.ts, index.ts)
- **Files created:** 2 (049-directives-scope-index.sql, migrate-directives-scope-idx-v1.ts)

## Accomplishments

### Code changes

- **`/context` handler refactor** (`backend/src/routes/v1/intellect.ts`):
  - Import switched from `detectSilos` to `detectContext` (line 25).
  - Composite `detectContext({cwd, projectName: project, sessionId: session_id}, pool)` call at the top of the handler (line 86-99) replaces the standalone `await detectSilos(...)` previously inside the silo section.
  - New `effectiveProject = project ?? detectedContext.projectId ?? null` derivation (line 100).
  - New `projectIdSource: 'query' | 'cwd' | 'none'` (line 101-102) and `projectIsServerDerived` (line 103) variables.
  - Project-directive query (line 116-126) keyed off `effectiveProject` instead of `project`. Literal SQL unchanged.
  - Concept query (line 130-145) keyed off `effectiveProject` — cwd-only callers now see project-scope concepts.
  - Episode query (line 149-172) keyed off `effectiveProject` — cwd-only callers now see project-scope episodes.
  - Silo section (line 245-281) reads `detectedContext.silos` directly instead of making a second `detectSilos` call.
  - Project Directives section (line 283-293) gains a `— server-derived` suffix when `projectIsServerDerived === true`.
  - Response stats (line 339-345) gains `projectIdSource` and `effectiveProject` fields without breaking the existing shape.
  - Fail-open posture preserved: detectContext failure logs a warn and falls through to empty silos/null projectId.

### Migration

- **SQL artifact** `backend/src/db/migrations/049-directives-scope-index.sql` (28 LOC including header):
  ```sql
  CREATE INDEX IF NOT EXISTS idx_directives_scope_scope_id_status
    ON directives (scope, scope_id, status)
    WHERE status = 'active';
  ```
- **TS shim** `backend/src/db/migrate-directives-scope-idx-v1.ts` reads the SQL file at boot and executes it inside the standard `schema_migrations` guard with `id='directives_scope_idx_v1'`. Double-safe on re-run (schema_migrations row + CREATE INDEX IF NOT EXISTS).
- **Registered** in `backend/src/index.ts` after `migrateDreamsV1(pool)` at line 279.

## Task Commits

1. **Task 1: Add directives partial-index migration (SQL + TS shim)** — `ad786f1` (feat)
2. **Task 2: Refactor /context handler to use detectContext + effectiveProject** — `8494b4e` (feat)

**Plan metadata commit:** _(committed after STATE/ROADMAP updates below)_

## Files Created/Modified

- `backend/src/db/migrations/049-directives-scope-index.sql` — NEW. 28 LOC with rationale header. Single CREATE INDEX IF NOT EXISTS statement.
- `backend/src/db/migrate-directives-scope-idx-v1.ts` — NEW. 56 LOC TS shim reading the SQL file at boot and stamping schema_migrations.
- `backend/src/routes/v1/intellect.ts` — MODIFIED. /context handler lines 65-350 region. +57/-20 LOC.
- `backend/src/index.ts` — MODIFIED. +2 lines (import + call). Migration registered after migrateDreamsV1.

## Before / After

### Before

```bash
curl '/api/v1/intellect/context?cwd=/home/lobster/projects/ymc.capital'
# → stats: { systemDirectives: 17, projectDirectives: 0, ... }  ❌ no project directives
# → No "### Project Directives" section in markdown
```

The user had to know to pass `?project=ymc.capital` explicitly to see project directives — even when the cwd unambiguously identified the project.

### After

```bash
curl '/api/v1/intellect/context?cwd=/home/lobster/projects/ymc.capital'
# → stats: {
#     systemDirectives: 17,
#     projectDirectives: 1,
#     episodes: 5,
#     concepts: 20,
#     projectIdSource: "cwd",          # ← NEW
#     effectiveProject: "ymc.capital", # ← NEW
#   }
# → Markdown includes:
#     ### Project Directives (ymc.capital) — server-derived
#     - use porter agents be better
```

Identical content for explicit `?project=ymc.capital&cwd=/home/lobster/projects/ymc.capital`, **except** `projectIdSource: 'query'` (instead of `'cwd'`) and no `— server-derived` suffix on the header. Back-compat verified.

### Symmetry win

Not just project directives — **concepts and episodes are symmetric too**. A cwd-only call now sees the same project-scope concepts (`LIMIT 20`, includes global + project) that an explicit-project call sees. Previously cwd-only callers got only the 10 global concepts (`LIMIT 10`).

## Decisions Made

See frontmatter `key-decisions` for the full list. Highlights:

- **Composite at top, downstream readers** — `detectContext` called once; silo section reads from the captured result. Saves a DB round trip and centralizes fail-open posture.
- **Explicit ?project= wins** — back-compat-first; live hook unchanged.
- **Symmetric scoping** — directives + concepts + episodes all key off the same `effectiveProject`. Closes the asymmetry that LRN-03 set out to fix.
- **TS shim around .sql artifact** — plan locks the SQL file path; Porter convention is TS migrations. Shim bridges the two.
- **Three-state projectIdSource union** — `'query'|'cwd'|'none'`, not boolean. Preserves the 'none' state for clients that want to detect whether scoping applied at all.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Migration file convention mismatch**

- **Found during:** Task 1 setup
- **Issue:** Plan's `must_haves.artifacts` lists `backend/src/db/migrations/049-directives-scope-index.sql` as the migration file with specific verbatim SQL contents. However, Porter's existing migration convention is **TS modules registered in `backend/src/index.ts`** (e.g., `migrateSilosV1`, `migrateDreamsV1`); there is **no autoloading filename-prefix runner** under `backend/src/db/migrations/`. A bare `.sql` file in that directory would never be applied.
- **Fix:** Honored BOTH the plan's artifact contract AND Porter's convention:
  1. Created the `.sql` file at the exact path the plan specifies, with the verbatim CREATE INDEX statement the plan requires.
  2. Created a small TS shim `backend/src/db/migrate-directives-scope-idx-v1.ts` that reads the `.sql` file at boot via `fs.readFileSync(path.join(__dirname, 'migrations', '049-directives-scope-index.sql'))` and executes it inside the standard `schema_migrations` guard (`id='directives_scope_idx_v1'`).
  3. Registered the shim in `backend/src/index.ts` after `migrateDreamsV1` (line 279).
- **Why this preserves intent:** Plan's artifact list (`backend/src/db/migrations/049-directives-scope-index.sql` containing `idx_directives_scope_scope_id_status`) is satisfied verbatim. Plan's success criterion (the partial index lands after porter restart) is satisfied via the shim. The plan's NOTES section explicitly anticipates this: *"If the existing migration runner inserts a row into `schema_migrations` automatically by filename, no app-code change is needed. If it requires a manual INSERT...append..."* — i.e., the plan author left room for the shim.
- **Files modified:** Added `backend/src/db/migrate-directives-scope-idx-v1.ts` (not in plan's `files_modified`), modified `backend/src/index.ts` (not in plan's `files_modified`).
- **Verification:** After Porter restart, `psql -d porter -tAc "SELECT 1 FROM pg_indexes WHERE indexname='idx_directives_scope_scope_id_status'"` returns `1`. `psql -d porter -tAc "SELECT id FROM schema_migrations WHERE id='directives_scope_idx_v1'"` returns `directives_scope_idx_v1|<epoch>`. Index applied successfully.
- **Committed in:** `ad786f1`

---

**Total deviations:** 1 auto-fixed (1 blocking — convention mismatch between plan artifact contract and existing Porter migration runner).
**Impact on plan:** Zero — the plan's INTENT (forward-investment partial index applied at next restart, verified by smoke 49-05 via psql) is fully met. The two extra files (TS shim + index.ts registration) are the minimal bridge between the plan's artifact contract and Porter's convention. The .sql file IS canonical; the shim is a one-line `client.query(fs.readFileSync(sqlPath, 'utf8'))`.

## Verification Receipts

### Type-check (clean)

```
$ cd backend && npx tsc --noEmit
$ echo $?
0
```

### Acceptance gates (all green)

```
1. import detectContext:     OK
2. effectiveProject:         OK
3. projectIdSource:          OK
4. server-derived:           OK
5. detectedContext.silos:    OK
6. project sql preserved:    OK
7. NO detectSilos await:     OK
8. NO detectSilos import:    OK
9. Project Directives header literal: OK
10. Silo section preserved:  OK
```

### Migration applied (post-restart)

```
$ psql -d porter -tAc "SELECT 1 FROM pg_indexes WHERE indexname='idx_directives_scope_scope_id_status'"
1
$ psql -d porter -tAc "SELECT id, applied_at FROM schema_migrations WHERE id='directives_scope_idx_v1'"
directives_scope_idx_v1|1778962822.094485
```

### Live /context behavior matrix (5 + 1 cases, all green)

| Test | Query                                                                      | projectIdSource | effectiveProject | Header suffix          | projectDirectives count |
| ---- | -------------------------------------------------------------------------- | --------------- | ---------------- | ---------------------- | ----------------------- |
| 1    | `?project=ymc.capital&cwd=/home/lobster/projects/ymc.capital`              | `query`         | `ymc.capital`    | (none)                 | 1                       |
| 2    | `?cwd=/home/lobster/projects/ymc.capital` (NO ?project=)                   | `cwd`           | `ymc.capital`    | `— server-derived`     | 1 (identical content)   |
| 3    | `?cwd=/home/lobster/projects/ymc.capital/backend` (subdir)                 | `cwd`           | `ymc.capital`    | `— server-derived`     | 1                       |
| 4    | (no query params)                                                          | `none`          | `null`           | (no section emitted)   | 0                       |
| 5    | `?project=ymc.capital&cwd=/home/lobster/projects/SomethingElse`            | `query`         | `ymc.capital`    | (none — explicit wins) | 1                       |
| 6    | Insert/query/cleanup test directive at `scope_id='smoke-49-03-test'`       | `cwd`           | `smoke-49-03-test` | `— server-derived`   | 1                       |

Test 6 explicitly proves the end-to-end flow: a fresh `INSERT` at `scope='project', scope_id='smoke-49-03-test'` is immediately visible via `curl '/context?cwd=/home/lobster/projects/smoke-49-03-test'` with `projectIdSource: 'cwd'`. Cleanup `DELETE` removed 1 row.

### Silo regression (no regression)

```
$ curl -s '/api/v1/intellect/context?cwd=/home/lobster/projects/Porter/backend' | jq -r '.data.context' | grep '^## Silo:'
## Silo: Software Development — Operating Rules
```

Silo section still renders. `effectiveProject: "Porter"` from cwd derivation (subdir captured correctly).

### Prior-phase smoke harness regression (all green)

| Harness               | Exit | Result                                     |
| --------------------- | ---- | ------------------------------------------ |
| `tests/smoke-48.1.sh` | 0    | all checks green (SC-1..SC-6)              |
| `tests/smoke-48.2.sh` | 0    | all checks green (TRC-01..TRC-08)          |
| `tests/smoke-48.3.sh` | 0    | all checks green for current wave          |
| `tests/smoke-48.4.sh` | 0    | all checks green for current wave          |

Zero regressions on prior phases.

### Service health

```
$ curl -sf http://127.0.0.1:3001/health
{"status":"ok","engine":"fastify","version":"6.17.1","mail":{...}}
```

## Issues Encountered

None blocking. The migration-runner convention mismatch was resolved inline (see Deviations § Auto-fixed Issues #1).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **49-05 (LRN-05 — Smoke harness) is the last unshipped plan.** It will assert the end-to-end flow:
  - LRN-01 (frustration boost): turn-with-marker force-include in `dream_runs.action_config.sampling.frustration_forced ≥ 1`
  - LRN-02 (failure_patterns): mock dream response containing `failure_patterns` array → `memory_proposals` row with `proposed_metadata->>'source' = 'failure_pattern'`
  - **LRN-03 (this plan): `INSERT directive (scope='project', scope_id='smoke-49-test', ...)` then `curl /context?cwd=/home/lobster/projects/smoke-49-test` → directive appears in Project Directives section. AND `psql -tAc "SELECT 1 FROM pg_indexes WHERE indexname='idx_directives_scope_scope_id_status'" = 1`.**
  - LRN-04 (cwd→projectId): `/context?cwd=/home/lobster/projects/ymc.capital/backend` returns `effectiveProject: 'ymc.capital'` WITHOUT explicit `?project=`.
  - Trigger `directive_immutable_moe_direct` fires on UPDATE of a `scope='project', source_type='moe-direct'` row.
- **Wave 2 progress:** 49-03 SHIPPED. 49-05 remains.
- **TypeScript compiles clean.** Service restarts and serves /health 200. Index applied.

## Self-Check: PASSED

- `backend/src/routes/v1/intellect.ts` exists on disk: YES (verified)
- `backend/src/db/migrations/049-directives-scope-index.sql` exists on disk: YES (verified)
- `backend/src/db/migrate-directives-scope-idx-v1.ts` exists on disk: YES (verified)
- Commit `ad786f1` exists in git log: YES (verified)
- Commit `8494b4e` exists in git log: YES (verified)
- All 10 acceptance grep gates pass (1-10 documented above)
- Type-check clean: `npx tsc --noEmit` returns 0
- Service restarts, /health returns version 6.17.1
- Index applied: `idx_directives_scope_scope_id_status` exists in pg_indexes
- schema_migrations stamped: `directives_scope_idx_v1` row present
- 6 live behavior tests all green (5 plan-specified + 1 insert/cleanup smoke)
- 4 prior-phase smoke harnesses all green (no regression)

---
*Phase: 49-pattern-detection*
*Completed: 2026-05-16*
