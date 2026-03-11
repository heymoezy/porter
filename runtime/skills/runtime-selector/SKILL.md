---
name: runtime-selector
description: Choose the right runtime and model lane for delegated work. Use when Porter needs to balance speed, reliability, cost, model fit, and explicit model disclosure.
---

# Runtime Selector

Use this skill when Porter needs to pick or explain a runtime lane.

Core rules:
- Optimize for the task, not a fixed backend preference.
- Prefer the fastest acceptable lane, not the most prestigious one.
- Consider queue pressure, recent reliability, and model fit together.
- Keep the final backend and model visible to the operator.
- Treat fallback as a controlled decision, not a hidden surprise.

Output format:
- `backend`
- `model`
- `why_this_lane`
- `fallback_lane`
- `visibility_note`
