---
name: prompt-architect
description: Rewrite vague, bloated, or under-specified prompts into compact high-signal instructions for agents, models, and human collaborators. Use when a task needs sharper delegation, clearer success criteria, stronger guardrails, cleaner context packaging, or a reusable prompt scaffold that another executor can run immediately. Do not use when the main job is model-system design, evaluation planning, or prompt-library operations across a product.
---

# Prompt Architect

Turn messy intent into runnable instructions.

## Use this skill to
- rewrite bloated or contradictory prompts
- package work for an agent, contractor, or teammate
- convert loose asks into compact reusable templates
- separate objectives, constraints, inputs, and output contracts
- surface missing information instead of forcing the executor to guess

## Do not use this skill to
- design full prompt systems, chains, or eval programs across a product
- solve a reliability issue that is really a retrieval, tool, or workflow problem
- write generic marketing copy with no delegation or instruction-design need
- preserve every sentence of a bad prompt out of politeness

## Gather first
- the actual task to be completed
- the target executor: model, agent, human, or mixed workflow
- hard constraints, forbidden moves, and tool limits
- desired output format, quality bar, and deadline or runtime limit
- source context that truly matters
- what is still missing or uncertain

## Deliverables that fit this skill
- repaired prompt
- reusable prompt scaffold with placeholders
- delegation brief for an agent or teammate
- compact vs extended prompt variants
- assumptions / missing-input list
- acceptance checklist for the rewritten prompt

## Working method

### 1. Identify the real job
Name the decision or deliverable the executor must produce. If the prompt asks for “analysis,” specify analysis for what decision. If it asks for “help,” define the output.

### 2. Separate hard requirements from preferences
Pull out what is mandatory versus nice-to-have:
- objective
- must-use inputs
- constraints and forbidden moves
- output format
- style or tone preferences

Do not let weak preferences pollute the main instruction path.

### 3. Remove prompt bloat aggressively
Delete:
- repeated instructions
- motivational filler
- vague excellence language
- context with no execution value
- contradictory asks left unresolved

Compactness matters because prompts compete for scarce context.

### 4. Rebuild the prompt in execution order
Put information in the order an executor needs it:
1. task
2. critical constraints
3. relevant context
4. available inputs
5. output contract
6. quality checks
7. fallback behavior when data is missing

Keep the top of the prompt decisive.

### 5. Make missing information explicit
If key facts are absent, do not invent them into the prompt. Add:
- assumptions
- placeholders
- “need from requester” bullets
- explicit instructions for how the executor should behave under uncertainty

### 6. Add only the structure that earns its keep
Examples, schemas, and sections should improve execution reliability, not make the prompt look sophisticated. Use the lightest structure that solves the problem.

### 7. End with a fast verification pass
Before finalizing, check:
- can the executor act without guessing?
- are success criteria testable?
- is anything important hidden in the middle?
- is the prompt shorter and sharper than what it replaced?

## Adjacent skill boundaries
- **prompt-engineer**: designs prompt systems, chains, reliability strategy, and evaluation loops; this skill rewrites a prompt or brief into a cleaner executable form
- **quality-reviewer**: critiques outputs against a standard; this skill improves the instruction package before execution
- **research-analyst**: fills knowledge gaps; this skill exposes missing inputs instead of pretending to supply them
- **proposal-writer**: persuades decision-makers; this skill directs executors

## Quality bar
A strong result should:
- preserve the real intent while deleting clutter
- make task, constraints, and output unmistakable
- expose missing inputs and assumptions honestly
- stay compact enough for repeated operational use
- be immediately runnable by the stated executor

## Files to use
- Read `prompt.md` for operating posture and rewrite patterns.
- Read `examples/README.md` for output shapes.
- Read `guides/qa-checklist.md` before finalizing.
- Read `meta/skill.json` for aliases, boundaries, and metadata.
