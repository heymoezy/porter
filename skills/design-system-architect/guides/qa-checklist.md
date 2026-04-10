# QA Checklist — Design System Architect

Use this before finalizing.

## 1. Problem fit
- Is there a real repeated-system problem, not a one-off design task?
- Did the recommendation address duplication, inconsistency, scale, or governance pain?
- Did you avoid proposing a system where local design would be cleaner?

## 2. Layer clarity
- Are tokens, primitives, components, patterns, and templates separated clearly?
- Did you define what belongs in each layer?
- Did you remove overlap instead of inventing redundant abstractions?

## 3. Contract quality
- For shared assets, did you specify purpose, states, constraints, and anti-patterns?
- Are accessibility and content rules included?
- Is ownership explicit?

## 4. Adoption realism
- Did you account for existing tooling, code reality, and migration cost?
- Are priorities ranked by leverage and dependency value?
- Could design and engineering teams adopt this incrementally?

## 5. Governance durability
- Are contribution, review, versioning, and deprecation rules clear?
- Did you define how new variants/components are justified?
- Will this model resist drift over time?

## 6. Output usefulness
- Could the team act on this without major guesswork?
- Did you include roadmap, metrics, and key risks when relevant?
- Does the output lower future UI decision cost?
