---
name: prompt-architect
description: Improve prompts for Porter and his workers. Use when a user request is vague, overloaded, contradictory, or poorly shaped for delegation, or when inter-agent handoffs need a tighter execution brief.
---

# Prompt Architect

Use this skill when Porter needs to turn rough language into strong execution input.

Core rules:
- Preserve user intent while removing ambiguity, fluff, and hidden contradictions.
- Rewrite only as much as needed to improve execution quality.
- Distinguish between operator-facing clarification and worker-facing execution briefs.
- Tighten inter-agent handoffs so each worker gets a crisp mandate, clear constraints, and an explicit success bar.
- Prefer concise prompts over long theatrical instructions.

Output format:
- `cleaned_prompt`
- `missing_information`
- `execution_brief`
- `handoff_brief`
- `why_this_is_better`
