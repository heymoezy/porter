# Porter Checkpoint
# CANONICAL — all gateways read this file. Do not create per-gateway checkpoints.
# Location: /home/lobster/projects/porter/CHECKPOINT.md

project: porter
version: v4.5.0
updated: 2026-04-02
updated_by: claude-opus-4.6

## Architecture

Single monorepo (heymoezy/porter). One Fastify process on :3001. API metering business model.
3 pillars: Bridge (hub), Forge (factory), Recall (shared brain).
5 gateways: Claude CLI, OpenClaw, Ollama, Codex CLI, Gemini CLI.
**IMPORTANT: Only port :3001 exists. Port 5175 is DEAD. Brain + Admin merged.**

## Milestone v5.0 — Living Skills

### Completed
- **Phase 31**: Source of Truth Cleanup (3 plans) — template_skills/persona_skills canonical, SKILLS.md generated
- **Phase 32**: Skill Pack Explorer (4 plans) — CodeMirror 6 file editor at /skills/:id/pack, quality diagnostics, badges everywhere
- **Phase 33**: Runtime Skill Selector (2 plans) — selectSkills() keyword scoring, prompt injection, skills_used JSONB logging
- **Phase 34**: Feedback Telemetry (4 plans) — skill_feedback_events table, thumbs up/down, effectiveness_score, admin API + UI bars
- **Phase 36**: Skill Quality Scoring (1 plan) — measurable quality_score (0-100), scaffold/baseline/production/high-performing/stale tiers, audit endpoint, tier filters.

### Remaining (2 phases)
1. **Phase 35**: Agent Evolution Loop — background job analyzes feedback → skill recommendations → admin approve/reject
2. **Phase 37**: Template Skill UX — template detail as skill config command center, drag-drop, mandatory/optional, preview

### Dependency Chain
- Phase 35 depends on Phase 34 ✓
- Phase 36 depends on Phase 34 ✓ (can parallel with 35)
- Phase 37 depends on Phase 36

## Session Notes (2026-04-02)
- Updated all paths from /home/lobster/documents/porter/ → /home/lobster/projects/porter/
- porter-admin standalone repo is ARCHIVED
- Brain + Admin share one version number
- Port 5175 is DEAD — only 3001
- Moe wants delegation through Porter Bridge to other models (Codex, OpenClaw) when approaching session limits
- Phase 34 verification still pending (34-03 executed but phase not verified/closed yet)

## Resume Instructions
1. Verify Phase 34 (run verifier, mark complete)
2. Push all local commits to remote — already done (2026-04-02 cleanup commit)
3. Continue with Phase 35 (or delegate to Codex/OpenClaw via Bridge)
