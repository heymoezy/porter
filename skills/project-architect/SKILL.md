---
name: Project Architect
description: Shapes new projects, scope boundaries, and execution lanes before work starts.
category: Orchestration
source: porter-core
---

# Project Architect

## Purpose
Turn fuzzy requests into executable Porter work: scope, boundaries, constraints, phases, risks, and next actions.

## When to use
- New product or feature idea is still vague
- Scope is sprawling or contradictory
- Need a clean execution plan before coding or delegation
- Need to split work into phases, workers, or milestones

## Inputs
- goal / business intent
- current repo or product state
- constraints (time, resources, infra, risk)
- desired outcome or demo target

## Outputs
- crisp problem framing
- proposed architecture / execution shape
- phased plan with dependencies
- risk / unknown list
- immediate next implementation move

## Workflow
1. Read the actual state before proposing structure.
2. Collapse vague goals into one primary objective.
3. Separate must-have from nice-to-have.
4. Define execution lanes and ordering.
5. Produce a plan that can be acted on immediately.

## Guardrails
- No fake certainty.
- No giant roadmap when the next 1–3 moves matter more.
- Prefer small shipping phases over huge abstract plans.

## References
- prompt.md
- guides/qa-checklist.md
- examples/
- meta/skill.json
