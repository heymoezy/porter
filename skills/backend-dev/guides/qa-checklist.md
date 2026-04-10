# QA Checklist — Backend Developer

Use this before finalizing any backend-development output.

## 1. Code-path understanding
- Did you read the relevant implementation paths?
- Is the current behavior or root cause stated clearly?
- Are touched layers and side effects identified?

## 2. Correctness and invariants
- Are validation, auth, and data invariants preserved?
- Is the logic placed at the right architectural layer?
- Are transaction, ordering, and concurrency assumptions handled explicitly?

## 3. Failure handling
- Are upstream failures, timeouts, retries, and duplicates considered?
- Are error behaviors clear and actionable?
- Are partial-failure or rollback concerns addressed where relevant?

## 4. Verification
- Were meaningful tests added or updated?
- Do the tests cover risky paths, not just happy paths?
- Is there enough logging or observability for future debugging?

## 5. Compatibility and rollout
- Are existing clients, jobs, events, and schemas considered?
- Are migration or rollout hazards called out?
- Is any breaking behavior clearly justified and communicated?

## 6. Deliverable usefulness
- Is the change summary concrete?
- Could another engineer or reviewer understand what changed and why?
- Are risks, follow-ups, or monitoring notes included when needed?
