import { sqlite } from './client.js';

export function migrate04AgentAutonomy() {
  // Idempotent: check schema_migrations before applying
  const applied = sqlite.prepare(
    `SELECT 1 FROM schema_migrations WHERE id = 'phase04_agent_autonomy'`
  ).get();
  if (applied) return;

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_jobs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      project_id TEXT,
      parent_agent_id TEXT,
      trigger_type TEXT NOT NULL DEFAULT 'scheduled',
      trigger_data TEXT DEFAULT '{}',
      prompt TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      scheduled_for REAL NOT NULL,
      started_at REAL,
      completed_at REAL,
      worker_id TEXT,
      attempt_count INTEGER DEFAULT 0,
      result TEXT,
      error TEXT,
      created_at REAL DEFAULT (unixepoch('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_agent_jobs_status_scheduled
    ON agent_jobs(status, scheduled_for);

    CREATE INDEX IF NOT EXISTS idx_agent_jobs_agent_id
    ON agent_jobs(agent_id);

    CREATE TABLE IF NOT EXISTS agent_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      job_id TEXT,
      project_id TEXT,
      event_type TEXT NOT NULL,
      summary TEXT,
      detail TEXT,
      created_at REAL DEFAULT (unixepoch('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_agent_activity_agent_id
    ON agent_activity(agent_id, created_at);
  `);

  // Add deadline column to projects if not exists
  const cols = sqlite.prepare(`PRAGMA table_info(projects)`).all() as { name: string }[];
  if (!cols.some(c => c.name === 'deadline')) {
    sqlite.exec(`ALTER TABLE projects ADD COLUMN deadline TEXT`);
  }

  // Mark migration complete
  sqlite.prepare(
    `INSERT INTO schema_migrations (id) VALUES ('phase04_agent_autonomy')`
  ).run();
}
