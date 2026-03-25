# Phase 18: Resilience Layer - Research

**Researched:** 2026-03-25
**Domain:** Circuit breakers, health probing, retry/backoff, fallback chains — Node.js/TypeScript
**Confidence:** HIGH

## Summary

Phase 18 adds four resilience capabilities to the Bridge layer: periodic health probing via the existing scheduler, per-gateway circuit breakers via `opossum`, retry-with-backoff for transient errors, and an N-gateway fallback chain. All four integrate with existing infrastructure (scheduler.ts, routing-engine.ts, the `gateways` table, and `emitSSE`). Zero new tables are needed — only a `migrate-bridge-v3.ts` that adds a `circuit_state` column to `gateways`.

The critical integration fact: opossum v9 is CommonJS. The backend is `"type": "module"` (ESM). Import via `createRequire` from `node:module` — this is the standard Node.js ESM-CJS bridge and works without issues with `esModuleInterop: true`.

**Primary recommendation:** Install opossum v9 + @types/opossum v8 (latest DefinitelyTyped). Wire circuit breakers as a singleton map keyed by gateway ID, initialized lazily in a `CircuitBreakerRegistry` service. Health probe registers as a scheduler tick-counter task. Fallback chain lives in routing-engine.ts as `selectWithFallback()`, replacing the single-shot `select()` call in dispatch paths.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- GW-02: Health probe every 30s via existing scheduler, updates gateway status in DB, SSE events on state changes
- GW-04: Circuit breaker per gateway using opossum library, Closed/Open/Half-Open states, configurable thresholds, SSE on trips
- GW-05: Retry with exponential backoff for transient errors (429, 503), separate from circuit breaker logic
- GW-06: Fallback chain — N gateways in priority order through routing engine

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GW-02 | Background health probe runs every 30s via scheduler, updates gateway status in DB, emits SSE events on state changes | Scheduler tick-counter pattern already used (DEADLINE_CHECK_INTERVAL = 30 ticks × 2s = 60s); use same pattern at 15 ticks = 30s |
| GW-04 | Circuit breaker per gateway (opossum) with Closed/Open/Half-Open states, configurable thresholds, SSE events on trips | opossum v9 CJS imported via createRequire; errorFilter enables three-class taxonomy; open/close/halfOpen events map to emitSSE |
| GW-05 | Retry with exponential backoff for transient errors (429, 503), separate from circuit breaker logic | errorFilter suppresses transient errors from circuit counter; separate retry wrapper with delay() + attempts cap |
| GW-06 | Fallback chain — N gateways in priority order, not just binary cheap/strong | routing-engine.ts select() already returns priority-ordered candidates; wrap in selectWithFallback() that iterates the list until one succeeds |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| opossum | 9.0.0 | Circuit breaker with Closed/Open/Half-Open states, event emission, stats | Explicitly required by GW-04; pre-approved in STATE.md |
| @types/opossum | 8.1.9 (latest) | TypeScript definitions for opossum | DefinitelyTyped — covers opossum v9 API (minor differences) |
| node:module createRequire | built-in | ESM-to-CJS import bridge | Standard pattern — opossum v9 is CJS, backend is ESM |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| p-queue | 9.1.0 (already installed) | Concurrency queues | Already wired — dispatch-queues.ts; no change needed |
| node:test + tsx | built-in / 4.x | Test runner | Already used in __tests__/*.test.ts; same pattern for new tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| opossum | cockatiel, brakes | opossum is explicit requirement — no alternative considered |
| createRequire | dynamic import() | dynamic import() requires .default access at runtime and more complex typing |

**Installation:**
```bash
cd /home/lobster/documents/porter/backend && npm install opossum && npm install --save-dev @types/opossum
```

**Version verification:** opossum 9.0.0 confirmed via `npm view opossum version` on 2026-03-25. @types/opossum 8.1.9 confirmed via `npm view @types/opossum version`.

---

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
├── db/
│   └── migrate-bridge-v3.ts       # adds circuit_state col to gateways
├── services/bridge/
│   ├── circuit-breaker-registry.ts # CircuitBreakerRegistry singleton — GW-04
│   ├── health-probe.ts             # runHealthProbe() — GW-02
│   ├── retry.ts                    # withRetry() — GW-05
│   ├── routing-engine.ts           # add selectWithFallback() — GW-06 (extend existing)
│   └── types.ts                    # add ErrorClass type, CircuitState type (extend existing)
└── __tests__/
    ├── circuit-breaker.test.ts     # GW-04 behavior stubs
    ├── health-probe.test.ts        # GW-02 behavior stubs
    ├── retry.test.ts               # GW-05 behavior stubs
    └── fallback-chain.test.ts      # GW-06 behavior stubs
```

### Pattern 1: CJS Module in ESM Project (opossum import)
**What:** opossum v9 ships as CommonJS. The backend is `"type": "module"`. Node.js supports importing CJS from ESM via `createRequire`.
**When to use:** Any file that imports from opossum.

```typescript
// Source: Node.js official docs — ESM/CJS interop
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CircuitBreaker = require('opossum') as typeof import('opossum').default;
```

With `skipLibCheck: true` in tsconfig.json and `esModuleInterop: true`, this compiles without issues.

### Pattern 2: CircuitBreakerRegistry Singleton
**What:** One CircuitBreaker instance per gateway ID, lazily created on first use. Stored in a module-level Map.
**When to use:** Every dispatch that goes through routing-engine.ts.

```typescript
// Source: opossum README + project dispatch-queues.ts singleton pattern
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const CircuitBreaker = require('opossum') as typeof import('opossum').default;
import { emitSSE } from '../scheduler.js';

const _breakers = new Map<string, InstanceType<typeof CircuitBreaker>>();

export function getBreaker(gatewayId: string, gatewayType: string): InstanceType<typeof CircuitBreaker> {
  if (!_breakers.has(gatewayId)) {
    const breaker = new CircuitBreaker(async (fn: () => Promise<unknown>) => fn(), {
      timeout: 30_000,
      errorThresholdPercentage: 50,
      resetTimeout: 60_000,
      volumeThreshold: 3,
      errorFilter: isTransientError,   // transient errors don't trip the breaker
    });

    breaker.on('open', () => {
      emitSSE('bridge:circuit-trip', { gateway_id: gatewayId, state: 'open' }).catch(() => {});
    });
    breaker.on('halfOpen', () => {
      emitSSE('bridge:circuit-trip', { gateway_id: gatewayId, state: 'half_open' }).catch(() => {});
    });
    breaker.on('close', () => {
      emitSSE('bridge:circuit-trip', { gateway_id: gatewayId, state: 'closed' }).catch(() => {});
    });

    _breakers.set(gatewayId, breaker);
  }
  return _breakers.get(gatewayId)!;
}
```

### Pattern 3: Three-Class Error Taxonomy
**What:** GW-04 requires the breaker not treat rate-limit (429) the same as auth failure (401). `errorFilter` is the hook — returning `true` suppresses the error from the circuit counter.
**When to use:** As the `errorFilter` option to every CircuitBreaker.

```typescript
// Source: opossum docs — errorFilter option
export type ErrorClass = 'transient' | 'persistent' | 'configuration';

export function classifyError(err: Error): ErrorClass {
  const msg = err.message ?? '';
  // Transient: rate-limit (429) and service-unavailable (503) — recoverable with backoff
  if (/429|rate.?limit|too.?many/i.test(msg)) return 'transient';
  if (/503|service.?unavailable/i.test(msg)) return 'transient';
  // Configuration: auth failures — not recoverable by retry, not a gateway health issue
  if (/401|403|unauthorized|forbidden/i.test(msg)) return 'configuration';
  // Persistent: everything else trips the breaker (network errors, 500, timeouts)
  return 'persistent';
}

// errorFilter: return true to SUPPRESS the error from breaker counting
export function isTransientError(err: Error): boolean {
  return classifyError(err) === 'transient';
}
```

### Pattern 4: Health Probe via Existing Scheduler
**What:** Register as a tick-counter check inside scheduler.ts `tick()`. Every 15 ticks × 2000ms = 30s.
**When to use:** GW-02 — do not create a new setInterval, use the existing polling loop.

```typescript
// Source: scheduler.ts tick() pattern (DEADLINE_CHECK_INTERVAL = 30 ticks at 2s = 60s)
// In scheduler.ts tick():
const HEALTH_PROBE_INTERVAL = 15; // 15 × 2000ms = 30s

if (tickCount % HEALTH_PROBE_INTERVAL === 0) {
  runHealthProbe().catch(err => console.error('[scheduler] health probe error', err));
}
```

The `runHealthProbe()` function in `health-probe.ts`:
1. Queries `gateways` for all `enabled = 1` rows
2. For each: calls `createAdapter(row).health()`
3. Maps `HealthResult.healthy` to `'active' | 'stale' | 'unavailable'` (stale = degraded — responded but slowly)
4. `UPDATE gateways SET status = $1, last_health_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $2`
5. If status changed: `emitSSE('bridge:health', { gateway_id, old_status, new_status })`

**Stale threshold:** latencyMs > 5000ms → 'stale'; healthy false → 'unavailable'; healthy true + fast → 'active'

### Pattern 5: Retry with Exponential Backoff (separate from circuit breaker)
**What:** Wrap dispatch in a retry loop that only retries transient errors. Circuit breaker wraps the adapter call; retry wraps the circuit breaker call.
**When to use:** GW-05 — only for 429 and 503. Auth failures (401) do NOT retry.

```typescript
// Source: project pattern (scheduler.ts attempt_count backoff, adapted)
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: Error = new Error('unknown');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (classifyError(lastError) !== 'transient') throw lastError; // non-transient: fail fast
      if (attempt === maxAttempts) throw lastError;
      const delay = baseDelayMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}
```

### Pattern 6: N-Gateway Fallback Chain
**What:** `selectWithFallback()` iterates priority-ordered candidates from `select()`, trying each until one succeeds. On circuit-open rejection, moves to next candidate.
**When to use:** GW-06 — replace single `select()` + `dispatchWithQueue()` with fallback-aware dispatch.

```typescript
// Source: routing-engine.ts select() pattern + opossum fire() rejection shape
async selectWithFallback(ctx: RoutingContext, req: BridgeDispatchRequest): Promise<BridgeDispatchResult> {
  const candidates = await this.selectAllCandidates(ctx); // returns priority-sorted list
  const errors: string[] = [];

  for (const candidate of candidates) {
    const breaker = getBreaker(candidate.row.id, candidate.row.type);
    if (breaker.opened) {
      errors.push(`${candidate.row.type}: circuit open`);
      continue;
    }
    try {
      return await withRetry(() =>
        getQueue(candidate.row.type).add(() =>
          breaker.fire(() => candidate.adapter.dispatch(req))
        ) as Promise<BridgeDispatchResult>
      );
    } catch (err) {
      errors.push(`${candidate.row.type}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`All gateways failed: ${errors.join('; ')}`);
}
```

### Anti-Patterns to Avoid
- **Separate setInterval for health probe:** Use the existing scheduler tick-counter. Two polling loops = confusing ownership.
- **Circuit breaker keyed by gateway type:** Key by gateway ID. Multiple gateways can share a type but have independent health.
- **Retrying inside circuit breaker errorFilter:** errorFilter suppresses errors from the breaker counter; it does not retry. Retry is a separate wrapper.
- **Storing circuit state in DB for breaker decisions:** In-memory state is sufficient and correct. DB column `circuit_state` is for admin observability only, not for routing decisions.
- **Using breaker.fallback() for gateway fallback:** Opossum fallback is a static fallback value. The N-gateway fallback chain is a loop in routing-engine.ts — separate concept.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Circuit breaker state machine | Custom Closed/Open/Half-Open tracking | opossum CircuitBreaker | State transitions, half-open test logic, rolling window stats are subtle; opossum battle-tested |
| Rolling error rate window | Custom count/bucket logic | opossum options (rollingCountTimeout, rollingCountBuckets) | Sliding window with buckets is non-trivial to implement correctly |
| Breaker event emission | Custom event hooks | opossum 'open'/'close'/'halfOpen' events | opossum fires these at correct transition boundaries |

**Key insight:** opossum handles the entire state machine including the single-probe half-open behavior. The only custom logic needed is errorFilter for the three-class taxonomy.

---

## Common Pitfalls

### Pitfall 1: opossum Wrapping Pattern
**What goes wrong:** Wrapping `adapter.dispatch` directly as the circuit breaker action locks the breaker to one specific function signature. When the adapter changes, every breaker needs recreation.
**Why it happens:** Naive opossum usage creates a breaker around the final function.
**How to avoid:** Wrap a generic `async (fn: () => Promise<unknown>) => fn()` thunk, then call `breaker.fire(() => adapter.dispatch(req))`. The breaker protects any callable.
**Warning signs:** Types become rigid; tests require adapter mocks to exercise breaker.

### Pitfall 2: Type Mismatch — @types/opossum v8 vs opossum v9
**What goes wrong:** @types/opossum 8.1.9 may not perfectly match opossum 9.0.0. `tsconfig.json` has `skipLibCheck: true` which suppresses most issues, but `strict: true` may still surface constructor type errors.
**Why it happens:** DefinitelyTyped packages lag library releases.
**How to avoid:** Use `as typeof import('opossum').default` type assertion when instantiating. Cast `breaker.fire()` return type explicitly. Avoid relying on inferred generic types from @types.
**Warning signs:** TypeScript errors referencing `CircuitBreaker` constructor overloads.

### Pitfall 3: Health Probe Thundering Herd on Startup
**What goes wrong:** On boot, runHealthProbe() fires for all gateways simultaneously before adapters are stable.
**Why it happens:** Probe fires on first scheduler tick at t=30s, all gateways queried in parallel.
**How to avoid:** Skip the first probe if `tickCount < HEALTH_PROBE_INTERVAL` (i.e., only probe after the first full interval, not at t=0). Or stagger with `setTimeout` offsets per gateway.
**Warning signs:** All gateways briefly show 'unavailable' immediately after restart.

### Pitfall 4: Circuit Breaker State Lost on Restart
**What goes wrong:** In-memory breaker state resets to Closed on every service restart. A gateway that was Open before restart will receive traffic immediately.
**Why it happens:** opossum state is in-memory only.
**How to avoid:** This is acceptable for this phase. The health probe will re-detect unhealthy gateways within 30s and update DB status. The circuit breaker will re-open after hitting thresholds. Document this as expected behavior.
**Warning signs:** Brief traffic spikes to a broken gateway after restart.

### Pitfall 5: p-queue + opossum fire() Return Type
**What goes wrong:** `getQueue(type).add(() => breaker.fire(...))` — p-queue's `.add()` returns `Promise<T | void>` and TypeScript won't narrow to `Promise<T>`.
**Why it happens:** p-queue types the return as `T | void` to handle queue items that don't return values.
**How to avoid:** Cast: `getQueue(type).add(...) as Promise<BridgeDispatchResult>` — consistent with dispatch-queues.ts existing pattern (line 306 of routing-engine.ts).
**Warning signs:** TypeScript error: `Type 'void' is not assignable to type 'BridgeDispatchResult'`.

### Pitfall 6: Retry Delay Blocking Event Loop
**What goes wrong:** `await new Promise(r => setTimeout(r, delay))` inside a retry loop holds the request open for potentially 4+ seconds (1s + 2s + 4s = 7s total). This is acceptable if the request itself has timeout semantics, but can make the route feel unresponsive.
**Why it happens:** Retry delay is inherently blocking from the caller's perspective.
**How to avoid:** Keep `maxAttempts = 3` and `baseDelayMs = 1000` as defaults. For streaming requests, do not retry (streaming partial results cannot be replayed). Apply retry only to `dispatch()` (non-streaming).
**Warning signs:** Dispatch latency spikes under rate limiting.

---

## Code Examples

### Installing opossum in the ESM/TypeScript project
```typescript
// Source: Node.js official ESM-CJS interop docs
// backend/src/services/bridge/circuit-breaker-registry.ts

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// @ts-expect-error CJS default import
const CircuitBreaker = require('opossum') as typeof import('opossum').default;
```

### CircuitBreaker constructor options (opossum v9)
```typescript
// Source: nodeshift.dev/opossum + opossum README
const options = {
  timeout: 30_000,              // abort if action takes > 30s
  errorThresholdPercentage: 50, // open when 50% of rolling window are failures
  resetTimeout: 60_000,         // wait 60s before testing half-open
  volumeThreshold: 3,           // need >= 3 requests before evaluating threshold
  rollingCountTimeout: 10_000,  // 10s rolling window for error counting
  errorFilter: isTransientError, // return true = suppress from breaker (transient errors)
};
```

### Checking breaker state
```typescript
// Source: nodeshift.dev/opossum API docs
breaker.opened    // true = circuit open, rejecting calls
breaker.closed    // true = normal operation
breaker.halfOpen  // true = testing recovery
breaker.stats     // { failures, successes, rejects, timeouts, fallbacks, fires }
```

### Schema migration pattern (migrate-bridge-v3)
```sql
-- Source: migrate-bridge-v1.ts + migrate-bridge-v2.ts idempotent pattern
ALTER TABLE gateways ADD COLUMN IF NOT EXISTS circuit_state TEXT DEFAULT 'closed';
-- Values: 'closed' | 'open' | 'half_open'
-- Updated by health probe and circuit breaker events (admin observability only)
INSERT INTO schema_migrations (id) VALUES ('bridge_v3');
```

### SSE event naming (consistent with ADM-07)
```typescript
// Source: REQUIREMENTS.md ADM-07 — SSE events for bridge:health, bridge:dispatch, bridge:circuit-trip
emitSSE('bridge:health', {
  gateway_id: string,
  gateway_type: string,
  old_status: GatewayStatus,
  new_status: GatewayStatus,
  latency_ms: number | null,
}).catch(() => {});

emitSSE('bridge:circuit-trip', {
  gateway_id: string,
  gateway_type: string,
  state: 'open' | 'half_open' | 'closed',
}).catch(() => {});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Retry-until-fail ad-hoc | Structured circuit breaker + retry separation | Industry standard 2015+ | Circuit breaker prevents retry storms; retry handles transient spikes |
| Binary healthy/unhealthy | Three-state (Closed/Open/Half-Open) with half-open probe | Martin Fowler 2014 | Half-open enables automatic recovery without manual intervention |
| Global retry count | Per-error-class retry policy (transient vs persistent) | SRE handbook ~2016 | 401 should never retry; 429 should always retry |

**Deprecated/outdated:**
- opossum `maxFailures` option: deprecated in favor of `errorThresholdPercentage` + `volumeThreshold` combination.

---

## Open Questions

1. **Should `selectWithFallback()` replace `select()` everywhere, or only in dispatch paths?**
   - What we know: `select()` is called by routing-engine.ts; `dispatchWithQueue()` is separate
   - What's unclear: Whether streaming path needs the same fallback chain
   - Recommendation: Add `selectWithFallback()` as a new method; keep `select()` for cases that only need routing decision (logging, admin display)

2. **Health probe timeout: what classifies a gateway as 'stale' vs 'unavailable'?**
   - What we know: `HealthResult.healthy: boolean` + optional `latencyMs`
   - What's unclear: Threshold for 'stale' (degraded but reachable)
   - Recommendation: `healthy && latencyMs > 5000` → 'stale'; `!healthy` → 'unavailable'; else → 'active'

3. **Do CLI adapters need circuit breakers?**
   - What we know: CLI adapters (codex_cli, claude_cli, gemini_cli) dispatch via subprocess, concurrency=1
   - What's unclear: Whether subprocess failures have the same retry/backoff semantics
   - Recommendation: Yes — same circuit breaker registry. A failing CLI binary should trip the breaker the same way a failing HTTP endpoint does.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in) + tsx 4.x |
| Config file | none — invoked directly |
| Quick run command | `npx tsx --test backend/src/__tests__/circuit-breaker.test.ts` |
| Full suite command | `npx tsx --test backend/src/__tests__/*.test.ts` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GW-02 | Health probe updates gateway status and emits SSE on change | unit | `npx tsx --test backend/src/__tests__/health-probe.test.ts` | Wave 0 |
| GW-02 | Health probe runs on 30s cadence via scheduler tick | unit | `npx tsx --test backend/src/__tests__/health-probe.test.ts` | Wave 0 |
| GW-04 | Circuit breaker transitions Closed → Open when threshold exceeded | unit | `npx tsx --test backend/src/__tests__/circuit-breaker.test.ts` | Wave 0 |
| GW-04 | Transient errors (429) do not trip the circuit breaker | unit | `npx tsx --test backend/src/__tests__/circuit-breaker.test.ts` | Wave 0 |
| GW-04 | Auth errors (401) do trip the circuit breaker | unit | `npx tsx --test backend/src/__tests__/circuit-breaker.test.ts` | Wave 0 |
| GW-04 | Open circuit emits bridge:circuit-trip SSE | unit | `npx tsx --test backend/src/__tests__/circuit-breaker.test.ts` | Wave 0 |
| GW-05 | Transient errors trigger retry with exponential backoff | unit | `npx tsx --test backend/src/__tests__/retry.test.ts` | Wave 0 |
| GW-05 | Non-transient errors (401) do not retry | unit | `npx tsx --test backend/src/__tests__/retry.test.ts` | Wave 0 |
| GW-06 | Fallback chain tries next gateway when first fails | unit | `npx tsx --test backend/src/__tests__/fallback-chain.test.ts` | Wave 0 |
| GW-06 | Fallback chain skips gateways with open circuit | unit | `npx tsx --test backend/src/__tests__/fallback-chain.test.ts` | Wave 0 |
| GW-06 | Fallback chain throws when all gateways exhausted | unit | `npx tsx --test backend/src/__tests__/fallback-chain.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx tsx --test backend/src/__tests__/circuit-breaker.test.ts`
- **Per wave merge:** `npx tsx --test backend/src/__tests__/*.test.ts`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/__tests__/circuit-breaker.test.ts` — covers GW-04 (Closed/Open/Half-Open, errorFilter, SSE emission)
- [ ] `backend/src/__tests__/health-probe.test.ts` — covers GW-02 (DB update, SSE on change, scheduler wiring)
- [ ] `backend/src/__tests__/retry.test.ts` — covers GW-05 (exponential backoff, error class filtering)
- [ ] `backend/src/__tests__/fallback-chain.test.ts` — covers GW-06 (priority iteration, open-circuit skip, exhaustion error)

---

## Sources

### Primary (HIGH confidence)
- opossum v9 npm registry (`npm view opossum`) — version, CJS module format, maintainers
- opossum GitHub README (nodeshift/opossum) — constructor options, state machine, event names, ESM/CJS interop pattern
- nodeshift.dev/opossum official docs — full option table, state properties, stats API
- `/home/lobster/documents/porter/backend/src/services/scheduler.ts` — tick-counter pattern, POLL_INTERVAL_MS, emitSSE usage
- `/home/lobster/documents/porter/backend/src/services/bridge/routing-engine.ts` — select() method, candidate iteration, fire-and-forget logging
- `/home/lobster/documents/porter/backend/src/services/bridge/dispatch-queues.ts` — singleton Map pattern, getQueue() API
- `/home/lobster/documents/porter/backend/src/services/bridge/types.ts` — GatewayRow, HealthResult, BridgeDispatchResult
- `/home/lobster/documents/porter/backend/src/db/migrate-bridge-v2.ts` — migration idempotency pattern
- `/home/lobster/documents/porter/backend/package.json` — `"type": "module"`, confirmed opossum not yet installed
- `/home/lobster/documents/porter/backend/tsconfig.json` — `skipLibCheck: true`, `esModuleInterop: true`

### Secondary (MEDIUM confidence)
- `npm view @types/opossum version` — confirmed 8.1.9 as latest DefinitelyTyped types
- Node.js official docs pattern — createRequire for CJS-in-ESM import

### Tertiary (LOW confidence)
- None — all claims verified against primary sources.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified via npm registry on 2026-03-25; opossum requirement locked
- Architecture: HIGH — all patterns derive directly from existing codebase conventions (scheduler tick-counter, singleton Map, fire-and-forget, emitSSE)
- Pitfalls: HIGH — opossum CJS/ESM issue and p-queue type narrowing issue are reproducible and verified against actual project code

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (opossum is stable; @types/opossum may release minor updates)
