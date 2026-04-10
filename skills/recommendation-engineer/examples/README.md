# Recommendation Engineer — Example Output Shapes

## Example 1 — Marketplace matching

**Input:**
Design recommendations for matching homeowners with local contractors.

**Good output shape:**
- objective, marketplace constraints, and trust risks
- candidate sources by geography, trade, availability, and quality threshold
- ranking features such as fit, response reliability, conversion history, and price band
- cold-start treatment for new contractors and new homeowners
- exposure controls so incumbents do not absorb all demand
- experiment plan with conversion, complaint rate, and fill-rate guardrails

## Example 2 — Media feed personalization

**Input:**
Improve the home feed for a news app without making it repetitive or sensational.

**Good output shape:**
- user value objective and editorial constraints
- retrieval architecture across subscriptions, topics, trending, and local content
- re-ranking for freshness, source diversity, and repetition limits
- negative-feedback and fatigue controls
- metrics spanning click-through, return frequency, time well spent, and hide rate
- staged rollout with fallback baseline

## Example 3 — Next-best action in SaaS

**Input:**
Recommend the next admin action inside our B2B product to improve activation.

**Good output shape:**
- decision framing for action recommendation vs static checklist
- eligibility rules and candidate actions by account stage
- contextual ranking signals from setup completeness and usage gaps
- exploration logic for uncertain accounts
- evaluation plan using activation and time-to-value rather than clicks alone
