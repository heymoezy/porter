/**
 * migrate-silos-v1.ts — Phase 48.1 Silo Foundation schema
 *
 * Creates:
 *   1. silos               — per-domain registry (display name, prompt path, detect rules, default model, cadence)
 *   2. session_silo_overrides — per-CLI-session silo override store (24h TTL handled at read time)
 *   3. directive_immutable_moe_direct trigger — protects source_type='moe-direct' directives from
 *      automated UPDATE/DELETE. Mirrors personas_template_born_check pattern. Bypass via
 *      `SET LOCAL porter.allow_moe_direct_mutation = 'true'` for explicit admin operations.
 *
 * Seeds:
 *   silos.software with the detect_rules from research/porter-dreams-pipeline.md
 *
 * Idempotent: schema_migrations.id='silos_v1' guard; CREATE TABLE IF NOT EXISTS;
 * INSERT ... ON CONFLICT DO NOTHING; CREATE OR REPLACE FUNCTION; DROP TRIGGER IF EXISTS.
 */

import pg from 'pg';

export async function migrateSilosV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'silos_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── silos table ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS silos (
        id              TEXT PRIMARY KEY,
        display_name    TEXT NOT NULL,
        description     TEXT,
        prompt_path     TEXT,
        cadence_seconds INTEGER NOT NULL DEFAULT 604800,
        default_model   TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
        detect_rules    JSONB NOT NULL DEFAULT '{}'::jsonb,
        enabled         BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('[migrate-silos-v1] table silos ready');

    // ── seed software row ─────────────────────────────────────────────────
    await client.query(
      `
      INSERT INTO silos (id, display_name, description, prompt_path, cadence_seconds, default_model, detect_rules, enabled)
      VALUES (
        'software',
        'Software Development',
        'All code-bearing projects: TS/Py/Go/Rust/Sh/SQL, IDE work, infra, deployment.',
        'backend/src/services/intellect/dream-prompts/software.md',
        604800,
        'claude-sonnet-4-6',
        $1::jsonb,
        TRUE
      )
      ON CONFLICT (id) DO NOTHING
      `,
      [JSON.stringify({
        project_types: ['website', 'app', 'api', 'library'],
        file_globs: ['*.ts', '*.tsx', '*.py', '*.go', '*.rs', '*.sql', '*.sh'],
        cwd_markers: ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', '.git'],
      })],
    );
    console.log('[migrate-silos-v1] software seed row inserted (or already present)');

    // ── session_silo_overrides table ──────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS session_silo_overrides (
        session_id TEXT PRIMARY KEY,
        silo_id    TEXT,
        set_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS session_silo_overrides_set_at_idx
        ON session_silo_overrides(set_at)
    `);
    console.log('[migrate-silos-v1] table session_silo_overrides ready');

    // ── directive_immutable_moe_direct trigger ─────────────────────────────
    // Function: BEFORE UPDATE OR DELETE on directives. Guards OLD.source_type.
    // Bypass: SET LOCAL porter.allow_moe_direct_mutation = 'true' in the calling tx.
    await client.query(`
      CREATE OR REPLACE FUNCTION protect_moe_direct_directives() RETURNS trigger AS $fn$
      DECLARE
        bypass TEXT;
      BEGIN
        IF OLD.source_type IS DISTINCT FROM 'moe-direct' THEN
          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          ELSE
            RETURN NEW;
          END IF;
        END IF;

        bypass := current_setting('porter.allow_moe_direct_mutation', true);
        IF bypass = 'true' THEN
          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          ELSE
            RETURN NEW;
          END IF;
        END IF;

        RAISE EXCEPTION
          'directive_immutable_moe_direct: moe-direct directives are sealed (id=%, op=%). Set LOCAL porter.allow_moe_direct_mutation=true to bypass.',
          OLD.id, TG_OP;
      END;
      $fn$ LANGUAGE plpgsql;
    `);
    console.log('[migrate-silos-v1] function protect_moe_direct_directives() ready');

    await client.query(`DROP TRIGGER IF EXISTS directive_immutable_moe_direct ON directives`);
    await client.query(`
      CREATE TRIGGER directive_immutable_moe_direct
      BEFORE UPDATE OR DELETE ON directives
      FOR EACH ROW
      EXECUTE FUNCTION protect_moe_direct_directives()
    `);
    console.log('[migrate-silos-v1] trigger directive_immutable_moe_direct installed');

    // ── Record migration ──────────────────────────────────────────────────
    await client.query(
      `INSERT INTO schema_migrations (id, applied_at) VALUES ('silos_v1', EXTRACT(EPOCH FROM NOW()))`,
    );

    await client.query('COMMIT');
    console.log('[migrate-silos-v1] complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
