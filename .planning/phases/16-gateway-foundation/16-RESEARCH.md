# Phase 16: Gateway Foundation - Research

**Researched:** 2026-03-25
**Domain:** PostgreSQL schema design, Drizzle ORM, AES-256-GCM credential encryption, CLI binary detection, TypeScript interface contracts
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Gateway Schema**
- `gateways` table in PostgreSQL via Drizzle ORM
- 6 gateway types: `ollama`, `openclaw`, `codex_cli`, `claude_cli`, `gemini_cli`, `openai_compat`
- `openai_compat` type supports any OpenAI-compatible endpoint (LiteLLM, custom proxies, future providers)
- Simple integer priority column (1=highest). Smart Routing (Phase 20) adds complexity later
- `capabilities` JSONB array on each gateway (e.g. `['chat','code','streaming','tool_use']`)
- `source` column: `auto_detected`, `env_bootstrap`, `manual`
- `status` column with states: `active`, `stale`, `unavailable`
- Binary paths stored in metadata JSONB for CLI gateways (e.g. `{"binary_path": "/usr/local/bin/ollama"}`)

**Credential Model**
- Separate `gateway_credentials` table with FK to `gateways` — secrets never in same table as config
- 1:many relationship — supports primary + backup keys, key rotation without downtime
- `auth_method` enum: `none`, `bearer_token`, `api_key`
- Credential values encrypted at rest using existing `credential-crypto.ts` (AES-256-GCM with PORTER_SECRET)
- API responses mask keys to last 4 chars + masked prefix (e.g. `****...ab3f`)
- Full keys never returned after initial save

**Auto-Detection Behavior**
- Startup detector runs on Fastify boot ONLY — no periodic rescan
- Scans PATH for: Ollama, OpenClaw, Codex CLI, Claude CLI, Gemini CLI binaries
- Detected gateways enabled by default
- Detection logged to console: `✓ Ollama detected at /usr/local/bin/ollama`
- Missing CLIs between restarts → mark gateway as `stale`
- Only local tools auto-detected in Phase 16

**Env-to-DB Migration**
- First boot with existing env vars (OLLAMA_URL, OPENCLAW_URL, OPENCLAW_TOKEN): auto-bootstrap gateway rows
- After bootstrap, DB is authoritative — env vars are fallback only if gateway row missing
- `POST /api/admin/bridge/redetect` endpoint — admin-only, clears `auto_detected` + `env_bootstrap` rows, re-runs bootstrap. Preserves `manual` entries.
- ai-router.ts continues reading config.ts for now (no modifications). Phase 20 switches to DB-driven selection.

**Adapter Interface**
- `GatewayAdapter` TypeScript interface with 5 typed methods: `detect()`, `health()`, `dispatch()`, `stream()`, `listModels()`
- Phase 16 defines interface ONLY — concrete adapter implementations are Phase 17
- `GatewayAdapter` supersedes existing `StreamBackend` interface from stream-service.ts
- `dispatch()` returns structured `DispatchResult`: `{ response, model, tokensUsed, inputTokens, outputTokens, latencyMs, cached }`
- Interface and types live at `backend/src/services/bridge/types.ts`

### Claude's Discretion
- Exact column types and defaults for the gateways table
- Drizzle migration script structure
- Index strategy for the gateways table
- Startup detector implementation approach (which npm package or exec)
- Error handling in bootstrap when env vars have invalid URLs

### Deferred Ideas (OUT OF SCOPE)
- External gateway proxies (LiteLLM, Kong, etc.)
- Periodic re-detection
- API-key provider auto-detection from env (ANTHROPIC_API_KEY / OPENAI_API_KEY)
- Weight-based load balancing
- Gateway-level AND model-level capabilities combined
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GW-01 | Gateway table in PostgreSQL with type, URL, auth method, health status, priority, JSONB metadata — queryable via Drizzle ORM | Schema design section; Drizzle patterns from schema.ts confirmed |
| GW-03 | Auto-detection on startup finds Ollama, OpenClaw, Codex CLI, Claude CLI, Gemini CLI from PATH and registers them | `which` npm package v6.0.1 confirmed; all 4 CLIs confirmed in PATH on this system |
| GW-07 | API key masking — keys stored encrypted, never returned in full after initial save | `credential-crypto.ts` AES-256-GCM fully reusable; masking pattern researched |
| GW-08 | Config migration — env vars bootstrap on first run, DB authoritative after that, env as fallback | `config.ts` env vars confirmed; bootstrap pattern designed |
| CLI-01 | GatewayAdapter interface — typed contract all backends implement (detect, health, dispatch, stream, listModels) | `StreamBackend` interface reviewed; `DispatchResult` in ai-router.ts reviewed; supersession path clear |
</phase_requirements>

---

## Summary

Phase 16 lays the data foundation for the entire Bridge milestone. It introduces two new PostgreSQL tables (`gateways` and `gateway_credentials`), a TypeScript interface contract (`GatewayAdapter`), a startup detector that finds local AI CLI tools, and a bootstrap mechanism that migrates existing env vars into the database on first run.

The codebase already has all the primitives needed: `credential-crypto.ts` for AES-256-GCM encryption, the migration pattern in `migrate-consolidated.ts` and `migrate-15.ts`, the `envelope.ts` response wrapper, and the startup hook pattern in `index.ts`. This phase is almost entirely additive — no existing files are modified except `index.ts` (to call the detector) and `schema.ts` (to add two table definitions).

The `which` npm package (v6.0.1) is the correct tool for CLI binary discovery. All four target CLIs (Ollama, Claude, Gemini, Codex) are confirmed present in PATH on this deployment. The pattern for startup hook injection follows exactly what `scheduler.start()` and the IMAP IDLE check already do in `index.ts`.

**Primary recommendation:** Follow the additive pattern — new migration file `migrate-bridge-v1.ts`, new Drizzle schema entries, new `services/bridge/types.ts`, new `services/bridge/startup-detector.ts`, and one new route file `routes/v1/admin/bridge.ts`. Register everything in `index.ts` after existing migrations.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.45.1 (already installed) | Schema definitions, type-safe queries | Project standard — every table uses it |
| pg | ^8.20.0 (already installed) | PostgreSQL pool, raw migration queries | Project standard — all migrations use raw `pool.query` |
| zod | ^4.3.6 (already installed) | Input validation on API routes | Project standard for all route validation |
| which | 6.0.1 (needs install) | Find CLI binary paths in PATH | Correct tool; `child_process.execSync('which ollama')` is fragile on Windows, which package handles cross-platform and throws on miss |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:crypto (built-in) | stdlib | AES-256-GCM via credential-crypto.ts | Already used — no new dep |
| node:child_process (built-in) | stdlib | Fallback probe via `execSync` if which fails | Kept as backup approach only |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `which` npm package | `child_process.execSync('which ollama')` | execSync throws on Windows, doesn't exist in pure PATH form; which package is cleaner and already the planned package per STATE.md |
| Separate migration runner | drizzle-kit push | Project uses raw-SQL migrations with idempotency checks — drizzle-kit push is for dev; migrate-* pattern is established and safe for production |

**Installation (only new package):**
```bash
cd /home/lobster/documents/porter/backend && npm install which && npm install --save-dev @types/which
```

**Version verification:** `npm view which version` → 6.0.1 (confirmed 2026-03-25)

---

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
├── db/
│   ├── migrate-bridge-v1.ts    # New: gateways + gateway_credentials tables
│   └── schema.ts               # Append: gateways + gateway_credentials exports
├── services/
│   └── bridge/
│       ├── types.ts            # New: GatewayAdapter interface, DispatchResult, GatewayRow types
│       └── startup-detector.ts # New: detectAndUpsertGateways() function
└── routes/v1/
    └── bridge.ts               # New: POST /api/v1/bridge/redetect (admin-only)
```

Note: The CONTEXT.md says endpoints register at `routes/v1/` — use `bridge.ts` not `admin/bridge.ts` since the admin routes directory is currently commented out in `v1/index.ts`.

### Pattern 1: Additive Migration File
**What:** Each feature increment gets its own `migrate-*.ts` file with idempotency guard
**When to use:** Every new set of tables — this is the entire project's pattern
**Example:**
```typescript
// Source: backend/src/db/migrate-15.ts (project pattern)
export async function migrateBridgeV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'bridge_v1'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }
    // ... CREATE TABLE IF NOT EXISTS ...
    await client.query(`INSERT INTO schema_migrations (id) VALUES ('bridge_v1')`);
    await client.query('COMMIT');
    console.log('[migrate-bridge] bridge_v1 applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

### Pattern 2: Drizzle Schema Definition
**What:** Append new table exports to the bottom of `schema.ts` following established column conventions
**When to use:** Every new table must appear in schema.ts for Drizzle type generation
**Example:**
```typescript
// Source: backend/src/db/schema.ts (project conventions)
export const gateways = pgTable('gateways', {
  id: text('id').primaryKey(),                          // text PK, not serial
  type: text('type').notNull(),                         // enum-as-text pattern
  name: text('name').notNull(),
  url: text('url'),                                     // null for CLI-only gateways
  authMethod: text('auth_method').notNull().default('none'),
  status: text('status').notNull().default('active'),
  source: text('source').notNull().default('manual'),
  priority: integer('priority').notNull().default(10),
  capabilities: jsonb('capabilities').default(sql`'[]'::jsonb`),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
  enabled: integer('enabled').notNull().default(1),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  lastHealthAt: doublePrecision('last_health_at'),
});

export const gatewayCredentials = pgTable('gateway_credentials', {
  id: text('id').primaryKey(),
  gatewayId: text('gateway_id').notNull().references(() => gateways.id, { onDelete: 'cascade' }),
  label: text('label').notNull().default('primary'),    // primary, backup, etc.
  encryptedValue: text('encrypted_value').notNull(),    // AES-256-GCM via credential-crypto.ts
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  rotatedAt: doublePrecision('rotated_at'),
});
```

### Pattern 3: Startup Hook Injection
**What:** Register async function call in `index.ts` `start()` after migrations, before `fastify.listen()`
**When to use:** Any boot-time side effect (detection, seeding, bootstrap)
**Example:**
```typescript
// Source: backend/src/index.ts start() function pattern
await migrateConsolidated(pool);
await migrateMemoryV3(pool);
await migrateSkillsTools(pool);
await migrateTemplateColumns(pool);
await migrateBridgeV1(pool);    // ← add here
await seedTemplates();
await fastify.listen({ port: config.port, host: config.host });
scheduler.start();
await detectAndUpsertGateways(pool);  // ← add here, after listen
```

### Pattern 4: Key Masking
**What:** Show only last 4 characters of any credential in API responses
**When to use:** Any route returning gateway or credential data
**Example:**
```typescript
// Consistent with Stripe/GitHub masking pattern
function maskKey(encryptedValue: string): string {
  // Decrypt just to measure length and grab tail — never return plaintext
  try {
    const plain = decryptCredential(encryptedValue);
    return `****...${plain.slice(-4)}`;
  } catch {
    return '****...????';
  }
}
```

### Pattern 5: Admin-Only Route Guard
**What:** Check `request.user.role` against admin capability before proceeding
**When to use:** Any `POST /api/v1/bridge/redetect` or gateway mutation
**Example:**
```typescript
// Source: backend/src/routes/v1/connections.ts auth pattern
if (!request.user) return reply.code(401).send(err('UNAUTHORIZED', 'Login required'));
if (request.user.role !== 'platform_admin' && request.user.role !== 'admin') {
  return reply.code(403).send(err('FORBIDDEN', 'Admin required'));
}
```

### Pattern 6: GatewayAdapter Interface
**What:** TypeScript interface in `bridge/types.ts` that all provider adapters (Phase 17) must implement
**When to use:** Defines the contract — Phase 16 defines it, Phase 17 implements it
**Example:**
```typescript
// Source: Supersedes StreamBackend from stream-service.ts
export interface GatewayAdapter {
  readonly name: string;
  readonly gatewayType: GatewayType;
  detect(): Promise<DetectResult>;
  health(): Promise<HealthResult>;
  dispatch(req: BridgeDispatchRequest): Promise<BridgeDispatchResult>;
  stream(req: BridgeDispatchRequest, signal: AbortSignal): AsyncIterable<string>;
  listModels(): Promise<string[]>;
}

export interface BridgeDispatchResult {
  response: string;
  model: string;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  cached: boolean;
}

export type GatewayType =
  | 'ollama'
  | 'openclaw'
  | 'codex_cli'
  | 'claude_cli'
  | 'gemini_cli'
  | 'openai_compat';

export type GatewayStatus = 'active' | 'stale' | 'unavailable';
export type GatewaySource = 'auto_detected' | 'env_bootstrap' | 'manual';
export type GatewayAuthMethod = 'none' | 'bearer_token' | 'api_key';

export interface DetectResult {
  found: boolean;
  binaryPath?: string;
  version?: string;
}

export interface HealthResult {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}
```

### Anti-Patterns to Avoid
- **Using serial PK for gateways:** Project uses `text('id').primaryKey()` with `crypto.randomUUID()` for most tables — use text IDs, not serial, for gateways and gateway_credentials
- **Storing credentials in gateways table:** Locked decision — separate `gateway_credentials` table, FK relationship
- **Returning plaintext credentials in any API response:** Mask to last 4 chars at the row-mapping layer before the response is built, not in the route handler
- **Modifying ai-router.ts:** Explicitly deferred to Phase 20. Bridge wraps, does not replace
- **Running drizzle-kit push in production migration:** Project uses raw-SQL `migrate-*.ts` pattern; drizzle-kit is for schema introspection only
- **Using `execSync('which ...')` directly:** Use the `which` npm package — handles PATH edge cases, throws `LookupError` on miss, works asynchronously

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Finding CLI binaries in PATH | Custom PATH-splitting loop | `which` npm package | Handles PATH variations, symlinks, file permissions, throws proper error on miss |
| AES-256-GCM encryption | Custom crypto implementation | `credential-crypto.ts` (already exists) | Already battle-tested in the codebase, consistent salt, IV generation, auth tag verification |
| API response masking | Ad-hoc string slicing per route | Centralized `maskCredential()` helper in bridge/types.ts | Masking logic changes once, not across 5 routes |
| Migration idempotency | Custom version table | `schema_migrations` table (project pattern) | Already exists, INSERT with idempotency check is the established pattern |

**Key insight:** This phase is primarily schema + plumbing. The project already has every utility needed (crypto, migration runner, envelope, auth guards). The only new npm package is `which`.

---

## Common Pitfalls

### Pitfall 1: URL Column Nullable for CLI Gateways
**What goes wrong:** Setting `url` as NOT NULL breaks CLI gateway rows (Codex, Claude CLI, Gemini CLI — these have no URL, only a binary path in metadata JSONB)
**Why it happens:** HTTP gateways (Ollama, OpenClaw) need URLs; CLI gateways have binary paths instead
**How to avoid:** `url TEXT` (nullable). Populate metadata JSONB `binary_path` for CLI gateways. Phase 17 adapters use the right field per type.
**Warning signs:** Insert errors on CLI gateway bootstrap, or `url NOT NULL` constraint violations

### Pitfall 2: Bootstrap Running Every Boot
**What goes wrong:** Without idempotency logic, the startup detector creates duplicate gateway rows on every restart
**Why it happens:** No guard on the upsert logic
**How to avoid:** Use `INSERT ... ON CONFLICT (type) DO UPDATE SET ...` with a unique index on `(type)` — or check if a row with that source+type already exists before inserting. `source = 'auto_detected'` rows can be re-upserted by the detector; `source = 'manual'` rows are preserved by redetect endpoint.
**Warning signs:** Multiple rows per gateway type after restarts

### Pitfall 3: decryptCredential Called in Hot Path for Masking
**What goes wrong:** Decrypting every credential on every list response is expensive and introduces a failure mode (if PORTER_SECRET is wrong, list endpoint throws)
**Why it happens:** Naive masking implementation decrypts to get the plaintext suffix
**How to avoid:** Store a separate `masked_display` column (e.g. `****...ab3f`) at write time, populated during `encryptCredential`. This is the Stripe/GitHub pattern. Return this column for display, never decrypt on read.
**Warning signs:** Slow gateway list responses; unhandled errors when PORTER_SECRET rotates

### Pitfall 4: which Package Async vs Sync
**What goes wrong:** Using `which.sync()` inside an async startup function causes unhandled rejections when binaries are missing
**Why it happens:** `which.sync()` throws synchronously on miss; `which()` (async) rejects
**How to avoid:** Use `await which('ollama').catch(() => null)` — returns null on miss, throws nothing. Pattern:
```typescript
const binaryPath = await which('ollama').catch(() => null);
if (binaryPath) { /* upsert gateway */ }
```
**Warning signs:** Uncaught synchronous throws during startup, missing gateway rows

### Pitfall 5: PORTER_SECRET Missing at Migration Time
**What goes wrong:** If `PORTER_SECRET` is not set and env_bootstrap tries to encrypt `OPENCLAW_TOKEN`, `encryptCredential` throws: `"PORTER_SECRET env var is required"`
**Why it happens:** credential-crypto.ts's `getDerivedKey()` throws if env var is absent
**How to avoid:** In bootstrap, check `validatePorterSecret()` before attempting credential encryption. If secret is missing, log a warning and skip credential rows — gateway rows can still be created without credentials.
**Warning signs:** Startup crash with "PORTER_SECRET env var is required" during bootstrap

### Pitfall 6: Route Registration Path
**What goes wrong:** Bridge endpoint registered under a non-existent `admin/` prefix because CONTEXT.md mentions `/api/admin/bridge/redetect` but `routes/v1/admin/index.ts` is commented out
**Why it happens:** The admin routes directory exists but is commented out in `v1/index.ts` line 25
**How to avoid:** Register bridge endpoint in `routes/v1/bridge.ts` and add it to `v1/index.ts` (not the commented admin directory). The prefix mapping in index.ts will be `/api/v1/bridge`. CONTEXT.md's `/api/admin/bridge/redetect` URL pattern can be preserved by choosing prefix accordingly, or the planner should align on `/api/v1/bridge/redetect`.
**Warning signs:** 404 on redetect endpoint, route not found in Fastify log

---

## Code Examples

Verified patterns from project source:

### Startup Detector Structure
```typescript
// backend/src/services/bridge/startup-detector.ts
import which from 'which';
import pg from 'pg';
import crypto from 'node:crypto';
import { config } from '../../config.js';
import { encryptCredential, validatePorterSecret } from '../../lib/credential-crypto.js';

const CLI_BINARIES: Array<{ type: string; binary: string; capabilities: string[] }> = [
  { type: 'ollama',      binary: 'ollama',  capabilities: ['chat', 'code', 'streaming'] },
  { type: 'codex_cli',   binary: 'codex',   capabilities: ['code', 'streaming'] },
  { type: 'claude_cli',  binary: 'claude',  capabilities: ['chat', 'code', 'streaming', 'tool_use'] },
  { type: 'gemini_cli',  binary: 'gemini',  capabilities: ['chat', 'code', 'streaming'] },
];

export async function detectAndUpsertGateways(pool: pg.Pool): Promise<void> {
  // Upsert env-bootstrapped HTTP gateways (Ollama, OpenClaw)
  await bootstrapEnvGateways(pool);

  // Detect CLI binaries from PATH
  for (const cli of CLI_BINARIES) {
    const binaryPath = await which(cli.binary).catch(() => null);
    if (binaryPath) {
      await upsertGateway(pool, {
        type: cli.type,
        source: 'auto_detected',
        status: 'active',
        metadata: { binary_path: binaryPath },
        capabilities: cli.capabilities,
      });
      console.log(`[bridge] ✓ ${cli.binary} detected at ${binaryPath}`);
    } else {
      await markStale(pool, cli.type, 'auto_detected');
    }
  }
}
```

### Migration SQL for gateways table
```sql
-- Source: pattern from migrate-15.ts / migrate-consolidated.ts
CREATE TABLE IF NOT EXISTS gateways (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT,                               -- nullable: CLI gateways have no URL
  auth_method TEXT NOT NULL DEFAULT 'none',
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'manual',
  priority INTEGER NOT NULL DEFAULT 10,
  capabilities JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  enabled INTEGER NOT NULL DEFAULT 1,
  masked_display TEXT DEFAULT '',         -- pre-computed mask stored at write time
  created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
  last_health_at DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS gateway_credentials (
  id TEXT PRIMARY KEY,
  gateway_id TEXT NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'primary',
  encrypted_value TEXT NOT NULL,
  masked_display TEXT NOT NULL DEFAULT '',  -- '****...ab3f', stored at insert time
  created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
  rotated_at DOUBLE PRECISION
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_gateways_type_source
  ON gateways(type, source)
  WHERE source IN ('auto_detected', 'env_bootstrap');
  -- Only enforce uniqueness for auto rows; manual can have multiple per type

CREATE INDEX IF NOT EXISTS idx_gateways_status ON gateways(status);
CREATE INDEX IF NOT EXISTS idx_gateways_type ON gateways(type);
CREATE INDEX IF NOT EXISTS idx_gateway_creds_gateway ON gateway_credentials(gateway_id);
```

**Note on unique index:** The partial unique index `(type, source) WHERE source IN ('auto_detected', 'env_bootstrap')` lets `ON CONFLICT` upserts work cleanly for auto-detected rows while allowing multiple manual gateways of the same type (e.g., two OpenAI-compat endpoints).

### Env Bootstrap Logic
```typescript
// Source: pattern derived from config.ts env vars
async function bootstrapEnvGateways(pool: pg.Pool): Promise<void> {
  // Ollama: always bootstrap if OLLAMA_URL is set (or use default)
  const ollamaUrl = config.ollamaUrl;  // has default, always present
  await upsertGateway(pool, {
    type: 'ollama',
    name: 'Ollama (local)',
    url: ollamaUrl,
    authMethod: 'none',
    source: 'env_bootstrap',
    status: 'active',
    capabilities: ['chat', 'code', 'streaming'],
    metadata: {},
  });

  // OpenClaw: bootstrap only if OPENCLAW_URL is non-default or OPENCLAW_TOKEN is set
  if (config.openclawToken) {
    const credId = crypto.randomUUID();
    const encryptedToken = validatePorterSecret()
      ? encryptCredential(config.openclawToken)
      : null;
    // upsert gateway row, then upsert credential row if encrypted
    await upsertGateway(pool, {
      type: 'openclaw',
      name: 'OpenClaw',
      url: config.openclawUrl,
      authMethod: 'bearer_token',
      source: 'env_bootstrap',
      status: 'active',
      capabilities: ['chat', 'code', 'streaming'],
    });
    if (encryptedToken) {
      await upsertCredential(pool, { gatewayType: 'openclaw', encryptedValue: encryptedToken });
    }
  }
}
```

### Redetect Endpoint
```typescript
// Source: pattern from routes/v1/connections.ts
export default async function bridgeV1Routes(fastify: FastifyInstance) {
  // POST /api/v1/bridge/redetect — admin only
  fastify.post('/redetect', async (request, reply) => {
    if (!request.user) return reply.code(401).send(err('UNAUTHORIZED', 'Login required'));
    if (!['platform_admin', 'admin'].includes(request.user.role ?? '')) {
      return reply.code(403).send(err('FORBIDDEN', 'Admin required'));
    }
    // Delete auto_detected + env_bootstrap rows (preserve manual)
    await pool.query(
      `DELETE FROM gateways WHERE source IN ('auto_detected', 'env_bootstrap')`
    );
    await detectAndUpsertGateways(pool);
    const { rows } = await pool.query(`SELECT * FROM gateways ORDER BY priority ASC`);
    return reply.send(ok({ gateways: rows.map(maskGatewayRow) }));
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `StreamBackend` interface (2 methods) | `GatewayAdapter` interface (5 methods) | Phase 16 | GatewayAdapter adds detect/health/listModels; StreamBackend.stream() maps to GatewayAdapter.stream() |
| env-var-only AI routing (`config.ollamaUrl`) | DB-authoritative routing with env fallback | Phase 16 (bootstrap) / Phase 20 (DB-primary switch) | Phase 16 migrates the data; Phase 20 makes the router read from DB |
| Hardcoded `getBackends()` in ai-router.ts | DB-driven gateway selection | Phase 20 (NOT Phase 16) | Phase 16 does NOT change ai-router.ts — that is Phase 20 |

**What Phase 16 does NOT change (explicitly deferred):**
- `ai-router.ts`: unchanged, still reads from `config.ts`
- `stream-service.ts`: unchanged, `StreamBackend` remains; Phase 17 adapters implement `GatewayAdapter` AND satisfy `StreamBackend` via the `stream()` method
- Any routing logic or model selection heuristics

---

## Open Questions

1. **Route prefix: `/api/v1/bridge/redetect` vs `/api/admin/bridge/redetect`**
   - What we know: CONTEXT.md says `/api/admin/bridge/redetect`; but `routes/v1/admin/` is commented out in v1/index.ts
   - What's unclear: Does the planner want to uncomment the admin routes directory, or register bridge under `/api/v1/bridge`?
   - Recommendation: Register as `routes/v1/bridge.ts` with prefix `/bridge`, giving final URL `/api/v1/bridge/redetect`. Add admin prefix mapping in index.ts if needed. Avoids touching commented-out admin directory.

2. **Unique constraint strategy for gateways table**
   - What we know: Multiple `openai_compat` gateways should be allowed (user can add LiteLLM + another proxy). But only one `ollama` auto-detected row should exist.
   - Recommendation: Partial unique index `(type, source) WHERE source IN ('auto_detected', 'env_bootstrap')` as shown above. Manual rows are unconstrained. This enables `ON CONFLICT` upserts for boot-time detection.

3. **masked_display column vs decrypt-on-read**
   - What we know: Decrypting on every list read is expensive and brittle
   - Recommendation: Store `masked_display` at write time in `gateway_credentials`. Never decrypt on API read path.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 35 tests (in `/home/lobster/documents/porter/tests/`) |
| Config file | `tests/playwright.config.ts` or similar |
| Quick run command | `cd /home/lobster/documents/porter/tests && npx playwright test --grep "bridge"` |
| Full suite command | `cd /home/lobster/documents/porter/tests && npx playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GW-01 | gateways table exists and is queryable | smoke | `cd tests && npx playwright test --grep "gateway"` | ❌ Wave 0 |
| GW-03 | Startup detector finds Ollama binary and creates row | smoke | `cd tests && npx playwright test --grep "detect"` | ❌ Wave 0 |
| GW-07 | Credential masked in GET response, full key never returned | smoke | `cd tests && npx playwright test --grep "mask"` | ❌ Wave 0 |
| GW-08 | Env var bootstrap creates gateway rows on first boot | smoke | manual verification via DB query after restart | Manual only |
| CLI-01 | GatewayAdapter interface compiles without error (TypeScript) | unit | `cd backend && npm run build` | ❌ checks type correctness |

### Sampling Rate
- **Per task commit:** `cd /home/lobster/documents/porter/backend && npm run build` (TypeScript compilation check)
- **Per wave merge:** `cd /home/lobster/documents/porter/tests && npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/bridge-gateway.spec.ts` — covers GW-01, GW-03, GW-07 smoke tests
- [ ] TypeScript interface compilation is verifiable via `npm run build` alone (no new test file needed for CLI-01)
- [ ] GW-08 env bootstrap: manual DB verification after restart is sufficient given complexity of mocking env at test time

*(Existing 35 tests are regression coverage; bridge-specific tests are new)*

---

## Sources

### Primary (HIGH confidence)
- `/home/lobster/documents/porter/backend/src/db/schema.ts` — All Drizzle column type conventions confirmed: text PKs, doublePrecision epochs, jsonb defaults
- `/home/lobster/documents/porter/backend/src/db/migrate-consolidated.ts` — Migration pattern: BEGIN/COMMIT, schema_migrations idempotency, raw SQL DDL
- `/home/lobster/documents/porter/backend/src/db/migrate-15.ts` — Additive migration pattern confirmed, same structure
- `/home/lobster/documents/porter/backend/src/lib/credential-crypto.ts` — AES-256-GCM encrypt/decrypt confirmed, validatePorterSecret() confirmed
- `/home/lobster/documents/porter/backend/src/config.ts` — Env vars being migrated confirmed: ollamaUrl, openclawUrl, ollamaModel, openclawModel, openclawToken, porterSecret
- `/home/lobster/documents/porter/backend/src/services/stream-service.ts` — StreamBackend interface confirmed (2 methods: name + stream); supersession path clear
- `/home/lobster/documents/porter/backend/src/services/ai-router.ts` — DispatchResult type confirmed (response, model, tokensUsed, routingReason); Phase 16 extends this with latencyMs, inputTokens, outputTokens, cached
- `/home/lobster/documents/porter/backend/src/index.ts` — Startup hook injection point confirmed (lines 119-141)
- `/home/lobster/documents/porter/backend/package.json` — Confirmed: drizzle-orm ^0.45.1, pg ^8.20.0, zod ^4.3.6 already installed; `which` NOT installed
- `/home/lobster/documents/porter/backend/src/routes/v1/index.ts` — Route registration pattern; admin routes commented out (line 25)

### Secondary (MEDIUM confidence)
- `npm view which version` → 6.0.1 confirmed current (2026-03-25)
- `which ollama/claude/gemini/codex` — All 4 CLIs confirmed in PATH on this system: `/usr/local/bin/ollama`, `~/.npm-global/bin/claude`, `~/.npm-global/bin/gemini`, `~/.npm-global/bin/codex`

### Tertiary (LOW confidence)
- None — all findings are from direct code inspection

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified against npm registry and package.json
- Architecture: HIGH — migration pattern, schema pattern, startup hook confirmed from direct code read
- Pitfalls: HIGH — most pitfalls derived from reading actual code (e.g. route registration issue from v1/index.ts line 25)

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable codebase, no fast-moving dependencies)
