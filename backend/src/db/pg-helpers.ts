/**
 * PostgreSQL query helpers — wraps Brain's pool with the same interface
 * as admin's db/pg.ts (queryOne, queryAll, execute).
 *
 * Admin routes import these instead of using pool.query directly.
 */
import { pool } from './client.js';
import type { QueryResultRow } from 'pg';

/**
 * Run query, return first row or null.
 */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const { rows } = await pool.query<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Run query, return all rows.
 */
export async function queryAll<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const { rows } = await pool.query<T>(sql, params);
  return rows;
}

/**
 * Run mutation (INSERT/UPDATE/DELETE), return rowCount.
 */
export async function execute(
  sql: string,
  params?: unknown[]
): Promise<{ rowCount: number }> {
  const result = await pool.query(sql, params);
  return { rowCount: result.rowCount ?? 0 };
}
