# Phase 19: Model Catalog - Research

**Researched:** 2026-03-25
**Domain:** PostgreSQL schema design, adapter integration, scheduler-based background refresh, cost calculation
**Confidence:** HIGH

## Summary

Phase 19 is pure backend infrastructure: create a `models` table, populate it automatically from existing `listModels()` adapter calls, enrich each row with capability metadata and pricing, track model version history, and wire USD cost calculation into `bridge_dispatch_log`. All the plumbing already exists — the adapters already implement `listModels()`, the scheduler already runs a tick loop, the dispatch log already has `estimated_cost_usd`/`input_tokens`/`output_tokens` columns, and the migration chain is established (bridge_v1 → bridge_v2 → bridge_v3). Phase 19 adds bridge_v4 with the `models` and `model_versions` tables plus a `cached_tokens` column on `bridge_dispatch_log`, then wires a model-catalog service that is called from `startup-detector.ts` (post-gateway-detection) and from a new daily tick in `scheduler.ts`.

The design must accommodate two classes of gateways: **dynamic** (Ollama — real `listModels()` from `/api/tags`; OpenClaw — returns a static list from its config) and **static** (Claude CLI, Codex CLI, Gemini CLI — all return hardcoded arrays). Capability metadata and pricing cannot be discovered at runtime for any gateway; they must be seeded from a static knowledge table in the migration itself, keyed by model name prefix/exact match.

**Primary recommendation:** Implement as bridge_v4 migration + `model-catalog.ts` service + scheduler daily task + `logDispatch()` patch. Four focused files, no external dependencies.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
All implementation choices are at Claude's discretion — pure infrastructure phase.

Key constraints from requirements:
- MOD-01: Models table with gateway_id FK, model name, capability tags (coding, writing, analysis, vision), context window, pricing (input/output per M tokens), benchmarks
- MOD-02: Auto-population — query each gateway adapter's listModels() on detection and daily refresh
- MOD-03: Capability-based routing — model strengths inform routing engine selection, not just cost tier
- MOD-04: Model version tracking — detect updates, store version history, log version per dispatch
- MOD-05: Cost tracking per-dispatch — input/output/cached tokens + USD cost from model pricing metadata, logged to bridge_dispatch_log

### Claude's Discretion
All implementation choices.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MOD-01 | Models table in PostgreSQL with gateway_id FK, model name, capability tags (coding, writing, analysis, vision), context window, pricing (input/output per M tokens), benchmarks | bridge_v4 migration; Drizzle schema entry |
| MOD-02 | Auto-population from gateway adapters on detection and daily refresh | model-catalog.ts service called from startup-detector.ts + scheduler daily tick |
| MOD-03 | Capability-based routing — route by model strengths, not just cost tier | ModelRow.capabilities[] queried by routing-engine.ts selectAllCandidates() enhancement |
| MOD-04 | Model version tracking — detect updates, store version history, log which version per dispatch | model_versions table; upsert compares against current row; bridge_dispatch_log.model_version_id FK |
| MOD-05 | Cost tracking — input/output/cached tokens + USD cost logged to bridge_dispatch_log | cached_tokens column migration; logDispatch() patch to calculate cost from models table |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pg (node-postgres) | existing | Raw SQL for migration (boot-safe pattern) | Established pattern — all bridge migrations use raw SQL |
| drizzle-orm | existing | Drizzle table definition for schema.ts | Project standard; existing tables all defined here |
| node:crypto | built-in | UUID generation for model/version IDs | Already used in startup-detector.ts and routing-engine.ts |

### No New Dependencies
Phase 19 requires zero new npm packages. All needed libraries are already installed.

**Installation:** none required.

---

## Architecture Patterns

### Recommended Project Structure
New files for this phase:
```
backend/src/
├── db/
│   └── migrate-bridge-v4.ts      # new: models + model_versions + cached_tokens column
├── services/bridge/
│   └── model-catalog.ts           # new: upsertModels(), refreshAllGateways(), calculateCost()
```

Modified files:
```
backend/src/
├── db/schema.ts                   # add models + model_versions Drizzle table defs
├── index.ts                       # import + call migrateBridgeV4(pool)
├── services/bridge/
│   ├── startup-detector.ts        # call refreshModelsForGateway() after upsertGateway()
│   └── routing-engine.ts          # patch logDispatch() to calculate + write estimated_cost_usd
├── services/scheduler.ts          # add MODEL_REFRESH_INTERVAL constant + daily tick call
```

### Pattern 1: bridge_v4 Migration (Raw SQL, idempotent)
**What:** Creates `models`, `model_versions` tables and adds `cached_tokens` + `model_version_id` columns to `bridge_dispatch_log`. Same structure as bridge_v1/v2/v3.
**When to use:** Called in `start()` in index.ts, before gateway detection.
**Example:**
```typescript
// Pattern from migrate-bridge-v1.ts / migrate-bridge-v3.ts
export async function migrateBridgeV4(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'bridge_v4'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY,
        gateway_id TEXT NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
        model_name TEXT NOT NULL,
        capabilities JSONB DEFAULT '[]'::jsonb,   -- ['coding','writing','analysis','vision']
        context_window INTEGER,
        pricing_input_per_m DOUBLE PRECISION,      -- USD per 1M input tokens
        pricing_output_per_m DOUBLE PRECISION,     -- USD per 1M output tokens
        benchmark_scores JSONB DEFAULT '{}'::jsonb,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        UNIQUE(gateway_id, model_name)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS model_versions (
        id TEXT PRIMARY KEY,
        model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
        version_label TEXT NOT NULL,
        snapshot JSONB DEFAULT '{}'::jsonb,    -- full model row snapshot at version time
        detected_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_models_gateway ON models(gateway_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_models_active ON models(is_active)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_model_versions_model ON model_versions(model_id)`);

    -- Extend bridge_dispatch_log for MOD-05
    await client.query(`
      ALTER TABLE bridge_dispatch_log
        ADD COLUMN IF NOT EXISTS cached_tokens INTEGER,
        ADD COLUMN IF NOT EXISTS model_version_id TEXT
    `);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('bridge_v4')`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

### Pattern 2: model-catalog.ts Service
**What:** Contains three exported functions:
- `refreshModelsForGateway(pool, gatewayId, gatewayType, adapter)` — calls `adapter.listModels()`, upserts each into `models`, calls `detectVersionChange()` per model
- `refreshAllGateways(pool)` — daily refresh: queries all active gateways, instantiates adapters, calls `refreshModelsForGateway()` for each
- `calculateCostUsd(inputTokens, outputTokens, cachedTokens, modelName, pool)` — looks up pricing from `models` table, returns computed USD cost

**Version detection logic:**
```typescript
// On each upsert: compare new model_name + capabilities hash against existing row.
// If model_name is new to this gateway: INSERT model_versions with version_label = 'initial'
// If model was known but capabilities/context changed: INSERT model_versions with version_label = ISO timestamp
```

**Example — calculateCostUsd:**
```typescript
export async function calculateCostUsd(
  inputTokens: number | null,
  outputTokens: number | null,
  cachedTokens: number | null,
  modelName: string,
  pool: pg.Pool,
): Promise<number | null> {
  if (!inputTokens && !outputTokens) return null;
  const { rows } = await pool.query<{
    pricing_input_per_m: number | null;
    pricing_output_per_m: number | null;
  }>(
    `SELECT pricing_input_per_m, pricing_output_per_m
     FROM models WHERE model_name = $1 AND is_active = 1
     ORDER BY updated_at DESC LIMIT 1`,
    [modelName],
  );
  const pricing = rows[0];
  if (!pricing?.pricing_input_per_m && !pricing?.pricing_output_per_m) return null;
  const inputCost = ((inputTokens ?? 0) / 1_000_000) * (pricing.pricing_input_per_m ?? 0);
  const outputCost = ((outputTokens ?? 0) / 1_000_000) * (pricing.pricing_output_per_m ?? 0);
  // cached tokens typically billed at 10% of input price
  const cachedCost = ((cachedTokens ?? 0) / 1_000_000) * ((pricing.pricing_input_per_m ?? 0) * 0.1);
  return inputCost + outputCost + cachedCost;
}
```

### Pattern 3: Scheduler Daily Refresh
**What:** Add a `MODEL_REFRESH_INTERVAL` tick constant (43200 ticks = 24h at 2s each) and call `refreshAllGateways(pool)` fire-and-forget in `tick()`.
**When to use:** Same pattern as `HEALTH_PROBE_INTERVAL` (already in scheduler.ts).
```typescript
const MODEL_REFRESH_INTERVAL = 43200; // 24h × 3600s / 2s per tick

// Inside tick():
if (tickCount % MODEL_REFRESH_INTERVAL === 0) {
  refreshAllGateways(pool).catch(err =>
    console.error('[scheduler] model refresh error', err)
  );
}
```

### Pattern 4: startup-detector.ts Integration
**What:** After each successful `upsertGateway()` call, call `refreshModelsForGateway()`. This ensures models are populated on first boot without waiting 24h.
**Critical detail:** The adapter instance must be created from the gateway row. Use `createAdapter(row)` — but startup-detector.ts runs before DB is fully set up and doesn't have Drizzle. Use a lightweight inline approach: pass `gatewayType` and create adapter directly.

```typescript
// After each upsertGateway() in startup-detector.ts:
import { refreshModelsForGateway } from './model-catalog.js';

// After upsert call:
const { rows } = await pool.query(
  `SELECT id FROM gateways WHERE type = $1 AND source = $2`,
  [params.type, params.source]
);
if (rows[0]) {
  const adapter = createAdapter({ ...minimalRowFromParams, id: rows[0].id });
  if (adapter) {
    await refreshModelsForGateway(pool, rows[0].id, params.type, adapter);
  }
}
```

### Pattern 5: Routing Engine — Capability-Aware Selection (MOD-03)
**What:** Extend `selectAllCandidates()` to also load model capability data. When `ctx.requiredCapabilities` is set, filter candidates to those with matching model capabilities.
**When to use:** Only when `RoutingContext.requiredCapabilities` is non-empty.

```typescript
// In RoutingContext (types.ts — already has this field):
requiredCapabilities?: string[];   // e.g. ['vision', 'coding']

// In selectAllCandidates() enhancement:
// After loading candidates, if ctx.requiredCapabilities:
//   JOIN models table to check capabilities JSONB contains required tags
//   Filter out candidates whose active model lacks required capabilities
```

**Practical note:** For this phase, capability matching in `select()` is sufficient — routing-engine.ts already accepts `requiredCapabilities` in `RoutingContext` (types.ts line 112). The routing heuristic just needs to be extended to check model capabilities when the field is populated.

### Pattern 6: Static Capability Seed Data
**What:** The migration itself seeds a `model_capability_defaults` lookup structure used by `refreshModelsForGateway()` to enrich model rows that lack dynamic capability data. CLI adapters return static model names — their capabilities, context windows, and pricing are known.

```typescript
// In model-catalog.ts — static seed map:
const MODEL_METADATA: Record<string, {
  capabilities: string[];
  contextWindow: number;
  pricingInputPerM: number | null;
  pricingOutputPerM: number | null;
  benchmarkScores: Record<string, number>;
}> = {
  // Claude models (claude_cli adapter)
  'claude-opus-4-6':   { capabilities: ['coding','writing','analysis'], contextWindow: 200_000, pricingInputPerM: 15.0, pricingOutputPerM: 75.0, benchmarkScores: {} },
  'claude-sonnet-4-6': { capabilities: ['coding','writing','analysis'], contextWindow: 200_000, pricingInputPerM: 3.0, pricingOutputPerM: 15.0, benchmarkScores: {} },
  'claude-haiku-3-5':  { capabilities: ['coding','writing'], contextWindow: 200_000, pricingInputPerM: 0.25, pricingOutputPerM: 1.25, benchmarkScores: {} },

  // OpenClaw / GPT-5.4
  'openai-codex/gpt-5.4': { capabilities: ['coding','analysis'], contextWindow: 128_000, pricingInputPerM: null, pricingOutputPerM: null, benchmarkScores: {} },
  'gpt-5.4':               { capabilities: ['coding','analysis'], contextWindow: 128_000, pricingInputPerM: null, pricingOutputPerM: null, benchmarkScores: {} },

  // Gemini
  'gemini-2.5-pro':   { capabilities: ['coding','writing','analysis','vision'], contextWindow: 1_000_000, pricingInputPerM: 1.25, pricingOutputPerM: 10.0, benchmarkScores: {} },
  'gemini-2.5-flash': { capabilities: ['coding','writing','analysis'], contextWindow: 1_000_000, pricingInputPerM: 0.075, pricingOutputPerM: 0.30, benchmarkScores: {} },
  'auto-gemini-3':    { capabilities: ['coding','writing','analysis'], contextWindow: 1_000_000, pricingInputPerM: null, pricingOutputPerM: null, benchmarkScores: {} },

  // Ollama models (dynamic — fallback defaults for unknown qwen/llama models)
  'qwen2.5-coder:1.5b': { capabilities: ['coding'], contextWindow: 32_768, pricingInputPerM: 0.0, pricingOutputPerM: 0.0, benchmarkScores: {} },
};

// For unknown Ollama models not in the map: default to { capabilities: ['chat'], contextWindow: 32768, pricing: 0 }
```

### Anti-Patterns to Avoid
- **Don't query models table in the hot dispatch path**: `calculateCostUsd()` is fire-and-forget inside `logDispatch()`, same as existing log pattern. Never await it before returning the response.
- **Don't block startup on model refresh**: `refreshModelsForGateway()` must be called with `.catch()` — never block `detectAndUpsertGateways()`.
- **Don't use Drizzle for the migration**: Raw SQL only — migration runs before Drizzle is fully initialized (established project pattern).
- **Don't add `model_version_id` FK constraint on bridge_dispatch_log**: This is a soft reference only (no ON DELETE CASCADE) — log rows outlive version history.
- **Don't create a separate `model-catalog-refresh` job type** in agent_jobs: Use the scheduler tick directly, same as `health-probe`. The jobs system is for agent work, not infrastructure tasks.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cost calculation formula | Custom pricing engine | Simple arithmetic from `models.pricing_*` columns | Pricing is per-million-tokens — three multiplications. No library needed. |
| Model discovery | Custom provider API calls | Each adapter's existing `listModels()` | Already returns `string[]`, already handles errors gracefully |
| Job scheduling for daily refresh | New agent_jobs trigger type | scheduler.ts tick interval | Matches health probe pattern exactly; no DB overhead |
| Model ID generation | External UUID library | `node:crypto.randomUUID()` | Already used everywhere in bridge code |

**Key insight:** Every building block already exists. This phase is wiring, not building.

---

## Common Pitfalls

### Pitfall 1: Circular Import Between model-catalog.ts and startup-detector.ts
**What goes wrong:** `startup-detector.ts` imports `model-catalog.ts`; `model-catalog.ts` imports `createAdapter` from `adapters/index.ts`; adapters import from `types.ts`. This is fine — no cycle. But if `model-catalog.ts` also imports `startup-detector.ts`, there is a cycle.
**Why it happens:** Developer tries to share the `upsertGateway()` helper.
**How to avoid:** `model-catalog.ts` takes `gatewayId` and `adapter` as parameters — it never reads from gateways itself during a single-gateway refresh.

### Pitfall 2: startup-detector.ts Runs Before models Table Exists
**What goes wrong:** `detectAndUpsertGateways()` is called after migrations in `index.ts` (line 136), so models table will exist. But if the order in index.ts is changed, `refreshModelsForGateway()` fails with "relation models does not exist".
**Why it happens:** Careless ordering.
**How to avoid:** `refreshModelsForGateway()` must be tolerant of table-not-found — wrap in try/catch that logs and continues, same as `detectAndUpsertGateways()` itself.

### Pitfall 3: model_name Uniqueness Across Gateways
**What goes wrong:** Both `openclaw` and `codex_cli` report `gpt-5.4`. `UNIQUE(gateway_id, model_name)` handles this correctly. But a naive query for pricing by model_name alone (without gateway filter) returns multiple rows.
**Why it happens:** `calculateCostUsd()` does `WHERE model_name = $1` without a gateway filter.
**How to avoid:** `calculateCostUsd()` should prefer the row matching the dispatch's `gateway_type`. Either pass `gatewayId` to the function, or use `ORDER BY is_active DESC, updated_at DESC LIMIT 1` as fallback.

### Pitfall 4: listModels() for CLI Adapters Returns Static Arrays
**What goes wrong:** Developer assumes all adapters will return live model lists and writes code that flags static lists as "stale" on refresh.
**Why it happens:** Confusing dynamic (Ollama) with static (CLI) adapters.
**How to avoid:** All `listModels()` return strings — treat all equally. Static lists will always return the same values on refresh, which means `upsert` will just update `updated_at` and no version change will be detected. This is correct behavior.

### Pitfall 5: Version Detection False Positives
**What goes wrong:** A version change is logged every refresh because the comparison isn't stable (e.g., JSON.stringify() of arrays produces different orderings).
**Why it happens:** Comparing capability arrays as JSON strings without sorting.
**How to avoid:** Normalize before comparing: sort capability arrays, sort benchmark score keys.

### Pitfall 6: logDispatch() Cost Calculation Blocking
**What goes wrong:** Adding `await calculateCostUsd()` before the INSERT makes dispatch logging synchronous — violates fire-and-forget contract.
**Why it happens:** Forgetting the async IIFE pattern.
**How to avoid:** The entire logDispatch() body is already inside `(async () => { ... })()`. The `calculateCostUsd()` call goes inside this IIFE, before the INSERT. Never awaited by the caller.

---

## Code Examples

Verified patterns from existing codebase:

### Migration Guard Pattern (from migrate-bridge-v3.ts)
```typescript
const check = await client.query(
  `SELECT 1 FROM schema_migrations WHERE id = 'bridge_v4'`
);
if (check.rowCount && check.rowCount > 0) {
  await client.query('COMMIT');
  return;
}
```

### Fire-and-Forget Logging Pattern (from routing-engine.ts:233)
```typescript
// logDispatch() — fire-and-forget
(async () => {
  try {
    // calculateCostUsd here — safe, inside the IIFE
    const costUsd = await calculateCostUsd(
      result.inputTokens ?? null,
      result.outputTokens ?? null,
      result.cachedTokens ?? null,
      decision.modelName,
      pool,
    );
    await pool.query(
      `INSERT INTO bridge_dispatch_log (..., estimated_cost_usd, cached_tokens) VALUES (...)`,
      [..., costUsd, result.cachedTokens ?? null],
    );
  } catch {
    // Non-critical — never block dispatch
  }
})();
```

### Scheduler Tick Pattern (from scheduler.ts:231)
```typescript
// Health probe fires every 30s — same pattern for model refresh at 24h
if (tickCount > HEALTH_PROBE_INTERVAL && tickCount % HEALTH_PROBE_INTERVAL === 0) {
  runHealthProbe().catch(err => console.error('[scheduler] health probe error', err));
}
// Model catalog refresh — every 24h
if (tickCount > 0 && tickCount % MODEL_REFRESH_INTERVAL === 0) {
  refreshAllGateways(pool).catch(err => console.error('[scheduler] model refresh error', err));
}
```

### Upsert With Conflict Pattern (from startup-detector.ts:129)
```typescript
await pool.query(
  `INSERT INTO models (id, gateway_id, model_name, capabilities, ...)
   VALUES ($1, $2, $3, $4, ...)
   ON CONFLICT (gateway_id, model_name)
   DO UPDATE SET
     capabilities = EXCLUDED.capabilities,
     updated_at   = EXTRACT(EPOCH FROM NOW())`,
  [id, gatewayId, modelName, JSON.stringify(capabilities), ...],
);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| estimated_cost_usd = null in logDispatch() | Calculated from models table at dispatch time | Phase 19 | Cost tracking enabled |
| Routing uses gateway priority + message complexity heuristic | Routing also checks model capabilities (requiredCapabilities) | Phase 19 | Smarter task-type routing |
| Models unknown until Phase 22 admin surface | Models discoverable via DB query immediately | Phase 19 | Admin surface can show catalog |

**Placeholder comment in routing-engine.ts to patch:**
Line 248: `null, // estimated_cost_usd — Phase 19 models table not yet available`
This comment marks the exact INSERT position to patch.

---

## Open Questions

1. **Should `BridgeDispatchResult` gain a `cachedTokens` field?**
   - What we know: The interface currently has `inputTokens`, `outputTokens`, `tokensUsed` — no `cachedTokens`. Claude API does return cache read/write token counts.
   - What's unclear: Whether any current adapter actually extracts `cachedTokens` from API responses.
   - Recommendation: Add `cachedTokens?: number` to `BridgeDispatchResult` in types.ts. Initialize to undefined in all adapters. Wire in ClaudeCLIAdapter only if the JSON output contains cache data.

2. **How granular should version labels be?**
   - What we know: MOD-04 says "detect when models update" — but models in Porter are identified by name string (e.g., `claude-sonnet-4-6`), not by version number. The CLI adapters return the same names always.
   - What's unclear: What constitutes a "version change" for models with fixed names?
   - Recommendation: A version change = any change to capabilities, context_window, or pricing for a known model_name. Use ISO timestamp as version label (e.g., `2026-03-25T10:00:00Z`). On first insert, label = `'initial'`.

3. **Should `refreshAllGateways()` also mark models as inactive when a gateway goes stale?**
   - What we know: Gateways can transition to `stale` status. Their models remain valid in the catalog.
   - What's unclear: Whether `is_active` on models should mirror gateway status.
   - Recommendation: Do NOT cascade stale gateway status to models. Models remain in the catalog as historical data. Only set `is_active = 0` when a model disappears from a healthy gateway's `listModels()` response.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test + tsx (Node.js built-in test runner) |
| Config file | none — run directly via tsx |
| Quick run command | `cd /home/lobster/documents/porter/backend && npx tsx --test src/__tests__/model-catalog.test.ts` |
| Full suite command | `cd /home/lobster/documents/porter/backend && npx tsx --test src/__tests__/*.test.ts` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MOD-01 | models table created with correct columns by bridge_v4 | unit (migration) | `npx tsx --test src/__tests__/model-catalog.test.ts` | Wave 0 |
| MOD-02 | refreshModelsForGateway() upserts models from listModels() response | unit | `npx tsx --test src/__tests__/model-catalog.test.ts` | Wave 0 |
| MOD-02 | refreshAllGateways() iterates active gateways and calls refresh per gateway | unit | `npx tsx --test src/__tests__/model-catalog.test.ts` | Wave 0 |
| MOD-03 | RoutingEngine.select() filters candidates by requiredCapabilities | unit | `npx tsx --test src/__tests__/routing-engine.test.ts` | exists (todos) |
| MOD-04 | Version record inserted when model first seen | unit | `npx tsx --test src/__tests__/model-catalog.test.ts` | Wave 0 |
| MOD-04 | Version record inserted when model capabilities change | unit | `npx tsx --test src/__tests__/model-catalog.test.ts` | Wave 0 |
| MOD-05 | calculateCostUsd() returns correct USD value from pricing metadata | unit | `npx tsx --test src/__tests__/model-catalog.test.ts` | Wave 0 |
| MOD-05 | logDispatch() writes estimated_cost_usd and cached_tokens to bridge_dispatch_log | unit | `npx tsx --test src/__tests__/dispatch-log.test.ts` | exists (todos) |

### Sampling Rate
- **Per task commit:** `npx tsx --test src/__tests__/model-catalog.test.ts`
- **Per wave merge:** `npx tsx --test src/__tests__/*.test.ts`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/__tests__/model-catalog.test.ts` — covers MOD-01, MOD-02, MOD-04, MOD-05
- [ ] `backend/src/__tests__/dispatch-log.test.ts` — extend existing file (has todos) for MOD-05 cost field
- [ ] `backend/src/__tests__/routing-engine.test.ts` — extend existing file (has todos) for MOD-03 capability filter

---

## Integration Touch Points (Summary for Planner)

The planner should organize tasks into these logical waves:

| Wave | Files Changed | What It Delivers |
|------|---------------|-----------------|
| Wave 0 | `backend/src/__tests__/model-catalog.test.ts` (new) | Test stubs for all MOD-* requirements |
| Wave 1 | `migrate-bridge-v4.ts` (new), `schema.ts` (append), `index.ts` (add import+call) | MOD-01 — tables exist in DB |
| Wave 2 | `model-catalog.ts` (new), `startup-detector.ts` (patch), `scheduler.ts` (patch) | MOD-02 — auto-population wired |
| Wave 3 | `types.ts` (cachedTokens field), `routing-engine.ts` (logDispatch patch + capability filter) | MOD-03 + MOD-04 + MOD-05 |

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `/home/lobster/documents/porter/backend/src/services/bridge/types.ts` — GatewayAdapter interface, BridgeDispatchResult, RoutingContext
- Direct code inspection: `/home/lobster/documents/porter/backend/src/services/bridge/routing-engine.ts` — logDispatch() fire-and-forget pattern, cost null comment at line 248
- Direct code inspection: `/home/lobster/documents/porter/backend/src/services/bridge/startup-detector.ts` — upsertGateway() raw SQL pattern, ON CONFLICT partial index usage
- Direct code inspection: `/home/lobster/documents/porter/backend/src/db/migrate-bridge-v1.ts`, `v2.ts`, `v3.ts` — established migration pattern
- Direct code inspection: `/home/lobster/documents/porter/backend/src/services/scheduler.ts` — tick loop, HEALTH_PROBE_INTERVAL pattern
- Direct code inspection: all 5 adapter `listModels()` implementations — Ollama dynamic, all CLI static

### Secondary (MEDIUM confidence)
- Pricing data for Claude, Gemini models — from Anthropic/Google public pricing pages (knowledge cutoff August 2025); verify current prices before seeding
- `cachedTokens` in Claude API — from Anthropic prompt caching documentation

### Tertiary (LOW confidence)
- Gemini model names `auto-gemini-3` — returned by existing GeminiCLIAdapter.listModels(); may be outdated by the time phase executes

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, all patterns verified from existing code
- Architecture: HIGH — all patterns directly traced to existing bridge service files
- Pitfalls: HIGH — identified from actual adapter implementations and existing logDispatch() comment
- Pricing seed data: MEDIUM — model names verified, pricing figures from training knowledge (should be validated before final seed)

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable infrastructure; only model pricing figures may drift)
