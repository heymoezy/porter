# QA Checklist — Healthcheck

Use this before finalizing any healthcheck output.

## 1. Scope discipline
- Is the system, layer, and decision in scope clear?
- Did you avoid vague whole-system judgments unsupported by evidence?

## 2. Evidence quality
- Does each material claim cite observed behavior, telemetry, logs, status, config, or a clearly labeled inference?
- Are missing metrics, health endpoints, or backup/restore proofs called out as gaps?

## 3. Diagnostic quality
- Are symptoms distinguished from likely root cause?
- Are confidence level, unknowns, and competing hypotheses stated honestly when needed?

## 4. Actionability
- Are findings prioritized by impact and urgency?
- Does each recommended fix include verification steps and, when relevant, rollback or blast-radius awareness?

## 5. Finish quality
- Is health broken down by component or layer?
- Is the output concise, usable, and ready for an operator to act on immediately?
