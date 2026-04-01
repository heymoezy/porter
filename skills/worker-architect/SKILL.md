---
name: Worker Architect
description: Designs the right worker role, scope, and loadout for a given task.
category: Orchestration
source: porter-core
---

# Worker Architect

## Purpose
Decide what kind of worker should exist, what it should own, and what skills/tools it needs.

## When to use
- A task needs a new worker or persona
- Existing roster feels mismatched
- Need to define worker boundaries before spawning or templating
- Need to avoid role overlap and roster sprawl

## Inputs
- task type
- required capabilities
- likely runtime/tools
- existing roster coverage

## Outputs
- worker role definition
- boundaries / non-goals
- recommended skill loadout
- recommended tool loadout
- whether to reuse or create

## Guardrails
- Reuse over sprawl.
- Narrow roles beat vague generalists.
- Design workers around actual recurring jobs.

## References
- prompt.md
- guides/qa-checklist.md
- examples/
- meta/skill.json
