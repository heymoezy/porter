-- Porter universal memory R1 — hot context (the warm session-bootstrap cache).
-- See planning/porter-universal-memory-37.md (council-ratified: codex + grok).
--
-- ONE row per (scope, project_key). Porter DB is the SOURCE OF TRUTH; any vault
-- mirror is a generated, lag-tolerant view. Strictly capped (~600-900 tokens):
-- pointers, not payloads. Fresh install = no row = cold-but-valid bootstrap.
CREATE TABLE IF NOT EXISTS hot_contexts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope          text NOT NULL DEFAULT 'default',   -- app_scope / tenant
  project_key    text NOT NULL,                     -- project name (e.g. ymc.capital)
  body           text NOT NULL,                     -- the warm packet (markdown)
  approx_tokens  integer NOT NULL DEFAULT 0,
  hash           text,                              -- content hash (skip no-op rewrites)
  source_session text,                              -- session that last recomputed it
  source_gateway text,                              -- claude_cli | codex_cli | grok_cli | …
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, project_key)
);
CREATE INDEX IF NOT EXISTS idx_hot_contexts_project ON hot_contexts(project_key, updated_at DESC);
