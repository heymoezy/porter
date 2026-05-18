-- Migration 051: Recall doc-summary cache columns
-- Adds a cached LLM extraction to recall_doc_sources so repeated asks against
-- the same document don't re-spend codex tokens. The structured extraction is:
--
--   {
--     "summary":      string,     // 1-3 paragraph plain-language summary
--     "doc_type":     string,     // e.g. "subscription_agreement", "registered_agent_agreement", "kyc_passport", "financial_statement"
--     "entities": {
--       "people":         string[],
--       "organizations":  string[],
--       "dates":          string[],   // ISO-ish
--       "amounts": [
--         { "value": number, "currency": string, "context": string }
--       ]
--     },
--     "key_facts":    string[]    // bullet-tier statements grounded in the doc
--   }
--
-- model_used + generated_at let the next phase decide whether to refresh
-- (e.g. when a better model lands, or on operator force_refresh=true).
--
-- Companion TS runner: backend/src/db/migrate-recall-doc-summary-v1.ts.
--
-- Rollback (manual):
--   ALTER TABLE recall_doc_sources
--     DROP COLUMN IF EXISTS summary,
--     DROP COLUMN IF EXISTS summary_at,
--     DROP COLUMN IF EXISTS summary_model;
--   DELETE FROM schema_migrations WHERE id = 'recall_doc_summary_v1';

ALTER TABLE recall_doc_sources
  ADD COLUMN IF NOT EXISTS summary       JSONB,
  ADD COLUMN IF NOT EXISTS summary_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS summary_model TEXT;

CREATE INDEX IF NOT EXISTS idx_recall_doc_sources_summary_null
  ON recall_doc_sources (id)
  WHERE summary IS NULL;
