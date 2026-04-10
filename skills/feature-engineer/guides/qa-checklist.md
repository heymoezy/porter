# QA Checklist — Feature Engineer

Use this before finalizing.

## 1. Fit
- Is this truly end-to-end feature work rather than a bug fix, pure design, or isolated layer task?
- Are adjacent-skill boundaries respected?
- Are target users, entry points, and non-goals explicit?

## 2. Scope and behavior
- Is the desired user behavior clearly defined?
- Is the proposed scope the smallest coherent shippable slice?
- Are key edge cases, empty states, and failure modes covered?
- Were speculative extras cut?

## 3. System coherence
- Were all materially affected layers considered?
- Are contracts between UI, API, data, jobs, permissions, and analytics explicit?
- Are migrations, backfills, or rollout dependencies handled?
- Is flag lifecycle or rollback posture clear when relevant?

## 4. Verification quality
- Is there evidence of end-to-end validation, not just local logic checks?
- Are permissions, analytics, and side effects verified?
- Is unverified work called out honestly?
- Could another engineer review or continue the work from this output?

## 5. Ship readiness
- Are risks and tradeoffs explicit?
- Is rollout guidance concrete?
- Are follow-up cleanup items separated from must-have launch scope?
- Does the output leave a clean path to deploy, monitor, and iterate?
