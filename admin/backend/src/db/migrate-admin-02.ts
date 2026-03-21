import { sqlite } from './client.js';

export function migrateAdmin02() {
  const applied = sqlite.prepare(
    "SELECT 1 FROM schema_migrations WHERE id = 'admin_02_crm_fields'"
  ).get();
  if (applied) return;

  sqlite.exec(`
    -- CRM enrichment fields on users
    ALTER TABLE users ADD COLUMN country TEXT;
    ALTER TABLE users ADD COLUMN city TEXT;
    ALTER TABLE users ADD COLUMN timezone TEXT;
    ALTER TABLE users ADD COLUMN company TEXT;
    ALTER TABLE users ADD COLUMN job_title TEXT;
    ALTER TABLE users ADD COLUMN phone TEXT;
    ALTER TABLE users ADD COLUMN bio TEXT;
    ALTER TABLE users ADD COLUMN social_x TEXT;
    ALTER TABLE users ADD COLUMN social_linkedin TEXT;
    ALTER TABLE users ADD COLUMN social_github TEXT;
    ALTER TABLE users ADD COLUMN avatar_url TEXT;
    ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en';
    ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN suspended_at REAL;
    ALTER TABLE users ADD COLUMN suspension_reason TEXT;
    ALTER TABLE users ADD COLUMN terms_accepted_at REAL;
    ALTER TABLE users ADD COLUMN last_ip TEXT;
    ALTER TABLE users ADD COLUMN signup_source TEXT;

    -- Admin agent tasks queue
    CREATE TABLE IF NOT EXISTS admin_agent_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_type TEXT NOT NULL,          -- growth | retention | security | social
      action_type TEXT NOT NULL,         -- send_upgrade_nudge | send_reengagement | force_logout | post_to_x | etc
      target_username TEXT,              -- which customer this is about (null for non-customer tasks)
      status TEXT DEFAULT 'queued',      -- queued | running | completed | failed | skipped
      priority INTEGER DEFAULT 50,      -- 0-100, higher = more urgent
      payload TEXT DEFAULT '{}',         -- JSON: action-specific data
      result TEXT,                       -- outcome description
      created_at REAL DEFAULT (unixepoch('now')),
      started_at REAL,
      completed_at REAL
    );
    CREATE INDEX IF NOT EXISTS idx_aat_status ON admin_agent_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_aat_agent ON admin_agent_tasks(agent_type);

    INSERT INTO schema_migrations (id) VALUES ('admin_02_crm_fields');
  `);

  console.log('[migrate] admin_02_crm_fields applied');
}
