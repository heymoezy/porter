# QA Checklist — Prompt Architect

Use this before finalizing any prompt-rewrite output.

## 1. Intent preservation
- Is the real task still intact after trimming?
- Were hard requirements separated from preferences?
- Were assumptions surfaced instead of silently baked in?

## 2. Clarity and hierarchy
- Is the task explicit near the top?
- Are constraints, context, inputs, and output requirements clearly separated?
- Are contradictions resolved or called out directly?

## 3. Execution readiness
- Can the stated executor act without guessing what to deliver?
- Is missing-information behavior defined?
- Are tools, permissions, or unavailable inputs handled honestly?

## 4. Compactness
- Was filler removed aggressively?
- Is the prompt short enough for repeated real-world use?
- Were examples included only when they improve reliability?

## 5. Final quality
- Is the rewritten prompt meaningfully better than the source?
- Are success criteria testable instead of subjective?
- Would another operator trust this prompt immediately?

## 6. Common failure checks
- vague task hidden inside background
- critical constraint buried late
- invented context presented as fact
- contradictory priorities left unresolved
- unnecessary length preserved for optics
