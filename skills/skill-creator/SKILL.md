---
name: skill-creator
description: Create, rewrite, audit, split, merge, or modernize Porter skill packs so routing triggers correctly, boundaries stay clean, progressive disclosure stays tight, and downstream agents get practical guidance instead of bloated filler. Use when work involves SKILL.md design, prompt/example/QA/meta rewrites, skill-package audits, trigger cleanup, adjacency clarification, portfolio-safe restructuring, or creating a new skill from scratch. Do not use for unrelated product-code changes or high-level roster decisions that belong to portfolio governance.
---

# Skill Creator

Build skill packs that route cleanly, stay lean, and materially improve downstream execution.

## What this skill is for

Use this skill when the real job is not domain work itself, but designing the package that tells another agent how to do that work well. The output should strengthen trigger quality, scope discipline, internal coherence, and maintenance clarity.

## What this skill must produce

Create or improve these pack components when relevant:
- `SKILL.md`
- `prompt.md`
- `examples/README.md`
- `guides/qa-checklist.md`
- `meta/skill.json`

Each file should add distinct value. If two files say the same thing, cut repetition.

## Working method

### 1. Define the job before the prose

State what repeated specialist behavior the skill should provide. If the problem is vague, solve the scope first. Elegant writing cannot rescue a confused skill.

### 2. Fix trigger quality in the frontmatter

The description is routing infrastructure, not marketing copy. Make it obvious what the skill does, when to invoke it, and when not to.

### 3. Draw adjacency lines early

Compare nearby skills and decide the real center of gravity. Most bad skills fail because they overlap, duplicate, or fake specialization.

### 4. Design for progressive disclosure

Keep the always-loaded description sharp. Keep `SKILL.md` high-signal. Push detail into the right file only if it changes execution quality. Context is expensive.

### 5. Teach the non-obvious parts

Assume the downstream agent is already capable. Add workflow, heuristics, edge-case handling, quality bars, and output shapes that improve performance beyond general intelligence.

### 6. Keep the package internally consistent

`SKILL.md`, `prompt.md`, examples, QA, and metadata must describe the same worker. If the examples imply a different job than the metadata, the skill is broken.

### 7. Prefer portfolio health over local perfection

A skill should earn its existence. If the best fix is to narrow, merge, split, or de-duplicate, say so plainly.

## Inputs to gather

Collect as many of these as possible:
- recurring user requests the skill should cover
- adjacent skills and overlap risks
- expected inputs, outputs, and failure modes
- current files and where they underperform
- portfolio constraints such as naming, tier, source, and category
- whether the root issue is trigger quality, scope, examples, QA, metadata, or all of the above

## Heuristics

Prefer:
- descriptions that trigger from realistic task language
- narrow-enough scope with a clear reason to exist
- concise instructions with strong operational heuristics
- examples that show deliverable shape and judgment
- QA checklists tied to actual failure modes
- metadata that improves discovery and maintenance

Avoid:
- “when to use” logic hidden only in body text
- generic domain tutorials that waste tokens
- decorative files with no routing or execution value
- aliases and adjacent skills chosen casually
- packages whose files contradict each other
- splitting a skill just to create catalog bloat

## Output expectations

Return outputs such as:
- full rewritten skill pack
- audit notes with prioritized fixes
- boundary rewrite and trigger cleanup
- package split/merge recommendation
- metadata modernization with tighter aliases and adjacency

## Boundaries

Use adjacent skills when the problem shifts:
- **roster-curator** for portfolio-level keep/merge/split/retire decisions across many skills
- **prompt-engineer** for prompt-system optimization outside full package design
- **runtime-selector** for execution-path selection rather than skill authoring
- **project-architect** for broader system planning not centered on the skill pack itself

## Final check

Before finishing, confirm that the package:
- routes from the description alone
- has crisp scope and non-scope boundaries
- teaches non-obvious execution guidance
- stays concise under progressive disclosure
- is internally coherent across all files
- improves catalog quality instead of adding noise

## File map

Use `prompt.md` for authoring posture and package-design rules.
Use `examples/README.md` for deliverable patterns.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for metadata and adjacent boundaries.
