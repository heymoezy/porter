# Phase 21: First-Run Setup - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the first-run setup API layer: a detection endpoint exposing all discovered gateways with status/models/health, a guided setup API with independently-callable steps (detect → configure → validate → save), zero-config path where Ollama works immediately, and OpenClaw dual-role integration (AI dispatch + messaging gateway). Pure backend API — no frontend.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

Key constraints from requirements:
- FRS-01: Detection endpoint returns all discovered gateways with connection status, available models, and health
- FRS-02: Guided setup API — step-by-step: detect local runtimes, prompt for API keys, validate connections, save to DB. Each step independently callable.
- FRS-03: Zero-config path — if Ollama is running locally, Bridge works immediately with no user action
- FRS-04: OpenClaw integration — detect as both multi-model AI dispatch gateway and messaging gateway (WhatsApp/Telegram)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/services/bridge/startup-detector.ts` — detectAndUpsertGateways() already detects Ollama, OpenClaw, Codex/Claude/Gemini CLIs from PATH and env vars
- `backend/src/services/bridge/adapters/*.ts` — 5 adapters with detect(), health(), listModels()
- `backend/src/routes/v1/bridge.ts` — existing Bridge API routes (gateway list, redetect endpoint)
- `backend/src/services/bridge/model-catalog.ts` — refreshModelsForGateway() auto-populates models
- `backend/src/services/bridge/health-probe.ts` — runHealthProbe() checks gateway health

### Established Patterns
- Route groups in `backend/src/routes/v1/` with Fastify schema validation
- Zod + OpenAPI for request/response schemas
- Gateway detection on boot already works (startup-detector.ts)
- Auth middleware via authPlugin

### Integration Points
- startup-detector.ts: enhance to return detection results (not just upsert silently)
- bridge.ts routes: add detection endpoint and setup wizard API
- Gateway adapters: detect() + health() already return structured results

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
