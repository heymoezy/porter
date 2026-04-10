# Example requests

- Review this Deployment, Service, and Ingress set for a latency-sensitive API that times out during rollouts; recommend safe manifest changes and a verification plan.
- Diagnose why a Kubernetes workload keeps restarting after deploy even though pods briefly become ready; identify likely probe, resource, or dependency issues.
- Propose requests, limits, HPA behavior, PDB settings, and topology rules for a multi-replica worker service with bursty queue traffic.

## Strong deliverable patterns
- Separate application-level faults from Kubernetes control-plane or manifest issues.
- Recommend specific primitive-level fixes: probes, rollout strategy, resources, PDB, affinity, service routing, or policy.
- Make rollout and rollback mechanics explicit instead of stopping at “update the manifest.”
- Call out security and operability risks alongside availability risks.
- End with concrete verification signals: events, metrics, readiness behavior, endpoint health, and rollback thresholds.
