---
name: knowledge-graph-builder
description: Design and refine knowledge graphs, ontologies, entity/relationship models, graph schemas, and ingestion rules for systems that need connected facts, provenance, and evolving identity. Use when the work involves entity modeling, ontology design, graph RAG structure, semantic search, entity resolution, lineage/provenance capture, temporal facts, or translating messy multi-source data into graph form. Do not use for ordinary relational schema design, dashboard modeling, or generic ETL after the graph semantics are already fixed.
---

# Knowledge Graph Builder

Model the domain so connected facts stay queryable, explainable, and trustworthy as sources change over time.

## Focus
This skill is for the **semantic model** of a graph system: entities, relationships, constraints, identity, provenance, temporal validity, and ingestion semantics.

Use adjacent skills instead when the main need is:
- **analytics-engineer / data-engineer**: warehouse transformations, metrics layers, pipelines
- **database-admin**: database tuning and operational administration
- **knowledge-manager**: governance of human knowledge repositories
- **memory-curator**: curation or retrieval behavior for memory systems without deep graph-schema design

## Start from the question, not the schema
A graph is justified when the product needs connected reasoning such as:
- multi-hop retrieval
- entity-centric search
- relationship exploration
- evidence-backed reasoning
- lineage / traceability
- cross-source resolution of the same real-world thing

If the target questions are simple tabular filtering or reporting, say so and avoid graph theater.

## Gather first
- Target queries, product behaviors, or decisions the graph must support
- Source systems and document types
- Candidate entities, identifiers, aliases, and ambiguous matches
- Key relationships, directionality, and cardinality
- Temporal behavior: event time, valid time, versioning, snapshot needs
- Provenance needs: source, extraction method, confidence, citation, reviewability
- Update cadence, merge rules, and deletion/retention constraints

## Deliverables
Provide some combination of:
- Core entity and relationship model
- Ontology / schema notes with naming and normalization rules
- Identity and entity-resolution strategy
- Provenance and temporal modeling approach
- Ingestion, validation, and governance plan
- Example target queries to prove the model works

## Working method
1. Name the high-value questions first.
2. Define the smallest graph that can answer them well.
3. Model core entities and relations before adding attributes and edge cases.
4. Specify identity rules: canonical ID, aliases, merge/split handling, and conflict policy.
5. Treat provenance as first-class when facts are extracted, inferred, disputed, or time-bound.
6. Test the model against realistic messy cases: duplicates, missing IDs, stale facts, contradictory sources.
7. Only then extend the ontology for broader coverage.

## Modeling rules
- Model meaning, not source-table shapes.
- Avoid turning every field into a node unless it improves query value.
- Use explicit relation names that read clearly in both directions.
- Separate asserted facts from inferred facts when confidence differs.
- Represent time deliberately: event time, effective time, observed time, or version history.
- Design for partial truth: unknown, disputed, deprecated, superseded.
- Keep schema evolvable; new entity classes should not break existing semantics.

## Common failure modes to prevent
- Overbuilding an ontology before validating actual query needs
- Hiding provenance in free text instead of structured fields
- Treating identity resolution as an afterthought
- Mixing source-of-truth entities with extraction artifacts carelessly
- Building a graph that is impossible to explain or govern

## Quality bar
A strong deliverable makes it easy to answer:
1. What real-world things exist here?
2. How are they connected?
3. How do we know each fact?
4. When was it true?
5. How do duplicates, conflicts, and updates get handled?
6. Which target queries does this model unlock?

## Final check
Before finishing, read `guides/qa-checklist.md`, align the response structure with `prompt.md`, and sanity-check the deliverable against `examples/README.md`.