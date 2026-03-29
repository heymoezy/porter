# Porter Checkpoint
# CANONICAL — all gateways read this file. Do not create per-gateway checkpoints.
# Location: /home/lobster/documents/porter/tasks/checkpoint.md

project: porter
version: v4.0.0
updated: 2026-03-29
updated_by: gemini-cli

## Architecture

Single monorepo (heymoezy/porter). One Fastify process on :3001. API metering business model.
3 pillars: Bridge (hub), Forge (factory), Recall (shared brain).
5 gateways: Claude CLI, OpenClaw, Ollama, Codex CLI, Gemini CLI.
Service token auth for inter-gateway communication (X-Porter-Service-Token).

## Completed (v4.0 Release)

1. Bridge-Native Task Promotion: @model mentions in assistant responses now automatically create pending tasks in the 'tasks' table for handoffs.
2. Context Windowing: Refactored memory-injection.ts to strictly enforce token budgets across the 5-tier pipeline with rolling targets and priority/confidence tie-breakers.
3. Reactive Subscriptions: ai-router.ts now detects mid-conversation updates to directives/notes and injects them as system turns for real-time reactivity.

## Pending (next session)

1. Bridge nav badge — counter showing pending gateway updates + installs
2. Hooks link — currently shows files, needs to show actual hook configurations
3. Codex/OpenClaw usage % — providers don't publish limits
4. Operator activity — needs real-time SSE push
5. Task handoff UI — visualize the @model promoted tasks in the Admin dashboard

## Key Discoveries (2026-03-29)

- Claude usage: anthropic-ratelimit-unified-5h-utilization header on ANY API response
- OpenClaw: openclaw status --json gives live session data
- Codex: compiled Rust binary, uses account/rateLimits/updated WebSocket events
- Service token: X-Porter-Service-Token: porter-local-service-2026 (localhost only)
