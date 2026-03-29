# Porter Checkpoint
# CANONICAL — all gateways read this file. Do not create per-gateway checkpoints.
# Location: /home/lobster/documents/porter/tasks/checkpoint.md

project: porter
version: v3.3.1
updated: 2026-03-29
updated_by: claude-opus-4.6

## Architecture

Single monorepo (heymoezy/porter). One Fastify process on :3001. API metering business model.
3 pillars: Bridge (hub), Forge (factory), Recall (shared brain).
5 gateways: Claude CLI, OpenClaw, Ollama, Codex CLI, Gemini CLI.
Service token auth for inter-gateway communication (X-Porter-Service-Token).

## Pending (next session)

1. Bridge nav badge — counter showing pending gateway updates + installs
2. Hooks link — currently shows files, needs to show actual hook configurations
3. Codex/OpenClaw usage % — providers don't publish limits
4. Inter-gateway coordination — auth works but CLIs aren't actively using Bridge
5. Operator activity — needs real-time SSE push

## Key Discoveries (2026-03-29)

- Claude usage: anthropic-ratelimit-unified-5h-utilization header on ANY API response
- OpenClaw: openclaw status --json gives live session data
- Codex: compiled Rust binary, uses account/rateLimits/updated WebSocket events
- Service token: X-Porter-Service-Token: porter-local-service-2026 (localhost only)
