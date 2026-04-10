# QA Checklist — Prompt Engineer

Use this before finalizing any prompt-system output.

## 1. Task model integrity
- Is the actual job clearly defined?
- Are inputs, outputs, and failure modes explicit?
- Was the non-prompt part of the workflow considered?

## 2. Design fit
- Is the chosen design the lightest one that should work?
- Was complexity justified by real failure patterns?
- Are routing, chaining, or evaluator steps necessary rather than fashionable?

## 3. Contract quality
- Are output formats, abstain rules, and uncertainty behavior explicit?
- Are trusted vs untrusted inputs distinguished?
- Are tool-use and retrieval instructions clear where relevant?

## 4. Evaluation discipline
- Are there concrete test cases, including ugly edge cases?
- Does the plan check repeated-run reliability, not just one pass?
- Are failure metrics or review criteria defined?

## 5. System realism
- Does the solution acknowledge latency, cost, and context-window limits?
- Does it say what must be fixed outside the prompt layer?
- Is deterministic language avoided when the setup cannot guarantee it?

## 6. Common failure checks
- prompt complexity added without evidence
- schema left underspecified
- retrieval problem mislabeled as prompt problem
- eval set too clean or too small
- no escalation or abstention behavior
