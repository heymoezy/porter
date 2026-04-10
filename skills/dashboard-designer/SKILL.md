---
name: dashboard-designer
description: Design or critique dashboards, KPI layouts, analytics surfaces, and monitoring views that let users understand status at a glance and know what to do next. Use when Porter needs dashboard information architecture, metric hierarchy, chart selection, wireframes, responsive behavior, annotation strategy, or redesign guidance for operational or analytical dashboards. Do not use for deep statistical analysis, raw data engineering, or generic visual-brand mockups detached from decision-making.
---

# Dashboard Designer

Design the fastest path from signal to action.

This skill is for dashboard work where the real deliverable is not “more charts,” but better decisions. A strong dashboard should let the user answer: what is happening, is it good or bad, where should I look next, and what action should follow.

## Scope

Use this skill for:
- dashboard information architecture
- KPI hierarchy and summary-card design
- chart and table selection
- dashboard wireframes or section blueprints
- filter, drill-down, compare, and annotation behavior
- monitoring and operational dashboard design
- analytical dashboard redesign critiques
- accessibility and small-screen dashboard behavior

## Use this skill when

Use this skill when the task needs:
- an at-a-glance dashboard structure
- prioritization of metrics instead of metric dumping
- chart recommendations tied to user questions
- redesign guidance to reduce clutter and increase interpretability
- a spec that PM, design, and engineering can build from

## Do not use this skill when

Do not use this skill for:
- deep metric-definition or SQL work
- exploratory analysis that belongs in notebooks or BI deep dives
- brand-only visual styling work with no data-interpretation problem
- decorative chart production detached from real user decisions

## Inputs to gather

Before designing, identify:
- primary user, role, and decision frequency
- whether the dashboard is operational, analytical, or diagnostic
- top questions the user must answer in under 10 seconds
- KPI definitions, targets, thresholds, and update cadence
- available dimensions, filters, and drill-down paths
- screen context: desktop, mobile, TV wallboard, embedded module, or executive snapshot
- failure states such as empty data, stale data, late-arriving data, or permissions gaps

If the user and decision are unclear, stop there first.

## Output expectations

Return outputs such as:
- dashboard blueprint
- KPI hierarchy
- section-by-section wireframe in prose
- chart rationale table
- interaction/state specification
- redesign critique with priority order
- implementation notes for product and engineering

Prefer implementable structure over vague “make it cleaner” advice.

## Working method

### 1. Start with the decision, not the canvas

Define:
- who uses the dashboard
- what decision or monitoring task it supports
- how quickly the answer must be understood
- what action follows when something is off

A dashboard without a decision is a report collage.

### 2. Separate monitoring from exploration

Use dashboards for fast status comprehension.
If the real task is open-ended analysis, say so and keep the dashboard focused on summary, flags, and launch points into deeper views.

### 3. Rank the metrics ruthlessly

Organize metrics into:
- headline outcomes
- supporting diagnostics
- segment or slice controls
- exceptions, alerts, and anomalies

The strongest visual positions belong to the metrics that change decisions, not the metrics stakeholders are merely curious about.

### 4. Match chart type to user question

Choose visuals based on the question:
- status vs target → bullet, bar, variance card, or annotated KPI
- trend over time → line or column
- rank and compare → sorted bars or aligned tables
- composition → stacked bars only when comparison still matters
- distribution → histogram, box plot, or percentile summary
- flow or conversion → funnel only when steps are stable and ordered

Prefer position and length over area or decoration for quantitative comparison.

### 5. Design the scan path

Ensure the user can quickly see:
- current state
- direction or change
- whether intervention is needed
- where to inspect next

Use hierarchy, alignment, annotation, thresholds, and whitespace to guide attention.

### 6. Specify interaction and state behavior

Cover:
- default filters and comparisons
- cross-filtering and drill-down logic
- empty, loading, error, and stale-data states
- responsive layout tradeoffs
- alert thresholds and annotation rules
- definitions, units, and time-window labeling

The happy path alone is not a design.

## Adjacent skill boundaries

- **data-analyst**: defines metrics and analyzes what the numbers mean; this skill designs how users consume them
- **dashboard-designer** is narrower than a full BI strategy or analytics-engineering plan
- **ui-designer**: handles broader interface systems; this skill focuses specifically on data-display decision surfaces
- **design-system-architect**: owns reusable component systems, not dashboard decision structure itself

## Quality bar

A strong result should:
- make the user and decision explicit
- prioritize metrics instead of listing them all
- use chart types that match the question being asked
- create a clear scan path from top-line signal to diagnosis
- specify labels, thresholds, and edge states well enough to implement

## References to use

Use `prompt.md` for design posture and output shape.
Use `guides/qa-checklist.md` before finalizing.
Use `examples/README.md` for common dashboard design requests.
Use `meta/skill.json` for routing metadata and boundaries.
