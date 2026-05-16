---
phase: 49-pattern-detection
plan: 04
subsystem: intellect
tags: [silo-detector, project-detection, lrn-04, pure-function, additive-export]

# Dependency graph
requires:
  - phase: 48.1-silo-foundation
    provides: silo-detector.ts module with detectSilos + DetectArgs + DetectedSilo (additive sibling export pattern preserves all)
provides:
  - detectProject(cwd) pure function — extracts project slug from /home/lobster/projects/<X>/... cwd, returns null otherwise
  - detectContext(args, pool) async composite — returns { silos, projectId } in one call for /context to consume
  - DetectedContext interface — exported alongside for downstream type-safe consumption
  - Server-side mirror of porter-session-start.js:21-27 regex (and its raw-cwd semantics — no symlink resolution)
affects: [49-03 (will import detectContext in /context handler), 49-05 (smoke harness verifies end-to-end via /context flow), Phase 50 MSF-* (may extract shared helper), Phase 52 CLA-01 (task-planner agent selection from project scope)]

# Tech tracking
tech-stack:
  added: []  # zero new dependencies
  patterns:
    - "Additive sibling export — extend a stable module by adding NEW exports rather than mutating existing signatures; preserves all callers"
    - "Raw-cwd semantics (no symlink resolution) — server function mirrors hook precedent; callers responsible for fs.realpathSync if needed"
    - "Inline hook-regex duplication with provenance comment — backend mirrors ~/.claude/hooks/porter-session-start.js:21-27 verbatim; hook independence (runs before backend reachable) is a feature, not a bug"

key-files:
  created: []
  modified:
    - backend/src/services/intellect/silo-detector.ts

key-decisions:
  - "Additive sibling export (NOT signature change on detectSilos) — preserves zero-risk to 4 existing callers (transcript-capture.ts, intellect.ts /context, intellect.ts /silo-command-status, future MSF). Per 49-RESEARCH.md Silo-Detector Signature Change section."
  - "Symlink behavior intentionally NO-OP — detectProject operates on cwd as-supplied, no fs.realpathSync call. Mirrors porter-session-start.js hook precedent. Callers needing symlink resolution must call fs.realpathSync BEFORE invoking detectProject."
  - "Regex hardcoded (not env-var configurable) in this plan — matches existing hook posture; Phase 50 MSF-01 may parameterize if admin-silo paths land outside /home/lobster/projects/."
  - "DetectedContext interface exported alongside the new functions — gives downstream callers (49-03 /context handler, future Phase 52 task-planner) a single typed shape."
  - "Three exports, not one: detectProject (pure, no pool), detectContext (async composite, needs pool), DetectedContext (interface). Reflects 3 distinct call-site needs: dream-worker future use (no pool), /context handler (needs pool), type-safe consumption everywhere."

patterns-established:
  - "Pattern: Documented duplication with @provenance comment — when backend mirrors a hook, embed a comment referencing the hook file:line so future readers know it's deliberate, not copy-paste-drift"
  - "Pattern: Negative-space documentation — explicit inline note 'does NOT call fs.realpathSync; does NOT resolve symlinks' communicates intent that grep cannot verify (grep can only check absence, not intent)"
  - "Pattern: 14-case inline node test in <verify> — fast, no DB/no HTTP, exercises the regex contract directly including edge cases (null/undefined/empty/whitespace, outside-prefix, symlink-target case)"

requirements-completed: [LRN-04]

# Metrics
duration: 16 min
completed: 2026-05-16
---

# Phase 49 Plan 04: Server-Side Project Derivation Summary

**detectProject pure function + detectContext composite + DetectedContext interface added to silo-detector.ts; mirrors porter-session-start.js:21-27 hook regex AND its raw-cwd semantics (no symlink resolution); detectSilos and 4 existing callers untouched.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-05-16T18:20:06Z
- **Completed:** 2026-05-16T18:37:05Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- `detectProject(cwd)` exported — pure function, no I/O, no async; matches `/home/lobster/projects/<X>/...` cwd → project slug, otherwise null. Same regex as the production hook at `~/.claude/hooks/porter-session-start.js:21-27` verbatim.
- `detectContext(args, pool)` exported — async composite returning `{ silos, projectId }` in one call. Plan 49-03 (/context handler) will import this directly.
- `DetectedContext` interface exported for downstream type-safe consumption.
- Symlink behavior intentionally documented as no-op (matches hook precedent — raw cwd, no fs.realpathSync). Callers needing symlink resolution must call fs.realpathSync BEFORE invoking detectProject.
- Zero risk to existing detectSilos callers (4 known: transcript-capture.ts, intellect.ts /context, intellect.ts /silo-command-status, future MSF). Additive sibling-export posture — no signature mutation.

## Task Commits

1. **Task 1: Add detectProject pure function + DetectedContext interface + detectContext composite** — `0946135` (feat)

**Plan metadata:** _(committed after STATE/ROADMAP updates below)_

## Files Created/Modified

- `backend/src/services/intellect/silo-detector.ts` — Added 70 lines at the bottom (after the existing `detectSilos` closing brace at line 132). New section is wrapped in a `── LRN-04 (Phase 49): server-side project-id derivation ──` comment banner. Module header docstring (lines 1-25) updated to document the new exports. No existing code touched.

### Regex literal

```
/^\/home\/lobster\/projects\/([^/]+)/
```

Identical to `~/.claude/hooks/porter-session-start.js` line 24. Deliberate duplication so the hook stays independent of backend availability (the hook runs at session-start before any HTTP request is plausible).

### Sample input → output mapping

| Input cwd | detectProject result | Note |
|-----------|---------------------|------|
| `/home/lobster/projects/ymc.capital` | `ymc.capital` | Exact root |
| `/home/lobster/projects/ymc.capital/backend` | `ymc.capital` | Subdir |
| `/home/lobster/projects/ymc.capital/backend/src` | `ymc.capital` | Deeper subdir |
| `/home/lobster/projects/Baan Yin Dee/site` | `Baan Yin Dee` | Space in project name |
| `/home/lobster/projects/ymc.capital-private/workoutdocs/edwardchen` | `ymc.capital-private` | Dot + hyphen in slug |
| `/home/lobster` | `null` | No project segment |
| `/home/websites/ymc.capital` | `null` | **Symlink-target case** — outside hardcoded prefix; not resolved by design (matches hook precedent) |
| `/home/other/projects/foo` | `null` | Different home root |
| `/tmp/porter-bridge-sandbox` | `null` | Outside /home/lobster |
| `''` / `'   '` / `null` / `undefined` | `null` | Defensive |

## Decisions Made

- **Additive sibling exports, not signature mutation.** detectSilos return type is preserved. 4 known callers continue working with zero code change. detectContext is a NEW composite that wraps detectSilos + detectProject. This is the posture locked by 49-RESEARCH.md (Silo-Detector Signature Change section).
- **Raw cwd, no symlink resolution.** detectProject operates on cwd as-supplied. Mirrors porter-session-start.js (which uses raw process.cwd()) so backend and hook stay in lockstep on what counts as "the project for this session". Documented inline in TWO places: the `── LRN-04 ──` banner comment, and the JSDoc on detectProject itself.
- **Regex hardcoded (not env-var configurable) in this plan.** Phase 50 MSF-01 may need admin-silo cwds outside `/home/lobster/projects/` — that is its scope, not 49's. Matches existing hook behavior.
- **Three distinct exports.** detectProject (pure, no pool — usable by future dream-worker failure-pattern attribution), detectContext (async composite, needs pool — used by /context), DetectedContext (interface — type-safe consumption everywhere).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Acceptance criterion `grep -q "fs.realpath"` was internally self-contradictory**
- **Found during:** Task 1 verification
- **Issue:** Plan's `<acceptance_criteria>` says `grep -q "fs.realpath" ... exits NONZERO (must NOT contain realpath calls — purity is part of the contract)`. But the same plan's `<action>` REQUIRES the inline comment to explicitly mention "No fs.realpathSync, no symlink resolution" and the JSDoc to say "call fs.realpathSync(cwd) BEFORE this function". The plain `grep -q "fs.realpath"` matches the documentation strings (4 doc references), making the criterion impossible to satisfy with the required documentation.
- **Fix:** Honored the INTENT (no executable `fs.realpath` CALL in function body — purity) and the documentation requirement (must explicitly disclaim symlink resolution). Verified with a comment-stripping node check: `node -e "..."` parses the file, removes /* ... */ blocks and // line comments, then checks for `fs\.realpath`. Result: PASS (no executable fs.realpath call; 4 doc references in comments are required disclaimers).
- **Files modified:** None (this is a verification-criteria disagreement, not a code issue)
- **Verification:** `node` script confirms zero fs.realpath calls in executable code path; 4 references confined to comments. Code is pure (no I/O, no async). Plan intent preserved.
- **Committed in:** N/A (verification-only deviation)

---

**Total deviations:** 1 auto-fixed (1 blocking — internally contradictory acceptance criterion)
**Impact on plan:** Zero — the plan's INTENT (pure function, documented symlink stance) is fully met. The verbatim grep criterion was self-inconsistent; the comment-stripping verification proves purity while preserving required documentation. No code change needed beyond the planned implementation.

## Issues Encountered

- **Concurrent uncommitted changes in `backend/src/services/intellect/dream-sampler.ts`** owned by the parallel 49-01 session (in flight, separate agent). Full-project `npx tsc --noEmit` reports a `frustration_forced` SamplingLog type mismatch in that file. Out of scope for plan 49-04 (different file, different LRN, different agent). Verified my touched file (silo-detector.ts) compiles cleanly in isolation. Not blocking 49-04 ship.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **49-03 (LRN-03 — Project-scope read in /context) is unblocked.** It can now `import { detectContext } from './silo-detector.js'` and replace the existing project/cwd plumbing in the /context handler with a single composite call. detectContext returns `{ silos, projectId }` ready to use.
- **49-01 (LRN-01 — Frustration-marker sampler boost) is running in parallel.** No file overlap. 49-01 completion is independent of 49-04.
- **49-05 (LRN-05 — Smoke harness) will exercise the full /context flow end-to-end** once both 49-03 and 49-04 are merged.
- **TypeScript compiles clean on silo-detector.ts.** No regressions in the 4 existing callers.

## Self-Check: PASSED

- silo-detector.ts exists on disk: `[ -f backend/src/services/intellect/silo-detector.ts ]` → YES
- Commit `0946135` exists in git log: YES (verified)
- All 9 grep acceptance checks pass (detectProject, detectContext, DetectedContext, PROJECT_CWD_REGEX, detectSilos preserved, loadSiloCache preserved, DetectArgs preserved, regex verbatim, symlink doc, as-supplied doc)
- Negative purity check: no executable `fs.realpath` call (only 4 doc-comment references documenting the deliberate absence)
- 14 inline regex test cases all pass (including the `/home/websites/ymc.capital → null` symlink-target case)
- `cd backend && npx tsc --noEmit` reports zero errors in silo-detector.ts (the only tsc error is in dream-sampler.ts, owned by parallel 49-01 session, out of scope)

---
*Phase: 49-pattern-detection*
*Completed: 2026-05-16*
