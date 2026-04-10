---
name: cdn-optimizer
description: Design and improve content delivery networks, caching rules, edge routing, origin shielding, asset delivery strategy, and CDN performance tuning. Use when the task involves cache hit ratio, latency reduction, edge behavior, invalidation strategy, multi-region delivery, WAF-at-edge tradeoffs, or diagnosing why static and dynamic content is slow, expensive, or incorrectly cached. Do not use for general backend performance tuning, database optimization, or application-level code refactors without a CDN focus.
---

# CDN Optimizer

Make content arrive faster, cheaper, and more predictably at the edge without breaking correctness.

This skill is for CDN architecture, cache-policy design, edge-delivery debugging, and performance tradeoff analysis. Use it when the bottleneck sits between users and origin infrastructure, or when origin load, cache miss patterns, stale behavior, and delivery rules need to be redesigned.

## Scope

Use this skill for:
- CDN selection and edge-delivery architecture
- cache-control policy design for static, semi-static, and dynamic assets
- cache key design, variation rules, and origin shielding
- image, video, API, and asset delivery optimization
- invalidation, purge, and deployment-cache coordination
- diagnosing stale content, low hit ratio, or regional latency problems
- balancing performance, cost, correctness, and operational simplicity at the edge

## Do not use this skill for

Do not use this skill for:
- database query tuning or backend compute optimization with no CDN layer involved
- frontend bundle refactors unless the main issue is cacheability or edge delivery
- DNS-only changes with no delivery or caching implications
- generic infrastructure hardening work unrelated to content distribution
- application business-logic debugging that happens behind the CDN but is not caused by it

## Inputs to gather

Before proposing changes, identify:
- traffic profile by region, device, and asset type
- current CDN provider, topology, and origin architecture
- latency targets, uptime requirements, and cost constraints
- cache headers, surrogate directives, TTLs, purge patterns, and deployment workflow
- cache hit ratio, origin egress, and miss behavior by route or asset class
- personalization, authentication, geo, and compliance constraints
- asset types involved: HTML, JS, CSS, images, video, APIs, downloads
- failure modes: stale content, wrong variant, slow first byte, bursty origin load

If observability is weak, say so. Edge tuning without metrics is guesswork.

## Output expectations

Return outputs such as:
- CDN optimization plan with prioritized interventions
- cache policy matrix by content type or route
- edge-routing and origin-shielding recommendations
- incident diagnosis for stale, uncached, or misrouted content
- cost-versus-latency tradeoff memo
- rollout plan with validation, purge, and rollback guidance

## Working method

### 1. Separate correctness from speed

First decide what must never be cached incorrectly.
Classify content into:
- immutable static assets
- versioned assets
- public but time-sensitive pages
- personalized or authenticated responses
- APIs with safe edge caching windows
- never-cache responses

Wrong caching is worse than slow caching.

### 2. Trace the request path end to end

Map:
- user region to edge POP
- edge to shield or regional tier
- shield to origin
- origin response headers and downstream CDN behavior

Look for redirect chains, oversized cache keys, missing compression, TLS negotiation cost, cookie pollution, and unnecessary origin fetches.

### 3. Design cache policy deliberately

Specify:
- TTL and stale policy
- browser-facing vs surrogate/CDN-facing caching behavior when applicable
- cache key dimensions
- variation by device, language, auth, or geo only when truly needed
- header normalization and cookie stripping
- purge or versioning strategy

Over-varying destroys hit ratio. Under-varying breaks correctness.

### 4. Reduce origin dependence

Prefer changes that cut origin work:
- longer TTLs for immutable assets
- versioned filenames instead of blanket purges
- origin shielding for burst protection
- compression and modern format negotiation at the edge
- stale-while-revalidate or equivalent background refresh patterns where safe
- edge redirects and header transforms when safe
- signed URLs or token handling that preserves cacheability where possible

### 5. Match invalidation strategy to asset behavior

Use the least painful invalidation strategy that preserves correctness:
- immutable/versioned static assets → avoid broad purge dependency
- frequently updated HTML or content pages → shorter TTL, revalidation, or selective purge
- APIs → explicit safe cache windows and key isolation
- media libraries → key/tag/URL versioning where supported

Purge-all is usually a workflow smell, not a strategy.

### 6. Validate with metrics

Measure before and after using:
- cache hit ratio
- origin request volume
- TTFB and tail latency by region
- egress and CDN spend
- error rate by route and POP
- stale-content incidents or wrong-variant delivery

If the proposal lacks a verification plan, it is not ready.

## Heuristics

Prefer:
- versioned static assets over frequent broad purges
- small, intentional cache keys
- edge rules that simplify origin behavior
- differentiated policy by route or asset class
- explicit freshness and revalidation semantics
- surrogate/CDN directives when browser and edge behavior should differ

Avoid:
- one TTL for everything
- caching personalized responses accidentally
- assuming low hit ratio means “CDN bad” without key/header analysis
- edge logic that is more complex than the problem warrants
- cost savings that introduce correctness regressions

## Review lenses

When evaluating CDN recommendations, check:
- Is the cache policy segmented by content behavior?
- Are correctness risks handled before performance gains?
- Are origin, edge, shield, and purge interactions clearly explained?
- Are metrics and rollback steps defined?
- Does the recommendation improve both user latency and operational load where expected?

## Adjacent skill boundaries

- **load-balancer**: traffic distribution and failover outside CDN-specific caching strategy
- **performance-optimizer**: broader application and system performance work beyond edge delivery
- **cloud-architect**: higher-level platform topology where CDN is only one layer
- **site-reliability**: reliability operations and incident management beyond edge tuning
- **security-auditor**: security review where CDN configuration is incidental, not primary

## Quality bar

A strong result should:
- improve latency without breaking correctness
- explain why content should or should not be cached
- reduce origin load with deliberate cache-key and TTL design
- include measurable validation criteria
- make rollout and rollback operationally safe
- acknowledge provider-specific features without depending blindly on one vendor

## References to use

Use `prompt.md` for response stance and structure.
Use `examples/README.md` for common deliverable shapes.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for metadata and boundaries.
