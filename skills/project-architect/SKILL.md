---
name: project-architect
description: Turn ambiguous initiatives into executable project structures with clear objectives, scope boundaries, workstreams, decision gates, dependencies, phases, and immediate next moves. Use when work involves initiative framing, decomposition, milestone design, sequencing, cross-functional handoffs, or deciding how a large effort should be staged before detailed implementation begins. Do not use for pure product prioritization, daily status tracking, or low-level system design as the main task.
---

# Project Architect

Give a project a shape strong enough to survive reality. Break broad ambition into phases, lanes, dependencies, and decision points so teams know what starts now, what waits, and what could break the plan.

## Use this skill to
- structure a new initiative before execution begins
- decompose a large feature, migration, or transformation into phases
- define workstreams, owners, interfaces, and milestone logic
- surface dependencies, blockers, and sequencing risks early
- turn fuzzy “we should build this” into a startable execution plan

## Do not use this skill to
- choose product bets when the main question is what should be built
- manage daily project operations, standups, or status reporting
- produce deep application or infrastructure architecture as the primary deliverable
- create giant timeline theater when the real need is sequence and decision gates

## Gather first
- primary objective and success condition
- hard constraints: date, budget, people, systems, compliance, external approvals
- current assets, prior work, and existing commitments
- key dependencies and interfaces between teams or systems
- biggest unknowns that could invalidate sequencing
- what must be true for phase 1 to count as a win

## Deliverables that fit this skill
- execution architecture
- phased initiative plan
- workstream / ownership-lane map
- milestone and decision-gate structure
- dependency and risk summary
- first-30-days or next-3-moves action plan

## Working method

### 1. Collapse the initiative to one primary objective
If the project is carrying multiple missions, separate them. A plan built on blurred objectives creates fake progress.

### 2. Define hard boundaries before phases
State:
- what is in scope now
- what is explicitly out for now
- what belongs to later phases
- which assumptions could force replanning

Boundary clarity is what keeps decomposition honest.

### 3. Split the work into meaningful lanes
Common lanes include:
- product / requirements
- design / UX
- engineering / build
- data / migration / integration
- legal / security / compliance
- GTM / enablement / operations

Use only the lanes that matter, but make interfaces between them explicit.

### 4. Sequence by dependency and learning value
Start with work that unlocks or invalidates the rest:
- critical unknowns
- environmental prerequisites
- approval gates
- architectural or data prerequisites
- pilot work that proves the hardest assumption

A pretty phase order is useless if it ignores the real bottlenecks.

### 5. Design phases around entry and exit conditions
For each phase, define:
- objective
- major deliverables
- dependencies
- entry condition
- exit condition
- key risk or failure mode

If a phase has no decision point, it is probably just a bucket of work.

### 6. Finish with immediate motion
End with the smallest set of actions that creates clarity or momentum now. Good project architecture reduces startup drag.

## Adjacent skill boundaries
- **product-manager**: decides what deserves investment and why; this skill structures how the chosen work should be staged
- **project-operator**: runs delivery once the structure exists; this skill designs the structure
- **system-architect / tech-lead**: own technical architecture; this skill owns initiative architecture across functions
- **runtime-selector**: chooses runtime and execution surfaces; this skill organizes broader cross-functional project flow

## Quality bar
A strong result should:
- reduce ambiguity quickly
- create credible lanes and sequencing
- expose dependencies and hidden blockers early
- prevent phase-1 sprawl
- leave the team able to start, not just admire the plan

## Files to use
- Read `prompt.md` for planning posture and response pattern.
- Read `examples/README.md` for output shapes.
- Read `guides/qa-checklist.md` before finalizing.
- Read `meta/skill.json` for metadata, aliases, and boundaries.
