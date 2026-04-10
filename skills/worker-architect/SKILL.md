---
name: worker-architect
description: Design or refine worker roles, boundaries, responsibilities, loadouts, and handoff contracts for multi-worker systems, agent rosters, and delegated workflows. Use when the main task is deciding whether to reuse an existing worker, extend one with a skill, split responsibilities, create a specialist, or reduce roster overlap and sprawl. Do not use for human org design, implementation tickets, or one-off persona creation.
---

# worker-architect

Design workers that make delegation cleaner, not busier.

This skill owns roster design for AI workers and delegated systems: what jobs deserve a stable worker, what should stay as a skill on an existing worker, where boundaries belong, what loadout is justified, and how handoffs should work. Use it when the system needs sharper ownership instead of more role theater.

## Scope

Use this skill for:
- deciding whether to reuse, extend, split, merge, or create a worker
- defining worker purpose, ownership, and non-goals
- shaping the skill, tool, runtime, and permission loadout for a recurring job
- designing handoff contracts between adjacent workers
- auditing a roster for overlap, gaps, ambiguity, or sprawl
- clarifying which tasks a worker should accept, refuse, or escalate
- turning vague specialist ideas into operational role definitions

## Do not use this skill for

Do not use this skill for:
- human team org charts, hiring plans, or titles
- one-off persona writing with no recurring operational job
- implementation tickets that do not change worker boundaries or delegation behavior
- prompt-only improvements when the worker role itself is already sound; use **prompt-engineer**
- runtime selection for a single task without role redesign; use **runtime-selector**

## Routing rules

Route to **worker-architect** when the main difficulty is deciding:
- whether a new worker should exist at all
- where one worker should stop and another should begin
- what recurring job pattern justifies a specialist
- what skills, tools, or permissions a worker should always carry
- how work packets should move between workers without re-triage

Do **not** route here just because someone wants a new worker name.
If the real need is a better prompt, a one-off workflow, or implementation work, another skill should lead.

## Inputs to gather

Before proposing architecture, identify:
- recurring job to be done
- current roster and the closest existing workers
- failure modes in the current setup
- job frequency, leverage, and cost of confusion
- required inputs, outputs, and success metrics
- tools, runtimes, permissions, and context requirements
- escalation conditions and handoff needs
- whether the need is durable or just temporary queue noise

If the workload is not recurring, say a new worker is unjustified.

## Output expectations

Return outputs such as:
- reuse / extend / split / merge / create recommendation
- worker role definition with explicit ownership
- non-goals and refusal boundaries
- skills, tools, runtimes, and permissions loadout
- upstream and downstream handoff contract
- adjacency notes versus nearby workers
- rationale tied to recurrence, cognitive load, leverage, and system clarity

Prefer decisive roster recommendations over speculative brainstorming.

## Working method

### 1. Start with the recurring job
Define:
- what work repeats often enough to deserve stable ownership
- what decisions this worker makes
- what artifacts or outcomes it produces
- what happens if no one clearly owns this work

Workers should exist because the job repeats, not because the title sounds useful.

### 2. Test reuse before creation
Ask:
- can an existing worker absorb this with one new skill or clearer instructions?
- is the proposed job materially different in workflow, tools, or quality bar?
- would an orchestrator reliably know when to choose the new worker?
- does the new role reduce or increase cognitive load across the roster?

Default to reuse unless the boundary is crisp and durable.

### 3. Define boundaries with sharp edges
Specify:
- owns
- does not own
- accepts
- refuses
- escalates
- upstream inputs required
- downstream outputs guaranteed
- adjacent workers and overlap rules

A worker without refusal criteria becomes a generalist sinkhole.

### 4. Design the loadout from the job
Choose only what the recurring work justifies:
- domain skills
- required tools and interfaces
- runtime assumptions
- permission envelope
- always-loaded context or templates

Do not equip the worker for hypothetical future work.

### 5. Make handoffs a contract
For multi-worker flows, define:
- trigger for handoff
- minimum context packet
- artifact or schema passed forward
- done definition before handoff
- bounce-back conditions if evidence is incomplete
- escalation path when confidence is low

If handoffs are vague, the new role is not really designed yet.

### 6. Stress-test for roster health
Evaluate:
- duplication risk
- volume sufficiency
- cognitive load placed on orchestrators
- permission creep
- whether a skill on an existing worker would solve the problem more cleanly
- whether the proposed worker creates downstream ambiguity

## Heuristics

Prefer:
- fewer workers with sharper boundaries
- reusable loadouts tied to real recurring jobs
- role definitions that make routing obvious
- explicit refusal and escalation behavior
- handoffs that preserve context and remove rework
- worker creation only when specialization changes quality or speed materially

Avoid:
- vague “specialist” roles that own everything nearby
- spawning workers for temporary bursts of work
- tool hoarding without a recurring need
- role definitions with no output artifact
- overlap hidden behind friendly wording
- inventing new workers before auditing adjacent ones

## Adjacent skill boundaries

- **delegation-governor** decides whether and how work should be delegated on a given task
- **handoff-director** improves handoff packets and transitions once roles already exist
- **runtime-selector** chooses model/runtime fit for specific tasks or workers
- **prompt-engineer** sharpens instructions inside an already-valid worker boundary
- **project-architect** or **system-architect** handle broader system design outside worker-role definition

## Quick routing examples

Use **worker-architect** for:
- deciding whether GitHub triage deserves its own worker or belongs inside an existing delivery role
- simplifying an overgrown roster with three overlapping research specialists
- defining the ownership and handoff between a support triage worker and an escalation worker
- designing a specialist worker whose distinct toolset and quality bar justify stable existence

Do **not** use **worker-architect** for:
- drafting a one-off assistant persona for a demo
- rewriting prompts for a worker whose role is already clear; use **prompt-engineer**
- selecting a runtime for one job without changing the worker roster; use **runtime-selector**

## Quality bar

A strong result should:
- make the roster easier to understand and route through
- justify any new worker with recurring leverage, not novelty
- define ownership, non-goals, and escalation boundaries clearly
- align loadout and permissions to the actual recurring job
- reduce duplication and handoff confusion across the system

## Use with

- `prompt.md` for execution posture and recommendation style
- `examples/README.md` for representative requests and output patterns
- `guides/qa-checklist.md` for final review standards
- `meta/skill.json` for machine-readable metadata
