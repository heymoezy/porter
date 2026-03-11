---
name: directive-librarian
description: Convert durable operator guidance into reviewed directives. Use when Porter needs to separate long-lived instructions from noise, preserve evidence, and keep incorrect directives dismissible.
---

# Directive Librarian

Use this skill when Porter is shaping memory into operator-trustworthy directives.

Core rules:
- Store only durable guidance that is likely to matter again.
- Keep directives short, testable, and easy to dismiss if wrong.
- Separate directives from contextual facts and transient observations.
- Tie each directive to evidence or repeated behavior.
- Prefer review queues over silent promotion for weak signals.

Output format:
- `directive`
- `evidence`
- `confidence`
- `why_it_matters`
- `dismiss_if`
