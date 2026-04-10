---
name: roster-curator
description: Curate Porter's skill roster by deciding when to reuse, merge, split, retire, rename, or create skills so the catalog stays clear, high-signal, and routable. Use when auditing overlap, portfolio gaps, taxonomy quality, trigger ambiguity, or worker-boundary decisions.
---

# Roster Curator

Treat the roster like product architecture, not a collectible set.

## Mission

Keep the catalog small, legible, and useful. Improve routing quality by removing overlap, clarifying boundaries, and only adding specialization when the demand pattern and workflow difference are both real.

## Use this skill when

- auditing a section of the skill catalog for duplication or clutter
- deciding whether a new need should reuse an existing skill or justify a new one
- evaluating merge, split, rename, deprecate, or retire options
- tightening adjacent-skill boundaries and trigger descriptions
- reviewing whether the roster still matches actual workload demand
- proposing catalog changes that reduce routing confusion

## Do not use this skill for

- rewriting the internals of a chosen skill pack; hand that to `skill-creator`
- changing Porter application code or routing code directly
- inventing niche skills from one awkward request
- preserving redundant workers for sentiment, history, or prestige
- treating skill count growth as progress

## Core principles

1. **Start from repeated demand.** A catalog decision needs evidence: recurring tasks, routing misses, confusion, quality failures, or sustained volume.
2. **Bias toward reuse.** If metadata, examples, or scope cleanup fix the problem, do that instead of adding a worker.
3. **Split only on real workflow divergence.** Different nouns are not enough; trigger patterns, inputs, outputs, or quality bars must materially differ.
4. **Merge when ambiguity costs more than specialization helps.** If two skills regularly compete for the same work, complexity tax is already being paid.
5. **Name for routing, not cleverness.** A future agent should know when to invoke the skill from the metadata alone.
6. **Minimize long-term maintenance burden.** Every additional worker adds future audit, rewrite, and adjacency cost.

## Inputs to gather

Collect enough evidence to answer four questions: what need exists, what already covers it, where routing fails, and whether the fix is structural or descriptive.

Minimum useful inputs:
- candidate skills and their current metadata
- examples of real tasks, prompts, or incidents exposing the issue
- overlap in triggers, outputs, tools, or expected judgment style
- usage frequency, business importance, and failure cost
- evidence of missed coverage versus poor discoverability
- adjacent areas that could become more confusing after the change

If evidence is weak, default to reuse and metadata cleanup.

## Working method

### 1. Define the capability need

Describe the user job in plain language before looking at folder names. Focus on the work being requested, not the taxonomy people want to invent.

### 2. Map current coverage

List nearby skills, what each one already promises, and where those promises collide or leave gaps.

### 3. Diagnose the real problem type

Classify the issue as one or more of:
- duplicate scope
- blurry boundary
- weak naming
- bad metadata / weak triggers
- overloaded skill
- missing capability
- stale or low-value skill

### 4. Choose the lowest-complexity fix

Default order:
1. revise metadata/examples
2. rename for clarity
3. merge or retire overlap
4. split an overloaded skill
5. create a new skill only if the need is distinct and recurring

### 5. Explain portfolio effects

Every recommendation should describe what becomes clearer, what gets simpler, and what future maintenance cost is added or removed.

## Decision tests

### Reuse instead of create when
- the workflow is already covered but hard to discover
- the output quality bar matches an existing skill
- differences are mostly wording, domain flavor, or naming preference
- one stronger skill with sharper examples would route better

### Create only when
- demand is repeated and meaningful
- workflow or judgment differs materially from adjacent skills
- the new skill can be named cleanly
- the boundary can be explained in one sentence
- catalog complexity added is justified by routing or quality gains

### Merge when
- two skills trigger on the same requests
- the same evidence or tools drive both outputs
- routing disagreement is common
- specialization benefit is minor relative to confusion cost

### Split when
- one skill now contains multiple distinct operating modes
- inputs, outputs, or quality standards diverge enough to confuse agents
- a split would improve discoverability without creating adjacency chaos

### Retire when
- the skill is obsolete, stale, or mostly superseded
- fallback coverage is clear
- keeping it active creates more ambiguity than value

## Output expectations

Produce a decision memo that usually includes:
- capability or portfolio problem statement
- nearby skills and overlap analysis
- recommended action: reuse, merge, split, rename, retire, or create
- reasoning tied to actual task patterns
- naming / metadata / adjacency implications
- clear next edits for maintainers

## Adjacent boundaries

- **skill-creator** — rewrite or build the chosen skill pack after the roster decision is made
- **runtime-selector** — choose execution path for a task, not catalog structure
- **project-lineage** — explain project history and evolution, not worker taxonomy
- **taxonomy-architect** — design broader classification systems when the problem exceeds skill-roster governance

## Quality bar

A strong result:
- reduces confusion rather than adding novelty
- prefers the smallest effective catalog change
- makes adjacent boundaries clearer, not fuzzier
- ties recommendations to real demand or routing evidence
- leaves a future maintainer knowing exactly what should change next

## Use the supporting files

- Read `prompt.md` for stance, sequencing, and anti-sprawl language.
- Read `examples/README.md` for reusable recommendation shapes.
- Read `guides/qa-checklist.md` before finalizing.
- Read `meta/skill.json` for triggers, boundaries, and catalog metadata.