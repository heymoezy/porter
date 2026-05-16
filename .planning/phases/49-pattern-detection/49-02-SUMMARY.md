---
phase: 49-pattern-detection
plan: 02
subsystem: intellect
tags: [dream-worker, memory-proposals, failure-patterns, zod, postgres, refinement-doctrine, llm-prompt]

# Dependency graph
requires:
  - phase: 48.3-software-dream-worker
    provides: runDreamWorker + dream_runs + memory_proposals tables + software.md prompt + dispatchDream mock-injection contract
  - phase: 48.4-review-surface
    provides: 48.4 list/accept/reject endpoints that surface memory_proposals rows with their proposed_metadata as-is — failure-pattern rows ride this surface unchanged
provides:
  - failure_patterns first-class output slot in software.md dream prompt (>=2-recurrence threshold, evidence-turn-id citations, suggested directive + scope)
  - failurePatternSchema Zod schema + ParsedFailurePattern type export from dream-parser.ts
  - Worker insertion of one memory_proposals row per failure_pattern with proposed_metadata.source='failure_pattern' inside the existing all-or-nothing transactional block
  - sort_order band 850-899 dedicated to failure-pattern rows (between merge=300 and new_directive=900)
  - Per-pattern dream_failure_pattern_detected intellect_event audit signal
  - dream_runs.proposals_extracted rolled up to include failure_patterns count
affects: [49-01-frustration-sampler, 49-04-silo-detector, 49-05-smoke-harness, 51-DRX-02-edit-in-place]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Metadata-discriminator pattern: reuse existing proposal_kind ('new_directive') + proposed_metadata.source for shape variants — zero DB CHECK changes, zero 48.4 UI churn"
    - "sort_order band reservation (850-899) wedges new row types between existing kind bases without renumbering"
    - "Optional + default([]) Zod field for additive schema changes — old fixtures parse unchanged, new path engages only when model emits the field"
    - "Slug helper isolated for reuse: lowercase + non-alnum collapse + trim + 40-char cap"

key-files:
  created: []
  modified:
    - "backend/src/services/intellect/dream-prompts/software.md — +32 lines: '## Failure Patterns' section between Hard Rules and Output, failure_patterns[] in JSON schema example + contract note, new self-check item"
    - "backend/src/services/intellect/dream-parser.ts — +28 lines: failurePatternSchema export, dreamResponseSchema.failure_patterns optional().default([]), ParsedFailurePattern type, module-header doctrine-bypass note"
    - "backend/src/services/intellect/dream-worker.ts — +105/-7 lines: ParsedFailurePattern import, slugifyPatternName helper, second for-loop inside insertProposalsTransactionally for failure-pattern rows, post-commit per-pattern audit event loop, totalProposals rollup driving dreams:run-completed + dream_runs.proposals_extracted + dream_run_completed event"

key-decisions:
  - "Reuse proposal_kind='new_directive' for failure-pattern rows — discriminator via proposed_metadata.source='failure_pattern'. Avoids DB CHECK constraint change and keeps 48.4 list/accept/reject endpoints unchanged. Reviewers can still filter by source in the admin UI when DRX-02 ships."
  - "failure_patterns BYPASSES validateRefinementDoctrine — they are not 'proposals' in the refine-before-append sense and carry their own >=2 evidence threshold enforced at the Zod boundary. Documented in dream-parser.ts module header."
  - "sort_order band 850-899 (between merge=300 and new_directive=900) so failure-pattern rows surface BEFORE generic new directives within a run — stronger evidence (concrete recurrence) outranks abstract new rules."
  - "Failure-pattern row insertions live inside the SAME BEGIN/COMMIT block as regular proposals. Failure mid-loop rolls back both — atomic posture preserved (Pitfall 10)."
  - "Per-pattern audit event emitted POST-commit, fire-and-forget. Matches existing flagged_seeds + dream_seed_flagged posture. Rollback leaves no orphan audit rows."
  - "Phase 51 deferral: proposed_metadata.suggested_scope + suggested_scope_id are PERSISTED but the 48.4 accept handler does not yet read them. DRX-02 (Phase 51 edit-in-place) automates honoring. Reviewers adjust scope manually via admin UI in the v7.0 interim."
  - "Slug helper drops `!!!` and other punctuation by [^a-z0-9]+ replacement; truncates at 40 chars so the eventual conceptual_area ('failure-pattern:<slug>') stays within proposalSchema's 60-char ceiling."

patterns-established:
  - "Metadata-discriminator over kind expansion — when a new row variant needs to flow through an existing pipeline, prefer proposed_metadata tagging over a new proposal_kind value. DB CHECK stays untouched, downstream surfaces require zero changes."
  - "Doctrine-bypass header comment — when a new optional schema field intentionally sidesteps an existing validator, document the contract in the module header (not just the field) so a future reader doesn't 'fix' the bypass."
  - "Mock-injection at dispatch boundary survives schema extensions — DREAM_WORKER_MOCK_RESPONSE_PATH + body._mock_response_path flow continues to work; the new failure_patterns field flows through automatically once Zod accepts it."

requirements-completed:
  - LRN-02

# Metrics
duration: 41 min
completed: 2026-05-16
---

# Phase 49 Plan 02: Failure Pattern Detection Summary

**Dream worker now extracts concrete recurring failures (>=2 distinct turns + cited turn IDs + suggested directive + scope) as first-class memory_proposals rows tagged `proposed_metadata.source='failure_pattern'` with their own sort_order band (850-899), audit event (`dream_failure_pattern_detected`), and rollup into `dream_runs.proposals_extracted`.**

## Performance

- **Duration:** 41 min
- **Started:** 2026-05-16T17:12:34Z
- **Completed:** 2026-05-16T17:54:01Z
- **Tasks:** 3 (all auto, 2 with tdd flag)
- **Files modified:** 3
- **Wave:** 1 (no dependencies on other Phase 49 plans; disjoint file scope from 49-01 + 49-04)

## Accomplishments

- **Prompt extension (software.md):** New `## Failure Patterns (list before proposals)` section between Hard Rules and Output, with 7 strict per-field bullets, an "empty array if nothing recurred — do NOT invent" guard, and an explicit frustration-signal-but-evidence-required clause. JSON schema example carries a concrete `failure_patterns[]` block. Self-check list gains the "if recurrence visible -> at least one entry" item.
- **Parser schema (dream-parser.ts):** `failurePatternSchema` exported with strict Zod guards (`pattern_name` 1-120, `description` 1-500, `recurrence_count` int >=2, `evidence_turn_ids` int[] min 2, `suggested_directive` 1-8000, `suggested_scope` enum, `suggested_scope_id` 1-120). `dreamResponseSchema.failure_patterns: z.array(...).optional().default([])` keeps existing fixtures parseable. `ParsedFailurePattern` type exported for worker consumption. Module-header doctrine-bypass note explains why these rows are not subject to `validateRefinementDoctrine`.
- **Worker insertion (dream-worker.ts):** `slugifyPatternName` helper plus a second for-loop inside the existing `insertProposalsTransactionally` BEGIN/COMMIT block writes each failure_pattern as `proposal_kind='new_directive'` + `target_directive_ids='{}'` + `proposed_metadata.source='failure_pattern'` (with `pattern_name`, `recurrence_count`, `suggested_scope`, `suggested_scope_id`, `priority: 60`, `conceptual_area: 'failure-pattern:<slug>'`) + `source_evidence={sample_turn_ids, phrasing_examples: [], reasoning: <description>}` + `sort_order` 850 + counter. Post-commit fire-and-forget loop emits one `dream_failure_pattern_detected` audit event per pattern. `dream_runs.proposals_extracted`, the `proposals:created` broadcast count, the `dreams:run-completed` broadcast, and the `dream_run_completed` audit event are all rolled up via `totalProposals = parsed.proposals.length + (parsed.failure_patterns?.length ?? 0)`.

## Task Commits

1. **Task 1: software.md prompt extension** - `570d06b` (feat)
2. **Task 2: dream-parser.ts Zod schema extension** - `4445e64` (feat, TDD-flagged)
3. **Task 3: dream-worker.ts failure-pattern insertion + audit events** - `71187da` (feat, TDD-flagged)

_Plan metadata commit follows separately via `gsd-tools commit`._

## Files Created/Modified

- `backend/src/services/intellect/dream-prompts/software.md` — Failure Patterns section + schema field + self-check item (+32 lines, no deletions)
- `backend/src/services/intellect/dream-parser.ts` — failurePatternSchema + failure_patterns field + ParsedFailurePattern type + module-header note (+28 lines, no deletions)
- `backend/src/services/intellect/dream-worker.ts` — ParsedFailurePattern import + slugifyPatternName helper + second tx-block loop + per-pattern audit event loop + totalProposals rollup (+105/-7 lines)

### Verbatim JSON schema field added to software.md (Output section)

For downstream smoke-harness grep targets:

```json
"failure_patterns": [
  {
    "pattern_name": "short label, e.g. 'YMC logo freehanded instead of vector asset'",
    "description": "1-2 sentence what-recurred narrative",
    "recurrence_count": 3,
    "evidence_turn_ids": [1604, 1782, 1623],
    "suggested_directive": "proposed directive text — same shape as a new_directive proposal_content",
    "suggested_scope": "project",
    "suggested_scope_id": "ymc.capital"
  }
]
```

## Decisions Made

See key-decisions in frontmatter. The two structurally important calls:

1. **Reuse `proposal_kind='new_directive'` + `proposed_metadata.source='failure_pattern'`** instead of adding a new kind value. Zero DB CHECK change, zero 48.4 UI fork. Tagged metadata is queryable for future filtering work without schema churn. RESEARCH §"Alternatives Considered" locked this trade-off; Phase 51 DRX-02 may surface source as a filter dimension in the UI but does not require it now.

2. **Failure-pattern rows bypass `validateRefinementDoctrine`** at the parser layer. They carry their own >=2 recurrence threshold + cited evidence_turn_ids (enforced by Zod `.min(2)`), so subjecting them to refine-before-append would be redundant and would create deadlocks for silos where the model wants to surface a failure pattern but has no refineable directives. Module-header note in dream-parser.ts spells out the contract so a future refactor doesn't "fix" the bypass.

3. **Phase 51 deferral on accept-flow scope handling** is intentional and documented. failure-pattern rows persist `suggested_scope` + `suggested_scope_id` but the 48.4 accept handler currently inserts every accepted `new_directive` row as silo-scope. v7.0 reviewers adjust scope manually via admin UI; DRX-02 (Phase 51 edit-in-place) automates honoring `suggested_scope` when it's read.

## Deviations from Plan

None - plan executed exactly as written.

Acceptance criteria for all 3 tasks passed on first attempt. TypeScript compiled clean (0 errors). Live integration test produced the expected DB shape (2 failure-pattern rows at sort_order 850/851 with `source='failure_pattern'`, 2 audit events with correct payload, `dream_run.proposals_extracted=3` reflecting 1 regular + 2 failure-pattern).

**Total deviations:** 0
**Impact on plan:** None. Plan delivered as designed.

## Authentication Gates

None. No external service auth required for this plan.

## Issues Encountered

None of material concern. Two minor friction points cleared inline:

- Initial smoke-harness command used a wrong column name (`silos.name`) and wrong type for `session_transcript_turns.captured_at` (numeric vs `timestamp with time zone`). Verified live schema via `psql -c "\d ..."` and re-ran. Did not touch source code.
- Initial `systemctl --user start porter-fastify` was rate-limited and produced no port-bind. Second start command succeeded; `/health` returned 200 v6.17.1.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 49-02 ships the prompt + parser + worker plumbing. The other Wave 1 plans (49-01 sampler + 49-04 detector) execute independently on disjoint files and contribute the sampling and detection halves of the same flow. Wave 2 plan 49-03 (frustration scoring inside the sampler) and Wave 3 plan 49-05 (end-to-end smoke harness) ride on top of these foundations.

For 49-05 specifically: this plan provides the failure_patterns insertion path that 49-05 will exercise end-to-end with `tests/fixtures/dream-response-pattern-detection.json` (to be authored in 49-05). The mock-injection contract (`_mock_response_path` body field + `DREAM_WORKER_MOCK_RESPONSE_PATH` env var) is honored unchanged — the smoke harness can drop a fixture containing `failure_patterns` and immediately observe the new pipeline.

Known limitation flagged forward to Phase 51 DRX-02: 48.4 accept handler does not yet read `proposed_metadata.suggested_scope`. Documented in deferred-items / must_haves frontmatter and in the body of this summary.

---
*Phase: 49-pattern-detection*
*Completed: 2026-05-16*

## Self-Check: PASSED

- key-files.modified all exist on disk:
  - `backend/src/services/intellect/dream-prompts/software.md` FOUND
  - `backend/src/services/intellect/dream-parser.ts` FOUND
  - `backend/src/services/intellect/dream-worker.ts` FOUND
- Task commits all present in `git log --oneline`:
  - `570d06b` feat(49-02): add Failure Patterns section to software dream prompt
  - `4445e64` feat(49-02): extend Zod schema with failure_patterns array
  - `71187da` feat(49-02): insert failure-pattern proposals + audit events
- TypeScript: `cd backend && npx tsc --noEmit` -> 0 errors
- Live integration: mocked dream-run produces 2 memory_proposals rows with `proposed_metadata->>'source' = 'failure_pattern'` and 2 `dream_failure_pattern_detected` intellect_events
- Regression: `bash tests/smoke-48.3.sh` -> all checks green for current wave
