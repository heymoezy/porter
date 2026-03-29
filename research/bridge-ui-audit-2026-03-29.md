# Bridge UI Audit — 2026-03-29

Source: GPT-5.4 (via Porter Bridge) + Gemini + Claude audit

## Core Insight

Bridge shows STATE (healthy/offline) but not CAPACITY (how much headroom is left). Operators see green dots and still get 429s with zero warning.

## Build Order (agreed by all 3 models)

### Phase 1 — Capacity & Rate Limits
1. Rate limit tracking: parse response headers, track empirically from 429s
2. Capacity bars on gateway cards: RPM, TPM, daily quota, concurrency
3. Composite health status: healthy / degraded / throttled / quota-blocked / circuit-open / paused
4. Per-gateway p95 latency, success %, 429 rate

### Phase 2 — Intelligence
5. Dispatch explanation: why this model, what was rejected, fallback chain
6. Rule simulator: "if this rule changed, how would last 1K requests route?"
7. Scout capability matrix with live availability overlay
8. Enforceable budgets per gateway/workspace/user

### Phase 3 — Operations
9. Cross-tab correlation + incident timeline
10. Forecasting + recommendations
11. Compare/simulation tools

## Rate Limit System Design

### Data to track per gateway
- requests_per_minute (current / limit)
- tokens_per_minute (current / limit)
- daily_token_quota (used / limit)
- daily_spend (used / limit)
- concurrency (active / max)
- reset_at (timestamp)
- source: provider-reported | configured | inferred

### Detection methods
1. Parse response headers: x-ratelimit-remaining, x-ratelimit-limit, x-ratelimit-reset, retry-after
2. Track empirically: count dispatches per minute, tokens per minute from dispatch_log
3. Manual config: operator sets known limits per gateway

### UI display
- Gateway card: compact badges (42/60 RPM, 180k/250k TPM)
- Color: green <70%, yellow 70-89%, orange 90-99%, red exceeded
- Unknown limits: show "estimated" from observed throughput
- Never show green if >90% capacity

### Proactive throttling
- Routing engine checks capacity before selecting gateway
- If gateway at 90%+, prefer alternatives
- If all gateways constrained, queue + warn operator

### DB schema
- gateway_rate_limits table: gateway_id, limit_type (rpm/tpm/daily_tokens/daily_spend), limit_value, current_value, reset_at, source, updated_at
- OR extend gateways.metadata JSONB with rate_limit object
