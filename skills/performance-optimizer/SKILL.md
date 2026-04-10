---
name: performance-optimizer
description: Diagnose and improve performance across web apps, APIs, databases, distributed systems, internal tools, and user-critical workflows. Use when the task involves slow pages, weak Core Web Vitals, latency spikes, render jank, expensive queries, memory pressure, poor throughput, queue buildup, caching decisions, load behavior, or turning vague “it feels slow” complaints into measurable bottlenecks and fix priorities.
---

# Performance Optimizer

Make systems faster in ways users and operators can feel. Start with measurement, isolate the dominant bottleneck, and recommend fixes that improve responsiveness, latency, throughput, or stability without optimization theater.

## Use this skill to

- diagnose slow pages, screens, workflows, and endpoints
- improve Core Web Vitals and user-perceived responsiveness
- analyze render cost, bundle weight, hydration, and interaction lag
- triage slow APIs, background jobs, queues, and database paths
- reason about caching, batching, precomputation, and offloading
- set performance budgets, guardrails, and regression checks
- turn “feels slow” reports into concrete measurement plans

## Do not use this skill to

- do feature work with no performance objective
- recommend random tuning without evidence or a reproduction path
- default to infrastructure spend before the bottleneck is understood
- chase micro-optimizations with no user or business impact
- treat averages as success when p95 / p99 remain bad

## Inputs to gather

Collect or infer:
- the exact slow experience and who feels it
- affected flow, endpoint, page, job, or query
- baseline metrics: p50 / p95 / p99 latency, throughput, error rate, CPU, memory, CWV, query timings, queue depth, payload size
- environment: device class, browser, region, staging vs production, concurrency level
- architecture constraints and recent regressions
- whether the suspected cost is frontend, backend, database, network, third-party, or mixed

If metrics do not exist, the first deliverable is an instrumentation and reproduction plan.

## Deliverables

Return one or more of:
- bottleneck diagnosis
- measurement and profiling plan
- prioritized optimization roadmap
- performance budget or guardrail proposal
- Core Web Vitals action plan
- regression-prevention checklist
- impact / effort tradeoff table

Tie each recommendation to a metric, a user-visible symptom, or a clear cost driver.

## Workflow

### 1. Turn the complaint into a measurable question

Translate vague symptoms into something testable:
- first paint is slow on mid-range phones
- table interactions lag after filters change
- order creation p95 spikes at peak traffic
- page becomes janky after 20 minutes of use
- queue backlog grows faster than workers drain it

No measurable question, no real optimization.

### 2. Measure the right layer

Use evidence that matches the failure mode:
- **web UX**: LCP, INP, CLS, waterfall, long tasks, JS cost
- **frontend runtime**: render frequency, hydration cost, bundle split, image/font weight, memory growth
- **backend**: latency percentiles, queueing, dependency fan-out, lock contention, CPU saturation, I/O waits
- **database**: query plan quality, scan vs index usage, N+1 patterns, write amplification, cache hit rate
- **systems / jobs**: throughput, backlog, concurrency limits, retries, saturation points

For user-facing web work, anchor on current Core Web Vitals thresholds: LCP under 2.5s, INP under 200ms, CLS under 0.1 for “good” performance. Use field data when available, not only lab data.

### 3. Find the dominant bottleneck

Common families:
- too much work on the critical path
- repeated or unnecessary network round trips
- blocking main-thread or hydration work
- oversized bundles, images, fonts, or third-party scripts
- unindexed or repeated queries
- contention, locking, queue buildup, or backpressure
- synchronous dependency calls inside latency-sensitive paths
- work done eagerly that should be deferred, batched, or cached

Do not produce a long equal-priority list. Name the first limiter.

### 4. Recommend high-leverage fixes

Prefer changes like:
- remove or defer critical-path work
- dedupe requests and batch chatty access patterns
- cache at the right layer with explicit invalidation logic
- split heavy bundles and lazy-load secondary UI
- optimize images, fonts, and script loading order
- eliminate N+1 queries and fix index design
- precompute or denormalize expensive read paths when justified
- move expensive work out of request/interaction paths
- reduce third-party dependency cost

Every fix should answer: why this first?

### 5. Check tradeoffs

For each recommendation, note:
- expected user-visible gain
- impact on p95 / p99 or throughput
- engineering effort and rollback complexity
- freshness / correctness risks
- operating cost implications

Cheap fixes with tiny impact are often worse than a harder fix that removes the real limiter.

### 6. Lock in verification

Specify:
- before / after comparison method
- representative test environments and traffic shape
- success thresholds or budgets
- ongoing monitoring or alerts
- rollback criteria if the fix regresses correctness or freshness

## Heuristics

- Optimize percentile latency, not only averages.
- A fast backend can still feel slow if the main thread is overloaded.
- Caching without invalidation logic is deferred incident creation.
- Third-party scripts often hide inside “small” frontend complaints.
- Fixing one slow query can matter more than broad infrastructure tuning.
- User-perceived responsiveness often depends more on critical-path reduction than raw total work.

## Output standards

A strong answer:
- defines the baseline or the plan to get one
- isolates the dominant bottleneck clearly
- prioritizes a few high-leverage fixes
- explains tradeoffs instead of hand-waving them away
- includes validation and regression prevention

## Adjacent skill boundaries

- **frontend-dev**: implements UI changes; this skill prioritizes and frames performance fixes
- **backend-dev**: implements service changes; this skill diagnoses where latency or throughput is being lost
- **database-admin**: goes deeper on storage and SQL internals; this skill identifies whether the database is the real limiter
- **site-reliability**: broader production reliability; this skill is specifically about speed and responsiveness

## Use supporting files

- Use `prompt.md` for response structure and prioritization style.
- Use `examples/README.md` for output shapes.
- Use `guides/qa-checklist.md` before finalizing.
