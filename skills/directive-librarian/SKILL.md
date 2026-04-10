---
name: directive-librarian
description: Curate operational directives from messy notes, memory, incidents, proposals, and conflicting instructions into a trustworthy directive library with provenance, status, scope, and supersession history. Use when the task is to promote candidate rules, normalize directive wording, resolve overlap, classify active versus proposed guidance, preserve evidence, or clean up a directive catalog so future agents can retrieve and apply rules correctly. Do not use for generic note-taking, unsupported policy invention, or ordinary documentation that is not meant to govern behavior.
---

# Directive Librarian

Turn scattered guidance into governed, retrievable operational directives.

## Mission

Preserve the rules that matter, label their authority honestly, and prevent contradiction drift across the directive corpus.

## Use this skill to

- promote candidate directives from incidents, decisions, or repeated lessons
- normalize raw instructions into durable directive wording
- classify directives as active, proposed, disputed, deprecated, or informational
- resolve duplicates, overlap, and supersession chains
- preserve provenance and evidence
- tighten scope, actors, triggers, and exceptions
- prepare review-ready directive proposals
- improve directive retrieval quality and corpus hygiene

## Do not use this skill to

- summarize notes that are not intended to govern behavior
- declare unresolved opinions as active policy
- write vague policy theater without evidence or scope control
- keep multiple equivalent directives because cleanup feels inconvenient

## Inputs to gather

Collect enough evidence to classify the rule correctly:

- source material: incident, decision record, user instruction, runbook, discussion, metric, audit finding
- intended audience or actor
- workflow or system scope
- trigger conditions and exceptions
- overlap with existing directives
- approval state, owner, and review expectations
- time sensitivity: permanent, temporary, experiment, emergency, historical

If provenance or approval is weak, keep the item proposed or informational.

## Deliverables

Return only what helps maintain a trustworthy directive corpus:

- normalized directive text
- provenance summary
- status recommendation
- scope and exception notes
- conflict / duplication / supersession analysis
- review or approval requirements
- cleanup actions for related directives

Use explicit status labels. Do not bury uncertainty.

## Working method

### 1. Separate raw memory from directive-grade guidance

A directive should clearly answer:

- what action or constraint exists
- who or what it applies to
- when it applies
- why it exists
- what evidence supports it
- what status it currently has

If those are missing, you likely have a note, not a directive.

### 2. Preserve provenance and authority

For every directive, capture:

- source or origin
- date established or revised if known
- evidence or rationale
- approving authority, owner, or reviewer
- related directives, dependencies, or superseded items

Unattributed rules become folklore.

### 3. Tighten scope aggressively

Specify:

- actors affected
- systems, projects, or workflows covered
- triggering conditions
- allowed exceptions
- whether the rule is global, local, temporary, or emergency-only

Narrow truth beats broad ambiguity.

### 4. Resolve overlap explicitly

When directives overlap, decide whether they are:

- duplicates that should merge
- a general rule plus a scoped exception
- outdated wording that should be deprecated
- genuinely conflicting guidance needing escalation

Never leave near-duplicates to compete in retrieval.

### 5. Use operationally meaningful statuses

Preferred statuses:

- **active** — current guidance to follow
- **proposed** — candidate awaiting approval or evidence
- **disputed** — contested or contradictory guidance requiring review
- **deprecated** — superseded guidance retained for history
- **informational** — context that informs decisions but is not binding

Status must change how the directive is treated.

### 6. Write for retrieval and action

Good directive wording is:

- concise enough to retrieve cleanly
- specific enough to execute
- stable enough to survive paraphrase
- linked to evidence when challenged

Prefer direct operational language over motivational prose.

### 7. Leave a clean decision trail

End with:

- recommended status
- rationale
- conflicts or duplicates found
- review owner and next step
- required cleanup or supersession actions

A good directive library explains not just the rule, but why the rule is trusted.

## Output structure

When useful, organize the answer in this order:

1. source evidence and current state
2. normalized directive text
3. scope, triggers, and exceptions
4. conflicts / overlap / supersession
5. recommended status and next action

## Adjacent skill boundaries

- **dispute-resolver**: helps resolve the disagreement itself; this skill turns the result into governed directives
- **knowledge-manager**: organizes broader knowledge; this skill specializes in operational rules with statuses and provenance
- **approval-governor**: decides when sign-off is needed; this skill curates the policy corpus those decisions rely on
- **project-lineage**: tracks project history; this skill extracts durable directives from that history

## Quality bar

A strong result:

- distinguishes evidence from assumption
- preserves provenance and scope
- exposes conflicts and supersession clearly
- keeps weak guidance out of active status
- improves future retrieval and operational trust

## Files in this pack

- `prompt.md` — curation posture and drafting defaults
- `examples/README.md` — output-shape examples
- `guides/qa-checklist.md` — preflight review checklist
- `meta/skill.json` — routing metadata and boundaries
