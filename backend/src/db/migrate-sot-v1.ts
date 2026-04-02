import pg from 'pg';

export async function migrateSotV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = '031_persona_skills_add_skill_id'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── Add skill_id column to persona_skills ───────────────────────────────
    await client.query(`
      ALTER TABLE persona_skills ADD COLUMN IF NOT EXISTS skill_id TEXT
    `);

    // ── Idempotency footer ──────────────────────────────────────────────────
    await client.query(`INSERT INTO schema_migrations (id) VALUES ('031_persona_skills_add_skill_id')`);
    await client.query('COMMIT');
    console.log('[migrate-sot] 031_persona_skills_add_skill_id applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
