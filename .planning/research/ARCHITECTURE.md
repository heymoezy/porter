# Architecture Research

**Domain:** Porter Bridge — AI Gateway Layer (v3.0)
**Researched:** 2026-03-25
**Confidence:** HIGH (all findings from direct source-code inspection)

---

## v3.0 Bridge — Gateway Integration Architecture

This section supersedes and extends the v2.0 architecture below. The Bridge layer
integrates with — not replaces — the existing ai-router/stream-service/config stack.

---

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        API Layer  (:3001)                                     │
│  ┌─────────────────┐  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ /api/v1/chat    │  │/api/v1/agents │  │/api/bridge/* │  │ /api/v1/sse  │  │
│  │ (existing)      │  │ (existing)    │  │ (new)        │  │ (existing)   │  │
│  └────────┬────────┘  └──────┬────────┘  └──────┬───────┘  └──────┬───────┘  │
└───────────┼───────────────────┼────────────────────┼────────────────┼──────────┘
            │                   │                    │                │
┌───────────┼───────────────────┼────────────────────┼────────────────┼──────────┐
│           ▼     BRIDGE LAYER  (new)                ▼                │          │
│  ┌────────────────────────────────────────────────────┐             │          │
│  │           bridge/bridge-router.ts                  │             │          │
│  │  ┌─────────────────────┐  ┌─────────────────────┐  │             │          │
│  │  │  GatewayRegistry    │  │   RoutingEngine      │  │             │          │
│  │  │  (DB-backed, reads  │  │  (rules + heuristic) │  │             │          │
│  │  │   gateways table)   │  │  delegates to        │  │             │          │
│  │  └──────────┬──────────┘  │  shouldRouteCheap()  │  │             │          │
│  │             │             │  for backward compat │  │             │          │
│  │             │             └──────────┬───────────┘  │             │          │
│  │             │                        │              │             │          │
│  │  ┌──────────▼────────────────────────▼───────────┐  │             │          │
│  │  │           BridgeDispatcher                    │  │             │          │
│  │  │  select() → adapter.dispatch/stream()         │  │             │          │
│  │  │  logBridgeDispatch() → bridge_dispatch_log    │  │             │          │
│  │  │  emitSSE(bridge:*)                            │  │             │          │
│  │  └──────────────────────────┬────────────────────┘  │             │          │
│  └─────────────────────────────┼──────────────────────┘             │          │
└────────────────────────────────┼────────────────────────────────────┼──────────┘
                                 │                                     │
┌────────────────────────────────┼─────────────────────────────────────┼──────────┐
│                   ADAPTERS     │                                      │          │
│  ┌──────────────┐  ┌───────────┴──────┐  ┌─────────────┐  ┌─────────┴────────┐  │
│  │OllamaAdapter │  │OpenClawAdapter   │  │CodexCLIAdapt│  │ClaudeAdapter     │  │
│  │wraps existing│  │wraps existing    │  │(new) spawn  │  │(new) spawn       │  │
│  │stream-service│  │stream-service    │  │codex binary │  │claude binary     │  │
│  └──────┬───────┘  └──────────┬───────┘  └──────┬──────┘  └────────┬─────────┘  │
│         │                     │                  │                  │             │
│  ┌──────┴─────────────────────┴──────────────────┴──────────────────┴──────────┐  │
│  │         StreamNormalizer — unified AsyncIterable<string>                    │  │
│  │   Ollama NDJSON | OpenAI SSE | Codex JSONL | Claude JSON                   │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼─────────────────────────────────────────────────┐
│                   DATA LAYER (PostgreSQL 16)                                       │
│  ┌───────────────┐  ┌────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │  gateways     │  │   models       │  │  routing_rules   │  │bridge_dispatch │  │
│  │  (new)        │  │  (new)         │  │  (new)           │  │  _log (new)    │  │
│  └───────────────┘  └────────────────┘  └──────────────────┘  └────────────────┘  │
│  ┌───────────────┐  ┌────────────────┐  ┌──────────────────┐                      │
│  │ decision_log  │  │token_usage_    │  │ agent_jobs,      │                      │
│  │ (existing)    │  │daily (existing)│  │ agent_activity   │                      │
│  │               │  │                │  │ (existing)       │                      │
│  └───────────────┘  └────────────────┘  └──────────────────┘                      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `bridge/bridge-router.ts` | Top-level public API: `bridgeDispatch()`, `bridgeStream()` — replaces direct calls to `aiRouterDispatch()` in routes | GatewayRegistry, RoutingEngine, BridgeDispatcher |
| `bridge/gateway-registry.ts` | Reads `gateways` table, maintains in-memory health cache (TTL 30s), exposes `getAvailable()` | PostgreSQL, adapters (for probing) |
| `bridge/routing-engine.ts` | Evaluates `routing_rules` rows, delegates to `shouldRouteCheap()` for heuristic fallback, returns `{ gateway, model, reason, rule_matched }` | GatewayRegistry, models table |
| `bridge/startup-detector.ts` | On Fastify boot: probe PATH + HTTP, upsert `gateways` + `models`, set `detected_by='startup'` | config.ts (seed URLs), PostgreSQL, adapters |
| `bridge/adapters/ollama.ts` | Wraps `OllamaStreamBackend` and Ollama dispatch logic from ai-router | Existing stream-service.ts |
| `bridge/adapters/openclaw.ts` | Wraps `OpenClawStreamBackend` and OpenClaw dispatch logic from ai-router | Existing stream-service.ts |
| `bridge/adapters/codex-cli.ts` | Spawns `codex exec --json --ephemeral`, parses JSONL events | codex binary |
| `bridge/adapters/claude-cli.ts` | Spawns `claude -p --output-format json`, parses JSON output | claude binary |
| `bridge/stream-normalizer.ts` | Translates all adapter outputs to unified `AsyncIterable<string>` | All adapters |
| `services/ai-router.ts` | UNCHANGED — remains as adapter internals | Not modified |
| `services/stream-service.ts` | UNCHANGED — wrapped by adapters | Not modified |
| `services/config.ts` | UNCHANGED — seeds startup detector, not the runtime registry | Not modified |

**Critical constraint:** `ai-router.ts` and `stream-service.ts` are read-only during Bridge build.
All 35 Playwright tests that rely on their exports continue to pass without modification.

---

### Recommended Project Structure

```
backend/src/
├── services/
│   ├── ai-router.ts              (existing — UNCHANGED, wrapped by adapters)
│   ├── stream-service.ts         (existing — UNCHANGED, wrapped by adapters)
│   ├── sse-hub.ts                (existing — UNCHANGED)
│   ├── scheduler.ts              (existing — add one bridge health tick call)
│   │
│   └── bridge/                   (new directory — all Bridge code)
│       ├── index.ts               (re-exports: bridgeDispatch, bridgeStream, getGatewayStatus)
│       ├── bridge-router.ts       (select gateway + model, delegate to dispatcher)
│       ├── gateway-registry.ts    (DB read + health cache)
│       ├── routing-engine.ts      (rule eval + heuristic fallback)
│       ├── startup-detector.ts    (boot-time probe + DB upsert)
│       ├── adapters/
│       │   ├── interface.ts       (GatewayAdapter interface definition)
│       │   ├── ollama.ts          (wraps existing OllamaStreamBackend)
│       │   ├── openclaw.ts        (wraps existing OpenClawStreamBackend)
│       │   ├── codex-cli.ts       (new subprocess adapter)
│       │   └── claude-cli.ts      (new subprocess adapter)
│       └── stream-normalizer.ts   (unified AsyncIterable<string>)
│
├── db/
│   ├── schema.ts                  (existing — add new table definitions here)
│   └── migrate-bridge.ts          (new migration — Bridge tables)
│
└── routes/v1/
    └── bridge.ts                  (new route file — gateway CRUD, models, rules, log)
```

---

### New PostgreSQL Tables

#### `gateways`

Registry of all known AI backends. One row per configured gateway instance.

```sql
CREATE TABLE IF NOT EXISTS gateways (
  id              TEXT PRIMARY KEY,
  -- 'ollama-local', 'openclaw-main', 'codex-cli', 'claude-cli'
  name            TEXT NOT NULL,
  -- Human label: 'Ollama (Local)', 'OpenClaw Gateway'
  provider        TEXT NOT NULL,
  -- 'ollama' | 'openclaw' | 'codex' | 'claude' | 'gemini'
  gateway_type    TEXT NOT NULL DEFAULT 'http',
  -- 'http' | 'cli' | 'grpc'
  base_url        TEXT,
  -- http gateways: 'http://127.0.0.1:11434'. NULL for CLI gateways.
  binary_path     TEXT,
  -- CLI gateways: resolved binary path from PATH. NULL for HTTP.
  auth_kind       TEXT NOT NULL DEFAULT 'none',
  -- 'none' | 'bearer' | 'env_var' | 'cli_auth'
  auth_ref        TEXT,
  -- Name of the env var holding the token (e.g. 'OPENCLAW_TOKEN').
  -- Never the token itself. Adapter reads process.env[auth_ref] at dispatch time.
  status          TEXT NOT NULL DEFAULT 'unknown',
  -- 'online' | 'offline' | 'degraded' | 'unknown'
  last_probe_at   DOUBLE PRECISION,
  last_probe_ms   INTEGER,
  probe_error     TEXT,
  priority        INTEGER NOT NULL DEFAULT 50,
  -- Lower = preferred when capability is tied between gateways
  enabled         INTEGER NOT NULL DEFAULT 1,
  detected_by     TEXT NOT NULL DEFAULT 'manual',
  -- 'startup' | 'manual' | 'api'
  version_string  TEXT,
  -- From --version probe (CLI) or /version endpoint (HTTP)
  created_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
);
```

#### `models`

Unified model catalog. Populated by adapters during gateway detection and health ticks.

```sql
CREATE TABLE IF NOT EXISTS models (
  id              TEXT PRIMARY KEY,
  -- Composite: 'ollama/qwen2.5-coder:1.5b', 'openclaw/gpt-5.4'
  gateway_id      TEXT NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  model_name      TEXT NOT NULL,
  -- Raw name: 'qwen2.5-coder:1.5b', 'gpt-5.4'
  display_name    TEXT,
  -- Human label: 'Qwen 2.5 Coder 1.5B'
  provider_family TEXT,
  -- 'openai' | 'anthropic' | 'google' | 'qwen' | 'unknown'
  cost_tier       TEXT NOT NULL DEFAULT 'unknown',
  -- 'free' | 'standard' | 'premium'
  context_window  INTEGER,
  -- Max context tokens
  strengths       JSONB DEFAULT '[]',
  -- ['coding', 'reasoning', 'analysis', 'multimodal']
  capabilities    JSONB DEFAULT '{}',
  -- {'streaming': true, 'tools': false, 'vision': false}
  is_agentic      INTEGER DEFAULT 0,
  -- 1 if model can use tools / read-write files
  is_default      INTEGER DEFAULT 0,
  -- 1 = default model for this gateway
  enabled         INTEGER DEFAULT 1,
  size_bytes      BIGINT,
  -- Local models only (Ollama): disk size
  benchmark_score INTEGER,
  -- 0-100 composite; set by forge pipeline or manual entry
  last_seen_at    DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
  created_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
);
```

#### `routing_rules`

Operator-configurable rules that override the default complexity heuristic.
Evaluated in `priority ASC` order; first match wins.

```sql
CREATE TABLE IF NOT EXISTS routing_rules (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  rule_type       TEXT NOT NULL,
  -- 'complexity'     — based on message length/keywords
  -- 'cost_cap'       — route cheap when plan budget is near limit
  -- 'capability'     — route to gateway with required capability
  -- 'agent_affinity' — honour persona.preferred_backend
  condition_json  JSONB NOT NULL DEFAULT '{}',
  -- complexity:     { "max_length": 160, "keyword_patterns": [] }
  -- cost_cap:       { "cost_tier": "free" }
  -- capability:     { "required": ["tools", "vision"] }
  -- agent_affinity: { "agent_id": "uuid" }
  target_gateway  TEXT REFERENCES gateways(id),
  target_model    TEXT REFERENCES models(id),
  -- Either or both can be set; NULL means "best available"
  priority        INTEGER NOT NULL DEFAULT 50,
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_by      TEXT,
  created_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
);
```

#### `bridge_dispatch_log`

Per-request dispatch record. More granular than `decision_log`
(which records abstract routing decisions). Feeds the cost and latency dashboards.

```sql
CREATE TABLE IF NOT EXISTS bridge_dispatch_log (
  id                TEXT PRIMARY KEY,
  -- UUID generated at dispatch start
  gateway_id        TEXT REFERENCES gateways(id),
  model_id          TEXT REFERENCES models(id),
  agent_id          TEXT,
  -- references personas.id — NULL for direct chat dispatches
  project_id        TEXT,
  job_id            TEXT,
  -- references agent_jobs.id — NULL for interactive dispatches
  chat_id           TEXT,
  dispatch_type     TEXT NOT NULL DEFAULT 'chat',
  -- 'chat' | 'stream' | 'agent_job' | 'forge'
  status            TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'completed' | 'failed' | 'cancelled'
  routing_reason    TEXT,
  -- Human-readable: 'cheap model selected (simple message)'
  rule_matched      INTEGER,
  -- routing_rules.id of the rule that fired; NULL = heuristic
  prompt_tokens     INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens      INTEGER DEFAULT 0,
  cost_usd          DOUBLE PRECISION DEFAULT 0,
  duration_ms       INTEGER,
  streamed          INTEGER DEFAULT 0,
  -- 1 = was a streaming dispatch
  error             TEXT,
  started_at        DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
  completed_at      DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_bridge_dispatch_started
  ON bridge_dispatch_log(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_bridge_dispatch_gateway
  ON bridge_dispatch_log(gateway_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_bridge_dispatch_agent
  ON bridge_dispatch_log(agent_id, started_at DESC);
```

**Relationship to existing tables:**
- `token_usage_daily` (existing) continues daily aggregation — Bridge writes to it via the
  existing `trackTokenUsage()` function, unchanged
- `bridge_dispatch_log` provides per-request detail for admin cost/latency views
- `decision_log` (existing) continues recording abstract model-selection decisions —
  Bridge calls `logDecision()` as before, just with richer context

---

### How Bridge Wraps ai-router.ts

The integration follows a **delegation + wrapping** pattern. Bridge is the new external API.
ai-router.ts becomes an internal implementation detail of two adapters.

```
BEFORE v3:
  route handler → aiRouterDispatch(req) → Ollama or OpenClaw

AFTER v3:
  route handler → bridgeDispatch(req)
                    → GatewayRegistry.getAvailable()
                    → RoutingEngine.select()
                    → OllamaAdapter.dispatch()  (wraps ai-router Ollama path)
                    → OpenClawAdapter.dispatch() (wraps ai-router OpenClaw path)
                    → CodexCLIAdapter.dispatch() (new)
                    → ClaudeAdapter.dispatch()   (new)
```

Adapter wrapping example (ollama):

```typescript
// bridge/adapters/ollama.ts
import { OllamaStreamBackend } from '../../stream-service.js';  // existing, not modified
import { config } from '../../config.js';                        // existing, not modified

export class OllamaAdapter implements GatewayAdapter {
  readonly gatewayType = 'http' as const;

  async dispatch(req: BridgeRequest): Promise<BridgeResult> {
    // Exact same fetch logic as ai-router.dispatch() Ollama branch,
    // but receives gateway URL from req.gateway.base_url (DB-sourced)
    // rather than config.ollamaUrl (hardcoded env var)
    const resp = await fetch(`${req.gateway.base_url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: req.model.model_name, prompt: req.message, stream: false }),
    });
    const data = await resp.json() as { response: string; eval_count?: number };
    return { response: data.response, tokensUsed: data.eval_count };
  }

  async *stream(req: BridgeRequest, signal: AbortSignal): AsyncIterable<string> {
    // Delegates directly to existing OllamaStreamBackend — zero duplication
    const backend = new OllamaStreamBackend();
    yield* backend.stream(req.message, signal);
  }

  async probe(): Promise<ProbeResult> {
    try {
      const resp = await fetch(`${req.gateway.base_url}/api/tags`,
        { signal: AbortSignal.timeout(2000) });
      return { ok: resp.ok, latency_ms: /* measured */ };
    } catch {
      return { ok: false };
    }
  }

  async listModels(): Promise<ModelDescriptor[]> {
    const resp = await fetch(`${this.baseUrl}/api/tags`);
    const data = await resp.json() as { models: { name: string; size: number }[] };
    return data.models.map(m => ({
      model_name: m.name,
      cost_tier: 'free',
      strengths: ['quick-tasks', 'privacy', 'offline'],
      size_bytes: m.size,
    }));
  }
}
```

**Migration path for routes:**

| Step | What Changes |
|------|-------------|
| 1 | Add `bridge/` directory, implement adapters, no route changes |
| 2 | Routes import `bridgeDispatch` from `bridge/index.ts` instead of `ai-router.ts` |
| 3 | ai-router.ts remains in place; its exports still tested by Playwright suite |
| 4 (later) | After tests updated to use Bridge, ai-router.ts becomes internal-only |

---

### Data Flow: Gateway Registration to Memory

```
──────────────────── STARTUP ────────────────────────────────────────────────────

Fastify boot → StartupDetector.run()
  ├── Read config.ollamaUrl, config.openclawUrl (existing env-var config)
  ├── Probe HTTP: GET ollamaUrl/api/tags
  │     → if 200: upsert gateways(id='ollama-local', status='online')
  │                upsert models from response tags
  ├── Probe HTTP: HEAD openclawUrl
  │     → if 200/405: upsert gateways(id='openclaw-main', status='online')
  │                    fetch /v1/models if available; upsert model rows
  ├── Probe PATH: which(claude, codex, gemini)
  │     → for each found: exec `--version`, capture version_string
  │                        upsert gateways(id='claude-cli', gateway_type='cli', ...)
  └── Emit SSE: bridge:gateway_detected { gateway_id, provider, status, model_count }

──────────────────── ROUTING ─────────────────────────────────────────────────────

bridgeDispatch(req: BridgeRequest)
  │
  ├── 1. GatewayRegistry.getAvailable()
  │        SELECT * FROM gateways WHERE enabled=1 AND status IN ('online','degraded')
  │        ORDER BY priority ASC
  │        Returns ordered list; uses 30s in-memory cache to avoid per-request DB reads
  │
  ├── 2. RoutingEngine.select(req, available)
  │        a. Iterate routing_rules ORDER BY priority ASC
  │           - agent_affinity: req.agentId → personas.preferred_backend → match gateway
  │           - complexity:     shouldRouteCheap(req.message) → map to cost_tier filter
  │           - cost_cap:       featureFlags.billing → check token budget vs plan
  │           - capability:     req.requiredCapabilities → filter models.capabilities
  │        b. First matching rule returns { gateway, model, rule_matched }
  │        c. No rule match → default: shouldRouteCheap() heuristic (backward compat)
  │        Returns: { gateway, model, reason, rule_matched }
  │
  ├── 3. INSERT bridge_dispatch_log(status='pending', ...) — fire and forget
  │
  ├── 4. Emit SSE: bridge:dispatch_started { dispatch_id, gateway_id, model_id }
  │
  ├── 5. adapter.dispatch(req) OR adapter.stream(req, signal)
  │        OllamaAdapter   → Ollama NDJSON  → StreamNormalizer → AsyncIterable<string>
  │        OpenClawAdapter → OpenAI SSE     → StreamNormalizer → AsyncIterable<string>
  │        CodexCLIAdapter → JSONL stdout   → StreamNormalizer → AsyncIterable<string>
  │        ClaudeAdapter   → JSON stdout    → StreamNormalizer → AsyncIterable<string>
  │
  ├── 6. SUCCESS:
  │        UPDATE bridge_dispatch_log SET status='completed', tokens, duration_ms
  │        trackTokenUsage(model, input, output)   ← existing function, unchanged
  │        logDecision(...)                        ← existing function, unchanged
  │        Emit SSE: bridge:dispatch_completed { dispatch_id, tokens, duration_ms }
  │
  ├── 7. FAILURE:
  │        UPDATE bridge_dispatch_log SET status='failed', error=...
  │        Mark gateway degraded if probe also fails
  │        Emit SSE: bridge:dispatch_failed { dispatch_id, error, fallback_used }
  │        Retry with next available gateway (exclude degraded, re-enter step 2)
  │
  └── 8. logDecision() ← existing decision_log write, always preserved

──────────────────── HEALTH TICK ─────────────────────────────────────────────────

scheduler.ts tick (every 2s, existing) → every 15 ticks (30s):
  BridgeHealthTick.run()
    ├── SELECT * FROM gateways WHERE enabled=1
    ├── For each: adapter.probe() → { ok, latency_ms }
    ├── UPDATE gateways SET status, last_probe_at, last_probe_ms, probe_error
    ├── Invalidate GatewayRegistry in-memory cache
    └── Emit SSE: bridge:health_update { gateways: [{id, status, latency_ms}] }

──────────────────── MEMORY INTEGRATION ──────────────────────────────────────────

Phase 1 (this milestone): Bridge decisions feed decision_log (existing).
  Every routing decision writes: decision_type='model_selection', chosen, reasoning.

Phase 2 (Bridge agents, later):
  Bridge Operator agent reads bridge_dispatch_log for patterns.
  Route Analyst agent reads routing_rules + dispatch_log, suggests rule changes.
  Model Scout agent reads models table, triggers listModels() on new gateways.
  All three agents are personas with preferred_backend constraints, using Memory V3.
```

---

### Integration Points with Existing Services

#### scheduler.ts

Add one health tick alongside the existing `DEADLINE_CHECK_INTERVAL` (15 ticks):

```typescript
const BRIDGE_HEALTH_INTERVAL = 15; // Every 30s — same as DEADLINE_CHECK_INTERVAL

// In the existing tick handler:
if (tickCount % BRIDGE_HEALTH_INTERVAL === 0) {
  await runBridgeHealthCheck().catch(() => {}); // non-critical, swallow errors
}
```

No structural changes to scheduler.ts. One line added in the tick body.

#### sse-hub.ts

Unchanged. Bridge emits via `emitSSE()` which calls `sse-hub.broadcast()` internally.
New event namespace: `bridge:*`

| SSE Event | Payload | When |
|-----------|---------|------|
| `bridge:gateway_detected` | `{ gateway_id, provider, status, model_count }` | Startup |
| `bridge:gateway_status` | `{ gateway_id, status, latency_ms }` | Health tick |
| `bridge:dispatch_started` | `{ dispatch_id, gateway_id, model_id, agent_id }` | Before adapter |
| `bridge:dispatch_completed` | `{ dispatch_id, tokens, duration_ms, cost_usd }` | After success |
| `bridge:dispatch_failed` | `{ dispatch_id, error, gateway_id, fallback_used }` | After failure |
| `decision:made` | existing schema, unchanged | Still fires from logDecision() |

#### config.ts

Not modified. The env vars `OLLAMA_URL`, `OPENCLAW_URL`, `OLLAMA_MODEL`, `OPENCLAW_MODEL`,
and `OPENCLAW_TOKEN` remain. StartupDetector reads them once on boot to seed the initial
gateway rows. After startup, `gateways` table is authoritative — operators can override
URLs, add gateways, change priorities via the admin API without touching env vars.

#### stream-service.ts

Not modified. `OllamaStreamBackend` and `OpenClawStreamBackend` are imported and delegated
to from the corresponding adapters. `selectStreamBackend()` becomes an internal detail
of bridge routing — external callers use `bridgeStream()` instead.

#### Admin Backend (:5180)

Admin backend reads from same PostgreSQL. Bridge tables are immediately available to admin
SQL queries with no API changes to admin backend required. Suggested admin surfaces:

| Admin Tab | Data | Query |
|-----------|------|-------|
| Bridge > Gateways | `gateways` | Full list with health status, last probe latency |
| Bridge > Models | `models JOIN gateways` | Catalog with gateway, cost tier, capabilities |
| Bridge > Activity | `bridge_dispatch_log` | Last N dispatches with latency, status |
| Bridge > Cost | `bridge_dispatch_log` grouped by model, date | Rolling cost windows |
| Bridge > Rules | `routing_rules` | CRUD — priority-ordered list |

---

### Architectural Patterns

#### Pattern 1: Adapter Interface with Capability Flags

Every gateway adapter implements a shared `GatewayAdapter` interface. The routing engine
inspects capabilities from the `models` table, not hardcoded `if (backend === 'ollama')` branches.

```typescript
export interface GatewayAdapter {
  readonly gatewayType: 'http' | 'cli';
  dispatch(req: BridgeRequest): Promise<BridgeResult>;
  stream(req: BridgeRequest, signal: AbortSignal): AsyncIterable<string>;
  probe(): Promise<ProbeResult>;            // { ok, latency_ms, version? }
  listModels(): Promise<ModelDescriptor[]>; // discovered models for this gateway
}
```

Adding a new gateway = implement this interface + add a row to `gateways`. No changes
to bridge-router.ts, scheduler.ts, or routes.

#### Pattern 2: DB-Authoritative Gateway State

Gateway health is persisted to `gateways.status`. SSE events are notifications, not state.
Both Fastify (:3001) and Admin backend (:5180) read from the same PostgreSQL — they see
the same ground truth without any cross-process messaging.

Never maintain health in a module-level Map<string, Status>. It is lost on restart and
invisible to the admin backend.

#### Pattern 3: Non-Blocking Telemetry Writes

All `bridge_dispatch_log` writes are fire-and-forget — consistent with the existing
`logDecision()` and `trackTokenUsage()` pattern:

```typescript
// Correct: dispatch never waits for logging
logBridgeDispatch({ id, gateway_id, ... }).catch(() => {});
```

Logging latency must not contribute to dispatch latency. The `bridge_dispatch_log.started_at`
timestamp is captured before the adapter call; `completed_at` is set after.

#### Pattern 4: Startup Seeding Then DB Authority

On first boot, StartupDetector reads `config.*` env vars to seed initial gateway rows.
On all subsequent boots, the DB rows are used directly — no re-detection by default.
Operators can trigger re-detection via `POST /api/bridge/detect`.

This avoids probing every gateway on every request (the current ai-router anti-pattern
of calling `probeBackend()` inline with every dispatch).

---

### Anti-Patterns

#### Anti-Pattern 1: Gateway Config in config.ts

**What happens:** Add `config.codexBinaryPath`, `config.claudeToken`, etc. as the
gateway registry grows to cover Codex, Claude, Gemini CLIs.

**Why wrong:** config.ts becomes a second registry that diverges from the DB. Admin
UI cannot manage gateways without a redeployment. Per-user gateway configurations
(multi-tenant future) become impossible.

**Do this instead:** Only `ollamaUrl` and `openclawUrl` remain in config.ts as
bootstrap seeds for the StartupDetector. All runtime gateway state lives in `gateways`.

#### Anti-Pattern 2: Modifying ai-router.ts During Bridge Build

**What happens:** Refactor ai-router.ts internals while building bridge-router.ts.

**Why wrong:** 35 Playwright tests directly import and test `shouldRouteCheap`,
`compressContext`, `filterToolsForBackend`. Any signature change causes test failures.

**Do this instead:** Bridge wraps ai-router with zero changes. ai-router.ts is
read-only during the Bridge milestone. Cleanup is a separate, later commit after
tests are updated.

#### Anti-Pattern 3: Health Probe on Every Request

**What happens:** Call `probeBackend()` inside `bridgeDispatch()` before selecting
a gateway — the current ai-router.ts behavior (it fires a HEAD before every dispatch).

**Why wrong:** Every AI call incurs an extra HTTP round-trip. At 50 concurrent users
each streaming, that is 50 wasted HEAD requests per second.

**Do this instead:** Health state is maintained by the scheduler health tick (30s cadence).
`GatewayRegistry.getAvailable()` reads from DB cache, TTL 30s. Probes only run in the
background, never inline with dispatch.

#### Anti-Pattern 4: Hardcoding CLI Binary Paths

**What happens:** `config.claudeBinaryPath = '/home/lobster/.npm-global/bin/claude'`

**Why wrong:** Different on every user's machine. SaaS premise is "runs on your machine."
Also wrong for remote deployments where the binary is in `/usr/local/bin/`.

**Do this instead:** StartupDetector uses `which claude` (PATH resolution). Resolved path
stored in `gateways.binary_path`. If binary relocates, `POST /api/bridge/detect` re-runs
detection and updates the row.

#### Anti-Pattern 5: Using bridge_dispatch_log as Decision Log

**What happens:** Eliminate `decision_log` table, consolidate everything into
`bridge_dispatch_log`.

**Why wrong:** `decision_log` records abstract orchestration decisions (agent routing,
task skips) that are not tied to a dispatch. Bridge dispatch log records concrete
network calls. They serve different dashboards: transparency (decisions) vs cost/latency
(dispatches). Conflating them makes both dashboards harder to build.

**Do this instead:** Keep both. Bridge always calls `logDecision()` for model selection
events AND writes to `bridge_dispatch_log` for dispatch telemetry.

---

### Build Order

Sequencing is dictated by: schema before routes, adapters before router,
router before route cutover.

| Step | What to Build | Rationale |
|------|--------------|-----------|
| 1 | `migrate-bridge.ts` — create 4 new tables | Must exist before any reads/writes |
| 2 | `startup-detector.ts` — probe + seed | Gives the system real data immediately; validates schema |
| 3 | `bridge/adapters/interface.ts` — GatewayAdapter interface | Contract before implementations |
| 4 | `bridge/adapters/ollama.ts` + `openclaw.ts` — wrap existing | Lowest risk: logic already proven in ai-router |
| 5 | `gateway-registry.ts` + `routing-engine.ts` (non-streaming) | Core routing, no new adapter needed |
| 6 | `bridge-router.ts` — `bridgeDispatch()` wiring all together | Integrates registry + engine + adapters |
| 7 | `bridge_dispatch_log` writes + health tick in scheduler | Telemetry, non-blocking |
| 8 | Route cutover: update `/api/v1/chat` + agent jobs to call `bridgeDispatch()` | Replace ai-router calls; run Playwright |
| 9 | `bridge/adapters/codex-cli.ts` + `claude-cli.ts` — subprocess adapters | New capability; can land after existing tests pass |
| 10 | `routes/v1/bridge.ts` — CRUD for gateways, models, rules, log viewer | Admin surface; needs all data to be present |

**Test gate at step 8:** All 35 Playwright tests must pass before step 9 proceeds.
This confirms the Bridge wrapping did not break existing behavior.

---

### Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-10 users | In-process; scheduler health tick; no queue needed |
| 10-50 users | Add composite index on `bridge_dispatch_log(started_at DESC, gateway_id)` for admin queries |
| 100+ users | CLI adapters spawn subprocesses — add per-gateway subprocess semaphore (max N concurrent codex/claude invocations); default N=3 |
| Multi-tenant | Add `workspace_id` to `gateways` and `models`; per-tenant gateway registries; StartupDetector scopes detection per tenant |

**First bottleneck:** CLI adapters (`codex`, `claude`) spawn child processes. At 10+
concurrent dispatches to CLI gateways, process count explodes. Mitigation: a
`ConcurrencyLimiter` in each CLI adapter (semaphore pattern, acquire before spawn, release on exit).

**Second bottleneck:** `bridge_dispatch_log` on high-throughput workloads. Mitigation:
batch inserts via a write buffer (flush every 100ms or 50 rows, whichever comes first).
The table is append-only, so batching is safe.

---

### Sources

- `backend/src/services/ai-router.ts` — direct code inspection (HIGH confidence)
- `backend/src/services/stream-service.ts` — direct code inspection (HIGH confidence)
- `backend/src/config.ts` — direct code inspection (HIGH confidence)
- `backend/src/db/schema.ts` — complete table inventory, direct inspection (HIGH confidence)
- `backend/src/services/sse-hub.ts` — direct code inspection (HIGH confidence)
- `backend/src/services/scheduler.ts` — direct code inspection (HIGH confidence)
- `research/cli-runtime-design-brief.md` — CLI_RUNTIME_REGISTRY spec, CLI tool capabilities (HIGH confidence)
- `research/hermes-agent-patterns.md` — routing heuristics, tool schema rebuild pattern (HIGH confidence)
- `research/runtime-logging-hardening-plan.md` — event schema, telemetry subsystem model (HIGH confidence)
- `.planning/PROJECT.md` — v3.0 milestone goals and constraints (HIGH confidence)

---

*Architecture research for: Porter Bridge AI Gateway v3.0*
*Researched: 2026-03-25*
*Confidence: HIGH — all findings from direct codebase inspection, zero training-data inference*

---
---

## v2.0 Baseline Architecture (reference — do not modify)

The content below documents the v2.0 architecture established 2026-03-21. It remains
accurate as context for understanding how Bridge integrates with the existing system.

**Domain:** AI Orchestration Platform — Fastify/Drizzle/PostgreSQL backend extension
**Researched:** 2026-03-21
**Confidence:** HIGH (based on direct codebase inspection)

---

### Existing Architecture (v1.0 Baseline)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Clients                                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐             │
│  │  frontend-v2   │  │  Legacy React  │  │ External (LS,  │             │
│  │  /v2/* (React  │  │  (frontend/)   │  │ WhatsApp, etc) │             │
│  │  Router 7)     │  │                │  │                │             │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘             │
└──────────┼────────────────────┼────────────────────┼────────────────────┘
           │ :3001              │ :3001               │ :3001
┌──────────▼────────────────────▼─────────────────────▼────────────────────┐
│                        Fastify Server (:3001)                             │
│  ┌──────────────┐  ┌────────────────────────────────────────────────┐    │
│  │  Auth Plugin │  │  /api/v1/* (17 route groups, response envelope) │    │
│  │  (requireAuth│  │  /api/* legacy routes                          │    │
│  │  decorator)  │  │  /health — plain response                      │    │
│  └──────────────┘  └───────────────────────┬────────────────────────┘    │
│                                             │                             │
│  ┌──────────────────────────────────────────▼───────────────────────┐    │
│  │                     Services Layer                               │    │
│  │  ai-router.ts  scheduler.ts  event-triggers.ts                   │    │
│  │  billing.ts    email.ts      github.ts  calendar.ts              │    │
│  │  whatsapp.ts   external-dispatcher.ts  sse-hub.ts                │    │
│  └──────────────────────────────────────────┬───────────────────────┘    │
│                                             │                             │
│  ┌──────────────────────────────────────────▼───────────────────────┐    │
│  │             Drizzle ORM + PostgreSQL 16                          │    │
│  │  (SQLite fully eliminated as of 2026-03-25)                      │    │
│  └──────────────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────────┘
```

### Existing Component Inventory (v2.0)

| Component | Location | Status | Notes |
|-----------|----------|--------|-------|
| Auth plugin | `plugins/auth.ts` | STABLE | Cookie sessions, `requireAuth` decorator |
| v1 route index | `routes/v1/index.ts` | STABLE | 17 groups under `/api/v1/` |
| Envelope lib | `lib/envelope.ts` | STABLE | `ok(data)` / `err(code, msg)` pattern |
| AI router | `services/ai-router.ts` | STABLE | cheap/strong routing, context compression |
| Scheduler | `services/scheduler.ts` | STABLE | 2s tick, 7 workflow types |
| SSE hub | `services/sse-hub.ts` | STABLE | Native in-process broadcaster |
| Stream service | `services/stream-service.ts` | STABLE | Ollama NDJSON + OpenClaw SSE |
| Event triggers | `services/event-triggers.ts` | STABLE | deadline, file-created, message-received |
| External dispatcher | `services/external-dispatcher.ts` | STABLE | GitHub, email, calendar, WhatsApp |
| Billing service | `services/billing.ts` | PARTIAL | Lemon Squeezy wired, limits not enforced |
| Memory injection | `services/memory-injection.ts` | STABLE | Memory V2/V3 injection |

### Existing Schema Tables (as of 2026-03-25)

```
users, sessions, tasks, chats, chat_messages, chat_attachments
projects, personas, persona_skills, schema_migrations
agent_jobs, agent_activity, decision_log, token_usage_daily
workspace_connections, project_connections, calendar_events
subscriptions, auth_tokens, billing_events
project_collaborators, collaboration_events
companies, contacts, contact_emails, contact_phones, contact_social
conversations, messages, files, file_projects, file_contacts, file_conversations
contact_conversations, contact_projects
contact_analyses, agent_templates, concepts, learning_sessions
customer_events, customer_scores, admin_agent_tasks, error_log
email_messages, workspace_settings
forge_pipeline, forge_station_runs, forge_settings
audit_log, invites, invite_uses, agent_messages
directives, project_notes, agent_notes
```

*Architecture research for: Porter v2.0 Backend Ready*
*Researched: 2026-03-21*
