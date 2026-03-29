import pg from 'pg';
import { config } from '../config.js';

// Brain PostgreSQL — single source of truth
export const brain = new pg.Pool({
  connectionString: config.brainDatabaseUrl,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
