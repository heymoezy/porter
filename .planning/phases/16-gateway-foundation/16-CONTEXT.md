# Phase 16: Gateway Foundation - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Register every AI backend Porter can talk to in PostgreSQL with typed metadata, encrypted credentials, and a clean adapter contract. This is the data substrate all Bridge features (Phases 17-23) build on. Phase 16 does NOT implement concrete adapters (Phase 17), health probes (Phase 18), or routing logic (Phase 20) — it creates the schema, interface, detection, and migration layer.

</domain>

<decisions>
## Implementation Decisions

### Gateway Schema
- `gateways` table in PostgreSQL via Drizzle ORM
- 6 gateway types: `ollama`, `openclaw`, `codex_cli`, `claude_cli`, `gemini_cli`, `openai_compat`
- `openai_compat` type supports any OpenAI-compatible endpoint (LiteLLM, custom proxies, future providers) — keeps the door open without adding dependencies
- Simple integer priority column (1=highest). Smart Routing (Phase 20) adds complexity later
- `capabilities` JSONB array on each gateway (e.g. `['chat','code','streaming','tool_use']`) — populated by adapters during detection, enables capability-based routing in Phase 20
- `source` column: `auto_detected`, `env_bootstrap`, `manual` — tracks how gateway was created, used by redetect to preserve manual entries
- `status` column with states including `active`, `stale`, `unavailable` — stale gateways self-heal via Bridge agents (Phase 18+)
- Binary paths stored in metadata JSONB for CLI gateways (e.g. `{"binary_path": "/usr/local/bin/ollama"}`)

### Credential Model
- Separate `gateway_credentials` table with FK to `gateways` — secrets never in same table as config
- 1:many relationship — supports primary + backup keys, key rotation without downtime
- `auth_method` enum: `none`, `bearer_token`, `api_key`
- Credential values encrypted at rest using existing `credential-crypto.ts` (AES-256-GCM with PORTER_SECRET)
- API responses mask keys to last 4 chars + masked prefix (e.g. `****...ab3f`) — standard Stripe/GitHub pattern
- Full keys never returned after initial save

### Auto-Detection Behavior
- Startup detector runs on Fastify boot ONLY — no periodic rescan (health probes handle ongoing monitoring in Phase 18)
- Scans PATH for: Ollama, OpenClaw, Codex CLI, Claude CLI, Gemini CLI binaries
- Detected gateways enabled by default — zero-config philosophy, if Ollama is running Porter uses it
- Detection logged to console: `✓ Ollama detected at /usr/local/bin/ollama` — visible in systemctl logs
- Missing CLIs between restarts → mark gateway as `stale`, agents self-heal later
- Only local tools auto-detected in Phase 16. Direct API-key providers (Anthropic, OpenAI, Google AI) added manually via admin UI or first-run setup (Phase 21)

### Env-to-DB Migration
- First boot with existing env vars (OLLAMA_URL, OPENCLAW_URL, OPENCLAW_TOKEN): auto-bootstrap gateway rows + credentials from env vars
- After bootstrap, DB is authoritative — env vars are fallback only if gateway row missing
- `POST /api/admin/bridge/redetect` endpoint — admin-only, clears `auto_detected` + `env_bootstrap` rows, re-runs bootstrap. Preserves `manual` entries. Rebuild capability for when things break.
- ai-router.ts continues reading config.ts for now (no modifications to existing routing). Phase 20 switches to DB-driven selection and retires env fallback.

### Adapter Interface
- `GatewayAdapter` TypeScript interface with 5 typed methods: `detect()`, `health()`, `dispatch()`, `stream()`, `listModels()`
- Phase 16 defines interface ONLY — concrete adapter implementations are Phase 17
- `GatewayAdapter` supersedes existing `StreamBackend` interface from stream-service.ts — StreamBackend's `stream()` becomes one of 5 methods. Phase 17 adapters implement GatewayAdapter; Phase 20 retires StreamBackend.
- `dispatch()` returns structured `DispatchResult`: `{ response, model, tokensUsed, inputTokens, outputTokens, latencyMs, cached }` — cost tracking (Phase 19) needs these fields
- Interface and types live at `backend/src/services/bridge/types.ts` — new bridge/ directory for all Bridge code

### Claude's Discretion
- Exact column types and defaults for the gateways table
- Drizzle migration script structure
- Index strategy for the gateways table
- Startup detector implementation approach (which npm package or exec)
- Error handling in bootstrap when env vars have invalid URLs

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing AI infrastructure
- `backend/src/services/ai-router.ts` — Current routing logic, `getBackends()`, `shouldRouteCheap()`, `DispatchResult` type. Bridge wraps this, doesn't modify it.
- `backend/src/services/stream-service.ts` — Current `StreamBackend` interface that `GatewayAdapter` supersedes. OllamaStreamBackend and OpenClawStreamBackend implementations.
- `backend/src/config.ts` — Env vars being migrated: `ollamaUrl`, `openclawUrl`, `ollamaModel`, `openclawModel`, `openclawToken`, `porterSecret`

### Database patterns
- `backend/src/db/schema.ts` — All existing Drizzle table definitions. Follow these patterns for new tables.
- `backend/src/db/client.ts` — PostgreSQL pool connection
- `backend/src/db/migrate-consolidated.ts` — Migration pattern reference

### Encryption
- `backend/src/lib/credential-crypto.ts` — AES-256-GCM encryption for credentials. Reuse for gateway API key encryption.

### API patterns
- `backend/src/lib/envelope.ts` — API response envelope format
- `backend/src/lib/roles.ts` — RBAC role system for admin-only endpoints

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `credential-crypto.ts`: Full AES-256-GCM encrypt/decrypt with PORTER_SECRET — reuse directly for gateway credentials
- `envelope.ts`: Standard API response wrapper — use for all bridge endpoints
- `roles.ts`: RBAC role checks — use for admin-only redetect endpoint
- `schema.ts` patterns: pgTable, text/integer/doublePrecision/jsonb columns, epoch timestamps, serial PKs

### Established Patterns
- Drizzle ORM for all schema definitions — no raw SQL DDL
- Epoch timestamps as `doublePrecision` with `EXTRACT(EPOCH FROM NOW())` defaults
- JSONB for flexible metadata (used by tasks, projects, personas, connections)
- Text primary keys with generated IDs (not serial) for most tables
- Feature flags in `config.ts` — may need `bridge` flag

### Integration Points
- `backend/src/index.ts`: Server startup — detector runs here after DB connect
- `backend/src/services/bridge/`: New directory for all Bridge services
- `backend/src/routes/v1/`: Admin bridge endpoints register here
- `backend/src/db/schema.ts`: New table definitions added here

</code_context>

<specifics>
## Specific Ideas

- "openai_compat" gateway type — so if someone runs LiteLLM or any OpenAI-compatible proxy, Porter registers it as just another gateway. OpenClaw already works this way.
- Binary paths in metadata JSONB — subprocess adapters (Phase 17) know exactly which binary to call
- Stale gateways self-heal via agents — no delete, no manual intervention needed
- Console logging at detection: `✓ Ollama detected at /usr/local/bin/ollama` — visible and debuggable

</specifics>

<deferred>
## Deferred Ideas

- **External gateway proxies (LiteLLM, Kong, etc.)** — Porter builds its own adapter layer because it needs CLI subprocess dispatch + memory integration + admin visibility. External proxies don't cover these. But `openai_compat` type keeps the door open for interop.
- **Periodic re-detection** — Boot-only for now. Health probes (Phase 18) and Bridge agents handle ongoing monitoring.
- **API-key provider auto-detection from env** — Only local tools in Phase 16. ANTHROPIC_API_KEY / OPENAI_API_KEY detection deferred to Phase 21 first-run setup.
- **Weight-based load balancing** — Simple integer priority for now. Smart Routing (Phase 20) can add weighted distribution.
- **Gateway-level AND model-level capabilities** — Phase 16 has gateway capabilities. Model capabilities come in Phase 19 (Model Catalog).

</deferred>

---

*Phase: 16-gateway-foundation*
*Context gathered: 2026-03-25*
