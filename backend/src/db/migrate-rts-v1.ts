import pg from 'pg';

export async function migrateRtsV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = '033_dispatch_log_skills_used'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── Runtime skill selection telemetry column on bridge_dispatch_log ────────
    // Stores which skills were selected and injected into a dispatch prompt.
    // Shape: { candidates: SkillCandidate[], selected: SkillCandidate[] }
    await client.query(`
      ALTER TABLE bridge_dispatch_log
        ADD COLUMN IF NOT EXISTS skills_used JSONB
    `);

    // GIN index for efficient JSONB querying on skills_used
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bdl_skills_used
        ON bridge_dispatch_log USING gin(skills_used)
        WHERE skills_used IS NOT NULL
    `);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('033_dispatch_log_skills_used')`);
    await client.query('COMMIT');
    console.log('[migrate-rts] rts_v1 applied: bridge_dispatch_log.skills_used JSONB added');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
