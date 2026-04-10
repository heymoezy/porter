# Load Balancer Specialist — Example Output Shapes

Use these as patterns for decision-ready traffic-management work.

## Example 1 — Uneven traffic diagnosis

**Input:**
One backend gets 45% of requests even though all targets have equal weight.

**Good output shape:**
| Hypothesis | Evidence to check | Likelihood | Fix direction |
|---|---|---|---|
| sticky-session skew | cookie / affinity distribution | high | reduce stickiness scope or rebalance session policy |
| long-lived connections | active connections per target | high | review least-connections / connection reuse behavior |
| unhealthy target flapping | health-check pass/fail history | medium | tune readiness thresholds and warmup |
| uneven capacity | CPU, queue depth, concurrency limits | medium | adjust weights or fix backend asymmetry |

Then add:
- most likely root cause
- immediate validation steps
- rollback-safe remediation sequence

## Example 2 — New L7 design

**Input:**
Design balancing for a multi-zone API with canary deploys and TLS termination.

**Good output shape:**
- traffic assumptions
- recommended L7 topology
- health-check policy
- canary routing method
- timeout / retry / circuit-breaking guidance
- zonal failure behavior
- metrics to watch during rollout

## Example 3 — WebSocket-heavy service review

**Input:**
Review balancing and failover for a realtime service with long-lived connections.

**Good output shape:**
| Control | Recommendation | Why |
|---|---|---|
| algorithm | least connections or capacity-aware | long-lived sessions distort request-count balancing |
| draining | long grace period + reconnect strategy | prevent mass disconnect on deploy |
| health checks | readiness tied to session admission capacity | process-up is not enough |

Then add deployment and failure-test notes.

## Example 4 — Timeout and retry audit

**Input:**
Audit our ingress and upstream timeout settings after a retry storm.

**Good output shape:**
- current failure pattern summary
- table of client, LB, proxy, and backend timeouts
- retry safety assessment by endpoint type
- recommended timeout ladder
- verification plan using error rate and latency percentiles
