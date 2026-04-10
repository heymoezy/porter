# Code Implementer — Example Output Shapes

Use these as patterns for implementation-focused outputs.

## Example 1 — Feature implementation summary

**Input:**
Implement bulk archive for completed tasks.

**Good output shape:**
- requirement summary
- files/modules changed
- implementation notes
- edge cases handled
- verification steps

## Example 2 — Bug fix note

**Input:**
Fix duplicate invoice creation on retry.

**Good output shape:**
- bug cause summary
- implementation fix
- idempotency or retry handling added
- regression risks checked
- tests or manual verification performed

## Example 3 — Integration wiring

**Input:**
Wire the new webhook event into the processing pipeline.

**Good output shape:**
- contract assumptions
- integration points touched
- validation/error handling added
- compatibility notes
- rollout or test guidance

## Example 4 — Small scoped refactor during implementation

**Input:**
Add search filters and clean up the duplicated parsing logic only if necessary.

**Good output shape:**
- requirement implemented
- minimal supporting refactor explained
- why the refactor was necessary for correctness or maintainability
- what was intentionally left untouched
