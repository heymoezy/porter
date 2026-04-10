# Prompt Architect — Example Output Shapes

Use these as patterns, not rigid templates.

## Example 1 — Repair a vague delegation brief
**Input:** Make a prompt for an agent to audit our onboarding and suggest fixes.

**Good output shape:**
- objective: identify friction, conversion leaks, and misleading UX cues in onboarding
- context: product stage, target user, available assets, known complaints
- inputs: screenshots, funnel metrics, support tickets, onboarding copy
- constraints: no invented data, no code changes unless requested
- required output: prioritized findings, evidence, recommended fixes, confidence notes
- quality bar: specific root causes, quick wins vs structural issues, cited evidence

## Example 2 — Shrink a bloated internal prompt
**Input:** A long prompt mixes company lore, preferences, duplicated instructions, and task steps.

**Good output shape:**
- final short prompt
- optional extended version for first-time runs
- assumptions / missing inputs list
- note on removed clutter and preserved hard requirements

## Example 3 — Create a reusable scaffold
**Input:** We repeatedly ask different freelancers for the same deliverable.

**Good output shape:**
```text
Task
Context
Inputs provided
Constraints
Required output
Acceptance checks
If something is missing
```
Then fill placeholders like `[audience]`, `[deadline]`, `[source files]`, `[forbidden moves]`.

## Example 4 — Resolve contradictory instructions
**Input:** “Be exhaustive but brief, creative but exact, and do not ask follow-up questions.”

**Good output shape:**
- identified tradeoff
- chosen priority order
- rewritten prompt reflecting the choice
- short note on what was intentionally de-emphasized
