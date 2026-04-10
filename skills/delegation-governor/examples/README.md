# Delegation Governor — Example Output Shapes

Use these patterns to make routing decisions concrete and mergeable.

## Example 1 — Multi-specialist launch package

**Input:**
Create a feature launch package with product positioning, implementation plan, and support preparation.

**Good output shape:**
- Objective:
  - one coherent launch package for one feature
- Delegation decision:
  - yes, split into three bounded work units
- Work units:
  - positioning brief → strategist
  - implementation plan → engineering specialist
  - support FAQ draft → support/content specialist
- Primary agent retains:
  - terminology alignment
  - conflict resolution
  - final launch narrative
- Merge plan:
  - normalize naming, compare assumptions, publish one final packet

## Example 2 — Keep it local

**Input:**
Rewrite two button labels and a short error message.

**Good output shape:**
- Decision:
  - do directly
- Why:
  - tiny scope
  - no specialist depth needed
  - handoff cost exceeds benefit

## Example 3 — Sensitive incident analysis

**Input:**
Investigate a permissions incident and propose remediation.

**Good output shape:**
- Decision:
  - keep incident synthesis local
  - delegate only bounded evidence gathering if needed
- Delegate packet:
  - inspect logs from approved source only
  - return timeline and anomalies
  - no remediation recommendations
- Primary agent retains:
  - root-cause judgment
  - risk framing
  - remediation decision

## Example 4 — Parallel vendor review

**Input:**
Compare three vendors and recommend one by tomorrow.

**Good output shape:**
- Shared rubric:
  - pricing
  - capability fit
  - implementation risk
  - lock-in risk
- Work units:
  - one reviewer per vendor using identical rubric
- Merge plan:
  - compare scores and narrative caveats
  - primary agent makes final recommendation and tie-break call

## Example 5 — Research before implementation

**Input:**
We may need a refactor, migration, and new analytics instrumentation. What should be split?

**Good output shape:**
- Phase 1:
  - delegate architecture audit only
- Phase 2:
  - decide implementation splits after architecture findings return
- Why:
  - premature decomposition would lock in assumptions too early
