import pg from 'pg';

export async function migrateEvoV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = '035_skill_evolution_proposals'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── skill_evolution_proposals table ─────────────────────────────────────────
    // Stores AI-generated proposals for skill changes (add, remove, rewrite, enrich).
    // Status lifecycle: pending → approved | rejected
    // No FK constraints — consistent with existing schema conventions.
    await client.query(`
      CREATE TABLE IF NOT EXISTS skill_evolution_proposals (
        id TEXT PRIMARY KEY,
        persona_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        change_type TEXT NOT NULL,
        proposed_change JSONB NOT NULL,
        reasoning TEXT NOT NULL,
        triggering_feedback_ids TEXT[] NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        reviewed_at DOUBLE PRECISION,
        reviewed_by TEXT
      )
    `);

    // Index for listing pending proposals per agent
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sep_persona_status
        ON skill_evolution_proposals (persona_id, status)
    `);

    // Index for listing all pending proposals (admin queue view)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sep_status
        ON skill_evolution_proposals (status)
    `);

    // ── skill_evolution_events table ─────────────────────────────────────────────
    // Audit log of actual skill mutations that occurred (from approvals or manual triggers).
    // proposal_id is nullable to support manually triggered events.
    await client.query(`
      CREATE TABLE IF NOT EXISTS skill_evolution_events (
        id TEXT PRIMARY KEY,
        persona_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        proposal_id TEXT,
        change_type TEXT NOT NULL,
        change_detail JSONB NOT NULL,
        triggered_by TEXT[] NOT NULL DEFAULT '{}',
        effectiveness_before DOUBLE PRECISION,
        effectiveness_after DOUBLE PRECISION,
        created_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    // Index for querying evolution history per agent
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_see_persona
        ON skill_evolution_events (persona_id)
    `);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('035_skill_evolution_proposals')`);
    await client.query('COMMIT');
    console.log('[migrate-evo] evo_v1 applied: skill_evolution_proposals + skill_evolution_events tables created');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
