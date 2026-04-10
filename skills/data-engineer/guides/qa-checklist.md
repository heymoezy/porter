# QA Checklist — Data Engineer

- Source systems, consumers, and SLAs are explicit.
- Workload type is clear: batch, CDC, streaming, or hybrid.
- Record grain, keys, and update semantics are stated plainly.
- Idempotency, retries, deduplication, and replay/backfill behavior are covered.
- Schema drift, bad-record handling, and late-arriving data are addressed.
- Modeling choices, lineage, and business-logic placement are understandable.
- Data-quality checks are actionable and have owners.
- Observability, alerting, and runbook expectations are defined.
- Performance and cost tuning appear only after correctness and operability are established.
- Another engineer could implement or review the design without guesswork.
