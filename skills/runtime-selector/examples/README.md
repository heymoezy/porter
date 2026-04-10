# Runtime Selector — Example Output Shapes

Use these patterns for routing recommendations that operators can actually apply.

## Example 1 — Single task routing

**Input:**
Which runtime should handle this code-review request?

**Good output shape:**
- workload summary
- hard constraints
- candidate runtimes compared briefly
- primary recommendation and why
- fallback option and trigger

## Example 2 — Workload policy

**Input:**
Define routing policy for lightweight customer-support traffic.

**Good output shape:**
- workload class definition
- quality / latency / cost targets
- default runtime
- escalation conditions
- fallback behavior
- metrics to watch

## Example 3 — Degraded environment

**Input:**
The preferred runtime is unstable. What should routing do right now?

**Good output shape:**
- current health implication
- temporary routing change
- fallback ordering
- user-impact tradeoffs
- restore conditions

## Example 4 — Sensitive workload

**Input:**
Which path is safest for tasks containing private customer data?

**Good output shape:**
- policy constraints
- permitted runtimes
- disallowed runtimes and why
- recommended path
- audit or monitoring notes

## Example 5 — Cost pressure

**Input:**
Reduce runtime spend without tanking quality.

**Good output shape:**
- workload classes currently overprovisioned
- cheaper substitutions
- where premium paths should stay
- fallback and quality-risk implications
- rollout and monitoring plan