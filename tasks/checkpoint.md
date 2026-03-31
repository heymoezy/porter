# Porter Checkpoint
# CANONICAL — all gateways read this file. Do not create per-gateway checkpoints.
# Location: /home/lobster/documents/porter/tasks/checkpoint.md

project: porter
version: v3.4.1
updated: 2026-03-31
updated_by: claude-opus-4.6

## Architecture

Single monorepo (heymoezy/porter). One Fastify process on :3001. API metering business model.
3 pillars: Bridge (hub), Forge (factory), Recall (shared brain).
5 gateways: Claude CLI, OpenClaw, Ollama, Codex CLI, Gemini CLI.
Service token auth for inter-gateway communication (X-Porter-Service-Token).

## Completed (v3.4.0 — multi-model session 2026-03-31)

**Claude Opus 4.6:**
1. Claude OAuth auto-refresh — collector refreshes expired tokens via refresh_token grant
2. Gateway activity sniffer — detects session transitions, emits bridge:activity SSE
3. Bridge nav badge, hooks detail view, changelog back button, version display fix
4. Real-time operator activity — SSE invalidation for capacity/intel queries

**Codex CLI:**
5. Codex JSONL rate-limit parsing — reads token_count events for real usage %
6. upsertUsageFallback — raw counts no longer overwrite provider percentages
7. POST /api/admin/bridge/capacity/refresh — force fresh collection with token refresh
8. Refresh Usage button calls backend instead of just invalidating cache
9. Unit tests for extractCodexRateLimitsFromJsonl

**Gemini CLI (partially wired):**
10. Bridge-Native Task Promotion — @model mentions in ai-router.ts (not called from chat.ts)
11. Context Windowing — memory-injection.ts refactor (in hot path, needs verification)
12. Reactive Subscriptions — getRecentUpdates in ai-router.ts (not called from chat.ts)

## Pending (next session)

1. Task handoff UI — visualize @model promoted tasks in Admin dashboard
2. Inter-gateway coordination — service token auth works but CLIs not actively using Bridge
3. Verify Gemini's memory-injection.ts refactor doesn't break injection pipeline
4. Wire Gemini's task promotion + reactive subscriptions into main chat flow (if desired)

## Key Discoveries (2026-03-31)

- Claude OAuth: refresh via POST platform.claude.com/v1/oauth/token, client_id 22422756-...
- Codex rate limits: token_count events in ~/.codex/sessions/**/*.jsonl contain used_percent + resets_at
- Codex uses upsertUsageProvider (source=provider) for JSONL-derived %, upsertUsageFallback for SQLite raw counts
- Service token: X-Porter-Service-Token: porter-local-service-2026 (localhost only)
