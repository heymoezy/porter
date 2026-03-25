# Pitfalls Research

**Domain:** AI Gateway — Model routing, provider management, cost tracking, circuit breakers, config migration
**Researched:** 2026-03-25
**Confidence:** HIGH (grounded in Porter's actual ai-router.ts + verified against production gateway postmortems and official API docs)

This file is specific to the v3.0 Porter Bridge milestone. It extends, not replaces, the v2.0 PITFALLS.md which covers streaming, RBAC, and collaborative session pitfalls.

---

## Critical Pitfalls

### Pitfall 1: Health Checks That Run on Every Request

**What goes wrong:**
`probeBackend()` in the current `ai-router.ts` fires an HTTP HEAD request to the backend URL on every single `selectModel()` call — and then fires a second probe on the alt-tier to decide whether to log the decision. This means a 2-second HEAD request (or two) hits the network on every dispatch. Under load, this becomes the dominant latency source. Worse: if Ollama is on localhost and responds in <1ms, the probe feels free in development. Under production load with network-attached backends, each probe adds 50-200ms to every response.

**Why it happens:**
The probe pattern is the right idea but placed at the wrong granularity. Developers validate the concept locally (it works, latency is negligible), then ship without profiling. The per-request probe becomes an invisible tax.

**How to avoid:**
Introduce a backend health cache with a TTL (10-30 seconds). A background worker probes each gateway every N seconds and writes results to an in-memory map (or the gateway_health DB table). The dispatch path reads from the cache — no network call per request. The cache entry includes: `{ available: boolean, lastChecked: unix_ms, latencyMs: number, consecutiveFailures: number }`. Only probe inline as a fallback when the cache entry is stale.

```typescript
// Health cache pattern — check, not probe, on each dispatch
const healthCache = new Map<string, { available: boolean; expiry: number }>();
function isBackendAvailable(url: string): boolean {
  const entry = healthCache.get(url);
  if (entry && Date.now() < entry.expiry) return entry.available;
  // Cache miss — assume available, let background worker update
  return true;
}
```

**Warning signs:**
- Average dispatch latency consistently 100-300ms higher than model response time
- Two HEAD requests per dispatch visible in server access logs
- `probeBackend` showing up in slow query / tracing spans

**Phase to address:** Phase 1 (Gateway Registry). Establish the health cache as the foundation. All subsequent gateway probe logic uses the cache, not inline probes.

---

### Pitfall 2: Treating All Provider Errors as the Same Circuit-Breaker Trigger

**What goes wrong:**
The current router throws a generic error on non-OK responses. A circuit breaker naively built on top will count every error equally — 429 (rate limited), 500 (server crash), 503 (maintenance), and 401 (bad API key) all increment the failure counter equally. This causes two disaster scenarios:

1. **Over-tripping:** A burst of 429s (rate limit, self-clearing in 60 seconds) trips the circuit open for 5 minutes. The gateway fails over to the expensive model for requests that would have succeeded with a 5-second retry.

2. **Under-tripping:** A provider silently returns 200 with empty or malformed responses (hallucination of availability). The circuit never opens because HTTP was successful, but agents receive garbage responses. This is the "silent failure" mode.

**Why it happens:**
HTTP status codes were designed for web servers, not LLM APIs. LLM providers add their own semantics: a 200 with `{"error": "content_policy_violation"}` in the body is a provider rejection, not success. Circuit breakers inherited from REST API patterns miss this.

**How to avoid:**
Classify errors before counting them. Three classes:
- **Transient (retry, do NOT trip breaker fast):** 429 with Retry-After header, 503 with short maintenance window, network timeout on first attempt. Use exponential backoff with jitter, not circuit breaking.
- **Persistent (trip breaker, failover):** 5xx series with no Retry-After, consecutive timeouts (>3), provider returning empty `choices[]` array on 200.
- **Configuration (alert, do not retry or failover):** 401/403 (bad API key — retrying wastes money), 404 (model not found — failover may not help if all gateways share the same wrong model name).

Also validate response body, not just HTTP status: `if (!data.choices?.length || !data.choices[0].message?.content)` is a breaker event regardless of HTTP 200.

**Warning signs:**
- Circuit breaker trips during provider rate-limit windows (429 storms)
- Agents receive empty responses that were silently treated as success
- 401 errors being retried 3x before failing (each retry burns money and is pointless)

**Phase to address:** Phase 3 (Smart Routing + Circuit Breakers). Design the error taxonomy before writing any circuit breaker code.

---

### Pitfall 3: Heuristic Routing That Misfires on Short Complex Requests

**What goes wrong:**
`shouldRouteCheap()` uses length (<160 chars, <28 words) + keyword matching as the routing gate. This misfires in two directions:

- **Under-routing to strong model:** "Fix this bug: `null pointer on line 47`" — short, no URL, triggers cheap model. But it references code and requires debugging ability that Qwen 1.5B cannot reliably provide. The user gets a wrong answer.
- **Over-routing to strong model:** A 200-word business question with no code keywords ("Please help me think through whether we should expand to a new market this quarter given the current situation") — long, no technical keywords, but this is strategic reasoning, not debugging. Cheap model may handle it fine and save cost.

Length and keywords are a proxy for complexity, not a measure of it. They have ~70% accuracy at best (per ICLR 2025 routing benchmark).

**Why it happens:**
Length heuristics are fast, cheap, and good enough for the 70% case. The failure modes only become visible when users report bad answers on edge cases. It is easy to ship this as "good enough for MVP" and never revisit.

**How to avoid:**
For v3.0, accept the current heuristic as Phase 1 baseline — it is already better than no routing. But **instrument every routing decision with outcome feedback**. Log: `{ message_hash, tier_selected, response_quality: null }`. Add a mechanism (even manual initially) to flag routing misses. In a later phase, use accumulated routing decisions from `decision_log` to tune the thresholds. The routing logic in `ai-router.ts` should be extracted into a pluggable `RoutingStrategy` interface so it can be swapped without touching dispatch.

**Warning signs:**
- Users complaining about poor answers on short messages (under-routing)
- `decision_log` shows >90% of requests going to strong model (over-routing kills cost savings)
- Cheap model selected for messages containing backtick-quoted code snippets under the threshold

**Phase to address:** Phase 2 (Model Catalog). The catalog stores per-model capability profiles that can augment routing decisions. Phase 3 (Smart Routing) uses those profiles.

---

### Pitfall 4: Token Cost Tracking That Ignores Input/Output Asymmetry and Pricing Tiers

**What goes wrong:**
The current `trackTokenUsage()` stores `input_tokens` and `output_tokens` separately but has no pricing attached. When someone builds a cost dashboard on top of this, the naive implementation multiplies `(input + output) * some_per_token_price`. This is wrong in three ways:

1. **Input/output price ratio varies 2-10x by provider.** Claude Sonnet: $3/M input vs $15/M output (5:1). GPT-4o: $2.50/M input vs $10/M output (4:1). Qwen local: $0 for both. Treating them as equal inflates/deflates actual spend estimates.

2. **Context-dependent pricing tiers.** Anthropic charges higher rates when prompt_tokens > 200K. Gemini 2.5 Pro has a similar threshold. These tiers are invisible to flat per-token math.

3. **Cached token discounts.** When prompt caching is active (Anthropic cache_read_input_tokens, OpenAI cached tokens), cached tokens cost 10-50% of normal input tokens. The current schema has no field for cached token counts. A gateway that reports higher token usage than actual cost is misleading.

**Why it happens:**
Token tracking is an operational concern, not a feature. It gets bolted on after the core routing works. The schema grows organically and nobody goes back to add pricing tiers or cached token fields.

**How to avoid:**
Schema the cost model upfront in v3.0:
```sql
-- gateway_models table should include:
price_input_per_million   DOUBLE PRECISION,  -- per 1M input tokens
price_output_per_million  DOUBLE PRECISION,  -- per 1M output tokens
price_cache_read_per_million DOUBLE PRECISION DEFAULT NULL, -- when caching active
pricing_tier_threshold    INTEGER DEFAULT NULL,  -- tokens above this use tier2 pricing
price_tier2_input         DOUBLE PRECISION DEFAULT NULL,
price_tier2_output        DOUBLE PRECISION DEFAULT NULL
```

And token_usage_daily should gain:
```sql
cached_input_tokens INTEGER DEFAULT 0,  -- for cache_read_input_tokens (Anthropic)
estimated_cost_usd  DOUBLE PRECISION DEFAULT 0  -- computed at write time, not query time
```

For local models (Ollama), set all price fields to 0.0 explicitly. This makes cost rollup trivial and correct.

**Warning signs:**
- Cost dashboard shows a single "tokens" number with a single rate applied
- Cached tokens appearing in `prompt_tokens` but no separate tracking
- No `provider` column in token_usage_daily (can't differentiate Anthropic vs OpenAI pricing)

**Phase to address:** Phase 1 (Gateway Registry) — pricing fields go into the model catalog schema. Phase 4 (Cost Dashboard) builds on top of correctly-structured data.

---

### Pitfall 5: API Key Storage That Leaks Through Logs or SSE Events

**What goes wrong:**
Gateway credentials (API keys, auth tokens) take several paths through a production system where they can accidentally surface:

1. **Error serialization.** `throw new Error(\`Request to ${url} failed: ${JSON.stringify(requestBody)}\`)` — if the request body contained `Authorization` headers or the URL had a query-string API key, the error message contains the key. Error messages go to logs. Logs are often forwarded to observability tools with weak access controls.

2. **SSE decision events.** The current `logDecision()` emits an SSE `decision:made` event. If the decision reasoning string ever includes a sanitized-but-not-sanitized provider config object, keys can appear in the browser's EventSource stream — visible to any user with devtools open.

3. **Gateway config API.** The planned Bridge admin surface needs a `GET /api/v1/bridge/gateways/:id` endpoint. If this returns the full DB row, the stored API key is exposed to any admin-role user. The LiteLLM supply chain attack (2025) showed that credential exposure via API responses is a primary vector.

4. **Database backups.** API keys stored in plaintext in `gateway_configs.api_key` are exposed in every database dump, snapshot, or migration script.

**Why it happens:**
Development speed. Storing keys in the DB is the fastest path to a working gateway. The security layer gets deferred.

**How to avoid:**
- Store API keys with a write-once read-never API response policy: the gateway config `GET` endpoint returns `"api_key": "sk-...••••1234"` (masked) after initial save. Never return the full key via API again.
- Log sanitization middleware: before any error is logged or emitted via SSE, strip fields matching `/(key|token|secret|auth|password|bearer)/i` from the object being serialized.
- For the v3.0 milestone scope (single VPS, not multi-tenant enterprise), plaintext storage in DB with field-level masking in the API layer is acceptable. Do NOT invest in Vault/KMS at this stage — premature for current scale.
- Never include gateway config objects in SSE event payloads.

**Warning signs:**
- Error logs showing long hexadecimal strings that look like API keys
- Browser devtools showing full `sk-ant-...` keys in SSE event streams
- `GET /api/v1/bridge/gateways/:id` returning an `api_key` field in the response body

**Phase to address:** Phase 1 (Gateway Registry) — the schema and API design must bake in key masking from day one.

---

### Pitfall 6: Migration from Hardcoded Config That Breaks the Running System

**What goes wrong:**
Porter currently has two backends hardcoded in `ai-router.ts` via `config.ts`: Ollama (cheap) and OpenClaw (strong). The v3.0 Bridge moves this to a `gateway_configs` DB table. The migration path has a gap: the new DB-driven router reads from `gateway_configs` at dispatch time. If the table is empty (fresh deploy, migration not yet seeded, or DB connection failed at startup), every dispatch throws "no gateways configured." The system goes from partially working to completely broken during the migration window.

This is the "expand and contract" problem — you cannot atomically swap from config-file to DB-driven without a period where neither source is authoritative.

**Why it happens:**
Migration is planned as a cutover ("switch to the new system on Monday") rather than a gradual transition. The old system is deleted before the new system is fully validated.

**How to avoid:**
Use a fallback chain, not a cutover:

```typescript
async function resolveGateways(): Promise<GatewayConfig[]> {
  // 1. Try DB first (authoritative when populated)
  const dbGateways = await loadGatewaysFromDB();
  if (dbGateways.length > 0) return dbGateways;

  // 2. Fall back to env/config (keeps existing deployments working)
  return buildGatewaysFromEnvConfig();
}
```

Keep `buildGatewaysFromEnvConfig()` as a permanent escape hatch — not a temporary migration shim. If the DB is wiped or corrupted, env-based config keeps the system running. The 35 Playwright tests must pass against both the env-config path and the DB path. Write one test for each. Only deprecate the env-config path when the DB path has been in production for 30+ days without incident.

**Warning signs:**
- Any deploy that requires a "migration window" with downtime
- The phrase "just seed the DB before deploying" in the migration plan
- Tests only covering the happy path (DB has data) not the empty-DB case

**Phase to address:** Phase 1 (Gateway Registry). The fallback chain must be the first thing built, before any other gateway feature.

---

### Pitfall 7: Ollama vs OpenAI API Format Mismatch in the Multi-Backend Path

**What goes wrong:**
Ollama's native API (`/api/generate`, `/api/chat`) and its OpenAI-compatibility layer (`/v1/chat/completions`) have subtle structural differences that cause silent failures:

1. **Streaming delta structure.** Ollama's SSE stream under the OpenAI compat layer sends `{"message": {"role": "assistant", "content": "token"}}` per chunk, not `{"delta": {"content": "token"}}` like real OpenAI. Code that reads `chunk.choices[0].delta.content` gets `undefined` from Ollama. The stream appears to work (no error thrown) but all tokens are silently dropped.

2. **Token usage in streaming.** Ollama does not include `usage` in streaming SSE chunks by default (GitHub issue #4448 — still open as of early 2026). The final chunk has `eval_count` (output tokens) and `prompt_eval_count` (input tokens) but only in the native API format, not in the OpenAI compat streaming format. Code that reads `data.usage.prompt_tokens` from a streaming Ollama response gets `undefined`, so token tracking silently logs 0 for streaming calls.

3. **Tool calling.** Ollama's OpenAI compat layer does not reliably support tool calling. The native `/api/chat` endpoint is required for tool use. Routing tool-bearing requests through the OpenAI compat path produces malformed or ignored tool calls with no error.

**Why it happens:**
Developers write against the OpenAI spec, test with an actual OpenAI-compatible provider, then swap in Ollama without reading the compat caveats. The interface appears identical; the edge cases are invisible until production load hits them.

**How to avoid:**
- Keep the Ollama dispatch path using the native API (`/api/generate` for non-chat, `/api/chat` for tool calls). The current `ai-router.ts` already does this correctly — maintain this separation.
- For streaming, add an explicit `accept: 'application/x-ndjson'` header for Ollama native streaming. Do not use the OpenAI SSE compat path for Ollama.
- For token counting from Ollama streaming: accumulate `eval_count` from the final chunk (`done: true`) of the native streaming response. Do not expect `usage` in intermediate chunks.
- Write a provider-adapter layer: each gateway type (ollama, openai, anthropic, openclaw) has its own response parser. Do not write one parser and regex around the differences.

**Warning signs:**
- Token usage logs showing 0 for all Ollama streaming responses
- Tool call results appearing as text in the conversation rather than as structured tool responses
- Streaming "works" with OpenClaw but produces empty responses from Ollama

**Phase to address:** Phase 1 (Gateway Registry). Provider adapters are a foundational primitive. Define the `GatewayAdapter` interface before wiring up dispatch.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Per-request health probes (current state) | Simple, no background job needed | Adds 100-300ms to every dispatch; cascading under load | Never at scale; Phase 1 should fix this |
| Flat token pricing (input+output same rate) | Cost dashboard ships faster | Inaccurate cost reporting misleads budget decisions | MVP only, before pricing tiers matter |
| API keys in plaintext DB column | Fastest path to working gateway | Keys exposed in every backup, dump, migration | Acceptable with API masking for single-VPS SaaS at current scale |
| Single routing heuristic (length+keywords) | Simple, fast, zero dependencies | ~70% accuracy; misfires on short complex requests | Acceptable for Phase 1; must instrument for tuning |
| Hardcoded fallback alongside DB config | Zero migration risk | Two sources of truth; easy to forget to update hardcoded fallback | Always keep as escape hatch; not debt, this is resilience |
| No retry budget per session | Fewer moving parts | A single transient 503 fails the whole request | Only acceptable before circuit breakers are built |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Ollama `/api/generate` | Sending `messages` array (OpenAI format) | Use `prompt` string for `/api/generate`; use `messages` only for `/api/chat` |
| Ollama streaming | Reading `chunk.choices[0].delta.content` | Read `chunk.message.content` on native format; use done:true chunk for final token count |
| OpenClaw `/v1/chat/completions` | Not checking `choices[0].message.content` exists | Always assert `choices` array is non-empty before reading content |
| Anthropic API (future) | Treating `usage.input_tokens` as equivalent to OpenAI `prompt_tokens` | Field names match but `cache_read_input_tokens` is separate and must be tracked separately |
| Google Gemini API (future) | Expecting `choices[0].message.content` | Gemini uses `candidates[0].content.parts[0].text` on native API; OpenAI compat wrapper maps this but has its own gaps |
| Any provider, 429 response | Immediate failover to next backend | Read `Retry-After` header; wait and retry on same backend before failing over |
| Any provider, 401 response | Retry or failover | Alert only — no retry, no failover. Key is invalid everywhere until rotated. |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-request backend probing | Dispatch latency = model latency + 2x probe latency | Background health cache with TTL | Immediately under any meaningful load (>5 req/s) |
| No connection pooling to AI backends | New TCP connection per dispatch | Reuse `undici` pool or persistent `fetch` agent per backend URL | >20 concurrent requests |
| Decision log write on every dispatch | Postgres writes blocking dispatch path | Already async (swallowed catch) — keep it async, never await it | Acceptable at current scale |
| Token usage upsert per-request (current) | Postgres upsert per dispatch | Batch writes every 60 seconds using in-memory accumulator | >100 req/min (fine for now; watch at scale) |
| Health check calling a real model endpoint | Provider bills for health check tokens | Use `/api/tags` (Ollama) or `/v1/models` (OpenAI) for health — no inference call needed | Every 30s health check = 2 tokens * 2 providers = meaningful cost at scale |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Returning full API key in gateway GET response | Key exposure to any admin user; log leakage | Mask to last 4 chars in all API responses after initial save |
| API key in SSE decision event payload | Key visible in browser devtools to all users | Sanitize all objects before SSE emission; strip key/token/secret fields |
| Error message including request body with auth headers | Key in application logs | Wrap AI backend fetch calls in a sanitizing error handler |
| Gateway config accessible to operator-role users | Operators can steal provider credentials | Gateway management endpoints require platform_admin or admin cap minimum |
| No rate limiting on Bridge admin endpoints | An automated client can enumerate all gateway configs | Apply the existing rate limiter to all `/api/v1/bridge/*` admin endpoints |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing "backend unreachable" with no context | User doesn't know if it's temporary or permanent | Show last-seen time + consecutive failure count: "Ollama offline for 2m (3 attempts)" |
| Gateway health as binary up/down | Masks degraded performance (slow but responding) | Track `latencyMs` in health cache; show "slow" state when p95 > 5s |
| Cost numbers without context | "$0.003" is meaningless to non-technical users | Show cost per session, per day, relative to limit; not raw token math |
| First-run auto-detect that silently fails | User thinks setup worked but nothing is configured | First-run wizard must show explicit confirmed state per gateway, not just "scanning..." |
| Routing decisions hidden from admin | Admin can't verify routing is working correctly | Bridge admin surface must show recent decisions with message preview + tier selected |

---

## "Looks Done But Isn't" Checklist

- [ ] **Gateway health check:** Check uses `/api/tags` or `/v1/models` not a real inference call — verify no tokens billed per health check
- [ ] **Token tracking during streaming:** Streaming path accumulates tokens from the final chunk's eval_count, not from intermediate chunks — verify non-zero token counts appear for streaming calls
- [ ] **Circuit breaker error classification:** 429 responses do NOT increment the persistent-failure counter — verify by injecting a 429 and checking circuit state
- [ ] **API key masking:** `GET /api/v1/bridge/gateways/:id` returns masked key (`sk-...••••1234`) not the full key — verify in test
- [ ] **Empty DB fallback:** With no rows in `gateway_configs`, dispatch still works via env-config fallback — verify with a freshly seeded empty DB
- [ ] **Ollama tool calls:** Tool-bearing dispatches use the native `/api/chat` endpoint, not the OpenAI compat path — verify by checking request URL in logs when tools are present
- [ ] **Decision log non-blocking:** Inserting a 5-second delay in `logDecision()` does NOT slow down dispatch — verify dispatch latency is unchanged

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Per-request probing causing latency spikes | LOW | Add health cache in front of probeBackend(); takes 1-2 hours, no schema change |
| Wrong error classification trips breaker on 429 | LOW | Patch error classifier, reset circuit state in DB/memory, redeploy |
| API key leaked via API response | HIGH | Rotate key at provider immediately; audit logs for exposure window; patch masking; notify if multi-tenant |
| DB-driven gateway config empty after migration | LOW (if fallback exists) / HIGH (if not) | Env-config fallback activates automatically; seed DB from env values |
| Ollama streaming token count always 0 | LOW | Switch streaming token accumulation to read `eval_count` from final done:true chunk |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Per-request health probing | Phase 1: Gateway Registry | Health cache test: 100 dispatches should generate ≤2 probe HTTP calls |
| Circuit breaker error conflation | Phase 3: Smart Routing + Circuit Breakers | Inject 429 storm; verify circuit stays closed; inject 500 storm; verify circuit opens |
| Heuristic routing misfires | Phase 2: Model Catalog (instrument) + Phase 3 (tune) | Log routing decisions for 48h; check % going to strong model (should be 40-60%) |
| Cost tracking input/output asymmetry | Phase 1: Gateway Registry (schema) + Phase 4: Cost Dashboard | Cost estimate for 1M Anthropic input tokens should be ~$3, not ~$9 |
| API key exposure | Phase 1: Gateway Registry | GET endpoint test asserts masked key in response body |
| Config migration gap | Phase 1: Gateway Registry | Playwright test with empty gateway_configs — dispatch must succeed via fallback |
| Ollama/OpenAI format mismatch | Phase 1: Gateway Registry (adapters) | Provider adapter unit tests with fixture responses from each provider |

---

## Sources

- Porter ai-router.ts (2026-03-25) — actual implementation grounding all pitfalls
- [Ollama OpenAI Compatibility Docs](https://docs.ollama.com/api/openai-compatibility) — streaming delta structure differences, tool calling limitations (HIGH confidence)
- [Ollama streaming usage issue #4448](https://github.com/ollama/ollama/issues/4448) — missing usage in streaming OpenAI compat format (HIGH confidence)
- [Retries, Fallbacks, and Circuit Breakers in LLM Apps](https://www.getmaxim.ai/articles/retries-fallbacks-and-circuit-breakers-in-llm-apps-a-production-guide/) — error classification taxonomy (MEDIUM confidence)
- [Circuit Breaker for LLM — Anthropic TypeScript](https://medium.com/@spacholski99/circuit-breaker-for-llm-with-retry-and-backoff-anthropic-api-example-typescript-1f99a0a0cf87) — implementation patterns (MEDIUM confidence)
- [LLM API Token Security: 7 Most Common Mistakes](https://aiq.hu/en/llm-api-token-security-the-7-most-common-mistakes-and-how-to-avoid-them/) — key storage and rotation (MEDIUM confidence)
- [LiteLLM Supply Chain Attack Wake-Up Call](https://blog.dreamfactory.com/why-the-litellm-supply-chain-attack-is-a-wake-up-call-for-ai-api-credential-management/) — credential exposure via API responses (MEDIUM confidence)
- [LLM Routing in Production](https://blog.logrocket.com/llm-routing-right-model-for-requests/) — heuristic accuracy limitations, feedback loop importance (MEDIUM confidence)
- [Langfuse Token and Cost Tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking) — pricing tier support, cache token tracking (HIGH confidence)
- [LiteLLM Health Checks](https://docs.litellm.ai/docs/proxy/health) — health check patterns, background vs inline (MEDIUM confidence)
- hermes-agent-patterns.md — dynamic tool schema rebuild, context compressor tool-call repair (HIGH confidence — MIT source)
- chat-latency-and-prompt-caching-notes.md — prompt caching implications for cost tracking (HIGH confidence — from official Anthropic/OpenAI docs)

---
*Pitfalls research for: Porter Bridge — AI Gateway & Model Intelligence (v3.0)*
*Researched: 2026-03-25*
