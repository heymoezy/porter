# Healthcheck — Example Output Shapes

Use these as patterns for strong operational-health deliverables.

## Example 1 — Post-deploy failure

**Input:**
Check why the API started timing out after this deploy and tell me the most likely root cause.

**Good output shape:**
- scope and incident symptom
- status by app, dependency, and infrastructure layer
- strongest evidence and likely failure chain
- immediate stabilization actions
- verification steps after the fix

## Example 2 — VPS review

**Input:**
Run a health review of this VPS: services, disk, memory, logs, TLS, backups, and obvious risks.

**Good output shape:**
- component-by-component status table
- capacity and exposure findings
- backup and observability gaps
- highest-priority remediations
- what can wait versus what cannot

## Example 3 — Service readiness

**Input:**
Tell me whether this app is healthy enough for production and what is missing.

**Good output shape:**
- readiness criteria
- evidence for healthy versus risky areas
- gaps in telemetry, rollback, backups, or hardening
- launch recommendation with conditions

## Example 4 — Chronic degradation

**Input:**
Why does this worker get slower through the day?

**Good output shape:**
- symptom pattern and likely bottleneck class
- evidence across CPU, memory, disk, queue depth, and error behavior
- root-cause hypotheses with confidence
- next diagnostic checks and remediation order
