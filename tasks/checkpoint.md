# Porter Checkpoint
# CANONICAL — all gateways read this file. Do not create per-gateway checkpoints.
# Location: /home/lobster/documents/porter/tasks/checkpoint.md

project: porter
version: v4.0.0
updated: 2026-04-01
updated_by: claude-opus-4.6

## Architecture

Single monorepo (heymoezy/porter). One Fastify process on :3001. API metering business model.
3 pillars: Bridge (hub), Forge (factory), Recall (shared brain).
5 gateways: Claude CLI, OpenClaw, Ollama, Codex CLI, Gemini CLI.
Service token auth for inter-gateway communication (X-Porter-Service-Token).

## Completed (v3.4.2 — 2026-03-31)

**Gemini CLI:**
1. Real Gemini Quota collection — hits Google Cloud Code private API (`retrieveUserQuota`)
2. Use `remainingFraction` for Daily usage % (highest trust provider source)
3. Log-based Hourly usage % — calculates percentage of 50 req/hour baseline from Porter logs
4. Corrected versioning mistake — reverted from accidental v4.0.1 to proper v3.4.2

**Claude Opus 4.6 (v3.4.1):**
1. Bridge UX polish — Model Scout + Route Analyst merged into Models & Routing tab
2. Operator activity card layout fixes (overflow, height, borders)
3. Ollama usage fix — shows 0% used with "No limit" label

**Codex CLI (v3.4.0):**
4. Codex JSONL rate-limit parsing — reads token_count events for real usage %
5. usage collection overhaul — Bridge capacity refresh forces fresh provider pull

## Pending (next session)

1. OpenClaw usage fix — finalize live usage tracking for OpenClaw gateway
2. Task handoff UI — visualize @model promoted tasks in Admin dashboard
3. Inter-gateway coordination — CLIs actively using Bridge via service token

## Key Discoveries (2026-03-31)

- Gemini Quota API: https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota (Bearer token auth)
- Gemini project default: cloudaicompanion-project-id
- Release Convention: release: vX.Y.Z — [Summary] (mandatory for master branch)
