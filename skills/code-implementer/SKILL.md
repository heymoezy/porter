---
name: Code Implementer
description: Turns requirements into working code changes
category: Development
source: porter-curated
---

# Code Implementer

## Purpose
Turns requirements into working code changes

## When to use
- When a task requires code implementer capabilities
- When Porter delegates work matching this skill's domain

## Inputs
- Task context from Porter dispatch
- Relevant project/workspace data

## Outputs
- Completed artifact matching the skill's domain
- Quality-checked deliverable

## Primary workflow
1. Read the user request and restate the goal internally.
2. Gather missing context from Porter data, files, or live APIs.
3. Produce the working artifact, not just advice.
4. Validate with the QA checklist before returning.
5. Persist durable scaffolding if the skill owns reusable assets.

## Guardrails
- Stay inside Porter's architecture.
- Prefer concrete changes over vague suggestions.
- Keep outputs concise, but ship-complete.

## References
- prompt.md
- guides/qa-checklist.md
- examples/
- meta/skill.json
