# Phase 23: Integration & Multi-Tenant - Research

**Researched:** 2026-03-25
**Domain:** Memory V3 signal writing, dispatch log queryability, Brain health integration, per-user API key storage, per-workspace gateway overrides, usage attribution
**Confidence:** HIGH

## Summary

Phase 23 is a pure backend integration phase — no new subsystems, only wiring existing ones together. Every dependency already exists: the bridge dispatch log has agent_id, the Memory V3 tables (agent_notes) are live, the health probe runs every 30s, and the credential encryption pattern is established via `encryptCredential()`. The work is narrow, surgical additions.

The seven requirements split naturally into two cohorts: **INT-01 through INT-04** wire Bridge output into Brain (Memory V3 signals, dispatch queryability, session history, health visibility) and **MT-01 through MT-03** add multi-tenant storage (user API keys, workspace gateway overrides, usage attribution by user/project/agent).

**Primary recommendation:** Two plans. Plan 1 covers INT requirements — emit Memory V3 agent_note in `logDispatch()`, expose per-agent dispatch query API, expose session routing history API, and add bridge gateway summary to admin health dashboard. Plan 2 covers MT requirements — new migration for `user_api_keys` and `workspace_gateway_overrides` tables, CRUD endpoints under `/api/v1/user/keys` and `/api/admin/bridge/workspace-config`, plus `username` column addition on `bridge_dispatch_log` for usage attribution.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
All implementation choices are at Claude's discretion — pure infrastructure phase.

Key constraints from requirements:
- INT-01: Routing decisions → Memory V3 signals so agents learn model preferences
- INT-02: Dispatch log queryable by agent_id (model used, tokens, latency, performance)
- INT-03: Session routing history per conversation — which model handled each turn
- INT-04: Bridge gateway health exposed in Brain health dashboard
- MT-01: Per-user API key storage for direct provider access
- MT-02: Per-workspace gateway overrides (admin configures available gateways)
- MT-03: Usage attribution — costs attributed to user/project/agent for billing

### Claude's Discretion
All implementation choices.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INT-01 | Routing decisions feed into Memory V3 — agents learn which models work best for which task types | `logDispatch()` in routing-engine.ts is the insertion point; `agent_notes` table is the target; fire-and-forget pattern already established |
| INT-02 | Bridge dispatch log queryable by agent_id — "what model did this agent use and how did it perform?" | `bridge_dispatch_log.agent_id` column exists + index exists; `GET /api/admin/bridge/dispatch-log?agent_id=` already supported; need to expose per-agent aggregates |
| INT-03 | Session routing history — per-conversation record of which models were used, enabling context-aware re-routing | `session_routing_context` table exists with `chat_id`; `GET /api/v1/bridge/session/:chatId/routing` endpoint needed |
| INT-04 | Bridge status visible in Brain health dashboard — gateway health is part of system health | `GET /api/admin/health/dashboard` exists; add bridge summary block from `gateways` table |
| MT-01 | Per-user API key storage — each user can bring their own keys for direct provider access | Pattern from `gateway_credentials`; new `user_api_keys` table; `encryptCredential()` ready |
| MT-02 | Per-workspace gateway overrides — workspace admin can configure which gateways are available | New `workspace_gateway_overrides` table; admin endpoint to enable/disable per-gateway; routing engine reads overrides |
| MT-03 | Usage attribution — token costs attributed to user/project/agent for billing integration | `bridge_dispatch_log` already has `agent_id`, `project_id`; missing `username` column; add column + attribution query endpoint |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pg` (node-postgres) | existing | PostgreSQL raw SQL queries | All bridge phases use pool.query() directly |
| `uuid` (v4) | existing | UUIDs for new rows | Used across all services; already imported |
| `node:crypto` | built-in | AES-256-GCM encryption for API keys | `encryptCredential()` / `decryptCredential()` already in credential-crypto.ts |
| Fastify 5 | existing | Route handlers | Project-wide standard |

### No New Dependencies
Phase 23 requires **zero new npm packages**. All capabilities come from existing project infrastructure.

## Architecture Patterns

### Established Patterns to Follow

#### 1. Fire-and-forget async IIFE (for Memory V3 signal emission)
Used in `routing-engine.ts` for `logDispatch()`. The Memory V3 signal must be emitted inside the existing IIFE block — after the `INSERT INTO bridge_dispatch_log` succeeds.

```typescript
// Inside logDispatch() async IIFE — after dispatch log INSERT
if (ctx.agentId) {
  try {
    const noteContent = `Used ${decision.modelName} via ${decision.gatewayRow.type} — ${decision.reason}`;
    await pool.query(
      `INSERT INTO agent_notes (id, agent_id, content, note_type, confidence_score, source_type, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'learning', 40, 'learning', 'active', 'bridge', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))`,
      [uuidv4(), ctx.agentId, noteContent]
    );
  } catch {
    // Never block dispatch
  }
}
```
**Confidence:** HIGH — mirrors existing pattern in same file.

#### 2. Admin health endpoint augmentation
`GET /api/admin/health/dashboard` in `admin/health.ts` uses `const q = async (sql) => pool.query(sql).rows[0]`. Bridge summary should follow the same `q()` helper pattern — a simple SELECT on `gateways` grouped by status.

```typescript
const bridgeGateways = await (async () => {
  try {
    return (await pool.query(`
      SELECT status, COUNT(*) as cnt FROM gateways GROUP BY status
    `)).rows as Array<{status: string; cnt: number}>;
  } catch { return []; }
})();
```

#### 3. Credential encryption for user API keys
Identical to `gateway_credentials` table pattern:
- Store: `encryptCredential(plaintext)` → encrypted_value column
- Display: `masked_display = '***' + key.slice(-4)`
- Retrieve: `decryptCredential(encrypted_value)` — only for internal dispatch use
- API response: never returns raw or decrypted key

#### 4. Migration idempotency pattern
All bridge migrations use the same pattern:
```typescript
const check = await client.query(`SELECT 1 FROM schema_migrations WHERE id = 'bridge_v5'`);
if (check.rowCount && check.rowCount > 0) { await client.query('COMMIT'); return; }
```
Phase 23 migration should be `bridge_v5`.

#### 5. Admin route POST body action dispatch
`POST /api/admin/bridge/workspace-config` should follow Phase 22 pattern: `{ action, ...data }` body.

### Recommended Project Structure
No new directories. All files slot into existing structure:

```
backend/src/
├── db/
│   └── migrate-bridge-v5.ts      # NEW: user_api_keys, workspace_gateway_overrides, username on dispatch_log
├── services/bridge/
│   └── routing-engine.ts         # MODIFIED: INT-01 signal emit in logDispatch()
├── routes/v1/
│   ├── bridge.ts                 # MODIFIED: INT-03 session history endpoint
│   └── admin/
│       ├── health.ts             # MODIFIED: INT-04 bridge summary block
│       └── bridge.ts             # MODIFIED: MT-02 workspace overrides endpoint, MT-03 attribution endpoint
```

No new route files needed. All additions are small augmentations to existing handlers.

### Anti-Patterns to Avoid
- **Do not block dispatch with signal emission**: Memory V3 writes MUST be fire-and-forget inside the existing async IIFE. A DB failure for agent_notes must never propagate to the caller.
- **Do not add username to RoutingContext**: username is a dispatch-layer concern. Add it to `bridge_dispatch_log` and let the route handler pass it from `sessionUser.username`.
- **Do not create a separate memory service file**: write directly to `agent_notes` with raw SQL — consistent with all other Memory V3 writes in the codebase.
- **Do not encrypt workspace overrides**: they are gateway references (gateway IDs + enabled flags), not secrets. Only user API keys require encryption.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API key encryption | Custom crypto | `encryptCredential()` / `decryptCredential()` from `credential-crypto.ts` | AES-256-GCM already tested and deployed |
| Gateway health aggregation | Health probe | Read from `gateways` table status column | Health probe already updates status every 30s |
| Per-agent dispatch stats | New stats service | SQL GROUP BY on `bridge_dispatch_log.agent_id` | Table already has all data + index |
| Session history reconstruction | New session tracker | SELECT from `session_routing_context` by chat_id | RT-05 already writes every turn |

## Common Pitfalls

### Pitfall 1: Over-frequency Memory V3 signals
**What goes wrong:** Writing a signal for every single dispatch creates thousands of nearly-identical agent_notes for active agents — noise overwhelms useful signal.
**Why it happens:** Every dispatch calls `logDispatch()`, which could emit on every call.
**How to avoid:** Only emit a signal when the model choice is non-trivial or notable. Apply a basic deduplication guard: don't write if the agent already has an active note for the same gateway_type+model_name combination written in the last hour.
**Warning signs:** agent_notes table grows proportionally to dispatch count.

### Pitfall 2: Missing username on dispatch log at route layer
**What goes wrong:** `logDispatch()` in routing-engine.ts doesn't have access to the HTTP session user — it only knows `RoutingContext` which has agentId/projectId/chatId.
**Why it happens:** RoutingEngine is a service, not a route handler.
**How to avoid:** Add `username` as an optional field to `RoutingContext` interface. The route handlers that call the routing engine already have `request.sessionUser.username` available and can pass it through. Do NOT make the service import Fastify request context.

### Pitfall 3: Migration column already exists
**What goes wrong:** `ADD COLUMN IF NOT EXISTS username` on `bridge_dispatch_log` needs to be idempotent — the migration may run against a DB that already has the column if someone ran a partial migration.
**How to avoid:** Always use `ADD COLUMN IF NOT EXISTS` syntax (PostgreSQL supports this). All prior bridge migrations already demonstrate this pattern.

### Pitfall 4: Workspace override bypass in routing
**What goes wrong:** If workspace gateway overrides are added to the DB but routing-engine.ts's `selectAllCandidates()` doesn't read them, gateways remain accessible even after being disabled.
**Why it happens:** `selectAllCandidates()` queries `gateways WHERE status IN ('active', 'stale') AND enabled = 1` — it does not check per-workspace overrides.
**How to avoid:** Workspace override enforcement needs a workspace_id context. Since most dispatches come from users in a single workspace, a global workspace override table (rather than per-user) is simpler. The routing engine should accept an optional `workspaceId` in context and apply a `NOT EXISTS` filter against disabled overrides. Alternatively (simpler for this phase): filter in the route handler before calling the routing engine by checking overrides and removing disabled gateways from consideration.

### Pitfall 5: User API key scope confusion
**What goes wrong:** Per-user API keys are for the user to use their own provider accounts. They must be scoped to the user and a gateway_type. If two users both store OpenAI keys, routing must know which user's key to use for that user's dispatches.
**How to avoid:** `user_api_keys` table schema: `(id, username, gateway_type, label, encrypted_value, masked_display, created_at)`. The routing engine checks for a user-specific key for the selected gateway_type before falling back to workspace-level credentials.

### Pitfall 6: Brain health SQL failure hides Bridge status
**What goes wrong:** Adding Bridge gateway summary to the health dashboard with a raw `pool.query()` — if `gateways` table doesn't exist (fresh install before bridge migration runs), the entire health endpoint 500s.
**How to avoid:** Wrap the bridge summary query in try/catch returning `[]` on failure — same pattern already used for `projectsByStatus`, `recentActivity` etc. in `admin/health.ts`.

## Code Examples

Verified patterns from existing source:

### INT-01: Memory V3 signal in logDispatch() (insertion point)
```typescript
// Source: routing-engine.ts logDispatch() — inside existing async IIFE, after dispatch log INSERT
if (ctx.agentId) {
  try {
    // Deduplication: skip if same agent+gateway_type+model note written in last hour
    const existing = await pool.query(
      `SELECT 1 FROM agent_notes
       WHERE agent_id = $1
         AND content LIKE $2
         AND created_at > EXTRACT(EPOCH FROM NOW()) - 3600
         AND status = 'active'
       LIMIT 1`,
      [ctx.agentId, `%${decision.gatewayRow.type}%${decision.modelName}%`]
    );
    if (!existing.rows.length) {
      const perf = result.latencyMs < 3000 ? 'fast' : result.latencyMs < 8000 ? 'normal' : 'slow';
      await pool.query(
        `INSERT INTO agent_notes
           (id, agent_id, content, note_type, confidence_score, source_type, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, 'learning', 40, 'learning', 'active', 'bridge', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))`,
        [
          uuidv4(),
          ctx.agentId,
          `Routed via ${decision.gatewayRow.type} (${decision.modelName}) — ${perf} response (${result.latencyMs}ms). Reason: ${decision.reason}`,
        ]
      );
    }
  } catch { /* non-critical */ }
}
```

### INT-02: Per-agent dispatch performance query
```typescript
// New endpoint: GET /api/admin/bridge/agent-stats?agent_id=xxx
// Source: pattern from existing /costs endpoint in admin/bridge.ts
const { rows } = await pool.query(`
  SELECT
    model_name,
    gateway_type,
    COUNT(*) AS dispatch_count,
    AVG(latency_ms) AS avg_latency_ms,
    COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
    COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
    COALESCE(SUM(output_tokens), 0) AS total_output_tokens
  FROM bridge_dispatch_log
  WHERE agent_id = $1
  GROUP BY model_name, gateway_type
  ORDER BY dispatch_count DESC
`, [agentId]);
```

### INT-03: Session routing history endpoint
```typescript
// New endpoint: GET /api/v1/bridge/session/:chatId/routing
// Source: pattern from bridge.ts — requireAuth + pool.query
const { rows } = await pool.query(`
  SELECT src.message_sequence, src.gateway_type, src.model_name,
         src.created_at, bdl.estimated_cost_usd, bdl.latency_ms,
         bdl.input_tokens, bdl.output_tokens
  FROM session_routing_context src
  LEFT JOIN bridge_dispatch_log bdl ON bdl.id = src.dispatch_log_id
  WHERE src.chat_id = $1
  ORDER BY src.message_sequence ASC
`, [chatId]);
```

### MT-01: user_api_keys table schema
```sql
CREATE TABLE IF NOT EXISTS user_api_keys (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  gateway_type  TEXT NOT NULL,
  label         TEXT NOT NULL DEFAULT 'primary',
  encrypted_value TEXT NOT NULL,
  masked_display  TEXT NOT NULL DEFAULT '',
  created_at    DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
  rotated_at    DOUBLE PRECISION,
  UNIQUE(username, gateway_type, label)
);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_username ON user_api_keys(username);
```

### MT-02: workspace_gateway_overrides table schema
```sql
CREATE TABLE IF NOT EXISTS workspace_gateway_overrides (
  id          TEXT PRIMARY KEY,
  gateway_id  TEXT NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  enabled     INTEGER NOT NULL DEFAULT 1,
  reason      TEXT,
  updated_by  TEXT,
  updated_at  DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
  UNIQUE(gateway_id)
);
```

### MT-03: Username on bridge_dispatch_log (migration)
```sql
ALTER TABLE bridge_dispatch_log
  ADD COLUMN IF NOT EXISTS username TEXT;

CREATE INDEX IF NOT EXISTS idx_bridge_dispatch_log_username
  ON bridge_dispatch_log(username);
```

### MT-03: Usage attribution query
```typescript
// New endpoint: GET /api/admin/bridge/attribution?group_by=user|project|agent&from=X&to=Y
const { rows } = await pool.query(`
  SELECT
    COALESCE(username, 'anonymous') AS username,
    agent_id, project_id,
    COUNT(*) AS dispatch_count,
    COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
    COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens
  FROM bridge_dispatch_log
  WHERE created_at >= $1 AND created_at <= $2
  GROUP BY username, agent_id, project_id
  ORDER BY total_cost_usd DESC
`, [from, to]);
```

## State of the Art

| Old Approach | Current Approach | Relevance to Phase 23 |
|--------------|------------------|----------------------|
| Memory V2 signals (concepts table, review_state) | Memory V3 (agent_notes — direct structured insert) | INT-01 writes to agent_notes, NOT concepts |
| Health probe as standalone check | Health probe results stored in gateways.status | INT-04 reads gateways.status — no need to re-probe |
| Single workspace, no key isolation | Multi-tenant: per-user keys, per-workspace overrides | MT-01/MT-02 new schema |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (Node.js) |
| Config file | `tests/playwright.config.js` |
| Quick run command | `cd /home/lobster/documents/porter/tests && npx playwright test --grep "bridge\|health\|memory"` |
| Full suite command | `cd /home/lobster/documents/porter/tests && npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INT-01 | Memory V3 signal written after dispatch with agentId | smoke | verify agent_notes row created via DB query | ❌ Wave 0 |
| INT-02 | /api/admin/bridge/agent-stats returns per-model aggregates | smoke | `curl /api/admin/bridge/agent-stats?agent_id=X` returns 200+data | ❌ Wave 0 |
| INT-03 | GET /api/v1/bridge/session/:chatId/routing returns turns | smoke | `curl /api/v1/bridge/session/test-chat/routing` returns 200 | ❌ Wave 0 |
| INT-04 | /api/admin/health/dashboard includes bridge_gateways block | smoke | response body has `bridge_gateways` key | ❌ Wave 0 |
| MT-01 | User can store/retrieve masked API key for gateway type | smoke | POST then GET key, verify masked_display only | ❌ Wave 0 |
| MT-02 | Admin can disable gateway for workspace, dispatch respects it | integration | POST disable, verify routing skips gateway | ❌ Wave 0 |
| MT-03 | Attribution endpoint groups costs by user/project/agent | smoke | `curl /api/admin/bridge/attribution` returns rows with username | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /home/lobster/documents/porter/tests && npx playwright test --grep "bridge"` (subset)
- **Per wave merge:** `cd /home/lobster/documents/porter/tests && npx playwright test` (full 35 tests)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Smoke tests for each new endpoint (INT-01 through MT-03 above)
- [ ] All gaps are new tests, not missing framework — Playwright infrastructure is fully established

## Open Questions

1. **Memory V3 signal deduplication strategy**
   - What we know: every dispatch creates one potential agent_notes row per agentId
   - What's unclear: optimal dedup window (1 hour? 24 hours? unique by model+gateway?)
   - Recommendation: 1-hour window + LIKE match on gateway_type+model_name; keep it simple, can tune later

2. **Workspace gateway override enforcement scope**
   - What we know: current RoutingContext has no workspace_id field
   - What's unclear: whether routing engine should enforce overrides or the route handler should pre-filter
   - Recommendation: route-layer enforcement — simpler, no RoutingContext changes needed. Route handlers have sessionUser.username and can look up overrides before calling routingEngine.select()

3. **User API key usage in dispatch**
   - What we know: routing engine creates adapters from GatewayRow; adapters use gateway_credentials table for keys
   - What's unclear: how per-user keys override workspace keys during dispatch
   - Recommendation: lookup in route handler before dispatch — if user has a key for the selected gateway_type, override the adapter's credential. Since adapters are constructed from GatewayRow, user key can be injected into metadata before adapter creation.

## Sources

### Primary (HIGH confidence)
- Direct code reading: `routing-engine.ts` — logDispatch() insertion point confirmed
- Direct code reading: `migrate-memv3.ts` — agent_notes schema confirmed
- Direct code reading: `migrate-bridge-v2.ts` — bridge_dispatch_log + session_routing_context schema confirmed
- Direct code reading: `admin/bridge.ts` — existing dispatch-log filtering by agent_id confirmed
- Direct code reading: `admin/health.ts` — dashboard endpoint structure confirmed
- Direct code reading: `credential-crypto.ts` — encryptCredential/decryptCredential available

### Secondary (MEDIUM confidence)
- Pattern analysis: migration idempotency convention (all 4 bridge migrations follow same pattern)
- Pattern analysis: fire-and-forget IIFE in routing-engine.ts

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, all patterns verified by direct code reading
- Architecture: HIGH — all integration points identified by reading exact source files
- Pitfalls: HIGH — derived from reading actual code and identifying gaps (RoutingContext missing username, health dashboard error handling)

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable codebase, no external dependencies)
