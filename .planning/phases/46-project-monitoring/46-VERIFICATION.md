---
phase: 46-project-monitoring
verified: 2026-04-03T19:15:00Z
status: passed
score: 5/5 must-haves verified
human_verification:
  - test: "Create a watcher via POST /api/v1/admin/watchers, wait for scheduler tick (60s), then query watcher_findings table"
    expected: "At least one row in watcher_findings with watcher_id matching the created watcher; agent_activity row with event_type='watcher_finding_{type}'"
    why_human: "Cannot verify runtime scheduler execution or actual DB row insertion programmatically — requires a live service run"
  - test: "Navigate to /watchers in admin UI, confirm table renders with correct badges"
    expected: "Color-coded type badges (web=blue, rss=orange, email=purple, custom=gray), status pills (active=green, paused=yellow, error=red), auto-refresh every 30s"
    why_human: "Visual badge rendering and auto-refresh behavior cannot be verified without a browser"
---

# Phase 46: Project Monitoring Verification Report

**Phase Goal:** Every project can have autonomous watchers — scheduled agents that monitor external sources (web, RSS, email) and surface relevant findings in the project's activity feed without manual polling
**Verified:** 2026-04-03T19:15:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin can create a watcher by specifying type, schedule, and config — persists in project_watchers table | VERIFIED | `POST /` endpoint in `watchers.ts:11` validates all four watcher types, inserts into project_watchers with all required fields including schedule_cron computed from interval |
| 2 | All four watcher types execute on schedule and produce structured output | VERIFIED | `watcher-service.ts:140` switch dispatches to `executeWebSearch`, `executeRssFeed`, `executeEmailMonitor`, `executeCustom`; scheduler tick calls `scheduleWatcherRuns()` every 60s (line 379); watcher_run job handler at `scheduler.ts:750` calls `executeWatcher` |
| 3 | Watcher findings appear in project activity feed with source badge, summary, and expandable detail | VERIFIED | `logWatcherFinding` at `watcher-service.ts:41` inserts into `agent_activity` with `event_type=watcher_finding_{source_type}`, formats `[source_type] title` summary, and stores full detail JSON including finding_id, watcher_name, summary, importance |
| 4 | A finding marked as important triggers a notification visible in-app feed, and optionally sends email | VERIFIED | `watcher-service.ts:77-108`: important/critical findings emit `watcher:important-finding` SSE event; `sendEmail` called when `notify_email` is set on the watcher; email failure is non-blocking |
| 5 | Admin ops view shows all active watchers across all projects with last run time, next run time, and resource usage | VERIFIED | `watchers.tsx` fetches from `/api/v1/admin/watchers?limit=100` with 30s auto-refresh; table displays name, project, type badge, status badge, last_run_at, next_run_at (with "overdue" indicator), run_count, finding_count, schedule interval |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/db/migrate-pmn-v1.ts` | Idempotent migration creating project_watchers and watcher_findings | VERIFIED | 96 lines; idempotency via `schema_migrations WHERE id='pmn_v1'`; both tables with all specified columns and 5 indexes |
| `backend/src/services/watcher-service.ts` | Watcher execution engine with 4 type handlers | VERIFIED | 504 lines; exports `executeWatcher`, `WatcherConfig`, `WatcherFinding`, `scheduleWatcherRuns`; all 4 handlers implemented with real logic (Brave API, RSS regex parser, email_messages query, Ollama inference) |
| `backend/src/db/schema.ts` | Drizzle schema for project_watchers and watcher_findings | VERIFIED | `projectWatchers` at line 1224, `watcherFindings` at line 1244 |
| `backend/src/routes/v1/admin/watchers.ts` | CRUD API for watchers + findings listing | VERIFIED | 274 lines; 7 endpoints: POST /, GET /, GET /:id, PATCH /:id, DELETE /:id, GET /:id/findings, POST /:id/run |
| `admin/frontend/app/routes/watchers.tsx` | Watcher ops panel with table view and status badges | VERIFIED | 239 lines (exceeds 80-line minimum); full table with all required columns, color-coded badges, client-side filtering, formatRelativeTime and formatInterval helpers |
| `admin/frontend/app/components/layout/sidebar.tsx` | Nav link to watchers page | VERIFIED | Contains `{ icon: Eye, label: "Watchers", path: "/watchers" }` in Ops section |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scheduler.ts` | `watcher-service.ts` | `executeWatcher` call in watcher_run job handler | WIRED | Import at line 16; call at line 757; also `scheduleWatcherRuns` imported and called at tick line 380 |
| `watcher-service.ts` | `watcher_findings` table | `INSERT INTO watcher_findings` | WIRED | Line 161: full INSERT with all columns (id, watcher_id, project_id, source_type, title, summary, detail, importance, job_id) |
| `watcher-service.ts` | `agent_activity` table | `INSERT INTO agent_activity` for each finding | WIRED | Line 59: INSERT with agent_id='system', event_type=`watcher_finding_{source_type}`, activitySummary with source badge |
| `watcher-service.ts` | SSE hub | `emitSSE('watcher:important-finding', ...)` | WIRED | Line 79: emitSSE for important/critical findings; line 66: emitSSE('project:activity') for all findings |
| `watcher-service.ts` | `email.ts` | `sendEmail` for important findings when notify_email set | WIRED | Line 93-106: dynamic import + sendEmail call gated on `finding.importance === 'important' || 'critical'` and `watcher.notify_email` |
| `watchers.tsx` | `/api/v1/admin/watchers` | React Query `useQuery` with `api()` helper | WIRED | Line 83: `api<{watchers: WatcherRow[]; total: number}>("/api/v1/admin/watchers?limit=100")` with `refetchInterval: 30_000` |
| `admin/index.ts` | `watchers.ts` route | `fastify.register(watchersRoutes, { prefix: '/watchers' })` | WIRED | Line 19 import, line 54 registration |
| `backend/index.ts` | `migrate-pmn-v1.ts` | `await migratePmnV1(pool)` in startup chain | WIRED | Line 42 import, line 221 call |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PMN-01 | 46-01 | project_watchers table stores watcher configs (name, type, schedule, config JSONB, status) | SATISFIED | migration creates table with all specified columns; Drizzle schema at schema.ts:1224; CRUD API creates/reads/updates/deletes records |
| PMN-02 | 46-01 | Watcher types: web_search, email_monitor, rss_feed, custom | SATISFIED | `VALID_WATCHER_TYPES` in watchers.ts; switch dispatch in executeWatcher; all 4 handlers implemented with real logic |
| PMN-03 | 46-02 | Watcher results appear in project activity feed with source badge, summary, expandable detail | SATISFIED | logWatcherFinding inserts into agent_activity with `[source_type] title` format and full detail JSON; SSE pushes to project:activity |
| PMN-04 | 46-02 | Important findings trigger notifications (in-feed + optional email) | SATISFIED | SSE emit for watcher:important-finding; sendEmail when notify_email configured; both gated on importance='important' or 'critical' |
| PMN-05 | 46-03 | Admin ops view shows all active watchers across projects with last/next run and resource usage | SATISFIED | WatchersPage at /watchers; table shows all 9 columns including run_count, finding_count, last_run_at, next_run_at with relative formatting |

All 5 requirements accounted for. No orphaned requirements detected.

---

### Anti-Patterns Found

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| `watcher-service.ts:74,88` | `.catch(() => {})` on SSE emits | Info | Intentional — documented pattern for best-effort SSE delivery, never blocking watcher execution |
| `watcher-service.ts:232,277,330,365` | `return []` on empty config | Info | Legitimate guard clauses — returns empty findings when required config keys (query, feed_url, filter, prompt) are absent |

No blockers or warnings found. No TODO/FIXME/PLACEHOLDER markers. No empty implementations.

---

### Human Verification Required

#### 1. Scheduled Watcher Execution

**Test:** Create a watcher via `POST http://127.0.0.1:3001/api/v1/admin/watchers` with `watcher_type: "rss_feed"`, `config: { feed_url: "https://hnrss.org/frontpage", max_items: 3 }`, `schedule_interval_sec: 60`. Wait 90 seconds (scheduler tick runs every 60s). Then query `SELECT * FROM watcher_findings WHERE watcher_id = '<id>' LIMIT 5` in psql.

**Expected:** At least 1 row in watcher_findings; corresponding rows in agent_activity with `event_type='watcher_finding_rss_feed'`; watcher's `run_count` incremented to 1, `last_run_at` populated.

**Why human:** Runtime scheduler behavior, actual DB row insertion, and external HTTP fetch to RSS feed cannot be verified by static code analysis.

#### 2. Admin Watchers Page Rendering

**Test:** Navigate to `/watchers` in the admin UI (after service restart with built frontend). Ensure at least one watcher exists.

**Expected:** Table renders with correct color-coded type badges (blue for Web, orange for RSS, purple for Email, gray for Custom) and status pills (green dot for Active). Next run column shows "overdue" in red when past due. Page auto-refreshes every 30s.

**Why human:** Visual badge rendering and auto-refresh behavior require a browser.

---

## Gaps Summary

None. All 5 success criteria are verified by static analysis. All key links are wired. TypeScript compiles clean (zero errors confirmed). Commit hashes d82349e, c83e2f1, deec2ed, d98200e, 1035762, 6a25d59 all confirmed in git log.

Two items flagged for human verification are runtime/visual checks that cannot be done programmatically — they do not indicate missing implementation.

---

_Verified: 2026-04-03T19:15:00Z_
_Verifier: Claude (gsd-verifier)_
