---
name: analytics-engineer
description: Design, build, and maintain trustworthy analytics models, metrics, semantic layers, and reporting-ready datasets. Use when work involves transforming messy source data into documented, testable, business-aligned models for dashboards, self-serve analytics, KPI definitions, or decision support. Do not use for raw infrastructure engineering or pure ad hoc analysis when the core problem is not analytics data modeling.
---

# Analytics Engineer

Turn raw operational data into reliable analytics assets people can actually trust. Focus on modeling, metric definitions, semantic consistency, lineage, documentation, and data quality—not just moving data from one place to another.

## Scope

Use this skill for:
- analytics data modeling
- fact/dimension and mart design
- KPI and metric definition
- semantic layer planning
- dbt-style transformation design
- data quality rules for analytics models
- documentation and lineage for business-facing datasets
- designing reporting-ready tables for BI tools and downstream consumers

## Use this skill when

Use this skill when the task requires:
- turning raw source data into curated analytics models
- establishing one trusted definition of a metric
- organizing data for dashboards, self-serve reporting, or exec review
- redesigning broken or inconsistent reporting layers
- evaluating whether a dataset is fit for business use
- building a metrics layer or semantic contract across teams

## Do not use this skill when

Do not use this skill for:
- data ingestion/infrastructure as the primary task → use data-engineering/ETL-oriented skills
- exploratory analysis where no reusable data model is needed → use analyst skills
- ML feature engineering unless the main objective is analytics/reporting data
- dashboard visual polish without changes to the data model

## Inputs to gather

Before recommending a solution, identify:
- source systems and source-of-truth concerns
- business entities and events
- reporting needs and consumers
- critical metrics/KPIs and known definition conflicts
- data freshness requirements
- grain of the key datasets
- expected slices/dimensions and time windows
- current pain points: duplicated logic, broken trust, slow queries, missing documentation, inconsistent definitions

If the grain is unclear, stop and define it first.

## Output expectations

Return outputs such as:
- analytics model design
- fact/dimension schema proposal
- metric definition spec
- semantic layer plan
- transformation layer refactor plan
- data quality/testing checklist
- lineage/documentation guidance
- migration path from messy reporting logic to trusted marts

Use tables for model/entity design. Use examples for metric definitions.

## Working method

### 1. Start with business questions, not tables

Clarify what decisions the data must support:
- what should users be able to answer?
- which KPIs matter most?
- what slices and time grains are needed?
- what trust problems exist today?

Analytics engineering is about decision-ready structure, not just SQL output.

### 2. Define grain explicitly

For every core model, state the grain clearly.
Examples:
- one row per order
- one row per user-day
- one row per invoice line item
- one row per workspace per billing period

A lot of analytics failure comes from grain confusion.

### 3. Separate layers intentionally

A strong analytics stack often has layers such as:
- **raw/staging**: minimal cleaning and standardization
- **intermediate**: reusable joins, entity shaping, business logic building blocks
- **marts**: business-facing models ready for reporting or metrics
- **semantic/metrics layer**: governed KPI definitions and dimensions

Do not let dashboard logic become the real data model.

### 4. Model for trust and reuse

When designing models:
- keep naming stable and business-readable
- centralize business logic once
- use dimensions and facts intentionally
- handle slowly changing dimensions consciously if historical correctness matters
- avoid ambiguous fields that mix grains or meanings
- encode metric definitions clearly enough that two teams cannot interpret them differently

### 5. Treat metrics as products

For each important metric, define:
- name
- plain-language definition
- numerator/denominator logic if applicable
- time grain
- filtering rules
- exclusions
- source models
- edge cases
- owner

If “revenue” or “active user” has more than one meaning, resolve it explicitly.

### 6. Build data quality into the model layer

Analytics assets should include tests or checks for:
- nulls where impossible
- uniqueness where required
- referential integrity
- accepted value domains
- freshness or latency expectations
- volume/anomaly checks where useful
- reconciliation against source-of-truth or finance logic when needed

Do not treat trust as a later dashboard problem.

### 7. Document lineage and assumptions

A strong output should make clear:
- where the data comes from
- what transformations are applied
- which assumptions exist
- where business logic lives
- which downstream metrics depend on which models

This helps debugging, onboarding, and change safety.

## Adjacent skill boundaries

- **data-engineer / etl-developer**: focuses more on ingestion, movement, orchestration, and platform plumbing; this skill focuses on analytics-facing modeling and metric trust
- **bi-analyst / data-analyst**: uses the models to answer questions; this skill builds the trusted layer they should use
- **dashboard-designer**: focuses on visualization; this skill ensures the underlying model is consistent and reusable
- **data-governance**: broader governance/policy concerns; this skill handles practical modeling and trust mechanics

## Quality bar

A strong result should:
- define grains clearly
- separate source, transformation, and business-facing layers intentionally
- eliminate duplicated KPI logic
- improve trust, reusability, and explainability
- include testing and documentation expectations
- stay practical for real BI and reporting workflows

## References to use

Use `prompt.md` for response style and modeling posture.
Use `guides/qa-checklist.md` before finalizing.
Use `examples/README.md` for output patterns.
Use `meta/skill.json` for boundaries and metadata.
