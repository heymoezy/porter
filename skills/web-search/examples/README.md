# Web Search — Example Output Shapes

Use these as patterns for evidence-backed web research.

## Example 1 — Claim verification

**Input:**
Verify whether Product X launched SSO this quarter.

**Good output shape:**
- Verdict: confirmed / likely / not confirmed
- Strongest evidence:
  - official release note
  - docs page
  - announcement or changelog
- Caveats: rollout timing, plan gating, region limits, beta vs GA
- Confidence: high / medium / low

## Example 2 — Research memo

**Input:**
Find the best current sources on EU AI regulation updates.

**Good output shape:**
| Rank | Source | Type | Why it matters | Use for |
|---|---|---|---|---|
| 1 | official EU text | primary | binding wording | exact obligations |
| 2 | regulator guidance | primary | practical interpretation | implementation detail |
| 3 | reputable law-firm summary | secondary | operational framing | stakeholder briefing |

Then add:
- what changed recently
- what remains unclear
- recommended citations to use

## Example 3 — Competitor comparison

**Input:**
Compare pricing pages for the top hosted vector databases.

**Good output shape:**
- table with plan names, entry price, usage limits, enterprise gating, and links
- notes on ambiguity or missing information on vendor pages
- timestamp framing for when the comparison was checked
- confidence note if pricing appears dynamic or sales-led

## Example 4 — Current-events brief

**Input:**
Give me a quick brief on the latest browser antitrust headlines.

**Good output shape:**
- 3–5 bullet summary
- source grouping: regulators, companies, press
- explicit timeframe: “as of today” or “as of this week”
- unresolved developments still worth watching
