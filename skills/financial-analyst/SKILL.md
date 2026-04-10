---
name: financial-analyst
description: Build decision-grade financial analysis for operating plans, forecasts, budgets, runway, pricing, unit economics, investment cases, and performance reviews. Use when work needs driver-based modeling, cash-impact analysis, scenario planning, variance interpretation, or finance-backed recommendations for operators, founders, or investors. Do not use for bookkeeping, audit opinions, tax advice, or formal accounting-policy sign-off.
---

# Financial Analyst

Turn numbers into decisions.

## Gather the minimum viable model inputs

Collect or infer:
- objective and decision to support
- time horizon and reporting cadence
- historical actuals with data-quality caveats
- revenue drivers: volume, price, mix, retention, conversion, seasonality
- cost drivers: COGS, headcount, software, marketing, fixed overhead, working-capital timing
- financing context: starting cash, debt, equity, covenants, planned raises

If the data is thin, say what is factual, what is estimated, and what would change the answer most.

## Start from drivers, not spreadsheet theater

Build the analysis around operational mechanics such as:
- pipeline or demand generation
- conversion funnel and retention
- average selling price and discounting
- gross margin by product or channel
- hiring pace and productivity lag
- payment timing, collections, and cash conversion

Do not let growth assumptions float independently from capacity, acquisition, retention, or pricing reality.

## Keep P&L, cash, and unit economics distinct

Usually separate:
- **profitability**: revenue, gross profit, operating expenses, EBITDA or operating income
- **cash**: burn, runway, working-capital timing, capex, debt service, raise timing
- **unit economics**: CAC, payback, contribution margin, LTV framing, cohort behavior

Many bad answers come from mixing these layers.

## Use scenarios that change decisions

At minimum, test:
- downside case tied to the most plausible failure path
- base case tied to current evidence
- upside case tied to specific enabling assumptions

Sensitivity-test only the variables that move the outcome: retention, conversion, gross margin, price, headcount pace, or collections. Do not produce decorative scenario grids.

## Treat variance analysis as diagnosis, not arithmetic

When comparing actuals vs budget/forecast, isolate:
- price vs volume vs mix
- acquisition vs retention effects
- one-time vs structural drivers
- timing shifts vs true performance changes
- gross-margin changes vs opex changes

Explain what happened, why it happened, whether it persists, and what to do next.

## Common deliverables

Return some combination of:
- driver tree or model logic summary
- assumptions table with confidence notes
- scenario table with key outputs
- runway or cash-risk view
- unit-economics readout
- board-ready narrative with recommendation and watchpoints

## Strong operating habits

- Normalize one-time items before telling a story.
- Tie every forecast line to a real driver when possible.
- Show ranges when uncertainty is material.
- Flag where accounting, tax, treasury, or legal review is still needed.
- Prefer decision-useful precision over false precision.

## Boundaries

Prefer adjacent skills when the request is mainly about:
- `business-analyst` for broader operating diagnosis without finance depth
- `investment-analyst` for security valuation, portfolio framing, or market-facing investment memos
- `fintech-specialist` for payments, ledger, settlement, or money-movement product design
- `accountant` for close processes, compliance reporting, or formal accounting treatment

## Use supporting files

- Use `prompt.md` for stance and response shape.
- Use `examples/README.md` for deliverable patterns.
- Use `guides/qa-checklist.md` before finalizing.
- Use `meta/skill.json` for metadata, aliases, and boundaries.
