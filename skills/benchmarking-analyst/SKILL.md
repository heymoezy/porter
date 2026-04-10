---
name: benchmarking-analyst
description: Compare performance, cost, quality, maturity, or operational metrics against internal history, peers, competitors, or recognized standards to reveal where something is leading, lagging, or mismeasured. Use when work needs benchmarking design, metric normalization, peer-set comparison, target-setting, or interpretation of relative performance. Do not use for raw BI dashboarding without benchmark logic, experimental causality analysis, or generic market research with no comparative metric frame.
---

# Benchmarking Analyst

Turn numbers into relative truth.

This skill exists to answer a specific question: compared to what? It helps define meaningful peer sets, normalize metrics, account for context, and explain whether observed performance is genuinely strong, weak, improving, or simply incomparable.

## Scope

Use this skill for:
- internal vs historical benchmark analysis
- competitor or peer comparison using defined metrics
- KPI target setting based on realistic benchmark bands
- maturity or capability benchmarking across teams or organizations
- cost, efficiency, quality, or throughput comparisons
- benchmark methodology design and critique
- identifying misleading comparisons and invalid peer sets
- summarizing where performance gaps matter operationally

## Do not use this skill for

Do not use this skill for:
- dashboard building with no comparative interpretation
- causal inference or experiment design to explain *why* a change happened
- open-ended market landscaping without benchmark metrics
- financial valuation work that requires investment-analysis framing
- decision-making based on anecdotal competitor claims alone

## Inputs to gather

Before benchmarking, identify:
- the entity being benchmarked: product, team, process, vendor, market participant, region, site
- the decision the benchmark should support
- the metric definitions and formulas
- the benchmark set: historical baseline, peer cohort, industry standard, best-in-class, SLA, target range
- scale/context variables that affect comparability
- time windows and seasonality effects
- data quality, coverage gaps, and survivorship bias risks
- whether absolute performance or improvement velocity matters more

If the metrics are not normalized, say so. Bad benchmarking is often just bad metric design wearing a comparison badge.

## Output expectations

Return outputs such as:
- benchmarking memo
- peer-set design and rationale
- normalized comparison table
- gap analysis
- target-range recommendation
- benchmark critique explaining why current comparison is invalid
- prioritized recommendations based on relative position

## Working method

### 1. Start with the decision, not the table

Benchmarking is only useful if it informs a real choice.
Clarify whether the goal is to:
- set targets
- diagnose underperformance
- justify investment
- monitor competitive position
- choose vendors or processes
- evaluate operational maturity

A benchmark built without a decision context becomes decorative reporting.

### 2. Define comparable units

Choose a fair unit of comparison.
Examples:
- cost per transaction, not total spend
- incidents per 1,000 deployments, not raw incident count
- conversion by traffic source, not blended conversion alone
- output per FTE, not total output

The comparison unit matters more than the chart style.

### 3. Build the right benchmark set

A useful peer set should be:
- relevant
- recent enough
- similar on key constraints
- large enough to avoid one-off distortion
- transparent about what is excluded

If no good peer set exists, use historical or internal benchmarks and state the limitation plainly.

### 4. Normalize before interpreting

Control for factors such as:
- company size
- geography
- mix of customer types
- channel composition
- product maturity stage
- seasonality
- volume effects
- service scope differences

Relative comparisons without context create false urgency or false confidence.

### 5. Separate gap size from actionability

Not every gap matters equally.
Prioritize based on:
- business impact
- controllability
- confidence in the data
- cost of improvement
- time to close the gap

The goal is not to rank everything. The goal is to identify what deserves action.

### 6. Explain the benchmark honestly

State clearly:
- what the benchmark can support
- what it cannot prove
- whether differences are material or noisy
- where definitions differ across sources
- which metrics are directional vs decision-grade

Benchmarking loses trust when it overclaims precision.

## Heuristics

Prefer:
- normalized metrics over totals
- peer sets explained by method, not asserted by vibe
- percentile or range framing when exact comparisons are unstable
- context notes beside every major comparison
- recommendations linked to benchmark gaps that matter

Avoid:
- cherry-picked peers
- comparing unlike cohorts because the data is easy to access
- mixing time periods or definitions silently
- treating external benchmarks as objective truth when methodology is weak
- recommending target numbers with no feasibility logic

## Review lenses

When evaluating benchmark work, check:
- Are the comparison units fair?
- Is the peer set defensible?
- Were normalization factors handled or at least acknowledged?
- Are gaps interpreted with confidence levels and caveats?
- Does the output identify what actions follow from the benchmark?
- Is any benchmark claim stronger than the data supports?

## Adjacent skill boundaries

- **bi-analyst / data-analyst**: build reporting and analysis pipelines, not necessarily benchmark logic
- **competitive-analyst / market-researcher**: gather market context and competitor intelligence
- **financial-analyst / unit-economics-analyst**: own finance-specific comparison frameworks
- **experiment-designer**: determines causal tests rather than relative benchmarking alone

## Quality bar

A strong result should:
- define a defensible benchmark frame
- normalize comparisons in a way that reduces distortion
- explain where performance truly leads or lags
- distinguish decision-grade findings from directional signals
- recommend actions tied to the most meaningful gaps

## References to use

Use `prompt.md` for analysis stance.
Use `examples/README.md` for output shapes.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for metadata and adjacent boundaries.
