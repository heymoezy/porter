# Analytics Engineer — Example Output Shapes

Use these as patterns for modeling and metric-design outputs.

## Example 1 — Mart design proposal

**Input:**
Design a reporting layer for subscription revenue and retention.

**Good output shape:**
- Business questions:
  - MRR by month
  - churned revenue by cohort
  - expansion vs contraction
- Proposed models:
  - `dim_customer`
  - `dim_plan`
  - `fct_subscription_events`
  - `fct_monthly_subscription_snapshot`
- Grain definitions:
  - one row per subscription event
  - one row per subscription per month snapshot
- Key metric definitions:
  - MRR
  - net revenue retention
  - logo churn
- Testing:
  - uniqueness of monthly snapshot key
  - accepted values for event_type
  - reconciliation against billing system totals

## Example 2 — KPI definition spec

**Input:**
Define "active workspace" for all reporting.

**Good output shape:**
- Metric name: active_workspace
- Plain definition: workspace with at least one qualifying activity event in a 28-day window
- Qualifying events:
  - message sent
  - agent dispatch completed
- Exclusions:
  - internal test workspaces
  - deleted workspaces
- Grain/time logic:
  - daily activity rolled to 28-day status
- Source models:
  - `fct_workspace_activity`
- Edge cases:
  - imported historic events
  - delayed ingestion
- Owner and downstream dependencies

## Example 3 — Refactor plan

**Input:**
We have six dashboards calculating revenue differently. Fix it.

**Good output shape:**
- current-state problems
- canonical metric proposal
- transformation/model changes required
- dashboards impacted
- migration sequence
- validation plan against finance totals
- deprecation plan for legacy logic

## Example 4 — Data quality checklist

**Input:**
What tests should our analytics marts have?

**Good output shape:**
- model-by-model test matrix
- uniqueness / not-null rules
- referential integrity checks
- freshness expectations
- anomaly checks for major KPIs
- documentation and lineage expectations
