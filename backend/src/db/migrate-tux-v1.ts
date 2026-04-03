import pg from 'pg';

export async function migrateTuxV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = '037_template_skill_ux'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── template_skills UX columns ─────────────────────────────────────────
    // Phase 37: is_mandatory flag and assignment_rationale for skill authoring
    await client.query(`
      ALTER TABLE template_skills
        ADD COLUMN IF NOT EXISTS is_mandatory INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS assignment_rationale TEXT DEFAULT ''
    `);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('037_template_skill_ux')`);
    await client.query('COMMIT');
    console.log('[migrate-tux] tux_v1 applied: template_skills is_mandatory + assignment_rationale columns added');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
