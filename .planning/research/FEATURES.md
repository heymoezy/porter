# Feature Research

**Domain:** AI Gateway Management — Porter Bridge v3.0
**Researched:** 2026-03-25
**Confidence:** HIGH (cross-referenced LiteLLM docs, Portkey docs, Helicone, Bifrost, Getmaxim comparative guides, Porter codebase)

---

## Scope

This document covers the Bridge (AI Gateway) feature set being added to Porter v3.0.

Existing Porter infrastructure treated as **already-built dependencies**:
- Basic 2-tier routing (cheap=Ollama, strong=OpenClaw) in `ai-router.ts`
- Streaming from Ollama (NDJSON) and OpenClaw (OpenAI SSE) in `stream-service.ts`
- Daily token usage table (`token_usage_daily`)
- Decision logging table (`decision_log`)
- Health probing via `probeBackend()` (2s timeout HEAD)
- PROVIDER_REGISTRY concept in porter.py (being migrated)
- Circuit breaker concept exists in porter.py; not yet in Fastify backend

Porter Bridge's positioning is unique in this market: it is **not an API proxy**. Competitors (LiteLLM, Portkey, Helicone, OpenRouter) sit between the user and model providers, charging markup or acting as middleware. Porter orchestrates tools the user already owns (CLI tools: Claude Code, Codex, Gemini CLI; local services: Ollama; gateways: OpenClaw). This defines which features are table stakes, which are Porter-specific differentiators, and which are anti-features that would betray the product philosophy.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features expected by anyone evaluating an AI gateway system. Missing them makes the product feel pre-release or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Gateway registry with health status | Users need to know which backends are up/down at a glance. Every major gateway (LiteLLM, Portkey) has this as a home screen | LOW | Porter already probes backends; needs a persistent registry table per gateway, not just in-memory probing on each call |
| Per-gateway health probe with status badges | Visual trust signal. Red/green badges on each backend. Without this users cannot diagnose why a request failed | LOW | Extend existing `probeBackend()` into a scheduled prober writing to a `gateway_health` table with last_checked_at and consecutive_failures |
| Model catalog (unified view across all backends) | Users need to know what models are available across their backends. Ollama may have 3 models; OpenClaw may support 10. A unified view is the starting point for smart routing | MEDIUM | Query Ollama `/api/tags`, OpenClaw `/v1/models`, CLI backends via probe; normalize into a `model_catalog` table |
| Token usage tracking (daily, by model) | Cost visibility is the #1 requested feature in every AI gateway survey. Users want to see "I used X tokens on model Y today" | LOW | Already exists in `token_usage_daily`; needs an API endpoint that exposes it with aggregation |
| Routing decision log (transparent routing) | When a request goes to a model, users want to know why. Decision log is trust-building, not just debugging | LOW | Already exists in `decision_log`; needs a queryable API endpoint with pagination and filters |
| Fallback chain on backend failure | If the primary backend is down, requests must automatically route to a working fallback. No-fallback means outages block all AI work | LOW | Already partially exists in `ai-router.ts`; needs to handle N backends in a priority chain, not just cheap/strong binary |
| Retry with exponential backoff | Transient failures (network blip, rate limit 429) should be retried automatically before surfacing an error | LOW | Not yet implemented; add to dispatch layer with configurable max attempts and backoff multiplier |
| Circuit breaker per backend | A backend seeing repeated failures should be automatically disabled for a cooldown period. Prevents cascade failures and wasted retries | MEDIUM | porter.py has the concept; needs TypeScript implementation in Fastify backend with three states: Closed/Open/Half-Open |
| Request timeout per backend | Backends that hang silently should not block indefinitely. Per-backend timeout configuration is expected | LOW | Existing 2s probe timeout; dispatch calls need configurable timeouts, not just the probe |
| Cost-aware routing (cheap vs premium tier) | Users expect AI gateways to route cheap tasks to cheap models. Manual model selection for every request is not a workflow | LOW | Already exists (`shouldRouteCheap()` in ai-router.ts); needs to expand beyond 2-tier binary logic |
| Admin dashboard API surface | Any AI gateway management tool ships with an API surface for the admin to view health, usage, decisions, and models | MEDIUM | Needs `/api/v1/bridge/*` route group collecting health, models, usage, decisions, routing config |

### Differentiators (Competitive Advantage)

Features where Porter Bridge is meaningfully different from every other AI gateway product in the market.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Local runtime detection (auto-discovery) | No other gateway auto-discovers what the user already has. Porter scans PATH, probes endpoints, and presents a setup-free inventory. LiteLLM requires YAML config. Portkey requires API keys. Porter just runs `which claude` | MEDIUM | Extend `_detect_environment_tools` from porter.py into TypeScript. Scan PATH for claude, codex, gemini, ollama binaries. Probe each for version + auth. Write to `gateway_registry` table on boot and on-demand rescan |
| First-run setup wizard (zero-config onboarding) | Users see what Porter found and get started without writing any configuration file. This is the onboarding differentiator | MEDIUM | Wizard step that surfaces detected gateways with status; shows install hints for missing tools; does not require the user to configure anything if Ollama is detected |
| CLI tool backends (not just API endpoints) | Every other gateway connects to REST APIs. Porter connects to CLI tools (claude -p, codex exec, gemini -p) as first-class backends with their own dispatch logic, output parsing, and auth detection | HIGH | Each CLI backend needs: version detection, auth probe, dispatch wrapper, output parser (JSON/JSONL/text), error classification; porter.py has prototypes; needs TypeScript port |
| Capability-based routing (strengths metadata) | Rather than routing by cost tier only, Porter knows that Claude Code is strong at reasoning/code-review, Codex at file-ops, Gemini at multimodal/summarization, Ollama at quick-tasks. The wizard uses this for agent-to-backend matching | MEDIUM | Encode `strengths[]` and `cost_tier` in gateway registry; routing logic queries strengths when context is available; fallback to cost-tier when no match |
| Bridge agents (autonomous AI gateway managers) | Three specialized agents that monitor and optimize the gateway layer automatically. No other AI gateway ships agents that manage themselves | HIGH | See Bridge Agents section below |
| Direct access principle (no hidden intermediation) | Every response shows which backend did the work ("via Claude Code v2.1.81"). Users can always bypass Porter and call the tool directly. Builds trust. No other gateway does this | LOW | Annotate every dispatch result with `{backend, version, model, auth_method}` and surface in chat responses and decision log |
| Multi-runtime dispatch (CLI + HTTP + local) | Porter dispatches to processes (CLI tools), local HTTP servers (Ollama), and remote gateways (OpenClaw) with a unified interface. Most gateways only support HTTP APIs | HIGH | Unified `BackendAdapter` interface with three concrete implementations: CliBackend, LocalHttpBackend, RemoteGatewayBackend |
| Preference learning (backend optimization over time) | Route Analyst agent reviews decision logs weekly, identifies patterns (e.g., "requests with 'analyze' keyword take 40% longer on Ollama"), and proposes routing rule updates stored in Memory V2 | HIGH | Requires Bridge agents + Memory V2 integration; decision log data is the input; agent rewrites routing weights as Memory V2 concepts |
| Backend-aware tool schema filtering | When a backend goes offline, tool definitions that require that backend are automatically stripped from the agent's tool list. Prevents hallucinated tool calls against offline backends | LOW | Already exists in `filterToolsForBackend()` in ai-router.ts; needs to be wired into the gateway health system so it responds to real-time health state changes |
| Model Scout agent (automated model discovery) | Autonomously discovers new models available on each backend (Ollama model library, OpenClaw model updates) and adds them to the catalog without manual intervention | HIGH | Requires Bridge agents; Model Scout runs on a schedule, queries each backend for available models, compares against catalog, emits SSE events for newly discovered models |

### Bridge Agents

Porter Bridge ships three autonomous agents as first-class features. These are Porter agents backed by the agent system (templates + scheduler) that manage the gateway layer itself. This is the product moat — no other AI gateway has agents managing the gateway.

| Agent | Role | Trigger | Output |
|-------|------|---------|--------|
| **Bridge Operator** | Health monitor — probes all backends on schedule, opens/closes circuit breakers, emits health alerts | Every 60s (cron) + on dispatch failure | `gateway_health` table updates, SSE `bridge:health` events, Memory V2 concepts about backend reliability patterns |
| **Model Scout** | Discovery agent — scans backends for new/updated models, updates catalog, reports capability changes | Every 6h (cron) + on manual trigger | `model_catalog` updates, Memory V2 concepts about model capabilities, SSE `bridge:model-discovered` events |
| **Route Analyst** | Optimization agent — analyzes decision logs weekly, identifies routing inefficiencies, proposes updated routing rules | Weekly (cron) + on manual trigger | Routing rule proposals in Memory V2 (low trust, requires human approval), routing performance report |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Porter as an API proxy (re-exposing LLM APIs) | "I want to call Claude through Porter's API" | This is exactly what Porter is NOT. Porter's moat is that it does not stand between the user and their tools. If Porter proxies APIs, it becomes another LiteLLM/Portkey with higher maintenance burden and no differentiation. It also creates API key management liability | Show which CLI tool to use directly. Document CLI invocation patterns. Never expose an `/api/v1/claude/completions` endpoint |
| API key storage and management | "Store my Anthropic/OpenAI keys so I don't have to enter them" | Creates serious security liability. Keys stored in a database are a breach target. Regulatory exposure (SOC2 requirements). Each CLI tool has its own secure key management | Point users to the native auth for each CLI tool. Claude CLI has its own keychain. Codex has its own config. Never touch keys |
| Model fine-tuning via Bridge | "I want to fine-tune models through Porter" | Out of scope and enormous complexity. Fine-tuning requires different infrastructure (GPU, training pipelines) and is not what users are asking for when they ask for "model management" | Use models as-is. Prompt engineering via agent system prompts is the Porter answer to capability customization |
| Vendor-specific optimization per model | "Use Claude's system-prompt caching specifically" | Optimizing for one provider's specific API quirks creates tight coupling and maintenance burden. Porter needs to work uniformly across all backends | Implement structural caching optimizations (stable prefix ordering, context compression) that benefit all backends generically — as noted in the prompt caching research doc |
| Usage analytics per user (granular token attribution) | Enterprises want to know "user X cost $50 this week" | At current scale (single-tenant, Moe's deployment) this is overkill. Per-user attribution requires significant metering infrastructure | Per-model daily totals (already built) is sufficient. Per-user attribution belongs in the billing phase (deferred) |
| Real-time cost estimation pre-dispatch | "Tell me how much this request will cost before sending" | Token counts vary with prompt structure, and CLI tools don't expose cost APIs natively. False precision creates false trust | Show post-dispatch token counts and daily totals. Users learn cost patterns from actuals, not pre-flight estimates |
| Gateway marketplace / connector store | "Let me browse available gateways and install them" | Maintenance burden. Each connector is a support ticket when the upstream API changes | The `CLI_RUNTIME_REGISTRY` pattern is extensible by config. Adding a new backend is 1 registry entry + 1 dispatch function — no marketplace UI needed at this scale |
| Semantic caching (vector similarity matching) | Competitors like Portkey and Helicone offer semantic caching to reduce identical request costs | Requires a vector store, embedding model, and similarity threshold tuning. High infrastructure cost for Porter's VPS (2 vCPU, 8GB RAM). Portkey's semantic caching adds a $0.20 "cache miss" lookup cost on top | Implement prompt-level structural caching (stable prefix ordering, `compressContext()` already exists). Re-evaluate semantic caching when scale justifies the infrastructure |

---

## Feature Dependencies

```
Gateway Registry
    └──required by──> All routing features
    └──required by──> Bridge Operator (health monitoring target)
    └──required by──> Model Scout (discovery target)
    └──required by──> First-run setup wizard

Model Catalog
    └──requires──> Gateway Registry (per-gateway model listing)
    └──required by──> Capability-based routing
    └──required by──> Model Scout (diff against catalog)

Health Probing (persistent)
    └──requires──> Gateway Registry (targets to probe)
    └──required by──> Circuit Breaker (failure threshold input)
    └──required by──> Backend-aware tool schema filtering
    └──required by──> Bridge Operator agent

Circuit Breaker
    └──requires──> Health Probing (failure counts)
    └──required by──> Fallback chain (skip open-circuit backends)

Fallback Chain
    └──requires──> Circuit Breaker (skip open backends)
    └──requires──> Gateway Registry (ordered priority list)

Token Usage API
    └──requires──> token_usage_daily table (already exists)
    └──required by──> Route Analyst agent (cost analysis input)

Decision Log API
    └──requires──> decision_log table (already exists)
    └──required by──> Route Analyst agent (routing analysis input)

Bridge Operator Agent
    └──requires──> Gateway Registry
    └──requires──> Health Probing (persistent)
    └──requires──> Memory V2 (store reliability patterns)
    └──requires──> SSE hub (emit bridge:health events)

Model Scout Agent
    └──requires──> Gateway Registry
    └──requires──> Model Catalog
    └──requires──> Memory V2 (store capability concepts)
    └──requires──> Scheduler (cron trigger)

Route Analyst Agent
    └──requires──> Decision Log API
    └──requires──> Token Usage API
    └──requires──> Memory V2 (write routing rule proposals)
    └──requires──> Scheduler (cron trigger)
    └──requires──> Bridge Operator + Model Scout (reliability + catalog data as inputs)

Capability-based Routing
    └──requires──> Gateway Registry (strengths metadata)
    └──requires──> Model Catalog (per-model capabilities)
    └──enhances──> Routing Decision Log (richer reasoning strings)

Local Runtime Detection
    └──required by──> Gateway Registry (auto-populate on boot)
    └──required by──> First-run wizard (show what was found)

First-run Setup Wizard
    └──requires──> Local Runtime Detection
    └──requires──> Gateway Registry (display detected backends)
    └──requires──> Health Probing (validate each detected backend)
```

### Dependency Notes

- **Gateway Registry is the foundation.** Everything else reads from or writes to it. Build this first. It is the `model_gateways` table with columns: id, type (cli/local_http/remote_gateway), name, binary (for CLI), url (for HTTP), auth_method, status, last_probed_at, version, strengths[], cost_tier.
- **Local runtime detection enables zero-config onboarding.** Auto-detection must happen on boot and be visible in the first-run wizard. Detection logic is already in porter.py; TypeScript port is straightforward.
- **Circuit breaker depends on persistent health.** The current `probeBackend()` is a one-shot HEAD request. Circuit breakers need consecutive failure counts. Persistent health state (stored in `gateway_registry` or `gateway_health` table) is the prerequisite.
- **Bridge agents require the foundation layer.** Bridge Operator, Model Scout, and Route Analyst are built on top of the registry, catalog, health system, and decision log. They are not Phase 1. They are Phase 3+ once the data infrastructure is stable.
- **Route Analyst requires at least 7 days of decision log data.** Do not trigger Route Analyst until enough routing history exists for meaningful analysis.
- **Capability-based routing is a natural upgrade.** The `shouldRouteCheap()` binary heuristic is already working. Capability-based routing extends it without replacing it — keep the cost-tier fallback, add strengths-matching as an enhancement layer.

---

## MVP Definition

### Launch With (v3.0 Phase 1 — Foundation)

Minimum viable gateway that replaces the hardcoded `getBackends()` approach with a database-backed registry.

- [ ] Gateway Registry table and CRUD — model each backend as a first-class DB record
- [ ] Local runtime detection (TypeScript port) — auto-populate registry on boot
- [ ] Persistent health probing — scheduled prober writing to gateway_health, not one-shot probe
- [ ] Circuit breaker per gateway — Closed/Open/Half-Open with configurable thresholds
- [ ] Retry with exponential backoff — configurable max attempts per gateway
- [ ] Fallback chain (N backends in priority order) — replace cheap/strong binary with ordered list
- [ ] Token usage API endpoint — expose `token_usage_daily` with date range and model filters
- [ ] Decision log API endpoint — paginated, filterable by backend/date/decision_type
- [ ] `/api/v1/bridge/status` — unified health view across all registered gateways

### Add After Validation (v3.0 Phase 2 — Intelligence)

- [ ] Model Catalog — unified model list across all backends, refreshed on discovery
- [ ] Capability-based routing — strengths metadata + routing that considers agent context
- [ ] Backend-aware tool schema filtering wired to gateway health state
- [ ] First-run setup wizard integration — surface detected gateways in onboarding flow
- [ ] Direct access annotations — every dispatch result carries backend/version/model attribution

### Future Consideration (v3.0 Phase 3 — Bridge Agents)

- [ ] Bridge Operator agent — autonomous health monitoring with Memory V2 integration
- [ ] Model Scout agent — autonomous model discovery with catalog updates
- [ ] Route Analyst agent — weekly routing optimization proposals
- [ ] Preference learning — routing rule updates from Memory V2 concepts written by Route Analyst

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Gateway Registry (DB-backed) | HIGH | LOW | P1 |
| Local runtime detection | HIGH | MEDIUM | P1 |
| Persistent health probing | HIGH | LOW | P1 |
| Circuit breaker | HIGH | MEDIUM | P1 |
| Retry + exponential backoff | HIGH | LOW | P1 |
| Fallback chain (N-backend) | HIGH | LOW | P1 |
| Token usage API | MEDIUM | LOW | P1 |
| Decision log API | MEDIUM | LOW | P1 |
| Bridge status endpoint | HIGH | LOW | P1 |
| Model Catalog | HIGH | MEDIUM | P2 |
| Capability-based routing | HIGH | MEDIUM | P2 |
| Backend-aware tool filtering | MEDIUM | LOW | P2 |
| Direct access annotations | MEDIUM | LOW | P2 |
| First-run wizard integration | HIGH | MEDIUM | P2 |
| Bridge Operator agent | HIGH | HIGH | P3 |
| Model Scout agent | MEDIUM | HIGH | P3 |
| Route Analyst agent | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Required for Bridge to replace current hardcoded approach
- P2: Required for Bridge to be a first-class product feature
- P3: Bridge agents — build after data foundation is stable

---

## Competitor Feature Analysis

| Feature | LiteLLM | Portkey | Helicone | OpenRouter | Porter Bridge |
|---------|---------|---------|----------|------------|---------------|
| Multi-provider routing | Yes (100+ APIs) | Yes (1600+ LLMs) | Yes (via proxy) | Yes (marketplace) | Yes (CLI + HTTP + local) |
| Auto-discovery | No (YAML config required) | No (API keys required) | No | No | **Yes — scans PATH, probes locally** |
| CLI tool backends | No | No | No | No | **Yes — claude, codex, gemini as backends** |
| Circuit breaker | Enterprise tier | Yes | Limited | No | Yes (planned Phase 1) |
| Retry + backoff | Yes | Yes | Limited | No | Yes (planned Phase 1) |
| Cost tracking | Yes (per virtual key) | Yes (budget limits) | Yes (per request) | Yes (provider cost) | Yes (daily by model) |
| Decision log | No | Partial (audit) | Yes (observability) | No | **Yes — transparent routing rationale** |
| Model catalog | No native discovery | Model catalog | No | Browse marketplace | Yes (auto-discovered from live backends) |
| Gateway agents | No | No | No | No | **Yes — Bridge Operator, Model Scout, Route Analyst** |
| API key management | Yes (virtual keys) | Yes (managed keys) | No | Yes (managed) | **No — intentional; user owns credentials** |
| Semantic caching | Enterprise tier | Yes | Yes | No | No — intentional (VPS constraint) |
| Admin dashboard | Yes (UI) | Yes (UI) | Yes (UI) | Yes (UI) | Yes (API-first; frontend-v2 connects later) |
| Markup / proxy fee | None (self-hosted) | 0.5% on cloud | None (self-hosted) | 5% markup | **None — user calls their own tools** |

---

## Sources

- [LiteLLM proxy features and admin UI](https://docs.litellm.ai/docs/simple_proxy)
- [Portkey AI gateway features](https://portkey.ai/docs/product/ai-gateway)
- [Portkey gateway open source announcement — 1 trillion tokens/day](https://www.manilatimes.net/2026/03/25/tmt-newswire/globenewswire/portkeys-gateway-is-now-fully-open-source-processing-over-1-trillion-tokens-every-day/2306772)
- [Best enterprise LLM gateways comparison 2026](https://www.getmaxim.ai/articles/best-enterprise-llm-gateways-in-2026-a-comparative-guide/)
- [Circuit breakers and fallbacks in LLM apps](https://portkey.ai/blog/retries-fallbacks-and-circuit-breakers-in-llm-apps/)
- [Semantic caching for LLMs — cost analysis](https://www.getmaxim.ai/articles/semantic-caching-for-llms-how-to-cut-token-spend-with-ai-gateways/)
- [Top 5 LLM gateways for production 2026](https://dev.to/varshithvhegde/top-5-llm-gateways-in-2026-a-deep-dive-comparison-for-production-teams-34d2)
- [LLM gateway differentiators and architecture 2026](https://www.truefoundry.com/blog/a-definitive-guide-to-ai-gateways-in-2026-competitive-landscape-comparison/)
- [Porter cli-runtime-design-brief.md](../research/cli-runtime-design-brief.md) — PROVIDER_REGISTRY and CLI tool capabilities
- [Porter chat-latency-and-prompt-caching-notes.md](../research/chat-latency-and-prompt-caching-notes.md) — structural caching rationale
- Porter codebase: `backend/src/services/ai-router.ts` — current routing implementation

---

*Feature research for: Porter Bridge v3.0 — AI Gateway & Model Intelligence*
*Researched: 2026-03-25*
