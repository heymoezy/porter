---
name: memory-curator
description: Distill conversations, decisions, and project state into durable memory candidates such as directives, concepts, project notes, entity notes, and session summaries. Use when work requires deciding what should be remembered, merging or superseding existing memory, converting noisy history into retrieval-friendly knowledge, or protecting the memory system from transcript dump and stale duplication. Do not use for plain summarization when durability judgment is not the core task.
---

# Memory Curator

Curate for future reuse, not for archival comfort. A good memory system preserves durable signal, labels uncertainty, and rejects chatter.

## Core stance

- Save less, better.
- Prefer retrieval value over completeness.
- Separate fact, inference, proposal, and rule.
- Update existing memory when possible instead of creating near-duplicates.
- Keep wording compact, concrete, and searchable.

## Use this skill to

- decide whether a detail deserves durable storage
- turn threads, meetings, and work logs into memory candidates
- merge, refine, supersede, or retire overlapping memories
- produce concise session summaries with only reusable takeaways
- convert operational context into directives, concepts, or project notes

## Do not use this skill for

- dumping raw transcripts into long-term memory
- preserving unresolved speculation as fact
- generic summarization with no retention decision
- policy or access-control decisions outside the memory artifact itself

## Gather before curating

Identify:
- the future job this memory should help with
- memory type: directive, concept, project note, entity note, session summary
- source evidence and confidence level
- whether the claim is durable, time-bound, or transient
- whether similar memory already exists
- whether newer information changes or invalidates older memory

## Memory-type selection

- **Directive**: standing instruction, operating rule, or recurring constraint
- **Concept**: durable truth about a system, project, workflow, or domain
- **Project note**: current state, decision, or constraint that matters for an ongoing initiative
- **Entity note**: durable facts about a person, team, company, tool, or component
- **Session summary**: compact recap of outcomes and carry-forward context when full durability is mixed

Choose the smallest useful container. Do not force everything into a directive.

## Working method

### 1. Judge durability first

Store information that is likely to remain useful across sessions, materially changes future decisions, or captures a recurring rule. Reject scheduling chatter, one-off phrasing, transient status updates, and already-stored facts.

### 2. Separate evidence from interpretation

Label clearly:
- **fact**: directly supported by the source
- **inference**: reasonable interpretation, still not certain fact
- **proposal**: suggested future action or rule
- **directive**: adopted operating instruction

Memory quality collapses when inference gets stored as certainty.

### 3. Optimize for retrieval

Write entries so a future agent can find them with likely search terms. Favor explicit names, concrete nouns, stable terminology, and short sentences over elegant vagueness.

### 4. Prefer update over accretion

When related memory exists, decide whether to:
- keep as-is
- refine wording
- merge overlapping entries
- supersede stale memory
- discard the new candidate

Explain the reason. Duplication is memory rot.

### 5. Preserve uncertainty honestly

If truth is evolving, include recency and confidence. A memory can be worth storing even when provisional, but only if the provisional status is explicit.

### 6. Deliver decision-ready output

For each candidate or recommendation, include:
- memory type
- proposed text or keep/merge/discard action
- why it should be stored or rejected
- confidence, recency, or conflict note when relevant

## Good output traits

A strong result:
- keeps only durable signal
- uses crisp, retrieval-friendly wording
- avoids duplicate memory drift
- captures supersession explicitly
- helps future agents act faster with less confusion

## Adjacent boundaries

- **knowledge-manager**: designs taxonomy and broader knowledge operations; this skill curates the actual memory candidates
- **project-lineage**: reconstructs chronology and change history; this skill decides what deserves durable retention
- **technical-writer**: optimizes documents for readers; this skill optimizes entries for future retrieval
- **directive-librarian**: manages directive hygiene specifically; this skill handles broader memory-shape selection

## Use bundled files

- Read `prompt.md` for the response structure and curation posture.
- Read `examples/README.md` for output patterns.
- Use `guides/qa-checklist.md` before finalizing.
- Use `meta/skill.json` for aliases, boundaries, and metadata.