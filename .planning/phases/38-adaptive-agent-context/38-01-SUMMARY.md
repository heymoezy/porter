---
phase: 38-adaptive-agent-context
plan: "01"
subsystem: ai-routing
tags: [directives, memory-injection, skill-selector, context-scoring, dispatch-logging, postgresql]

# Dependency graph
requires:
  - phase: 33-runtime-skill-selector
    provides: selectSkills, SkillCandidate interface, skill tags from DB
  - phase: 34-feedback-telemetry
    provides: bridge_dispatch_log schema, skillsUsed, context_stats column pattern
  - phase: 35-skill-evolution-engine
    provides: directive context pattern awareness
provides:
  - scoreDirective() — pure function scoring a directive against task words and skill tags
  - selectDirectives() — selects ordered subset of directives within token budget
  - directive-scorer.ts — standalone pure-function scoring module
  - tags TEXT[] column on directives table with GIN index
  - migrate-acx-v1.ts — column migration + one-time tag assignment for 17 directives
  - buildMemoryContext() overload with taskText, skillTags, and returnMeta params
  - RoutingContext.directiveStats field for dispatch log wiring
  - context_stats.directives populated with scoring stats per dispatch
affects:
  - 38-02 (can extend selectDirectives for agent self-querying patterns)
  - 38-03 (context_stats.directives already wired into context-stats-collector)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Directive scoring mirrors skill scoring: priority bonus + task word match + tag affinity"
    - "Always-inject threshold: priority <= 2 bypasses scoring entirely"
    - "Fallback: empty taskWords+skillTags returns all directives in priority order (backward compat)"
    - "returnMeta overload on buildMemoryContext to extract selection stats without breaking callers"
    - "skill-first sequencing: selectSkills runs before buildMemoryContext so tags flow through"

key-files:
  created:
    - backend/src/db/migrate-acx-v1.ts
    - backend/src/services/directive-scorer.ts
  modified:
    - backend/src/services/memory-injection.ts
    - backend/src/services/skill-selector.ts
    - backend/src/routes/v1/chat.ts
    - backend/src/services/bridge/types.ts
    - backend/src/services/bridge/routing-engine.ts

key-decisions:
  - "scoreDirective uses (10 - floor(priority/10)) for priority bonus — ranges 0-10 based on tens digit"
  - "ALWAYS_INJECT_THRESHOLD=2 matches plan spec: priority <= 2 bypasses scoring"
  - "SkillCandidate gains tags field — propagates skill tags from DB through selectSkills result"
  - "directiveStats passed via RoutingContext (not separate param) — consistent with skillsUsed pattern"
  - "Tags assigned heuristically from keyword patterns in migrate-acx-v1 — 17 directives all tagged"
  - "selectDirectives fallback: no taskWords AND no skillTags → original behavior (all, priority-ordered)"

patterns-established:
  - "Directive scorer: pure function, no I/O, same pattern as scoreSkill in skill-selector.ts"
  - "Stats flow: buildMemoryContext(returnMeta=true) → directiveStats → RoutingContext → context_stats"
  - "Token budget passed to selectDirectives from tier2Budget cap, capped by totalRemaining"

requirements-completed: [ACX-01, ACX-02]

# Metrics
duration: 22min
completed: "2026-04-03"
---

# Phase 38 Plan 01: Context-Aware Directive Injection Summary

**Directive scorer with task-keyword + skill-tag affinity matching injected into memory-injection Tier 2 and wired through dispatch logging**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-04-03T03:50:00Z
- **Completed:** 2026-04-03T04:12:03Z
- **Tasks:** 5
- **Files modified:** 7

## Accomplishments

- `directive-scorer.ts` ships as pure scoring module — `scoreDirective` and `selectDirectives` with zero DB deps
- Tags column on directives table, GIN indexed, 17 directives tagged in one migration pass
- `buildMemoryContext()` Tier 2 now selects directives based on task text + active skill tags
- Skill-first sequencing in `/api/v1/chat/stream` — `selectSkills` runs before `buildMemoryContext` so tags flow through
- Directive selection stats wired through `RoutingContext.directiveStats` into `context_stats` dispatch log

## Task Commits

1. **Task 1: Migration — Add tags column** - `a00e278` (chore)
2. **Task 2: Directive scorer function** - `eed2d6d` (feat)
3. **Task 3: Integrate into memory-injection.ts** - `9bba98a` (feat)
4. **Task 4: Wire task context into memory injection call sites** - `924bd02` (feat)
5. **Task 5: Dispatch logging extension** - `22c58dd` (feat)

## Files Created/Modified

- `backend/src/db/migrate-acx-v1.ts` — Migration: tags TEXT[] column + GIN index + tag assignment for 17 directives
- `backend/src/services/directive-scorer.ts` — Pure scorer: `scoreDirective`, `selectDirectives`, `tokenizeTaskText`, `DirectiveSelectionStats`
- `backend/src/services/memory-injection.ts` — New overloads, Tier 2 replaced with `selectDirectives()`, returnMeta support
- `backend/src/services/skill-selector.ts` — `SkillCandidate.tags` field added
- `backend/src/routes/v1/chat.ts` — Skill-first sequencing, `selectedSkillTags`, `directiveStats` extraction
- `backend/src/services/bridge/types.ts` — `RoutingContext.directiveStats` field
- `backend/src/services/bridge/routing-engine.ts` — `ctx.directiveStats` wired into `buildContextStats()`

## Decisions Made

- Priority bonus formula: `max(0, 10 - floor(priority/10))` — gives p10 a bonus of 9, p50 a bonus of 5, p100 a bonus of 0
- `ALWAYS_INJECT_THRESHOLD = 2` — directives with priority ≤ 2 bypass scoring (no live directives yet, future-safe)
- `SkillCandidate` gains `tags` field to allow skill tags to flow through without a separate DB query at injection time
- `directiveStats` travels via `RoutingContext` (not as a separate function arg) — consistent with `skillsUsed` established pattern from Phase 33

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added tags field to SkillCandidate**
- **Found during:** Task 4 (wire task context into memory injection call sites)
- **Issue:** Plan required skill tags to flow from `selectSkills` into `buildMemoryContext` but `SkillCandidate` didn't include `tags` — only `skillId`, `name`, `score`, `reason`
- **Fix:** Added `tags: string[]` to `SkillCandidate` interface and populated it in the `candidates` map in `selectSkills`
- **Files modified:** `backend/src/services/skill-selector.ts`
- **Verification:** Type-check passes, tags flow to `selectDirectives` in chat.ts
- **Committed in:** `924bd02` (Task 4 commit)

---

**Total deviations:** 1 auto-fixed (1 missing field for correctness)
**Impact on plan:** Essential for the skill→directive affinity matching to work. No scope creep.

## Issues Encountered

None — plan executed smoothly. All type checks passed on first attempt.

## Next Phase Readiness

- Phase 38-02 (agent self-querying) can reuse `directive-scorer.ts` patterns
- Phase 38-03 `context_stats.directives` field is already wired and populated from this plan
- Directive tags are in DB, GIN indexed — ready for any future tag-based admin queries

## Self-Check: PASSED

- migrate-acx-v1.ts: FOUND
- directive-scorer.ts: FOUND
- 38-01-SUMMARY.md: FOUND
- Commit a00e278 (Task 1): FOUND
- Commit eed2d6d (Task 2): FOUND
- Commit 924bd02 (Task 4): FOUND
- Commit 22c58dd (Task 5): FOUND

---
*Phase: 38-adaptive-agent-context*
*Completed: 2026-04-03*
