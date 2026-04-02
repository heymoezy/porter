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
Service token auth for inter-gateway communication (X-Porter-Service-Token).

## Completed (v4.5.0 — 2026-04-02)

**Projects System:**
- /home/lobster/documents → /home/lobster/projects (each folder = a project)
- PROJECT.md + CHECKPOINT.md standard in every project folder
- Projects Curator agent (Atlas) assigned to manage index
- Full file manager: drag-drop move, delete dialog, new folder, 100MB uploads, real % progress

**Agent Template/Instance Model:**
- Clear template vs instance distinction throughout the UI
- 8 personas with correct template_id mappings
- Instances shown in SOUL tab on template view
- Born = soul_hash (only Porter is born)
- Instances endpoint added to brain (was missing)

**Skills 10x (v4.1.0–v4.4.0):**
- 207 skills across 20 categories, all with complete on-disk packs
- SkillsStudio CRUD UI, marketplace grid view, tag filters, import system
- skill-library.ts service, admin-proxy.ts for Brain→Admin forwarding

**Admin Improvements (v4.0.1–v4.0.6):**
- Nav restructure, System page merge, Files→Projects, Build tab redesign
- Agent skills tab enrichment, chat panels removed from Forge/Org Chart

## Pending (next session)

1. OpenClaw usage fix — finalize live usage tracking
2. Design system update — document new components
3. Skill content quality — enrich 170 new skill packs with specific prompts/examples
4. Template↔Skill assignments — populate template_skills junction table
