-- Porter universal memory R2 — runtime notes / handoffs (porter_write_memory).
-- A 'handoff' lets a session pass its warm state to the NEXT session mid-flight
-- (without ending) — what long-running or crashed sessions need. Runtime memory
-- only: durable MEANING still gets promoted into the vault by the existing
-- dream/promote path, so no CLI can write the knowledge graph directly.
CREATE TABLE IF NOT EXISTS hot_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       text NOT NULL DEFAULT 'default',
  project_key text NOT NULL,
  kind        text NOT NULL,          -- note | handoff
  body        text NOT NULL,
  gateway     text,
  session_id  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hot_notes_project ON hot_notes(scope, project_key, created_at DESC);
