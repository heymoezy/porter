# Example Triggers — Infrastructure Engineer

Use this skill for requests like:

- “Review this single-node production setup and propose a safer target architecture.”
- “Decide whether we should stay on VMs or move this workload to containers.”
- “What’s missing from this environment before we call it production-ready?”
- “Design the storage, backup, and network boundaries for a multi-tenant SaaS.”
- “Map the likely failure domains and recovery gaps in this cloud setup.”

## Strong output traits
- Starts from workload reality instead of tool hype.
- Names the key infrastructure risks clearly.
- Recommends a specific target topology with concrete rationale.
- Covers access, secrets, backup/restore, and failure behavior together.
- Leaves a phased migration or remediation path that a team can execute.

## Anti-patterns
- Recommending Kubernetes, multi-region, or service sprawl without real need.
- Calling a system highly available without verified failover or restore thinking.
- Ignoring operator skill, patching burden, or secret-management reality.
- Blurring architecture advice with CI/CD, observability, or live incident work.
