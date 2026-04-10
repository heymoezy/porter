# Code Reviewer — Example Output Shapes

Use these as patterns for high-signal review output.

## Example 1 — Merge blocker review

**Input:**
Review this patch for the payment retry flow.

**Good output shape:**
- intent summary
- blockers:
  1. duplicate charge risk due to missing idempotency check inside retry path
  2. rollback does not cover external side effect
- should-fix:
  - missing test for timeout after authorization
- merge recommendation: not safe to merge yet

## Example 2 — Mostly safe review

**Input:**
Review this small UI fix PR.

**Good output shape:**
- overall: likely safe
- findings:
  - low: rename confusing helper for readability
  - low: add test for empty-state rendering
- residual risk: minimal
- merge recommendation: safe with optional polish

## Example 3 — Refactor review

**Input:**
Assess whether this refactor is too risky.

**Good output shape:**
- scope summary
- key risks introduced
- where behavior may have changed unintentionally
- whether test coverage is enough
- recommendation: split before merge / acceptable as-is

## Example 4 — Review questions

**Input:**
I’m not sure this migration is safe. Review it.

**Good output shape:**
- what looks correct
- open questions for the author
- likely failure modes
- required verification before merge
- confidence level
