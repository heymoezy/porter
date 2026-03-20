---
phase: 01-foundation
plan: 07
subsystem: infra
tags: [boot-sequence, capability-detection, landing-page, hardcoding-fixes, env-vars]

# Dependency graph
requires:
  - phase: 01-03
    provides: "auth_check_cap() removed, admin system deleted, auth simplified"
  - phase: 01-05
    provides: "Projects in SQLite, _DATA_DIR pattern established"
  - phase: 01-06
    provides: "CSS variables in embedded pages, old orange palette removed"
provides:
  - "_boot_sequence() function that detects Python, SQLite, data_dir, Node.js, Ollama, OpenClaw"
  - "Structured boot logging via mlog.emit() with boot.ok/boot.degraded/boot.critical events"
  - "Boot results merged into _capabilities_cache for UI badging"
  - "Minimal landing page placeholder: wordmark + tagline + Sign in CTA"
  - "prefers-color-scheme support on landing page"
  - "All hardcoded paths already eliminated in prior plans (verified zero remaining)"
affects:
  - "Phase 2+ — boot sequence runs before requests are served; _capabilities_cache feeds UI badge state"
  - "Fresh install UX — Porter now starts cleanly with only Python + SQLite"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "_boot_sequence() follows detect->notify->configure->verify->badge pattern"
    - "Local imports (import sys as _sys) used inside functions to avoid module-level dependency on sys"
    - "boot.ok / boot.degraded / boot.critical event types for structured startup logging"
    - "Landing page uses only system-preference CSS media query (no JS needed for pre-auth page)"

key-files:
  created: []
  modified:
    - "porter.py (def _boot_sequence(), LANDING_PAGE replacement)"

key-decisions:
  - "_boot_sequence() inserts results into _capabilities_cache with boot.* prefixed keys — non-destructive merge with existing capability check results"
  - "sys imported locally inside _boot_sequence() (import sys as _sys) because sys is not in porter.py module-level imports"
  - "Landing page wordmark is hardcoded 'PORTER' (acceptable placeholder; configurable name is Phase 3 scope)"
  - "CTA color is #FFFFFF hardcoded (not var(--text)) — button text is always white regardless of theme for contrast"

patterns-established:
  - "Boot sequence: mlog.emit() used for boot.ok/boot.degraded/boot.critical — all startup health state goes through structured logging"
  - "Pre-auth pages (landing, login, register) use @media prefers-color-scheme only — JS-driven data-theme applies post-login"

requirements-completed: [FOUND-05, UI-01]

# Metrics
duration: 15min
completed: 2026-03-20
---

# Phase 01 Plan 07: Boot Sequence + Landing Page Summary

**_boot_sequence() detects Python/SQLite/Node/Ollama/OpenClaw on startup with structured mlog output; LANDING_PAGE replaced with minimal wordmark+tagline+CTA placeholder**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-20T11:47:25Z
- **Completed:** 2026-03-20T12:05:00Z
- **Tasks:** 2 complete + 1 checkpoint (awaiting human verify)
- **Files modified:** 1 (porter.py)

## Accomplishments

- Implemented `_boot_sequence()` with six capability checks (Python, SQLite, data_dir, Node.js, Ollama, OpenClaw)
- Boot results logged via `mlog.emit()` with `boot.ok` / `boot.degraded` / `boot.critical` event types
- `_boot_sequence()` wired into startup after `mlog.start()` in `__main__` block
- LANDING_PAGE reduced from 7,704 chars (full marketing page) to 1,894 chars (minimal placeholder)
- Landing page has correct tagline "Your autonomous agent platform", "Sign in" CTA, CSS variables, prefers-color-scheme
- All Phase 1 verification checks green: 0 hardcoded IP, 0 bare except: pass, 0 ROLE_CAPS, 0 #f7931a
- 34/35 Playwright tests pass (1 pre-existing failure: "clicking project card opens detail page")

## Task Commits

1. **Task 1: Boot sequence + hardcoded path fixes** - `f91b94b` (feat)
2. **Task 2: Landing page replacement** - `f44b384` (feat)
3. **[Rule 1 fix] Fix NameError in _boot_sequence** - `97f609d` (fix)

## Files Created/Modified

- `/home/lobster/documents/porter/porter.py` — added `_boot_sequence()`, replaced `LANDING_PAGE`

## Decisions Made

- `sys` imported locally inside `_boot_sequence()` as `_sys` — `sys` is not in porter.py's module-level imports so module scope doesn't have it; local import is the correct fix
- Landing page "PORTER" wordmark is hardcoded string (acceptable; dynamic product name is future scope)
- CTA button text color is `#FFFFFF` hardcoded (intentional — accent background always needs white text for contrast, not a design system token)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed NameError: `sys` not defined in _boot_sequence()**
- **Found during:** Task 3 pre-check (Porter restart to verify boot sequence)
- **Issue:** `_boot_sequence()` referenced `sys.version` but `sys` is not imported at module level in porter.py — Python import is missing from the module's top-level imports, causing `NameError: name 'sys' is not defined` and crashing Porter on startup
- **Fix:** Added `import sys as _sys` at the top of the `_boot_sequence()` function body; changed `sys.version` to `_sys.version`
- **Files modified:** `porter.py`
- **Verification:** Porter restarted successfully, serves HTTP 200, 34/35 Playwright tests pass
- **Committed in:** `97f609d`

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Critical fix — without it Porter would not start at all. No scope creep.

## Issues Encountered

- `sys` is not in porter.py's module-level imports (the file uses only `os`, `re`, `json`, etc. from stdlib). Any new function referencing `sys` must import it locally. This is now documented in patterns-established.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All Phase 1 foundation work complete: exception handling, SQLite pooling, projects migration, Cortex disabled, Fastify baseline, CSS audit, boot sequence, landing page
- Porter starts cleanly with only Python + SQLite (Node/Ollama/OpenClaw are optional/degraded)
- Phase 2 can proceed: Cortex full deletion, Memory V2 wiring, wizard groundwork
- One pre-existing test failure ("project card opens detail page") remains — unrelated to Phase 1 changes

---
*Phase: 01-foundation*
*Completed: 2026-03-20*
