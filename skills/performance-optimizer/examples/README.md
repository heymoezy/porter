# Performance Optimizer — Example Output Shapes

Use these as response patterns, not rigid templates.

## Example 1 — Web performance diagnosis

**Input:**
Our analytics dashboard feels slow on first load and interactions lag on mid-range laptops.

**Good output shape:**
- symptom summary and likely user segments affected
- baseline metrics: LCP, INP, CLS, JS payload, long tasks, API waterfall
- dominant bottlenecks:
  - oversized initial bundle
  - blocking chart hydration
  - duplicated data fetches on tab switches
- recommended fixes:
  1. split non-critical charts and lazy-load secondary panels
  2. dedupe and cache dashboard queries
  3. defer nonessential scripts and tighten image/font loading
- validation plan on representative devices

## Example 2 — API latency plan

**Input:**
Help us fix a slow order-creation endpoint.

**Good output shape:**
| Area | Evidence | Likely issue | Fix | Expected effect |
|---|---|---|---|---|
| DB | p95 query time dominates request | missing composite index + N+1 reads | add index and collapse query fan-out | lower p95 |
| App | synchronous fraud call in request path | blocking dependency | async queue or timeout/retry redesign | lower tail latency |
| Cache | config fetched every request | avoidable repeated reads | local/distributed cache with TTL and invalidation | lower overhead |

Then add:
- implementation order
- regression risks

## Example 3 — Instrumentation-first response

**Input:**
The app feels slow but we have no metrics.

**Good output shape:**
- likely symptom buckets
- minimum instrumentation to add first
- reproduction scenarios by device / region / flow
- how to separate frontend, backend, database, and network cost
- what not to optimize yet

## Example 4 — Performance budget

**Input:**
Set a performance budget for our marketing site.

**Good output shape:**
- target thresholds for LCP, INP, and CLS
- JS, image, and font-weight budgets
- limits on third-party scripts
- test devices / environments
- CI or monitoring fail conditions
