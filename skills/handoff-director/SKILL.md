---
name: handoff-director
description: Design clean transfers of ownership between people, teams, or agents so the next owner can start immediately with the right context, artifacts, risks, timing, and definition of done. Use when work is changing hands across shifts, functions, review stages, queues, or specialist agents and failure risk comes from dropped context, fuzzy ownership, or unclear next actions. Do not use for broad project management, org design, or generic status summaries with no real transfer of responsibility.
---

# Handoff Director

Use this skill to make handoffs executable instead of ceremonial.

A good handoff lets the receiver act without a live meeting, archaeology, or guesswork. The output should reduce restart cost, expose risk, and make ownership unambiguous.

## Gather the minimum context first

Identify:
- current owner, next owner, and exact moment ownership changes
- work item, goal, and why the transfer is happening now
- current state: done, in progress, blocked, and not started
- decisions already made and assumptions still in force
- artifacts the receiver needs: files, links, logs, tickets, threads, commits, dashboards
- blockers, dependencies, risks, deadlines, and escalation path
- definition of done, acceptance criteria, and what counts as a successful receipt
- the first action the next owner should take

If any of those are missing, say the handoff is incomplete.

## Core workflow

1. **Define the transfer point**
   - Name exactly what responsibility is moving.
   - Separate background context from action-critical context.
2. **Package only decision-critical context**
   - Include goal, current state, prior decisions, open questions, and evidence.
   - Link to source artifacts instead of retelling long histories.
3. **Make ownership explicit**
   - State who owns it now, who owns it next, when that changes, and what acceptance looks like.
   - Include a stall or escalation route.
4. **Write for the receiver's first five minutes**
   - Answer: what is this, why am I getting it, what is done, what is left, what could trip me up, and what do I do first.
5. **Surface uncertainty honestly**
   - Separate facts, assumptions, and unresolved issues.
   - Do not hide unknowns inside narrative prose.

## What good output looks like

Return practical deliverables such as:
- handoff brief
- shift-change summary
- ready-for-review package
- dependency transfer plan
- escalation-aware status snapshot
- receiver checklist with first-step guidance

## Heuristics

Prefer:
- explicit owner + deadline + acceptance criteria
- concise status labels and bullets
- artifacts and evidence over retold lore
- one obvious next action for the receiver
- visible blockers and dependencies

Avoid:
- summary dumps with no transfer contract
- ambiguous language like “someone should” or “team to review”
- hidden assumptions
- bloated chronology that buries the action
- handoffs that require a follow-up meeting to become usable

## Boundary calls

Use adjacent skills instead when needed:
- **project-manager** for broader planning, sequencing, and execution governance
- **operations-manager** for recurring operating systems rather than one transfer
- **knowledge-manager** for durable documentation systems beyond a specific handoff
- **delegation-governor** for deciding whether and how to delegate work in the first place

## Final check

Before finishing, verify:
- the receiver can start immediately
- ownership and transfer timing are explicit
- blockers, dependencies, and risks are surfaced early
- definition of done and acceptance criteria are clear
- the next action is obvious and source artifacts are easy to access

Use `prompt.md` for response structure, `examples/README.md` for output shapes, `guides/qa-checklist.md` for final review, and `meta/skill.json` for boundaries and metadata.
