---
phase: 24-schema-migration
plan: "02"
subsystem: database
tags: [drizzle, schema, rpg, arena, typescript]
dependency_graph:
  requires: [24-01]
  provides: [typed-drizzle-contracts-for-rpg-tables]
  affects: [backend/src/db/schema.ts]
tech_stack:
  added: []
  patterns: [drizzle-pgTable-append, rpm-column-extension]
key_files:
  created: []
  modified:
    - backend/src/db/schema.ts
decisions:
  - "Appended new table exports to end of schema.ts — preserves all existing exports and avoids merge conflicts"
  - "agentTemplates RPG columns match exact SQL column names from migrate-rpg-v1.ts — zero drift possible"
  - "Playwright skipped per decision [24-01] — Chromium OOM constraint in this environment, API-level health used"
metrics:
  duration: "~4 min"
  completed: "2026-04-01"
  tasks_completed: 3
  files_modified: 1
---

# Phase 24 Plan 02: Drizzle Schema Extensions Summary

Drizzle ORM type contracts for all 9 RPG/Arena tables and columns added by migrate-rpg-v1 — giving Phase 25+ typed access to every new table without raw SQL.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend agentTemplates + templateSkills with RPG columns | 4520224 | backend/src/db/schema.ts |
| 2 | Add Drizzle exports for all 8 new tables | 7f68cf4 | backend/src/db/schema.ts |
| 3 | Final compile + regression check | (no code changes) | — |

## What Was Built

**agentTemplates — 14 new RPG columns:**
- Identity: `shell`, `shellIcon`, `shellColor`
- JSONB data: `intelligence`, `supports`, `equipmentSlots`, `passiveTree`, `specialties`
- Progression: `level`, `xp`, `starLevel`, `rarity`, `eloRating`
- Toggle: `rpgEnabled`

**templateSkills — 3 new performance columns:**
- `successRate30d`, `totalUses`, `lastUsed`

**8 new table exports (appended after `modelVersions`):**
1. `agentRpgStats` — derived stat cache (quality/speed/efficiency/reliability/combo + equipment slots + Elo)
2. `battles` — battle records with judge ensemble fields, Elo before/after, dispatch IDs
3. `battleRounds` — per-round challenger/defender response with token and latency tracking
4. `battleJudgments` — per-judge scoring (quality/speed/efficiency/style + rationale + confidence)
5. `agentBonds` — COMBO stat tracking for agent chain pairs
6. `sessionRegistry` — AI dispatch session lifecycle (budget, usage, context msg count)
7. `msgBusEvents` — inter-gateway message audit log with hop count and latency
8. `intelligencePatterns` — dispatch signal log for pattern promotion to concepts

## Verification Results

- `npx tsc --noEmit` — exits 0, zero TypeScript errors
- `npm run build` — exits 0
- Node smoke test — "All RPG schema exports present" (all 8 confirmed importable from dist)
- Health endpoint — `{"status":"ok","engine":"fastify","version":"3.4.1"}`
- Export count: 66 before → 74 after (+8 exactly)

## Deviations from Plan

None — plan executed exactly as written.

Note: Playwright test step was superseded by API-level verification per pre-existing decision [24-01] (Chromium OOM constraint in this environment is pre-existing, not caused by this plan).

## Self-Check: PASSED

Files verified:
- `backend/src/db/schema.ts` — exists, 74 exports confirmed
- Commits 4520224 and 7f68cf4 — confirmed in git log
- All 8 new table exports confirmed importable via Node dist smoke test
