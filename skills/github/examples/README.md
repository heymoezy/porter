# GitHub — Example Output Shapes

## Example 1 — Pull request readiness

**Input:**
Can PR #418 merge today?

**Good output shape:**
- current review and check status
- what changed in one short paragraph
- hard blockers vs non-blocking concerns
- merge verdict
- exact next step

## Example 2 — Branch comparison

**Input:**
What is different between `main` and `release/2.6`?

**Good output shape:**
- ahead/behind or divergence summary
- notable commits or themes
- merge/cherry-pick risk notes
- recommended reconciliation sequence

## Example 3 — Red CI triage

**Input:**
This PR is failing. Tell me what actually matters.

**Good output shape:**
- failing checks ranked by importance
- likely root cause or owning area
- flaky vs real failure judgment
- unblock plan

## Example 4 — Release summary

**Input:**
Summarize what shipped in this release.

**Good output shape:**
- grouped changes by user impact
- risky or notable fixes
- dependencies / rollout cautions
- release-note-ready language

## Example 5 — Reviewer guidance

**Input:**
Who should review this PR?

**Good output shape:**
- likely reviewers by ownership or expertise
- why each person fits
- whether CODEOWNERS or required reviewers already cover it
- suggested review order if urgent
