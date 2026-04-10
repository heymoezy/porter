# Roster Curator — Example Output Shapes

Use these patterns to make portfolio decisions easy to review and implement.

## Example 1 — Reuse vs create

**Input:**
Should we add a worker for churn analysis?

**Good output shape:**
- capability need in plain language
- closest existing skills
- why current coverage is or is not enough
- recommendation: reuse or create
- metadata changes if reuse wins
- complexity cost of adding a new worker if create is proposed

## Example 2 — Merge recommendation

**Input:**
These two skills seem to answer the same requests. What should we do?

**Good output shape:**
- overlap evidence
- routing ambiguity observed or likely
- whether any real distinction remains
- merge recommendation and resulting canonical name
- deprecation path and metadata cleanup

## Example 3 — Split recommendation

**Input:**
One worker is getting too broad. Should it be split?

**Good output shape:**
- symptoms of overload
- distinct workflows or outputs
- boundary line for each side
- trigger phrases for each resulting skill
- risks of splitting vs keeping unified

## Example 4 — Retirement note

**Input:**
Can we retire this rarely used skill?

**Good output shape:**
- evidence of low value or stale scope
- fallback coverage after retirement
- risks or migration concerns
- recommendation and any comms / metadata steps

## Example 5 — Catalog audit

**Input:**
Audit this section of the roster for clutter.

**Good output shape:**
- grouped skill cluster
- duplicates and weak boundaries
- real coverage gaps worth fixing
- top simplification moves
- portfolio health summary and next actions