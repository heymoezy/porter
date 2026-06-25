import pg from 'pg';

export async function migrateIntellectV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'intellect_v1'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── Extend existing tables with reference tracking ───────────────────────

    await client.query(`ALTER TABLE directives ADD COLUMN IF NOT EXISTS references_json JSONB DEFAULT '[]'`);
    await client.query(`ALTER TABLE directives ADD COLUMN IF NOT EXISTS supersedes_id TEXT`);
    await client.query(`ALTER TABLE directives ADD COLUMN IF NOT EXISTS source_session_id TEXT`);
    await client.query(`ALTER TABLE directives ADD COLUMN IF NOT EXISTS verified_at DOUBLE PRECISION`);

    await client.query(`ALTER TABLE concepts ADD COLUMN IF NOT EXISTS references_json JSONB DEFAULT '[]'`);
    await client.query(`ALTER TABLE concepts ADD COLUMN IF NOT EXISTS supersedes_id TEXT`);
    await client.query(`ALTER TABLE concepts ADD COLUMN IF NOT EXISTS verified_at DOUBLE PRECISION`);

    await client.query(`ALTER TABLE project_notes ADD COLUMN IF NOT EXISTS references_json JSONB DEFAULT '[]'`);
    await client.query(`ALTER TABLE project_notes ADD COLUMN IF NOT EXISTS verified_at DOUBLE PRECISION`);

    await client.query(`ALTER TABLE agent_notes ADD COLUMN IF NOT EXISTS references_json JSONB DEFAULT '[]'`);
    await client.query(`ALTER TABLE agent_notes ADD COLUMN IF NOT EXISTS verified_at DOUBLE PRECISION`);

    // ── Episodes (session summaries) ─────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL DEFAULT 'project',
        scope_id TEXT,
        session_id TEXT,
        gateway TEXT,
        summary TEXT NOT NULL,
        decisions_json JSONB DEFAULT '[]',
        corrections_json JSONB DEFAULT '[]',
        files_changed_json JSONB DEFAULT '[]',
        duration_seconds INTEGER,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_episodes_scope ON episodes(scope, scope_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_episodes_session ON episodes(session_id)`);
    // Surprise-salience (R3): 1 − max trigram-similarity vs recent episodes + active
    // concepts at write time. Weights recall ranking; the write-gate skips low-surprise
    // (near-dup/routine) episodes unless forced (correction/new-entity).
    await client.query(`ALTER TABLE episodes ADD COLUMN IF NOT EXISTS salience DOUBLE PRECISION DEFAULT 0.5`);
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // ── Memory references (for validation tracking) ──────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS memory_references (
        id TEXT PRIMARY KEY,
        memory_table TEXT NOT NULL,
        memory_id TEXT NOT NULL,
        ref_type TEXT NOT NULL,
        ref_value TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'valid',
        last_validated_at DOUBLE PRECISION,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_memrefs_value ON memory_references(ref_value)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_memrefs_memory ON memory_references(memory_table, memory_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_memrefs_status ON memory_references(status)`);
    // Prevent duplicate references for the same memory
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memory_references_unique') THEN
          ALTER TABLE memory_references ADD CONSTRAINT memory_references_unique UNIQUE (memory_table, memory_id, ref_type, ref_value);
        END IF;
      END $$;
    `);

    // ── Intellect events (audit trail) ───────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS intellect_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        source_type TEXT NOT NULL,
        details_json JSONB NOT NULL DEFAULT '{}',
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_intellect_events_type ON intellect_events(event_type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_intellect_events_time ON intellect_events(created_at DESC)`);

    // ── Workflows (event-triggered agent tasks) ──────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        trigger_value TEXT NOT NULL,
        agent_id TEXT,
        action_type TEXT NOT NULL,
        action_config JSONB DEFAULT '{}',
        memory_read_scopes TEXT[] DEFAULT '{}',
        memory_write_scopes TEXT[] DEFAULT '{}',
        enabled BOOLEAN DEFAULT true,
        last_run_at DOUBLE PRECISION,
        run_count INTEGER DEFAULT 0,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // ── Record migration ─────────────────────────────────────────────────────

    await client.query(
      `INSERT INTO schema_migrations (id, applied_at) VALUES ('intellect_v1', EXTRACT(EPOCH FROM NOW()))`
    );

    await client.query('COMMIT');
    console.log('[migrate] intellect_v1 applied — episodes, memory_references, intellect_events, workflows tables created');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
