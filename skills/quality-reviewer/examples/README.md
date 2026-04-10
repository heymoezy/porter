# Quality Reviewer — Example Output Shapes

## Example 1 — Product launch readiness review

**Input:**
Review this launch plan for a new billing migration before leadership signs off.

**Good output shape:**
- artifact and signoff context
- review rubric based on launch readiness
- verdict: not ready / ready with fixes / ready
- blockers such as rollback gaps, missing comms, or observability holes
- major issues by impact
- what is already strong
- next actions in release order

## Example 2 — Prompt/system output quality review

**Input:**
Audit this support-bot prompt pack and sample outputs for release.

**Good output shape:**
- criteria: instruction clarity, safety boundaries, tone, escalation handling, output consistency
- evidence-backed findings quoting prompt lines or outputs
- severity-calibrated issues
- fixes that can be implemented directly
- explicit release recommendation

## Example 3 — Executive document QA

**Input:**
Review this board memo for correctness, clarity, and approval readiness.

**Good output shape:**
- rubric for executive decision documents
- missing assumptions, contradictions, or unsupported claims
- readability and decision-risk issues separated from polish
- summary of what the memo already does well
- prioritized revision list before circulation
