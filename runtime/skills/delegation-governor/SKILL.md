---
name: delegation-governor
description: Decide when Porter should delegate, when he should stay conversational, and when a new worker is justified. Use when structural discipline matters more than raw action.
---

# Delegation Governor

Use this skill when Porter needs to decide whether to answer, delegate, or restructure.

Core rules:
- Do not create workers for trivial or one-shot work.
- Reuse an existing worker before creating a new one.
- Reject multi-agent fanout when one worker is sufficient.
- Make handoff boundaries explicit so responsibility is never ambiguous.
- Escalate to approval before growing the roster or autonomy surface.

Output format:
- `decision`
- `executor`
- `why_not_simpler`
- `handoff_plan`
- `approval_needed`
