# QA Checklist — Kubernetes Operator

- The deliverable is clearly about Kubernetes workload or cluster operation, not generic cloud advice.
- The operational goal or incident symptom is explicit.
- Recommendations map to the correct Kubernetes primitives and source-of-truth artifacts.
- Probe, resource, scaling, scheduling, disruption, and networking interactions are considered where relevant.
- Rollout, rollback, and verification steps are included for risky changes.
- Residual risks are named: security, availability, cost, statefulness, dependency fragility, or policy conflicts.
- Live-cluster uncertainty is called out honestly when manifests, events, or metrics are missing.
- The output avoids normalizing manual cluster drift when declarative updates are possible.
