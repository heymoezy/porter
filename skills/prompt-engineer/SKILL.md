---
name: prompt-engineer
description: Design prompts, prompt chains, prompt libraries, and evaluation-oriented prompt patterns for LLM products and internal workflows. Use when work involves system prompts, retrieval instructions, tool-use contracts, structured output schemas, chaining decisions, prompt test cases, or reliability improvement across repeated model-driven tasks. Do not use for one-off prompt cleanup, generic writing, or model failures caused mainly by missing data, bad tools, or broken product flow.
---

# Prompt Engineer

Design prompt systems that hold up under repeated use.

## Use this skill to
- design prompt sets for real product workflows
- choose between single prompts, staged chains, routers, and evaluator loops
- define output contracts and schema-oriented instructions
- improve reliability, controllability, and grounding
- create test cases and iteration plans for prompt behavior

## Do not use this skill to
- merely rewrite a messy prompt for one task
- treat prompting as a substitute for fixing retrieval, tool access, or source-data problems
- optimize only for one lucky demo run
- produce generic “be an expert” language with no behavioral design

## Gather first
- user job and business outcome
- target model or model family and available tools
- context-window limits, latency budget, and cost sensitivity
- source inputs, retrieval path, and schema needs
- failure examples, edge cases, and refusal risks
- success metrics: accuracy, format fidelity, coverage, safety, escalation behavior

## Deliverables that fit this skill
- prompt strategy memo
- system prompt / task prompt set
- chain or router design
- structured output contract
- adversarial and regression test suite
- iteration hypotheses and measurement plan

## Working method

### 1. Model the task before writing prompts
Define:
- actor
- inputs
- transformations or reasoning required
- outputs
- failure modes
- non-prompt dependencies

If the task model is fuzzy, prompt optimization becomes superstition.

### 2. Decide whether prompting is actually the lever
Ask what is causing the failure:
- unclear instructions
- missing context
- poor retrieval
- tool mismatch
- weak post-processing
- unsupported product expectations

Only use prompt complexity where it can change behavior.

### 3. Choose the right control surface
Select the lightest design that matches the workflow:
- single prompt for simple atomic tasks
- staged prompts when decomposition improves reliability
- router prompts when tasks vary materially
- evaluator / critic passes when verification matters more than first-pass elegance
- schema or constrained output when integration reliability is critical

### 4. Design instructions as contracts
Make the model’s job concrete:
- what to do
- what not to do
- what inputs can be trusted
- how to handle uncertainty
- exact output structure
- when to abstain, escalate, or request missing fields

Use delimiters, tags, or sectioning when structure reduces ambiguity.

### 5. Spend tokens intentionally
Examples, reasoning scaffolds, and policy text should earn their cost. Follow a practical order:
1. clear zero-shot prompt
2. few-shot examples if behavior is still unstable
3. chain, tools, or evaluators if the task still breaks

Do not overengineer a trivial prompt.

### 6. Test against the ugly cases
Evaluate on:
- messy real inputs
- conflicting instructions
- partial context
- edge-case schema values
- refusal / safety boundaries
- repeated-run consistency

A prompt that works only on clean examples is not ready.

### 7. Return an iteration path, not just a draft
Explain:
- what the prompt is trying to control
- where it will still fail
- what to test next
- what should be fixed outside the prompt layer

## Adjacent skill boundaries
- **prompt-architect**: rewrites a prompt or brief into a sharper single instruction package; this skill designs prompt systems and reliability strategy
- **quality-reviewer**: judges output quality after execution; this skill defines the prompt and test structure before or during iteration
- **runtime-selector**: chooses models or runtimes; this skill designs the prompt behavior once the operating environment is known
- **recommendation-engineer**: focuses on ranking and retrieval/product logic; this skill focuses on model instruction behavior

## Quality bar
A strong result should:
- tie prompt choices to actual failure modes
- use the minimum complexity needed for reliability
- define clear output contracts and uncertainty behavior
- include concrete tests, not just prompt text
- distinguish prompt fixes from product, retrieval, and tooling fixes

## Files to use
- Read `prompt.md` for operating posture and response pattern.
- Read `examples/README.md` for output shapes.
- Read `guides/qa-checklist.md` before finalizing.
- Read `meta/skill.json` for metadata, aliases, and boundaries.
