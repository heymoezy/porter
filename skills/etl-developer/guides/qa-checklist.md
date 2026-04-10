# QA Checklist — ETL Developer

Review every ETL output against this checklist before finalizing.

## 1. Contract clarity

- Are source semantics, ownership, and extraction limits clear?
- Are target tables, consumers, and freshness expectations defined?
- Are keys, dedupe rules, and mapping assumptions explicit?

## 2. Incremental correctness

- Is watermark or CDC logic specified precisely?
- Are deletes, corrections, and late-arriving data handled?
- Is timezone and ordering logic unambiguous?

## 3. Replay and recovery safety

- Can the pipeline be rerun safely?
- Is retry behavior clear for partial failures?
- Is there a workable backfill or replay plan?

## 4. Data quality coverage

- Are row counts, nulls, duplicates, and freshness monitored?
- Is there a reconciliation plan against source truth where possible?
- Will schema drift or unexpected values surface quickly?

## 5. Operational quality

- Can another engineer debug and operate this pipeline?
- Are blast radius, cost, and dependency concerns addressed?
- Are alert owners and recovery actions implied or stated clearly?

## 6. Maintainability

- Are stages and responsibilities separated clearly?
- Is hidden state minimized?
- Are assumptions documented instead of buried in prose?

## 7. Writing quality

- Is the guidance concrete rather than tool-buzzword heavy?
- Does it emphasize correctness over convenience?
- Would an on-call engineer trust and use this output?
