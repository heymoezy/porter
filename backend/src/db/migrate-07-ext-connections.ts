import { sqlite } from './client.js';

export function migrate07ExternalConnections() {
  const migrationId = 'phase07_external_connections';

  // Guard: idempotent — safe on repeated server restarts
  const existing = sqlite.prepare(
    `SELECT 1 FROM schema_migrations WHERE id = ?`
  ).get(migrationId);
  if (existing) return;

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workspace_connections (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'api_key',
      status TEXT NOT NULL DEFAULT 'disconnected',
      display_name TEXT DEFAULT '',
      scopes_json TEXT DEFAULT '[]',
      tools_json TEXT DEFAULT '[]',
      last_sync_at REAL DEFAULT 0,
      last_error TEXT DEFAULT '',
      installed_by TEXT DEFAULT '',
      meta_json TEXT DEFAULT '{}',
      created_at REAL NOT NULL DEFAULT (strftime('%s','now')),
      updated_at REAL NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS project_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      access_mode TEXT NOT NULL DEFAULT 'read',
      enabled_tools_json TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      attached_by TEXT DEFAULT '',
      attached_at REAL NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(project_id, connection_id)
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      project_id TEXT,
      google_event_id TEXT NOT NULL,
      title TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT,
      all_day INTEGER DEFAULT 0,
      synced_at REAL DEFAULT (unixepoch('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_calendar_events_project ON calendar_events(project_id, start_at);
  `);

  // Add meta_encrypted column to workspace_connections if it doesn't exist yet
  const cols = sqlite.prepare(`PRAGMA table_info(workspace_connections)`).all() as { name: string }[];
  if (!cols.some(c => c.name === 'meta_encrypted')) {
    sqlite.exec(`ALTER TABLE workspace_connections ADD COLUMN meta_encrypted INTEGER DEFAULT 0`);
  }

  // Mark migration complete
  sqlite.prepare(
    `INSERT INTO schema_migrations (id) VALUES (?)`
  ).run(migrationId);

  console.log('[migrate-07] External connections tables ready');
}
