# Deferred Items — Phase 48.3 software-dream-worker

## From Plan 03 execution (2026-05-13)

### Smoke harness directive-seed type mismatch (out of scope for 48.3-03)

**File:** tests/smoke-48.3.sh, lines 129/131/132
**Issue:** INSERT INTO directives ... created_at, updated_at) VALUES (..., NOW(), NOW()) — directives.created_at is `double precision` (epoch seconds) per the live schema, but the harness writes `NOW()` (timestamptz). Postgres errors:
  ```
  ERROR: column "created_at" is of type double precision but expression is of type timestamp with time zone
  ```
**Impact:** DRW-04..DRW-12 cannot run because the smoke silo's 6 directives never seed. DRW-01/02/03/08 still pass (they don't depend on directive seeding). DRW-04+ are guarded behind `dream-worker.ts not yet built` warn-skip in the current smoke output so this doesn't surface until Plan 04 ships the worker.
**Scope decision:** Pre-existing bug from Plan 01 smoke harness, not caused by Plan 03's prompt/sampler/parser files. Fix at start of Plan 04 by changing `NOW(), NOW()` to `EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())` in the three INSERT statements.
**Fix budget:** ~2 min, three single-token replacements.
