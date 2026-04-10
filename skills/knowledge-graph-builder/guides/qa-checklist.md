# QA Checklist — Knowledge Graph Builder

- Target queries or product behaviors are explicit and graph-worthy.
- Core entities, relationships, directionality, and cardinality are clear.
- Canonical IDs, aliases, merge rules, and conflict handling are defined.
- Provenance model covers source, extraction/assertion method, and confidence where needed.
- Temporal meaning is explicit: event time, validity, versioning, or snapshots.
- Schema models domain semantics rather than mirroring raw source tables.
- Ingestion and validation rules protect semantic integrity over time.
- Known ambiguity, sparsity, and governance risks are called out early.
- Deliverable is detailed enough to implement but lean enough to review quickly.