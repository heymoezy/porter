---
phase: "05"
plan: "01"
subsystem: wizard-api
tags: [wizard, backend, sqlite, fastify, typescript, ai-router]
dependency_graph:
  requires: [phase04-agent-autonomy, personas-directory]
  provides: [POST /api/v1/projects/wizard, WizardTypes, migrate05GuidedWizard]
  affects: [backend/src/index.ts, backend/src/routes/v1/index.ts]
tech_stack:
  added: []
  patterns: [sqlite.transaction for atomic multi-table insert, heuristic+LLM two-stage detect, module-load template scanning]
key_files:
  created:
    - backend/src/types/wizard.ts
    - backend/src/db/migrate-05.ts
    - backend/src/routes/v1/wizard.ts
  modified:
    - backend/src/index.ts
    - backend/src/routes/v1/index.ts
decisions:
  - "approve action returns HTTP 200 (not 201) to match pre-written test contract"
  - "detect uses heuristic-first + LLM fallback — avoids LLM call on obvious non-project messages"
  - "AVAILABLE_TEMPLATES loaded at module load from personas/ directory — cached for lifetime of process"
  - "approve action logs activity per agent using INSERT INTO agent_activity (no logActivity helper — direct SQL for transaction safety)"
metrics:
  duration: "9 minutes"
  completed: "2026-03-21"
  tasks_completed: 2
  files_created: 3
  files_modified: 2
---

# Phase 05 Plan 01: Wizard Backend API Summary

**One-liner:** SQLite-transactional wizard backend (detect/propose/approve) with heuristic+LLM detection and personas/ template selection.

## What Was Built

POST /api/v1/projects/wizard with three actions:

- **detect** — heuristic keyword check first; LLM classification only when message looks project-like. Returns `WizardDetectResult` with `isProject`, `clarity`, and optional clarifying `suggestedQuestions`.
- **propose** — dispatches to Porter master agent with available personas/ templates injected; parses LLM JSON into `WizardProposal` with `agents`, `milestones`, `scopeLabel`, and `explanation`.
- **approve** — single `sqlite.transaction()` atomically creates: project row, ephemeral persona per agent (is_temporary=1), wizard_start job per agent, activity log entry per agent. Returns `{ projectId, agentIds, jobIds }`.

Feature flag `FEATURE_GUIDED_WIZARD=true` gates all three actions (returns 503 when unset).

## Verification

All tests pass:
- `python3 /tmp/test_proj01_wizard_api.py` — PASS (endpoint validates, returns isProject)
- `python3 /tmp/test_proj01_detect.py` — PASS (bakery=true, hello=false)
- `python3 /tmp/test_proj01_approve.py` — PASS (atomic project creation, verifiable via GET)
- `npx playwright test` — 35/35 passed (no regressions)
- `npx tsc --noEmit` — zero errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] approve returns 200 not 201**
- **Found during:** Task 2 verification
- **Issue:** Plan specified 201 for resource creation, but pre-written test `test_proj01_approve.py` checked for `status != 200` and failed with 201.
- **Fix:** Changed `reply.code(201).send(ok(result))` to `reply.send(ok(result))` (defaults to 200).
- **Files modified:** `backend/src/routes/v1/wizard.ts`
- **Commit:** f31f4de

## Self-Check: PASSED

Files created:
- FOUND: backend/src/types/wizard.ts
- FOUND: backend/src/db/migrate-05.ts
- FOUND: backend/src/routes/v1/wizard.ts

Commits exist:
- FOUND: 61b0b75 (feat(05-01): wizard types, DB migration, and startup wiring)
- FOUND: f31f4de (feat(05-01): wizard API endpoint with detect, propose, and approve actions)
