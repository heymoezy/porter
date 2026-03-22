import { sqlite } from './client.js';

export function migrate10Collaboration(): void {
  const migrationId = 'phase10_collaboration';
  const existing = sqlite.prepare(
    `SELECT 1 FROM schema_migrations WHERE id = ?`
  ).get(migrationId);
  if (existing) return;

  // Check if project_collaborators already exists but with legacy schema (no email column)
  // If so, rename it out of the way and create the new schema
  const pcCols = sqlite.prepare(`PRAGMA table_info(project_collaborators)`).all() as Array<{ name: string }>;
  const hasEmail = pcCols.some(c => c.name === 'email');
  const hasInviteToken = pcCols.some(c => c.name === 'invite_token');

  if (pcCols.length > 0 && (!hasEmail || !hasInviteToken)) {
    // Legacy table exists with wrong schema — rename it and recreate
    sqlite.exec(`ALTER TABLE project_collaborators RENAME TO project_collaborators_v1_legacy`);
    // Drop legacy indexes that referenced the old table name
    const legacyIdxs = sqlite.prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='project_collaborators_v1_legacy'`
    ).all() as Array<{ name: string }>;
    for (const idx of legacyIdxs) {
      // Cannot drop auto indexes; only named indexes
      if (!idx.name.startsWith('sqlite_autoindex_')) {
        sqlite.exec(`DROP INDEX IF EXISTS ${idx.name}`);
      }
    }
  }

  // project_collaborators table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS project_collaborators (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      username TEXT,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      invite_token TEXT,
      invited_by TEXT NOT NULL,
      invited_at REAL DEFAULT (unixepoch('now')),
      accepted_at REAL,
      revoked_at REAL,
      revoked_by TEXT,
      last_drip_at REAL,
      drip_count INTEGER DEFAULT 0,
      created_at REAL DEFAULT (unixepoch('now')),
      updated_at REAL DEFAULT (unixepoch('now'))
    )
  `);

  // Indexes for project_collaborators
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_pc_project_status ON project_collaborators(project_id, status)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_pc_username_status ON project_collaborators(username, status)`);
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pc_token ON project_collaborators(invite_token) WHERE invite_token IS NOT NULL`);
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pc_project_email ON project_collaborators(project_id, email)`);

  // collaboration_events audit table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS collaboration_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      collaborator_id TEXT NOT NULL,
      actor_username TEXT NOT NULL,
      event_type TEXT NOT NULL,
      previous_role TEXT,
      new_role TEXT,
      detail TEXT,
      created_at REAL DEFAULT (unixepoch('now'))
    )
  `);

  // Indexes for collaboration_events
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_ce_project ON collaboration_events(project_id, created_at DESC)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_ce_collaborator ON collaboration_events(collaborator_id, created_at DESC)`);

  // Backfill: insert existing project owners as active collaborators
  // Use LEFT JOIN to get email from users table; fallback to placeholder if no email set
  sqlite.exec(`
    INSERT OR IGNORE INTO project_collaborators (
      id, project_id, username, email, role, status, invited_by, invited_at, accepted_at, created_at, updated_at
    )
    SELECT
      lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
      p.id,
      p.owner_id,
      COALESCE(u.email, p.owner_id || '@placeholder.porter'),
      'owner',
      'active',
      p.owner_id,
      p.created_at,
      p.created_at,
      p.created_at,
      p.created_at
    FROM projects p
    LEFT JOIN users u ON u.username = p.owner_id
  `);

  sqlite.prepare(`INSERT INTO schema_migrations (id) VALUES (?)`).run(migrationId);
  console.log('[migrate-10] Collaboration: project_collaborators and collaboration_events tables, owner backfill complete');
}
