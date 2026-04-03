---
phase: 35-agent-evolution-loop
plan: 02
subsystem: api
tags: [evolution, proposals, persona_skills, skills-manifest, admin-api, postgres]

# Dependency graph
requires:
  - phase: 35-01
    provides: skill_evolution_proposals and skill_evolution_events tables + analyzeSkillEvolution service

provides:
  - GET /api/admin/skills/proposals — list proposals with status/persona_id filters, joined to personas+skills
  - GET /api/admin/skills/proposals/:id — single proposal detail with persona_name and skill_name
  - POST /api/admin/skills/proposals/:id/approve — applies change to persona_skills, regenerates SKILLS.md, logs evolution event
  - POST /api/admin/skills/proposals/:id/reject — marks rejected, logs rejection event

affects: [35-03, admin-ui, agent-evolution-loop]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Proposal-before-/:id route registration prevents Fastify route param shadowing"
    - "regenSkillsManifest inlined as module-level helper (not imported from brain service) to avoid cross-service coupling"
    - "config.personasDir used for SKILLS.md write path — consistent with agents.ts pattern"
    - "crypto.randomUUID() for evolution event IDs"

key-files:
  created: []
  modified:
    - admin/backend/src/routes/skills.ts

key-decisions:
  - "regenSkillsManifest inlined instead of imported from backend/src/services/skills-manifest.ts — admin uses pg helpers not pool.query, avoids cross-service coupling"
  - "config.personasDir used for SKILLS.md path — consistent with agents.ts rather than hardcoding projects/porter/personas"
  - "rewrite_prompt and enrich_examples change types do NOT mutate persona_skills — they are flagged for manual follow-up in proposed_change JSONB"
  - "ON CONFLICT (persona_id, skill_id) DO NOTHING on add_skill — safe idempotent insert"

patterns-established:
  - "Evolution event logged on both approve AND reject — full audit trail"
  - "effectiveness_before captured from persona_skills before mutation so baseline is preserved in event"
  - "reviewer extracted from req.user.username with fallback to 'admin'"

requirements-completed: [EVO-02, EVO-03, EVO-04, EVO-05]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 35 Plan 02: Agent Evolution Loop Summary

**4 evolution proposal control-plane endpoints: list, detail, approve (with SKILLS.md regen + persona_skills mutation), reject — all with audit trail via skill_evolution_events**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-03T01:20:31Z
- **Completed:** 2026-04-03T01:23:10Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- GET /proposals and GET /proposals/:id with persona_name + skill_name joins from proposals table
- Approve endpoint applies persona_skills change based on change_type (remove=DELETE, add=INSERT, rewrite/enrich=flag for manual), regenerates SKILLS.md on disk, logs evolution event with effectiveness_before
- Reject endpoint marks proposal rejected with optional reason, logs rejection event
- Both endpoints record reviewed_at and reviewed_by on the proposal row
- regenSkillsManifest helper inlined — no cross-service coupling to brain's skills-manifest.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Proposals list + detail endpoints** - `2b50362` (feat)
2. **Task 2: Approve + reject endpoints with SKILLS.md regeneration** - `4e721ee` (feat)

**Plan metadata:** `c69b522` (docs: complete plan)

## Files Created/Modified

- `admin/backend/src/routes/skills.ts` - Added 4 new endpoints + regenSkillsManifest helper function (~174 lines added)

## Decisions Made

- Used `config.personasDir` for SKILLS.md path rather than hardcoding `projects/porter/personas` — consistent with agents.ts pattern in the same codebase
- `rewrite_prompt` and `enrich_examples` change_types do not auto-mutate persona_skills because these require human judgment (prompt rewrites) — approval flags the need for manual follow-up
- Evolution events logged for BOTH approve and reject, giving a full audit trail of every decision
- `effectiveness_before` captured from persona_skills immediately before any mutation so the baseline is preserved in the event record

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 4 control-plane endpoints are live and type-safe
- Plan 35-03 (admin UI for evolution proposals) can now call these endpoints
- skill_evolution_events table is being populated — ready for analytics/trending queries
