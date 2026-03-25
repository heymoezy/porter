# Requirements: Porter v3.0 Bridge — AI Gateway & Model Intelligence

**Defined:** 2026-03-25
**Core Value:** Every AI backend is visible, manageable, and intelligently routed — nothing hidden, everything in the database.

## v3.0 Requirements

### Gateway Registry

- [x] **GW-01**: Gateway table in PostgreSQL stores all AI backends with type, URL, auth method, health status, priority, and metadata
- [x] **GW-02**: Background health probe runs every 30s via scheduler, updates gateway status in DB, emits SSE events on state changes
- [x] **GW-03**: Auto-detection on startup finds Ollama, OpenClaw, Codex CLI, Claude CLI, Gemini CLI from PATH and registers them
- [x] **GW-04**: Circuit breaker per gateway (opossum) with Closed/Open/Half-Open states, configurable thresholds, SSE events on trips
- [x] **GW-05**: Retry with exponential backoff for transient errors (429, 503), separate from circuit breaker logic
- [x] **GW-06**: Fallback chain — N gateways in priority order, not just binary cheap/strong
- [x] **GW-07**: API key masking — keys stored encrypted, never returned in full after initial save
- [x] **GW-08**: Config migration — env vars (OLLAMA_URL etc.) bootstrap on first run, DB authoritative after that, env as fallback

### Model Catalog

- [x] **MOD-01**: Models table in PostgreSQL with gateway_id, model name, capabilities, context window, pricing (input/output per M tokens), benchmarks
- [x] **MOD-02**: Auto-population — query each gateway for available models on detection and periodic refresh (daily)
- [x] **MOD-03**: Capability-based routing — route by model strengths (coding, writing, analysis, vision) not just cost tier
- [x] **MOD-04**: Model version tracking — detect when models update, store version history, log which version was used per dispatch
- [x] **MOD-05**: Cost tracking per-dispatch — input tokens, output tokens, cached tokens, cost in USD logged per request to bridge_dispatch_log

### Smart Routing

- [x] **RT-01**: Replace hardcoded getBackends() with DB-driven gateway+model selection
- [x] **RT-02**: Routing rules table — operator-configurable overrides (force model for agent, cap cost per project, etc.)
- [x] **RT-03**: Transparent decision logging — every routing decision logged with reason, alternatives considered, cost estimate
- [x] **RT-04**: Dispatch concurrency control — per-backend queue (p-queue) prevents VPS saturation under concurrent agent load
- [x] **RT-05**: Session routing context — which model handled which conversation, routing decisions per chat session tied to Brain

### CLI Adapters

- [x] **CLI-01**: GatewayAdapter interface — typed contract all backends implement (detect, health, dispatch, stream, listModels)
- [x] **CLI-02**: Ollama adapter — wraps existing native API calls, implements GatewayAdapter
- [x] **CLI-03**: OpenClaw adapter — wraps existing OpenAI-compatible calls, implements GatewayAdapter
- [x] **CLI-04**: Codex CLI adapter — subprocess dispatch with stdin/stdout streaming, error handling, timeout
- [x] **CLI-05**: Claude CLI adapter — subprocess dispatch with -p flag, streaming output parsing
- [x] **CLI-06**: Gemini CLI adapter — subprocess dispatch, output parsing, model detection
- [x] **CLI-07**: Stream normalizer — converts all adapter output formats to unified AsyncIterable<string>

### First-Run Setup

- [x] **FRS-01**: Detection endpoint returns all discovered gateways with connection status and available models
- [x] **FRS-02**: Guided setup API — step-by-step: detect local → prompt for API keys → validate connections → save to DB
- [x] **FRS-03**: Zero-config path — if Ollama is running locally, Bridge works immediately with no user action
- [x] **FRS-04**: OpenClaw integration — detect OpenClaw gateway, use for messaging (WhatsApp/Telegram) and as multi-model fallback

### Admin Surface (Backend APIs)

- [x] **ADM-01**: GET /api/admin/bridge — gateway cards with live health, latency, uptime, model count per gateway
- [x] **ADM-02**: GET /api/admin/bridge/models — unified model catalog across all gateways with capabilities and pricing
- [x] **ADM-03**: GET /api/admin/bridge/dispatch-log — paginated routing decision log with model, reason, cost, latency
- [x] **ADM-04**: GET /api/admin/bridge/costs — spend by gateway, by model, by day, with configurable date ranges
- [x] **ADM-05**: POST /api/admin/bridge/gateways — add/update/remove gateways, validate connections
- [x] **ADM-06**: POST /api/admin/bridge/routing-rules — create/update routing rule overrides
- [x] **ADM-07**: SSE events for bridge:health, bridge:dispatch, bridge:circuit-trip — real-time admin updates

### Brain & Recall Integration

- [x] **INT-01**: Routing decisions feed into Memory V3 — agents learn which models work best for which task types
- [x] **INT-02**: Bridge dispatch log queryable by agent_id — "what model did this agent use and how did it perform?"
- [x] **INT-03**: Session routing history — per-conversation record of which models were used, enabling context-aware re-routing
- [x] **INT-04**: Bridge status visible in Brain health dashboard — gateway health is part of system health

### Design System Compliance

- [x] **DS-01**: All Bridge admin UI components created as design system components first, then consumed — no freestyle
- [x] **DS-02**: Agent-ready layout — activity feeds, status cards, briefing slots designed for future Bridge agents
- [x] **DS-03**: Bridge admin page follows existing admin shell, nav style, theme toggle — same patterns as forge/users/models pages

### Multi-Tenant (SaaS)

- [x] **MT-01**: Per-user API key storage — each user can bring their own keys for direct provider access
- [x] **MT-02**: Per-workspace gateway overrides — workspace admin can configure which gateways are available
- [x] **MT-03**: Usage attribution — token costs attributed to user/project/agent for billing integration

## v4.0 Requirements (Deferred)

- **AGENT-01**: Bridge Operator agent — autonomous health monitoring, failover decisions
- **AGENT-02**: Model Scout agent — autonomous model discovery, catalog maintenance
- **AGENT-03**: Route Analyst agent — weekly routing optimization proposals from decision log data
- **AGENT-04**: Preference learning — routing weight auto-updates from accumulated decision history
- **AGENT-05**: Semantic caching — vector-based response caching (requires more hardware)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Agent forging for Bridge agents | Forge runs system-wide at launch — not per-milestone |
| Porter as API proxy | Defeats product philosophy — orchestrate tools users own |
| LiteLLM/external gateway proxy | Python dependency, separate process, defeats architecture |
| Redis for queuing | p-queue sufficient for single-server deployment |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| GW-01 | Phase 16: Gateway Foundation | Complete |
| GW-02 | Phase 18: Resilience Layer | Complete |
| GW-03 | Phase 16: Gateway Foundation | Complete |
| GW-04 | Phase 18: Resilience Layer | Complete |
| GW-05 | Phase 18: Resilience Layer | Complete |
| GW-06 | Phase 18: Resilience Layer | Complete |
| GW-07 | Phase 16: Gateway Foundation | Complete |
| GW-08 | Phase 16: Gateway Foundation | Complete |
| MOD-01 | Phase 19: Model Catalog | Complete |
| MOD-02 | Phase 19: Model Catalog | Complete |
| MOD-03 | Phase 19: Model Catalog | Complete |
| MOD-04 | Phase 19: Model Catalog | Complete |
| MOD-05 | Phase 19: Model Catalog | Complete |
| RT-01 | Phase 20: Smart Routing Engine | Complete |
| RT-02 | Phase 20: Smart Routing Engine | Complete |
| RT-03 | Phase 20: Smart Routing Engine | Complete |
| RT-04 | Phase 20: Smart Routing Engine | Complete |
| RT-05 | Phase 20: Smart Routing Engine | Complete |
| CLI-01 | Phase 16: Gateway Foundation | Complete |
| CLI-02 | Phase 17: Provider Adapters | Complete |
| CLI-03 | Phase 17: Provider Adapters | Complete |
| CLI-04 | Phase 17: Provider Adapters | Complete |
| CLI-05 | Phase 17: Provider Adapters | Complete |
| CLI-06 | Phase 17: Provider Adapters | Complete |
| CLI-07 | Phase 17: Provider Adapters | Complete |
| FRS-01 | Phase 21: First-Run Setup | Complete |
| FRS-02 | Phase 21: First-Run Setup | Complete |
| FRS-03 | Phase 21: First-Run Setup | Complete |
| FRS-04 | Phase 21: First-Run Setup | Complete |
| ADM-01 | Phase 22: Bridge Admin Surface | Complete |
| ADM-02 | Phase 22: Bridge Admin Surface | Complete |
| ADM-03 | Phase 22: Bridge Admin Surface | Complete |
| ADM-04 | Phase 22: Bridge Admin Surface | Complete |
| ADM-05 | Phase 22: Bridge Admin Surface | Complete |
| ADM-06 | Phase 22: Bridge Admin Surface | Complete |
| ADM-07 | Phase 22: Bridge Admin Surface | Complete |
| DS-01 | Phase 22: Bridge Admin Surface | Complete |
| DS-02 | Phase 22: Bridge Admin Surface | Complete |
| DS-03 | Phase 22: Bridge Admin Surface | Complete |
| INT-01 | Phase 23: Integration & Multi-Tenant | Complete |
| INT-02 | Phase 23: Integration & Multi-Tenant | Complete |
| INT-03 | Phase 23: Integration & Multi-Tenant | Complete |
| INT-04 | Phase 23: Integration & Multi-Tenant | Complete |
| MT-01 | Phase 23: Integration & Multi-Tenant | Complete |
| MT-02 | Phase 23: Integration & Multi-Tenant | Complete |
| MT-03 | Phase 23: Integration & Multi-Tenant | Complete |

**Coverage:**
- v3.0 requirements: 46 total (8 GW + 5 MOD + 5 RT + 7 CLI + 4 FRS + 7 ADM + 4 INT + 3 DS + 3 MT)
- Mapped to phases: 46/46
- Unmapped: 0

---
*Requirements defined: 2026-03-25*
*Traceability updated: 2026-03-25 (roadmap phases 16-23)*
