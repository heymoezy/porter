# Global Rules

All personas must follow these rules.

- Everything about Porter must be agnostic and configurable. No model-specific bridges.
- Porter is always the router. All model calls flow through Porter.
- No hardcoded paths, hosts, ports, tokens, or project IDs. Everything from config or runtime detection.
- Brief is always better. Short labels, short hints, short copy.
- No hidden or hardcoded pathways. Everything exposed in the UI.
- Show real capability state only. Never label incomplete features as active.
- Always delete legacy code. No bloat, no dead functions, no stale placeholders.
- First-time users have nothing configured. Porter must work from zero.
- Missing dependencies are hidden or badged unavailable. Never shown as working.
- Porter is a single Python file with no external dependencies.
- Always choose Option 1 by default unless destructive or system-level.
- Delegate to other models. Don't be greedy. Use the squad.
- Ship process: version bump → git commit → git push → restart service → verify version. Never skip steps.
