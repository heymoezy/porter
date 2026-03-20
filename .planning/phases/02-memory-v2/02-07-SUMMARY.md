---
phase: 02-memory-v2
plan: 07
subsystem: recall
tags: [feedback-tracking, agent-evolution, implicit-signals, respawn-animation]
dependency_graph:
  requires: [02-04, 02-06]
  provides: [feedback-signal-tracking, agent-evolution-trigger, respawn-animation]
  affects: [porter.py]
tech_stack:
  added: []
  patterns: [implicit-feedback-detection, agent-identity-evolution, CSS-animation-via-SSE]
key_files:
  modified:
    - porter.py
decisions:
  - "_recall_track_feedback uses prior chat_messages row to detect correction/acceptance — no extra state needed"
  - "Evolution threshold is 5+ active signals; _mem_insert already sets status='active' so no extra promote needed"
  - "Evolution wired in _mem_promote for explicit promotions, but feedback signals auto-qualify since _mem_insert inserts active"
  - "Respawn animation uses CSS class add/remove via SSE, 1.6s duration"
metrics:
  duration: 10min
  completed: "2026-03-20T16:56:00Z"
  tasks_completed: 2
  files_modified: 1
---

# Phase 02 Plan 07: Feedback Tracking and Agent Evolution Summary

Implicit interaction feedback signals tracked and agent identity evolution trigger with Pokemon-style respawn animation implemented.

## What Was Built

**Task 1: Interaction feedback tracking** (`_recall_track_feedback`)
- Detects correction signals from user messages starting with 'no actually', 'that's wrong', 'incorrect', 'please fix', etc.
- Detects acceptance signals from 'thanks', 'great', 'perfect', 'ok now', 'next', etc.
- Both stored as `memory_kind='signal'` with `source_type='correction'` or `source_type='acceptance'`
- Wired into `/api/chat/stream` handler — queries last assistant message from `chat_messages`, calls `_recall_track_feedback` after response, before next AI dispatch
- Completely implicit — no thumbs up/down UI needed

**Task 2: Agent evolution trigger and respawn animation**
- `_recall_check_evolution(persona_id)` — counts active feedback signals (`memory_kind='signal'`, `source_type IN ('feedback', 'acceptance', 'correction')`, `status='active'`); triggers at 5+ signals
- `_recall_rebuild_identity(persona_id)` — appends 'Evolved traits:' summary to persona description from top-5 feedback signals (replaces any previous evolved traits block)
- Wired into `_mem_promote` — after every promotion, reads scope/scope_id from promoted memory row, calls evolution check for agent-scoped memories
- `recall-evolve` CSS keyframe animation on `.persona-card.evolving` — scale and hue-rotate pulse effect, 1.5s duration
- SSE JS handler for `recall:agent_evolved` — queries `[data-persona-id]` card, adds/removes `evolving` class after 1.6s

## Decisions Made

1. **Prior response lookup via chat_messages**: Rather than passing last response as state, the feedback tracker queries `chat_messages WHERE role='assistant' ORDER BY id DESC LIMIT 1` for the given `chat_id`. Clean and stateless.

2. **Evolution fires on _mem_promote but signals already active**: `_mem_insert` sets `status='active'` directly, so feedback signals accumulate immediately. `_mem_promote` wiring handles future cases where signals arrive as `pending` and get promoted explicitly.

3. **CRITICAL: memory_kind='signal' not 'directive'**: The evolution check explicitly counts `memory_kind='signal'` — this is correct because `_recall_track_feedback` inserts with `memory_kind='signal'`, and `_mem_promote` can change `memory_kind` but the evolution check reads the stored record's `source_type`.

4. **No logging on acceptance signals**: Acceptance signals are too frequent to log at INFO level — correction signals are logged as they indicate areas for improvement.

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- `8fda154` — feat(02-07): add implicit interaction feedback tracking
- `3eaa8c0` — feat(02-07): add agent evolution trigger and respawn animation

## Self-Check: PASSED

- `def _recall_track_feedback` found in porter.py
- `def _recall_check_evolution` found in porter.py
- `def _recall_rebuild_identity` found in porter.py
- `recall:agent_evolved` SSE event found in porter.py
- `recall-evolve` CSS animation found in porter.py
- Evolution function explicitly checks `memory_kind='signal'` and `source_type IN ('feedback', 'acceptance', 'correction')`
- Porter syntax valid (py_compile)
- Porter service running and serving (HTTP 200 on landing page)
