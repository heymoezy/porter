import { sqlite } from './client.js';

export function migrateAdmin01() {
  const applied = sqlite.prepare(
    "SELECT 1 FROM schema_migrations WHERE id = 'admin_01_customer_intel'"
  ).get();
  if (applied) return;

  sqlite.exec(`
    -- Customer events: login, share, invite click, feature hit, etc.
    CREATE TABLE IF NOT EXISTS customer_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      event_type TEXT NOT NULL,         -- login | share | invite_click | invite_convert | feature_gate | upgrade_prompt | social_mention
      event_data TEXT DEFAULT '{}',     -- JSON: { ip, country, url, referral_code, platform, etc }
      ip_address TEXT,
      country TEXT,
      created_at REAL DEFAULT (unixepoch('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ce_username ON customer_events(username);
    CREATE INDEX IF NOT EXISTS idx_ce_type ON customer_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_ce_created ON customer_events(created_at);

    -- Customer scores: computed periodically, cached for fast reads
    CREATE TABLE IF NOT EXISTS customer_scores (
      username TEXT PRIMARY KEY,
      health INTEGER DEFAULT 50,            -- 0-100
      conversion_score INTEGER DEFAULT 0,   -- 0-100: likelihood to upgrade
      churn_risk INTEGER DEFAULT 50,        -- 0-100: likelihood to leave
      viral_score INTEGER DEFAULT 0,        -- 0-100: referral potential
      ltv_predicted REAL DEFAULT 0,         -- 12-month predicted LTV in $
      next_action TEXT DEFAULT '',           -- AI-recommended next step
      computed_at REAL DEFAULT (unixepoch('now'))
    );

    INSERT INTO schema_migrations (id) VALUES ('admin_01_customer_intel');
  `);

  console.log('[migrate] admin_01_customer_intel applied');
}
