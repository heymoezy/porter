# Phase 40: Gateway Capability Registry — Research

**Researched:** 2026-04-02
**Domain:** Bridge layer — gateway capability schema, task dispatch routing, tool schema filtering
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — all implementation choices are at Claude's discretion.

### Claude's Discretion
- Capability schema on gateways table (JSONB or dedicated columns)
- Strength categories (reasoning, coding, analysis, writing, speed, cost)
- Cost tier enum (premium, standard, budget)
- Tool support detection (which tools each gateway can handle)
- Dynamic tool filtering before dispatch
- Capability matching algorithm for task routing

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GWC-01 | Each gateway has a capabilities registry (strengths, cost_tier, context_window, tool_support, agentic flag) | `gateways.capabilities` is already JSONB — add structured fields to it; `gateways.metadata` carries `binary_path`, `version` — new fields go alongside |
| GWC-02 | Task dispatch selects gateway based on task requirements matched against capabilities | `tasks.ts` auto-selects by `priority ASC` with no capability awareness — must add capability-based filtering before the priority sort |
| GWC-03 | Dynamic tool schema — only send tools that the target gateway actually supports | `http-task-executor.ts` always sends all `PORTER_TOOLS` — needs gateway-aware filtering; CLI executors pass `--allowedTools` flags but don't yet filter by registry |
| GWC-04 | All 5 gateways work through task dispatch with tool execution | CLI path (`task-executor.ts`) handles claude/gemini/codex but `buildTaskArgs` throws for anything else; HTTP path (`http-task-executor.ts`) handles openclaw/ollama — both paths exist but Ollama has no `--allowedTools` concept, and Gemini/Codex tool support is limited |
</phase_requirements>

---

## Summary

Phase 39 built the task dispatch infrastructure: `bridge_tasks` table, CLI executor (`task-executor.ts`), HTTP agent-loop executor (`http-task-executor.ts`), and the `/api/v1/tasks/dispatch` route. All 5 gateway types are already wired and task-capable (`TASK_CAPABLE_TYPES` covers all 5, `HTTP_TASK_CAPABLE_TYPES` covers openclaw/ollama). What's missing is a structured capability record that tells the system _what each gateway is good at_, how expensive it is, what its context limit is, whether it supports tools natively, and whether it's agentic.

The `gateways` table already has a `capabilities JSONB` column, currently storing flat string arrays like `["chat", "code", "streaming", "tool_use"]`. This is the right column to evolve — the plan is to replace that flat array with a richer structured object while keeping backward compatibility for anything that reads the old format.

The task dispatch route (`tasks.ts`) today selects gateways purely by `status = 'active' AND enabled = 1 ORDER BY priority ASC` with no capability awareness. The routing engine's `filterByCapabilities()` method exists but only looks at the `models` table, not the `gateways` table directly. Phase 40 must wire capability-based selection into task dispatch and make the tool schema sent to HTTP gateways dynamic.

**Primary recommendation:** Evolve `gateways.capabilities` from a string array to a structured JSONB object. Populate it in `startup-detector.ts`. Add a capability-matching step in `tasks.ts` dispatch before the priority sort. Filter `PORTER_TOOLS` in `http-task-executor.ts` based on the gateway's `tool_support` field.

---

## Standard Stack

### Core (already present — no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pg` (node-postgres) | ~8.x | Raw SQL queries for all bridge DB work | Already the DB client throughout bridge layer |
| `p-queue` | ~8.x | Per-gateway task concurrency | Already in `task-executor.ts` |
| TypeScript | ~5.x | Type safety for capability schema | Project standard |

No new npm packages are required. This is a pure schema + logic evolution on top of what already exists.

**Version verification:** Not applicable — no new packages.

---

## Architecture Patterns

### Recommended Project Structure

The work spans three layers:

```
backend/src/
├── db/
│   └── migrate-bridge-v7.ts          # NEW: add structured capabilities to gateways
├── services/bridge/
│   ├── capability-registry.ts        # NEW: GATEWAY_CAPABILITY_REGISTRY constant map
│   ├── startup-detector.ts           # MODIFY: populate structured capabilities on upsert
│   ├── task-executor.ts              # MODIFY: accept optional tools filter, pass --allowedTools
│   ├── http-task-executor.ts         # MODIFY: filter PORTER_TOOLS by gateway tool_support
│   └── types.ts                      # MODIFY: add GatewayCapabilityRecord type
└── routes/v1/
    └── tasks.ts                      # MODIFY: capability-aware gateway selection
```

### Pattern 1: Structured JSONB Capability Record

**What:** Replace `capabilities: string[]` with a structured object stored in the same JSONB column. The column type does not change — only the shape of the data written to it.

**When to use:** Always for all 5 gateways, populated at startup detection time.

**Schema:**

```typescript
// Source: designed from GWC-01 requirements
interface GatewayCapabilityRecord {
  // Legacy flat array kept for backward compat (routing-engine.ts reads this)
  legacy_tags: string[];          // e.g. ["chat", "code", "streaming", "tool_use"]

  // GWC-01 required fields
  strengths: string[];            // ["reasoning", "coding", "analysis", "writing"] (subset)
  cost_tier: 'premium' | 'standard' | 'budget';
  context_window: number;         // tokens
  tool_support: 'full' | 'limited' | 'none';
  agentic: boolean;               // can self-direct multi-step work
}
```

**Strength vocabulary** (closed set — controls routing decisions):
- `reasoning` — strong at multi-step logical deduction, planning
- `coding` — strong at code generation, debugging, refactoring
- `analysis` — strong at document analysis, summarization, data interpretation
- `writing` — strong at prose generation, tone matching
- `vision` — can process images (future use)

**Why JSONB and not dedicated columns:** The `gateways` table already uses JSONB for capabilities. Adding new columns would require a schema migration that touches all existing rows. Structured JSONB in a single column is equally queryable via Postgres `->>` operators and keeps the migration simpler. The existing `GatewayRow.capabilities` type is `string[]` — this will be changed to `GatewayCapabilityRecord | string[]` with a runtime normalizer.

### Pattern 2: Capability Registry Constant Map

**What:** A static `GATEWAY_CAPABILITY_REGISTRY` in a new `capability-registry.ts` file defines the ground-truth capabilities for each gateway type. `startup-detector.ts` reads from this map when upserting gateways.

**Why:** Capabilities are known at build time. Probing them dynamically adds latency and unreliability. The registry is the single source of truth; the DB is just the persisted copy.

```typescript
// Source: capability analysis from phase context + current DB state
export const GATEWAY_CAPABILITY_REGISTRY: Record<GatewayType, GatewayCapabilityRecord> = {
  claude_cli: {
    legacy_tags: ['chat', 'code', 'streaming', 'tool_use'],
    strengths: ['reasoning', 'coding', 'analysis', 'writing'],
    cost_tier: 'premium',
    context_window: 200_000,
    tool_support: 'full',
    agentic: true,
  },
  codex_cli: {
    legacy_tags: ['code', 'streaming'],
    strengths: ['coding'],
    cost_tier: 'premium',
    context_window: 128_000,
    tool_support: 'full',
    agentic: true,
  },
  gemini_cli: {
    legacy_tags: ['chat', 'code', 'streaming'],
    strengths: ['reasoning', 'coding', 'analysis', 'writing'],
    cost_tier: 'standard',
    context_window: 1_000_000,
    tool_support: 'full',
    agentic: true,
  },
  openclaw: {
    legacy_tags: ['chat', 'code', 'streaming'],
    strengths: ['reasoning', 'coding', 'analysis'],
    cost_tier: 'premium',
    context_window: 128_000,
    tool_support: 'full',
    agentic: true,
  },
  ollama: {
    legacy_tags: ['chat', 'code', 'streaming'],
    strengths: ['coding'],
    cost_tier: 'budget',
    context_window: 32_768,
    tool_support: 'limited',
    agentic: false,
  },
  openai_compat: {
    legacy_tags: ['chat', 'code', 'streaming'],
    strengths: ['coding', 'analysis'],
    cost_tier: 'standard',
    context_window: 128_000,
    tool_support: 'full',
    agentic: false,
  },
};
```

### Pattern 3: Capability-Aware Task Dispatch Selection

**What:** The auto-selection path in `tasks.ts` currently picks the first `priority ASC` active gateway. Add a capability-filter step before priority ranking when the caller passes `required_strengths` or `cost_tier_max`.

**Current code path (tasks.ts ~line 392-419):**
```typescript
// AUTO-SELECT: pick highest-priority active task-capable gateway
const taskCapable = rows.filter((r) => TASK_CAPABLE_TYPES.has(r.type as GatewayType));
const chosen = taskCapable[0];  // purely priority-based
```

**Target code path:**
```typescript
// AUTO-SELECT: filter by requested capabilities, then by priority
const taskCapable = rows.filter((r) => TASK_CAPABLE_TYPES.has(r.type as GatewayType));
const capFiltered = filterByTaskCapabilities(taskCapable, requiredStrengths, costTierMax);
const chosen = capFiltered[0];  // still priority-based within capability set
```

### Pattern 4: Dynamic Tool Schema Filtering

**What:** `http-task-executor.ts` always sends all 4 `PORTER_TOOLS` (`read_file`, `write_file`, `list_directory`, `run_command`). For gateways with `tool_support: 'limited'` or `tool_support: 'none'`, strip the tools array before the model call.

**Ollama tool support reality:** Qwen 2.5 Coder 1.5B does support function calling via the OpenAI compat endpoint, but it is unreliable on complex multi-tool tasks. The safe approach is `tool_support: 'limited'` — allow `read_file` and `list_directory` only (read-only tools), exclude `write_file` and `run_command`.

**Implementation in `executeHttpTask`:**
```typescript
// Filter tools by gateway capability before calling the model
const effectiveTools = filterToolsBySupport(PORTER_TOOLS, config.toolSupport);
// ...
body: JSON.stringify({
  model: config.model,
  messages,
  tools: effectiveTools.length > 0 ? effectiveTools : undefined,
  tool_choice: effectiveTools.length > 0 ? 'auto' : undefined,
  // ...
})
```

**Tool filtering map:**
```typescript
function filterToolsBySupport(
  tools: typeof PORTER_TOOLS,
  support: 'full' | 'limited' | 'none'
): typeof PORTER_TOOLS {
  if (support === 'none') return [];
  if (support === 'limited') return tools.filter(t =>
    ['read_file', 'list_directory'].includes(t.function.name)
  );
  return tools; // 'full' — all tools
}
```

### Pattern 5: CLI Tool Allowlist via --allowedTools

**What:** Claude CLI supports `--allowedTools` flag to limit which tools the subprocess can use. Currently `task-executor.ts` does not pass this flag. When a `tools` array is given in `TaskRequest`, translate it to `--allowedTools` for claude_cli.

**Current buildTaskArgs for claude_cli:**
```typescript
args: ['-p', '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose', '--no-session-persistence']
```

**Target:**
```typescript
// If tool allowlist is specified, append --allowedTools
const allowedToolsArgs = tools?.length
  ? ['--allowedTools', tools.join(',')]
  : [];
args: ['-p', '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', ...allowedToolsArgs]
```

Note: Gemini CLI uses `--yolo` which grants full autonomy — no per-tool filtering available. Codex CLI uses `--dangerously-bypass-approvals-and-sandbox` — similarly no per-tool filtering. For these CLIs, tool filtering is handled at the routing level (don't dispatch tasks requiring restricted tools to these gateways).

### Recommended Capability Matching Algorithm

```typescript
/**
 * Filter task-capable gateway rows by requested capability constraints.
 * Falls back to full candidate list if no candidates match (graceful degradation).
 */
function filterByTaskCapabilities(
  candidates: GatewayDbRow[],
  requiredStrengths: string[],   // e.g. ["reasoning", "coding"]
  costTierMax?: 'premium' | 'standard' | 'budget',
): GatewayDbRow[] {
  const COST_TIER_RANK = { premium: 2, standard: 1, budget: 0 };
  const maxRank = costTierMax ? COST_TIER_RANK[costTierMax] : 2;

  const filtered = candidates.filter(row => {
    const caps = normalizeCapabilities(row.capabilities);
    if (!(caps instanceof Object && 'strengths' in caps)) return true; // no structured caps yet — don't filter

    const tierOk = COST_TIER_RANK[caps.cost_tier] <= maxRank;
    const strengthOk = requiredStrengths.every(s => caps.strengths.includes(s));
    return tierOk && strengthOk;
  });

  return filtered.length > 0 ? filtered : candidates; // graceful degradation
}
```

### Anti-Patterns to Avoid

- **Don't add dedicated columns for cost_tier/agentic/etc to the gateways table.** The schema already has `capabilities JSONB` — using it avoids a multi-column migration and keeps the shape extensible. Use Postgres `->>` for queries.
- **Don't make capability filtering hard-fail.** If no gateway matches required capabilities, fall back to priority-based selection (graceful degradation). The system should never return 503 due to capability mismatch alone.
- **Don't probe tool support dynamically at runtime.** It adds latency. Use the static registry.
- **Don't change `GatewayRow.capabilities` type from `string[]` to `GatewayCapabilityRecord` directly in `types.ts`.** Too many callers (routing-engine, startup-detector, admin/bridge, model-catalog) read `capabilities` as `string[]`. Add a `capabilityRecord` field to `GatewayRow` or normalize at read time with a helper.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Capability comparison logic | Custom scoring system | Simple string set intersection + cost tier rank | Requirements are clear and bounded — a fancy scorer adds complexity with no benefit at this scale |
| Tool capability detection | Runtime probing / test calls | Static registry constant | Tool support is a property of the gateway type, not its runtime state |
| Schema migration | Drizzle `migrate:generate` flow | Raw SQL migration in `migrate-bridge-v7.ts` pattern | All existing migrations use raw SQL with idempotency guards — consistent with the pattern |

---

## Common Pitfalls

### Pitfall 1: Breaking `routing-engine.filterByCapabilities()`
**What goes wrong:** `routing-engine.ts` reads `capabilities` from the `models` table as a `string[]`. `startup-detector.ts` writes `capabilities` to the `gateways` table. If you change the write format in startup-detector without updating all readers, you get JSON parse failures or empty capability matches.
**Why it happens:** Two separate `capabilities` columns exist — one on `gateways` and one on `models`. The routing engine's `filterByCapabilities` reads from `models`, not `gateways`. They are independent.
**How to avoid:** Keep `models.capabilities` as a flat `string[]` (it's already correctly populated by `model-catalog.ts`). Only evolve `gateways.capabilities` to the structured format. Normalize `gateways.capabilities` at read time with a `normalizeCapabilities()` helper that handles both old flat arrays and new objects.
**Warning signs:** TypeScript errors on `caps.includes()` calls after changing the shape.

### Pitfall 2: Ollama Tool Call Failures
**What goes wrong:** Qwen 2.5 Coder 1.5B sometimes returns malformed `arguments` JSON in tool calls, or calls non-existent tools, or loops infinitely on tool errors.
**Why it happens:** Small local models have limited instruction-following fidelity for function calling.
**How to avoid:** Mark Ollama as `tool_support: 'limited'`. In `http-task-executor.ts`, only send read-only tools (`read_file`, `list_directory`) to Ollama. The `MAX_TOOL_ROUNDS = 20` guard already prevents infinite loops.
**Warning signs:** Ollama tasks that loop and timeout without producing output.

### Pitfall 3: `tasks.ts` Reads `metadata` for Binary Path — Must Preserve
**What goes wrong:** The binary path for CLI gateways lives in `gateways.metadata.binary_path`. When writing structured capabilities to `gateways.metadata`, accidentally overwriting the binary path breaks CLI subprocess spawn.
**Why it happens:** Both `metadata` and `capabilities` are JSONB on `gateways`. If you migrate `binary_path` into `capabilities`, `tasks.ts` line 383 `(meta.binary_path as string)` breaks.
**How to avoid:** Keep `binary_path` and `version` in `metadata` as they are. Only write to `capabilities`. Do not move fields between the two columns.
**Warning signs:** `spawn ENOENT` errors in task execution after the migration.

### Pitfall 4: Migration Idempotency
**What goes wrong:** Running `migrate-bridge-v7.ts` twice on a DB that already has structured capabilities resets them to defaults.
**Why it happens:** The migration calls `UPDATE gateways SET capabilities = ...` without checking whether the structured data already exists.
**How to avoid:** Check `schema_migrations` for `bridge_v7` at migration start — standard pattern used by all existing migrations. Alternatively, only run `UPDATE` where `capabilities` is not already a structured object (check for presence of `cost_tier` key).
**Warning signs:** Capabilities reset to defaults after every restart.

### Pitfall 5: Admin Bridge Panel Displays `capabilities`
**What goes wrong:** `admin/bridge.ts` returns `capabilities: row.capabilities ?? []` to the frontend. After changing capabilities to an object, the frontend receives `{}` where it expected `[]` and renders nothing or crashes.
**Why it happens:** The frontend Bridge panel likely renders capability tags from the flat array.
**How to avoid:** The `maskGatewayRow()` function in `admin/bridge.ts` can normalize the capabilities object to a flat tag list for display purposes, or the frontend can be updated to understand the new shape. The planner should decide whether frontend update is in scope for this phase.
**Warning signs:** Bridge admin panel shows empty capability badges.

---

## Code Examples

### Migration Pattern (bridge_v7)

```typescript
// Source: pattern from migrate-bridge-v6.ts
export async function migrateBridgeV7(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'bridge_v7'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // Update each gateway type with its structured capability record
    // Uses JSONB merge to avoid overwriting metadata on gateways
    // Only runs if capability record is not already structured (idempotent inner guard)
    await client.query(`
      UPDATE gateways SET
        capabilities = jsonb_build_object(
          'legacy_tags', capabilities,
          'strengths', CASE type
            WHEN 'claude_cli' THEN '["reasoning","coding","analysis","writing"]'::jsonb
            WHEN 'codex_cli'  THEN '["coding"]'::jsonb
            WHEN 'gemini_cli' THEN '["reasoning","coding","analysis","writing"]'::jsonb
            WHEN 'openclaw'   THEN '["reasoning","coding","analysis"]'::jsonb
            WHEN 'ollama'     THEN '["coding"]'::jsonb
            ELSE '["coding"]'::jsonb
          END,
          'cost_tier', CASE type
            WHEN 'claude_cli' THEN 'premium'
            WHEN 'codex_cli'  THEN 'premium'
            WHEN 'openclaw'   THEN 'premium'
            WHEN 'gemini_cli' THEN 'standard'
            WHEN 'ollama'     THEN 'budget'
            ELSE 'standard'
          END,
          'context_window', CASE type
            WHEN 'claude_cli' THEN 200000
            WHEN 'codex_cli'  THEN 128000
            WHEN 'gemini_cli' THEN 1000000
            WHEN 'openclaw'   THEN 128000
            WHEN 'ollama'     THEN 32768
            ELSE 128000
          END,
          'tool_support', CASE type
            WHEN 'ollama' THEN 'limited'
            ELSE 'full'
          END,
          'agentic', CASE type
            WHEN 'ollama' THEN false
            ELSE true
          END
        )
      WHERE capabilities IS NULL OR jsonb_typeof(capabilities) = 'array'
    `);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('bridge_v7')`);
    await client.query('COMMIT');
    console.log('[migrate-bridge] bridge_v7 applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

### normalizeCapabilities() Helper

```typescript
// Source: designed for backward compat with routing-engine.ts
export interface GatewayCapabilityRecord {
  legacy_tags: string[];
  strengths: string[];
  cost_tier: 'premium' | 'standard' | 'budget';
  context_window: number;
  tool_support: 'full' | 'limited' | 'none';
  agentic: boolean;
}

export function normalizeCapabilities(
  raw: unknown
): GatewayCapabilityRecord | null {
  if (Array.isArray(raw)) {
    // Old flat format — return null so callers know it's not yet structured
    return null;
  }
  if (raw && typeof raw === 'object' && 'cost_tier' in raw) {
    return raw as GatewayCapabilityRecord;
  }
  return null;
}

/** Get legacy tags (for routing-engine compatibility) */
export function getLegacyTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  const rec = normalizeCapabilities(raw);
  return rec?.legacy_tags ?? [];
}
```

### Task Dispatch — Capability-Aware Selection

```typescript
// In tasks.ts, replace the auto-select block
const body_required_strengths = body.required_strengths as string[] | undefined;
const body_cost_tier_max = body.cost_tier_max as 'premium' | 'standard' | 'budget' | undefined;

const taskCapable = rows.filter((r) => TASK_CAPABLE_TYPES.has(r.type as GatewayType));

// GWC-02: Filter by required strengths and cost tier when specified
let capFiltered = taskCapable;
if (body_required_strengths?.length || body_cost_tier_max) {
  const COST_RANK = { premium: 2, standard: 1, budget: 0 } as const;
  const maxRank = body_cost_tier_max ? COST_RANK[body_cost_tier_max] : 2;

  const filtered = taskCapable.filter(row => {
    const caps = typeof row.capabilities === 'object' && !Array.isArray(row.capabilities)
      ? row.capabilities as Record<string, unknown>
      : null;
    if (!caps || !('cost_tier' in caps)) return true; // unstructured — don't filter out

    const tierRank = COST_RANK[(caps.cost_tier as keyof typeof COST_RANK) ?? 'premium'] ?? 2;
    if (tierRank > maxRank) return false;

    if (body_required_strengths?.length) {
      const strengths = (caps.strengths as string[]) ?? [];
      if (!body_required_strengths.every(s => strengths.includes(s))) return false;
    }
    return true;
  });
  if (filtered.length > 0) capFiltered = filtered; // graceful degradation
}

const chosen = capFiltered[0]; // still priority-ordered
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `capabilities: string[]` flat tags | `capabilities: GatewayCapabilityRecord` structured JSONB | Phase 40 | Enables cost-tier routing, tool filtering, agentic flag |
| All tools sent to all HTTP gateways | Tools filtered by `tool_support` field | Phase 40 | Prevents Ollama tool-call failures, reduces prompt tokens |
| Priority-only auto-selection in tasks.ts | Capability-filtered then priority | Phase 40 | Callers can request "budget only" or "reasoning required" |
| No `agentic` flag | `agentic: boolean` on each gateway | Phase 40 | Phase 44 (AJQ-02) can use this for job assignment |

**Current capability tags (pre-Phase 40):**
- claude_cli: `["chat", "code", "streaming", "tool_use"]` — too coarse
- codex_cli: `["code", "streaming"]` — no cost tier
- gemini_cli: `["chat", "code", "streaming"]` — missing strengths
- openclaw: `["chat", "code", "streaming"]` — no cost tier
- ollama: `["chat", "code", "streaming"]` — no budget/limited-tool indication

---

## Open Questions

1. **Admin frontend capability display**
   - What we know: `admin/bridge.ts` `maskGatewayRow()` returns `capabilities` directly; frontend renders it
   - What's unclear: Whether the frontend expects an array or object — not investigated
   - Recommendation: Add a `capability_tags` field to the admin response that always returns the flat tag array, keeping the full structured object under `capabilities`

2. **`--allowedTools` support for Gemini CLI**
   - What we know: Gemini CLI uses `--yolo` flag which bypasses all approval gates
   - What's unclear: Whether `gemini` CLI supports a tool allowlist flag — not verified against official docs
   - Recommendation: Treat Gemini as `tool_support: 'full'` with no filtering (consistent with current behavior); add a TODO comment noting this gap

3. **`TaskRequest.tools` field propagation**
   - What we know: `TaskRequest.tools` exists in types.ts as `optional string[] — Optional tool allowlist (claude: --allowedTools)`
   - What's unclear: Whether `tasks.ts` currently passes this to `executeTask()` — the route reads it from body but the current `runTaskInBackground` signature doesn't pass it to `executeTask`
   - Recommendation: Wire `TaskRequest.tools` through to `buildTaskArgs()` for claude_cli in this phase

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Playwright (35 tests, `cd tests && npx playwright test`) + TypeScript type check |
| Config file | `tests/playwright.config.ts` |
| Quick run command | `cd /home/lobster/projects/porter/backend && npm run build` (type-check) |
| Full suite command | `cd /home/lobster/projects/porter/tests && npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GWC-01 | Gateways have structured capabilities after migration | smoke (psql) | `psql -d porter -c "SELECT capabilities->>'cost_tier' FROM gateways LIMIT 1"` | N/A (DB query) |
| GWC-01 | `normalizeCapabilities()` returns structured record | unit | `npm run build` (type safety) | ❌ Wave 0 |
| GWC-02 | Tasks.ts filters by required_strengths when provided | integration | `curl -s POST /api/v1/tasks/dispatch -d '{"required_strengths":["coding"],...}'` | N/A (curl) |
| GWC-02 | Capability filter falls back when no match | unit | manual verify in tasks.ts code | N/A |
| GWC-03 | Ollama tasks only receive read-only tools | unit | `npm run build` (type safety + review) | ❌ Wave 0 |
| GWC-04 | All 5 gateways accept dispatch | smoke | existing Playwright bridge tests | ✅ |

### Sampling Rate
- **Per task commit:** `cd /home/lobster/projects/porter/backend && npm run build`
- **Per wave merge:** `cd /home/lobster/projects/porter/tests && npx playwright test`
- **Phase gate:** Full suite green + psql capability query returns structured data

### Wave 0 Gaps
- [ ] `backend/src/services/bridge/capability-registry.ts` — new file, covers GWC-01
- [ ] `backend/src/db/migrate-bridge-v7.ts` — new file, covers GWC-01 DB population
- [ ] Wiring `migrateBridgeV7` import + call in `backend/src/index.ts`

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `backend/src/services/bridge/task-executor.ts` — TASK_CAPABLE_TYPES, buildTaskArgs, executeTask
- Direct code inspection: `backend/src/services/bridge/http-task-executor.ts` — PORTER_TOOLS, HTTP_TASK_CAPABLE_TYPES, executeHttpTask
- Direct code inspection: `backend/src/services/bridge/startup-detector.ts` — upsertGateway, CLI_BINARIES capabilities arrays
- Direct code inspection: `backend/src/services/bridge/routing-engine.ts` — filterByCapabilities, selectByHeuristic
- Direct code inspection: `backend/src/routes/v1/tasks.ts` — dispatch route, auto-selection logic
- Direct code inspection: `backend/src/services/bridge/model-catalog.ts` — MODEL_METADATA with capabilities/context_window
- Live DB query: `gateways` table — current capabilities values for all 5 gateways
- Live DB query: `models` table — current capabilities, context_window per gateway
- Direct code inspection: `backend/src/db/schema.ts` — gateways table definition
- Direct code inspection: `backend/src/db/migrate-bridge-v6.ts` — migration pattern

### Secondary (MEDIUM confidence)
- Phase context (CONTEXT.md) — locked decisions and discretion areas
- REQUIREMENTS.md — GWC-01 through GWC-04 requirements text

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all existing tools
- Architecture: HIGH — inspected all relevant files, DB state confirmed
- Pitfalls: HIGH — identified from direct code reading of affected call sites
- Migration pattern: HIGH — follows exact pattern of migrate-bridge-v6.ts

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable codebase — 30-day validity)
