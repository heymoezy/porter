---
phase: 02-memory-v2
plan: 04
subsystem: memory
tags: [ui, sse, feed, badge, preferences, real-time]

# Dependency graph
requires:
  - phase: 02-memory-v2/02-02
    provides: recall:event SSE emission from _mem_insert
  - phase: 02-memory-v2/02-03
    provides: Tiered injection, cross-project SSE events

provides:
  - Compact real-time recall feed in #memory-module (scope filter + auto-manage toggle)
  - loadMemory() rebuilt as fetch-based compact feed loader
  - _recallFeedPrepend, _recallFeedAppend, _recallFeedRow, _recallTimeAgo JS helpers
  - SSE recall:event listener prepends new items to feed in real time
  - GET /api/memory/feed endpoint with agent_id + scope filtering
  - POST /api/memory/mark-read endpoint (stores recall_last_read timestamp in prefs)
  - /api/memory/stats updated to include unread_count since last read
  - recall-badge span on Memory nav item with count
  - Badge count loaded on page init from /api/memory/stats
  - auto_manage_memory and recall_last_read added to DEFAULT_PREFERENCES

affects:
  - 02-05 (FTS5 session search — Memory feed is now the primary memory UI surface)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Compact feed row: icon + truncated text + scope badge + time-ago — no full cards"
    - "Badge cleared on Memory tab open via /api/memory/mark-read"
    - "SSE prepend with requestAnimationFrame fade-in for real-time feel"

key-files:
  created: []
  modified:
    - porter.py

key-decisions:
  - "Scope filter and auto-manage toggle wired lazily (_wired flag) to avoid duplicate addEventListener on re-renders"
  - "unread_count in /api/memory/stats compares created_at > recall_last_read timestamp from preferences"
  - "Badge only increments when _currentModule !== 'memory' — no noise when feed is already visible"
  - "action column in memories table may not exist yet — defaults to 'learned' in feed endpoint"
  - "_recallFeedPrepend fires for ALL recall:event SSE types (not just 'learned') so dismissed/promoted also appear"

patterns-established:
  - "Pattern: recall_last_read in preferences as float unix timestamp — simple, no extra table needed"
  - "Pattern: Badge cleared on tab visit via POST /api/memory/mark-read — mark-then-load pattern"

requirements-completed:
  - MEM-02

# Metrics
duration: 6min
completed: 2026-03-20
---

# Phase 02 Plan 04: Memory Feed UI + Nav Badge Summary

**Compact real-time recall feed replacing stat cards — icon + text + scope badge + time-ago rows, badge count on nav item, SSE-driven prepend, auto-manage preference toggle**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-20T16:24:21Z
- **Completed:** 2026-03-20T16:30:22Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Replaced `#memory-module` HTML with compact recall-feed layout: scope filter dropdown, auto-manage toggle, scrollable `#recall-feed` container, empty state div
- Rebuilt `loadMemory()` from async stat-card loader to fetch-based compact feed (`/api/memory/feed`) with lazy event-listener wiring (`_wired` flag prevents duplicate registration)
- Added `_recallFeedPrepend`, `_recallFeedAppend`, `_recallFeedRow`, `_recallTimeAgo` JS helpers for real-time feed rendering
- Extended existing recall:event SSE subscriber to call `_recallFeedPrepend` for all event types (not just `learned`) while keeping chat indicator for `learned` only
- Added `GET /api/memory/feed` endpoint: queries `memories` table ordered by `created_at DESC`, supports `agent_id` and `scope` filters, returns up to 100 items
- Added `POST /api/memory/mark-read` endpoint: stores `recall_last_read` unix timestamp in preferences
- Updated `GET /api/memory/stats` to include `unread_count` (count of memories since `recall_last_read`)
- Added `<span id="recall-badge">` to Memory nav item, hidden by default, shown with count on page load
- Added badge fetch in `init()` function after page load
- Added `auto_manage_memory: True` and `recall_last_read: 0.0` to `DEFAULT_PREFERENCES`
- Added both keys to allowed set in `POST /api/preferences` handler
- Agent detail Concepts tab already shows "Memory" text — confirmed, no rename needed

## Task Commits

1. **Task 1: Rebuild Memory tab as compact real-time feed** - `4bdcd47` (feat)
2. **Task 2: Add Memory feed API endpoints and nav badge** - `87e8916` (feat)

**Plan metadata:** (see final metadata commit)

## Files Created/Modified

- `/home/lobster/documents/porter/porter.py` — All changes: HTML rebuild, JS functions, SSE wiring, API endpoints, preferences, nav badge

## Decisions Made

- `unread_count` computed in `/api/memory/stats` from `recall_last_read` float preference rather than a separate table — simpler, sufficient for badge use case
- Scope filter and auto-manage listeners use `_wired` boolean flag on the DOM element to prevent re-adding on repeated `loadMemory()` calls (scope change reloads the feed)
- Badge only increments via `_recallFeedPrepend` when `_currentModule !== 'memory'` — when the user is already looking at the memory feed, no badge noise needed
- The `action` field in the feed response defaults to `'learned'` since the `memories` table doesn't have a dedicated action column — the SSE payload carries this field but it's not stored

## Deviations from Plan

None - plan executed exactly as written. The "Concepts" tab rename was already done in a prior version (v0.31.89 per changelog) — confirmed and documented as no-op rather than an error.

## Issues Encountered

None - both patches applied cleanly. Porter restarted active. All 4 recall SSE test assertions passed. All 14 source-code assertions passed.

## Next Phase Readiness

- Memory feed UI is live: ready for real-time data to appear via recall:event SSE (when users interact with chat)
- `/api/memory/feed` endpoint ready for Plan 02-05 (FTS5 session search integration)
- Badge count system is in place for any future enhancement (e.g., per-user state)

---
*Phase: 02-memory-v2*
*Completed: 2026-03-20*

## Self-Check: PASSED

All files, commits, and key functions verified present:
- `4bdcd47` feat(02-04): rebuild Memory tab as compact real-time feed — FOUND
- `87e8916` feat(02-04): add Memory feed API endpoints and nav badge — FOUND
- `/api/memory/feed` in porter.py — FOUND
- `/api/memory/mark-read` in porter.py — FOUND
- `unread_count` in porter.py — FOUND
- `recall-badge` in porter.py — FOUND
- `_recallFeedPrepend` in porter.py — FOUND
- `auto_manage_memory` in porter.py — FOUND
