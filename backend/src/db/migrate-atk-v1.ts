/**
 * migrate-atk-v1.ts — auth-token attempt cap.
 *
 * Adds:
 *   auth_tokens.attempts INTEGER NOT NULL DEFAULT 0
 *
 * The emailed 6-digit codes that back /auth/verify-email and
 * /auth/reset-password had no guess counter of any kind: verifyAuthToken
 * returned false on a miss and charged nothing, so the 10^6 code space over a
 * 15-minute TTL was walkable by a script against an unauthenticated route.
 * services/transactional-email.ts now burns a token after MAX_TOKEN_ATTEMPTS
 * (5) failures, which needs somewhere to count.
 *
 * DEFAULT 0 means every token already in flight when this lands starts with a
 * full budget rather than being retroactively burned.
 */

import pg from 'pg';

export async function migrateAtkV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check — same ledger the other migrations use.
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'atk_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    await client.query(`
      ALTER TABLE auth_tokens
        ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0
    `);

    await client.query(
      `INSERT INTO schema_migrations (id) VALUES ('atk_v1') ON CONFLICT DO NOTHING`,
    );

    await client.query('COMMIT');
    console.log('[migrate-atk-v1] auth_tokens.attempts applied');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
