---
name: web-search
description: Research the live web for current facts, official documentation, recent announcements, source verification, market context, and evidence-backed answers. Use when the task depends on up-to-date public information, primary-source discovery, citation support, competitor checking, or verifying whether a claim is true, outdated, disputed, or unsupported. Do not use for purely internal-file analysis, fabricated citations, stale memory-only answers, or shallow link dumps with no synthesis.
---

# Web Search

Search for evidence, not just links. The goal is a trustworthy answer with explicit source quality and honest uncertainty.

## Focus

Use this skill to:
- answer freshness-sensitive questions
- verify claims against public sources
- find official documentation, filings, release notes, standards, or announcements
- assemble short research memos or comparison tables
- identify the strongest sources on a topic
- distinguish confirmed facts from rumor, vendor spin, or recycled summaries

## Do not use this skill for

- questions answerable from local files or stable internal knowledge alone
- invented citations, invented URLs, or vague “sources say” phrasing
- treating a single weak source as proof for a contested claim
- massive scraping projects better handled by a structured API or dedicated pipeline
- dumping search results without ranking, synthesis, or caveats

## Inputs to gather

Clarify these before searching:
- exact question, claim, or decision to support
- freshness requirement: today, this week, this quarter, evergreen, historical
- output type: direct answer, memo, comparison table, reading list, citation packet
- preferred source classes: official docs, regulators, filings, academic papers, press, community
- acceptable confidence threshold and time budget
- whether the user needs source links, a recommendation, or both

## Output expectations

Return artifacts such as:
- concise answer backed by named sources
- claim-verification summary with confidence level
- comparison table with direct source links
- source-ranked memo showing strongest evidence first
- explicit list of what is known, likely, disputed, and still unknown

## Working method

### 1. Frame the research question precisely

Break the task into answerable parts:
- what must be true to answer the question?
- what time window matters?
- which source types are authoritative here?
- what entities, aliases, versions, or dates should be searched explicitly?

Good query design reduces bad evidence.

### 2. Prefer primary sources, then corroborate

Default source order:
1. official documentation, release notes, standards, regulator pages, filings
2. direct company announcements or maintained product pages
3. reputable reporting or analyst interpretation
4. community discussion for leads only

For contested, recent, or high-stakes claims, use more than one independent source.

### 3. Evaluate every source, including primary ones

Check:
- authority: who published it?
- currency: when was it published or updated?
- relevance: does it answer the exact question?
- incentives: is it selling, defending, reporting, or documenting?
- evidence quality: does it provide underlying data, wording, or direct confirmation?

A primary source can still be incomplete, biased, or ambiguous.

### 4. Search laterally, not just deeper

Do not read one page in isolation and stop. Also search for:
- contradictions
- rollout caveats
- archived or earlier versions when history matters
- plan / region / availability limitations
- independent confirmation for important claims

When a claim sounds perfect, look harder.

### 5. Synthesize into decision-useful findings

Separate output into:
- confirmed facts
- likely interpretation
- uncertainty or conflicts
- strongest sources and why they matter
- recommended next step if evidence is still weak

The reader should not have to infer what matters from a pile of links.

### 6. Cite cleanly and minimally

For each important claim, give enough detail to verify fast:
- source name
- page or document title
- direct link
- date context when material

Attach citations to claims that matter, not to every trivial sentence.

## Quality bar

A strong result should:
- answer the actual question quickly
- use the most authoritative and recent sources available
- distinguish fact, inference, and speculation
- surface disagreement or unknowns instead of flattening them
- leave the user with fewer open loops, not more

## References

- Use `prompt.md` for research posture and answer structure.
- Use `examples/README.md` for practical output shapes.
- Use `guides/qa-checklist.md` before finalizing.
- Use `meta/skill.json` for aliases, boundaries, and adjacent skills.
