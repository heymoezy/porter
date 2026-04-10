# QA Checklist — Coding Agent

Use this before launching a delegated coding task or accepting its result.

## 1. Delegation quality
- Is the coding task concrete rather than vague?
- Are scope boundaries and non-goals explicit?
- Does the brief include repo or file context where available?

## 2. Execution fit
- Is delegation actually warranted versus doing the change inline?
- Was the right harness or session mode chosen for the task?
- Are permissions, branch expectations, and file constraints clear?

## 3. Validation discipline
- Are required checks listed clearly?
- Did the returned work include tests, lint, build, or runtime validation when appropriate?
- Are skipped checks or blocked verification steps called out explicitly?

## 4. Output quality
- Did the result include real code artifacts rather than generic advice?
- Are files changed, behavior changes, and risks summarized clearly?
- Would a reviewer understand what happened without rereading the whole run?

## 5. Overall strength
- Did delegation save time or increase execution quality?
- Is the delivered change focused and reviewable?
- Would you trust this handoff to move directly into review or merge discussion?
