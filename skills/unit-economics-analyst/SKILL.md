---
name: unit-economics-analyst
description: Model customer, order, seat, cohort, or transaction economics to show whether growth is efficient and where margin is won or lost. Use when Porter needs CAC, payback, contribution margin, LTV, retention economics, pricing diagnostics, channel efficiency analysis, marketplace unit economics, or board-ready efficiency insight. Do not use for full corporate finance, accounting compliance, or high-level strategy work that does not depend on unit-level economics.
---

# unit-economics-analyst

Find the real economics under the growth story.

This skill owns unit-economics judgment: defining the right unit of analysis, separating variable from fixed cost, measuring acquisition efficiency, tying retention to lifetime value, and translating all of that into decisions on pricing, channels, product, and spend. Use it when growth metrics alone are not enough.

## Scope

Use this skill for:
- CAC, LTV, CAC payback, and contribution margin analysis
- SaaS, subscription, marketplace, ecommerce, fintech, and transaction-model unit economics
- retention, churn, and expansion economics
- channel efficiency comparisons
- pricing and discounting diagnostics
- cohort-based efficiency analysis
- investor, board, or operator summaries of efficiency health
- scenario models for improving margin, payback, or retention

## Do not use this skill for

Do not use this skill for:
- bookkeeping, GAAP/IFRS accounting treatment, or compliance reporting; use **financial-analyst** or a finance/accounting specialist
- full three-statement corporate modeling when unit economics are only one input
- high-level market strategy with no operating-metric model underneath; use **strategic-planner** or **pricing-strategist**
- pure sales-ops reporting without margin or retention economics; use **business-analyst** or **revenue-optimizer** as appropriate

## Routing rules

Route to **unit-economics-analyst** when the main difficulty is deciding:
- whether a customer, order, or cohort is actually profitable
- how long it takes to recover acquisition spend
- whether retention and expansion support healthy lifetime value
- which channels or segments deserve more or less investment
- how pricing, gross margin, churn, or support cost changes affect efficiency

Do **not** route here just because the task mentions revenue or growth.
If the question does not depend on unit-level margin, acquisition, and retention logic, another finance or strategy skill is likely a better fit.

## Inputs to gather

Before modeling, identify:
- business model: SaaS, marketplace, ecommerce, transactional, usage-based, etc.
- unit of analysis: customer, account, seat, order, cohort, merchant, rider, listing, etc.
- revenue definition: gross, net, recurring, one-time, blended, recognized, cash
- variable costs: COGS, payment fees, fulfillment, hosting, support, incentives, partner rev share
- acquisition costs by channel and whether sales/marketing overhead is included
- retention, churn, repeat purchase, or cohort behavior
- expansion, upsell, downgrade, or frequency dynamics
- time horizon, seasonality, and any one-off distortions

If key assumptions are missing, say the analysis is directional rather than decision-grade.

## Output expectations

Return outputs such as:
- unit economics model with formulas and assumptions
- red-flag memo on what is healthy vs broken
- channel or segment efficiency comparison
- pricing and retention sensitivity analysis
- board-ready summary of CAC, payback, gross margin, contribution margin, and LTV logic

Prefer explicit formulas and decision implications over metric name-dropping.

## Working method

### 1. Choose the right unit
Pick the economic unit that matches the decision.
A marketplace may need both sides analyzed separately.
A SaaS business may need account-level and seat-level views.

### 2. Separate variable from fixed cost
Do not bury economics under blended overhead.
State clearly what is included in:
- gross margin
- contribution margin
- CAC
- support or service burden

### 3. Model acquisition and recovery
Calculate:
- CAC by channel or segment
- contribution margin per period or per transaction
- payback period
- payback sensitivity under changed pricing, churn, or margin

### 4. Model retention and lifetime value carefully
Use retention logic that matches the business model.
Be explicit about:
- logo churn vs revenue churn
- repeat purchase frequency
- expansion or contraction
- cohort maturity and survivorship bias

### 5. Stress-test the result
Check for common traps:
- annualizing immature cohorts
- mixing gross revenue with net margin conclusions
- hiding discounts or incentives
- blending high-quality and low-quality channels
- treating fully loaded overhead as variable cost without saying so

### 6. Translate metrics into action
End with what to do:
- raise or reframe pricing
- cut weak channels
- improve retention before scaling spend
- reduce service burden or COGS
- segment customers differently

## Heuristics

Prefer:
- contribution economics over vanity growth metrics
- channel and segment disaggregation
- cohort-based retention views when available
- formulas that can be audited quickly
- scenario ranges when assumptions are weak
- recommendations tied to real operating levers

Avoid:
- quoting LTV without explaining the model
- mixing gross margin and contribution margin casually
- using blended CAC to justify scaling a broken channel mix
- presenting precision that the data quality does not support
- ignoring support, servicing, or incentive costs in “profitable” units

## Adjacent skill boundaries

- **financial-analyst** owns broader finance analysis beyond unit-level efficiency
- **pricing-strategist** owns pricing design choices beyond the economics model itself
- **revenue-optimizer** may own GTM and monetization actions after the economics are diagnosed
- **business-analyst** may own reporting and KPI synthesis without deep unit modeling
- **strategic-planner** owns wider strategic direction when unit economics are only one input

## Quick routing examples

Use **unit-economics-analyst** for:
- calculating whether a SaaS product can profitably scale paid acquisition
- comparing marketplace cohorts to see whether subsidy-heavy growth is rational
- diagnosing whether discounts improve growth but destroy contribution margin
- modeling how churn reduction changes payback and LTV:CAC

Do **not** use **unit-economics-analyst** for:
- preparing audited financial statements
- building a full company valuation model with many non-operating assumptions
- writing a generic strategy memo with no economics model underneath

## Quality bar

A strong result should:
- define the economic unit and formula logic clearly
- separate acquisition, margin, retention, and overhead assumptions cleanly
- expose the biggest drivers of efficiency or inefficiency
- acknowledge data limits and sensitivity clearly
- end with operating decisions, not just metrics

## Use with

- `prompt.md` for execution posture and response style
- `examples/README.md` for representative requests and output shape
- `guides/qa-checklist.md` for final review standards
- `meta/skill.json` for machine-readable metadata
