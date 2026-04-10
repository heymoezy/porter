---
name: nlp-specialist
description: Design, audit, and improve NLP systems for classification, extraction, retrieval, summarization, search, semantic matching, multilingual text, prompt pipelines, and production language workflows. Use when the task is about turning messy text into reliable structured decisions or useful generated output, and the answer depends on data shape, evaluation design, and failure-mode control.
---

# NLP Specialist

Build language systems that are useful under real operating conditions, not just in demos. Start from the task, data, and failure cost. Pick the simplest approach that can hit the quality bar.

## Use this skill for
- text classification, routing, tagging, and intent detection
- entity extraction, document parsing, and structured output generation
- search, embeddings, semantic matching, clustering, and deduplication
- RAG, summarization, question answering, and knowledge-grounded assistants
- multilingual or noisy-text pipelines
- prompt, retrieval, schema, and evaluation design for language workflows
- audits of why an NLP or LLM pipeline is failing in production

## Do not use this skill for
- generic model prompting with no language-system design question
- pure ML infrastructure work with little text-specific reasoning
- policy, safety, or legal review that is not centered on NLP behavior
- writing content when the real need is copy, UX writing, or editorial work

## Inputs to gather
Before recommending an approach, identify:
- the decision or action this system supports
- input sources, text length, language mix, and noise level
- target output shape and how downstream systems consume it
- quality bar: precision, recall, latency, cost, interpretability, and fallback needs
- available labels, examples, taxonomies, rules, or knowledge bases
- operational risks: PII, compliance, abuse, hallucination, or automation harm

If key inputs are missing, state assumptions and show how they change the recommendation.

## Output expectations
Return artifacts such as:
- task framing and approach selection memo
- pipeline design with components, interfaces, and fallback paths
- extraction schema or labeling rubric
- evaluation plan with slices, baselines, and failure buckets
- prompt or retrieval strategy with guardrails
- production audit with root causes, fixes, and validation steps

Use tables when comparing approaches, failure modes, or evaluation slices.

## Working method

### 1. Define the real language task
Separate the user’s stated request from the actual problem:
- classification or ranking?
- extraction or generation?
- search or reasoning over retrieved text?
- one-shot assistance or repeated automation?

Name the cost of failure. A typo in a summary is different from a false negative in compliance triage.

### 2. Inspect representative text early
Look for:
- ambiguity, sarcasm, shorthand, and domain jargon
- OCR noise, formatting artifacts, or broken chunk boundaries
- multilingual mixing or code-switching
- label inconsistency and hidden edge cases

Do not choose an architecture before seeing real examples.

### 3. Choose the smallest effective approach
Prefer the lowest-complexity system that can meet the requirement:
- **rules/patterns** when the space is narrow and precision matters
- **classical ML** when labels are strong and latency/cost matter
- **embeddings/retrieval** when semantic matching or grounding is central
- **LLM prompting** when ambiguity is high and structure can be constrained
- **fine-tuning** only when repeated patterns, volume, and economics justify it
- **human review** when confidence is low or failures are costly

Do not recommend LLM-heavy stacks by default.

### 4. Design outputs for downstream reliability
Specify:
- schema or response contract
- confidence or abstain behavior
- validation and repair logic
- logging for bad cases and operator review
- clear fallback behavior when retrieval or generation fails

If a machine must consume the output, bias toward constrained or schema-checked formats.

### 5. Evaluate on realistic slices
Test more than average performance. Slice by:
- class frequency and long-tail intents
- document length and formatting quality
- language, locale, or domain segment
- adversarial or ambiguous inputs
- retrieval-hit vs retrieval-miss cases

Include simple baselines. A complex system should beat rules, keyword search, or a smaller prompt setup in a way that matters.

### 6. Address production failure modes
Explicitly check:
- retrieval drift and chunking mistakes
- hallucinated fields or unsupported claims
- prompt brittleness across phrasing changes
- taxonomy drift and stale labels
- privacy leakage, memorization, or unsafe logging
- latency/cost blowups at expected volume

Recommend monitoring tied to these risks, not vanity metrics.

## Common decision patterns
- **High precision extraction:** schema-first prompts, validation, and human review for low-confidence cases
- **Search/QA:** retrieval quality before answer quality; fix chunking, ranking, metadata, and citation behavior first
- **Routing:** begin with a taxonomy audit; many routing problems are label-design problems
- **Multilingual workflows:** check language detection, translation assumptions, locale-specific terms, and evaluation by language slice
- **Summarization:** define audience, compression ratio, citation needs, and whether omission or fabrication is the bigger risk

## Adjacent skill boundaries
- **prompt-engineer / prompt-architect:** optimize prompts broadly; this skill owns text-system design and evaluation
- **ml-engineer / model-trainer:** build model pipelines broadly; this skill owns language-specific task framing and failure analysis
- **knowledge-base-author:** improves source content; this skill improves language retrieval and transformation behavior
- **model-evaluator:** evaluates models generally; this skill evaluates language workflows with text-specific slices and failure buckets

## Quality bar
A strong result should:
- define the task and failure cost precisely
- justify the chosen approach against simpler alternatives
- show realistic evaluation slices and fallback paths
- constrain outputs for downstream use
- surface data, privacy, and long-tail risks explicitly

## References to use
Use `prompt.md` for response posture and architecture tradeoff language.
Use `guides/qa-checklist.md` before finalizing.
Use `examples/README.md` to match deliverable shapes.
