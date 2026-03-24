---
phase: 15-skills-tools-architecture
plan: "03"
subsystem: backend
tags: [forge, templates, skills, tools, junction-tables, migration]
dependency_graph:
  requires: ["15-01"]
  provides: ["junction-table forge pipeline", "deployed_by field on personas"]
  affects: ["backend/src/services/forge.ts", "backend/src/routes/v1/templates.ts"]
tech_stack:
  added: []
  patterns: ["junction-table reads with JSONB fallback", "deployed_by provenance field"]
key_files:
  modified:
    - backend/src/services/forge.ts
    - backend/src/routes/v1/templates.ts
decisions:
  - "JSONB fallback retained in both forge stations and instantiation route — safety net for pre-Phase 15 data or empty junction rows"
  - "deployed_by set to requesting username at instantiation time — same value as owner field"
metrics:
  duration_seconds: 104
  completed_date: "2026-03-24"
  tasks_completed: 2
  files_modified: 2
---

# Phase 15 Plan 03: Forge Junction Table Migration Summary

One-liner: Forge Station 2 (Trainer) and Station 3 (Outfitter) now read skills/tools from template_skills and template_tools junction tables; template instantiation writes deployed_by and sources config from junction tables — both with JSONB fallback.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update Forge Station 2 and 3 to read junction tables | c6be70e | backend/src/services/forge.ts |
| 2 | Update template instantiation with deployed_by and junction-table config | e88bbe7 | backend/src/routes/v1/templates.ts |

## Changes Made

### Task 1 — forge.ts (Stations 2 and 3)

**Station 2 (Trainer) — runTrainer:**
- Replaced `SELECT skills FROM agent_templates WHERE id = $1` + `JSON.parse` with a junction table query: `SELECT ts.skill_id FROM template_skills ts WHERE ts.template_id = $1 ORDER BY ts.sort_order`
- If junction returns rows, maps to `templateSkills` array directly
- Falls back to JSONB parse only when junction is empty (pre-Phase 15 templates or empty rows)

**Station 3 (Outfitter) — runOutfitter:**
- Replaced `SELECT tools, required_tools FROM agent_templates WHERE id = $1` + `JSON.parse` with: `SELECT tt.tool_id FROM template_tools tt WHERE tt.template_id = $1 ORDER BY tt.sort_order`
- Same prefer-junction / JSONB-fallback pattern as Station 2
- All other outfitter logic (workspace_connections check, appearance_spec, completeStationRun) untouched

### Task 2 — templates.ts (instantiation route)

**Junction queries added** (after template fetch, before dependency check):
- `SELECT skill_id FROM template_skills WHERE template_id = $1 ORDER BY sort_order`
- `SELECT tool_id FROM template_tools WHERE template_id = $1 ORDER BY sort_order`
- `skillsList` and `toolsList` computed with fallback to JSONB if junction empty

**Config blob updated:**
- `skills: skillsList` replaces `skills: parseJsonField<string[]>(template.skills, [])`
- `tools: toolsList` replaces `tools: parseJsonField<string[]>(template.tools, [])`

**deployed_by added to persona INSERT:**
- Column added: `INSERT INTO personas (..., template_id, deployed_by) VALUES (..., $7, $8)`
- Value: `request.sessionUser!.username` (same as owner)
- Enables Porter-internal vs customer provenance tracking

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `grep "template_skills" backend/src/services/forge.ts` — junction query present in Station 2
- `grep "template_tools" backend/src/services/forge.ts` — junction query present in Station 3
- `grep "deployed_by" backend/src/routes/v1/templates.ts` — column in INSERT
- `grep "skillsList\|toolsList" backend/src/routes/v1/templates.ts` — junction-sourced config
- TypeScript build: `npm run build` — clean, 0 errors

## Self-Check: PASSED

Files exist:
- backend/src/services/forge.ts — FOUND
- backend/src/routes/v1/templates.ts — FOUND

Commits:
- c6be70e — FOUND (feat(15-03): update Forge Station 2 and 3 to read from junction tables)
- e88bbe7 — FOUND (feat(15-03): update template instantiation with junction-table sources and deployed_by)
