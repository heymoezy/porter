---
name: coding-agent
description: Delegate substantial coding work to an external coding harness or background implementation agent that can explore repositories, edit files, run commands, and iterate on code changes. Use when the task is implementation-heavy, benefits from autonomous repo exploration, or needs a dedicated coding lane rather than a normal conversational answer. Do not use for tiny inline edits, pure code review, or non-coding analysis.
---

# Coding Agent

Use this skill to hand off real coding work to a dedicated implementation agent.

This skill exists for tasks where the right move is not to explain how to code something, but to spin up a coding lane that can inspect the repository, change files, run checks, and return concrete results.

## Scope

Use this skill for:
- feature implementation that touches multiple files
- non-trivial bug fixes requiring repo exploration
- iterative refactors with validation steps
- PR-sized code changes that benefit from autonomy
- coding tasks delegated to Codex, Claude Code, Pi, or similar harnesses
- background implementation work that should continue outside the main conversation flow

## Use this skill when

Use this skill when the task needs:
- actual code changes rather than advice only
- agent-led file exploration before implementation
- command execution, testing, or build verification
- sustained iteration in a dedicated coding session
- separation between orchestration in chat and execution in a coding lane

## Do not use this skill when

Do not use this skill for:
- trivial one-file edits that can be done directly inline
- pure architectural discussion with no code execution yet
- code review as the main deliverable
- documentation-only or research-only tasks
- interactive terminal control better handled by a tmux-specific flow

## Inputs to gather

Before delegating, identify:
- repository or working directory
- concrete goal, bug, or requested feature
- acceptance criteria or definition of done
- constraints on files, branches, dependencies, or permissions
- required validation steps such as tests, lint, typecheck, or build
- whether the run should be one-shot, backgrounded, or thread-bound

If the task is vague, turn it into a crisp coding brief before spawning the agent.

## Output expectations

Return outputs such as:
- implemented code change
- concise change summary
- files touched or major modules affected
- validation performed and its result
- open risks, follow-ups, or unresolved blockers
- branch, commit, or PR status when relevant

Prefer shipped results over speculative implementation notes.

## Working method

### 1. Define the implementation target

State clearly:
- what must change
- what success looks like
- what must not be changed
- how completion will be verified

The coding agent should receive a bounded brief, not a vague aspiration.

### 2. Choose the right execution lane

Pick the harness and mode that fit the work:
- one-shot run for focused implementation
- persistent session for iterative back-and-forth
- thread-bound session when the work should stay tied to a chat thread
- background or delegated execution when the task may take time

Use the smallest execution surface that still gives the agent enough autonomy.

### 3. Provide repo-aware context

Include:
- repo path
- relevant files or subsystems
- current constraints and guardrails
- commands to run for verification if known
- any prohibited changes, such as avoiding unrelated refactors

Good delegation reduces wasted exploration.

### 4. Optimize for concrete artifacts

Ask the agent to produce:
- working code
- focused diffs
- validation evidence
- a short implementation summary

Avoid delegations that invite generic brainstorming when the real need is code.

### 5. Keep scope controlled

Expect the coding agent to:
- follow existing codebase patterns unless there is a strong reason not to
- avoid opportunistic rewrites unrelated to the task
- call out uncertainty instead of inventing hidden assumptions
- leave breadcrumbs about anything unverified

A strong coding run is narrow, correct, and reviewable.

### 6. Treat verification as part of completion

A coding task is not done when files were edited. It is done when the best available checks were run or when missing validation is explicitly documented.

Look for:
- tests added or updated when behavior changed
- lint, type, or build checks where appropriate
- notes on gaps when the environment blocks full verification

## Adjacent skill boundaries

- **code-implementer**: implements code directly in the current lane; this skill is for delegating that work to a dedicated coding agent
- **code-reviewer**: evaluates changes after implementation; this skill creates them
- **backend-dev / frontend-dev / fullstack-dev**: domain-specialist builders; this skill is the delegation mechanism for substantial coding execution
- **project-architect**: defines structure and direction; this skill executes bounded implementation work
- **tmux**: controls an already-running interactive terminal workflow rather than selecting a coding delegation strategy

## Quality bar

A strong result should:
- delegate to the right coding lane quickly
- give the agent enough context to work autonomously
- keep scope and guardrails explicit
- produce real code and validation evidence
- return a crisp summary of what changed and what remains

## References to use

Use `prompt.md` for delegation posture and run framing.
Use `guides/qa-checklist.md` before finalizing a handoff or accepting agent output.
Use `examples/README.md` for briefing patterns.
Use `meta/skill.json` for boundaries and metadata.
