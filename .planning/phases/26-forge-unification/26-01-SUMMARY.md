---
phase: 26-forge-unification
plan: "01"
subsystem: backend-api
tags: [rpg, workshop, templates, endpoint]
dependency_graph:
  requires: [25-rpg-engine, 24-schema-migration]
  provides: [workshop-endpoint]
  affects: [26-02, 26-03]
tech_stack:
  added: []
  patterns: [raw-pg-query, fastify-route-ordering]
key_files:
  created: []
  modified:
    - backend/src/routes/admin/templates.ts
decisions:
  - "Workshop endpoint registered before /:id to avoid Fastify route shadowing"
  - "Inline interfaces (SupportEntry, TemplateSkillRow, WorkshopTemplateRow) used — no shared type file needed for single-file scope"
  - "skill_slots computed as max(4, 4 + star_level - 1) — ensures minimum 4 slots regardless of star_level value"
metrics:
  duration: "111s"
  completed_date: "2026-04-01"
  tasks_completed: 2
  files_modified: 1
---

# Phase 26 Plan 01: Workshop Endpoint Summary

**One-liner:** GET /api/admin/templates/:id/workshop returns RPG build data (skills with 30d success rates, supports JSONB, star_level, intelligence) for the Forge Workshop tab.

## What Was Built

Added a single GET route to `backend/src/routes/admin/templates.ts` that returns everything the Workshop tab (Plans 26-02/26-03) needs to render a template's configured build.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add GET /:id/workshop endpoint | 9b40fcd | backend/src/routes/admin/templates.ts |
| 2 | Build and restart — verify endpoint live | (no new files) | verified: build + health + 401 |

## Endpoint Contract

```
GET /api/admin/templates/:id/workshop
Auth: platform_admin required (401 if unauthenticated)
404: Template not found

Response shape:
{
  id, name,
  star_level, level, xp, rarity, shell, elo_rating,
  intelligence: {},          // JSONB parsed
  supports: SupportEntry[],  // JSONB parsed, includes prompt_diff + measured_impact
  equipment_slots: [],       // JSONB parsed
  passive_tree: [],          // JSONB parsed
  skill_slots: number,       // max(4, 4 + star_level - 1)
  skills: [{
    skill_id, sort_order,
    success_rate_30d, total_uses, last_used
  }]
}
```

## Verification Results

- `npx tsc --noEmit` — zero type errors
- `npm run build` — exits 0
- `curl /health` — returns `status: ok`
- `curl /api/admin/templates/eng-frontend-dev/workshop` — returns 401 (route registered, auth-gated), not 404

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `backend/src/routes/admin/templates.ts` modified and committed (9b40fcd)
- [x] Workshop route appears before /:id in file (line 122 vs line 171)
- [x] TypeScript compiles clean
- [x] Endpoint registered and auth-gated (401, not 404)
