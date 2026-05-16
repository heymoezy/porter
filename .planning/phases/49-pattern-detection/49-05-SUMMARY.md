---
phase: 49-pattern-detection
plan: 05
subsystem: intellect
tags: [smoke-harness, phase-gate, pattern-detection, lrn-05, idempotent-tests]

# Dependency graph
requires:
  - phase: 49-01
    provides: FRUSTRATION_REGEX + Pass A0 + samplingLog.frustration_forced/frustration_forced_examples populated by dream-sampler.ts
  - phase: 49-02
    provides: failure_patterns Zod schema + dream-worker insertion + dream_failure_pattern_detected audit event + sort_order 850-899 band
  - phase: 49-03
    provides: /context handler effectiveProject + projectIdSource ('query'|'cwd'|'none') + symmetric directive/concept/episode scoping + partial index idx_directives_scope_scope_id_status
  - phase: 49-04
    provides: detectProject pure function + detectContext composite in silo-detector.ts (built artifact at backend/dist/services/intellect/silo-detector.js)
  - phase: 48.1-01
    provides: directive_immutable_moe_direct trigger + porter.allow_moe_direct_mutation bypass GUC
  - phase: 48.3-05
    provides: POST /api/v1/intellect/dream-run with _mock_response_path body field mock-injection contract
provides:
  - "tests/smoke-49.sh — Phase 49 pattern-detection smoke harness covering LRN-01..LRN-05"
  - "tests/fixtures/dream-response-pattern-detection.json — doctrine-compliant fixture with one failure_patterns entry (project scope) + one regular new_directive proposal"
  - "Phase gate: bash tests/smoke-48.1.sh && bash tests/smoke-48.2.sh && bash tests/smoke-48.3.sh && bash tests/smoke-48.4.sh && bash tests/smoke-49.sh — all five exit 0"
  - "Trigger scope-agnosticism proof: directive_immutable_moe_direct fires uniformly on scope='project' moe-direct rows (not just scope='silo'); bypass GUC works across scopes"
affects:
  - Phase 50 MSF-* (smoke pattern reusable for admin/data-room silo gates)
  - Phase 51 DRX-02 (failure_pattern proposed_metadata.suggested_scope persists today but accept-handler doesn't yet honor it — smoke verifies the persistence half)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Smoke harness as phase gate — each new phase's smoke harness joins the gate chain; failures in any prior harness block the new phase's exit-0"
    - "Per-LRN graceful-skip — source-on-disk grep guards (FRUSTRATION_REGEX, failurePatternSchema, detectContext/effectiveProject, detectProject) let Wave 1/2 partial runs warn-skip without failing"
    - "Smoke isolation by stable IDs — silo_id='software-smoke-49' + scope_id='smoke-49-project' + session_id LIKE 'smoke-49-%' prefixes guarantee zero collision with production data; trap cleanup EXIT + entry-side cleanup makes the harness perfectly idempotent"
    - "Trigger-bypass test pattern: assert RAISE without bypass, then assert success with SET LOCAL inside BEGIN/COMMIT — proves both the trigger's enforcement AND its escape hatch in a single test"
    - "Schema-vs-doc divergence catch: plan template referenced kind/payload/source on intellect_events; live schema is event_type/details_json/source_type. Fix-on-discovery via psql \\d before write-time."

key-files:
  created:
    - "tests/smoke-49.sh"
    - "tests/fixtures/dream-response-pattern-detection.json"
    - ".planning/phases/49-pattern-detection/49-05-SUMMARY.md"
  modified: []

key-decisions:
  - "Mock injection via _mock_response_path body field (NOT DREAM_WORKER_MOCK_RESPONSE_PATH env var) — env vars don't propagate from curl to the backend process; body field is the 48.3-05 canonical contract."
  - "Pre-seed 4 moe-direct silo directives before fixture-mocked dream-run so refineableCount=0 → validateRefinementDoctrine permits the fixture's append-only new_directive via the early-return path. Avoids needing a supersede proposal in the fixture."
  - "Smoke project directives use scope='project'+scope_id='smoke-49-project' (NOT scope='silo'+scope_id='software-smoke-49') — keeps the smoke silo's refineableCount at 0 even with smoke-project directives present. The two scopes are independent in the doctrine engine."
  - "intellect_events live schema is source_type/event_type/details_json — plan template's source/kind/payload column names were wrong. Verified via psql \\d intellect_events; smoke uses correct names."
  - "directives.created_at/updated_at are double precision (epoch seconds) — must use EXTRACT(EPOCH FROM NOW()), NOT NOW(). Same precedent as smoke-48.3.sh lines 134-138."
  - "Cleanup uses SET LOCAL porter.allow_moe_direct_mutation = 'true' wrapped in BEGIN/COMMIT — the immutability trigger blocks ordinary DELETE on moe-direct seed rows even from psql. SET LOCAL requires a transaction."
  - "intellect_events cleanup keys on details_json->>'siloId'='software-smoke-49' OR details_json->>'suggestedScopeId'='smoke-49-project' — covers both dream_run_started/completed events (siloId) and dream_failure_pattern_detected (suggestedScopeId)."
  - "Per-LRN skip flags (SKIP_LRN_01..SKIP_LRN_04) gate each downstream check independently — Wave 1 partial runs print [skip] for unbuilt LRNs and exit 0. Phase gate semantics: gate is green when current-wave checks pass."
  - "LRN-04 detectProject probe imports from backend/dist/services/intellect/silo-detector.js (built artifact, not src/) — node CJS require needs the compiled output. Missing dist/ is [warn] not fail (gives developer-friendly 'rebuild backend' hint)."
  - "Backend reachability is a soft gate — schema/source-disk/trigger checks (LRN-03 CRUD, LRN-04 probe, partial-index check) run via psql regardless of Fastify state. HTTP-dependent checks (LRN-01 dream-run, LRN-02 audit, /context layering) gracefully skip with warn when /health unreachable."

patterns-established:
  - "Smoke harness shipped at end of phase (not Wave 0) — Phase 49 lifecycle was 'plan ahead, ship in waves' so the harness was authored AFTER its targets existed. Contrast with 48.1-05 + 48.2-05 + 48.3-01 + 48.4-01 which shipped Wave 0 before targets. Both patterns valid; Wave-end harness gets concrete schema/audit verbatim from disk."
  - "Pre-write schema verification: psql \\d <table> for every column referenced in WHERE/INSERT clauses BEFORE writing the smoke harness. Caught intellect_events source vs source_type + payload vs details_json mismatch + directives.created_at double-precision typing."
  - "Idempotent smoke contract = entry-side cleanup + trap cleanup EXIT + smoke-scoped IDs. The post-run leftover-count query (dream_runs/memory_proposals/directives/silos/turns ALL zero) is the canonical proof."

requirements-completed: [LRN-05]

# Metrics
duration: 18 min
completed: 2026-05-16
---

# Phase 49 Plan 05: Pattern Detection Smoke Harness Summary

**Single-shot phase gate (`bash tests/smoke-49.sh`) covers all five Phase 49 LRNs end-to-end — frustration force-include via live sampler+worker, failure-pattern insertion via fixture-mocked dream-run, project-scope CRUD + trigger immutability + bypass GUC, /context layering with cwd-derived projectId, detectProject node probe, plus self-test. Idempotent. Phase gate chain (smoke-48.1.sh → smoke-48.2.sh → smoke-48.3.sh → smoke-48.4.sh → smoke-49.sh) all exit 0; zero leftover smoke rows after run.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-16T21:03:53Z
- **Completed:** 2026-05-16T21:22:52Z
- **Tasks:** 2 (both auto)
- **Files created:** 3 (smoke harness + fixture + summary)
- **Files modified:** 0
- **Wave:** 3 (last plan in Phase 49)

## Accomplishments

- **`tests/fixtures/dream-response-pattern-detection.json` (Task 1)** — 31-line doctrine-compliant fixture with one `failure_patterns` entry (`suggested_scope='project'`, `suggested_scope_id='smoke-49-project'`, recurrence_count=3, evidence_turn_ids=[9101,9102,9103]) plus one regular `new_directive` proposal. evidence_turn_ids in 9000+ range to avoid corpus collision. `active_directive_count_before=6` engages doctrine. Validates against the updated Zod schema from 49-02 verbatim — 7 acceptance gates green (jq -e on every required field).
- **`tests/smoke-49.sh` (Task 2)** — 247-line bash harness, executable, idempotent. Covers:
  - **LRN-01** (frustration force-include): seeds 2 user turns with FRUSTRATION_REGEX-matching content in a smoke session, kicks a mock dream-run, asserts `dream_runs.action_config->'sampling'->>'frustration_forced' >= 1` and `frustration_forced_examples` array length >= 1. Live run: **frustration_forced=2** (both seeded turns force-included), **frustration_forced_examples length=2**.
  - **LRN-02** (failure-pattern insertion + audit): same mock run from LRN-01 uses the new fixture. Asserts: (a) one `memory_proposals` row with `proposed_metadata->>'source'='failure_pattern'` + `proposal_kind='new_directive'` + `sort_order` in [850,899], (b) `proposed_metadata->>'suggested_scope'='project'`, (c) one `intellect_events` row with `event_type='dream_failure_pattern_detected'` + `source_type='dream_worker'` + `details_json->>'dreamRunId'=$RUN_ID`, (d) `dream_runs.proposals_extracted=2` (1 proposal + 1 failure_pattern). Live run: **all 4 asserts green; sort_order=850**.
  - **LRN-03** (project-scope CRUD + trigger immutability + bypass GUC): inserts non-moe-direct project-scope directive → UPDATE succeeds (non-moe rows mutable). Inserts moe-direct project-scope directive → UPDATE without bypass MUST raise (trigger fires) → UPDATE with `BEGIN; SET LOCAL porter.allow_moe_direct_mutation='true'; UPDATE; COMMIT;` MUST succeed. **Proves the immutability trigger is scope-agnostic — it reads OLD.source_type only, fires uniformly across scope='silo' and scope='project'.**
  - **LRN-03+04** (/context layering): curl `/context?cwd=/home/lobster/projects/smoke-49-project` (NO ?project=) asserts `stats.projectIdSource='cwd'`, `stats.effectiveProject='smoke-49-project'`, markdown contains `### Project Directives (smoke-49-project)` header + smoke directive content. curl `/context?project=smoke-49-project` asserts `projectIdSource='query'`. Both-params-conflicting case (`?project=...&cwd=/home/lobster/projects/SomethingElse`) asserts explicit-wins precedence (`projectIdSource='query'`). Back-compat with porter-session-start hook preserved.
  - **LRN-04** (detectProject node probe): imports `backend/dist/services/intellect/silo-detector.js`, asserts `detectProject('/home/lobster/projects/ymc.capital/backend') === 'ymc.capital'`, `detectProject('/tmp/x') === null`, `detectProject(null) === null`. Missing dist/ is `[warn]` not fail.
  - **LRN-05** (self-test): asserts `test -x tests/smoke-49.sh`.
  - **Partial index check** (forward investment from 49-03): `pg_indexes` query for `idx_directives_scope_scope_id_status`. Non-fatal warn when missing.
- **Phase gate verified:** `bash tests/smoke-48.1.sh && bash tests/smoke-48.2.sh && bash tests/smoke-48.3.sh && bash tests/smoke-48.4.sh && bash tests/smoke-49.sh` — **all five exit 0**. Zero regression on prior phases.
- **Idempotency proven:** post-run leftover query returned `dream_runs:0, memory_proposals:0, directives:0, silos:0, turns:0` — zero smoke rows remain after `trap cleanup EXIT` fires.

## Task Commits

1. **Task 1: dream-response-pattern-detection fixture** — `75a9afc` (test)
2. **Task 2: smoke-49.sh harness** — `ec1222d` (test)

**Plan metadata commit:** to follow this SUMMARY (covers SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md).

## Files Created

- `tests/fixtures/dream-response-pattern-detection.json` — 31 lines. Mock dream response carrying one failure_patterns entry at project scope + one regular new_directive proposal. Per `49-RESEARCH.md` Output contract change spec.
- `tests/smoke-49.sh` — 247 lines, chmod +x. Bash harness covering LRN-01..LRN-05 with per-LRN graceful-skip + trap cleanup EXIT. Production-ready phase gate.
- `.planning/phases/49-pattern-detection/49-05-SUMMARY.md` — this file.

## Sample Output (fully-green Phase 49 system)

```
$ bash tests/smoke-49.sh
[ ok ] psql porter database reachable
[ ok ] LRN-04 detectProject present in silo-detector.ts
[ ok ] LRN-01 FRUSTRATION_REGEX present in dream-sampler.ts
[ ok ] LRN-02 failure_patterns schema present
[ ok ] LRN-03 /context handler refactored with detectContext + effectiveProject
[ ok ] LRN-03 partial index idx_directives_scope_scope_id_status present
[ ok ] smoke silo + 4 moe-direct seeds inserted
[ ok ] LRN-04 detectProject probe: ymc.capital + /tmp/x + null boundaries correct
[ ok ] LRN-03: project-scope directive INSERT succeeded
[ ok ] LRN-03: project-scope non-moe-direct UPDATE succeeded
[ ok ] LRN-03: trigger fired on scope='project' moe-direct UPDATE (immutability holds across scopes)
[ ok ] LRN-03: bypass GUC allows scope='project' moe-direct UPDATE — trigger is scope-agnostic
[ ok ] backend reachable at http://127.0.0.1:3001/health
[ ok ] LRN-01: seeded 2 frustration user-turns in smoke session
[ ok ] LRN-01: frustration_forced=2 (Pass A0 active)
[ ok ] LRN-01: frustration_forced_examples length=2 (audit field populated)
[ ok ] LRN-02: 1 failure-pattern row inserted
[ ok ] LRN-02: failure_pattern sort_order=850 in [850, 899] band
[ ok ] LRN-02: failure_pattern carries suggested_scope='project'
[ ok ] LRN-02: dream_failure_pattern_detected audit event present
[ ok ] LRN-02: dream_runs.proposals_extracted=2 (proposals + failure_patterns rolled up)
[ ok ] LRN-03 + LRN-04: cwd-only /context returns Project Directives + projectIdSource='cwd' + effectiveProject='smoke-49-project'
[ ok ] LRN-03: explicit ?project= /context returns Project Directives + projectIdSource='query'
[ ok ] LRN-03: explicit ?project= wins over conflicting ?cwd= (back-compat with hook)
[ ok ] LRN-05: smoke harness present + executable

all checks green for current wave
```

## Phase Gate Command Chain

```bash
bash tests/smoke-48.1.sh && \
bash tests/smoke-48.2.sh && \
bash tests/smoke-48.3.sh && \
bash tests/smoke-48.4.sh && \
bash tests/smoke-49.sh
```

All five exit 0. Phase 49 is gate-green.

## Trigger Scope-Agnosticism Note

LRN-03's project-scope moe-direct UPDATE test is structurally meaningful: it **proves the `directive_immutable_moe_direct` trigger is scope-agnostic**. The trigger function reads `OLD.source_type` only — it never inspects `OLD.scope`. Smoke-49 verifies:

1. UPDATE without bypass on a `scope='project', source_type='moe-direct'` row raises (trigger fires).
2. UPDATE with `SET LOCAL porter.allow_moe_direct_mutation='true'` inside a transaction succeeds.

This complements smoke-48.1's SC-3 (which only exercised `scope='silo'` moe-direct rows). Together they prove the trigger gate is uniform across all scopes that can host moe-direct directives.

## Decisions Made

See `key-decisions` in the frontmatter for the full list. The structurally important calls:

1. **Mock injection via `_mock_response_path` body field, not env var.** Env vars don't propagate from curl to the backend process. 48.3-05 wired the body-field path explicitly.
2. **Pre-seed 4 moe-direct silo directives** so the smoke silo's `refineableCount` stays at 0 → `validateRefinementDoctrine` early-returns and the fixture's append-only new_directive lands without doctrine violation.
3. **Smoke project directives use `scope='project'+scope_id='smoke-49-project'`** (not silo-scoped) — keeps the smoke silo's refineableCount at 0 even with smoke-project directives present.
4. **Pre-write schema verification** caught two plan-template bugs: intellect_events column names (`source_type`/`event_type`/`details_json`, not `source`/`kind`/`payload`) and `directives.created_at` typing (`double precision` epoch seconds via `EXTRACT(EPOCH FROM NOW())`, not `NOW()`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan template referenced wrong intellect_events column names**

- **Found during:** Task 2 pre-write schema review (psql \d intellect_events)
- **Issue:** Plan's `<action>` block specified `WHERE source='dream_worker' AND kind='dream_failure_pattern_detected' AND payload->>'dreamRunId'='$RUN_ID'`. Live schema has columns `source_type`, `event_type`, `details_json` — the plan's column names would produce a SQL error every time the smoke ran.
- **Fix:** Swapped all three column references in the LRN-02 audit-event check to match live schema. Verified by running the smoke and seeing `[ ok ] LRN-02: dream_failure_pattern_detected audit event present` (correct row count of 1).
- **Verification:** `grep -c "details_json" tests/smoke-49.sh` returns 3 (cleanup + LRN-02 check + cleanup OR clause). Zero references to the wrong column names.
- **Files modified:** `tests/smoke-49.sh` (initial write — bug never reached disk)
- **Committed in:** `ec1222d` (initial commit with correct names)

**2. [Rule 1 — Bug] Plan template used `NOW()` for `directives.created_at`/`updated_at`**

- **Found during:** Task 2 pre-write schema review (psql \d directives)
- **Issue:** `directives.created_at` and `updated_at` are `double precision` (epoch seconds, per CONTEXT lock from 48.1-01). Plan template used `NOW()` which would have produced a type error.
- **Fix:** All 4 INSERT statements in smoke-49.sh use `EXTRACT(EPOCH FROM NOW())` (mirrors smoke-48.3.sh lines 134-138 precedent).
- **Verification:** Smoke runs green; all directive INSERTs succeed.
- **Files modified:** `tests/smoke-49.sh` (initial write — bug never reached disk)
- **Committed in:** `ec1222d` (initial commit with correct typing)

**Total deviations:** 2 auto-fixed (2 bugs — both caught at pre-write schema verification, zero runtime impact).
**Impact on plan:** Zero — the plan's INTENT (smoke harness covering LRN-01..LRN-05) is fully met. The two schema-name bugs in the plan template would have made the harness unrunnable; fixing them at write-time preserved the entire success criterion.

## Issues Encountered

None. Both task commits landed first try after pre-write schema verification corrected the two plan-template bugs documented above.

## User Setup Required

None — pure tests/ work. No backend code touched; no Porter restart needed.

## Self-Check: PASSED

- `tests/fixtures/dream-response-pattern-detection.json` exists: YES
- `tests/smoke-49.sh` exists + executable: YES (chmod +x verified)
- `bash -n tests/smoke-49.sh` exits 0: YES (syntax clean)
- Commit `75a9afc` exists in git log: YES (verified via `git log --oneline | grep 75a9afc`)
- Commit `ec1222d` exists in git log: YES (verified via `git log --oneline | grep ec1222d`)
- All Task 1 acceptance gates pass (jq -e on 7 fields)
- All Task 2 acceptance gates pass (12 grep checks + executable + fail-count >= 10)
- Live run all-green: every LRN check emits `[ ok ]`
- Idempotency proven: post-run leftover query returns 0 across all 5 smoke tables
- Phase gate green: smoke-48.1.sh through smoke-49.sh all exit 0

## Next Phase Readiness

- **Phase 49 is gate-green.** All 5 plans shipped (49-01 frustration sampler, 49-02 failure patterns parser+worker, 49-03 /context project layering, 49-04 detectProject, 49-05 smoke harness). All 5 LRN requirements complete.
- **Next:** Phase 50 (MSF — multi-silo expansion, admin/data-room silos). See ROADMAP.md.
- **Phase 51 DRX-02 carry-forward:** 48.4 accept handler does NOT yet read `proposed_metadata.suggested_scope` from failure-pattern rows. Smoke-49 verifies the persistence half (suggested_scope='project' survives the INSERT). The honor-on-accept half is Phase 51 work; smoke harness will need to extend with an accept-flow check when DRX-02 ships.

---
*Phase: 49-pattern-detection*
*Completed: 2026-05-16*
