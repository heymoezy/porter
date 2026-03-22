import { sqlite } from './client.js';

export function migrate12CrmIntelligence(): void {
  const migrationId = 'phase12_crm_intelligence';
  const existing = sqlite.prepare(
    `SELECT 1 FROM schema_migrations WHERE id = ?`
  ).get(migrationId);
  if (existing) return;

  // 1. contact_analyses — AI-generated CRM intelligence per contact
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS contact_analyses (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      sentiment TEXT NOT NULL CHECK(sentiment IN ('positive','neutral','negative')),
      engagement_score INTEGER NOT NULL CHECK(engagement_score BETWEEN 0 AND 100),
      churn_risk TEXT NOT NULL CHECK(churn_risk IN ('low','medium','high')),
      relationship_stage TEXT NOT NULL CHECK(relationship_stage IN ('new','active','at-risk','churned')),
      key_topics TEXT NOT NULL DEFAULT '[]',
      last_interaction_summary TEXT,
      communication_style TEXT,
      raw_json TEXT,
      job_id TEXT,
      created_at REAL DEFAULT (unixepoch('now'))
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_ca_contact ON contact_analyses(contact_id, created_at DESC)`);

  // 2. agent_templates — catalog of pre-built agent templates (100+)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      skills TEXT NOT NULL DEFAULT '[]',
      tools TEXT NOT NULL DEFAULT '[]',
      required_backends TEXT NOT NULL DEFAULT '[]',
      required_tools TEXT NOT NULL DEFAULT '[]',
      system_prompt TEXT NOT NULL DEFAULT '',
      soul_text TEXT NOT NULL DEFAULT '',
      role_card_text TEXT NOT NULL DEFAULT '',
      identity_text TEXT NOT NULL DEFAULT '',
      skills_text TEXT NOT NULL DEFAULT '',
      is_internal INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER DEFAULT 50,
      created_at REAL DEFAULT (unixepoch('now'))
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_at_category ON agent_templates(category)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_at_internal ON agent_templates(is_internal)`);

  // 3. personas ALTER — add template_id to track which template created an agent
  //    SQLite does not support ALTER TABLE ... ADD COLUMN IF NOT EXISTS
  //    so we wrap in try/catch to be idempotent
  try {
    sqlite.exec('ALTER TABLE personas ADD COLUMN template_id TEXT');
  } catch {
    // Column already exists — safe to ignore
  }

  sqlite.prepare(`INSERT INTO schema_migrations (id) VALUES (?)`).run(migrationId);
  console.log('[migrate-12] CRM intelligence + agent templates: 2 tables + 1 ALTER created');
}
