---
phase: 12-crm-intelligence-and-agent-templates
plan: 01
subsystem: database
tags: [sqlite, drizzle-orm, migrations, crm, agent-templates, schema]

# Dependency graph
requires:
  - phase: 11-unified-chat-and-crm-schema
    provides: contacts table, personas table, migration pattern (migrate-11.ts)
provides:
  - contact_analyses table with sentiment, engagement_score, churn_risk, relationship_stage, key_topics columns
  - agent_templates table with all content columns (system_prompt, soul_text, role_card_text, identity_text, skills_text)
  - personas.template_id column for agent provenance tracking
  - migrate12CrmIntelligence() function wired into boot sequence
  - Drizzle ORM exports: contactAnalyses, agentTemplates (and updated personas with templateId)
  - tests/smoke-phase12.sh scaffold covering CRM-03, CRM-04, TMPL-01, TMPL-02, TMPL-03
affects: [12-02, 12-03, 12-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [idempotent-migration-with-schema_migrations-guard, try-catch-for-alter-table-idempotency]

key-files:
  created:
    - backend/src/db/migrate-12.ts
    - tests/smoke-phase12.sh
  modified:
    - backend/src/db/schema.ts
    - backend/src/index.ts

key-decisions:
  - "ALTER TABLE personas wrapped in try/catch for idempotency — SQLite has no IF NOT EXISTS for ALTER TABLE"
  - "Smoke test uses python3 stdlib JSON parsing as fallback alongside grep for field extraction — no npm deps"

patterns-established:
  - "Pattern 1: All Phase 12 DDL in single migrate-12.ts, idempotency via schema_migrations table guard"
  - "Pattern 2: Smoke test scaffold created before API implementation — defines expected contract"

requirements-completed: [CRM-03, CRM-04, TMPL-01, TMPL-02, TMPL-03]

# Metrics
duration: 3min
completed: 2026-03-22
---

# Phase 12 Plan 01: CRM Intelligence + Agent Templates Schema Summary

**SQLite schema migration adds contact_analyses and agent_templates tables plus personas.template_id, with full Drizzle ORM definitions and an executable smoke test scaffold covering all 5 Phase 12 requirements**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T16:15:06Z
- **Completed:** 2026-03-22T16:18:14Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- contact_analyses table with CHECK constraints on sentiment, engagement_score, churn_risk, and relationship_stage
- agent_templates table with all 17 columns including 5 content text fields and 2 indexes
- Drizzle schema exports contactAnalyses and agentTemplates, personas gains templateId field
- smoke-phase12.sh covers all 5 requirements (CRM-03, CRM-04, TMPL-01, TMPL-02, TMPL-03) with pass/fail tracking and exit codes

## Task Commits

1. **Task 1: Create migrate-12.ts with contact_analyses, agent_templates, and personas ALTER** - `a325ff7` (feat)
2. **Task 2: Add Drizzle schema definitions for new tables** - `c2dbcf2` (feat)
3. **Task 3: Create smoke-phase12.sh test scaffold** - `0cf4a15` (feat)

## Files Created/Modified
- `backend/src/db/migrate-12.ts` - Phase 12 idempotent migration with 2 CREATE TABLE statements and 1 ALTER TABLE
- `backend/src/db/schema.ts` - Added contactAnalyses, agentTemplates exports and personas.templateId field
- `backend/src/index.ts` - Wired migrate12CrmIntelligence() into boot sequence after migrate11UnifiedChat()
- `tests/smoke-phase12.sh` - Executable bash smoke test scaffold for all Phase 12 endpoints

## Decisions Made
- ALTER TABLE personas wrapped in try/catch for idempotency — SQLite has no IF NOT EXISTS syntax for ALTER TABLE, consistent with how other phases handle this pattern
- Smoke test uses python3 stdlib JSON parsing alongside grep for field extraction — self-contained, no npm dependencies required

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 12 database schema is complete and ready for API implementation
- Plan 02 (agent template catalog seed) can insert templates into agent_templates table
- Plan 03 (CRM analysis API) can insert analyses into contact_analyses table
- Plan 04 (contact timeline API) can query the unified tables
- smoke-phase12.sh will validate all implementations when plans 02-04 are complete

## Self-Check: PASSED

- backend/src/db/migrate-12.ts: FOUND
- backend/src/db/schema.ts: FOUND
- tests/smoke-phase12.sh: FOUND
- .planning/phases/12-crm-intelligence-and-agent-templates/12-01-SUMMARY.md: FOUND
- commit a325ff7: FOUND
- commit c2dbcf2: FOUND
- commit 0cf4a15: FOUND

---
*Phase: 12-crm-intelligence-and-agent-templates*
*Completed: 2026-03-22*
