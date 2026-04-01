---
phase: 25-rpg-engine
plan: "01"
subsystem: backend/services
tags: [rpg, stats, xp, progression, tdd]
dependency_graph:
  requires: [24-schema-migration]
  provides: [rpg-engine.ts — recalculateStats, awardXP, checkProgression, getRpgStats]
  affects: [agent_rpg_stats table, bridge_dispatch_log aggregation, battles/agent_bonds reads]
tech_stack:
  added: []
  patterns: [pool.query raw SQL, fire-and-forget async, TDD RED-GREEN with node:test + tsx]
key_files:
  created:
    - backend/src/services/rpg-engine.ts
    - backend/src/__tests__/rpg-engine.test.ts
  modified: []
decisions:
  - Pure stat helpers (computeQuality/Speed/Efficiency/Reliability/Combo/Level/Stars/Rarity) exported for unit-testability — they take plain numbers, no DB dependency
  - computeLevel uses iterative advancement (consume XP as you go) rather than cumulative sum formula — correctly handles all level thresholds
  - awardXP calls checkProgression after every award to keep stars/rarity in sync
  - SELECT-then-INSERT/UPDATE pattern used for agent_rpg_stats because migration adds only an INDEX on template_id, not a UNIQUE constraint
metrics:
  duration: "4 minutes"
  completed_date: "2026-04-01"
  tasks_completed: 1
  files_changed: 2
---

# Phase 25 Plan 01: RPG Engine Summary

RPG stat engine with TDD — derives all 5 stats from bridge_dispatch_log, handles XP accumulation, level advancement, star/rarity progression, and specialty extraction.

## What Was Built

`backend/src/services/rpg-engine.ts` — the sole writer to `agent_rpg_stats`. All stat values permanently tied to real dispatch history.

### Exported functions

| Function | Purpose |
|---|---|
| `recalculateStats(templateId)` | 6 SQL queries, full stat recompute, upserts agent_rpg_stats row |
| `awardXP(templateId, event)` | Add XP by event type, advance level, recompute stars/rarity, emit SSE on level up |
| `checkProgression(templateId)` | Recompute stars + rarity, write back, return `{ stars, rarity, leveledUp }` |
| `getRpgStats(templateId)` | Simple SELECT — returns RpgStats or null, no recalculation |

### XP_AWARDS constants (exact from spec)

| Event | XP |
|---|---|
| dispatch | 10 |
| feedback | 25 |
| specialty | 50 |
| battle_won | 100 |
| battle_lost | 25 |
| chain | 75 |
| failed | 2 |

### Stat formulas (all from bridge_dispatch_log)

| Stat | Formula |
|---|---|
| Quality | success_count / total_count * 100 (output_tokens > 0 = success) |
| Speed | max(0, 100 - (p95_latency_ms / 30000) * 100) |
| Efficiency | min(100, avg_output_input_ratio * 50) — ratio 2.0 = 100% |
| Reliability | ok_count / recent_count * 100 over last 30 dispatches |
| Combo | total_success / total_chains * 100 from agent_bonds |

### Star thresholds

| Stars | Condition |
|---|---|
| 1 | Default (forged) |
| 2 | dispatch_count >= 50 |
| 3 | dispatch_count >= 200 AND reliability >= 85 |
| 4 | dispatch_count >= 500 AND battle_count >= 10 |
| 5 | dispatch_count >= 1000 AND top 10% by elo |

### Rarity thresholds

| Rarity | Condition |
|---|---|
| common | rpg_enabled = 0 (never forged) |
| rare | rpg_enabled = 1, dispatch_count >= 1 |
| epic | dispatch_count >= 50 |
| legendary | dispatch_count >= 500 AND top 10% battle win rate |
| mythic | dispatch_count >= 5000 |

## Test Coverage

49 tests, 10 suites — all pass. Tests cover pure helpers only (no DB mocking needed):
- XP_AWARDS constants (7 event types)
- computeQuality, computeSpeed, computeEfficiency, computeReliability, computeCombo
- computeLevel (advancement with level*100 curve, cap at 100)
- computeStars (all 5 threshold tiers)
- computeRarity (all 5 rarity tiers including legendary/mythic edge cases)
- 4 exported async function signatures

## Commits

| Hash | Description |
|---|---|
| 29bc69c | test(25-rpg-engine): add failing tests (RED phase) |
| b29b9e4 | feat(25-rpg-engine): implement rpg-engine.ts (GREEN phase) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Design] SELECT-then-INSERT/UPDATE instead of ON CONFLICT**

- **Found during:** Task 1 implementation
- **Issue:** Plan specified `INSERT ... ON CONFLICT (template_id) DO UPDATE` but the migration only creates an INDEX on template_id (not UNIQUE), so ON CONFLICT would fail silently
- **Fix:** Used SELECT to check existence, then INSERT or UPDATE accordingly — same atomic correctness, no constraint dependency
- **Files modified:** backend/src/services/rpg-engine.ts
- **Commit:** b29b9e4

**2. [Rule 2 - Testability] Pure computation helpers exported**

- **Found during:** Task 1 — TDD RED test design
- **Issue:** Plan spec showed only 4 exported async functions; testing them would require DB mocking (complex setup)
- **Fix:** Extracted pure math into named helper functions (computeQuality, computeSpeed, etc.) and exported them so tests can directly assert on formula correctness without any DB dependency
- **Files modified:** backend/src/services/rpg-engine.ts, backend/src/__tests__/rpg-engine.test.ts
- **Commit:** b29b9e4

## Self-Check: PASSED

- FOUND: backend/src/services/rpg-engine.ts
- FOUND: backend/src/__tests__/rpg-engine.test.ts
- FOUND: .planning/phases/25-rpg-engine/25-01-SUMMARY.md
- FOUND: commit 29bc69c (RED test)
- FOUND: commit b29b9e4 (GREEN implementation)
