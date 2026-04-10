---
name: project-lineage
description: Reconstruct how a project, requirement, dataset, workflow, or decision reached its current state by tracing origins, changes, handoffs, dependencies, and downstream effects. Use when work involves provenance, source-of-truth conflicts, audit trails, inherited assumptions, handoff reconstruction, data lineage, or explaining how today’s state emerged over time. Do not use for generic status reporting, greenfield planning, or speculative storytelling presented as fact.
---

# Project Lineage

Explain the chain from origin to current state. Build a trace that distinguishes evidence from inference, chronology from causality, and current truth from historical leftovers.

## Use this skill to
- trace how a requirement, document, workflow, or system evolved
- reconstruct decision history across commits, tickets, docs, and handoffs
- map data lineage from source through transformations to downstream consumers
- resolve source-of-truth conflicts and inherited-assumption confusion
- produce audit-style chronology for migrations, incidents, or operational rules

## Do not use this skill to
- give ordinary status updates with no need for historical traceability
- invent neat narratives when records are incomplete
- debug current behavior when provenance is irrelevant
- design future work from scratch with no lineage question

## Gather first
- exact object being traced
- why the trace matters now: audit, migration, debugging, accountability, governance, handoff
- available evidence sources: commits, tickets, changelogs, docs, logs, schemas, release notes, stakeholder memory
- time window and anchor events
- audience and required depth: summary, working memo, or forensic reconstruction

## Deliverables that fit this skill
- lineage map from origin to present
- change chronology with evidence strength
- source-of-truth clarification memo
- downstream impact map
- handoff and ownership-shift reconstruction
- unresolved-gap list with verification requests

## Working method

### 1. Define the object of lineage precisely
State exactly what is being traced:
- requirement
- decision
- dataset or field
- workflow
- document
- service behavior
- operational rule

If the object is fuzzy, the lineage becomes fiction fast.

### 2. Build an evidence hierarchy
Prefer versioned records first:
- commits and diffs
- tickets and decision docs
- changelogs and release notes
- logs, metadata, and schemas
- stakeholder memory as supporting evidence only

Label weak evidence as weak.

### 3. Separate chronology, dependency, and causality
Track distinctly:
- what changed when
- what depended on what
- what likely influenced later states
- what is actually confirmed as causal

Do not turn adjacency in time into certainty about cause.

### 4. Map transformations, forks, and handoffs
Show:
- original source
- major edits or transformations
- ownership changes
- overrides, patches, or manual exceptions
- downstream consumers or derived artifacts

This matters for both data lineage and decision lineage.

### 5. Surface gaps without hiding them
State:
- what is missing
- what can be inferred with confidence labels
- what requires human confirmation or deeper system access

Good lineage work is honest about blind spots.

### 6. End with present-day significance
Translate history into current value:
- current source of truth
- active risk caused by lineage confusion
- migration or remediation implications
- ownership or governance decisions that need to happen now

## Adjacent skill boundaries
- **analytics-engineer**: builds and reasons about pipelines; this skill reconstructs provenance and downstream traceability
- **runtime-auditor**: evaluates runtime behavior; this skill explains the historical chain behind the current state
- **project-architect**: structures future execution; this skill maps how past execution produced the present
- **knowledge-manager**: organizes durable information; this skill traces evolution and source integrity over time

## Quality bar
A strong result should:
- define the traced object and time scope clearly
- separate evidence, inference, and uncertainty
- identify origin, transformations, handoffs, and downstream impact
- clarify the current source of truth
- help a current audit, migration, fix, or accountability decision

## Files to use
- Read `prompt.md` for provenance posture and response pattern.
- Read `examples/README.md` for output shapes.
- Read `guides/qa-checklist.md` before finalizing.
- Read `meta/skill.json` for metadata, aliases, and boundaries.
