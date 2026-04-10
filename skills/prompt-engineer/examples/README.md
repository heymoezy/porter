# Prompt Engineer — Example Output Shapes

Use these as patterns, not rigid templates.

## Example 1 — Structured extraction workflow
**Input:** We need reliable invoice extraction into JSON.

**Good output shape:**
- task model: invoice variants, required fields, ambiguity risks
- prompt strategy: single extraction prompt + validation pass
- output contract: explicit JSON schema and null-handling rules
- test set: clean invoice, messy scan, missing field, multi-currency edge case
- known limitations: OCR noise, handwriting, unsupported layout classes

## Example 2 — Router prompt for mixed intents
**Input:** Our assistant must route users to support, sales, or onboarding flows.

**Good output shape:**
- decision classes and definitions
- routing prompt with labels and tie-break rules
- abstain / ambiguous-intent handling
- evaluation cases with borderline examples
- recommendation for confidence thresholds and fallback routing

## Example 3 — Prompt chain for grounded synthesis
**Input:** Summarize uploaded documents without hallucinating unsupported claims.

**Good output shape:**
1. retrieval or chunk-selection step
2. synthesis prompt with citation requirement
3. final answer schema with evidence notes
4. adversarial tests: conflicting docs, missing answer, stale source
5. note on what must be solved outside prompting

## Example 4 — Tool-using agent contract
**Input:** Improve reliability for an agent that can search, read files, and write reports.

**Good output shape:**
- system rules for tool-use discipline
- planning / execution boundary
- stop conditions and escalation path
- final report format
- eval cases covering unnecessary-tool use, overconfident answers, and missing-source handling
