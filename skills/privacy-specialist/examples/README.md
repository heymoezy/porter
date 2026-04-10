# Privacy Specialist — Example Output Shapes

## Example 1 — Feature privacy review

**Input:**
Review our employee productivity dashboard for privacy risk.

**Good output shape:**
| Risk | Why it matters | Severity | Recommended control |
|---|---|---|---|
| Continuous activity capture exceeds stated purpose | creates surveillance and expectation mismatch | High | reduce scope, limit granularity, document purpose |
| Indefinite retention of behavioral logs | amplifies future misuse and breach exposure | High | set retention schedule with deletion enforcement |
| No clear employee notice or challenge path | weak transparency and fairness | Medium | add internal notice, FAQ, and escalation path |

Then add:
- affected data categories
- likely owners
- open legal-review questions

## Example 2 — Consent-flow critique

**Input:**
Assess whether our marketing signup flow is privacy-friendly.

**Good output shape:**
- data collected and why
- current consent pattern
- problems found:
  - bundled consent
  - unclear purpose wording
  - no easy withdrawal path
  - unnecessary optional fields at signup
- recommended changes by priority

## Example 3 — Vendor privacy diligence memo

**Input:**
What should we review before sending customer support transcripts to this AI vendor?

**Good output shape:**
- data categories involved
- vendor role and processing purpose
- retention/deletion questions
- subprocessor and transfer questions
- model-training / reuse questions
- go / hold / conditional-go recommendation

## Example 4 — Data minimization recommendation

**Input:**
Help us reduce unnecessary fields in onboarding.

**Good output shape:**
- keep now
- defer until later trigger
- remove entirely
- impact on conversion and ops
- implementation notes for product, CRM, and support
