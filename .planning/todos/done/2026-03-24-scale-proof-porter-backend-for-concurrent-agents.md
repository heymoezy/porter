---
created: 2026-03-24T12:21:53.417Z
title: Scale-proof Porter backend for concurrent agents
area: database
files:
  - backend/src/db/client.ts
  - backend/src/services/scheduler.ts
  - backend/src/services/memory-injection.ts
  - backend/src/services/ai-router.ts
  - backend/src/db/migrate-consolidated.ts
  - backend/src/index.ts
---

## Problem

Porter's backend breaks at 50+ concurrent agents due to several bottlenecks identified in architecture review:

1. **DB pool capped at 10** (`client.ts`) — exhausted by 10 concurrent agents since memory injection alone fires 5 queries per dispatch
2. **Single-threaded scheduler** (`scheduler.ts`) — polls every 2s, processes one job at a time, max ~30 jobs/min. One slow job blocks everything
3. **Memory injection N+1 queries** (`memory-injection.ts`) — 5 sequential DB hits per agent dispatch (identity, directives, project notes, agent notes, FTS search). No batching or caching
4. **Backend probing on every dispatch** (`ai-router.ts`) — 2 HEAD requests to check availability before every AI call, adding 2+ seconds overhead
5. **Missing DB indexes** (`migrate-consolidated.ts`) — only 8 indexes across 30+ tables. Foreign keys on agent_jobs, concepts FTS, chat messages all unindexed
6. **No job timeouts** — runaway jobs freeze the scheduler indefinitely
7. **Event loop contention** (`index.ts`) — Fastify HTTP + scheduler share single Node.js thread

The memory architecture itself (tiered injection, 2K token budget, shared DB) is sound. The plumbing needs widening.

## Solution

Priority-ordered fix path:

1. **Bump DB pool to 50-100** — 1 line change in `client.ts`, immediate relief
2. **Add missing DB indexes** — ~10 indexes on FK columns, FTS vectors, chat tables (~30 min)
3. **Add job timeouts** — `Promise.race` wrapper in scheduler (~1 hour)
4. **Cache backend availability with TTL** — avoid 2 HEAD requests per dispatch (~2 hours)
5. **Batch memory injection** — single query with JOINs instead of 5 sequential hits (~half day)
6. **Worker pool for scheduler** — claim N jobs, run in parallel (~1-2 days)
7. **Evaluate Redis/BullMQ** — production-grade distributed job queue (~2-3 days)

Target: hundreds of concurrent agents on one machine.
