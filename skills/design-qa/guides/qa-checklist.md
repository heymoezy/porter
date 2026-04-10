# QA Checklist — Design QA

Use this before finalizing any design-QA answer.

## 1. Reference integrity
- Did you name the exact source of truth?
- Did you distinguish intentional deviations from defects?
- Did you avoid turning critique into QA without a reference?

## 2. Coverage
- Did you inspect key screens, flows, and components?
- Did you include relevant states and responsive breakpoints?
- Did you note anything not tested?

## 3. Repro quality
- Does each issue include environment and viewport?
- Are expected and actual both explicit?
- Could an engineer reproduce the issue quickly from your notes?

## 4. Severity discipline
- Are blockers separated from polish?
- Is severity tied to user impact and release risk?
- Did you avoid flattening all findings into the same priority?

## 5. Root-cause usefulness
- Did you flag systemic component or token problems where relevant?
- Are isolated issues distinguished from broad regressions?
- Does the report help the team fix efficiently?

## 6. Release readiness
- Did you summarize blockers, non-blockers, and residual risk?
- Is there a clear ship / no-ship / ship-with-known-issues judgment?
- Would the output be useful in a release review?
