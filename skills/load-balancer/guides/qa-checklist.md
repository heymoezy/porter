# QA Checklist — Load Balancer Specialist

- The deliverable states the protocol, traffic shape, and connection behavior.
- The main issue is separated into routing, health signaling, backend capacity, or client behavior.
- L4 vs L7 implications are addressed when architecture choices are involved.
- Health checks reflect user-visible readiness and avoid obvious flap risks.
- Retries, timeouts, stickiness, failover, and draining are considered together.
- Tradeoffs are explicit for latency, resilience, fairness, and complexity.
- Recommendations include how to verify improvement with metrics or controlled tests.
- The answer avoids claiming a balancing fix will solve unrelated application bottlenecks.
