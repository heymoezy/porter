-- Migration 049: directives (scope, scope_id, status) partial index
-- Phase 49 LRN-03 — forward-investment optimization for project-scope lookups
--
-- Rationale: /context handler queries
--   `WHERE scope='project' AND scope_id=$1 AND status='active'`
-- on every CLI session start. The existing index
--   `idx_directives_scope (scope, status)`
-- is sufficient for today's 83 project-scope rows but scales poorly as
-- project-scope grows past a few hundred. With LRN-03 making project-scope
-- a first-class part of /context (server-side cwd→project derivation in
-- addition to the existing explicit ?project= query param), every CLI session
-- now exercises this lookup symmetrically — a forward investment.
--
-- The partial index (WHERE status='active') keeps the index small — archived
-- rows are excluded. CREATE INDEX IF NOT EXISTS is non-blocking for the
-- current directives row count (~125 today across all scopes); CONCURRENTLY
-- is intentionally NOT used because Porter's TS migration runner
-- (backend/src/db/migrate-directives-scope-idx-v1.ts) wraps every DDL in a
-- BEGIN/COMMIT transaction, and CREATE INDEX CONCURRENTLY cannot run inside
-- a transaction. The IF NOT EXISTS guard makes re-runs safe.
--
-- Companion TS migration: backend/src/db/migrate-directives-scope-idx-v1.ts
-- (registered in backend/src/index.ts after migrateDreamsV1). The TS module
-- reads this file at runtime, executes it inside its schema_migrations guard,
-- and stamps id='directives_scope_idx_v1'.
--
-- Rollback (manual):
--   DROP INDEX IF EXISTS idx_directives_scope_scope_id_status;

CREATE INDEX IF NOT EXISTS idx_directives_scope_scope_id_status
  ON directives (scope, scope_id, status)
  WHERE status = 'active';
