# NLP Specialist — Example Output Shapes

Use these as patterns for language-system analysis and design.

## Example 1 — Extraction pipeline recommendation

**Input:**
We need to extract renewal dates, counterparties, and termination clauses from vendor contracts. Accuracy matters because operations will act on the results.

**Good output shape:**
| Decision area | Recommendation |
|---|---|
| Task type | structured extraction from long legal text |
| Best-first approach | schema-constrained LLM extraction with section-aware chunking |
| Why not rules only | clause language varies too widely |
| Why not fine-tuning yet | not enough validated examples; start with prompt + validation |
| Fallback | human review on low-confidence or validation-failed records |

Then add:
- extraction schema
- validation rules
- likely failure modes
- evaluation slices and acceptance thresholds

## Example 2 — RAG failure audit

**Input:**
Our support bot answers confidently but often cites the wrong article.

**Good output shape:**
- Primary diagnosis: retrieval quality problem before answer-quality problem
- Likely causes:
  1. chunk boundaries split procedures
  2. metadata filters are weak
  3. ranking favors lexical overlap over article authority
- Fix plan:
  - redesign chunking around procedural sections
  - add source freshness and product/version metadata
  - require citation-backed answers or abstain
- Validation:
  - retrieval hit rate@k
  - grounded-answer rate
  - unsupported-claim rate

## Example 3 — Intent routing design

**Input:**
Design a multilingual ticket-routing system for finance, billing, technical support, and fraud review.

**Good output shape:**
| Component | Choice | Reason |
|---|---|---|
| Taxonomy | 4 primary queues + escalation tag set | routing decisions stay operationally useful |
| First-pass model | compact classifier | low latency, stable categories |
| Fallback | embedding similarity + review queue | handles rare/novel phrasing |
| Review trigger | confidence band + fraud keywords | high-cost misses get human eyes |

Then add:
- label guidelines
- language-slice evaluation
- confusion pairs to watch
- rollout plan with monitoring

## Example 4 — Summarization specification

**Input:**
Help us summarize medical policy updates for internal analysts.

**Good output shape:**
- Audience: internal policy analysts, not the public
- Summary contract:
  - policy changed
  - who is affected
  - effective date
  - operational action needed
  - direct citations to source text
- Main risk: omission of critical condition changes is worse than verbosity
- Recommendation:
  - extract structured deltas first
  - generate narrative summary second
  - require citation coverage for every policy change claim
