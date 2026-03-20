---
phase: 03-route-migration
plan: 01
subsystem: system-prompt
tags: [perf, system-prompt, dispatch, memory, agents]
dependency_graph:
  requires: []
  provides: [_build_lean_identity, lean-system-prompts, PERF-01]
  affects: [agent-dispatch, memory-injection, system-prompt-assembly]
tech_stack:
  added: []
  patterns: [lean-identity-pattern, circuit-breaker-logging, on-demand-context-injection]
key_files:
  modified:
    - porter.py
decisions:
  - "_build_lean_identity() is the sole system prompt builder — DB-only, no file I/O"
  - "awareness_mode defaults to 'aware' (config JSON key) — no schema migration needed"
  - "Memory injection remains separate: _mem_inject_for_dispatch() appended to message body"
  - "_build_context_suffix() deprecated (not deleted) — marked # DEPRECATED Phase 3"
  - "Identity trigger path (soul.strip() for explicit who-are-you queries) preserved"
metrics:
  duration: 7min
  completed_date: "2026-03-20"
  tasks_completed: 2
  files_modified: 1
---

# Phase 03 Plan 01: Lean System Prompts (PERF-01) Summary

**One-liner:** DB-only `_build_lean_identity()` replaces file-reading `_build_context_suffix()`, slimming system prompts from ~614 tokens avg to 90-103 tokens with 2K circuit breaker.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create _build_lean_identity() + update call sites | e44bdd1 | porter.py |
| 2 | Verify token counts + Playwright regression | (verify-only) | /tmp/test_lean_identity.py, /tmp/test_prompt_audit.py |

## What Was Built

### _build_lean_identity(persona_id) [porter.py:2562]
- Queries `personas` table: `SELECT name, role, config WHERE id=?`
- Extracts `description` (falls back to `role`) and `awareness_mode` from config JSON
- Produces a 3-part prompt: identity line + awareness block + guardrails
- **Awareness modes:**
  - `aware` (default): knows Porter, other agents, can suggest delegation
  - `sandboxed`: focused assistant, handles only assigned domain
- **Guardrails (always present):** Never fabricate, never claim done without verification, say when you don't know
- **Circuit breaker:** if `_estimate_tokens(prompt) > 2000`, emits `mlog.emit("warn", "system", "prompt.circuit_breaker", ...)` and returns minimal fallback

### Dispatch Path Refactor [porter.py:43441]
- `_lean_identity = _build_lean_identity(persona_id)` — replaces `_build_context_suffix()`
- Memory, prior work, and project context now assembled as separate on-demand context blocks
- `_ctx_suffix` = `"\n\n".join([_mem_ctx, _prior_work, _proj_ctx])` — injected into message body, NOT system prompt
- Squad roster removed from system prompt (Phase 3 decision: no squad concept in prompts)
- Failure context removed from system prompt (was injected via _build_context_suffix)

### System Prompt Preview [porter.py:46790]
- `ctx_suffix = _build_lean_identity(pid)` — updated to use lean identity

## Verification Results

### Token Counts
| Persona | Name | Before (est) | After (est) | Reduction |
|---------|------|-------------|-------------|-----------|
| porter-core | Porter | 702 tokens | 90 tokens | 87% |
| 0f8ed627fdc7469f | Daily Joke | 527 tokens | 103 tokens | 80% |

### Audit Results
- No active calls to `_build_context_suffix()` in non-deprecated code paths
- 2 call sites to `_build_lean_identity()`: dispatch (line 43442) + preview (line 46790)
- No SOUL.md or RULES.md reads in prompt construction path

### Playwright Regression
- **35/35 tests passed** — no regressions introduced

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notes on Preserved Behaviors

1. **SOUL.md identity trigger** (line 43432-43549): `soul = _read_persona_file(pdir / 'SOUL.md')` still reads the soul file per dispatch but ONLY injects it when users explicitly ask "who are you?" / "describe yourself" / etc. This is intentional — the soul file is not loaded into the system prompt blindly, only surfaced on explicit identity queries.

2. **_build_context_suffix() kept (deprecated)**: Not deleted per plan — marked `# DEPRECATED Phase 3: replaced by _build_lean_identity()`. Squad roster, failure context, and full file reads remain inside the deprecated function body.

3. **Memory injection preserved**: `_mem_inject_for_dispatch()` still runs per dispatch, injecting tiered memories (directives → concepts → episodes). It's appended as `_mem_ctx` in `_ctx_suffix`, added to the message body — not the system prompt.

## Self-Check

### Files Exist
- [x] `/home/lobster/documents/porter/porter.py` — modified, contains `def _build_lean_identity`
- [x] `/home/lobster/documents/porter/.planning/phases/03-route-migration/03-01-SUMMARY.md` — this file

### Commits Exist
- [x] `e44bdd1` — feat(03-01): add _build_lean_identity() - slim system prompts to 200-300 tokens

## Self-Check: PASSED
