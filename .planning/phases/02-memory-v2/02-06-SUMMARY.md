---
phase: 02-memory-v2
plan: 06
subsystem: memory
tags: [recall, memory-v2, writing-style, agent-voice, directives]

# Dependency graph
requires:
  - phase: 02-memory-v2/02-03
    provides: tiered memory injection pipeline (_mem_inject_for_dispatch, _get_directives)
  - phase: 02-memory-v2/02-04
    provides: _mem_insert function with scope/source_category support

provides:
  - RECALL_ANTI_PATTERNS: 21 generic AI filler phrases all agents must avoid
  - AGENT_STYLE_DEFAULTS: role-based writing profiles for writer, developer, researcher, manager, default
  - _recall_init_agent_style: initializes new agents with voice + anti-pattern directives on creation
  - Writing style directives injected via existing tiered pipeline as agent-scoped memories

affects:
  - 02-memory-v2 (completes memory V2 foundation)
  - All future agent creation flows
  - All agent dispatch pipelines that inject directives

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Role-based category-to-style mapping: agent_group string -> style key via _cat_map dict"
    - "Style directives stored as memory_kind='directive' scope='agent' source_category='writing_style'"
    - "Anti-patterns as single high-importance (9) directive; voice as medium-importance (7)"
    - "Idempotent init: COUNT check prevents double-initialization for existing agents"

key-files:
  created: []
  modified:
    - porter.py

key-decisions:
  - "RECALL_ANTI_PATTERNS as module-level list (not frozenset) — ordered, sliceable for partial injection"
  - "Category-to-style _cat_map dict inside _recall_init_agent_style — avoids polluting AGENT_STYLE_DEFAULTS keys with all agent_group values"
  - "Anti-patterns injected as single directive (first 10 phrases) rather than one-per-phrase — reduces DB rows and injection token cost"
  - "Style init called in _persona_create after skill assignment — ensures both skills and styles are ready before first dispatch"

patterns-established:
  - "Agent style init: check existing before insert (idempotent), use source_category='writing_style' for grouping"

requirements-completed:
  - MEM-01

# Metrics
duration: 3min
completed: 2026-03-20
---

# Phase 02 Plan 06: Agent Writing Styles Summary

**Role-based writing style directives (AGENT_STYLE_DEFAULTS + RECALL_ANTI_PATTERNS) automatically initialized for every new agent via _recall_init_agent_style, stored as agent-scoped memories and injected through the existing tiered pipeline**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-20T16:44:52Z
- **Completed:** 2026-03-20T16:47:58Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- RECALL_ANTI_PATTERNS (21 phrases) and AGENT_STYLE_DEFAULTS (5 role profiles) added as module-level constants in porter.py near RECALL_NOISE_BLACKLIST
- _recall_init_agent_style function added at line 3459 — maps agent_group to style key, inserts voice directive (importance=7, trust_tier='medium') and anti-pattern directive (importance=9, trust_tier='high')
- Wired into _persona_create with try/except guard — called after skill assignment, before return
- Style directives stored with source_category='writing_style' for clean grouping; idempotent (COUNT check prevents re-init)
- Porter syntax verified (compile), self-check passes (5/5), version endpoint confirms service running (v0.34.11)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add agent writing styles and anti-pattern block list** - `f5507c3` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `porter.py` - RECALL_ANTI_PATTERNS (line 137), AGENT_STYLE_DEFAULTS (line 164), _recall_init_agent_style (line 3459), wiring in _persona_create

## Decisions Made
- RECALL_ANTI_PATTERNS as an ordered list (not frozenset) so slicing is safe for partial injection into directives
- _cat_map dict inside _recall_init_agent_style maps agent_group values (business, content, creative, etc.) to the 5 style keys — keeps AGENT_STYLE_DEFAULTS clean
- First 10 anti-patterns used in the directive text to keep token cost manageable while still covering the most common filler phrases
- Style init is guarded with try/except and logs a warning on failure — never blocks agent creation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Memory V2 foundation complete: cortex removed, DB migrated, injection pipeline wired, prior work recall added, UI feed built, chat commands wired, and now agent voice established
- Style directives automatically activated for all future agent creation
- Existing agents do not retroactively get style directives (by design — idempotent init only runs on create)

## Self-Check

---
*Phase: 02-memory-v2*
*Completed: 2026-03-20*
