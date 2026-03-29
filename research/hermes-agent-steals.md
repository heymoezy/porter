# Hermes Agent — Patterns to Steal

> Source: https://github.com/nousresearch/hermes-agent
> Reviewed: 2026-03-27

## Priority 1: TodoStore per Worker

Each dispatched worker gets an in-memory task list tool:
- Single tool with read/write modes
- Status: pending | in_progress | completed | cancelled
- Only ONE item in_progress at a time
- Active items survive context compression (completed items dropped)
- Behavioral guidance in tool schema, not system prompt

**Porter use:** When Porter dispatches to a worker via the decomposition engine, that worker gets a TodoStore. Workers can self-organize their subtask execution without architectural changes.

## Priority 2: Event Hooks System

Agent lifecycle hooks fire to any observer:
- Events: agent:start, agent:step, agent:end, tool:called, session:start/end
- Gateway hooks (YAML config) + Plugin hooks (programmatic)
- Wildcard matching, non-blocking, errors never crash the agent

**Porter use:** Admin Command Center subscribes to these hooks for real-time dashboard updates. Agents ARE the dashboard — every agent action emits events that the admin renders.

## Priority 3: Context Compression with Structured Summaries

When approaching context limits:
1. Prune old tool results first (cheap, no LLM call)
2. Protect head messages (system prompt + first exchange)
3. Protect tail messages (~20K tokens)
4. Summarize middle turns: Goal, Progress, Decisions, Files, Next Steps
5. On subsequent compactions, iteratively update the previous summary

**Porter use:** Long-running worker tasks will hit context limits. This pattern preserves decisions and file lists across compressions. The "prune tool results first" pre-pass is smart.

## Priority 4: Checkpoint Manager (Shadow Git)

Transparent filesystem snapshots using shadow git repos:
- Before any file-mutating tool call, auto-snapshot
- Uses GIT_DIR + GIT_WORK_TREE (no interference with user's git)
- List/diff/restore API
- Pre-rollback snapshot (undo the undo)

**Porter use:** When agents modify project files, auto-checkpoint. Admin can "undo what the agent did."

## Priority 5: Dangerous Command Approval

Pattern-based detection + LLM smart-approve:
- Regex patterns for dangerous commands (rm -rf, DROP TABLE, etc.)
- Per-session approval state (thread-safe)
- Permanent allowlist for safe repeated patterns
- Smart approval via cheap LLM for ambiguous cases

**Porter use:** Agent guardrails for user-facing product. Workers need safety rails on destructive operations.

## Priority 6: Process Registry

Background process management:
- Rolling 200KB output buffer
- Status polling + log retrieval with pagination
- Crash recovery via JSON checkpoint file
- Session-scoped tracking

**Porter use:** Workers spawning long-running tasks (builds, deploys) need observability. Crash recovery means Porter survives restarts.

## Not Taking

- Skin/theme engine (CLI-only, not relevant)
- Terminal environment backends (Porter handles runtime differently)
- RL training integration (research-focused, not now)
- Honcho user modeling (Memory V2 already covers this)
- Session search via FTS5 (Porter already has this in Memory V2)
- Mixture of Agents (Porter already routes through multiple providers)
