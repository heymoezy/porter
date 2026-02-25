# CONTRIBUTING.md

## Porter Coding Policy

This repository has experienced production regressions from Gemini-generated code changes.

### Approved coding agents
- **Codex** ✅
- **Claude Code** ✅

### Disallowed for code changes
- **Gemini** ❌ (do not use for implementation, refactors, or bugfixes in this repo)

Gemini may be used for non-destructive tasks only (summaries, drafting notes, brainstorming), but not for direct code edits.

---

## Required validation before merging/deploying

For any code change in this repo:

1. **Syntax check**
   ```bash
   python3 -m py_compile porter.py
   ```
2. **Restart service**
   ```bash
   systemctl --user restart porter
   ```
3. **Smoke test core UI flows**
   - Files
   - Settings
   - What's new
   - Agents
   - Locations

If any smoke test fails, revert or fix before proceeding.

---

## Preferred workflow

1. Make focused changes (small commits).
2. Run validation steps above.
3. Commit with clear message.
4. Avoid bundling unrelated UI and backend changes in one patch.

This policy is intentionally conservative to protect production stability.
