import pg from 'pg';

export async function migrateQltV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = '036_skill_quality_scoring'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── skills quality columns ─────────────────────────────────────────
    // Phase 36: measurable quality_score (0-100) and tiers
    await client.query(`
      ALTER TABLE skills
        ADD COLUMN IF NOT EXISTS quality_score DOUBLE PRECISION DEFAULT 0,
        ADD COLUMN IF NOT EXISTS quality_tier TEXT DEFAULT 'scaffold'
    `);

    // Add index for filtering by tier
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_skills_quality_tier
        ON skills (quality_tier)
    `);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('036_skill_quality_scoring')`);
    await client.query('COMMIT');
    console.log('[migrate-qlt] qlt_v1 applied: skills quality columns added');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
