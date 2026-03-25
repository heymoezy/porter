---
phase: 16-gateway-foundation
plan: 02
subsystem: infra
tags: [postgresql, which, cli-detection, gateway, env-bootstrap, credential-crypto]

requires:
  - phase: 16-01
    provides: gateways + gateway_credentials tables, GatewayAdapter interface, types.ts

provides:
  - detectAndUpsertGateways() — scans PATH for ollama/codex/claude/gemini CLIs, upserts DB rows
  - bootstrapEnvGateways() — migrates OLLAMA_URL + OPENCLAW_TOKEN to DB on first boot
  - Fastify boot sequence now calls migrateBridgeV1() + detectAndUpsertGateways() automatically

affects: [16-03, 17-cli-adapters, 18-health-monitor, 19-router-integration]

tech-stack:
  added: [which@6, @types/which]
  patterns: [ON CONFLICT (type, source) partial upsert, deterministic credential ID via SHA-256, startup try/catch never throws]

key-files:
  created:
    - backend/src/services/bridge/startup-detector.ts
  modified:
    - backend/src/index.ts
    - backend/package.json

key-decisions:
  - "Raw SQL (not Drizzle) for startup detector — runs at boot before Drizzle is fully initialized"
  - "Ollama always bootstrapped from env (has default URL); OpenClaw only if OPENCLAW_TOKEN is non-empty"
  - "detectAndUpsertGateways() runs AFTER scheduler.start() — HTTP server ready before detection, never blocks requests"
  - "Deterministic credential ID via SHA-256 of 'type:source:label' ensures idempotent re-runs"
  - "Missing CLIs mark rows stale (not deleted) — preserves manual config and history"

patterns-established:
  - "Startup hook pattern: all bridge detection runs after fastify.listen() so HTTP is ready"
  - "ON CONFLICT on partial unique index (type, source) WHERE source IN ('auto_detected','env_bootstrap') for idempotent upserts"
  - "try/catch at detectAndUpsertGateways() boundary — detection failures logged, never crash startup"

requirements-completed: [GW-03, GW-08]

duration: 3min
completed: 2026-03-25
---

# Phase 16 Plan 02: Startup Detector Summary

**`which`-based PATH scanner upserts ollama/codex/claude/gemini gateway rows on every Fastify boot, with env-var bootstrap for Ollama and encrypted OpenClaw credentials via credential-crypto**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T05:57:15Z
- **Completed:** 2026-03-25T06:00:20Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `startup-detector.ts` exports `detectAndUpsertGateways(pool)` — zero-config CLI detection via `which` package
- Env-var bootstrap: Ollama always upserted, OpenClaw upserted with encrypted bearer token when `OPENCLAW_TOKEN` + `PORTER_SECRET` are set
- `migrateBridgeV1` and `detectAndUpsertGateways` wired into `index.ts` boot sequence at correct positions (after tables exist, after HTTP ready)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install which package and create startup-detector.ts** - `eef714c` (feat)
2. **Task 2: Wire migration and detector into Fastify boot sequence** - `a6dc9ee` (feat)

## Files Created/Modified

- `backend/src/services/bridge/startup-detector.ts` — CLI detection, env bootstrap, upsert helpers, credential encryption
- `backend/src/index.ts` — two new imports + `migrateBridgeV1(pool)` + `detectAndUpsertGateways(pool)` calls
- `backend/package.json` — `which@6` in dependencies, `@types/which` in devDependencies

## Decisions Made

- Raw SQL chosen over Drizzle for the startup detector because it runs at boot before Drizzle is initialized
- `detectAndUpsertGateways` placed after `scheduler.start()` (post-HTTP-listen) so detection never blocks incoming requests
- Deterministic SHA-256 credential ID ensures repeated boots upsert the same row, never duplicating credentials

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. PORTER_SECRET + OPENCLAW_TOKEN are optional; startup works without them.

## Next Phase Readiness

- Gateway rows will be populated on next Fastify restart
- Phase 16-03 (health-check probes) can now query the `gateways` table and call `health()` on each detected gateway
- Phase 17 (CLI adapters) has binary paths available in `metadata.binary_path` for subprocess dispatch

---
*Phase: 16-gateway-foundation*
*Completed: 2026-03-25*
