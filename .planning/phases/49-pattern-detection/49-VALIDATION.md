---
phase: 49
slug: pattern-detection
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-16
---

# Phase 49 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Mirrors the 48.3/48.4 validation strategy files. Confirms `workflow.nyquist_validation: true` (default per task spec — no config.json key needed).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bash smoke harness (`tests/smoke-49.sh`) + tsc typecheck. Smoke covers LRN-01..LRN-05 via psql + curl + jq + node import probe. No Playwright (UI-free phase). |
| **Config files** | None — smoke harness is self-contained. Mock fixture at `tests/fixtures/dream-response-pattern-detection.json` (created in plan 49-05). |
| **Quick run command** | `bash tests/smoke-49.sh` (~30s end-to-end on a green Porter) |
| **Full suite command** | `bash tests/smoke-48.1.sh && bash tests/smoke-48.2.sh && bash tests/smoke-48.3.sh && bash tests/smoke-48.4.sh && bash tests/smoke-49.sh` (phase-gate regression posture) |
| **Estimated runtime** | ~30s smoke. Idempotent, self-cleaning via `trap cleanup EXIT` using smoke silo `software-smoke-49` + smoke project `smoke-49-project` + smoke session prefix `smoke-49-`. |

---

## Per-Requirement Validation Map

| Requirement | Validation Method | Sampling Class | Failure Mode Caught | Covered In Plan |
|-------------|-------------------|----------------|---------------------|-----------------|
| **LRN-01** — Frustration-marker boost (Pass A0) in dream-sampler | Static source-grep + live HTTP smoke. `tests/smoke-49.sh` LRN-01 block: grep for FRUSTRATION_REGEX + frustration_forced; INSERT 2 frustration user-turns; POST /dream-run with mock; assert `dream_runs.action_config->'sampling'->>'frustration_forced'` ≥ 1 and `frustration_forced_examples` array non-empty | Wave 0 fixture (dream-response-pattern-detection.json — created in 49-05) | FRUSTRATION_REGEX not added, Pass A0 not inserted, samplingLog fields missing, recency-first sort inverted to length-first, assistant turns leak into Pass A0, budget cap ignored | Plan 49-01 (sampler change), Plan 49-05 (smoke verification) |
| **LRN-02** — Dream prompt rewrite + failure-pattern proposals (parser + worker) | Static source-grep + live HTTP smoke. Plan 49-05 LRN-02 block: grep for failurePatternSchema in dream-parser.ts; POST /dream-run with the pattern-detection fixture; assert: 1 memory_proposals row with `proposed_metadata->>'source'='failure_pattern'`, `proposal_kind='new_directive'`, `sort_order` ∈ [850, 899], `suggested_scope='project'`; 1 intellect_event of kind='dream_failure_pattern_detected'; dream_runs.proposals_extracted = proposals.length + failure_patterns.length | Wave 0 fixture (dream-response-pattern-detection.json) | Section missing from software.md, Zod schema doesn't accept failure_patterns, worker doesn't insert failure_pattern rows, sort_order outside band, audit event missing, count rollup wrong | Plan 49-02 (prompt + parser + worker), Plan 49-05 (smoke) |
| **LRN-03** — Project-scope directive read (/context) + index + trigger uniformity | Static source-grep + psql DDL probe + live HTTP smoke. Plan 49-05 LRN-03 block: grep for `effectiveProject`/`detectContext` in intellect.ts; psql confirms `idx_directives_scope_scope_id_status` index exists (post-restart); INSERT non-moe-direct project-scope directive → UPDATE succeeds → INSERT moe-direct project-scope row → UPDATE without bypass EXPECTED TO FAIL (trigger fires) → UPDATE with bypass GUC succeeds; curl `/context?project=...` returns `stats.projectIdSource='query'`; both-params call honors explicit `project=` | Wave 0 (no fixture needed — psql + curl + jq) | Handler still uses explicit project only, trigger leaks across scopes (would be a SECURITY regression), index missing (perf-only — non-fatal), section header wrong, stats fields missing | Plan 49-03 (handler + migration), Plan 49-05 (smoke) |
| **LRN-04** — `detectProject` server-side + `detectContext` composite | Static source-grep + node import probe + live HTTP smoke. Plan 49-05 LRN-04 block: grep for `export function detectProject` in silo-detector.ts; node-side import probe asserts: `detectProject('/home/lobster/projects/ymc.capital/backend')==='ymc.capital'`, `detectProject('/tmp/x')===null`, `detectProject(null)===null`; curl `/context?cwd=/home/lobster/projects/smoke-49-project` returns `stats.projectIdSource='cwd'` AND `stats.effectiveProject='smoke-49-project'` | Wave 0 (no fixture; node probe uses built dist/) | Function missing, regex differs from hook regex, returns wrong value for nested cwd, /context doesn't wire detectContext, projectIdSource not reported | Plan 49-04 (silo-detector), Plan 49-03 (/context wiring), Plan 49-05 (smoke) |
| **LRN-04 (trigger uniformity)** — directive_immutable_moe_direct fires uniformly on scope='project' moe-direct rows | psql -v ON_ERROR_STOP=1 expects exception | Wave 0 (no fixture) | Trigger reads OLD.scope/OLD.scope_id by mistake, breaking scope='project' immutability | Plan 49-05 (smoke; trigger itself unchanged across phase 49) |
| **LRN-05** — Smoke harness self-test | `test -x tests/smoke-49.sh` + harness exits 0 on green system AND emits `[skip]` (not `[FAIL]`) on partial-Wave systems | smoke (self) + meta-check | Smoke script missing, not executable, no graceful skip for pre-implementation waves, no per-LRN gating, missing cleanup trap | Plan 49-05 (creates) |

---

## Nyquist Coverage

Every Wave≥1 task has an automated `<verify>` block:

- **Plan 49-01 Task 1** — `<verify>` runs `tsc --noEmit` + greps for FRUSTRATION_REGEX, is_frustration tagging, Pass A0 user-role filter, recency-first sort. Behavioral verification via smoke 49-05.
- **Plan 49-02 Task 1** — `<verify>` greps for `## Failure Patterns` section header, all 6 contract fields, self-check item, AND uses an `awk` test to confirm section ordering (after Hard Rules, before Output).
- **Plan 49-02 Task 2** — `<verify>` runs `tsc --noEmit` + greps for failurePatternSchema, ParsedFailurePattern type export, Zod min(2) constraints. Behavioral verification via smoke 49-05.
- **Plan 49-02 Task 3** — `<verify>` runs `tsc --noEmit` + greps for slugifyPatternName, sort_order band 850+, dream_failure_pattern_detected event kind, totalProposals rollup. Behavioral verification via smoke 49-05.
- **Plan 49-03 Task 1** — `<verify>` checks migration file exists + content + uses psql to assert index landed (or accepts deferred check via smoke 49-05).
- **Plan 49-03 Task 2** — `<verify>` runs `tsc --noEmit` + greps for `detectContext` import, `effectiveProject` derivation, `projectIdSource`, `server-derived` annotation. Behavioral verification via smoke 49-05.
- **Plan 49-04 Task 1** — `<verify>` runs `tsc --noEmit` + greps for new exports + an inline node script that runs 7 boundary cases of the regex pattern. Behavioral verification via smoke 49-05.
- **Plan 49-05 Task 1** — `<verify>` validates fixture JSON shape + Zod-relevant constraints (recurrence_count ≥ 2, evidence_turn_ids length ≥ 2, suggested_scope enum).
- **Plan 49-05 Task 2** — `<verify>` validates smoke script syntax + executability + presence of all key markers (LRN-* coverage, mock contract, smoke isolation, trigger test, bypass GUC test).

All five LRN requirements have automated assertions in plan 49-05's smoke harness. No 3 consecutive tasks lack automated verify.

---

## Sampling Rate

- **After every task commit:** `cd backend && npx tsc --noEmit` (zero new errors) — Porter's canonical "did it compile" gate.
- **After every plan wave:** the smoke script run with appropriate graceful-skip — Wave 1 (49-01/49-02/49-04 land): `bash tests/smoke-49.sh` exits 0 with [skip] for LRN-03 paths (until plan 49-03 lands). Wave 2 (49-03 lands): LRN-03 paths unskip. Wave 3 (49-05 lands): full coverage.
- **Phase gate:** all five smoke scripts (48.1 + 48.2 + 48.3 + 48.4 + 49) exit 0 AND `/health` returns the post-49 Porter version (no version bump expected for phase 49 — internal memory layer; bump deferred to milestone phase 52 ship).
- **Max feedback latency:** ~30 seconds (smoke 49 only) or ~2 minutes (all 5 smoke scripts).

---

## Wave 0 Requirements

- [ ] `tests/smoke-49.sh` — covers LRN-01..LRN-05 with graceful-skip + smoke-silo + smoke-project isolation + trigger immutability test (Plan 49-05 creates)
- [ ] `tests/fixtures/dream-response-pattern-detection.json` — Zod-valid mock with 1 failure_pattern (project-scope) + 1 ordinary new_directive (Plan 49-05 creates)
- [ ] No framework install needed — `bash`, `psql`, `curl`, `jq`, `node` already present
- [ ] Mock-injection contract honored: smoke uses `mockResponsePath` body field (defined by Plan 48.3-01, honored by Plan 48.3-04 — unchanged in Phase 49)
- [ ] Trigger contract documented: `directive_immutable_moe_direct` fires on OLD.source_type='moe-direct' regardless of scope value; bypass via `SET LOCAL porter.allow_moe_direct_mutation = 'true'` (verified in research; smoke confirms in production)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real (non-mocked) dream-run against the live software corpus surfaces the YMC logo pattern (or any current recurring frustration) | LRN-01 + LRN-02 end-to-end with real Sonnet | Smoke harness uses fixtures for determinism; the real model behavior is non-deterministic and requires a real Bridge dispatch. The whole point of Phase 49 is the v1 ability to catch real patterns. | After ship + at least one captured turn matching FRUSTRATION_REGEX in the last 7 days, manually trigger a dream-run on the real `software` silo via `curl -X POST http://127.0.0.1:3001/api/v1/intellect/dream-run -H 'Content-Type: application/json' -d '{"silo_id":"software"}'`. Inspect the resulting memory_proposals rows in admin /dreams. Confirm at least one row has `proposed_metadata->>'source'='failure_pattern'` OR confirm that the run sampled the frustration turn (`SELECT action_config->'sampling'->>'frustration_forced_examples' FROM dream_runs ORDER BY started_at DESC LIMIT 1`). |
| /context returns project-scope directives for a new YMC CLI session WITHOUT explicit ?project= (i.e., proves the cwd→project derivation works in the real hook flow) | LRN-03 + LRN-04 | Hook + server interaction can only be observed in a live session start | Open a fresh CLI in `/home/lobster/projects/ymc.capital`. The session-start hook fires automatically. Inspect the injected context — Project Directives section should list ymc.capital rules. Cross-check via `curl 'http://127.0.0.1:3001/api/v1/intellect/context?cwd=/home/lobster/projects/ymc.capital' | jq -r .data.context` — should be identical content. |
| Admin reviewer can accept a failure-pattern proposal (limitation: stays at silo-scope in Phase 49; project-scope acceptance deferred to Phase 51 DRX-02) | LRN-02 end-to-end through 48.4 UI | The 48.4 accept handler reads only proposal_kind in v7.0; the `proposed_metadata.suggested_scope` field is dormant until DRX-02 ships | After a real dream-run produces a failure_pattern proposal, navigate to admin /dreams. Click the proposal. Verify the accept button works and inserts a directive at scope='silo' (the existing accept-flow path). Note the limitation in the SUMMARY: a project-scope directive can be created manually via admin Directives tab if desired. |

These manual checks are NOT gated to any specific task — they happen post-ship in normal operation. The smoke harness covers the deterministic verification.

---

## Validation Sign-Off

- [ ] All implementation tasks have `<automated>` verify blocks (confirmed by plan-checker)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`tests/smoke-49.sh`, `tests/fixtures/dream-response-pattern-detection.json`)
- [ ] Graceful skip for pre-implementation runs; per-LRN gating uses source-on-disk grep, NOT environment flags
- [ ] Smoke silo isolation (`silo_id='software-smoke-49'`) + smoke project isolation (`scope_id='smoke-49-project'`) documented — production directives are never mutated
- [ ] Mock-injection contract reused from Phase 48.3 — no new mock plumbing introduced
- [ ] Trigger immutability across scopes is verified IN smoke, not assumed — psql -v ON_ERROR_STOP=1 catches a scope-leak regression
- [ ] Bypass-GUC path is exercised (positive AND negative) so production cleanup queries that use it continue to work
- [ ] dream_runs.proposals_extracted rollup includes failure_patterns count (Plan 49-02 must_haves enforces; Plan 49-05 smoke verifies)
- [ ] /context back-compat preserved: explicit `?project=` wins over server-derived projectId — verified in smoke (Plan 49-05) and in production hook flow (live since v6.x)

**Approval:** pending (post-revision)
