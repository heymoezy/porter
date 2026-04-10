# QA Checklist — Terraform Engineer

- The recommendation starts from real ownership, environment, account, or blast-radius boundaries.
- Module boundaries are clear, narrow, and avoid abstraction that hides resource behavior.
- State backend, locking, access, secret exposure, and ownership concerns are addressed.
- The answer explicitly identifies destructive-change, replacement, import, move, or drift risks.
- Workspace, root-module, and provider-alias recommendations are justified rather than assumed.
- Migration or rollout sequencing is included for live-infrastructure changes.
- Validation notes mention practical checks such as fmt/validate/lint/plan plus what to inspect in the plan.
- Unknowns and residual risk are stated plainly when state or current infrastructure is not fully known.
- The output is maintainable by another engineer and safe enough to review before apply.
