import pg from 'pg';

export async function migrateFbkV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = '034_skill_feedback_events'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── skill_feedback_events table ─────────────────────────────────────────────
    // Stores per-dispatch skill feedback events (thumbs-up/down, correction, etc.)
    // No FK constraints — consistent with existing schema conventions.
    await client.query(`
      CREATE TABLE IF NOT EXISTS skill_feedback_events (
        id TEXT PRIMARY KEY,
        persona_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        dispatch_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        note TEXT,
        created_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // Indexes for common query patterns
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sfe_persona_skill
        ON skill_feedback_events (persona_id, skill_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sfe_dispatch
        ON skill_feedback_events (dispatch_id)
    `);

    // ── persona_skills counter columns ─────────────────────────────────────────
    // Phase 34: feedback telemetry counters + effectiveness tracking
    await client.query(`
      ALTER TABLE persona_skills
        ADD COLUMN IF NOT EXISTS times_selected INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS times_completed INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS positive_feedback_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS negative_feedback_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_used_at DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS effectiveness_score DOUBLE PRECISION
    `);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('034_skill_feedback_events')`);
    await client.query('COMMIT');
    console.log('[migrate-fbk] fbk_v1 applied: skill_feedback_events table + persona_skills counter columns added');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
