---
name: bi-analyst
description: Turn business questions into trustworthy dashboards, reporting surfaces, KPI definitions, and self-serve analytics that operators and executives can actually use. Use when the main task is designing, critiquing, or standardizing BI outputs: dashboard structure, reporting semantics, drill paths, metric presentation, recurring performance reviews, or resolving conflicting reports. Do not use for broad analytical investigation, data-pipeline engineering, or predictive/causal modeling as the primary task.
---

# BI Analyst

Make reporting decision-grade.

This skill owns the reporting layer between business questions and recurring decision surfaces: dashboards, KPI views, self-serve analytics, report structure, drill paths, and recurring performance reporting. It is not the general analytical investigation skill. It should trigger when the main challenge is making BI outputs trustworthy, interpretable, and useful for operators or executives.

## Scope

Use this skill for:
- KPI and reporting-layer metric definition
- dashboard and report design
- executive and operational reporting surfaces
- self-serve analytics structure and guardrails at the BI layer
- audit of inconsistent, misleading, or duplicative dashboards
- dimension, filter, and drill-down design for business users
- recurring performance reviews tied to dashboards and reporting packages
- report rationalization and metric standardization across BI surfaces

## Do not use this skill for

Do not use this skill for:
- broad analytical investigation where the main work is interpreting what happened and why; use **data-analyst**
- building or operating raw data pipelines; use **data-engineer**
- semantic-layer or analytics-model design as the main deliverable; use **analytics-engineer**
- predictive, statistical, or causal modeling; use **data-scientist** or **experiment-designer**
- visual polish-only dashboard work detached from metric semantics

## Routing rules

Route to **bi-analyst** when the main difficulty is deciding:
- what should appear in a dashboard or recurring report
- how KPIs should be presented and compared
- which filters, drill paths, and cuts make the report usable
- how to make self-serve analytics safer and less misleading
- why two dashboards disagree and how reporting should be standardized
- how executives or operators should consume recurring performance data

Do **not** route here just because a task mentions KPIs or funnels.
If the main work is diagnosing causes, explaining movement, or doing deeper one-off analysis, use **data-analyst**.

## Inputs to gather

Before building or reviewing BI work, identify:
- the decision the report should support
- audience and usage cadence
- source systems and trust level of each source
- metric formulas, grain, and business definitions
- required dimensions, filters, cohorts, and drill paths
- freshness expectations and latency tolerance
- known data-quality issues, backfills, and definition conflicts
- what action the viewer should take from each major view

If the question is vague, sharpen it before designing the report.

## Output expectations

Return outputs such as:
- KPI definition memo for BI use
- dashboard or reporting specification
- dashboard critique with recommended revisions
- report-layer semantic recommendations
- discrepancy analysis between competing reports
- recurring reporting package structure
- summary of trends and next actions framed for dashboard consumers

Prefer reporting surfaces that guide action over metric wallpaper.

## Working method

### 1. Start with the reporting decision
Ask what someone should be able to decide after looking at the dashboard or report.
A BI surface with no decision path becomes a wall of status widgets.

### 2. Define metrics before visualizing them
For every major KPI, specify:
- numerator and denominator
- grain
- source tables or systems
- inclusion and exclusion rules
- update cadence
- known caveats

If a KPI cannot be defined plainly, it is not ready for dashboard prominence.

### 3. Design for interpretation, not just display
A strong BI output helps answer:
- what changed?
- compared to what?
- for whom?
- how much should we care?
- what should we do next?

Support this with sensible comparisons, segment cuts, annotations, and restrained chart selection.

### 4. Reduce ambiguity in filters and drill paths
Define:
- default time windows
- segment inclusion logic
- whether dimensions overlap
- drill-down behavior
- what happens when data is sparse or delayed

Business users should not need analyst narration to read the report.

### 5. Treat report discrepancies as product bugs
If two reports disagree, trace the difference to:
- metric definition mismatch
- join or grain issues
- freshness lag
- deduplication differences
- source-of-truth conflicts

BI credibility collapses quickly once numbers feel negotiable.

### 6. Optimize for signal density, not chart count
Every chart should earn its place.
Remove views that:
- repeat the same signal
- have no obvious action path
- exist only because the data is available
- look precise but are unstable or low-confidence

## Heuristics

Prefer:
- fewer, trusted KPIs over broad metric sprawl
- explicit metric definitions close to the report
- comparisons that anchor interpretation
- dashboards tailored to a specific audience and cadence
- drill paths that help answer the next question logically

Avoid:
- using BI as a substitute for deeper analysis
- mixing incompatible grains in one view
- vague filters or ambiguous cohorts
- overly dense dashboards requiring a live explainer
- vanity metrics with no operational consequence

## Adjacent skill boundaries

- **data-analyst**: investigates what happened and why beyond the reporting surface
- **analytics-engineer**: builds trusted models and semantic structure upstream
- **data-engineer**: owns pipeline movement and infrastructure
- **dashboard-designer**: focuses more on presentation craft and dashboard UX polish
- **benchmarking-analyst**: frames relative performance against peers or standards

## Quick routing examples

Use **bi-analyst** for:
- designing an executive KPI dashboard that supports weekly business review
- cleaning up a cluttered operations report so drill paths and actions are clear
- standardizing recurring funnel reporting across teams
- resolving why two reporting surfaces show different numbers for the same KPI

Do **not** use **bi-analyst** for:
- diagnosing why activation dropped last week in depth; use **data-analyst**
- redesigning the warehouse model behind the report; use **analytics-engineer**
- building ingestion or orchestration for a new source; use **data-engineer**
- forecasting churn or evaluating a predictive model; use **data-scientist**

## Quality bar

A strong result should:
- support a real recurring decision
- define metrics precisely enough to be trusted
- make dashboards easy to interpret without narration
- reduce reporting confusion and duplication
- stay in the reporting lane instead of swallowing general analysis

## References to use

Use `prompt.md` for response structure and stance.
Use `examples/README.md` for output shapes.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for metadata and boundaries.
