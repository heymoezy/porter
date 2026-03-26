import pg from 'pg';

export async function migrateTemplateColumns(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    const applied = await client.query(
      "SELECT 1 FROM schema_migrations WHERE id = 'template_columns_v1'"
    );
    if (applied.rows.length > 0) return;

    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS archetype TEXT DEFAULT 'navigator'
    `);
    await client.query(`
      ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS appearance_style TEXT DEFAULT 'minecraft'
    `);
    await client.query(`
      ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS appearance_spec JSONB DEFAULT '{}'::jsonb
    `);
    await client.query(`
      ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS communication_style TEXT DEFAULT ''
    `);

    await client.query(
      "INSERT INTO schema_migrations (id) VALUES ('template_columns_v1') ON CONFLICT DO NOTHING"
    );

    await client.query('COMMIT');
    console.log('[migrate] template_columns_v1 applied — 4 columns added to agent_templates');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
