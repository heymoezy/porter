---
phase: 12-crm-intelligence-and-agent-templates
plan: "02"
subsystem: api
tags: [ollama, qwen, scheduler, crm, sqlite, fastify, contact-analysis]

# Dependency graph
requires:
  - phase: 12-01
    provides: contact_analyses table schema, contact_conversations JOIN pattern, agent_jobs scheduler infrastructure

provides:
  - contact-analyzer.ts service: Ollama/Qwen dispatch with structured JSON prompt, message history query, response validation
  - POST /api/v1/contacts/:id/analyze endpoint returning 202 with job_id
  - Scheduler contact_analysis handler: runs analyzeContact, writes to contact_analyses, re-enqueues
  - scheduleNextContactAnalysis(): self-adjusting frequency (4h/12h/24h/6h error backoff)
  - bootstrapContactAnalysis(): startup seeder for contacts with conversations but no pending job
  - ai_analysis field in GET /api/v1/contacts/:id response (nullable, latest analysis)

affects: [12-03, 12-04, crm-frontend, agent-templates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct Ollama /api/generate dispatch (never through AI router) with format: 'json' and AbortSignal.timeout(30000)"
    - "Markdown code fence stripping before JSON.parse (Qwen sometimes wraps output in ```json)"
    - "Self-adjusting re-enqueue: engagement_score drives interval (70+ = 4h, 30-69 = 12h, 0-29 = 24h, error = 6h)"
    - "Bootstrap seeder on scheduler start: seeds jobs for contacts missing pending analysis"
    - "Dynamic import pattern for new service modules in scheduler executeJob()"

key-files:
  created:
    - backend/src/services/contact-analyzer.ts
  modified:
    - backend/src/services/scheduler.ts
    - backend/src/routes/v1/contacts.ts

key-decisions:
  - "Ollama called directly via fetch() — never through AI router — to keep CRM analysis decoupled from routing heuristics"
  - "Re-enqueue always happens (success AND failure) so the 24/7 sweep never stops; failure uses 6h backoff"
  - "bootstrapContactAnalysis() staggered over 5 minutes to prevent thundering herd on startup"
  - "POST /:id/analyze registered before GET /:id to avoid Fastify parametric route shadowing"
  - "JSON.parse of Ollama response guarded by markdown fence stripping — Qwen wraps output inconsistently"

patterns-established:
  - "Dynamic import in scheduler for new analysis services: avoids circular deps and keeps scheduler.ts lean"
  - "Contact analysis re-enqueue: always re-enqueue in finally-equivalent block (after both success and error paths)"

requirements-completed: [CRM-03]

# Metrics
duration: 4min
completed: 2026-03-22
---

# Phase 12 Plan 02: CRM Contact Analyzer Summary

**Ollama/Qwen contact analysis service with 24/7 autonomous sweep, self-adjusting frequency, and POST /contacts/:id/analyze API**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-22T16:20:41Z
- **Completed:** 2026-03-22T16:24:18Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- Created `contact-analyzer.ts` — calls Ollama /api/generate directly with structured JSON prompt derived from real message history (never cached), strips markdown fences, validates all 7 response fields with safe defaults
- Wired `contact_analysis` handler in scheduler: runs Ollama analysis, writes row to `contact_analyses`, logs activity, re-enqueues next sweep with engagement-score-driven interval (4h/12h/24h/6h error)
- Added `bootstrapContactAnalysis()` called from `start()` to seed pending jobs for all contacts with linked conversations on service startup
- Added `POST /contacts/:id/analyze` (202 + job_id) registered before `GET /:id` to avoid Fastify route shadowing
- Updated `GET /contacts/:id` to include `ai_analysis` key from latest `contact_analyses` row (null if none yet)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create contact-analyzer.ts service** - `3b3f40c` (feat)
2. **Task 2: Wire scheduler handler + bootstrap + API routes** - `f33010b` (feat)

**Plan metadata:** (committed with state updates)

## Files Created/Modified
- `backend/src/services/contact-analyzer.ts` - Ollama dispatch, prompt builder, JSON parser, ContactAnalysis interface
- `backend/src/services/scheduler.ts` - contact_analysis handler, scheduleNextContactAnalysis export, bootstrapContactAnalysis, start() bootstrap call
- `backend/src/routes/v1/contacts.ts` - POST /:id/analyze route, ai_analysis in GET /:id response

## Decisions Made
- Ollama called directly via fetch() — never through AI router — to keep CRM analysis decoupled from routing heuristics and avoid token accounting overhead for scheduled background work
- Re-enqueue always happens (success AND failure) using `scheduleNextContactAnalysis()` so the sweep never stops; failure path passes `-1` for 6h backoff
- `bootstrapContactAnalysis()` staggered over 5 minutes (300s / N contacts) to prevent thundering herd on scheduler restart
- POST /:id/analyze registered before GET /:id — locked lesson from Phase 11 about Fastify parametric route conflicts
- Markdown code fence stripping applied before JSON.parse since Qwen wraps JSON in ```json``` inconsistently even with format:'json'

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None. TypeScript compiled clean after both tasks.

## User Setup Required
None — no external service configuration required. Ollama must be running (standard local dev setup).

## Next Phase Readiness
- CRM-03 complete: analysis service running, scheduler consuming jobs, results stored, API exposed
- Ready for Plan 12-03 (agent templates API) — contact_analyses table populated by autonomous sweep
- GET /contacts/:id now surfaces ai_analysis for frontend consumption

## Self-Check: PASSED
- contact-analyzer.ts: FOUND
- scheduler.ts: FOUND
- contacts.ts: FOUND
- 12-02-SUMMARY.md: FOUND
- Commit 3b3f40c: FOUND
- Commit f33010b: FOUND

---
*Phase: 12-crm-intelligence-and-agent-templates*
*Completed: 2026-03-22*
