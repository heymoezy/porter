-- 2026-07-14 — R2: collapse byte-identical duplicate artifact rows.
--
-- The vault held 3,010 hashed artifact rows for only 2,170 distinct contents: 486 groups where
-- the SAME node carried multiple artifact rows with the SAME content_hash. These are one document
-- filed at several paths (e.g. edwardchen/IDENTITY_EXHIBIT.pdf and
-- Working_Papers/Identity_Attribution_Inquiry.pdf are byte-identical).
--
-- "One file, many locations" is exactly what vault_artifact_locations models — and it ALREADY
-- holds every one of those paths (verified: all 1,326 duplicate-group artifact paths are present
-- as locations). So the extra artifact rows are pure redundancy: they inflate the vault, and each
-- one spawns its own derivative job, inflating that backlog too.
--
-- Byte-identical only (content_hash equality). No near-match guessing — the same conservative rule
-- proven in the filesystem dedup.
--
-- Safety, all verified before writing this:
--   * every duplicate path is preserved in vault_artifact_locations  -> no path is lost
--   * all 840 duplicate derivative jobs are status='missing'         -> no generated derivative lost
--   * no FK cascades exist on vault_artifacts                        -> references repointed by hand

CREATE TEMP TABLE canonical AS
SELECT DISTINCT ON (node_id, content_hash) id, node_id, content_hash
  FROM vault_artifacts
 WHERE app_scope = 'ymc' AND content_hash IS NOT NULL AND content_hash <> ''
 ORDER BY node_id, content_hash, created_at NULLS LAST, id;

CREATE TEMP TABLE dupes AS
SELECT a.id, c.id AS canonical_id
  FROM vault_artifacts a
  JOIN canonical c ON c.node_id = a.node_id AND c.content_hash = a.content_hash
 WHERE a.app_scope = 'ymc' AND a.content_hash IS NOT NULL AND a.content_hash <> ''
   AND a.id <> c.id;

-- 1. Locations keep every path; just point them at the surviving artifact.
UPDATE vault_artifact_locations l
   SET artifact_id = d.canonical_id
  FROM dupes d
 WHERE l.artifact_id = d.id;

-- 2. The duplicates' derivative jobs are redundant (all 'missing'; the canonical has its own).
DELETE FROM vault_derivative_jobs
 WHERE source_artifact_id IN (SELECT id FROM dupes);

-- 3. Drop the redundant artifact rows.
DELETE FROM vault_artifacts
 WHERE id IN (SELECT id FROM dupes);

-- 4. Pre-existing ZOMBIE jobs (28): derivative jobs whose source artifact no longer exists at all.
-- Not created by this dedup (the arithmetic is exact: 3,052 jobs − 840 removed = 2,212 remaining).
-- Their source vanished in an earlier re-ingest. They can never succeed — the sweep would pick them
-- up, fail to read a source that isn't there, and they would sit in the backlog forever, inflating
-- it and burning a model-call slot each time. Dead rows; removed.
DELETE FROM vault_derivative_jobs j
 WHERE j.source_artifact_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM vault_artifacts a WHERE a.id = j.source_artifact_id);
