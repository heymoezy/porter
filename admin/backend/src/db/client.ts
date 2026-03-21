import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../../../backend/src/db/schema.js';
import { config } from '../config.js';

const sqlite = new Database(config.dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 30000');

export const db = drizzle(sqlite, { schema });
export { sqlite };
