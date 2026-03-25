# Phase 22: Bridge Admin Surface - Research

**Researched:** 2026-03-25
**Domain:** Fastify admin route authoring, PostgreSQL aggregation queries, SSE event verification
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- ADM-01: GET /api/admin/bridge — gateway cards with live health, latency, uptime %, model count per gateway
- ADM-02: GET /api/admin/bridge/models — unified model catalog with capabilities, pricing, benchmarks
- ADM-03: GET /api/admin/bridge/dispatch-log — paginated routing decisions with model, reason, cost, latency
- ADM-04: GET /api/admin/bridge/costs — spend aggregated by gateway/model/day with date range params
- ADM-05: POST /api/admin/bridge/gateways — gateway CRUD (add, update, remove, validate)
- ADM-06: POST /api/admin/bridge/routing-rules — routing rule CRUD
- ADM-07: SSE events (bridge:health, bridge:dispatch, bridge:circuit-trip) already emitted — verify they stream to admin clients
- DS-01: API responses structured as component-ready data contracts (card shapes, list shapes)
- DS-02: API includes agent-ready fields (activity feeds, status indicators, briefing slots)
- DS-03: Follows existing admin route patterns (auth, role checks, envelope responses)

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ADM-01 | GET /api/admin/bridge — gateway cards with live health, latency, uptime %, model count per gateway | Gateways table schema + health-probe SSE data + circuit-breaker-registry state |
| ADM-02 | GET /api/admin/bridge/models — unified model catalog across all gateways with capabilities and pricing | models + model_versions tables, model-catalog.ts patterns |
| ADM-03 | GET /api/admin/bridge/dispatch-log — paginated routing decision log with model, reason, cost, latency | bridge_dispatch_log table, pagination pattern from admin routes |
| ADM-04 | GET /api/admin/bridge/costs — spend by gateway, by model, by day, date range params | bridge_dispatch_log.estimated_cost_usd, GROUP BY aggregation pattern |
| ADM-05 | POST /api/admin/bridge/gateways — add/update/remove gateways, validate connections | gateways + gateway_credentials tables, createAdapter() + maskGatewayRow() from bridge.ts |
| ADM-06 | POST /api/admin/bridge/routing-rules — create/update routing rule overrides | routing_rules table schema, existing evaluateRules() pattern |
| ADM-07 | SSE events for bridge:health, bridge:dispatch, bridge:circuit-trip already emitting — verify they reach admin clients | emitSSE() in scheduler.ts, sse-hub.ts broadcast |
| DS-01 | API responses structured as component-ready data contracts (card shapes, list shapes) | ok() envelope shapes, model shape for frontend cards |
| DS-02 | Agent-ready layout: activity feeds, status indicators, briefing slots | Add summary counts, last_activity timestamps, status badges to each entity |
| DS-03 | Bridge admin page follows existing admin shell, nav style — same patterns as existing admin routes | admin/index.ts preHandler auth hook, ok()/err() envelope, pool.query() pattern |
</phase_requirements>

---

## Summary

Phase 22 is entirely backend — new Fastify route file `backend/src/routes/v1/admin/bridge.ts` registered into `backend/src/routes/v1/admin/index.ts`. All data sources already exist from Phases 16-21: the gateways, models, bridge_dispatch_log, and routing_rules tables are live in PostgreSQL, and the bridge services layer (routing-engine, model-catalog, health-probe, circuit-breaker-registry) already emits SSE events.

This phase has zero new service logic and zero schema changes. Every handler simply reads existing tables, applies the established ok()/err() response envelope, and returns shaped data. ADM-07 is a verification exercise — the three SSE event types are already being emitted; the task is to confirm they flow through the SSE hub to admin subscribers.

The primary engineering risk is query design for ADM-04 (cost aggregation with date range) and ADM-05 (gateway CRUD with credential re-encryption). Both have precedents in the existing bridge.ts setup wizard routes.

**Primary recommendation:** Implement as a single file `admin/bridge.ts`, register at `/bridge` prefix in admin index, borrow maskGatewayRow() and mapRawToGatewayRow() directly from bridge.ts (or shared helpers), and follow the admin/health.ts query style throughout.

---

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | 5.x | Route handler | Project standard — all routes use it |
| pg (node-postgres) | 8.x | Raw SQL via `pool.query()` | Used across all routes including bridge.ts |
| `lib/envelope.ts` ok()/err() | internal | Response wrapper | Required by DS-03 — all admin routes use it |
| `lib/credential-crypto.ts` | internal | encryptCredential / validatePorterSecret | Needed for ADM-05 credential storage |
| crypto (node:crypto) | built-in | UUID generation, SHA-256 credential ID | Used in bridge.ts CRUD handlers |

### No new packages required
This phase adds no npm dependencies. All data access is via `pool.query()`. No Drizzle ORM needed (existing admin routes use raw SQL for flexibility).

---

## Architecture Patterns

### Recommended File Location
```
backend/src/routes/v1/admin/
├── bridge.ts         ← NEW — this phase
├── index.ts          ← EDIT: add import + register at prefix '/bridge'
├── health.ts         ← reference pattern
├── models.ts         ← reference pattern (query style)
└── users.ts          ← reference pattern (pagination style)
```

### Pattern 1: Admin Auth — Inherited from parent plugin
The admin index registers a `fastify.addHook('preHandler')` that enforces `role === 'platform_admin'` on all registered sub-routes. Route handlers in `admin/bridge.ts` do NOT need to perform their own auth check — the platform_admin gate is already in place.

```typescript
// Source: backend/src/routes/v1/admin/index.ts (lines 24-33)
// DO NOT replicate this in admin/bridge.ts — it is inherited automatically.
// Bridge.ts public routes (bridge.ts setup wizard) DO require manual checks.
// Admin bridge routes DO NOT — they inherit the hook.
```

**Contrast with bridge.ts (non-admin):** The existing `bridge.ts` checks `request.sessionUser!.role` manually in each handler because it does NOT live under admin/. The new `admin/bridge.ts` does not need this — the parent hook covers it.

### Pattern 2: Response Envelope
All responses use `ok(data)` or `err(code, message)` from `lib/envelope.js`.

```typescript
// Source: backend/src/lib/envelope.ts
import { ok, err } from '../../../lib/envelope.js';

// Success shape:
// { ok: true, data: {...}, meta: { trace_id, timestamp } }

// Error shape:
// { ok: false, error: { code, message, trace_id }, meta: {...} }
```

### Pattern 3: Pagination
From `admin/users.ts` and `admin/activity.ts` patterns: use `?page=` and `?limit=` query params.

```typescript
const page = Math.max(1, parseInt((req.query as any).page || '1'));
const limit = Math.min(100, parseInt((req.query as any).limit || '50'));
const offset = (page - 1) * limit;

const { rows } = await pool.query(
  'SELECT ... FROM bridge_dispatch_log ORDER BY created_at DESC LIMIT $1 OFFSET $2',
  [limit, offset]
);
const { rows: countRows } = await pool.query('SELECT COUNT(*) as total FROM bridge_dispatch_log');
const total = parseInt(countRows[0].total);
return ok({ entries: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
```

### Pattern 4: maskGatewayRow — security boundary
This mapper MUST be used on every gateway row returned from API. It strips encrypted_value and returns only safe fields. Defined in `bridge.ts` — can be copy-imported or extracted to shared helper.

```typescript
// Source: backend/src/routes/v1/bridge.ts (lines 16-33)
function maskGatewayRow(row: any) {
  return {
    id: row.id, type: row.type, name: row.name, url: row.url,
    auth_method: row.auth_method, status: row.status, source: row.source,
    priority: row.priority, capabilities: row.capabilities ?? [],
    metadata: row.metadata ?? {}, enabled: row.enabled,
    created_at: row.created_at, updated_at: row.updated_at,
    last_health_at: row.last_health_at ?? null,
  };
}
```

### Pattern 5: Gateway CRUD with credential upsert (ADM-05)
The setup wizard handlers in bridge.ts (lines 172-317) are the direct template for ADM-05. Key points:
- Check `validatePorterSecret()` before any credential write
- Use `encryptCredential(token)` for storage
- Use deterministic SHA-256 credential ID: `crypto.createHash('sha256').update(key).digest('hex').slice(0,36)`
- `ON CONFLICT (id) DO UPDATE` for idempotent upserts
- Return `ok({ saved: true })` not the credential back

### Anti-Patterns to Avoid
- **Returning encrypted_value in any response:** always use maskGatewayRow()
- **Implementing auth checks in admin/bridge.ts:** auth is inherited from the parent preHandler
- **Using Drizzle ORM for new queries:** existing admin routes all use raw `pool.query()` — stay consistent
- **Importing from bridge.ts in admin/bridge.ts:** instead, declare local copies of maskGatewayRow/mapRawToGatewayRow to avoid circular imports (Phase 21 decision documented in STATE.md)
- **Blocking dispatch on logging failures:** follow fire-and-forget async IIFE pattern from routing-engine.ts

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Response envelope | Custom `{ok, data}` shape | `ok()/err()` from lib/envelope.ts | All admin routes use this — DS-03 compliance |
| Credential encryption | Custom AES or bcrypt | `encryptCredential()` from lib/credential-crypto.ts | GW-07 — already validated and deployed |
| Health probe trigger | Inline fetch() in route | `runHealthProbe()` from health-probe.ts | Reuses per-gateway timeout + circuit breaker state |
| SSE broadcast | Write to res directly | `emitSSE()` from services/scheduler.ts | Already wired; emitSSE() reaches all connected SSE hub clients |
| UUID generation | Custom ID schemes | `crypto.randomUUID()` | Project standard |
| Gateway type validation | Ad-hoc if/else | `VALID_GATEWAY_TYPES` Set from bridge.ts | Already covers all 6 types; copy locally |

**Key insight:** Phase 22 is assembly, not invention. Every building block is already proven in production across Phases 16-21.

---

## Common Pitfalls

### Pitfall 1: Circular import between bridge.ts and admin/bridge.ts
**What goes wrong:** Importing maskGatewayRow from bridge.ts into admin/bridge.ts creates a circular dep or unexpected coupling.
**Why it happens:** bridge.ts is a peer route file, not a shared library.
**How to avoid:** Declare maskGatewayRow and mapRawToGatewayRow as private local functions in admin/bridge.ts (identical copies). This is explicitly documented in STATE.md for Phase 21: "mapRawToGatewayRow duplicated in bridge.ts to avoid circular import with startup-detector.ts."

### Pitfall 2: ADM-05 gateway DELETE without cascade awareness
**What goes wrong:** Deleting a gateway row without understanding cascades leaves orphaned data or fails with FK violations.
**Why it happens:** gateway_credentials, models, and bridge_dispatch_log all reference gateways.
**How to avoid:** gateway_credentials has `ON DELETE CASCADE` (verified in schema.ts line 876). models has `ON DELETE CASCADE` (verified in migrate-bridge-v4.ts). bridge_dispatch_log uses `gateway_id TEXT` (no FK — nullable, orphaned rows are acceptable for audit trail). Safe to DELETE from gateways directly.

### Pitfall 3: ADM-07 SSE verification — event type names
**What goes wrong:** Emitting `bridge_health` instead of `bridge:health` — event type names use colon separator.
**Why it happens:** Inconsistent naming conventions in SSE event payloads.
**How to avoid:** Event type names are `bridge:health`, `bridge:dispatch`, `bridge:circuit-trip` — verified in health-probe.ts line 126, routing-engine.ts line 298, circuit-breaker-registry.ts lines 57/64/69. The test for ADM-07 should subscribe to SSE and assert these exact event type strings.

### Pitfall 4: Cost aggregation query — NULL estimated_cost_usd
**What goes wrong:** SUM of estimated_cost_usd returns NULL when no dispatches have cost data (e.g., local Ollama models with free pricing).
**Why it happens:** Ollama dispatches have estimated_cost_usd = null (pricing_input_per_m = 0.0 returns null from calculateCostUsd when both token counts are falsy).
**How to avoid:** Use `COALESCE(SUM(estimated_cost_usd), 0.0)` in cost aggregation queries.

### Pitfall 5: ADM-03 dispatch-log alternatives column
**What goes wrong:** Returning alternatives as raw JSONB string instead of parsed array.
**Why it happens:** PostgreSQL JSONB columns come back as objects in node-postgres when jsonb, but may come as strings depending on parse config.
**How to avoid:** Use `alternatives` directly from row (node-postgres auto-parses JSONB into JS objects). No manual JSON.parse needed. Verified by existing routing-engine.ts logDispatch() which stores `JSON.stringify(decision.alternatives)` and retrieves it parsed.

### Pitfall 6: Admin index missing bridge import
**What goes wrong:** Route registered in admin/bridge.ts but requests return 404 because admin/index.ts was not updated.
**Why it happens:** Forgetting the two-step file creation + registration.
**How to avoid:** Both files must change atomically: create admin/bridge.ts AND add import + register call to admin/index.ts.

---

## Code Examples

### ADM-01: Gateway cards with live health + model count
```typescript
// Source: bridge.ts GET /gateways pattern + health-probe.ts circuit_state column
fastify.get('/', async (_req, reply) => {
  const { rows: gatewayRows } = await pool.query(`
    SELECT
      g.id, g.type, g.name, g.url, g.auth_method, g.status,
      g.source, g.priority, g.capabilities, g.metadata,
      g.enabled, g.last_health_at, g.circuit_state,
      COUNT(m.id) FILTER (WHERE m.is_active = 1) AS model_count
    FROM gateways g
    LEFT JOIN models m ON m.gateway_id = g.id
    GROUP BY g.id
    ORDER BY g.priority ASC, g.created_at ASC
  `);
  // Add live circuit state from in-memory registry
  const { getBreakerState } = await import('../../../services/bridge/circuit-breaker-registry.js');
  const gateways = gatewayRows.map((gw: any) => ({
    ...maskGatewayRow(gw),
    model_count: parseInt(gw.model_count) || 0,
    circuit_state: getBreakerState(gw.id) ?? gw.circuit_state ?? 'closed',
  }));
  return reply.send(ok({ gateways }));
});
```

### ADM-02: Unified model catalog
```typescript
// Source: model-catalog.ts schema + models table
fastify.get('/models', async (req, reply) => {
  const gatewayId = (req.query as any).gateway_id; // optional filter
  const params: string[] = [];
  let where = 'WHERE m.is_active = 1';
  if (gatewayId) { params.push(gatewayId); where += ` AND m.gateway_id = $${params.length}`; }

  const { rows } = await pool.query(`
    SELECT m.*, g.name AS gateway_name, g.type AS gateway_type, g.status AS gateway_status
    FROM models m
    JOIN gateways g ON g.id = m.gateway_id
    ${where}
    ORDER BY g.priority ASC, m.model_name ASC
  `, params);
  return reply.send(ok({ models: rows }));
});
```

### ADM-03: Paginated dispatch log
```typescript
// Source: pagination pattern from admin/users.ts
fastify.get('/dispatch-log', async (req, reply) => {
  const page = Math.max(1, parseInt((req.query as any).page || '1'));
  const limit = Math.min(100, parseInt((req.query as any).limit || '50'));
  const offset = (page - 1) * limit;

  const { rows } = await pool.query(
    `SELECT id, gateway_id, gateway_type, model_name, chosen_reason,
            alternatives, estimated_cost_usd, input_tokens, output_tokens,
            cached_tokens, latency_ms, agent_id, project_id, chat_id, rule_id, created_at
     FROM bridge_dispatch_log
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  const { rows: countRows } = await pool.query('SELECT COUNT(*) as total FROM bridge_dispatch_log');
  const total = parseInt(countRows[0].total);
  return reply.send(ok({ entries: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }));
});
```

### ADM-04: Cost aggregation with date range
```typescript
// Source: bridge_dispatch_log schema, admin/models.ts estimateCost pattern
fastify.get('/costs', async (req, reply) => {
  const q = req.query as any;
  const from = q.from ? parseFloat(q.from) : (Date.now() / 1000) - 30 * 86400; // default: 30 days
  const to   = q.to   ? parseFloat(q.to)   : Date.now() / 1000;

  // By gateway
  const { rows: byGateway } = await pool.query(`
    SELECT gateway_type,
           COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
           COUNT(*) AS dispatch_count,
           COALESCE(SUM(input_tokens), 0) AS input_tokens,
           COALESCE(SUM(output_tokens), 0) AS output_tokens
    FROM bridge_dispatch_log
    WHERE created_at >= $1 AND created_at <= $2
    GROUP BY gateway_type ORDER BY total_cost_usd DESC
  `, [from, to]);

  // By model
  const { rows: byModel } = await pool.query(`
    SELECT model_name, gateway_type,
           COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
           COUNT(*) AS dispatch_count
    FROM bridge_dispatch_log
    WHERE created_at >= $1 AND created_at <= $2
    GROUP BY model_name, gateway_type ORDER BY total_cost_usd DESC
  `, [from, to]);

  // By day (epoch-based: truncate to day boundary)
  const { rows: byDay } = await pool.query(`
    SELECT TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD') AS day,
           COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
           COUNT(*) AS dispatch_count
    FROM bridge_dispatch_log
    WHERE created_at >= $1 AND created_at <= $2
    GROUP BY day ORDER BY day ASC
  `, [from, to]);

  return reply.send(ok({ byGateway, byModel, byDay, range: { from, to } }));
});
```

### ADM-05: Gateway CRUD action dispatch
```typescript
// Source: bridge.ts POST /setup/configure and POST /setup/save patterns
fastify.post('/gateways', async (req, reply) => {
  const { action, ...body } = req.body as any;
  // action: 'add' | 'update' | 'remove' | 'validate'
  if (action === 'remove') {
    await pool.query('DELETE FROM gateways WHERE id = $1', [body.id]);
    return reply.send(ok({ removed: true, id: body.id }));
  }
  if (action === 'validate') {
    const { rows } = await pool.query('SELECT * FROM gateways WHERE id = $1', [body.id]);
    if (!rows[0]) return reply.send(ok({ valid: false, error: 'NOT_FOUND' }));
    const adapter = createAdapter(mapRawToGatewayRow(rows[0]));
    if (!adapter) return reply.send(ok({ valid: false, error: 'NO_ADAPTER' }));
    const health = await adapter.health();
    return reply.send(ok({ valid: health.healthy, latencyMs: health.latencyMs }));
  }
  // add / update: delegate to bridge.ts setup/configure pattern
  // ...
});
```

### ADM-06: Routing rule CRUD
```typescript
// Source: routing_rules schema + routingEngine.evaluateRules() pattern
fastify.post('/routing-rules', async (req, reply) => {
  const { action, ...body } = req.body as any;
  const VALID_SCOPES = new Set(['global', 'agent', 'project', 'gateway']);
  const VALID_ACTIONS = new Set(['force_model', 'block_gateway', 'cap_cost_usd', 'prefer_local']);

  if (action === 'create') {
    if (!VALID_SCOPES.has(body.scope)) return reply.send(err('INVALID_SCOPE', `scope must be one of: ${[...VALID_SCOPES].join(', ')}`));
    if (!VALID_ACTIONS.has(body.action_type)) return reply.send(err('INVALID_ACTION', `action must be one of: ${[...VALID_ACTIONS].join(', ')}`));
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO routing_rules (id, scope, scope_id, action, action_value, enabled, priority, description, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,EXTRACT(EPOCH FROM NOW()),EXTRACT(EPOCH FROM NOW()))`,
      [id, body.scope, body.scope_id ?? null, body.action_type, body.action_value ?? null,
       body.enabled ?? 1, body.priority ?? 50, body.description ?? null, req.sessionUser?.username ?? null]
    );
    return reply.send(ok({ created: true, id }));
  }
  // update / delete patterns follow the same structure
});
```

### ADM-07: SSE verification — check event types flow through hub
```typescript
// Verification: the three event types are emitted by:
// - bridge:health      → health-probe.ts line 126 → emitSSE('bridge:health', {...})
// - bridge:dispatch    → routing-engine.ts line 298 → emitSSE('bridge:dispatch', {...})
// - bridge:circuit-trip → circuit-breaker-registry.ts lines 57/64/69 → emitSSE('bridge:circuit-trip', {...})
//
// emitSSE() in scheduler.ts calls broadcast() in sse-hub.ts which writes to all /api/events SSE clients.
// ADM-07 requires no new code — it is a test assertion that these events appear on the SSE stream.
// The test: connect to GET /api/events, trigger a health probe or dispatch, assert event type received.
```

### DS-01/02: Component-ready response shapes
Every list response includes:
- A `summary` sub-object with counts, totals, and last_activity timestamp
- `status_indicator` fields (string: 'healthy' | 'degraded' | 'unavailable' | 'unknown')
- `briefing_slot` fields (nullable string for agent-authored status summaries — initially null)

```typescript
// Example gateway card shape (DS-01/DS-02 compliant):
{
  id, type, name, url, status, priority, capabilities,
  model_count: 3,
  circuit_state: 'closed',        // DS-02: status indicator
  last_health_at: 1711339042,
  status_indicator: 'healthy',    // DS-02: normalized status enum
  briefing_slot: null,             // DS-02: reserved for future Bridge agent narrative
}
```

### Registration in admin/index.ts
```typescript
// Add to backend/src/routes/v1/admin/index.ts:
import adminBridgeRoutes from './bridge.js';
// ...inside adminV1Routes():
fastify.register(adminBridgeRoutes, { prefix: '/bridge' });
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| porter.py inline model health checks | Fastify admin routes + service layer | Phase 16-21 (v3.0) | admin/bridge.ts is the canonical surface |
| Hardcoded cost table in admin/models.ts | models table with per-row pricing_input_per_m | Phase 19 | ADM-04 reads from DB, not hardcoded map |
| Manual gateway config via porter_config.json | DB-driven gateways table | Phase 16 | ADM-05 CRUD operates on gateways table only |
| No routing visibility | bridge_dispatch_log with full decision context | Phase 20 | ADM-03 already has full data to surface |

---

## Open Questions

1. **circuit_state column in gateways table**
   - What we know: health-probe.ts UPDATE includes `circuit_state = $2` (line 119). The DB column exists.
   - What's unclear: Is the column always current or may it lag in-memory breaker state?
   - Recommendation: For ADM-01, prefer `getBreakerState(gatewayId)` (in-memory, current) and fall back to `gw.circuit_state` (DB, may be 1 probe cycle stale). Merge both: `getBreakerState(id) ?? row.circuit_state ?? 'closed'`.

2. **cached_tokens in bridge_dispatch_log**
   - What we know: Column added in migrate-bridge-v4.ts. Populated in logDispatch() as `result.cachedTokens ?? null`.
   - What's unclear: Do adapters actually populate cachedTokens? Only claude-cli would have this.
   - Recommendation: Include in ADM-03 response and ADM-04 cost breakdown; treat as nullable — COALESCE to 0 in aggregations.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `tsx` (TypeScript support) |
| Config file | none — run directly via npx |
| Quick run command | `npx tsx --test backend/src/__tests__/admin-bridge.test.ts` |
| Full suite command | `npx tsx --test backend/src/__tests__/*.test.ts` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADM-01 | GET /api/admin/bridge returns gateway array with model_count and circuit_state | unit | `npx tsx --test backend/src/__tests__/admin-bridge.test.ts` | ❌ Wave 0 |
| ADM-02 | GET /api/admin/bridge/models returns models joined to gateway | unit | `npx tsx --test backend/src/__tests__/admin-bridge.test.ts` | ❌ Wave 0 |
| ADM-03 | GET /api/admin/bridge/dispatch-log returns paginated entries | unit | `npx tsx --test backend/src/__tests__/admin-bridge.test.ts` | ❌ Wave 0 |
| ADM-04 | GET /api/admin/bridge/costs returns cost aggregates with COALESCE(null,0) | unit | `npx tsx --test backend/src/__tests__/admin-bridge.test.ts` | ❌ Wave 0 |
| ADM-05 | POST /api/admin/bridge/gateways action=remove deletes row; action=validate returns health | unit | `npx tsx --test backend/src/__tests__/admin-bridge.test.ts` | ❌ Wave 0 |
| ADM-06 | POST /api/admin/bridge/routing-rules action=create inserts with valid scope/action | unit | `npx tsx --test backend/src/__tests__/admin-bridge.test.ts` | ❌ Wave 0 |
| ADM-07 | bridge:health, bridge:dispatch, bridge:circuit-trip are emitted and flow through sse-hub | unit | `npx tsx --test backend/src/__tests__/admin-bridge.test.ts` | ❌ Wave 0 |
| DS-03 | Unauthenticated request to any admin/bridge endpoint returns 401 | unit | `npx tsx --test backend/src/__tests__/admin-bridge.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx tsx --test backend/src/__tests__/admin-bridge.test.ts`
- **Per wave merge:** `npx tsx --test backend/src/__tests__/*.test.ts`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/__tests__/admin-bridge.test.ts` — covers ADM-01 through ADM-07 and DS-03
  - Test stubs for each requirement using `node:test` describe/it.todo pattern matching existing test files
  - Implements stubs first (like routing-engine.test.ts), fills in with actual assertions in Wave 1

*(Existing test infrastructure: `node:test` + tsx confirmed active via routing-engine.test.ts, dispatch-log.test.ts, circuit-breaker.test.ts, health-probe.test.ts, fallback-chain.test.ts, model-catalog.test.ts)*

---

## Sources

### Primary (HIGH confidence)
- `backend/src/routes/v1/bridge.ts` — gateway CRUD patterns, maskGatewayRow, mapRawToGatewayRow, credential upsert
- `backend/src/routes/v1/admin/index.ts` — auth hook pattern, route registration prefix
- `backend/src/routes/v1/admin/health.ts` — admin query style, ok() usage
- `backend/src/routes/v1/admin/users.ts` — pagination and pool.query() pattern
- `backend/src/services/bridge/routing-engine.ts` — logDispatch SSE emission, RoutingRuleRow types
- `backend/src/services/bridge/health-probe.ts` — bridge:health SSE emission, status determination
- `backend/src/services/bridge/circuit-breaker-registry.ts` — bridge:circuit-trip SSE emission, getBreakerState()
- `backend/src/services/bridge/model-catalog.ts` — calculateCostUsd, MODEL_METADATA, lookupMetadata
- `backend/src/db/schema.ts` — gateways, gateway_credentials, models, model_versions, bridge_dispatch_log, routing_rules Drizzle schema
- `backend/src/db/migrate-bridge-v4.ts` — confirmed ON DELETE CASCADE on models, cached_tokens column
- `backend/src/services/sse-hub.ts` — broadcast() implementation, confirmed single in-process hub
- `backend/src/services/bridge/types.ts` — RoutingRuleRow, RoutingRuleScope, RoutingRuleAction, DispatchLogEntry

### Secondary (MEDIUM confidence)
- STATE.md accumulated decisions — Phase 21 mapRawToGatewayRow duplication pattern, Phase 16 maskRow security guarantee

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools already in use, no new packages
- Architecture: HIGH — existing patterns are clear and consistent across 6+ admin files
- Pitfalls: HIGH — most identified directly from reading source (cascade FKs, circular imports, SSE event names)

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable codebase with clear conventions)
