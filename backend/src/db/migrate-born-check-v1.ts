/**
 * migrate-born-check-v1.ts — Enforce born-template rule at DB layer.
 *
 * Creates a BEFORE INSERT / UPDATE OF template_id trigger on personas that
 * rejects any row whose target template fails the four-threshold born check.
 *
 * Rule (non-negotiable, per feedback_born_components memory):
 *   A template is BORN when all four persona text fields meet their minimum:
 *     system_prompt  ≥ 500 bytes
 *     soul_text      ≥ 200 bytes
 *     role_card_text ≥ 200 bytes
 *     identity_text  ≥  50 bytes
 *   Instances are snapshots of a born component. An instance on a non-born
 *   template is an impossible state — this migration makes it literally
 *   impossible to insert one.
 *
 * NULL template_id is allowed (legacy system rows like porter-core that
 * predate the template system).
 *
 * Idempotent: DROP TRIGGER + CREATE OR REPLACE FUNCTION.
 */

import pg from 'pg';

export async function migrateBornCheckV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'born_check_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── Guard: surface orphan rows before creating the trigger ─────────────
    // If existing personas point at non-born templates, the trigger would
    // still let them sit in place (BEFORE INSERT/UPDATE, not SELECT), but
    // any future UPDATE on them would fail. We warn here so operators know.
    const orphans = await client.query<{ instance_id: string; template_id: string }>(
      `SELECT p.id AS instance_id, p.template_id
       FROM personas p
       JOIN agent_templates at ON at.id = p.template_id
       WHERE octet_length(at.system_prompt)  < 500
          OR octet_length(at.soul_text)      < 200
          OR octet_length(at.role_card_text) < 200
          OR octet_length(at.identity_text)  <  50`,
    );
    if (orphans.rowCount && orphans.rowCount > 0) {
      console.warn(
        `[migrate-born-check-v1] WARNING: ${orphans.rowCount} orphan persona(s) exist on non-born templates. ` +
        'Run backend/scripts/birth-templates.ts --all-orphans before any UPDATE on these rows or the trigger will reject the update:',
      );
      for (const r of orphans.rows) {
        console.warn(`  ${r.instance_id} → ${r.template_id}`);
      }
    }

    // ── Function ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE OR REPLACE FUNCTION check_persona_template_born() RETURNS trigger AS $fn$
      DECLARE
        sp_bytes INT;
        so_bytes INT;
        rc_bytes INT;
        id_bytes INT;
      BEGIN
        IF NEW.template_id IS NULL OR NEW.template_id = '' THEN
          RETURN NEW;
        END IF;

        SELECT octet_length(system_prompt),
               octet_length(soul_text),
               octet_length(role_card_text),
               octet_length(identity_text)
          INTO sp_bytes, so_bytes, rc_bytes, id_bytes
          FROM agent_templates
         WHERE id = NEW.template_id;

        IF sp_bytes IS NULL THEN
          RAISE EXCEPTION 'persona %: template_id % does not exist in agent_templates', NEW.id, NEW.template_id;
        END IF;

        IF sp_bytes < 500 OR so_bytes < 200 OR rc_bytes < 200 OR id_bytes < 50 THEN
          RAISE EXCEPTION
            'persona %: template % is not born (system_prompt=%B soul=%B role_card=%B identity=%B). Instances may only be created from born components. Run backend/scripts/birth-templates.ts % first.',
            NEW.id, NEW.template_id, sp_bytes, so_bytes, rc_bytes, id_bytes, NEW.template_id;
        END IF;

        RETURN NEW;
      END;
      $fn$ LANGUAGE plpgsql;
    `);
    console.log('[migrate-born-check-v1] function check_persona_template_born() created');

    // ── Trigger ─────────────────────────────────────────────────────────────
    await client.query(`DROP TRIGGER IF EXISTS personas_template_born_check ON personas`);
    await client.query(`
      CREATE TRIGGER personas_template_born_check
      BEFORE INSERT OR UPDATE OF template_id ON personas
      FOR EACH ROW
      EXECUTE FUNCTION check_persona_template_born()
    `);
    console.log('[migrate-born-check-v1] trigger personas_template_born_check created');

    // ── Record migration ────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO schema_migrations (id, applied_at) VALUES ('born_check_v1', EXTRACT(EPOCH FROM NOW()))`,
    );

    await client.query('COMMIT');
    console.log('[migrate-born-check-v1] complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
