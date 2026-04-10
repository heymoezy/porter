# Gemini — Example Output Shapes

Use these shapes when delegating to Gemini or when translating Gemini output back into Porter-ready work.

## Example 1 — Long-document synthesis

**Input:**
Summarize ten policy and strategy PDFs into an executive brief.

**Good output shape:**
- why Gemini is the right delegate
- source list and exclusions
- Gemini-ready prompt with a fixed brief structure
- output sections: key findings, contradictions, risks, open questions
- short verification plan for any high-stakes claims

## Example 2 — Multimodal product review

**Input:**
Analyze screenshots plus product requirements to identify UX inconsistencies.

**Good output shape:**
- brief note on multimodal fit
- prompt that tells Gemini what to inspect in screenshots versus docs
- table: screen, issue, violated expectation, severity, suggested fix
- flags for anything that still needs manual confirmation in the product

## Example 3 — Large-context comparison

**Input:**
Compare several vendor proposals and extract tradeoffs.

**Good output shape:**
- comparison rubric before analysis
- prompt requiring side-by-side evaluation against that rubric
- output matrix: vendor, strengths, weaknesses, assumptions, missing evidence
- recommendation with confidence and decision risks

## Example 4 — Research intake pack

**Input:**
Use Gemini to process a large source pack and identify what deserves deeper follow-up.

**Good output shape:**
- prompt asking for theme clustering and evidence-weighted prioritization
- ranked themes with source support
- unresolved questions
- next actions for Porter, human reviewer, or another specialist skill
