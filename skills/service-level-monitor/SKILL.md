---
name: service-level-monitor
description: Translate uptime, latency, error, queue, response, and resolution data into clear SLA or SLO posture, burn rate, breach risk, and action-ready reporting. Use when work involves service quality tracking, error-budget monitoring, customer commitment reporting, support-response compliance, or detecting near-breach trends before targets are missed.
---

# Service Level Monitor

Measure the promise honestly. Surface risk early enough to act.

## Mission

Use this skill to convert raw operational metrics into an unambiguous answer: are we meeting the target, drifting toward breach, or already failing it?

The job is not to decorate dashboards. The job is to define the commitment correctly, compare reality to it, and make the next action obvious.

## Work sequence

1. **Define the target exactly**
   - State the metric, threshold, window, inclusions, exclusions, time clock, and customer or service scope.
   - Distinguish contractual SLA from internal SLO and from team aspiration.
   - Refuse to grade performance against a fuzzy definition.

2. **Validate measurement integrity**
   - Identify the source of truth.
   - Note sampling gaps, missing telemetry, delayed pipelines, clock rules, or denominator issues.
   - Say what the data can and cannot support.

3. **Compare current posture to the commitment**
   - Show attainment against the actual target, not just against prior periods.
   - Use percentiles, error rates, queue clocks, or availability windows appropriately.
   - Do not let averages hide tail pain or clustered outages.

4. **Analyze trend and burn**
   - For SLOs, measure error-budget consumption and burn rate.
   - For SLAs, estimate breach risk from current trajectory, incident recurrence, seasonality, and open degradation.
   - Separate isolated spikes from sustained degradation.

5. **Translate status into action**
   - State whether the service is healthy, watch, at-risk, or breached.
   - Tie thresholds to escalation, customer communication, staffing, rollback, or mitigation steps.
   - Make clear what requires immediate action versus continued monitoring.

6. **Communicate transparently**
   - Customer-facing reporting should be plain and non-evasive.
   - Internal reporting should expose caveats instead of smoothing them away.
   - Preserve trust by showing both status and uncertainty honestly.

## Output requirements

Deliver one or more of these:
- SLA/SLO status report
- breach-risk alert
- error-budget summary
- trend memo
- customer-facing service update
- target-definition clarification note

Each deliverable should include:
- target definition
- measurement scope and caveats
- current posture against target
- trend / burn interpretation
- action or escalation implication
- next review point

## Heuristics

Prefer:
- explicit target definitions
- rolling-window and burn-rate context
- tail-aware analysis
- alerts tied to decisions
- customer-impact framing when commitments are external

Avoid:
- vague green dashboards with hidden caveats
- mixing SLA and SLO language carelessly
- averaging away serious degradation
- retroactively redefining windows after misses
- reporting that no operator can act on

## Boundaries

Use adjacent skills instead when the work is centered elsewhere:
- **site-reliability** for reliability architecture and resilience design
- **runtime-auditor** for detailed diagnosis of active runtime failure behavior
- **operations-manager** for broader process and staffing operations design
- **risk-assessor** for broader business-risk framing beyond service metrics

## Final check

Before delivering, verify that a customer, exec, or on-call lead could answer three questions immediately: what is the commitment, where are we against it, and what happens next?

## Use supporting files

- Read `prompt.md` for stance, alert language, and response structure.
- Read `examples/README.md` for output patterns.
- Read `guides/qa-checklist.md` before finalizing.
- Use `meta/skill.json` for metadata, aliases, and adjacent-skill boundaries.
