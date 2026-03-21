import { sqlite } from './client.js';

export function migrate06RealTimeTransparency() {
  const migrationId = 'phase06_realtime_transparency';
  const existing = sqlite.prepare(
    `SELECT 1 FROM schema_migrations WHERE id = ?`
  ).get(migrationId);
  if (existing) return;

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS decision_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      decision_type TEXT NOT NULL,
      chosen TEXT NOT NULL,
      reasoning TEXT NOT NULL,
      alternatives TEXT DEFAULT '[]',
      project_id TEXT,
      agent_id TEXT,
      job_id TEXT,
      created_at REAL DEFAULT (unixepoch('now'))
    );

    CREATE TABLE IF NOT EXISTS token_usage_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model TEXT NOT NULL,
      date TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      request_count INTEGER DEFAULT 0,
      created_at REAL DEFAULT (unixepoch('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_decision_log_type ON decision_log(decision_type);
    CREATE INDEX IF NOT EXISTS idx_decision_log_created ON decision_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_token_usage_model_date ON token_usage_daily(model, date);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_token_usage_unique ON token_usage_daily(model, date);

    INSERT INTO schema_migrations (id) VALUES ('phase06_realtime_transparency');
  `);
  console.log('[migrate-06] Real-time and transparency tables created');
}
