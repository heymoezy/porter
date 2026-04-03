# Porter Checkpoint
# CANONICAL — all gateways read this file. Do not create per-gateway checkpoints.
# Location: /home/lobster/projects/porter/CHECKPOINT.md

project: porter
version: v5.2.0
updated: 2026-04-03
updated_by: claude-opus-4.6

## Architecture

Single monorepo (heymoezy/porter). One Fastify process on :3001. API metering business model.
3 pillars: Bridge (hub), Forge (factory), Recall (shared brain).
5 gateways: Claude CLI, OpenClaw, Ollama, Codex CLI, Gemini CLI.
**Port 5175 is DEAD. Everything on :3001.**

## Milestone v5.0 — Living Skills — COMPLETE

All 8 phases shipped, 36+ requirements verified:
- Phase 31: Source of Truth Cleanup
- Phase 32: Skill Pack Explorer (CodeMirror file editor)
- Phase 33: Runtime Skill Selector (dispatch-time skill injection)
- Phase 34: Feedback Telemetry (thumbs up/down, effectiveness scoring)
- Phase 35: Agent Evolution Loop (background analyzer, proposals, approve/reject)
- Phase 36: Skill Quality Scoring (0-100 score, tier badges, audit)
- Phase 37: Template Skill UX (skill config command center on templates)
- Phase 38: Adaptive Agent Context (directive scoring, compression, observability)

## Queued Work

1. **Project Monitoring System** — from /home/lobster/projects/Fatburger Lawsuit/correspondence/PORTER-MONITORING-FEATURE-PROMPT.md
   - Automated watchers per project (web search, email, RSS, custom)
   - Activity feed integration, notifications, admin overview
   - Real use case: Fatburger lawsuit monitoring

2. **Project Substrate V1** — from ~/.openclaw/workspace/PROJECT-SUBSTRATE-HANDOFF-TO-CLAUDE.md
   - Every folder = project container with structure/intake/work/outputs/memory/governance
   - Upload = intelligence ingress (classify, route, link, interpret, surface)
   - Atlas governance, Recall memory semantics, Bridge routing
   - /_system/ model for operational docs
   - Replace Files tab with proper workspace shell

## Recent Session Notes (2026-04-03)
- v5.0.1: Fixed all routes on Brain :3001 (were in dead admin backend)
- v5.0.1: 560MB dead code removed, full repo cleanup
- v5.2.0: Phase 38 Adaptive Agent Context shipped
- Full changelog restored (v1.0.0-v5.2.0)
- Skills Curator agent created
- OpenClaw feedback: Phases 32-34, 37 accepted; 35-36 had issues (now fixed)
