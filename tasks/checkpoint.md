# Porter Checkpoint
# CANONICAL — all gateways read this file. Do not create per-gateway checkpoints.
# Location: /home/lobster/documents/porter/tasks/checkpoint.md

project: porter
version: v4.0.6
updated: 2026-04-01
updated_by: claude-opus-4.6

## Architecture

Single monorepo (heymoezy/porter). One Fastify process on :3001. API metering business model.
3 pillars: Bridge (hub), Forge (factory), Recall (shared brain).
5 gateways: Claude CLI, OpenClaw, Ollama, Codex CLI, Gemini CLI.
Service token auth for inter-gateway communication (X-Porter-Service-Token).

## Completed (v4.0.6 — 2026-04-01)

**Claude Opus 4.6 (v4.0.1–v4.0.6):**
1. Forge station agents — Quill/Sage/Anvil inserted as persona instances linked to existing templates
2. Forge tabs split: Templates | Skills | Tools | Workshop | Arena (was single Armory)
3. SkillsStudio + ToolsStudio extracted as shared components (used by forge tabs + standalone pages)
4. skill-library.ts service — filesystem skill packs, research notes, CRUD
5. Brain skills API updated to query `skills` table (was hardcoded SKILL_CATALOG)
6. Nav restructure — Intelligence → Ops, Changelog removed, Settings → gear icon, Files own section
7. System + Activity + Diagnostics merged into single /system page with sub-tabs
8. Files page — full-featured port from frontend-v2 (upload, download, rename, delete, preview)
9. Agent detail: Sheet → Build tab, improved CharacterCard/VitalsBar/PassiveTree design
10. Agent skills tab enriched — joins skills table for description/category/source

## Pending (next session)

1. OpenClaw usage fix — finalize live usage tracking for OpenClaw gateway
2. Task handoff UI — visualize @model promoted tasks in Admin dashboard
3. Inter-gateway coordination — CLIs actively using Bridge via service token
4. Design system update — document CharacterCard, VitalsBar, PassiveTreeView components

## Key Discoveries (2026-03-31)

- Gemini Quota API: https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota (Bearer token auth)
- Gemini project default: cloudaicompanion-project-id
- Release Convention: release: vX.Y.Z — [Summary] (mandatory for master branch)
