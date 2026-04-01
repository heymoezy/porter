---
phase: 30-intelligence-loop-bridge-operator
plan: "01"
subsystem: intelligence
tags: [intelligence-loop, patterns, concepts, scheduler, background-job]
dependency_graph:
  requires: [bridge_dispatch_log, intelligence_patterns, concepts]
  provides: [intelligence-loop.ts, scheduler hook]
  affects: [scheduler.ts, concepts table, intelligence_patterns table]
tech_stack:
  added: []
  patterns: [pool.query, uuidv4, fire-and-forget scheduler probe]
key_files:
  created:
    - backend/src/services/intelligence-loop.ts
  modified:
    - backend/src/services/scheduler.ts
decisions:
  - Intelligence extraction runs as infrastructure probe (outside agentScheduling gate) — same pattern as RPG recalculation
  - 4 pattern types extracted in parallel via Promise.all for efficiency
  - Deduplication window is 6h (21600s) — matches extraction interval to prevent duplicate rows
  - failure_mode patterns only inserted if failure_pct >= 10 (noise filter)
  - cost_pattern confidence fixed at 70 — factual but changes slowly
metrics:
  duration: 138s
  completed: "2026-04-01"
  tasks_completed: 2
  files_changed: 2
---

# Phase 30 Plan 01: Intelligence Loop — Pattern Extraction + Concept Promotion Summary

**One-liner:** Background job extracts 4 dispatch signal pattern types every 6h and auto-promotes high-confidence patterns to Memory V2 concepts.

## What Was Built

### Task 1: intelligence-loop.ts service

Created `backend/src/services/intelligence-loop.ts` with a single exported function `extractIntelligencePatterns(): Promise<void>` that:

1. Runs 4 SQL analysis queries against `bridge_dispatch_log` (last 7 days) **in parallel** via `Promise.all`
2. Each pattern extractor checks deduplication before inserting (skips if same type+gateway+agent within 6h)
3. After extraction, promotes all `confidence >= 80` + `status='raw'` patterns to the `concepts` table
4. Updates `intelligence_patterns.status = 'promoted'` and sets `promoted_to_concept_id`
5. Entire function wrapped in try/catch — never throws, always logs outcome

**Pattern types:**

| Type | SQL | Confidence Logic |
|------|-----|-----------------|
| `latency_trend` | AVG + P95 per gateway (>= 10 samples) | p95 < 3000ms → 85, p95 > 10000ms → 80, else 60 |
| `model_strength` | dispatch count per agent/gateway/model (>= 5) | MIN(95, 60 + count * 2) |
| `failure_mode` | null-latency rate per gateway (>= 3 failures, >= 10%) | MIN(90, 50 + failure_pct) |
| `cost_pattern` | avg + total cost per gateway (>= 5 dispatches with cost > 0) | fixed 70 |

### Task 2: Scheduler hook

Added to `backend/src/services/scheduler.ts`:
- Import of `extractIntelligencePatterns`
- `INTEL_EXTRACTION_INTERVAL = 10800` constant (10800 × 2s = 6 hours)
- Tick gate: `if (tickCount > 0 && tickCount % INTEL_EXTRACTION_INTERVAL === 0)` — placed alongside RPG recalculation as an infrastructure probe (outside `agentScheduling` gate)

## Verification Results

```
grep -n "INTEL_EXTRACTION_INTERVAL|extractIntelligencePatterns" scheduler.ts
→ 4 lines: import (line 13), constant (line 23), condition (line 321), call (line 322)

npm run build → clean (no TypeScript errors)
```

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `backend/src/services/intelligence-loop.ts` created (290 lines)
- [x] `backend/src/services/scheduler.ts` modified (import + constant + tick call)
- [x] `extractIntelligencePatterns` exported
- [x] 4 pattern type branches exist
- [x] Deduplication check in all 4 extractors
- [x] Promotion inserts into `concepts` with `status='promoted'`, updates `intelligence_patterns`
- [x] Backend builds with zero TypeScript errors
- [x] Commits: c035b0f (intelligence-loop.ts), 7988580 (scheduler hook)
