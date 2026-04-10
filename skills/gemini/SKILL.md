---
name: gemini
description: Delegate work to Gemini when the task benefits from very large context windows, multimodal input handling, broad source synthesis, or Google-native reasoning strengths. Use for deep research, document-heavy review, long-context comparison, screenshot-or-image-informed analysis, and high-volume evidence digestion. Do not use for routine local edits, simple direct answers, or tasks that require tool access Gemini will not actually have in the chosen workflow.
---

# Gemini

Use Gemini as a specialist delegate, not as an excuse to stop thinking.

## Scope

Use this skill when the main advantage is one or more of these:
- long-context reading across many documents
- multimodal review of text plus images, screenshots, PDFs, audio, or video-derived material
- synthesis across large evidence sets
- extraction, comparison, clustering, or summarization from heavy source packs
- generating a first-pass research brief that will still be checked and shaped before use

Official Gemini documentation emphasizes long-context and multimodal reasoning. That should drive the routing decision, not brand preference.

## Do not use this skill for

Do not use this skill for:
- straightforward answers that can be produced directly with current context
- local repo implementation work or file edits better handled in Porter
- requests where evidence is thin and delegation would only add polished speculation
- tasks that depend on specific external tools, permissions, or environment access Gemini will not have
- situations where the real need is a domain specialist rather than a long-context delegate

## Inputs to gather

Before delegating, pin down:
- the exact question or decision to support
- which materials Gemini should read and which it should ignore
- output shape: memo, table, brief, rubric, comparison matrix, extraction list, draft, or Q&A
- evidence standard: cite only provided material, use outside knowledge carefully, or confine to source pack
- important exclusions, red lines, and definitions
- whether images, screenshots, PDFs, or other multimodal inputs matter
- what must be verified locally after Gemini responds

## Output expectations

Return outputs such as:
- a Gemini-ready prompt package
- a structured source map or reading plan
- a decision-ready synthesis grounded in supplied evidence
- extracted claims, themes, contradictions, or open questions
- explicit confidence notes, caveats, and verification needs
- recommended next actions for Porter or a human reviewer

## Working method

### 1. Confirm Gemini is the right delegate

Use Gemini because its fit is real: large context, multimodal review, or broad synthesis. If direct work is faster and safer, do it directly.

### 2. Curate the context pack

Do not dump everything. Provide:
- only relevant source material
- a clear task frame
- a fixed output schema
- definitions for ambiguous terms
- explicit exclusions to reduce drift

Messy context produces messy outputs.

### 3. Write a hard-to-misread delegation prompt

Specify:
- role and task
- audience
- source boundaries
- required structure
- evidence behavior
- how to handle uncertainty
- what not to do

Good Gemini work usually starts with a tight prompt, not a clever follow-up.

### 4. Force evidence discipline

Ask for:
- claim grouping by source or evidence type
- contradictions and gaps
- assumptions separated from findings
- low-confidence flags
- missing information needed to improve the answer

### 5. Review the output as draft material

Treat Gemini output as useful material, not automatically true. Check for:
- unsupported leaps
- invented certainty
- source confusion
- weak comparisons
- drift away from the actual question

### 6. Translate back into Porter-ready value

Do not hand off raw model prose if a sharper answer is possible. Convert the result into:
- a concise decision memo
- a table of findings
- an implementation brief
- a risk summary
- or a clear next-step package

## Heuristics

Prefer:
- smaller, well-labeled context packs over giant mixed dumps
- explicit schemas over open-ended “analyze this” prompts
- evidence-first synthesis over generic commentary
- concrete questions over broad fishing expeditions
- local verification when stakes are high

Avoid:
- delegating by reflex
- asking Gemini to do tool-dependent work it cannot do
- mixing instructions, source text, and commentary without labels
- forwarding unreviewed output as final truth
- pretending large context removes the need for judgment

## Adjacent skill boundaries

- **academic-researcher**: use when the main job is scholarly rigor, literature handling, and research interpretation
- **technical-writer**: use when the main job is final communication quality or docs production
- **coding-agent**: use when the main job is code implementation or repo mutation
- **model-evaluator**: use when the main job is testing model quality, comparing models, or designing evals

## Quality bar

A strong result should:
- justify why Gemini was the right delegate
- package context cleanly
- produce structured, evidence-aware output
- expose uncertainty instead of hiding it
- hand back something Porter can use immediately

## References to use

Use `prompt.md` for response structure and delegation stance.
Use `examples/README.md` for high-quality output patterns.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for metadata, aliases, and routing boundaries.
