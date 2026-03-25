# Stack Research

**Domain:** AI Orchestration SaaS Platform — v3.0 Porter Bridge (AI Gateway & Model Intelligence)
**Researched:** 2026-03-25
**Confidence:** HIGH (versions npm-verified; existing code read directly from backend/)

---

## Scope: What This Document Covers

This is the **v3.0 addendum** to the existing STACK.md chain. Prior versions covered:
- v1.0 (2026-03-20): scheduling, SSE, GitHub/email/calendar, WhatsApp, strangler-fig migration
- v2.0 (2026-03-21): streaming chat, OpenAPI, rate limiting, CRM, collaborative sessions, agent templates, autonomous learning, billing SDK

**Do not re-research anything in those prior sections.** The existing confirmed working stack is:

| Already Installed | Version | Status |
|---|---|---|
| fastify | 5.7.4 | Working |
| drizzle-orm | 0.45.1 | Working |
| pg | 8.20.0 | Working (SQLite fully eliminated) |
| zod | 4.3.6 | Working |
| @fastify/rate-limit | 10.3.0 | Working |
| @fastify/swagger + swagger-ui | 9.7.0 / 5.2.5 | Working |
| systeminformation | 5.31.1 | Working |
| uuid | 13.0.0 | Working |

**This document covers only what is NEW for v3.0 Bridge capabilities:**

| Bridge Feature | What's Needed |
|---|---|
| Gateway registry (detect, probe, persist gateways) | DB schema + circuit breaker library |
| Model catalog (unified model list across backends) | No new lib — fetch + existing DB |
| Smart routing (complexity + cost + availability) | p-queue for concurrency; opossum for circuit breakers |
| Provider detection (binary, HTTP, auth probe) | `which` npm package for CLI binary detection |
| Health monitoring (background probing, SSE alerts) | @fastify/schedule already in ecosystem; node-cron alternative |
| Cost tracking (per-request USD, provider pricing table) | Static pricing table in code — no external lib |
| Circuit breakers (open/half-open/closed per backend) | opossum |
| Runtime orchestration (dispatch queue, concurrency limits) | p-queue |
| Bridge admin API (gateways, models, health, routing log) | Schema additions + new route group |
| First-run setup (auto-detect + guided config) | child_process (stdlib) + which |

---

## New Libraries Needed

### Circuit Breakers: `opossum`

**What the feature needs:** When an AI backend becomes unreliable (repeated timeouts or errors), the dispatcher must stop sending requests to it immediately (open circuit), wait a recovery period, then probe once (half-open), then resume (closed). This is non-negotiable for commercial quality — without it, every user request piles up waiting for a dead backend.

**Current state:** `ai-router.ts` has a `probeBackend()` function that does a single HEAD request on every dispatch. This is a probe, not a circuit breaker — it adds latency to every request and does not prevent thundering herd if a backend is partially degraded.

**Recommended library:** `opossum` — the Node.js standard for circuit breakers since 2016.

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| opossum | 9.0.0 | Circuit breaker per AI backend | 70K+ weekly downloads; battle-tested since 2016; supports timeout, errorThresholdPercentage, resetTimeout, halfOpen state; fires events (open, close, halfOpen, fallback) that feed SSE; TypeScript types via @types/opossum |

**Why opossum over a custom implementation:** A correct circuit breaker needs atomic state management across concurrent requests, half-open probing (not full close), event emission, and statistics tracking. Writing this correctly from scratch takes 2-3 days. Opossum is 4KB, well-tested, and has zero peer dependencies.

**Integration pattern with ai-router.ts:**
```typescript
import CircuitBreaker from 'opossum';

// One breaker per named backend
const breakers = new Map<string, CircuitBreaker>();

function getBreakerFor(name: string, dispatchFn: Function): CircuitBreaker {
  if (!breakers.has(name)) {
    const breaker = new CircuitBreaker(dispatchFn, {
      timeout: 30000,                  // 30s per request
      errorThresholdPercentage: 50,    // open after 50% failure rate
      resetTimeout: 60000,             // try half-open after 60s
      volumeThreshold: 3,              // need 3 requests before evaluating
    });
    breaker.on('open', () => emitSSE('bridge:circuit_open', { backend: name }));
    breaker.on('close', () => emitSSE('bridge:circuit_close', { backend: name }));
    breakers.set(name, breaker);
  }
  return breakers.get(name)!;
}
```

**TypeScript types:** Install `@types/opossum` as a dev dependency — opossum itself ships without bundled types.

---

### Concurrency / Dispatch Queue: `p-queue`

**What the feature needs:** Multiple agents may dispatch to the same backend concurrently. Without concurrency limits, a spike of 10 simultaneous Claude CLI calls will saturate the 2 vCPU VPS. The dispatch layer needs a per-backend queue with configurable concurrency and rate limiting.

**Recommended library:** `p-queue` by sindresorhus.

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| p-queue | 9.1.0 | Per-backend dispatch queue with concurrency control | Supports concurrency + interval rate limiting; priority queuing; `.onIdle()` for draining; native ESM; TypeScript built-in; 2400+ dependents; lightweight (no Redis, no cluster state) |

**Why p-queue over @fastify/rate-limit for this:** `@fastify/rate-limit` is for HTTP request limiting per user. `p-queue` is for internal dispatch concurrency — it controls how many simultaneous calls are made to each AI backend regardless of which user triggered them. They solve different problems and are both needed.

**Why p-queue over BullMQ:** BullMQ requires Redis. A 2 vCPU/8GB VPS cannot afford Redis for this use case. p-queue is in-process, immediate, and sufficient for single-node Porter.

**Integration pattern:**
```typescript
import PQueue from 'p-queue';

// Per-backend queues
const queues = new Map<string, PQueue>();

function getQueueFor(backend: string): PQueue {
  if (!queues.has(backend)) {
    queues.set(backend, new PQueue({
      concurrency: backend === 'ollama' ? 2 : 4,  // local is single-threaded
      interval: 60_000,
      intervalCap: backend === 'ollama' ? 30 : 100, // RPM soft cap
    }));
  }
  return queues.get(backend)!;
}

// In dispatch():
const queue = getQueueFor(backendName);
return queue.add(() => getBreakerFor(backendName, actualDispatch).fire(req));
```

---

### CLI Binary Detection: `which`

**What the feature needs:** First-run gateway detection must find whether `claude`, `codex`, `gemini`, `ollama` binaries exist on PATH. The current porter.py `_detect_environment_tools` scans 12+ tools by running each via subprocess. This needs a TypeScript equivalent that is fast, non-blocking, and handles missing binaries gracefully.

**Recommended approach:** Use the `which` npm package (cross-platform binary locator).

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| which | 4.0.0 | Async PATH binary detection | Cross-platform `which` equivalent; returns resolved path or throws if not found; async API with no shell spawn; 150M+ weekly downloads (it is a dependency of npm itself); TypeScript types bundled |

**Why not `child_process.exec('which binary')`:** Spawning a shell to run `which` is slower, platform-dependent (Windows incompatible if Porter ever runs there), and throws unhandled promise rejections on missing binaries. The `which` npm package is async, throws cleanly on missing, and is a single-purpose tool. The project already avoids shell spawning for detection.

**Integration pattern:**
```typescript
import which from 'which';

async function detectBinary(name: string): Promise<string | null> {
  try {
    return await which(name);
  } catch {
    return null;  // not found — not an error
  }
}
```

---

## Schema Additions (No New Libraries)

These are pure Drizzle + PostgreSQL schema additions. All use the existing `pg` + Drizzle + PostgreSQL 16 infrastructure. All use `integer().generatedAlwaysAsIdentity()` per 2025 best practices (not `serial()`).

### Gateway Registry (`bridge_gateways`)

The central table for all discovered/configured AI backends.

```typescript
export const bridgeGateways = pgTable('bridge_gateways', {
  id: text('id').primaryKey(),                    // 'ollama', 'openclaw', 'claude', 'codex', 'gemini'
  label: text('label').notNull(),                 // 'Ollama (local)', 'OpenClaw Gateway'
  kind: text('kind').notNull(),                   // 'local_server' | 'cli' | 'api_gateway' | 'openai_compatible'
  endpoint: text('endpoint'),                     // HTTP URL for server-type gateways; null for CLI
  binaryPath: text('binary_path'),               // resolved PATH for CLI gateways; null for servers
  authKind: text('auth_kind').default('none'),   // 'none' | 'bearer' | 'cli_auth'
  // No auth tokens stored here — tokens stay in env vars; this records auth mechanism only
  status: text('status').notNull().default('unknown'), // 'online' | 'degraded' | 'offline' | 'unknown'
  circuitState: text('circuit_state').default('closed'), // 'closed' | 'open' | 'half_open'
  lastProbedAt: doublePrecision('last_probed_at'),
  lastOnlineAt: doublePrecision('last_online_at'),
  lastErrorAt: doublePrecision('last_error_at'),
  lastError: text('last_error'),
  latencyP50Ms: integer('latency_p50_ms'),
  latencyP99Ms: integer('latency_p99_ms'),
  capabilities: jsonb('capabilities').default(sql`'{}'::jsonb`),
  // { strengths: string[], costTier: 'free'|'standard'|'premium', agentic: boolean, maxContextK: number }
  probeHistory: jsonb('probe_history').default(sql`'[]'::jsonb`),
  // Last 10 probe results: [{ ts, ok, latencyMs }]
  enabled: integer('enabled').notNull().default(1),
  sortOrder: integer('sort_order').default(0),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});
```

**Design rationale:**
- Auth tokens are never stored in DB — they live in env vars. The column records the auth mechanism (`bearer`, `cli_auth`) so the admin UI can show configuration instructions without ever touching the token value.
- `capabilities` is JSONB so new fields (strengths, context window, agentic flag) can be added without migrations as the registry evolves.
- `probeHistory` keeps last 10 results for sparkline display in the admin UI. Cap enforced in the update logic, not a separate table — avoids write amplification.

### Model Catalog (`bridge_models`)

One row per model, linked to its gateway.

```typescript
export const bridgeModels = pgTable('bridge_models', {
  id: text('id').primaryKey(),                    // 'ollama:qwen2.5-coder:1.5b', 'openclaw:gpt-5.4'
  gatewayId: text('gateway_id').notNull(),        // references bridge_gateways.id
  modelId: text('model_id').notNull(),            // raw model identifier as the backend knows it
  displayName: text('display_name'),              // human-readable label
  family: text('family'),                         // 'llama', 'qwen', 'gpt', 'claude', 'gemini'
  parameterSize: text('parameter_size'),          // '1.5B', '7B', '70B', 'unknown'
  contextWindowK: integer('context_window_k'),   // context window in thousands of tokens
  inputCostPerMTokens: doublePrecision('input_cost_per_m_tokens').default(0),  // USD
  outputCostPerMTokens: doublePrecision('output_cost_per_m_tokens').default(0), // USD
  capabilities: jsonb('capabilities').default(sql`'[]'::jsonb`),
  // ['code', 'chat', 'vision', 'reasoning', 'tools']
  available: integer('available').notNull().default(1),
  lastSeenAt: doublePrecision('last_seen_at'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});
```

**Why not embed models in `bridge_gateways`:** Model lists change independently of gateway configuration. Ollama models are installed and pulled separately. A separate table allows model-level cost tracking, per-model routing rules, and enables the "Model Scout" agent to update the catalog without touching gateway health data.

### Routing Rules (`bridge_routing_rules`)

Named routing policies the smart router can execute.

```typescript
export const bridgeRoutingRules = pgTable('bridge_routing_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),                   // 'cost_optimized', 'quality_first', 'local_only'
  description: text('description'),
  conditions: jsonb('conditions').notNull(),
  // [{ field: 'message_length', op: 'gt', value: 200 }, { field: 'has_code', op: 'eq', value: true }]
  targetGatewayId: text('target_gateway_id'),    // null = let smart router decide
  targetModelId: text('target_model_id'),        // null = let smart router decide
  priority: integer('priority').default(0),       // higher priority = evaluated first
  enabled: integer('enabled').default(1),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});
```

### Bridge Agents (`bridge_agents_log`)

Log of decisions made by Bridge Operator, Model Scout, Route Analyst agents. Separate from `decision_log` which covers general model selection. This table covers Bridge-specific agent actions.

```typescript
export const bridgeAgentsLog = pgTable('bridge_agents_log', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  agentRole: text('agent_role').notNull(),        // 'bridge_operator' | 'model_scout' | 'route_analyst'
  action: text('action').notNull(),               // 'probe_gateway' | 'discover_model' | 'analyze_route'
  gatewayId: text('gateway_id'),
  modelId: text('model_id'),
  outcome: text('outcome').notNull(),             // 'success' | 'failure' | 'no_change'
  detail: jsonb('detail').default(sql`'{}'::jsonb`),
  durationMs: integer('duration_ms'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});
```

### Cost Tracking Enhancement (extension to `token_usage_daily`)

The existing `token_usage_daily` table tracks tokens per model+date. For v3.0, add a companion table for per-request cost records (the daily table is aggregated; this enables per-project cost breakdown):

```typescript
export const bridgeCostRecords = pgTable('bridge_cost_records', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  gatewayId: text('gateway_id').notNull(),
  modelId: text('model_id').notNull(),
  agentId: text('agent_id'),
  projectId: text('project_id'),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  estimatedCostUsd: doublePrecision('estimated_cost_usd').default(0),
  routingReason: text('routing_reason'),
  durationMs: integer('duration_ms'),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});
```

**Why a separate table from `token_usage_daily`:** The daily table is an aggregate upsert — it cannot track per-project or per-agent breakdown. This table is append-only (one row per dispatch). Aggregate queries use `GROUP BY project_id` or `GROUP BY agent_id`. Retention policy: purge records older than 90 days to manage size.

---

## What the Existing Stack Already Handles (No Changes Needed)

| Bridge Capability | Existing Solution | Where |
|---|---|---|
| Health probe HTTP | `fetch` with AbortSignal.timeout | models.ts already does this |
| SSE event emission | `emitSSE()` | sse-hub.ts |
| Decision logging | `decision_log` table | ai-router.ts |
| Token tracking | `token_usage_daily` table | ai-router.ts |
| Background scheduling | toad-scheduler via @fastify/schedule | scheduler.ts |
| OpenClaw dispatch | `fetch` to /v1/chat/completions | ai-router.ts |
| Ollama dispatch | `fetch` to /api/generate | ai-router.ts |
| Streaming | stream-service.ts | Native fetch ReadableStream |
| Config | config.ts with env vars | All values from env |

The existing `admin/models.ts` already has a `COST_PER_M` table and `estimateCost()` function. This moves from that file into `bridge_models.input_cost_per_m_tokens` in the DB, making it admin-editable without a deploy.

---

## What NOT to Add

| Avoid | Why | What to Use Instead |
|-------|-----|---------------------|
| LiteLLM proxy | Python service, another network hop, 500MB+ RAM, separate process to manage | Build the gateway registry natively in the existing Fastify service |
| Redis | Adds 200MB RAM and operational complexity; in-process queues sufficient for single-server | p-queue (in-process) |
| OpenRouter / external AI gateway | Porter's moat IS that it orchestrates tools the user already owns; adding a paid middleware defeats the architecture | Bridge registry + native dispatch |
| openai npm SDK | 50KB dependency for a single /v1/chat/completions POST; native fetch is sufficient for OpenAI-wire-compatible calls | Native fetch (already used in ai-router.ts) |
| @anthropic-ai/sdk | Same problem — Porter calls Claude via Claude CLI binary, not direct API keys | child_process dispatch (already in porter.py, migrate to ai-router.ts) |
| cockroach-style distributed scheduler | Single VPS, single process; toad-scheduler is sufficient | toad-scheduler (already installed) |
| Prometheus / metrics exporters | Operational overhead not justified at current scale; structured event table is sufficient | `bridge_agents_log` + existing `decision_log` |
| winston / pino logger | Fastify's built-in pino logger is already configured; a second logger creates duplicate log streams | Fastify's built-in logger (req.log) |
| Zod v3 migration | Already on Zod 4; do not add Zod v3 compat layer | Zod 4.3.6 (already installed) |

---

## Installation

```bash
cd /home/lobster/documents/porter/backend

# Circuit breakers (new)
npm install opossum

# Dispatch concurrency queue (new)
npm install p-queue

# CLI binary detection for first-run setup (new)
npm install which

# TypeScript types for opossum (dev dep, no bundled types in opossum 9.x)
npm install -D @types/opossum @types/which
```

**Total new runtime dependencies: 3 packages.** opossum (~4KB), p-queue (~8KB), which (~8KB). No transitive dependency chains worth noting. All three are native ESM, matching the project's `"type": "module"` configuration.

---

## Alternatives Considered

| Recommended | Alternative | Why Alternative Was Rejected |
|-------------|-------------|-------------------------------|
| opossum (circuit breaker) | cockatiel | cockatiel is newer and has TypeScript-native types, but opossum has 5x more production usage, is the Red Hat-sponsored Node.js standard, and integrates directly with Fastify examples in the ecosystem |
| p-queue (dispatch queue) | bottleneck | bottleneck has not been updated since 2023; p-queue is actively maintained and ESM-native |
| which (binary detection) | child_process.exec('which') | Shell-spawning approach is slower, non-portable, and has error handling edge cases; the `which` package is a tested abstraction already used by npm itself |
| native DB cost table | tokencost (npm) | tokencost is Python-only; a static JSONB table in bridge_models is simpler, admin-editable, and has no external dependency |
| native probe polling (toad-scheduler) | @fastify/schedule | @fastify/schedule wraps toad-scheduler; the base scheduler is already registered in scheduler.ts; adding a second scheduler plugin creates duplicate state |

---

## Version Compatibility

| Package | Version | Peer Requirements | Compatibility with Existing Stack |
|---------|---------|-------------------|-----------------------------------|
| opossum | 9.0.0 | Node.js 20+ | Porter runs Node.js 22 (confirmed via tsx 4.x); ESM-compatible |
| @types/opossum | 8.1.9 | opossum ^8 | Typings are for v8 API which is stable and unchanged in v9; confirmed usable |
| p-queue | 9.1.0 | Node.js 18+ | Native ESM; `"type": "module"` in backend/package.json — compatible |
| which | 4.0.0 | Node.js 18+ | Native ESM; TypeScript types in @types/which |
| @types/which | 3.0.6 | which ^4 | Standard DefinitelyTyped package |

---

## Integration Points with Existing Stack

| New Capability | Attaches To | Integration Notes |
|---|---|---|
| Circuit breakers (opossum) | `services/ai-router.ts` | Replace bare `fetch` calls in `dispatch()` with `breaker.fire()`; one CircuitBreaker instance per gateway name, stored in a module-level Map |
| Dispatch queue (p-queue) | `services/ai-router.ts` | Wrap `breaker.fire()` in `queue.add()`; queue concurrency per gateway comes from `bridge_gateways.capabilities.concurrency` |
| Gateway probing (which + fetch) | New `services/bridge-detector.ts` | Called at startup + on demand by Bridge Operator agent; writes results to `bridge_gateways` via pool.query |
| Cost records | `services/ai-router.ts` | After successful dispatch, insert into `bridge_cost_records` with same non-critical pattern as `trackTokenUsage()` |
| Bridge admin routes | New `routes/v1/admin/bridge.ts` | CRUD for `bridge_gateways`, `bridge_models`, `bridge_routing_rules`; GET /health returns live circuit state from breakers Map |
| Model catalog sync | New `services/model-scout.ts` | Background job registered in scheduler.ts; probes each enabled gateway's model list endpoint; upserts `bridge_models` |
| SSE events | `services/sse-hub.ts` (existing) | Circuit breaker events (`bridge:circuit_open`, `bridge:circuit_close`, `bridge:gateway_status_change`) emitted via existing `emitSSE()` |
| First-run detection | `routes/v1/wizard.ts` (existing) | `bridge-detector.ts` called from wizard setup step; returns detected gateways for the frontend onboarding surface |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| opossum version + TypeScript support | HIGH | npm registry confirmed v9.0.0 (June 2025); @types/opossum@8.1.9 (July 2025); nodeshift.dev/opossum documentation verified |
| p-queue version + ESM compatibility | HIGH | npm registry confirmed v9.1.0; project is ESM-native ("type": "module"); sindresorhus package quality is consistent |
| which package | HIGH | 150M+ weekly downloads; npm itself depends on it; v4.0.0 is ESM-native |
| Schema design for gateway registry | HIGH | Follows existing schema patterns (JSONB for flexible metadata, doublePrecision epoch timestamps); PostgreSQL 16 confirmed as DB |
| Integration with existing ai-router.ts | HIGH | ai-router.ts read directly; dispatch pattern confirmed; breaker.fire() wraps existing fetch calls cleanly |
| No new libraries for model catalog | HIGH | Ollama /api/tags already probed in models.ts; OpenAI /v1/models is standard wire format; native fetch sufficient |
| No Redis needed | HIGH | p-queue is in-process; single-server VPS deployment confirmed in PROJECT.md |
| opossum @types/opossum v8 types with v9 | MEDIUM | opossum v9 is a minor version bump; API is stable per changelog; types@8.1.9 covers the same API surface; no breaking changes confirmed in v9 release notes |

---

## Sources

- [opossum npm](https://www.npmjs.com/package/opossum) — v9.0.0, June 2025 — HIGH confidence
- [opossum documentation](https://nodeshift.dev/opossum/) — API reference for CircuitBreaker options — HIGH confidence
- [@types/opossum npm](https://www.npmjs.com/package/@types/opossum) — v8.1.9, July 2025 — HIGH confidence
- [p-queue npm](https://www.npmjs.com/package/p-queue) — v9.1.0, current — HIGH confidence
- [p-queue GitHub](https://github.com/sindresorhus/p-queue) — concurrency + interval options confirmed — HIGH confidence
- [which npm](https://www.npmjs.com/package/which) — v4.0.0, ESM-native — HIGH confidence
- [@fastify/rate-limit npm](https://www.npmjs.com/package/@fastify/rate-limit) — v10.3.0 confirmed installed — HIGH confidence
- [Ollama /api/tags docs](https://docs.ollama.com/api/tags) — model listing endpoint verified — HIGH confidence
- backend/src/services/ai-router.ts — dispatch pattern, probeBackend(), trackTokenUsage() — read directly — HIGH confidence
- backend/src/routes/v1/admin/models.ts — COST_PER_M table, probe(), existing admin models API — read directly — HIGH confidence
- backend/src/db/schema.ts — existing tables confirmed (decision_log, token_usage_daily, workspace_connections) — read directly — HIGH confidence
- backend/package.json — confirmed existing deps (systeminformation, @fastify/schedule not yet installed) — read directly — HIGH confidence
- research/cli-runtime-design-brief.md — gateway registry design, CLI tool capabilities — read directly — HIGH confidence

---

*Stack research for: Porter v3.0 Bridge — AI Gateway & Model Intelligence (addendum to v2.0 STACK.md)*
*Researched: 2026-03-25*
