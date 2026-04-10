# CDN Optimizer — Example Output Shapes

Use these as patterns for strong CDN optimization deliverables.

## Example 1 — Cache policy redesign

**Input:**
Our ecommerce site has a low cache hit ratio and origin CPU spikes during launches.

**Good output shape:**
- current symptoms and likely causes
- route-by-route cacheability breakdown
- revised TTL, surrogate policy, and cache-key matrix
- purge/versioning changes
- expected origin offload and validation metrics

## Example 2 — Stale content incident

**Input:**
Users keep seeing outdated pricing pages after deploys in some regions.

**Good output shape:**
- likely stale-content failure modes
- header, revalidation, and purge workflow analysis
- region-specific edge or shield considerations
- corrective actions ranked by confidence
- rollback and monitoring plan

## Example 3 — API edge caching decision

**Input:**
Can we safely cache our product availability API at the edge?

**Good output shape:**
- endpoint classification and risk summary
- safe cache window and invalidation options
- auth and personalization constraints
- recommended key dimensions
- conditions where edge caching should be avoided

## Example 4 — Cost-versus-performance review

**Input:**
CDN costs are growing fast. Find savings without making the site slower.

**Good output shape:**
- cost drivers by traffic or asset class
- wasteful miss patterns or over-complex rules
- cheaper policy or provider-side adjustments
- risk tradeoffs and user-impact expectations
- staged implementation sequence

## Example 5 — Multi-region delivery plan

**Input:**
We serve customers globally from one origin and APAC performance is poor.

**Good output shape:**
- request path and latency bottleneck analysis
- edge, shield, and origin topology options
- cache and compression improvements
- regional mitigation plan
- success metrics by geography
