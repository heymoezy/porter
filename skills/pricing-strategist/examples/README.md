# Pricing Strategist — Example Output Shapes

Use these patterns to keep pricing advice commercially usable.

## Example 1 — SaaS packaging redesign

**Input:**
Redesign our three-tier SaaS pricing because conversion is good but expansion is weak.

**Good output shape:**
- Problem summary
- Segment view:
  - who buys self-serve
  - who needs sales help
  - who outgrows the current plan model
- Recommended packaging:
  - Starter
  - Growth
  - Enterprise
- Value metric choice and why
- Risks:
  - cannibalization
  - migration friction
  - support burden
- Test / rollout plan

## Example 2 — Usage-based pricing recommendation

**Input:**
Should we price by seats, API calls, or data volume?

**Good output shape:**
| Option | Aligns with customer value? | Easy to explain? | Margin-safe? | Main risk |
|---|---|---|---|---|
| Seats | medium | high | high | weak expansion fit |
| API calls | high | medium | high | unpredictability for buyers |
| Data volume | low-medium | medium | medium | cost mismatch for some segments |

Then add:
- recommended metric
- cases where a hybrid model is better
- billing and comms implications

## Example 3 — Discount guardrails

**Input:**
We need discount rules for enterprise deals.

**Good output shape:**
- standard discount bands by contract size / term / strategic value
- approval thresholds
- non-price concessions to use before discounting
- red flags that should block aggressive discounting
- renewal protections and floor logic

## Example 4 — Price increase memo

**Input:**
Evaluate a planned 15% price increase.

**Good output shape:**
- objective and assumptions
- accounts or segments most at risk
- likely churn / expansion / margin effects
- mitigation options:
  - grandfathering
  - phased rollout
  - added value messaging
- success metrics and rollback triggers
