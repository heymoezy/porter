---
name: delegation-governor
description: Decide whether work should stay with the primary agent or be split across specialists, and define the delegation plan if it should. Use when the task involves decomposition, routing, handoff design, merge planning, parallel-versus-sequential execution, context minimization, or protecting sensitive work from over-delegation. Do not use when the main question is whether an action is permitted rather than who should do it.
---

# Delegation Governor

Delegate only when it creates leverage. The job is to reduce latency and increase quality without creating merge chaos, duplicated effort, or responsibility drift.

## What this skill is for

Use this skill to:
- decide whether to delegate at all
- split complex work into a small number of meaningful subtasks
- choose the right specialist, lane, or model for each subtask
- define handoff packets with scope, inputs, exclusions, and return format
- decide what runs in parallel versus what must stay sequential
- keep high-context, high-risk, or highly coupled work with the primary agent
- plan how delegated outputs will be reconciled into one final answer

## What this skill is not for

Do not use this skill for:
- approval or authorization decisions where the core question is whether work may proceed
- doing the specialist work itself
- generic project tracking without a routing decision
- spraying vague tasks across agents in the hope that something useful returns

## Required inputs

Gather as much of this as practical before deciding:
- final user outcome
- deadline, latency pressure, and quality bar
- candidate specialists or execution lanes
- task dependencies and shared context
- privacy, permissions, or sensitivity constraints
- merge complexity and who owns final synthesis
- acceptable return format for each delegated task
- what must remain centralized for judgment or accountability

If any of these are unknown, state the uncertainty instead of pretending the routing choice is obvious.

## Default output shape

When useful, structure the result as:
1. objective and constraints
2. delegate vs do-directly decision
3. subtask map with owners
4. handoff packet for each delegated unit
5. sequencing and merge plan
6. risks, failure modes, and fallback plan

## Working method

### 1. Start from the final artifact

Define the single thing the user ultimately needs:
- final deliverable
- final decision owner
- final synthesis voice
- cross-cutting constraints that apply to every subtask

If the work cannot be recombined cleanly, the decomposition is probably wrong.

### 2. Ask whether delegation actually pays off

Delegate only when one or more of these are true:
- specialist depth materially improves quality
- independent subtasks can progress in parallel
- the task would overload one agent's context window
- a bounded subproblem benefits from deterministic isolation

Keep it local when the work is tiny, heavily interdependent, secret-heavy, or mostly judgment synthesis.

### 3. Create coarse, meaningful work units

Good subtasks are:
- independently understandable
- large enough to justify handoff overhead
- small enough to have a clear acceptance test
- unlikely to require constant back-and-forth

Avoid micro-delegation. Splitting one coherent reasoning task into fragments usually makes everything worse.

### 4. Write a real handoff contract

For each delegated unit, specify:
- objective
- in-scope work
- explicitly out-of-scope work
- required inputs and source material
- allowed files, systems, or tools
- output format
- quality bar
- what to do if blocked or uncertain

A fuzzy handoff creates rework, overlap, and conflicting outputs.

### 5. Control context aggressively

Pass only what the delegate needs:
- critical background facts
- exact artifact or files to inspect
- hard constraints
- forbidden areas
- relevant prior decisions

Do not dump the entire project state into every handoff.

### 6. Protect primary-agent ownership

The primary agent should usually retain:
- final user-facing synthesis
- cross-subtask consistency
- risk tradeoff decisions
- conflict resolution between delegates
- sensitive judgment that depends on hidden context

Delegation changes execution structure, not accountability.

### 7. Plan the merge before dispatch

Define:
- how outputs will be compared or stitched together
- how terminology and assumptions will be normalized
- who resolves disagreement
- whether a second pass is required after partial results
- what happens if one delegate fails or returns weak output

Parallel work without merge logic is just deferred disorder.

### 8. Prefer reversible delegation patterns

If uncertainty is high, choose a delegation pattern that is easy to undo:
- research first, synthesis later
- compare options before committing to implementation
- run one delegate before spawning many
- keep sensitive material centralized until needed

## Decision heuristics

### Strong reasons to delegate
- distinct specialist knowledge is required
- subtasks are largely independent
- speed matters and parallelism will shorten wall-clock time
- verification benefits from a separate reviewing lane

### Strong reasons not to delegate
- the task is short and direct
- all subtasks depend on shared evolving judgment
- merge cost exceeds expected gain
- context is too sensitive or too broad to share safely
- the final answer depends more on synthesis than on parallel production

## Adjacent skill boundaries

- **approval-governor** decides whether an action is allowed; this skill decides who should do the work.
- **chat-orchestrator** manages live multi-turn workflow coordination; this skill designs the delegation structure.
- **project-operator** drives execution once routing is chosen; this skill determines the routing first.
- **directive-librarian** manages durable operating guidance; this skill focuses on the immediate task split.

## Quality bar

A strong output:
- explicitly says whether delegation is warranted
- keeps the number of subtasks low and justified
- assigns owners for a reason, not by habit
- defines clean handoffs and merge logic
- preserves central accountability
- anticipates over-delegation failure modes

## Files in this skill pack

- `prompt.md` — response posture and delegation language
- `examples/README.md` — output patterns for common routing situations
- `guides/qa-checklist.md` — final self-check before answering
- `meta/skill.json` — structured metadata and boundaries
