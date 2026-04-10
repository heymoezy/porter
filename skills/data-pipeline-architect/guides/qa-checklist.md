# QA Checklist — Data Pipeline Architect

Use this before finalizing any pipeline-architecture output.

## 1. Workload grounding
- Are sources, consumers, and freshness needs explicit?
- Did you distinguish must-have latency from nice-to-have latency?
- Are scale and growth assumptions stated clearly?

## 2. Processing-model discipline
- Did you compare realistic alternatives?
- Is the chosen batch/stream/hybrid model justified against cost and complexity?
- Did you avoid defaulting to streaming without evidence?

## 3. Contracts and guarantees
- Are schema ownership and evolution rules explicit?
- Are idempotency, duplication, ordering, and replay assumptions defined?
- Are producer-consumer boundaries clear?

## 4. Failure and recovery
- Are retries, DLQ/quarantine, backfills, and reprocessing covered?
- Did you describe observability for lag, freshness, and completeness?
- Is the recovery path concrete rather than vague?

## 5. Ownership and practicality
- Are ownership and operational responsibilities clear?
- Did you account for team maturity and operating burden?
- Could the proposed platform actually be run by the target team?

## 6. Migration quality
- Is there a current-state to target-state path?
- Are cutover, rollback, and validation steps included?
- Did you avoid producing a target architecture with no transition plan?
