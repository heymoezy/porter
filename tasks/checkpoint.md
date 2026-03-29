# Porter Checkpoint
# CANONICAL — all gateways read this file. Do not create per-gateway checkpoints.
# Location: /home/lobster/documents/porter/tasks/checkpoint.md
# Updated by: whichever model last completed work. Always update after every change.

project: porter
version: v3.2.0
updated: 2026-03-29
updated_by: claude-opus-4.6

## Architecture

Porter is a single monorepo (`heymoezy/porter`). One repo, one product. Business model: API metering.
- Brain (`backend/`) :3001 — Fastify API, PostgreSQL, Bridge, Memory V3
- Admin (`admin/backend/` + `admin/frontend/`) :5175 — SaaS control plane, Bridge UI, Intelligence, CRM
- Any future UI/frontend is just an API customer — separate product

## Milestones

- v1.0 Foundation: COMPLETE (2026-03-21) — 7 phases, 30 requirements
- v2.0 Backend Ready: COMPLETE (2026-03-24) — 8 phases, 38 requirements
- v3.0 Porter Bridge: COMPLETE (2026-03-25) — 8 phases (16-23), all shipped
- v3.0.1 patches: system prompt pipeline, version detection, speed test (2026-03-28)
- v3.2.0 monorepo: porter-admin merged into porter/admin/ (2026-03-29)
- v4.0 Agent-First UI: PLANNED — Phases 24-28, not started

## Multi-Model Bridge

5 gateways, all workers under Porter's orchestration:
- OpenClaw (GPT-5.4) — :18789, primary strong model
- Ollama (Qwen 2.5 Coder 1.5B) — :11434, local cheap/fast
- Claude CLI — subprocess adapter
- Codex CLI — subprocess adapter (no system prompt support)
- Gemini CLI — subprocess adapter

System prompt pipeline: agent_templates.system_prompt + directives from DB → memory-injection.ts → bridge adapter → gateway

## Active Work (2026-03-29)

- Comprehensive cleanup: killed :8877 everywhere, removed porter-ui as active product
- Populated Brain directives (15) + concepts (9) — were completely empty
- Fixed all gateway workspace files (OpenClaw, Gemini, Codex, Claude Code)
- Fixed system prompt pipeline to read directives from Brain DB
- Fixed ai-router.ts to inject memory context into agent dispatches
- Fixed OpenClaw adapter: model name (openclaw not openai-codex/gpt-5.4), auth token
- Enabled OpenClaw chatCompletions endpoint
- Verified end-to-end: Claude Code → Brain → OpenClaw (GPT-5.4) working
- Fixing porter-admin: architecture page, gateway cards (update button, version detection)
- Monorepo merge complete: porter-admin merged into porter/admin/ (v3.2.0)

## Pending

- v4.0 milestone activation + requirements
- porter.py reference cleanup (~135 refs)
- Porter title: "Master Orchestrator" → "Claw Master"

## Key Files

- Roadmap: .planning/ROADMAP.md
- Brain DB: PostgreSQL `porter` database (directives, concepts tables)
- Memory injection: backend/src/services/memory-injection.ts
- Stream service: backend/src/services/stream-service.ts
- Bridge adapters: backend/src/services/bridge/adapters/
- Service: systemctl --user status porter-fastify

## Rules for Updating

1. ANY model that does work MUST update this file before finishing
2. Update `version`, `updated`, `updated_by`, and relevant sections
3. Never create separate per-gateway or per-repo checkpoints
4. This file + Brain DB (directives/concepts) = shared context for all models
