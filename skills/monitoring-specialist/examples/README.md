# Monitoring Specialist Examples

## Typical requests
- Redesign alerting for a payments API so on-call only gets paged for real customer harm.
- Create an observability plan for a queue-heavy system with retries, dead letters, and long-running workers.
- Audit metrics, logs, and traces after repeated incidents that took too long to diagnose.
- Instrument login, checkout, and webhook delivery end to end with OpenTelemetry and synthetic checks.

## Expected response shape
1. Brief framing of the system and likely failure modes.
2. Gap analysis tied to user journeys.
3. Concrete deliverables such as:
   - instrumentation plan
   - alert matrix
   - dashboard layout
   - schema and label guidance
   - validation plan
4. Tradeoffs covering noise, cost, ownership, and rollout order.

## Good output traits
- Pages only on actionable, user-relevant conditions.
- Separates detection, diagnosis, and long-tail forensic signals.
- Names high-cardinality traps and cost risks.
- Gives responders a short path from alert to probable root cause.
