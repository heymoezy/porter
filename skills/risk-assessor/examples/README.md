# Risk Assessor — Example Output Shapes

Use these patterns to keep outputs concrete, ranked, and usable in decision reviews.

## Example 1 — Launch risk review

**Input:**
Assess the main risks before we launch this feature.

**Good output shape:**
- launch assumptions and decision deadline
- top risks ranked by materiality
- current controls and weak spots
- pre-launch mitigations with owners
- signals that should trigger pause, rollback, or contingency use

## Example 2 — Vendor concentration risk

**Input:**
We rely heavily on one infrastructure provider. How risky is that?

**Good output shape:**
- dependency map
- failure scenarios and business impact
- existing resilience controls
- mitigation options and tradeoffs
- residual risk summary

## Example 3 — Strategic bet under uncertainty

**Input:**
Should we enter this market next quarter?

**Good output shape:**
- core assumptions and downside cases
- major risks by type
- mitigations or gating conditions
- no-go / pause triggers
- recommendation with explicit confidence

## Example 4 — Delivery risk memo

**Input:**
This project is slipping. Analyze the delivery risk.

**Good output shape:**
- root risk drivers
- likely schedule / quality / scope impact
- leading indicators of further slippage
- interventions ranked by urgency
- residual risk after intervention

## Example 5 — Risk register cleanup

**Input:**
Our register is bloated and useless. Fix it.

**Good output shape:**
- trivial or duplicate risks removed
- consolidated material risk statements
- updated owners and controls
- clearer escalation thresholds
- short summary of what leadership should watch most closely
