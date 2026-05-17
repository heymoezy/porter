---
phase: 50
slug: multi-silo-foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-16
---

# Phase 50 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Mirrors the 49 validation strategy. Confirms `workflow.nyquist_validation: true` (default per task spec — no config.json key needed).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bash smoke harness (`tests/smoke-50.sh`) + tsc/build typecheck. Smoke covers MSF-01..MSF-04 via psql + curl + jq. No Playwright (no UI surface in Phase 50). |
| **Config files** | None — smoke harness is self-contained. Two mock fixtures at `tests/fixtures/dream-response-admin.json` + `dream-response-data-room.json` (created in Plan 50-04). One synthetic fixture-prompt at `tests/fixtures/dream-prompts/msf-03-synthetic.md` (created + deleted by the smoke script). |
| **Quick run command** | `bash tests/smoke-50.sh` (~30s end-to-end on a green Porter) |
| **Full suite command** | `bash tests/smoke-48.1.sh && bash tests/smoke-48.2.sh && bash tests/smoke-48.3.sh && bash tests/smoke-48.4.sh && bash tests/smoke-49.sh && bash tests/smoke-50.sh` (phase-gate regression posture; Phase 49 must continue to green) |
| **Estimated runtime** | ~30s smoke. Idempotent, self-cleaning via `trap cleanup EXIT` using synthetic silo `msf-03-synthetic` + fixture-prompt path `tests/fixtures/dream-prompts/msf-03-synthetic.md`. Production seeds (admin, data-room) are READ ONLY — never UPDATEd or DELETEd by smoke. |

---

## Per-Requirement Validation Map

| Requirement | Validation Method | Sampling Class | Failure Mode Caught | Covered In Plan |
|-------------|-------------------|----------------|---------------------|-----------------|
| **MSF-01** — Admin silo seed (row + 4 directives + admin.md + marker file) | Static file-exists + DB psql + HTTP smoke. SC-1..SC-5: silos row + cadence 259200 + 4 moe-direct directives + admin.md exists + admin/frontend/.admin-silo exists. SC-21: dream-worker dispatches against admin silo (silo-agnostic dispatch via mock fixture). SC-4: trigger immutability on `silo-admin-rbac-platform-admin-guard` UPDATE without bypass. | Wave 0 fixtures (dream-response-admin.json — created in 50-04) | silos row not inserted; directive count off; admin.md not on disk; marker file missing; trigger leaks; dispatch fails to dispatch | Plan 50-02 (admin seed + prompt + marker), Plan 50-04 (smoke) |
| **MSF-02** — Data-room silo seed (row + 5 directives + data-room.md + 4 marker files across 2-3 repos) | Static file-exists + DB psql + HTTP smoke. SC-6..SC-10: silos row + cadence 604800 + 5 moe-direct directives + data-room.md exists + ≥2 of 4 .data-room-silo marker files. SC-22: dream-worker dispatches against data-room silo. SC-9: trigger immutability on `silo-dataroom-no-synthetic-exhibits`. SC-20: /context from ymc.capital/dealdocs emits ONLY Data Room section (single-match correct). | Wave 0 fixtures (dream-response-data-room.json — created in 50-04) | silos row not inserted; directive count off; data-room.md not on disk; marker files missing (≥2 floor); trigger leaks; multi-match leaks software/admin into data-room cwds | Plan 50-03 (data-room seed + prompt + 4 cross-repo markers), Plan 50-04 (smoke) |
| **MSF-03** — Silo-agnostic enrollment workflow | Empirical proof via synthetic silo. SC-11: INSERT a `silos` row id='msf-03-synthetic' + write a stub prompt file + POST /dream-run with that silo_id + mock — assert dream_run created + reaches 'completed'. Cleanup removes silos row + dream_runs + prompt file. SC-12: empty-body POST defaults to software (documented fallback). SC-13: nonexistent silo_id returns 404. SC-14: grep for 'SAFE DEFAULT (Phase 50 MSF-03)' at both default sites = 1 each. | Wave 0 (no fixture — smoke writes inline stub prompt) | silo-locked code path; default removed; 404 not returned; SAFE DEFAULT comments missing | Plan 50-01 (doc comments at workflow-engine.ts + intellect.ts default sites), Plan 50-04 (synthetic-silo enrollment proof in smoke) |
| **MSF-04** — Per-silo dream cadence wired | Source-on-disk grep + DB cadence values + legacy workflow row check. SC-15: psql confirms cadence_seconds per silo (software 604800, admin 259200, data-room 604800). SC-16: grep for `runSiloCadenceCheck` + `SILO_CADENCE_CHECK_INTERVAL = 1800` in scheduler.ts. SC-17: grep confirms checkSkipRecent reads `cadence_seconds FROM silos WHERE id` AND legacy `SKIP_RECENT_THRESHOLD_S` constant is DELETED (zero hits). SC-18: psql confirms legacy 'Software dream — weekly consolidation' workflow row count = 0. | Wave 0 (no fixture; psql + grep) | scheduler tick missing; constant not removed; legacy workflow row not deleted; cadence values wrong; floor calculation regression | Plan 50-01 (scheduler refactor + checkSkipRecent rewrite + migration delete), Plan 50-04 (smoke) |
| **Cross — Migration record** | `SELECT count(*) FROM schema_migrations WHERE id='multi_silo_v1'` returns 1 after first deployment | Wave 0 | Migration ran partially / didn't run / ran twice | Plan 50-01 (scaffold), Plan 50-02 (admin INSERTs), Plan 50-03 (data-room INSERTs), Plan 50-04 (smoke SC-23) |
| **Cross — Multi-silo /context layering** | SC-19: from cwd /home/lobster/projects/Porter/admin/frontend, /context emits BOTH `## Silo: Software Development` AND `## Silo: Admin & Platform Operations` sections (multi-match correctness). SC-20: from ymc.capital/dealdocs, ONLY `## Silo: Data Room & Fund Operations` is emitted (single-match — no false positives). | Wave 0 (no fixture; curl + grep) | Multi-match broken; cache not reloaded post-migration; detect_rules misconfigured; marker file in wrong path | Plans 50-02 + 50-03 (marker placement), Plan 50-04 (smoke) |

---

## Nyquist Coverage

Every Wave≥1 task has an automated `<verify>` block:

- **Plan 50-01 Task 1** — `<verify>` checks migration file exists with idempotent guard, BEGIN/COMMIT, DELETE statement, schema_migrations INSERT, and both `PLAN 50-02:` and `PLAN 50-03:` placeholder comments. Also asserts `index.ts` registers the migration in the correct slot (after migrateDirectivesScopeIdxV1, before loadSiloCache). Runs `npm run build` for type-check.
- **Plan 50-01 Task 2** — `<verify>` greps confirm SKIP_RECENT_THRESHOLD_S constant DELETED, new per-silo SELECT shape present, `cadenceSeconds` and `recent_run_within_cadence_floor` strings present, legacy `recent_run_within_6_5_days` string GONE. `npm run build` clean.
- **Plan 50-01 Task 3** — `<verify>` greps for runDreamWorker import, SILO_CADENCE_CHECK_INTERVAL = 1800 constant, runSiloCadenceCheck function, tick-branch invocation, scheduler:silo-cadence log namespace. `npm run build` clean.
- **Plan 50-01 Task 4** — `<verify>` greps for `SAFE DEFAULT (Phase 50 MSF-03)` doc comment at both default sites (workflow-engine.ts + intellect.ts), confirmed adjacent to the `?? 'software'` line at each site. `npm run build` clean.
- **Plan 50-02 Task 1** — `<verify>` greps confirm admin silos row INSERT present in migrate-multi-silo-v1.ts (id='admin', display_name, cadence 259200, prompt_path, .admin-silo marker in detect_rules), all 4 directive ids present, PLAN 50-03 placeholder still intact. `npm run build` clean.
- **Plan 50-02 Task 2** — `<verify>` greps confirm admin.md exists with correct header, admin-domain framing (operator/platform-operations), no leftover software-specific phrasing, substitution variables present, Failure Patterns section present, ≥100 lines.
- **Plan 50-02 Task 3** — `<verify>` confirms admin/frontend/.admin-silo exists with marker comment and is NOT in .gitignore.
- **Plan 50-02 Task 4** (checkpoint:human-action) — verified manually by inspecting ymc.capital repo for committed marker. Plan 50-04 smoke harness SC-19 catches if the marker is missing at runtime (multi-silo /context check fails).
- **Plan 50-03 Task 1** — `<verify>` greps confirm data-room silos row INSERT (id='data-room', cadence 604800, prompt_path, .data-room-silo marker) + all 5 directive ids present. `npm run build` clean.
- **Plan 50-03 Task 2** — `<verify>` greps confirm data-room.md exists with correct header, data-room-domain framing, substitution variables, Failure Patterns section, ≥100 lines.
- **Plan 50-03 Task 3** (checkpoint:human-action) — verified manually via cross-repo commit/disk-write inspection. Plan 50-04 smoke harness SC-10 catches if fewer than 2 of 4 marker files are present.
- **Plan 50-04 Task 1** — `<verify>` validates both fixtures: valid JSON, shape conforms to Zod schema (proposals[0].kind, conceptual_area, source_evidence.sample_turn_ids length ≥ 2), failure_patterns is empty array (Phase 50 scope), correct domain conceptual_area per silo.
- **Plan 50-04 Task 2** — `<verify>` validates smoke script: syntactically valid (`bash -n`), executable, presence of all key markers (MSF-* coverage, synthetic silo isolation, mock contract, trigger test, scheduler grep, default-doc-comment grep, multi-silo /context assertions), `grep -c "fail \"MSF-"` ≥ 10.

All four MSF requirements have automated assertions in Plan 50-04's smoke harness. No 3 consecutive tasks lack automated verify.

---

## Sampling Rate

- **After every task commit:** `cd backend && npm run build` (zero new errors) — Porter's canonical "did it compile" gate.
- **After every plan wave:** the smoke script run with appropriate graceful-skip — Wave 1 (50-01): `bash tests/smoke-50.sh` exits 0 with [skip] for MSF-01/02 paths (until plans 50-02/03 ship). Wave 2 (50-02 + 50-03 land): MSF-01 + MSF-02 paths unskip. Wave 3 (50-04 lands): full coverage.
- **Phase gate:** all six smoke scripts (48.1 + 48.2 + 48.3 + 48.4 + 49 + 50) exit 0 AND `/health` returns the post-50 Porter version (no version bump expected for Phase 50 — internal memory layer; bump deferred to milestone phase 52 ship per CLAUDE.md L4 convention).
- **Max feedback latency:** ~30 seconds (smoke 50 only) or ~3 minutes (all 6 smoke scripts in sequence).

---

## Wave 0 Requirements

- [ ] `tests/smoke-50.sh` — covers MSF-01..MSF-04 + silo-agnostic synthetic-silo enrollment + multi-silo /context layering (Plan 50-04 creates)
- [ ] `tests/fixtures/dream-response-admin.json` — Zod-valid mock with 1 new_directive proposal in admin domain, empty failure_patterns (Plan 50-04 creates)
- [ ] `tests/fixtures/dream-response-data-room.json` — Zod-valid mock with 1 proposal in data-room domain, empty failure_patterns (Plan 50-04 creates)
- [ ] `backend/src/db/migrate-multi-silo-v1.ts` — Plan 50-01 scaffold + DELETE legacy workflow row + schema_migrations marker. Plans 50-02/03 fill in silo + directive INSERTs at the placeholder comments.
- [ ] `backend/src/services/intellect/dream-prompts/admin.md` — Plan 50-02 creates
- [ ] `backend/src/services/intellect/dream-prompts/data-room.md` — Plan 50-03 creates
- [ ] Marker files (cross-repo): admin/frontend/.admin-silo (Porter), site/app/routes/admin/.admin-silo (ymc.capital), dealdocs/.data-room-silo (ymc.capital), workoutdocs/.data-room-silo (ymc.capital), Funds/.data-room-silo (Funds), ymc.capital-private/workoutdocs/.data-room-silo (ymc.capital-private). Plans 50-02/03 create.
- [ ] No new framework install needed — `bash`, `psql`, `curl`, `jq` already present.
- [ ] Mock-injection contract honored: smoke uses `mockResponsePath` body field (Phase 48.3 contract, honored by 48.3-04, unchanged in Phases 49 + 50).
- [ ] Trigger contract documented: `directive_immutable_moe_direct` fires on OLD.source_type='moe-direct' regardless of scope value — verified in Phase 49 LRN-03 (scope='project' rows protected) and reverified in Phase 50 smoke for scope='silo' admin/data-room rows.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real (non-mocked) dream-run against the live admin silo on day-3 of the cadence produces sensible refinement proposals | MSF-01 end-to-end with real Sonnet | Smoke harness uses fixtures for determinism; real model behavior on the admin transcript corpus is non-deterministic | After ship, wait 3 days (or trigger manually: `curl -X POST http://127.0.0.1:3001/api/v1/intellect/dream-run -H 'Content-Type: application/json' -d '{"silo_id":"admin","triggeredBy":"manual"}'`). Open admin /dreams. Inspect proposals — should be admin/operator-workflow themed (audit hygiene, RBAC, SSE, bulk-action UX). Reject any cross-silo bleed (code style, design system, fund/legal). |
| Real dream-run against the live data-room silo produces sensible proposals from the fund-ops corpus | MSF-02 end-to-end with real Sonnet | Same reason as MSF-01 | Trigger: `curl -X POST .../dream-run -d '{"silo_id":"data-room","triggeredBy":"manual"}'`. Inspect proposals — should be data-room themed (citation discipline, confidentiality, regulatory filer profile, strategic communication). Reject any code/admin bleed. |
| Per-silo cadence tick fires every hour AND respects per-silo intervals after a real 3-day window has elapsed for admin | MSF-04 in production | Hour-granularity scheduler ticks can only be observed in live operation | Watch porter-fastify logs for `[scheduler:silo-cadence]` lines. After admin's first 3-day window post-deploy, observe a `dream_run_started` audit event with siloId='admin' and triggeredBy='schedule'. If the dream_run_skipped event fires instead with reason='recent_run_within_cadence_floor' AND cadenceSeconds=259200, the floor calculation is correct. |
| ymc.capital admin marker file fires the admin silo when working from a fresh CLI session in /home/lobster/projects/ymc.capital | MSF-01 cross-repo coordination | Hook + server interaction can only be observed in a live session start | Open a fresh CLI in `/home/lobster/projects/ymc.capital/site/app/routes/admin/`. The session-start hook fires automatically. Inspect injected context — should list admin silo's 4 active directives. Cross-check via `curl 'http://127.0.0.1:3001/api/v1/intellect/context?cwd=/home/lobster/projects/ymc.capital/site/app/routes/admin' | jq -r .data.context` — should match. |
| Funds + ymc.capital-private marker files fire data-room silo when working from those project roots | MSF-02 cross-repo coordination | Same reason | Open a fresh CLI in `/home/lobster/projects/Funds/`. Inspect context — should list data-room silo's 5 directives. Same for `/home/lobster/projects/ymc.capital-private/workoutdocs/` if that repo exists. |
| Admin reviewer can accept/reject admin or data-room silo proposals in the /dreams review surface | Cross-MSF UI interaction | Admin accept handler is Phase 48.4 code; this verifies it routes correctly across silos | Trigger real dream-runs for admin + data-room (manual triggers above). Navigate to admin /dreams. Confirm proposals from BOTH new silos appear in the list (filter by silo if the dropdown is hardcoded — note: Phase 51 DRX-04 makes it dynamic). Accept one admin proposal + one data-room proposal — verify directives rows are created at scope='silo' with correct scope_id. |

These manual checks are NOT gated to any specific task — they happen post-ship in normal operation. The smoke harness covers the deterministic verification.

---

## Validation Sign-Off

- [ ] All implementation tasks have `<automated>` verify blocks (confirmed by plan-checker)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`tests/smoke-50.sh`, `tests/fixtures/dream-response-admin.json`, `tests/fixtures/dream-response-data-room.json`, `backend/src/db/migrate-multi-silo-v1.ts`, both dream-prompts files, all marker files)
- [ ] Graceful skip for pre-implementation runs; per-MSF gating uses source-on-disk grep + DB existence check, NOT environment flags
- [ ] Synthetic silo isolation (`silo_id='msf-03-synthetic'`) documented — production seeds (admin, data-room) are NEVER mutated by smoke
- [ ] Mock-injection contract reused from Phase 48.3 — no new mock plumbing introduced
- [ ] Trigger immutability is verified IN smoke for BOTH admin (SC-4) and data-room (SC-9) seeds, not assumed — catches a scope-leak regression
- [ ] Cross-repo coordination documented: Plans 50-02 + 50-03 each have a `checkpoint:human-action` task for the non-Porter repo commits. Smoke harness SC-10 has a 2-of-4 floor for data-room markers (Funds + ymc.capital-private may legitimately be non-git or absent)
- [ ] Migration atomicity: single migrate-multi-silo-v1.ts shared across plans 50-01/02/03 — all-or-nothing transaction. Schema_migrations marker inserted exactly once at the end of the transaction
- [ ] MSF-03 empirical proof (synthetic silo enrollment) is SC-11 in smoke, not just a code review
- [ ] Multi-silo /context layering verified at the documented multi-match cwd (Porter/admin/frontend) AND at a single-match cwd (ymc.capital/dealdocs)
- [ ] Legacy workflow row deletion verified (SC-18) — catches a migration that didn't run

**Approval:** pending (post-revision)
