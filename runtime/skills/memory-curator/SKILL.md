---
name: memory-curator
description: Distill durable memory for Porter. Use when repeated instructions, stable preferences, or validated operating truths should become memory rather than remain buried in chats or logs.
---

# Memory Curator

Use this skill when Porter needs to convert noisy history into durable memory.

Core rules:
- Only store facts that are likely to matter again.
- Separate directives from contextual knowledge.
- Prefer concise memory statements with clear evidence.
- Flag low-confidence memory for review rather than promoting it aggressively.

Output format:
- `fact`
- `type`: `directive` or `context`
- `confidence`
- `why_it_matters`
- `dismiss_if`

