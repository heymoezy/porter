-- #49 — cost per ACCEPTED change. The loops-article metric: below ~50% acceptance
-- a loop costs more than it saves, and you cannot know that without measuring.
--
-- The feed exists after all: the CLI transcript records per-message token usage.
-- The SessionEnd hook parses it and reports totals here. Tokens are EXACT; cost is
-- derived from a rate table (approximate + configurable — never presented as billing).
CREATE TABLE IF NOT EXISTS session_usage (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     text NOT NULL UNIQUE,
  project_key    text,
  gateway        text,                       -- claude_cli | codex_cli | grok_cli | …
  models         text[],                     -- models seen in the session
  input_tokens   bigint NOT NULL DEFAULT 0,
  output_tokens  bigint NOT NULL DEFAULT 0,
  cache_read     bigint NOT NULL DEFAULT 0,
  cache_write    bigint NOT NULL DEFAULT 0,
  cost_usd       numeric(12,4) NOT NULL DEFAULT 0,
  releases       integer NOT NULL DEFAULT 0, -- releases shipped in this session
  reverts        integer NOT NULL DEFAULT 0, -- of those, later reverted
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_session_usage_project ON session_usage(project_key, created_at DESC);
