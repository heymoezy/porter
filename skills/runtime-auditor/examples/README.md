# Runtime Auditor — Example Output Shapes

Use these patterns to keep runtime investigations actionable.

## Example 1 — Timeout spike

**Input:**
Requests are timing out more today. Audit the runtime state.

**Good output shape:**
- symptom start time and affected paths
- metric changes vs baseline
- likely timeout driver(s)
- blast radius
- immediate containment and next checks

## Example 2 — Fallback surge

**Input:**
Why are we falling back so often to secondary runtimes?

**Good output shape:**
- fallback-rate change and timing
- health evidence for primary path
- policy vs provider vs quota explanations
- user-impact assessment
- stabilization recommendation

## Example 3 — Cost anomaly

**Input:**
Runtime spend jumped sharply. Diagnose what changed.

**Good output shape:**
- baseline vs current spend split
- volume effect vs per-request-cost effect
- model mix or routing drift
- likely causes with confidence
- controls or alerts to add

## Example 4 — Backlog / queue pressure

**Input:**
The system feels backed up. Find the runtime bottleneck.

**Good output shape:**
- queue and throughput observations
- most likely pressure source
- whether issue is provider, capacity, routing, or config related
- short-term relief actions
- signals to watch next

## Example 5 — Leadership incident note

**Input:**
Summarize the runtime side of this incident for leadership.

**Good output shape:**
- what failed
- when it began and stabilized
- customer impact and duration
- probable cause and confidence
- actions taken and next prevention work