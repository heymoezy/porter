import { sqlite } from './client.js';

export function migrateAdmin03() {
  const applied = sqlite.prepare(
    "SELECT 1 FROM schema_migrations WHERE id = 'admin_03_error_tracking'"
  ).get();
  if (applied) return;

  sqlite.exec(`
    -- Client and server errors for self-diagnosis
    CREATE TABLE IF NOT EXISTS error_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,               -- client_js | server_api | server_unhandled | agent_error
      severity TEXT DEFAULT 'error',      -- error | warning | critical
      message TEXT NOT NULL,
      stack TEXT,
      url TEXT,                           -- page URL or API endpoint that triggered it
      username TEXT,                      -- who hit it (null if unauthenticated)
      user_agent TEXT,
      ip_address TEXT,
      metadata TEXT DEFAULT '{}',         -- JSON: { component, action, request_body, response_code, etc }
      resolved INTEGER DEFAULT 0,        -- 0 = open, 1 = resolved
      resolved_by TEXT,                  -- who/what resolved it
      resolved_at REAL,
      created_at REAL DEFAULT (unixepoch('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_el_source ON error_log(source);
    CREATE INDEX IF NOT EXISTS idx_el_resolved ON error_log(resolved);
    CREATE INDEX IF NOT EXISTS idx_el_created ON error_log(created_at);

    INSERT INTO schema_migrations (id) VALUES ('admin_03_error_tracking');
  `);

  console.log('[migrate] admin_03_error_tracking applied');
}
