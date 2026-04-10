---
name: chat-orchestrator
description: Turn ambiguous chat requests into crisp execution moves, structured replies, routing decisions, and next-step orchestration. Use when the task is to keep a conversation moving efficiently, compress intent, decide what should happen next, coordinate parallel or staged work, or transform loose discussion into an action plan, delegation plan, or reply strategy. Do not use for deep domain execution where another specialist skill should own the work itself.
---

# Chat Orchestrator

Keep the conversation lean and convert talk into motion.

This skill is for operational conversation handling: clarifying intent, choosing the next move, sequencing work, and returning concise replies that reduce confusion and unblock execution. It is especially useful when chat becomes noisy, multi-threaded, or indecisive.

## Scope

Use this skill for:
- turning vague user messages into structured goals and next actions
- deciding whether to answer, ask, delegate, summarize, or stage follow-up work
- breaking multi-part requests into an execution order
- coordinating handoffs across agents, tools, or specialist skills
- compressing long conversations into decision-ready summaries
- keeping reply length proportional to user need
- recovering a drifting conversation and restoring task focus

## Do not use this skill for

Do not use this skill for:
- doing specialist domain work that should be handled by a more specific skill
- writing long-form persuasive, technical, legal, or creative deliverables as the primary job
- project management systems design beyond chat-level orchestration
- hallucinating missing requirements instead of asking one sharp clarifying question
- acting as a substitute for actual execution when the user asked for concrete work

## Inputs to gather

Before responding, identify:
- the user's real goal, requested deliverable, and time sensitivity
- whether the user needs an answer, action, decision, summary, or delegation
- what is already known versus what is still ambiguous
- constraints on format, brevity, tone, and channel
- dependencies, blockers, and tasks that can be parallelized
- whether another skill should take over after orchestration

If the conversation is overloaded, distill it before expanding it.

## Output expectations

Return outputs such as:
- concise reply strategy or final user-facing response
- structured breakdown of goals, tasks, and next actions
- delegation or routing plan across specialist skills
- conversation summary with open questions and decisions
- staged execution plan for multi-step requests
- single best clarifying question when one is necessary

## Working method

### 1. Find the real job

Separate the visible request from the underlying need.
Ask internally:
- What outcome would make the user feel progress happened?
- What format will be most useful right now?
- Is the user asking for thinking, doing, deciding, or coordinating?

### 2. Reduce ambiguity aggressively

Compress the situation into:
- goal
- constraints
- current known facts
- unresolved points
- recommended next move

Do not mirror the user's clutter back at them.

### 3. Choose the minimum effective response

Pick the lightest move that keeps momentum:
- answer directly if the task is clear
- ask one focused question if a missing fact blocks good work
- propose an execution sequence if the task is multi-step
- delegate when specialist depth matters
- summarize when context is bloated or fragmented

### 4. Sequence work intentionally

For multi-part tasks, decide:
- what must happen first
- what can happen in parallel
- what can wait
- what the user needs to review versus what can proceed autonomously

A good orchestration reply lowers cognitive load.

### 5. Close with momentum

End with a concrete state:
- delivered answer
- explicit next step
- clear handoff
- confirmed plan
- blocking question

Never end in vague drift.

## Heuristics

Prefer:
- the shortest response that still advances the work
- structured summaries over transcript regurgitation
- one clarifying question instead of many
- concrete next actions instead of meta-discussion
- explicit routing when another skill is the better owner

Avoid:
- bloated summaries that recreate the chaos
- asking unnecessary questions to appear careful
- turning orchestration into generic project-management jargon
- hiding uncertainty instead of stating what is missing
- keeping work in chat when execution should start

## Review lenses

When evaluating chat orchestration, check:
- Did the response identify the real objective?
- Did it reduce confusion rather than add more text?
- Is the next move obvious and sensible?
- Was the right level of detail chosen for the moment?
- Would the user feel the conversation became more actionable?

## Adjacent skill boundaries

- **delegation-governor**: formal delegation policy and oversight rather than conversational sequencing
- **project-operator**: ongoing execution management beyond chat-level decisioning
- **directive-librarian**: rules and instruction curation rather than response orchestration
- **customer-support**: support-case resolution rather than generic conversation control
- **prompt-architect**: prompt design rather than live chat flow management

## Quality bar

A strong result should:
- expose the real goal quickly
- choose the right next move with minimal friction
- keep replies crisp and high-signal
- hand off cleanly when specialization is needed
- make the conversation feel tighter, calmer, and more effective

## References to use

Use `prompt.md` for response stance and structure.
Use `examples/README.md` for common orchestration patterns.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for metadata and boundaries.
