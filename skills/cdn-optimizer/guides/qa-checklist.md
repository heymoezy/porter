# QA Checklist — CDN Optimizer

Use this before finalizing any CDN optimization output.

## 1. Correctness first
- Is each content type classified by safe cacheability?
- Are personalized, authenticated, or sensitive responses protected from accidental caching?
- Are freshness, revalidation, and invalidation behaviors clearly defined?
- Is browser caching separated from edge caching when that distinction matters?

## 2. Technical quality
- Are TTLs, stale policies, cache keys, vary rules, and header assumptions explicit?
- Is the relationship between edge, shield, and origin explained clearly?
- Are likely causes tied to observed symptoms rather than guessed loosely?

## 3. Operational fitness
- Does the plan reduce origin load or latency in a measurable way?
- Are purge, deploy, and rollback procedures practical?
- Is monitoring defined for hit ratio, TTFB, errors, and stale-content risk?

## 4. Cost and complexity
- Are cost implications addressed alongside performance?
- Does the recommendation avoid unnecessary edge-rule complexity?
- Are tradeoffs between speed, freshness, and operations made explicit?

## 5. Overall strength
- Would an infrastructure team know exactly what to change?
- Would the proposal survive a skeptical review from performance and platform engineers?
- Is the final recommendation both faster and safer than the current state?
