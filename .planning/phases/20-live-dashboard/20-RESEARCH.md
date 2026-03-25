# Phase 20: Smart Routing Engine - Research

**Researched:** 2026-03-25
**Domain:** DB-driven AI gateway routing, per-backend concurrency queuing, transparent dispatch logging, session routing context
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RT-01 | Replace hardcoded `getBackends()` and `shouldRouteCheap()` in `ai-router.ts` with DB-driven gateway+model selection using existing `gateways` table + Phase 19 `gateway_models` table | `gateways` table confirmed in schema; `createAdapter()` helper already in adapters/index.ts; DB gateway query pattern established in bridge.ts route |
| RT-02 | `routing_rules` table — operator-configurable overrides (force model for agent, cap cost per project, prefer local models); evaluated before heuristic fallback | No existing table; needs migration in `migrate-bridge-v2.ts`; rule schema design documented below |
| RT-03 | Every routing decision logged to `bridge_dispatch_log` with: chosen model, reason, alternatives considered, estimated cost — queryable via API | `decision_log` table already exists but lacks gateway/model/cost fields; `bridge_dispatch_log` is a NEW table in Phase 20 migration alongside `routing_rules` |
| RT-04 | Per-backend dispatch queues via `p-queue` — concurrency limits prevent VPS saturation | `p-queue` v9.1.0 confirmed on npm; ESM module; NOT yet in `backend/package.json`; concurrency control API verified |
| RT-05 | Session routing context — which model handled which conversation turn; context-aware re-routing; tied to Brain for memory continuity | `chats` table has `model_id` field; `chat_messages` has `model_id` field; needs `session_routing_context` table for per-turn routing records |
</phase_requirements>

---

## Summary

Phase 20 replaces the hardcoded two-tier routing logic in `backend/src/services/ai-router.ts` with a DB-driven engine that selects gateways and models based on live health data, capability matching, cost, and priority — then layers operator-configurable override rules on top.

The codebase already has significant routing infrastructure: `gateways` table (Phase 16), five fully-implemented adapters with `createAdapter()` factory (Phase 17), `decision_log` table with SSE push, and `decisionV1Routes` for log queries. Phase 20 builds the routing *engine* that connects these pieces — it does not rebuild what exists.

The two critical new pieces are the `routing_rules` table (operator overrides evaluated before the heuristic) and the `bridge_dispatch_log` table (richer than `decision_log`, includes gateway_id, model_id, cost_usd, latency_ms, alternatives as JSONB). The existing `decision_log` is agent-level; `bridge_dispatch_log` is bridge-specific and records estimated cost from the Phase 19 `gateway_models` pricing columns.

Concurrency control uses `p-queue` v9.1.0 (ESM). One `PQueue` instance is created per gateway type at service startup, stored in a `Map<string, PQueue>`. All dispatches to that gateway flow through its queue. The default concurrency for CLI-based gateways (Codex, Claude, Gemini) should be 1; for HTTP gateways (Ollama, OpenClaw) should be 3.

**Primary recommendation:** Implement `RoutingEngine` as a new service at `backend/src/services/bridge/routing-engine.ts`. Wire it into `ai-router.ts`'s `dispatch()` function as a drop-in replacement for `selectModel()`. Keep all existing upstream callers unchanged — the interface stays `dispatch(req: DispatchRequest): Promise<DispatchResult>`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| p-queue | 9.1.0 | Per-backend concurrency queue | Already approved in STATE.md decision; ESM-native; minimal API; runs in-process without Redis |
| node:crypto (built-in) | stdlib | uuid for routing rule IDs | Already used in startup-detector.ts |
| pg (already installed) | 8.20.0 | Raw SQL for routing engine queries | Pattern established in bridge; raw SQL used throughout bridge.ts and startup-detector.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| drizzle-orm (already installed) | 0.45.1 | Schema definition for new tables | Schema.ts additions follow existing pattern |
| uuid (already installed) | 13.0.0 | Generate routing rule and log IDs | Consistent with rest of codebase ID generation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| p-queue in-process | Redis + Bull/BullMQ | Redis adds external dependency; overkill for single-server VPS — explicitly rejected in REQUIREMENTS.md Out of Scope |
| New `bridge_dispatch_log` table | Extend `decision_log` | `decision_log` is agent-level (agent_id, project_id focus); bridge dispatch needs gateway_id, cost_usd, latency_ms; keeping separate preserves existing decision log consumers |
| Drizzle query builder | Raw SQL | Phase 16 and 17 established raw SQL pattern for bridge layer; raw SQL is explicit and easy to trace |

**Installation:**
```bash
cd /home/lobster/documents/porter/backend && npm install p-queue
```

**Version verification:** p-queue 9.1.0 confirmed via `npm view p-queue version` on 2026-03-25. It is an ESM-only module (`"type": "module"` in its package.json). The backend already uses `"type": "module"` (ESM), so import is direct.

---

## Architecture Patterns

### Recommended Project Structure
```
backend/src/services/bridge/
├── types.ts                    (exists — add RoutingDecision, RoutingRule types)
├── routing-engine.ts           (NEW — RoutingEngine class, selectGateway(), evaluateRules())
├── dispatch-queues.ts          (NEW — per-gateway PQueue map, getQueue(), defaultConcurrency())
├── startup-detector.ts         (exists — no changes)
├── stream-normalizer.ts        (exists — no changes)
└── adapters/
    └── index.ts                (exists — createAdapter() already ready for Phase 20)

backend/src/db/
└── migrate-bridge-v2.ts        (NEW — routing_rules + bridge_dispatch_log tables)
```

### Pattern 1: DB-Driven Gateway Selection

The routing engine queries the `gateways` table for active, enabled gateways ordered by priority. For each candidate gateway it instantiates an adapter via `createAdapter()`, checks health cache (from `last_health_at`), filters by capability match, then selects the best by (rules first, then cost, then priority).

```typescript
// Source: backend/src/services/bridge/adapters/index.ts (createAdapter is Phase 17 output)
// Pattern: DB rows → adapter instances
const { rows } = await pool.query(
  `SELECT * FROM gateways WHERE status = 'active' AND enabled = 1 ORDER BY priority ASC`
);
const candidates = rows
  .map((row) => ({ row, adapter: createAdapter(row as GatewayRow) }))
  .filter((c) => c.adapter !== null);
```

### Pattern 2: Routing Rules Evaluation

Rules are loaded from `routing_rules` table, filtered to those matching the current context (agent_id, project_id, gateway_type, model_name), and evaluated in `priority` order. First matching rule wins.

```typescript
// Rule evaluation order: highest-specificity match wins
// Specificity: agent_id match > project_id match > gateway_type match > global
interface RoutingRule {
  id: string;
  scope: 'agent' | 'project' | 'gateway' | 'global';
  scopeId: string | null;         // agent_id, project_id, or gateway type
  action: 'force_model' | 'block_gateway' | 'cap_cost_usd' | 'prefer_local';
  actionValue: string | null;     // model name for force_model, cost ceiling for cap_cost_usd
  enabled: number;
  priority: number;               // lower = evaluated first
  createdAt: number;
}
```

### Pattern 3: Per-Backend Dispatch Queue

One `PQueue` instance per gateway type, initialized at module load, stored in a module-level `Map`. Wrapping any adapter dispatch in `queue.add(() => adapter.dispatch(req))` enforces the concurrency limit without changing the caller API.

```typescript
// Source: p-queue v9.1.0 official API (verified 2026-03-25)
import PQueue from 'p-queue';

const DEFAULT_CONCURRENCY: Record<string, number> = {
  ollama: 3,
  openclaw: 3,
  codex_cli: 1,
  claude_cli: 1,
  gemini_cli: 1,
  openai_compat: 3,
};

const queues = new Map<string, PQueue>();

export function getQueue(gatewayType: string): PQueue {
  if (!queues.has(gatewayType)) {
    queues.set(
      gatewayType,
      new PQueue({ concurrency: DEFAULT_CONCURRENCY[gatewayType] ?? 2 })
    );
  }
  return queues.get(gatewayType)!;
}
```

### Pattern 4: Bridge Dispatch Log

Every routing decision is inserted into `bridge_dispatch_log` after the dispatch resolves. Insert is non-blocking (fire-and-forget with error swallow) — same pattern as existing `logDecision()` in `ai-router.ts`. Estimated cost is calculated from Phase 19 `gateway_models.cost_per_input_mtoken` and `cost_per_output_mtoken`.

```typescript
// Non-blocking insert pattern — already established in ai-router.ts logDecision()
pool.query(`
  INSERT INTO bridge_dispatch_log
    (id, gateway_id, model_name, chosen_reason, alternatives, estimated_cost_usd,
     input_tokens, output_tokens, latency_ms, agent_id, project_id, chat_id, created_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, EXTRACT(EPOCH FROM NOW()))
`, [...values]).catch(() => {});  // never block dispatch
```

### Pattern 5: Session Routing Context

Per-turn routing records stored in `session_routing_context` table. Keyed by `chat_id` + `message_sequence`. Enables the brain/memory layer to query "which model handled this conversation" and re-route subsequent turns to the same model for context continuity.

The `chats.model_id` column stores the default model for a chat. The new `session_routing_context` table adds per-turn granularity for conversations that span multiple gateways (e.g., first turn to Ollama, escalated to OpenClaw).

### Anti-Patterns to Avoid

- **Blocking dispatch for logging:** `bridge_dispatch_log` inserts must be fire-and-forget. If DB is slow, dispatch still returns. Pattern already established in `logDecision()`.
- **Health-checking on every dispatch:** Do not call `adapter.health()` inline during routing. Use `last_health_at` from DB (written by Phase 18 scheduler) as staleness signal. Only re-probe if stale > 60s.
- **Creating new `PQueue` per request:** Queues must be module-level singletons. Creating per-request queues defeats concurrency limiting entirely.
- **Modifying `ai-router.ts` dispatch signature:** All callers of `dispatch(req: DispatchRequest)` must continue to work unchanged. The routing engine is an internal implementation detail, not an API change.
- **p-queue imported as CommonJS:** p-queue v9 is ESM-only. `require('p-queue')` will fail. Use `import PQueue from 'p-queue'` — the backend is already `"type": "module"` so this works correctly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Concurrency limiting | Custom semaphore/counter logic | p-queue | p-queue handles backpressure, queue draining, `onIdle()`, size tracking — subtle edge cases in manual semaphores |
| Adapter instantiation | Manual switch/if-else on gateway type | `createAdapter(row)` from adapters/index.ts | Phase 17 already built this factory; using it is zero extra code |
| Gateway health state | Fresh health probe on every dispatch | `last_health_at` from DB + threshold check | Probing inline adds 2-5s latency; Phase 18 scheduler updates health on 30s interval |
| Routing decision format | Custom log format | Follow existing `decision_log` + extend for bridge fields | Consumers (Brain, dispatch-log API) need predictable shape |

**Key insight:** The heavy lifting is already done. Phase 17 built adapter instantiation; Phase 16 built gateway DB rows; Phase 18 (pending) will update health. Phase 20's routing engine only needs to: query DB, apply rules, pick adapter, wrap in queue, dispatch, log.

---

## Common Pitfalls

### Pitfall 1: p-queue ESM Import in tsx Watch Mode
**What goes wrong:** `tsx watch` (used in `npm run dev`) sometimes has module resolution issues with pure-ESM packages depending on tsconfig settings.
**Why it happens:** p-queue v9 ships no CJS build. If `tsconfig.json` has `"module": "commonjs"`, the import fails.
**How to avoid:** Verify `backend/tsconfig.json` uses `"module": "ESNext"` or `"module": "Node16"`. Backend already uses ESM (`"type": "module"` in package.json), so this should already be correct — but verify at install time.
**Warning signs:** `ERR_REQUIRE_ESM` in console when starting dev server after adding p-queue.

### Pitfall 2: Queue Singleton Across Hot Reloads
**What goes wrong:** In `tsx watch` hot-reload, module-level `Map<string, PQueue>` gets re-initialized on every file change, resetting all queue state and active counters.
**Why it happens:** Hot reload re-evaluates module top-level code.
**How to avoid:** In production (`node dist/`) this is not a problem. In dev, accept that queues reset on hot-reload — it does not cause correctness issues, only brief burst permitting.
**Warning signs:** Non-issue in tests; only matters during dev server restarts.

### Pitfall 3: Rule Evaluation Without Index
**What goes wrong:** `routing_rules` table scanned fully on every dispatch with no index on `(scope, scope_id, enabled)`.
**Why it happens:** Routing rules table not indexed, table grows over time.
**How to avoid:** Include `CREATE INDEX IF NOT EXISTS idx_routing_rules_scope ON routing_rules(scope, scope_id)` in migration DDL.
**Warning signs:** Dispatch latency grows linearly with number of rules.

### Pitfall 4: Phase 19 Models Table Not Yet Existing
**What goes wrong:** RT-01 requires capability-based routing using model capabilities — which live in Phase 19's `gateway_models` table. If Phase 20 runs before Phase 19 is complete, the join fails.
**Why it happens:** Phase 20 depends on Phase 19.
**How to avoid:** Routing engine queries `gateway_models` with a LEFT JOIN. If no models rows exist, fall back to gateway-only selection (still better than old hardcoded logic). Migration must be idempotent and handle empty `gateway_models`.
**Warning signs:** Routing falls through to gateway-only selection on every call — check if `gateway_models` is populated.

### Pitfall 5: ai-router.ts dispatch() Has Duplicate Routing Logic
**What goes wrong:** `ai-router.ts` contains both the old `selectModel()` and a new `RoutingEngine.select()` call. They race or conflict.
**Why it happens:** Incremental migration that leaves old code in place.
**How to avoid:** Replace `selectModel()` call inside `dispatch()` with a single `RoutingEngine.select()` call. Delete the old `getBackends()`, `probeBackend()`, and `shouldRouteCheap()` functions entirely (RT-01 explicitly requires removal).
**Warning signs:** Old `shouldRouteCheap` still appearing in logs/SSE output.

---

## Code Examples

Verified patterns from existing codebase and p-queue docs:

### New Table: routing_rules (migration DDL)
```sql
-- Source: established pattern from migrate-bridge-v1.ts
CREATE TABLE IF NOT EXISTS routing_rules (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'global',     -- 'agent' | 'project' | 'gateway' | 'global'
  scope_id TEXT,                             -- agent_id, project_id, or gateway_type
  action TEXT NOT NULL,                      -- 'force_model' | 'block_gateway' | 'cap_cost_usd' | 'prefer_local'
  action_value TEXT,                         -- model name, cost ceiling, etc.
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 50,      -- lower = evaluated first
  description TEXT,
  created_by TEXT,
  created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
);
CREATE INDEX IF NOT EXISTS idx_routing_rules_scope ON routing_rules(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_routing_rules_enabled ON routing_rules(enabled);
```

### New Table: bridge_dispatch_log (migration DDL)
```sql
CREATE TABLE IF NOT EXISTS bridge_dispatch_log (
  id TEXT PRIMARY KEY,
  gateway_id TEXT,                           -- FK to gateways.id (nullable — gateway may be deleted)
  gateway_type TEXT NOT NULL,
  model_name TEXT NOT NULL,
  chosen_reason TEXT NOT NULL,
  alternatives JSONB DEFAULT '[]'::jsonb,   -- [{gateway_type, model_name, reason_skipped}]
  estimated_cost_usd DOUBLE PRECISION,       -- from gateway_models pricing; null if unknown
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  agent_id TEXT,
  project_id TEXT,
  chat_id TEXT,
  rule_id TEXT,                              -- which routing_rule triggered (if any)
  created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
);
CREATE INDEX IF NOT EXISTS idx_bridge_dispatch_log_agent ON bridge_dispatch_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_bridge_dispatch_log_chat ON bridge_dispatch_log(chat_id);
CREATE INDEX IF NOT EXISTS idx_bridge_dispatch_log_created ON bridge_dispatch_log(created_at DESC);
```

### New Table: session_routing_context (migration DDL)
```sql
CREATE TABLE IF NOT EXISTS session_routing_context (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  message_sequence INTEGER NOT NULL,         -- turn index within conversation
  gateway_id TEXT,
  gateway_type TEXT NOT NULL,
  model_name TEXT NOT NULL,
  dispatch_log_id TEXT,                      -- FK to bridge_dispatch_log.id
  created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
);
CREATE INDEX IF NOT EXISTS idx_session_routing_chat ON session_routing_context(chat_id, message_sequence);
```

### RoutingEngine.select() Core Method
```typescript
// Source: pattern derived from existing ai-router.ts selectModel() + bridge.ts pool queries
export interface RoutingContext {
  message: string;
  agentId?: string;
  projectId?: string | null;
  chatId?: string;
  requiredCapabilities?: string[];  // e.g. ['code', 'tool_use']
}

export interface RoutingDecision {
  gatewayRow: GatewayRow;
  adapter: GatewayAdapter;
  modelName: string;
  reason: string;
  alternatives: Array<{ gatewayType: string; modelName: string; reasonSkipped: string }>;
  matchedRuleId: string | null;
}
```

### p-queue Dispatch Wrapping
```typescript
// Source: p-queue v9.1.0 official API (ESM import confirmed)
import PQueue from 'p-queue';

// Module-level singleton — initialized once per process
const _queues = new Map<string, PQueue>();

export function getQueue(gatewayType: string): PQueue {
  if (!_queues.has(gatewayType)) {
    _queues.set(gatewayType, new PQueue({
      concurrency: CLI_TYPES.has(gatewayType) ? 1 : 3,
    }));
  }
  return _queues.get(gatewayType)!;
}

// In routing engine dispatch:
const result = await getQueue(decision.gatewayRow.type).add(
  () => decision.adapter.dispatch(bridgeReq)
);
```

### ai-router.ts Wiring (minimal change)
```typescript
// Replace selectModel() call inside existing dispatch() function.
// Before (Phase 20 removes):
//   const { tier, backend, reason } = await selectModel(req.message);
// After (Phase 20 adds):
const decision = await routingEngine.select({
  message: req.message,
  agentId: req.agentId,
  projectId: req.projectId,
});
// Rest of dispatch() continues with decision.adapter, decision.modelName, decision.reason
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded `getBackends()` cheap/strong tiers | DB-driven gateway selection from `gateways` table | Phase 20 | Routing adapts to operator configuration without code changes |
| `shouldRouteCheap()` regex heuristic | Capability-match + rule override + cost optimization | Phase 20 | Routing decisions are explainable and auditable |
| No concurrency control | Per-backend `PQueue` with typed concurrency limits | Phase 20 | CLI gateways (Codex, Claude, Gemini) can't be overwhelmed by concurrent agent jobs |
| `decision_log` with agent focus | `bridge_dispatch_log` with gateway + cost + model focus | Phase 20 | Bridge-specific dispatch decisions tracked separately from agent-level decisions |

**Deprecated/outdated after Phase 20:**
- `shouldRouteCheap()` in ai-router.ts: replaced by routing engine capability+rule evaluation
- `getBackends()` in ai-router.ts: replaced by DB query in routing engine
- `probeBackend()` in ai-router.ts: replaced by `last_health_at` staleness check against DB

---

## Open Questions

1. **Phase 19 gateway_models table schema**
   - What we know: Phase 19 is pending; it creates `gateway_models` with capability arrays and pricing columns
   - What's unclear: Exact column names for capabilities and pricing fields
   - Recommendation: Routing engine uses LEFT JOIN to `gateway_models`; if table is absent or empty, fall back to gateway-priority-only selection. Add a `try/catch` around the capabilities join in the routing engine.

2. **Heuristic fallback when no rules match and no capability data**
   - What we know: Old `shouldRouteCheap()` was the only signal; it will be deleted
   - What's unclear: Whether to keep a simplified message-complexity heuristic as last-resort fallback
   - Recommendation: Yes — keep a stripped-down complexity signal (message length + code markers) as the final tiebreaker when all gateways have equal priority and no rules apply. This prevents purely random selection.

3. **Concurrency limits configurability**
   - What we know: Hardcoded defaults (CLI=1, HTTP=3) are reasonable for current VPS
   - What's unclear: Whether operator should be able to configure limits per gateway
   - Recommendation: Hardcode defaults in Phase 20. Phase 22 (Bridge Admin Surface) can expose these as `metadata` fields on `gateways` rows that the queue reads at initialization.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 35 tests (existing) |
| Config file | `tests/playwright.config.ts` |
| Quick run command | `cd /home/lobster/documents/porter/tests && npx playwright test --grep "routing"` |
| Full suite command | `cd /home/lobster/documents/porter/tests && npx playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RT-01 | DB gateway selection replaces hardcoded logic | integration | `npx playwright test --grep "routing-engine"` | Wave 0 |
| RT-02 | Routing rules evaluated before heuristic | unit | `npx playwright test --grep "routing-rules"` | Wave 0 |
| RT-03 | Dispatch log written per routing decision | integration | `npx playwright test --grep "dispatch-log"` | Wave 0 |
| RT-04 | Concurrent dispatches respect per-backend queue | integration | `npx playwright test --grep "dispatch-queue"` | Wave 0 |
| RT-05 | Session routing context written per conversation turn | integration | `npx playwright test --grep "session-routing"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /home/lobster/documents/porter/tests && npx playwright test --grep "bridge"` (bridge-specific subset)
- **Per wave merge:** `cd /home/lobster/documents/porter/tests && npx playwright test` (all 35 tests)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/bridge-routing-engine.spec.ts` — covers RT-01, RT-02, RT-03
- [ ] `tests/bridge-dispatch-queue.spec.ts` — covers RT-04
- [ ] `tests/bridge-session-routing.spec.ts` — covers RT-05
- [ ] `backend/npm install p-queue` — package not yet in `backend/package.json`

---

## Sources

### Primary (HIGH confidence)
- `backend/src/services/ai-router.ts` — existing `shouldRouteCheap()`, `getBackends()`, `dispatch()`, `logDecision()` implementation — direct code read
- `backend/src/services/bridge/types.ts` — `GatewayAdapter`, `GatewayRow`, `BridgeDispatchRequest`, `BridgeDispatchResult` contracts
- `backend/src/services/bridge/adapters/index.ts` — `createAdapter()` factory, `ADAPTER_MAP` — Phase 17 output
- `backend/src/db/schema.ts` — `gateways`, `gatewayCredentials`, `decisionLog`, `chats`, `chatMessages` table definitions — lines 77-96, 200-212, 856-883
- `backend/src/db/migrate-bridge-v1.ts` — migration DDL pattern for bridge tables
- `backend/package.json` — confirmed `p-queue` NOT installed, `pg`, `uuid`, `which` available
- p-queue v9.1.0 README (WebFetch from github.com/sindresorhus/p-queue) — constructor options, `.add()`, `.size`, `.pending`, ESM import syntax
- `npm view p-queue version` — confirmed 9.1.0 current, ESM-only, Node >= 20

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — decision "Three new npm packages only: opossum, p-queue, which" — confirms p-queue is pre-approved
- `.planning/REQUIREMENTS.md` — RT-01 through RT-05 requirements text
- `17-RESEARCH.md` — confirmed adapter patterns and `createAdapter()` availability

### Tertiary (LOW confidence)
- None — all critical claims verified against source files

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — p-queue version confirmed from npm registry; no new package surprises; existing dependencies verified from package.json
- Architecture: HIGH — routing engine pattern derived directly from existing `ai-router.ts` code and Phase 17 adapter contracts; no speculation
- Pitfalls: HIGH — ESM pitfall verified from p-queue package.json; DB join risk verified from Phase 19 not-yet-existing; singleton pattern is p-queue idiom from docs
- Table schemas: HIGH — column names follow established `migrate-bridge-v1.ts` patterns exactly

**Research date:** 2026-03-25
**Valid until:** 2026-04-24 (stable domain; p-queue major versions are infrequent)
