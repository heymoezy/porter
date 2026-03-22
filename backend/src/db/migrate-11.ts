import { sqlite } from './client.js';

export function migrate11UnifiedChat(): void {
  const migrationId = 'phase11_unified_chat';
  const existing = sqlite.prepare(
    `SELECT 1 FROM schema_migrations WHERE id = ?`
  ).get(migrationId);
  if (existing) return;

  // 1. companies
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      industry TEXT,
      website TEXT,
      notes TEXT,
      created_by TEXT,
      created_at REAL DEFAULT (unixepoch('now')),
      updated_at REAL DEFAULT (unixepoch('now'))
    )
  `);

  // 2. contacts
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      company_id TEXT,
      job_title TEXT,
      notes TEXT,
      created_by TEXT,
      created_at REAL DEFAULT (unixepoch('now')),
      updated_at REAL DEFAULT (unixepoch('now'))
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id)`);

  // 3. contact_emails
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS contact_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id TEXT NOT NULL,
      value TEXT NOT NULL,
      label TEXT DEFAULT 'work',
      is_primary INTEGER DEFAULT 0
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_ce_contact ON contact_emails(contact_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_ce_value ON contact_emails(value)`);

  // 4. contact_phones
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS contact_phones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id TEXT NOT NULL,
      value TEXT NOT NULL,
      country_code TEXT,
      label TEXT DEFAULT 'mobile',
      is_primary INTEGER DEFAULT 0
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_cp_contact ON contact_phones(contact_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_cp_value ON contact_phones(value)`);

  // 5. contact_social
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS contact_social (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      handle TEXT NOT NULL
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_cs_contact ON contact_social(contact_id)`);
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cs_contact_platform ON contact_social(contact_id, platform)`);

  // 6. conversations
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL CHECK(scope_type IN ('project','agent','contact','global')),
      scope_id TEXT,
      title TEXT,
      channel_type TEXT DEFAULT 'internal',
      external_id TEXT,
      metadata TEXT DEFAULT '{}',
      created_at REAL DEFAULT (unixepoch('now')),
      updated_at REAL DEFAULT (unixepoch('now'))
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_conv_scope ON conversations(scope_type, scope_id, updated_at DESC)`);
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_external ON conversations(external_id) WHERE external_id IS NOT NULL`);

  // 7. messages
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      parent_message_id INTEGER,
      sender_type TEXT NOT NULL CHECK(sender_type IN ('user','agent','external','system')),
      sender_id TEXT,
      sender_name TEXT,
      content TEXT NOT NULL,
      channel_type TEXT DEFAULT 'internal',
      channel_metadata TEXT DEFAULT '{}',
      created_at REAL DEFAULT (unixepoch('now'))
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at ASC)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_msg_parent ON messages(parent_message_id) WHERE parent_message_id IS NOT NULL`);

  // 8. FTS5 virtual table for full-text search on messages
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
      USING fts5(content, sender_name, channel_type, tokenize='porter unicode61')
  `);

  // 9. FTS5 sync triggers (insert, delete, update)
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_fts_insert
      AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, content, sender_name, channel_type)
        VALUES (new.id, new.content, COALESCE(new.sender_name,''), COALESCE(new.channel_type,'internal'));
      END
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_fts_delete
      BEFORE DELETE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content, sender_name, channel_type)
        VALUES ('delete', old.id, old.content, COALESCE(old.sender_name,''), COALESCE(old.channel_type,'internal'));
      END
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_fts_update
      AFTER UPDATE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content, sender_name, channel_type)
        VALUES ('delete', old.id, old.content, COALESCE(old.sender_name,''), COALESCE(old.channel_type,'internal'));
        INSERT INTO messages_fts(rowid, content, sender_name, channel_type)
        VALUES (new.id, new.content, COALESCE(new.sender_name,''), COALESCE(new.channel_type,'internal'));
      END
  `);

  // 10. files registry
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      disk_path TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      uploaded_by TEXT NOT NULL,
      created_at REAL DEFAULT (unixepoch('now'))
    )
  `);

  // 11. file junction tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS file_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      attached_by TEXT NOT NULL,
      attached_at REAL DEFAULT (unixepoch('now'))
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_fp_project ON file_projects(project_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_fp_file ON file_projects(file_id)`);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS file_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      attached_by TEXT NOT NULL,
      attached_at REAL DEFAULT (unixepoch('now'))
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_fc_contact ON file_contacts(contact_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_fc_file ON file_contacts(file_id)`);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS file_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      attached_by TEXT NOT NULL,
      attached_at REAL DEFAULT (unixepoch('now'))
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_fconv_conv ON file_conversations(conversation_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_fconv_file ON file_conversations(file_id)`);

  // 12. Contact linkage tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS contact_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL
    )
  `);
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cc_pair ON contact_conversations(contact_id, conversation_id)`);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS contact_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id TEXT NOT NULL,
      project_id TEXT NOT NULL
    )
  `);
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cpj_pair ON contact_projects(contact_id, project_id)`);

  sqlite.prepare(`INSERT INTO schema_migrations (id) VALUES (?)`).run(migrationId);
  console.log('[migrate-11] Unified chat, CRM, and files: 14 tables + FTS5 created');
}
