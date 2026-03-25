# Phase 21: First-Run Setup - Research

**Researched:** 2026-03-25
**Domain:** Bridge API extension — detection endpoint, setup wizard API, zero-config Ollama path, OpenClaw dual-role registration
**Confidence:** HIGH

## Summary

Phase 21 is a pure backend API phase that builds on top of a fully functional gateway registry (Phases 16-20). All infrastructure this phase needs already exists: adapters with `detect()` and `health()`, `detectAndUpsertGateways()` in startup-detector.ts, Zod+OpenAPI validation patterns in bridge.ts, and `maskGatewayRow()` for secure response mapping.

The four requirements decompose cleanly into two work units: (1) a detection endpoint that exposes rich discovery results — FRS-01; and (2) a setup wizard API with four independently-callable steps — FRS-02. FRS-03 (zero-config Ollama path) and FRS-04 (OpenClaw dual-role) are logical outcomes that the detection endpoint and wizard API enable rather than separate build tasks.

The key insight: `detectAndUpsertGateways()` currently returns `void` and swallows results silently. This phase must refactor it to return structured detection results that can be surfaced to clients. No new tables, no new migration, no new service files — this phase is entirely route and response-shape work on top of existing infrastructure.

**Primary recommendation:** Refactor `startup-detector.ts` to return a `DetectionReport`, extend `bridge.ts` routes with `/detect` and `/setup/*` endpoints, and register OpenClaw with `gateway_role` metadata marking it as both `ai_dispatch` and `messaging_gateway`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
All implementation choices are at Claude's discretion — pure infrastructure phase.

Key constraints from requirements:
- FRS-01: Detection endpoint returns all discovered gateways with connection status, available models, and health
- FRS-02: Guided setup API — step-by-step: detect local runtimes, prompt for API keys, validate connections, save to DB. Each step independently callable.
- FRS-03: Zero-config path — if Ollama is running locally, Bridge works immediately with no user action
- FRS-04: OpenClaw integration — detect as both multi-model AI dispatch gateway and messaging gateway (WhatsApp/Telegram)

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FRS-01 | Detection endpoint returns all discovered gateways with connection status and available models | startup-detector.ts refactor returns DetectionReport; bridge.ts adds GET /bridge/detect |
| FRS-02 | Guided setup API — step-by-step: detect local → prompt for API keys → validate connections → save to DB | New POST /bridge/setup/detect, /bridge/setup/configure/:type, /bridge/setup/validate, /bridge/setup/save in bridge.ts |
| FRS-03 | Zero-config path — if Ollama is running locally, Bridge works immediately with no user action | Already works via bootstrapEnvGateways + OllamaAdapter.detect(); detection endpoint just surfaces the result |
| FRS-04 | OpenClaw integration — detect OpenClaw gateway, use for messaging (WhatsApp/Telegram) and as multi-model fallback | Add gateway_role to gateways.metadata JSONB: ["ai_dispatch","messaging_gateway"]; startup-detector.ts sets roles on upsert |
</phase_requirements>

## Standard Stack

### Core (already installed — no new deps)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | 5.x | Route handlers | Project standard — all routes use Fastify plugin pattern |
| zod | 3.x | Request/response validation | Project standard — all routes use Zod schemas |
| pg (pool) | 8.x | Database access | Project standard — raw SQL via pg.Pool |
| which | 5.x | Binary path detection | Already used in startup-detector.ts and adapters |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:crypto | stdlib | UUID generation | randomUUID() for new gateway rows |
| `ok()` / `err()` | internal | Response envelope | All bridge routes use `lib/envelope.ts` — this phase follows same pattern |

**No new npm packages.** This phase requires zero new dependencies.

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
├── services/bridge/
│   └── startup-detector.ts     -- refactor detectAndUpsertGateways() to return DetectionReport
├── routes/v1/
│   └── bridge.ts               -- add /detect endpoint + /setup/* wizard endpoints
└── (no new files needed)
```

### Pattern 1: DetectionReport return shape
**What:** Refactor `detectAndUpsertGateways(pool)` from `Promise<void>` to `Promise<DetectionReport>`. Caller (Fastify boot) ignores the return. New `/detect` route calls `detectAndUpsertGateways` and returns the report.
**When to use:** Existing boot wiring is unchanged — just adds a return value the HTTP layer can consume.

```typescript
// Source: inferred from startup-detector.ts + types.ts patterns
interface GatewayDetectionResult {
  type: GatewayType;
  name: string;
  found: boolean;
  healthy: boolean;
  latencyMs?: number;
  models: string[];
  error?: string;
}

interface DetectionReport {
  gateways: GatewayDetectionResult[];
  detectedAt: number;
  zeroConfigReady: boolean;  // true if at least one gateway is healthy with no config required
}
```

### Pattern 2: Setup Wizard as Independent Steps
**What:** Four route handlers each callable independently. Each step validates its own input and returns its own status. No session state between steps — each step re-reads from DB.
**When to use:** FRS-02 requires each step independently callable. Stateless REST pattern.

```
POST /api/v1/bridge/setup/detect      -- runs discovery, returns DetectionReport
POST /api/v1/bridge/setup/configure   -- accepts { type, config: { url, token } }, saves to DB
POST /api/v1/bridge/setup/validate    -- accepts { type }, calls adapter.health(), returns HealthResult
POST /api/v1/bridge/setup/save        -- accepts { type, enabled }, enables/disables gateway in DB
```

### Pattern 3: Zero-Config Ollama Path (FRS-03)
**What:** Zero-config works via the existing boot path — `bootstrapEnvGateways()` always upserts Ollama with `config.ollamaUrl`. `OllamaAdapter.detect()` confirms the server is up. The new `/detect` endpoint surfaces this to clients.
**When to use:** No new code needed for the zero-config path itself — the routing engine already selects Ollama when it's the only healthy gateway.

Detection endpoint response shape must include `zeroConfigReady: true` when an Ollama gateway is active with `last_health_at` within last 60 seconds, signaling to frontends that no further setup is required.

### Pattern 4: OpenClaw Dual-Role Registration (FRS-04)
**What:** Store `gateway_roles: ["ai_dispatch", "messaging_gateway"]` in the `metadata` JSONB column on the openclaw gateway row. Startup detector sets this during `bootstrapEnvGateways()`. A `GET /bridge/gateways` with this metadata is sufficient for frontends and Bridge routing to recognize dual roles.
**When to use:** No schema change — `metadata` is already JSONB. Just include `gateway_roles` in the upsert payload for openclaw.

```typescript
// In bootstrapEnvGateways() openclaw upsert:
metadata: {
  gateway_roles: ['ai_dispatch', 'messaging_gateway'],
  messaging_protocols: ['whatsapp', 'telegram'],
}
```

### Pattern 5: Route Auth (requireAuth + admin role check)
**What:** All setup wizard routes require `requireAuth` preHandler. Configure/save steps require admin role (same pattern as `/redetect`).
**Established in:** bridge.ts `/redetect` handler uses `['platform_admin', 'admin'].includes(request.sessionUser!.role ?? '')`.

### Anti-Patterns to Avoid
- **Throwing from detect steps:** Each detection step must `try/catch` per-gateway and include `error` field rather than 500ing. Consistent with `detectAndUpsertGateways`'s existing `never throws` philosophy.
- **Blocking boot on detection:** The refactored `detectAndUpsertGateways()` must still be fire-and-forget from boot perspective. The HTTP `/detect` route calls it synchronously, but boot wiring stays async.
- **New migration for this phase:** `metadata` is already JSONB — no schema change needed for gateway_roles. Do not add a migration.
- **Duplicating maskGatewayRow:** The detection endpoint must reuse the existing `maskGatewayRow()` mapper, not invent a new one.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Health checking each gateway | Custom HTTP ping logic | `adapter.health()` | All 5 adapters implement GatewayAdapter.health() with timeouts and error handling |
| Binary path detection | Custom PATH scan | `which` + existing `CLI_BINARIES` array | startup-detector.ts already does this; refactor to return results rather than rewrite |
| Model listing per gateway | Custom model fetch | `adapter.listModels()` | All 5 adapters implement listModels() — OllamaAdapter fetches /api/tags, OpenClawAdapter returns known models |
| Credential masking | New masking logic | `maskGatewayRow()` / `maskCredentialRow()` | Already in bridge.ts at route layer; reuse these exact functions |
| Request validation | Manual type checks | Zod schemas + safeParse | All existing routes use Zod — maintain consistency |
| Response envelope | Raw JSON | `ok()` / `err()` from lib/envelope.ts | All routes use this; deviation would be inconsistent |

**Key insight:** This phase is almost entirely about composing existing building blocks (adapters, startup-detector, masks, envelope) into new HTTP endpoints. The infrastructure is complete; the gap is surfacing it via API.

## Common Pitfalls

### Pitfall 1: detectAndUpsertGateways return type change breaks nothing
**What goes wrong:** Changing `Promise<void>` to `Promise<DetectionReport>` might seem like it could break callers.
**Why it happens:** TypeScript is strict about return types, but callers that ignore the return value are fine with a wider return type.
**How to avoid:** The single caller at boot (`detectAndUpsertGateways(pool).catch(...)`) treats the return as void — TypeScript allows this. No changes needed to boot wiring.
**Warning signs:** TypeScript compile error if boot caller is typed to expect `void` — check with `npm run build`.

### Pitfall 2: Wizard steps must tolerate missing gateway rows
**What goes wrong:** `/setup/validate` called for a gateway type that was never detected — lookup returns nothing, unhandled.
**Why it happens:** Steps are independently callable, so order is not guaranteed.
**How to avoid:** Each step must query DB first; return `{ ok: false, error: 'GATEWAY_NOT_FOUND' }` if row absent — not a 404 throw.

### Pitfall 3: OpenClaw metadata races with model catalog refresh
**What goes wrong:** `gateway_roles` set in metadata during upsert, then `refreshAllGateways()` overwrites metadata without preserving custom keys.
**Why it happens:** `refreshModelsForGateway()` in model-catalog.ts only touches the `models` table, not `gateways.metadata` — so this race does not actually exist.
**How to avoid:** Confirm `refreshModelsForGateway()` never calls UPDATE on gateways.metadata. It only writes to the `models` table (already confirmed in model-catalog.ts source).

### Pitfall 4: Zero-config status can be stale if Ollama starts after boot
**What goes wrong:** Ollama not running at boot → bootstrapped as active but health probe marks it unavailable 30s later → `/detect` still shows stale positive.
**Why it happens:** `/detect` re-runs detection live, but `zeroConfigReady` derived from a stale DB row.
**How to avoid:** The `/detect` route must call `adapter.health()` live (not trust DB status) when computing `healthy` and `zeroConfigReady`. The adapter calls already do this.

### Pitfall 5: Setup wizard configure step needs to handle encrypted credentials
**What goes wrong:** New API key submitted via configure step must be encrypted before storage; plain text in DB would violate GW-07.
**Why it happens:** Credential crypto is not automatic — `encryptCredential()` must be called explicitly.
**How to avoid:** Reuse `encryptCredential()` from `lib/credential-crypto.js` + `validatePorterSecret()` guard (pattern already in `bootstrapEnvGateways()`). If `PORTER_SECRET` not set, return a clear error rather than storing plain text.

## Code Examples

Verified patterns from existing codebase:

### Detection result composition (from startup-detector.ts + adapters)
```typescript
// Source: startup-detector.ts bootstrapEnvGateways + OllamaAdapter.detect/health
// Each gateway result built by calling detect() then health() on the adapter:
const adapter = createAdapter(gatewayRow);
const detectResult = await adapter.detect();   // { found: boolean, binaryPath? }
const healthResult = detectResult.found
  ? await adapter.health()                      // { healthy: boolean, latencyMs? }
  : { healthy: false, error: 'not found' };
const models = detectResult.found ? await adapter.listModels().catch(() => []) : [];

const result: GatewayDetectionResult = {
  type: gatewayRow.type,
  name: gatewayRow.name,
  found: detectResult.found,
  healthy: healthResult.healthy,
  latencyMs: healthResult.latencyMs,
  models,
  error: healthResult.error,
};
```

### Admin role check (from bridge.ts /redetect)
```typescript
// Source: bridge.ts existing /redetect handler
if (!['platform_admin', 'admin'].includes(request.sessionUser!.role ?? '')) {
  return reply.code(403).send(err('FORBIDDEN', 'Admin required'));
}
```

### Credential encryption on configure step (from startup-detector.ts)
```typescript
// Source: startup-detector.ts bootstrapEnvGateways
import { encryptCredential, validatePorterSecret } from '../../lib/credential-crypto.js';
if (validatePorterSecret()) {
  const encrypted = encryptCredential(apiKey);
  const masked = '****...' + apiKey.slice(-4);
  await upsertCredential(pool, gatewayType, encrypted, masked);
} else {
  return reply.code(500).send(err('CONFIG_ERROR', 'PORTER_SECRET not set — cannot store credentials'));
}
```

### Zod schema for setup configure step
```typescript
// Source: wizard.ts Zod pattern + config.ts GatewayType values
const configureSchema = z.object({
  type: z.enum(['ollama', 'openclaw', 'codex_cli', 'claude_cli', 'gemini_cli', 'openai_compat']),
  url: z.string().url().optional(),
  token: z.string().min(1).optional(),
});
```

### OpenClaw metadata with gateway_roles (from startup-detector.ts pattern)
```typescript
// Source: startup-detector.ts bootstrapEnvGateways openclaw upsert
await upsertGateway(pool, {
  type: 'openclaw',
  name: 'OpenClaw',
  url: config.openclawUrl,
  authMethod: 'bearer_token',
  source: 'env_bootstrap',
  status: 'active',
  capabilities: ['chat', 'code', 'streaming'],
  metadata: {
    gateway_roles: ['ai_dispatch', 'messaging_gateway'],
    messaging_protocols: ['whatsapp', 'telegram'],
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| detectAndUpsertGateways returns void | Will return DetectionReport | Phase 21 | HTTP endpoint can surface results without duplicate detection logic |
| OpenClaw registered with empty metadata | Will include gateway_roles in metadata | Phase 21 | Consumers can identify dual-role without hardcoding type checks |
| No setup wizard API | /bridge/setup/* steps | Phase 21 | Frontends and CLI can programmatically walk through first-run setup |

## Open Questions

1. **Should /bridge/detect require auth or be public?**
   - What we know: All existing bridge routes use requireAuth. Frontends need detection state before login in some zero-config flows.
   - What's unclear: Whether the frontend needs to call /detect pre-login.
   - Recommendation: Require auth (consistent with all other bridge routes). A truly zero-config Ollama flow doesn't require manual detection — the routing engine handles it automatically.

2. **Should /bridge/setup/detect re-run full upsert or just probe adapters?**
   - What we know: `detectAndUpsertGateways` is the canonical detection source; running it idempotently is safe (ON CONFLICT DO UPDATE).
   - What's unclear: Frequency concern — if called many times in rapid succession, model catalog refresh also fires.
   - Recommendation: `/setup/detect` calls `detectAndUpsertGateways()` (same as `/redetect`). The fire-and-forget model catalog refresh is fine; `refreshAllGateways` is already safe to call multiple times.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bash smoke tests (existing pattern: smoke-phase*.sh) |
| Config file | none — standalone bash scripts |
| Quick run command | `bash tests/smoke-phase21.sh` |
| Full suite command | `cd tests && npx playwright test` (35 tests) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FRS-01 | GET /bridge/detect returns gateways with status + models | smoke | `bash tests/smoke-phase21.sh` (FRS-01 section) | Wave 0 |
| FRS-01 | Response includes zeroConfigReady boolean | smoke | `bash tests/smoke-phase21.sh` (FRS-01 section) | Wave 0 |
| FRS-02 | POST /bridge/setup/detect returns DetectionReport | smoke | `bash tests/smoke-phase21.sh` (FRS-02 section) | Wave 0 |
| FRS-02 | POST /bridge/setup/configure accepts type+config | smoke | `bash tests/smoke-phase21.sh` (FRS-02 section) | Wave 0 |
| FRS-02 | POST /bridge/setup/validate returns health result | smoke | `bash tests/smoke-phase21.sh` (FRS-02 section) | Wave 0 |
| FRS-02 | POST /bridge/setup/save enables/disables gateway | smoke | `bash tests/smoke-phase21.sh` (FRS-02 section) | Wave 0 |
| FRS-03 | Ollama detected + health ok → zeroConfigReady: true | smoke | `bash tests/smoke-phase21.sh` (FRS-03 section) | Wave 0 |
| FRS-04 | OpenClaw gateway row has gateway_roles in metadata | smoke | `bash tests/smoke-phase21.sh` (FRS-04 section) | Wave 0 |
| FRS-04 | gateway_roles includes ai_dispatch AND messaging_gateway | smoke | `bash tests/smoke-phase21.sh` (FRS-04 section) | Wave 0 |

### Sampling Rate
- **Per task commit:** `bash tests/smoke-phase21.sh`
- **Per wave merge:** `cd tests && npx playwright test`
- **Phase gate:** All smoke tests green + Playwright 35 tests green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/smoke-phase21.sh` — covers FRS-01 through FRS-04 (bash curl + psql pattern matching existing smoke tests)

*(No framework install needed — bash + psql + curl already available)*

## Sources

### Primary (HIGH confidence)
- Direct codebase read: `backend/src/services/bridge/startup-detector.ts` — existing detection logic, upsert patterns
- Direct codebase read: `backend/src/routes/v1/bridge.ts` — existing route patterns, maskGatewayRow, requireAuth usage
- Direct codebase read: `backend/src/services/bridge/adapters/*.ts` — detect/health/listModels implementations
- Direct codebase read: `backend/src/services/bridge/types.ts` — GatewayAdapter interface, DetectResult, HealthResult shapes
- Direct codebase read: `backend/src/services/bridge/health-probe.ts` — per-gateway health isolation pattern
- Direct codebase read: `backend/src/db/migrate-bridge-v1.ts` — gateways schema, metadata JSONB confirmed
- Direct codebase read: `backend/src/config.ts` — config.ollamaUrl, config.openclawToken patterns
- Direct codebase read: `.planning/STATE.md` — Phase 16-20 accumulated decisions

### Secondary (MEDIUM confidence)
- CONTEXT.md phase boundary and requirements: constraint scope confirmed
- REQUIREMENTS.md FRS-01 through FRS-04 definitions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project, no new deps needed
- Architecture: HIGH — all patterns directly observed in existing bridge code
- Pitfalls: HIGH — each pitfall traced to specific existing code behavior

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable codebase, no fast-moving deps)
