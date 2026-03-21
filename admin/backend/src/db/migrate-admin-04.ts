import { sqlite } from './client.js';

export function migrateAdmin04() {
  const tag = 'admin_04_email_system';
  const exists = sqlite.prepare("SELECT 1 FROM schema_migrations WHERE id = ?").get(tag);
  if (exists) return;

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS email_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder TEXT NOT NULL DEFAULT 'drafts',
      from_email TEXT NOT NULL DEFAULT '',
      from_name TEXT NOT NULL DEFAULT '',
      to_email TEXT NOT NULL DEFAULT '',
      to_name TEXT NOT NULL DEFAULT '',
      cc TEXT NOT NULL DEFAULT '',
      bcc TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      body_html TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      sent_at REAL,
      read_at REAL,
      error TEXT,
      in_reply_to INTEGER,
      thread_id TEXT,
      created_at REAL NOT NULL DEFAULT (unixepoch('now')),
      updated_at REAL NOT NULL DEFAULT (unixepoch('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_email_folder ON email_messages(folder);
    CREATE INDEX IF NOT EXISTS idx_email_status ON email_messages(status);
    CREATE INDEX IF NOT EXISTS idx_email_thread ON email_messages(thread_id);
  `);

  sqlite.prepare("INSERT INTO schema_migrations (id) VALUES (?)").run(tag);
  console.log(`[migrate] ${tag} applied`);
}
