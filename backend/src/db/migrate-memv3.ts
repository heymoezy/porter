import pg from 'pg';
import { randomUUID } from 'crypto';

export async function migrateMemoryV3(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'memory_v3'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // Enable pg_trgm for trigram similarity search (used by Memory V3 consolidation)
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // Add migrated_to_v3 column to concepts (idempotent: IF NOT EXISTS)
    await client.query(`
      ALTER TABLE concepts ADD COLUMN IF NOT EXISTS migrated_to_v3 INTEGER DEFAULT 0
    `);

    // ── directives table ──────────────────────────────────────────────────────
    // scope: 'workspace' | 'project'
    // source_type: 'system' | 'human' | 'agent' | 'email' | 'file' | 'external'
    // status: 'active' | 'archived'
    await client.query(`
      CREATE TABLE IF NOT EXISTS directives (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL DEFAULT 'workspace',
        scope_id TEXT,
        content TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 50,
        source_type TEXT NOT NULL DEFAULT 'system',
        status TEXT NOT NULL DEFAULT 'active',
        created_by TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_directives_scope ON directives(scope, status)
    `);

    // ── project_notes table ───────────────────────────────────────────────────
    // note_type: 'state' | 'decision' | 'constraint'
    // source_type: 'agent' | 'human' | 'system' | 'email' | 'file' | 'external'
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_notes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        content TEXT NOT NULL,
        note_type TEXT NOT NULL DEFAULT 'state',
        confidence_score INTEGER NOT NULL DEFAULT 70,
        source_type TEXT NOT NULL DEFAULT 'agent',
        status TEXT NOT NULL DEFAULT 'active',
        created_by TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_project_notes_project ON project_notes(project_id, status)
    `);

    // ── agent_notes table ─────────────────────────────────────────────────────
    // note_type: 'learning' | 'directive' | 'constraint'
    // source_type: 'learning' | 'self_edit' | 'human' | 'email' | 'file' | 'external'
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_notes (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        content TEXT NOT NULL,
        note_type TEXT NOT NULL DEFAULT 'learning',
        confidence_score INTEGER NOT NULL DEFAULT 50,
        source_type TEXT NOT NULL DEFAULT 'learning',
        status TEXT NOT NULL DEFAULT 'active',
        superseded_by_id TEXT,
        created_by TEXT,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_notes_agent ON agent_notes(agent_id, status)
    `);

    // Extra index on concepts for admin overview query performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_concepts_scope ON concepts(scope, scope_id, status)
    `);

    // ── Data migration: accepted concepts -> structured tables ─────────────────
    // Select accepted active concepts not yet migrated
    const { rows: conceptRows } = await client.query(`
      SELECT id, memory_kind, scope, scope_id, content, source_type, confidence_score
      FROM concepts
      WHERE review_state = 'accepted'
        AND status = 'active'
        AND (migrated_to_v3 = 0 OR migrated_to_v3 IS NULL)
    `);

    const migratedIds: string[] = [];

    for (const row of conceptRows) {
      if (row.memory_kind === 'directive') {
        // Migrate directives (workspace-scoped operating rules)
        await client.query(
          `INSERT INTO directives (id, scope, content, priority, source_type, created_by)
           VALUES ($1, 'workspace', $2, 50, 'system', 'migration')`,
          [randomUUID(), row.content]
        );
        migratedIds.push(row.id);
      } else if (row.scope === 'agent' && row.scope_id) {
        // concepts.scope_id is a template_id — look up the persona that was forged from it
        const { rows: personaRows } = await client.query(
          `SELECT id FROM personas WHERE template_id = $1 LIMIT 1`,
          [row.scope_id]
        );
        if (personaRows.length > 0) {
          await client.query(
            `INSERT INTO agent_notes (id, agent_id, content, note_type, confidence_score, source_type, created_by)
             VALUES ($1, $2, $3, 'learning', $4, $5, 'migration')`,
            [randomUUID(), personaRows[0].id, row.content, row.confidence_score ?? 50, row.source_type ?? 'learning']
          );
          migratedIds.push(row.id);
        }
        // If no persona found for this template_id, skip — concept stays in concepts table only
      } else if (row.scope === 'project' && row.scope_id) {
        await client.query(
          `INSERT INTO project_notes (id, project_id, content, note_type, confidence_score, source_type, created_by)
           VALUES ($1, $2, $3, 'state', $4, $5, 'migration')`,
          [randomUUID(), row.scope_id, row.content, row.confidence_score ?? 70, row.source_type ?? 'agent']
        );
        migratedIds.push(row.id);
      }
      // All other concepts (global, etc.) stay in concepts table only
    }

    // Mark migrated concepts so re-runs are idempotent
    if (migratedIds.length > 0) {
      await client.query(
        `UPDATE concepts SET migrated_to_v3 = 1 WHERE id = ANY($1)`,
        [migratedIds]
      );
    }

    console.log(`[migrate] memory_v3: migrated ${migratedIds.length} concepts to structured tables`);

    // Record migration as complete
    await client.query(`INSERT INTO schema_migrations (id) VALUES ('memory_v3')`);

    await client.query('COMMIT');
    console.log('[migrate] memory_v3 applied — directives, project_notes, agent_notes tables created');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
