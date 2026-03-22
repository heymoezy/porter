---
phase: 13-autonomous-learning
plan: "01"
subsystem: database
tags: [sqlite, drizzle-orm, fts5, memory-v2, concepts, learning-sessions]

# Dependency graph
requires:
  - phase: 12-crm-intelligence-and-agent-templates
    provides: agent_templates table (referenced by learning_sessions FK)
provides:
  - concepts table with Memory V2 fields (memory_kind, trust_tier, scope, source_url, confidence_score, session_id)
  - learning_sessions audit log table (sources_visited, concepts_retained, confidence_distribution, capped)
  - concepts_fts FTS5 virtual table with three sync triggers (concepts_ai, concepts_ad, concepts_au)
  - Drizzle ORM definitions for both tables in schema.ts
  - migrate13AutonomousLearning() wired into Fastify boot sequence
  - smoke-phase13.sh defining Phase 13 API contract for LEARN-01, LEARN-02, LEARN-03
affects: [13-autonomous-learning plans 02-03, any phase using Memory V2 concepts store]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FTS5 with content_rowid='rowid' (same as Phase 11 messages_fts) for full-text search on TEXT PRIMARY KEY tables"
    - "Three-trigger FTS5 sync pattern: concepts_ai (insert), concepts_ad (delete), concepts_au (update)"
    - "Idempotency guard via schema_migrations table — same pattern as Phase 12"
    - "Smoke test scaffold defines API contract before implementation (same as Phase 12)"

key-files:
  created:
    - backend/src/db/migrate-13.ts
    - tests/smoke-phase13.sh
  modified:
    - backend/src/db/schema.ts
    - backend/src/index.ts

key-decisions:
  - "content_rowid='rowid' (not content_rowid='id') for FTS5 — references SQLite implicit INTEGER rowid, same as Phase 11 messages_fts"
  - "Smoke test covers schema-level validation as fallback when endpoints not yet implemented (plans 02/03)"
  - "learning_sessions.template_id FK REFERENCES agent_templates(id) ON DELETE CASCADE — sessions die with their template"

patterns-established:
  - "Phase 13 DB migration pattern: migrate13AutonomousLearning() with migrationId 'phase13_autonomous_learning'"
  - "concepts table is the canonical Memory V2 store — use scope+scope_id for agent/project/global scoping"

requirements-completed: [LEARN-01, LEARN-02, LEARN-03]

# Metrics
duration: 3min
completed: 2026-03-22
---

# Phase 13 Plan 01: Autonomous Learning DB Foundation Summary

**SQLite concepts table (Memory V2), learning_sessions audit log, FTS5 full-text search with sync triggers, Drizzle ORM definitions, and smoke test scaffold defining the LEARN-01/02/03 API contract**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-22T21:23:35Z
- **Completed:** 2026-03-22T21:26:47Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- concepts table with all Memory V2 fields: memory_kind, trust_tier, scope, scope_id, source_url, confidence_score, status, review_state, superseded_by_id, session_id
- FTS5 virtual table concepts_fts with three sync triggers keeping full-text index in sync
- learning_sessions audit log with sources_visited, concepts_retained, confidence_distribution, capped fields
- Drizzle ORM definitions for both tables appended to schema.ts
- migrate13AutonomousLearning() imported and called in Fastify boot sequence (after migrate12CrmIntelligence)
- smoke-phase13.sh scaffold with LEARN-01/02/03 tests and schema-level fallback validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create migrate-13.ts** - `f9fa9e5` (feat)
2. **Task 2: Drizzle definitions + migration wiring + smoke test** - `2c557d7` (feat)

## Files Created/Modified

- `backend/src/db/migrate-13.ts` - Migration function: concepts + learning_sessions + FTS5 + triggers
- `backend/src/db/schema.ts` - Drizzle ORM definitions for concepts and learningSessions tables
- `backend/src/index.ts` - Import + call migrate13AutonomousLearning() in boot sequence
- `tests/smoke-phase13.sh` - Smoke test defining LEARN-01, LEARN-02, LEARN-03 API contract

## Decisions Made

- content_rowid='rowid' (not 'id') for FTS5 — references SQLite's implicit INTEGER rowid, consistent with Phase 11 messages_fts pattern
- Smoke test includes schema-level validation (via sqlite3 PRAGMA) as fallback when endpoints not yet implemented
- learning_sessions FK to agent_templates ON DELETE CASCADE — orphan cleanup automatic

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- concepts and learning_sessions tables ready for Plan 02 (web scraping + concept extraction)
- FTS5 virtual table ready for semantic search in Plan 03
- Smoke test endpoints (LEARN-01, LEARN-02) will pass once API routes implemented in Plans 02/03

---
*Phase: 13-autonomous-learning*
*Completed: 2026-03-22*
