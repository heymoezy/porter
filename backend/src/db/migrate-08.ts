import { sqlite } from './client.js';

export function migrate08ApiFoundation(): void {
  const migrationId = 'phase08_api_foundation';
  const existing = sqlite.prepare(
    `SELECT 1 FROM schema_migrations WHERE id = ?`
  ).get(migrationId);
  if (existing) return;

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS frontend_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      stack TEXT,
      component TEXT,
      severity TEXT NOT NULL DEFAULT 'error',
      user_id TEXT,
      url TEXT,
      metadata TEXT DEFAULT '{}',
      created_at REAL DEFAULT (unixepoch('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_frontend_errors_severity ON frontend_errors(severity);
    CREATE INDEX IF NOT EXISTS idx_frontend_errors_component ON frontend_errors(component);
    CREATE INDEX IF NOT EXISTS idx_frontend_errors_created_at ON frontend_errors(created_at);

    INSERT INTO schema_migrations (id) VALUES ('phase08_api_foundation');
  `);
  console.log('[migrate-08] API Foundation tables created (frontend_errors)');
}
