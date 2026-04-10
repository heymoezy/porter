# Project Lineage — Example Output Shapes

## Example 1 — Requirement lineage
**Input:** Trace how this feature requirement changed before release.

**Good output shape:**
| Stage | Source | What changed | Confidence |
|---|---|---|---|
| Initial ask | founder note | broad assistant request | High |
| Product brief | PRD | narrowed to email triage | High |
| Build handoff | ticket set | removed team inbox support | High |
| Pre-launch exception | Slack / release note | added admin override | Medium |

Then add:
- which source is authoritative now
- where requirement drift occurred
- current risk created by the drift

## Example 2 — Metric lineage
**Input:** Where does this dashboard metric actually come from?

**Good output shape:**
- metric definition in use today
- origin tables / events
- transformations, joins, and filters
- jobs or systems involved
- downstream dashboards / alerts / decisions using it
- fragile points and validation gaps

## Example 3 — Handoff reconstruction
**Input:** We inherited this workflow and no one knows why it works this way.

**Good output shape:**
- timeline of major handoffs
- original rationale if evidenced
- later modifications and exceptions
- undocumented assumptions still embedded
- recommendation: document, simplify, retire, or confirm

## Example 4 — Audit trail summary
**Input:** Summarize the history of this vendor selection decision.

**Good output shape:**
- decision chronology
- criteria changes over time
- influencers and approvers
- strongest supporting artifacts
- missing evidence
- present-day governance risk
