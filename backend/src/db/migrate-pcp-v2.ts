/**
 * migrate-pcp-v2.ts -- Porter Control Plane: Phase 45 Plan 02
 *
 * Creates the approval_requests table for high-risk action approval gates.
 * Approval requests pause potentially destructive agent delegations until
 * a platform_admin explicitly approves or rejects the action.
 */

import pg from 'pg';

export async function migratePcpV2(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'pcp_v2'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // -- Create approval_requests table ------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS approval_requests (
        id TEXT PRIMARY KEY,
        correlation_id TEXT,
        source_agent TEXT NOT NULL DEFAULT 'porter',
        target_agent TEXT,
        task TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        risk_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
        status TEXT NOT NULL DEFAULT 'pending',
        requested_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        resolved_at DOUBLE PRECISION,
        resolved_by TEXT,
        rejection_reason TEXT,
        delegation_request JSONB,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);
    console.log('[migrate-pcp-v2] approval_requests table created');

    // -- Indexes -----------------------------------------------------------
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_approval_requests_correlation ON approval_requests(correlation_id)`,
    );
    console.log('[migrate-pcp-v2] indexes created on approval_requests');

    // -- Mark migration complete -------------------------------------------
    await client.query(`INSERT INTO schema_migrations (id) VALUES ('pcp_v2')`);
    await client.query('COMMIT');
    console.log('[migrate-pcp-v2] migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate-pcp-v2] migration failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}
