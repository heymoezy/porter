---
phase: 13-autonomous-learning
plan: "03"
subsystem: scheduler, routes
tags: [scheduler, autonomous-learning, memory-v2, api-routes, LEARN-01, LEARN-02, LEARN-03]
dependency_graph:
  requires: ["13-01", "13-02"]
  provides: ["learning_session scheduler integration", "GET /api/v1/memory/concepts", "GET /api/v1/agents/:id/learning-sessions"]
  affects: ["backend/src/services/scheduler.ts", "backend/src/routes/v1/memory.ts", "backend/src/routes/v1/agents.ts", "backend/src/routes/v1/index.ts"]
tech_stack:
  added: []
  patterns: ["dynamic import for lazy loading learner.ts", "self-adjusting cadence via domain_activity score", "FTS5 full-text search on concepts_fts virtual table", "staggered bootstrap (600s spread) to prevent thundering herd"]
key_files:
  created:
    - backend/src/routes/v1/memory.ts
  modified:
    - backend/src/services/scheduler.ts
    - backend/src/routes/v1/agents.ts
    - backend/src/routes/v1/index.ts
    - tests/smoke-phase13.sh
decisions:
  - "Dynamic import('./learner.js') used in executeJob — learner.ts only loads when needed, same pattern as contact-analyzer.ts"
  - "scheduleNextLearningSession re-enqueues on both success and error — the sweep never permanently stops"
  - "bootstrapLearning filters is_internal=0 — only user-visible templates get learning jobs"
  - "memory.ts registers at prefix '/memory/concepts' — GET / maps to /api/v1/memory/concepts"
metrics:
  duration_sec: 366
  completed_date: "2026-03-22T21:46:07Z"
  tasks_completed: 2
  files_changed: 5
---

# Phase 13 Plan 03: Scheduler Integration and API Routes Summary

Activated the autonomous learning engine by wiring learner.ts into the scheduler for 24/7 operation, created the Memory V2 concepts API route, and added the learning-sessions sub-route on agents. All 10 smoke tests pass.

## One-Liner

Scheduler now runs learning_session jobs autonomously via staggered bootstrap across all templates, with self-adjusting cadence (24h/48h/7d) based on domain_activity score; GET /api/v1/memory/concepts (FTS5 search) and GET /api/v1/agents/:id/learning-sessions expose results.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Extend scheduler.ts with learning_session trigger, bootstrap, cadence | 72580ab | backend/src/services/scheduler.ts |
| 2 | Create memory.ts route + extend agents.ts + register in index.ts | 4616d4d | backend/src/routes/v1/memory.ts, agents.ts, index.ts |
| fix | Fix smoke-phase13.sh auth URL and DB path detection | 8933114 | tests/smoke-phase13.sh |

## What Was Built

### Scheduler Integration (Task 1)

- `scheduleNextLearningSession(templateId, domainActivity)` — exported function that queues the next job with self-adjusting cadence:
  - `domainActivity < 0` (error): 12h backoff
  - `domainActivity >= 70` (fast domain: AI, JS): 24h
  - `domainActivity >= 30` (medium domain): 48h
  - `domainActivity < 30` (stable domain: law, accounting): 7 days

- `bootstrapLearning()` — seeds one pending `learning_session` job per non-internal template on startup, staggered over 10 minutes (600s spread across N templates). Skips templates that already have a pending job to prevent duplication.

- `executeJob` learning_session branch — dynamic import of `./learner.js`, calls `runLearningSession(templateId)`, marks job complete/failed, logs activity, and re-enqueues. Template deletion is detected and does NOT re-enqueue.

### API Routes (Task 2)

**GET /api/v1/memory/concepts**
- Query params: `scope`, `scope_id`, `status` (default 'active'), `q` (FTS5 search), `limit` (max 200), `offset`
- Returns all concept columns including `source_url` and `confidence_score`
- FTS5 branch activates when `?q=` is provided using `concepts_fts MATCH ?`
- Registered in index.ts at prefix `/memory/concepts`

**GET /api/v1/agents/:id/learning-sessions**
- Returns sessions from `learning_sessions` table filtered by `template_id`
- JSON fields (`sources_visited`, `confidence_distribution`) are parsed before return
- `capped` coerced from SQLite integer to JavaScript boolean
- Default limit 20, max 100

## Success Criteria Verification

1. Scheduler executeJob handles `learning_session` trigger type: YES
2. scheduleNextLearningSession provides self-adjusting cadence (24h/48h/7d based on domain_activity): YES
3. bootstrapLearning seeds jobs for non-internal templates on startup, staggered over 10 min: YES
4. GET /api/v1/agents/:id/learning-sessions returns session records with all LEARN-03 fields: YES
5. GET /api/v1/memory/concepts returns concepts with source_url and confidence_score (LEARN-02): YES
6. FTS5 search works via ?q= parameter on /memory/concepts: YES
7. All routes behind requireAuth: YES
8. TypeScript compilation passes: YES (npx tsc --noEmit exits 0)
9. Smoke test passes after porter restart: YES (10/10 tests pass)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed smoke-phase13.sh login URL**
- **Found during:** Overall verification
- **Issue:** Login URL was `$BASE_URL/../login` resolving to `/api/login` which doesn't exist; correct path is `/api/v1/auth/login`
- **Fix:** Changed to `$BASE_URL/auth/login`
- **Files modified:** tests/smoke-phase13.sh
- **Commit:** 8933114

**2. [Rule 1 - Bug] Fixed smoke-phase13.sh agent extraction and response parsing**
- **Found during:** Smoke test run
- **Issue:** Agent ID extractor expected bare list; actual response is `{ data: { agents: [] } }`. LEARN-01/03 expected bare array; actual shape is `{ data: { sessions: [] } }`
- **Fix:** Updated Python extraction to unwrap envelope properly
- **Files modified:** tests/smoke-phase13.sh
- **Commit:** 8933114

**3. [Rule 1 - Bug] Fixed smoke-phase13.sh DB path detection**
- **Found during:** Smoke test run
- **Issue:** `cfg.dataDir` is undefined in porter_config.json (field doesn't exist); node returned `undefined/porter.db`; the `|| echo` fallback only triggers on node process failure, not undefined output
- **Fix:** Hardcoded `DB_PATH="/home/lobster/.porter/porter.db"` (the actual runtime DB path from config.ts)
- **Files modified:** tests/smoke-phase13.sh
- **Commit:** 8933114

## Self-Check: PASSED

- FOUND: backend/src/services/scheduler.ts
- FOUND: backend/src/routes/v1/memory.ts
- FOUND: backend/src/routes/v1/agents.ts
- FOUND: backend/src/routes/v1/index.ts
- FOUND: .planning/phases/13-autonomous-learning/13-03-SUMMARY.md
- FOUND commit: 72580ab (scheduler integration)
- FOUND commit: 4616d4d (memory route + learning-sessions)
- FOUND commit: 8933114 (smoke test fixes)
