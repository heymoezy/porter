import { sqlite } from './client.js';

export function migrate13AutonomousLearning(): void {
  const migrationId = 'phase13_autonomous_learning';
  const existing = sqlite.prepare(
    `SELECT 1 FROM schema_migrations WHERE id = ?`
  ).get(migrationId);
  if (existing) return;

  // 1. concepts — Memory V2 general-purpose relational store
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS concepts (
      id TEXT PRIMARY KEY,
      memory_kind TEXT NOT NULL DEFAULT 'concept'
        CHECK(memory_kind IN ('directive','concept','episode','signal')),
      trust_tier TEXT NOT NULL DEFAULT 'low'
        CHECK(trust_tier IN ('low','medium','high')),
      scope TEXT NOT NULL DEFAULT 'global'
        CHECK(scope IN ('global','project','agent','run')),
      scope_id TEXT,
      content TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'learning'
        CHECK(source_type IN ('learning','dispatch','session','human','operator')),
      source_url TEXT,
      confidence_score INTEGER NOT NULL DEFAULT 0
        CHECK(confidence_score BETWEEN 0 AND 100),
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('active','archived','superseded','dismissed')),
      review_state TEXT NOT NULL DEFAULT 'accepted'
        CHECK(review_state IN ('pending','accepted','rejected')),
      superseded_by_id TEXT,
      last_used_at REAL,
      use_count INTEGER NOT NULL DEFAULT 0,
      session_id TEXT,
      created_at REAL DEFAULT (unixepoch('now')),
      updated_at REAL DEFAULT (unixepoch('now'))
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_concepts_scope ON concepts(scope, scope_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_concepts_status ON concepts(status, trust_tier)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_concepts_session ON concepts(session_id)`);

  // 2. concepts_fts — FTS5 virtual table for full-text search on concepts.content
  //    content_rowid='rowid' references SQLite's implicit INTEGER rowid (same as Phase 11 messages_fts)
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS concepts_fts USING fts5(
      content,
      content_rowid='rowid',
      content='concepts'
    )
  `);

  // FTS5 sync triggers (AFTER INSERT, AFTER DELETE, AFTER UPDATE)
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS concepts_ai AFTER INSERT ON concepts BEGIN
      INSERT INTO concepts_fts(rowid, content) VALUES (new.rowid, new.content);
    END
  `);
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS concepts_ad AFTER DELETE ON concepts BEGIN
      INSERT INTO concepts_fts(concepts_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
    END
  `);
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS concepts_au AFTER UPDATE ON concepts BEGIN
      INSERT INTO concepts_fts(concepts_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
      INSERT INTO concepts_fts(rowid, content) VALUES (new.rowid, new.content);
    END
  `);

  // 3. learning_sessions — audit log per template research run
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS learning_sessions (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
      job_id TEXT,
      sources_visited TEXT NOT NULL DEFAULT '[]',
      concepts_retained INTEGER NOT NULL DEFAULT 0,
      confidence_distribution TEXT NOT NULL DEFAULT '{"high":0,"medium":0,"low":0}',
      capped INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      error TEXT,
      created_at REAL DEFAULT (unixepoch('now'))
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_ls_template ON learning_sessions(template_id, created_at DESC)`);

  sqlite.prepare(`INSERT INTO schema_migrations (id) VALUES (?)`).run(migrationId);
  console.log('[migrate-13] concepts + learning_sessions + FTS5: created');
}
