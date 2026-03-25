# Project Research Summary

**Project:** Porter v3.0 — Bridge (AI Gateway & Model Intelligence)
**Domain:** AI Orchestration SaaS — Gateway Registry, Smart Routing, Multi-Backend Dispatch
**Researched:** 2026-03-25
**Confidence:** HIGH

## Executive Summary

Porter v3.0 Bridge replaces the hardcoded two-backend dispatch in `ai-router.ts` with a database-backed gateway registry, multi-backend adapter layer, and smart routing engine. The product is not an API proxy — it is an orchestration layer over tools the user already owns (Ollama, OpenClaw, Claude CLI, Codex CLI, Gemini CLI). This is the architectural moat: zero external dependency, zero markup, zero credential custody. All competitors (LiteLLM, Portkey, Helicone, OpenRouter) require the user to give them API keys or route through their infrastructure. Porter does not.

The recommended approach is a strict delegation-and-wrapping pattern: a new `services/bridge/` directory sits above the existing `ai-router.ts` and `stream-service.ts`, which remain untouched. Four typed adapters (OllamaAdapter, OpenClawAdapter, CodexCLIAdapter, ClaudeAdapter) each implement a `GatewayAdapter` interface, and a `StreamNormalizer` converts all output formats to a unified `AsyncIterable<string>`. Three new PostgreSQL tables (`gateways`, `models`, `routing_rules`) plus a dispatch log replace all hardcoded config. Three lightweight npm packages are added: `opossum` (circuit breakers), `p-queue` (per-backend dispatch concurrency), and `which` (CLI binary detection). No Redis, no external AI gateways, no Python dependencies.

The key risks are all Phase 1 concerns: the migration from hardcoded config to DB-driven config must use a fallback chain (not a cutover) or the system goes dark during deployment; the per-request health probe pattern in the current `probeBackend()` adds 100-300ms per dispatch and must be replaced by a background health cache before any other routing logic is built on top; and API key masking must be baked into the gateway schema and API layer from day one, not added later. All three risks have clear prevention strategies documented in PITFALLS.md and are addressable in Phase 1.

---

## Key Findings

### Recommended Stack

The existing Fastify 5 / Drizzle ORM / PostgreSQL 16 / Zod 4 stack requires only three new runtime packages. `opossum` (circuit breaker — Red Hat-sponsored, 70K weekly downloads, Node.js 22 compatible, ESM-native) handles Closed/Open/Half-Open state per backend with event emission that feeds the existing SSE hub. `p-queue` (dispatch concurrency — sindresorhus, actively maintained, native ESM) provides per-backend queuing with configurable concurrency and RPM caps without requiring Redis. `which` (CLI binary detection — 150M weekly downloads, used by npm itself) handles cross-platform PATH scanning for `claude`, `codex`, `gemini`, `ollama` binaries without shell spawning.

**Core technologies:**
- `opossum` 9.0.0: Circuit breaker per gateway — replaces unreliable per-request probing with stateful Open/Half-Open/Closed management
- `p-queue` 9.1.0: Per-backend dispatch queue — prevents VPS saturation under concurrent agent load; no Redis required
- `which` 4.0.0: CLI binary detection — enables zero-config first-run auto-discovery by scanning PATH for installed tools
- PostgreSQL 16 (existing): Four new tables via Drizzle schema additions, no new infrastructure
- `toad-scheduler` via existing `@fastify/schedule` (existing): Background health tick every 30s

**What NOT to add:** LiteLLM proxy (Python, 500MB RAM, separate process, defeats architecture), Redis (p-queue is sufficient for single-server), openai/anthropic SDKs (native fetch already covers the wire format), Prometheus (structured DB tables are sufficient at current scale).

### Expected Features

**Must have — table stakes (Phase 1):**
- Gateway registry with persistent health status and status badges
- Local runtime detection (auto-discover Ollama, OpenClaw, CLI binaries on boot)
- Circuit breaker per gateway (Closed/Open/Half-Open with configurable thresholds)
- Retry with exponential backoff (separate from circuit breaking — handles transient errors)
- Fallback chain (N gateways in priority order, not just cheap/strong binary)
- Token usage API endpoint (expose existing `token_usage_daily` with date/model filters)
- Decision log API endpoint (paginated, filterable — expose existing `decision_log`)
- `/api/v1/bridge/status` unified health view

**Should have — differentiators (Phase 2):**
- Unified model catalog across all backends (auto-populated on detection and periodic refresh)
- Capability-based routing (strengths metadata on gateways and models)
- Backend-aware tool schema filtering wired to live gateway health state
- First-run setup wizard integration showing detected gateways with confirmed status
- Direct access annotations on every dispatch result (backend, version, model, auth method)

**Defer to Phase 3 — Bridge agents:**
- Bridge Operator agent (autonomous health monitoring with Memory V2 integration)
- Model Scout agent (autonomous model discovery, catalog maintenance)
- Route Analyst agent (weekly routing optimization proposals from decision log data)
- Preference learning (routing weight updates from accumulated decision history)

**Anti-features (intentional omissions):**
- API key storage and management — creates security liability; each CLI tool owns its own auth
- Porter as API proxy (re-exposing LLM APIs) — defeats product philosophy and competitive moat
- Semantic caching — requires vector store; VPS (2 vCPU, 8GB RAM) cannot support it
- Per-user granular token attribution — belongs in the billing phase (explicitly deferred)
- Gateway marketplace / connector store — maintenance burden; config-driven extensibility is sufficient

### Architecture Approach

The Bridge layer is a clean wrapper above existing services using a delegation pattern. A new `services/bridge/` directory contains all Bridge code. `bridge-router.ts` is the public entry point replacing direct `aiRouterDispatch()` calls in route handlers. `gateway-registry.ts` maintains a 30-second in-memory health cache backed by the `gateways` table (no per-request DB reads). `routing-engine.ts` evaluates `routing_rules` rows then falls back to the existing `shouldRouteCheap()` heuristic for backward compatibility. `startup-detector.ts` probes PATH and HTTP endpoints on Fastify boot and upserts the initial gateway rows. Four typed adapters wrap the existing `stream-service.ts` internals and a `stream-normalizer.ts` unifies their output into `AsyncIterable<string>`. The existing `ai-router.ts` and `stream-service.ts` are explicitly read-only — all 35 Playwright tests continue to pass without modification.

**Major components:**
1. `bridge/gateway-registry.ts` — DB-backed registry with 30s TTL health cache; foundation for all other Bridge features
2. `bridge/routing-engine.ts` — rule evaluation + heuristic fallback; pluggable `RoutingStrategy` interface for future tuning
3. `bridge/startup-detector.ts` — boot-time binary + HTTP probe; seeds registry; enables zero-config onboarding
4. `bridge/adapters/{ollama,openclaw,codex-cli,claude-cli}.ts` — provider-specific dispatch + response parsing
5. `bridge/stream-normalizer.ts` — unified streaming output regardless of backend format (Ollama NDJSON, OpenAI SSE, Codex JSONL, Claude JSON)
6. `routes/v1/bridge.ts` — gateway CRUD, model catalog, routing rules, dispatch log API

**SSE events:** New `bridge:*` namespace (`bridge:gateway_detected`, `bridge:gateway_status`, `bridge:dispatch_started`, `bridge:dispatch_completed`, `bridge:dispatch_failed`) emitted via existing `emitSSE()` — no changes to `sse-hub.ts`.

**Data layer:** Four new tables (`gateways`, `models`, `routing_rules`, `bridge_dispatch_log`) plus `bridge_cost_records` for per-request cost tracking. Existing `decision_log` and `token_usage_daily` are unchanged and continue to be written by the Bridge layer via the existing `logDecision()` and `trackTokenUsage()` functions.

### Critical Pitfalls

1. **Per-request health probing** — `probeBackend()` fires a HEAD request on every dispatch, adding 100-300ms. Fix: background health cache with 30s TTL in `gateway-registry.ts`; dispatch reads from cache only. Must be the first piece of infrastructure built in Phase 1.

2. **Config migration gap** — Switching from hardcoded env config to DB-driven config without a fallback chain leaves the system broken if the DB is empty on first deploy. Fix: `resolveGateways()` tries DB first, falls back permanently to env config. Write this before any other gateway feature; write a Playwright test covering the empty-DB case.

3. **Circuit breaker error conflation** — Treating 429 (rate limit), 500 (crash), and 401 (bad key) as the same breaker trigger causes over-tripping on rate limits and wasted retries on auth failures. Fix: three-class error taxonomy (transient / persistent / configuration) before writing any circuit breaker code.

4. **Ollama vs. OpenAI format mismatch** — Ollama's OpenAI compat layer drops streaming token counts silently and fails tool calls. Fix: provider-specific adapter parsers; Ollama native API for tool calls; accumulate `eval_count` from final `done:true` chunk for token counts.

5. **API key exposure** — Gateway config `GET` endpoints must mask keys to last 4 chars. Error serialization must strip auth fields. SSE payloads must never include gateway config objects. These constraints go in the schema and API design on day one.

---

## Implications for Roadmap

Based on the dependency graph from FEATURES.md and the architecture from ARCHITECTURE.md, a strict 3-phase structure is required. Phases cannot be reordered — each phase depends on the data infrastructure of the prior phase.

### Phase 1: Gateway Registry Foundation

**Rationale:** Gateway Registry is the root dependency for every other Bridge feature. Nothing can be built without it. The config migration gap, health probe latency, and API key exposure pitfalls are architectural, not cosmetic — they must be solved here before any features are layered on top. The fallback chain (env config → DB config) must be the first piece of code written.

**Delivers:** DB-backed gateway registry (`gateways`, `bridge_dispatch_log`, `bridge_cost_records` tables), auto-detection on startup via `startup-detector.ts`, persistent background health probing with 30s TTL cache, circuit breakers with correct three-class error taxonomy, retry + exponential backoff, N-backend fallback chain with permanent env-config escape hatch, API key masking in all gateway API responses, full provider adapter layer (`GatewayAdapter` interface + all four adapters), `stream-normalizer.ts`, token usage API endpoint, decision log API endpoint, `/api/v1/bridge/status` endpoint.

**Addresses:** All P1 features from FEATURES.md (Gateway Registry, Local Runtime Detection, Persistent Health Probing, Circuit Breaker, Retry + Backoff, Fallback Chain, Token Usage API, Decision Log API, Bridge Status).

**Avoids:** Per-request probing pitfall, config migration gap, circuit breaker error conflation, Ollama format mismatch, API key exposure.

**Stack additions installed in this phase:** `opossum`, `p-queue`, `which`, `@types/opossum`, `@types/which`.

### Phase 2: Model Catalog and Intelligence Layer

**Rationale:** Model catalog requires Phase 1 gateway registry to exist and be stable. Capability-based routing requires a populated model catalog. First-run wizard integration requires both detection and catalog data. This phase transforms the system from "works" to "feels intelligent" — the gateway layer becomes self-describing.

**Delivers:** `models` table + `routing_rules` table (DB migrations), unified model catalog auto-populated from adapter `listModels()` on detection + periodic 6h refresh, capability-based routing using strengths metadata from model catalog, backend-aware tool schema filtering wired to live gateway health state, first-run setup wizard integration showing detected gateways with confirmed per-gateway status, direct access annotations on every dispatch result (backend, version, model, auth method).

**Addresses:** All P2 features from FEATURES.md (Model Catalog, Capability-based Routing, Backend-aware Tool Filtering, First-run Wizard Integration, Direct Access Annotations).

**Avoids:** Heuristic routing misfire pitfall (instrument all routing decisions for later tuning), cost tracking input/output asymmetry (pricing fields in model catalog schema ensure correct USD calculation from day one).

### Phase 3: Bridge Agents

**Rationale:** Bridge agents require at minimum 7 days of `bridge_dispatch_log` data for Route Analyst to produce meaningful analysis. They also require Memory V2 (complete) and the scheduler (existing). This phase is the product moat — no other AI gateway ships agents that manage the gateway layer. Bridge Operator and Model Scout can start as soon as Phase 2 is stable; Route Analyst must wait for sufficient dispatch history.

**Delivers:** Bridge Operator agent (scheduled every 60s, probes all backends, opens/closes circuit breakers, emits `bridge:health` SSE events, writes reliability patterns to Memory V2), Model Scout agent (scheduled every 6h, scans backends for new models, updates catalog, emits `bridge:model-discovered` SSE events, writes capability concepts to Memory V2), Route Analyst agent (scheduled weekly, analyzes decision logs, proposes routing rule updates as Memory V2 low-trust concepts requiring human approval, generates routing performance report).

**Addresses:** All P3 features from FEATURES.md (Bridge Operator, Model Scout, Route Analyst, Preference Learning).

**Constraint:** Do not activate Route Analyst until 7+ days of dispatch log data exists. Bridge Operator and Model Scout have no such constraint.

### Phase Ordering Rationale

- Gateway Registry must precede everything — it is the data substrate all other features read from and write to. No shortcut here.
- Circuit breakers and health cache must be built before model catalog and routing rules — routing decisions are meaningless against stale health data.
- Model catalog enables capability-based routing which requires models to carry strengths metadata — cannot be retrofitted onto an empty catalog.
- Bridge agents require stable data infrastructure and meaningful log history — premature activation produces low-quality analysis that contaminates Memory V2.
- The config fallback chain must be the first piece of code in Phase 1 — any other order risks breaking the running system during deployment.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 — CLI adapter dispatch (CodexCLIAdapter, ClaudeAdapter):** Spawning `codex exec --json --ephemeral` and `claude -p --output-format json`, parsing their JSONL/JSON stdout under error conditions, and handling multi-turn tool interactions have non-obvious edge cases. A targeted spike before implementation is recommended.
- **Phase 3 — Route Analyst proposal format:** How routing rule proposals are structured as Memory V2 concepts and surfaced for human approval is not yet specified. Needs a design spec before Phase 3 begins.

Phases with standard patterns (skip research):
- **Phase 1 — circuit breakers and dispatch queue:** `opossum` and `p-queue` integration patterns are fully defined in STACK.md with working TypeScript examples.
- **Phase 1 — DB schema migrations:** Drizzle ORM migration pattern is established throughout the existing codebase.
- **Phase 2 — model catalog population:** Ollama `/api/tags` and OpenAI `/v1/models` response shapes are confirmed in PITFALLS.md. No surprises expected.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All three new packages npm-verified; existing stack read directly from backend/package.json and source files; no version guessing |
| Features | HIGH | Cross-referenced LiteLLM, Portkey, Helicone, Bifrost, Getmaxim; Porter codebase read directly for existing capabilities; anti-features grounded in explicit product philosophy |
| Architecture | HIGH | All findings from direct source-code inspection of ai-router.ts, stream-service.ts, schema.ts, config.ts, scheduler.ts, sse-hub.ts; zero inferred patterns |
| Pitfalls | HIGH | All pitfalls grounded in Porter's actual ai-router.ts implementation; cross-referenced production gateway postmortems and official Ollama docs including confirmed open issue #4448 |

**Overall confidence:** HIGH

### Gaps to Address

- **Codex CLI output format under error conditions:** The JSONL event schema for `codex exec --json --ephemeral` in error paths needs a spike. Normal output format is documented; error output format is less certain.
- **Claude CLI multi-turn tool call passthrough:** `claude -p --output-format json` for tool-bearing dispatches — the exact flag set and output structure for multi-turn tool interactions needs validation during Phase 1 implementation.
- **`@types/opossum` v8 types with opossum v9:** STACK.md flags MEDIUM confidence on type coverage. Verify at install time that v8 typings cover the v9 API surface in use.
- **Route Analyst proposal format:** How routing rule proposals are structured as Memory V2 low-trust concepts and surfaced for human approval is undefined. Needs a design spec before Phase 3 begins.

---

## Sources

### Primary (HIGH confidence)
- `backend/src/services/ai-router.ts` — dispatch pattern, probeBackend(), trackTokenUsage(), shouldRouteCheap() — read directly
- `backend/src/routes/v1/admin/models.ts` — COST_PER_M table, existing admin models API — read directly
- `backend/src/db/schema.ts` — existing tables confirmed — read directly
- `backend/package.json` — confirmed installed dependencies — read directly
- `research/cli-runtime-design-brief.md` — PROVIDER_REGISTRY and CLI tool capabilities
- `research/chat-latency-and-prompt-caching-notes.md` — prompt caching implications for cost tracking
- [opossum npm](https://www.npmjs.com/package/opossum) — v9.0.0, June 2025
- [opossum documentation](https://nodeshift.dev/opossum/) — API reference for CircuitBreaker options
- [p-queue GitHub](https://github.com/sindresorhus/p-queue) — concurrency + interval options confirmed
- [which npm](https://www.npmjs.com/package/which) — v4.0.0, ESM-native, 150M weekly downloads
- [Ollama OpenAI Compatibility Docs](https://docs.ollama.com/api/openai-compatibility) — streaming delta structure differences, tool calling limitations
- [Ollama streaming usage issue #4448](https://github.com/ollama/ollama/issues/4448) — confirmed missing usage in streaming OpenAI compat format

### Secondary (MEDIUM confidence)
- [LiteLLM proxy features](https://docs.litellm.ai/docs/simple_proxy) — competitor feature baseline
- [Portkey AI gateway features](https://portkey.ai/docs/product/ai-gateway) — competitor feature baseline
- [Best enterprise LLM gateways 2026](https://www.getmaxim.ai/articles/best-enterprise-llm-gateways-in-2026-a-comparative-guide/) — feature matrix comparison
- [Retries, Fallbacks, Circuit Breakers in LLM Apps](https://www.getmaxim.ai/articles/retries-fallbacks-and-circuit-breakers-in-llm-apps-a-production-guide/) — error classification taxonomy
- [LLM API Token Security: 7 Most Common Mistakes](https://aiq.hu/en/llm-api-token-security-the-7-most-common-mistakes-and-how-to-avoid-them/) — key storage and rotation patterns
- [LiteLLM Supply Chain Attack](https://blog.dreamfactory.com/why-the-litellm-supply-chain-attack-is-a-wake-up-call-for-ai-api-credential-management/) — credential exposure via API responses
- [Langfuse Token and Cost Tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking) — pricing tier support, cache token tracking
- [LLM Routing in Production](https://blog.logrocket.com/llm-routing-right-model-for-requests/) — heuristic accuracy limitations, feedback loop importance

---
*Research completed: 2026-03-25*
*Ready for roadmap: yes*
