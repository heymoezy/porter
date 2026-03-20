---
phase: 02-memory-v2
plan: 02
subsystem: memory
tags: [recall, signal-extraction, noise-filter, sse, chat-ui]

# Dependency graph
requires:
  - phase: 02-01
    provides: Cortex code fully deleted, _mem_extract_signals disabled with early-return guard

provides:
  - RECALL_NOISE_BLACKLIST frozenset constant gating all signal extraction
  - _recall_should_extract() helper that enforces the blacklist
  - _mem_extract_signals re-enabled with noise filter as first guard
  - Signal extraction wired at /api/chat/stream and agent dispatch call sites
  - _mem_insert emits recall:event SSE on every insertion
  - _appendRecallIndicator() JS function for chat UI
  - .recall-noted CSS class with hover opacity effect
  - Global SSE subscriber wiring recall:event to chat message DOM

affects: [02-03, 02-04, 02-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Noise blacklist as frozenset constant — O(1) membership test before any DB write"
    - "source_category param added to _mem_extract_signals signature for future non-chat callers"
    - "Background thread recall extraction from streaming chat handler"
    - "Global _sseSubscribe hook for recall:event — appends indicator to last .chat-msg.assistant"

key-files:
  created: []
  modified:
    - porter.py

key-decisions:
  - "source_category defaults to 'chat' inside _mem_extract_signals — any caller without explicit category is treated as chat (allowed through)"
  - "SSE emit in _mem_insert uses __import__('time').time() to avoid top-level import dependency issue"
  - "SSE emit failure in _mem_insert is silently swallowed — never break DB insert due to push failure"
  - "Recall SSE subscriber uses IIFE pattern to avoid polluting global scope"
  - "Indicator appended to last .chat-msg.assistant only — no duplication guard via querySelector('.recall-noted')"

patterns-established:
  - "Noise filter: check _recall_should_extract(source_category) BEFORE any _mem_insert call"
  - "Background thread extraction: always in daemon thread, never block chat stream response"
  - "SSE emit after commit: call _emit_event after conn.commit() and conn.close() to avoid holding DB lock"

requirements-completed:
  - MEM-01

# Metrics
duration: 22min
completed: 2026-03-20
---

# Phase 02 Plan 02: Noise Filter and Recall Indicator Summary

**RECALL_NOISE_BLACKLIST gates signal extraction for Porter Recall — chat messages learn, login/upload/navigation/health do not — with inline Recall noted indicator in chat UI**

## Performance

- **Duration:** 22 min
- **Started:** 2026-03-20T16:00:00Z
- **Completed:** 2026-03-20T16:22:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Re-enabled _mem_extract_signals with RECALL_NOISE_BLACKLIST as the new gatekeeper (replaces `return 0` disabled guard from Phase 1)
- Wired signal extraction at both chat call sites: /api/chat/stream streaming handler and agent dispatch background thread
- _mem_insert now broadcasts recall:event SSE after every DB commit so the UI can react in real time
- Added _appendRecallIndicator() JS function and .recall-noted CSS class for the inline "Recall noted: [concept]" line below chat messages
- Global SSE subscriber auto-appends the indicator to the last assistant message bubble when Porter learns something

## Task Commits

1. **Task 1: Add noise blacklist and re-enable signal extraction** - `a780dc1` (feat)
2. **Task 2: Add inline Recall noted indicator to chat UI** - `c799af6` (feat)

## Files Created/Modified

- `/home/lobster/documents/porter/porter.py` — RECALL_NOISE_BLACKLIST, _recall_should_extract, noise filter in _mem_extract_signals, stream call site wiring, recall:event SSE, recall-noted CSS, _appendRecallIndicator JS, global SSE subscriber

## Decisions Made

- `source_category` defaults to `'chat'` inside `_mem_extract_signals` — any call site that doesn't pass an explicit category is treated as chat and allowed through the filter
- SSE emit failure inside `_mem_insert` is silently swallowed (`except: pass`) — the DB insert must succeed even if the SSE push fails
- Global recall SSE subscriber uses an IIFE immediately after `_sseUnsubscribe` definition — always active, no module-scoped subscription lifecycle needed
- `_recall_should_extract()` added to dispatch call at line 42524 (agent dispatch) in addition to the new chat stream call — ensures both call paths are covered

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added source_category parameter to _mem_extract_signals signature**
- **Found during:** Task 1 (add noise blacklist)
- **Issue:** Plan noted source_category may not be in _mem_extract_signals signature — confirmed it was missing. Without the param, the blacklist check inside the function would always receive the default 'chat' regardless of caller, which is actually the correct behavior for all current callers. Added the param for future callers.
- **Fix:** Added `source_category=''` parameter to the function signature so callers can explicitly pass a category
- **Files modified:** porter.py
- **Verification:** Both call sites pass `source_category='chat'` explicitly
- **Committed in:** a780dc1

**2. [Rule 2 - Missing Critical] Fixed agent dispatch call site to also pass source_category**
- **Found during:** Task 1 (wire call sites)
- **Issue:** Existing call at line 42524 (agent dispatch, pre-existing from v0.31.88) called `_mem_extract_signals` without `source_category`. After adding the noise filter guard, this call needed the explicit category to be correct.
- **Fix:** Added `source_category='chat'` to the existing dispatch call
- **Files modified:** porter.py
- **Verification:** grep confirms both call sites use `source_category='chat'`
- **Committed in:** a780dc1

---

**Total deviations:** 2 auto-fixed (1 bug fix, 1 missing critical param)
**Impact on plan:** Both auto-fixes required for correct noise filter behavior. No scope creep.

## Issues Encountered

- Pre-existing Playwright test failures (7 tests): confirmed pre-existing on previous commit (stash test ran identical 7 failures). Not caused by plan 02-02 changes.
- Porter admin health endpoint requires session cookie auth — used `/api/version` as the health proxy for unauthenticated verification.

## Next Phase Readiness

- Signal extraction is live and noise-filtered: ready for Plan 02-03 (injection with scope isolation and token budgeting)
- recall:event SSE type is established: ready for Plan 02-05 (real-time memory feed UI that listens to it)
- Blacklist constant location (after DEFAULT_PREFERENCES) is a stable anchor for future noise category additions

---
*Phase: 02-memory-v2*
*Completed: 2026-03-20*
