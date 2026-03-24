#!/usr/bin/env tsx
/**
 * One-shot SQLite to PostgreSQL migration script.
 * Run with Porter STOPPED: tsx scripts/migrate-sqlite-to-pg.ts
 *
 * Reads: ~/.porter/porter.db (SQLite, read-only)
 * Writes: DATABASE_URL (PostgreSQL)
 *
 * Steps:
 * 1. Connect to both databases
 * 2. Run consolidated PG migration (create tables)
 * 3. For each table in FK order: read SQLite rows, transform types, INSERT into PG
 * 4. Backfill search_vector for messages and concepts
 * 5. Reset serial sequences to max(id) + 1
 * 6. Validate: compare row counts
 * 7. Spot-check: compare 5 records per table field-by-field between SQLite and PG
 * 8. FTS verify: test 5-10 known search terms against tsvector
 * 9. Print summary table
 */

import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import os from 'os';

const { Pool } = pg;

// ── Configuration ─────────────────────────────────────────────────────────────

const SQLITE_PATH = process.env.PORTER_SQLITE_PATH
  || path.join(process.env.PORTER_DATA_DIR || path.join(process.env.HOME || os.homedir(), '.porter'), 'porter.db');

const DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://porter:porter@localhost:5432/porter';

const CHUNK_SIZE = 500; // batch size for multi-row INSERT

// ── ANSI colors ───────────────────────────────────────────────────────────────

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

function ok(s: string)   { return `${GREEN}${s}${RESET}`; }
function fail(s: string) { return `${RED}${s}${RESET}`; }
function warn(s: string) { return `${YELLOW}${s}${RESET}`; }

// ── JSON column definitions (must be transformed TEXT→jsonb) ──────────────────

const JSON_COLUMNS: Record<string, string[]> = {
  tasks:                 ['tags'],
  chats:                 ['metadata'],
  projects:              ['milestones', 'artifacts', 'links', 'metadata'],
  personas:              ['fallback_backends', 'config', 'appearance_spec'],
  agent_jobs:            ['trigger_data'],
  workspace_connections: ['scopes_json', 'tools_json', 'meta_json'],
  project_connections:   ['enabled_tools_json'],
  subscriptions:         [],
  billing_events:        ['payload'],
  contact_analyses:      ['key_topics', 'raw_json'],
  agent_templates:       ['tags', 'skills', 'tools', 'required_backends', 'required_tools'],
  learning_sessions:     ['sources_visited', 'confidence_distribution'],
  conversations:         ['metadata'],
  messages:              ['channel_metadata'],
  decision_log:          ['alternatives'],
};

// ── PG schema column names per table (only columns that exist in PG) ──────────
// This is the authoritative list derived from schema.ts + migrate-consolidated.ts
// Columns in SQLite but NOT in PG schema are omitted (e.g., wizard_state, must_change_password)

const PG_COLUMNS: Record<string, string[]> = {
  schema_migrations: ['id', 'applied_at'],
  users: [
    'username', 'display_name', 'full_name', 'email', 'password_hash', 'salt',
    'role', 'email_verified', 'status', 'created_at',
    'country', 'city', 'timezone', 'company', 'job_title', 'phone', 'bio',
    'social_x', 'social_linkedin', 'social_github', 'avatar_url', 'language',
    'suspended_at', 'suspension_reason', 'terms_accepted_at', 'last_ip',
    'signup_source', 'lifetime_free',
  ],
  sessions: ['token', 'username', 'expires', 'ip_address', 'user_agent', 'last_seen_at', 'created_at'],
  tasks: [
    'id', 'project_id', 'username', 'title', 'description', 'status', 'priority',
    'phase', 'created_at', 'updated_at', 'completed_at', 'assigned_agent_id',
    'tokens_used', 'time_minutes', 'result', 'tags', 'sort_order',
  ],
  chats: ['id', 'title', 'project_id', 'username', 'model_id', 'metadata', 'created_at', 'updated_at'],
  chat_messages: ['id', 'chat_id', 'role', 'content', 'timestamp', 'model_id'],
  chat_attachments: ['id', 'message_id', 'chat_id', 'filename', 'content_type', 'size', 'data', 'created_at'],
  projects: [
    'id', 'name', 'slug', 'type', 'status', 'description', 'owner_id',
    'milestones', 'artifacts', 'links', 'metadata', 'created_at', 'updated_at', 'deadline',
  ],
  personas: [
    'id', 'name', 'role', 'avatar', 'preferred_backend', 'fallback_backends',
    'status', 'soul_hash', 'agent_group', 'created_at', 'last_active', 'config',
    'sort_order', 'owner', 'is_system', 'is_public', 'is_locked', 'is_master',
    'orchestrator_only', 'is_temporary', 'managed_by_porter', 'appearance_style',
    'appearance_spec', 'skin_asset_path', 'portrait_asset_path',
    'heartbeat_enabled', 'heartbeat_cron', 'last_heartbeat', 'template_id',
  ],
  agent_jobs: [
    'id', 'agent_id', 'project_id', 'parent_agent_id', 'trigger_type', 'trigger_data',
    'prompt', 'status', 'scheduled_for', 'started_at', 'completed_at', 'worker_id',
    'attempt_count', 'result', 'error', 'created_at',
  ],
  agent_activity: ['id', 'agent_id', 'job_id', 'project_id', 'event_type', 'summary', 'detail', 'created_at'],
  decision_log: [
    'id', 'decision_type', 'chosen', 'reasoning', 'alternatives',
    'project_id', 'agent_id', 'job_id', 'created_at',
  ],
  token_usage_daily: ['id', 'model', 'date', 'input_tokens', 'output_tokens', 'request_count', 'created_at'],
  workspace_connections: [
    'id', 'provider', 'kind', 'status', 'display_name', 'scopes_json', 'tools_json',
    'last_sync_at', 'last_error', 'installed_by', 'meta_json', 'meta_encrypted',
    'created_at', 'updated_at',
  ],
  project_connections: [
    'id', 'project_id', 'connection_id', 'access_mode', 'enabled_tools_json',
    'status', 'attached_by', 'attached_at',
  ],
  calendar_events: ['id', 'connection_id', 'project_id', 'google_event_id', 'title', 'start_at', 'end_at', 'all_day', 'synced_at'],
  subscriptions: [
    'id', 'username', 'plan', 'status', 'ls_customer_id', 'ls_subscription_id',
    'ls_variant_id', 'trial_ends_at', 'current_period_start', 'current_period_end',
    'cancel_at', 'cancelled_at', 'paused_at', 'created_at', 'updated_at',
  ],
  auth_tokens: ['id', 'email', 'code', 'purpose', 'expires_at', 'used_at', 'created_at'],
  billing_events: ['id', 'username', 'event_type', 'ls_event_id', 'payload', 'created_at'],
  project_collaborators: [
    'id', 'project_id', 'username', 'email', 'role', 'status', 'invite_token',
    'invited_by', 'invited_at', 'accepted_at', 'revoked_at', 'revoked_by',
    'last_drip_at', 'drip_count', 'created_at', 'updated_at',
  ],
  collaboration_events: [
    'id', 'project_id', 'collaborator_id', 'actor_username', 'event_type',
    'previous_role', 'new_role', 'detail', 'created_at',
  ],
  companies: ['id', 'name', 'industry', 'website', 'notes', 'created_by', 'created_at', 'updated_at'],
  contacts: [
    'id', 'display_name', 'first_name', 'last_name', 'company_id',
    'job_title', 'notes', 'created_by', 'created_at', 'updated_at',
  ],
  contact_emails: ['id', 'contact_id', 'value', 'label', 'is_primary'],
  contact_phones: ['id', 'contact_id', 'value', 'country_code', 'label', 'is_primary'],
  contact_social: ['id', 'contact_id', 'platform', 'handle'],
  conversations: ['id', 'scope_type', 'scope_id', 'title', 'channel_type', 'external_id', 'metadata', 'created_at', 'updated_at'],
  messages: [
    'id', 'conversation_id', 'parent_message_id', 'sender_type', 'sender_id',
    'sender_name', 'content', 'channel_type', 'channel_metadata', 'created_at',
    // search_vector is computed by trigger on INSERT, skip it
  ],
  files: ['id', 'filename', 'disk_path', 'mime_type', 'size_bytes', 'uploaded_by', 'created_at'],
  file_projects: ['id', 'file_id', 'project_id', 'attached_by', 'attached_at'],
  file_contacts: ['id', 'file_id', 'contact_id', 'attached_by', 'attached_at'],
  file_conversations: ['id', 'file_id', 'conversation_id', 'attached_by', 'attached_at'],
  contact_conversations: ['id', 'contact_id', 'conversation_id'],
  contact_projects: ['id', 'contact_id', 'project_id'],
  contact_analyses: [
    'id', 'contact_id', 'sentiment', 'engagement_score', 'churn_risk',
    'relationship_stage', 'key_topics', 'last_interaction_summary',
    'communication_style', 'raw_json', 'job_id', 'created_at',
  ],
  agent_templates: [
    'id', 'name', 'category', 'description', 'tags', 'skills', 'tools',
    'required_backends', 'required_tools', 'system_prompt', 'soul_text',
    'role_card_text', 'identity_text', 'skills_text', 'is_internal',
    'sort_order', 'created_at',
  ],
  concepts: [
    'id', 'memory_kind', 'trust_tier', 'scope', 'scope_id', 'content',
    'source_type', 'source_url', 'confidence_score', 'status', 'review_state',
    'superseded_by_id', 'last_used_at', 'use_count', 'session_id',
    'created_at', 'updated_at',
    // search_vector is computed by trigger on INSERT, skip it
  ],
  learning_sessions: [
    'id', 'template_id', 'job_id', 'sources_visited', 'concepts_retained',
    'confidence_distribution', 'capped', 'duration_ms', 'error', 'created_at',
  ],
};

// ── Migration order (respects FK dependencies) ────────────────────────────────

const TABLE_ORDER = [
  'schema_migrations',
  'users',
  'sessions',
  'tasks',
  'chats',
  'chat_messages',
  'chat_attachments',
  'projects',
  'personas',
  'agent_jobs',
  'agent_activity',
  'decision_log',
  'token_usage_daily',
  'workspace_connections',
  'project_connections',
  'calendar_events',
  'subscriptions',
  'auth_tokens',
  'billing_events',
  'project_collaborators',
  'collaboration_events',
  'companies',
  'contacts',
  'contact_emails',
  'contact_phones',
  'contact_social',
  'conversations',
  'messages',
  'files',
  'file_projects',
  'file_contacts',
  'file_conversations',
  'contact_conversations',
  'contact_projects',
  'contact_analyses',
  'agent_templates',
  'concepts',
  'learning_sessions',
];

// Tables with SERIAL PKs that need sequence reset after migration
const SERIAL_TABLES = [
  'chat_messages',
  'agent_activity',
  'decision_log',
  'token_usage_daily',
  'project_connections',
  'collaboration_events',
  'contact_emails',
  'contact_phones',
  'contact_social',
  'messages',
  'file_projects',
  'file_contacts',
  'file_conversations',
  'contact_conversations',
  'contact_projects',
  'auth_tokens',
  'billing_events',
];

// ── Type transformation ───────────────────────────────────────────────────────

function transformValue(tableName: string, colName: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;

  const jsonCols = JSON_COLUMNS[tableName] || [];
  if (jsonCols.includes(colName)) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '' || trimmed === 'null') return null;
      try {
        return JSON.parse(trimmed);
      } catch {
        // If it fails to parse, return null — better than crashing
        console.warn(warn(`  WARN: invalid JSON in ${tableName}.${colName}: ${String(value).slice(0, 50)}`));
        return null;
      }
    }
    // Already an object
    return value;
  }

  return value;
}

// ── Batch INSERT ──────────────────────────────────────────────────────────────

async function insertBatch(pool: pg.Pool, tableName: string, cols: string[], rows: unknown[][]): Promise<void> {
  if (rows.length === 0) return;

  const colList = cols.join(', ');
  const placeholders = rows.map((_, rowIdx) =>
    `(${cols.map((_, colIdx) => `$${rowIdx * cols.length + colIdx + 1}`).join(', ')})`
  ).join(', ');
  const values = rows.flatMap(row => row);

  await pool.query(
    `INSERT INTO ${tableName} (${colList}) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    values
  );
}

// ── Migrate a single table ────────────────────────────────────────────────────

async function migrateTable(
  sqliteDb: Database.Database,
  pool: pg.Pool,
  tableName: string
): Promise<number> {
  // Check if table exists in SQLite
  const tableExists = sqliteDb.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(tableName) as { name: string } | undefined;

  if (!tableExists) {
    console.log(`  ${warn('SKIP')} ${tableName} — not found in SQLite`);
    return 0;
  }

  const pgCols = PG_COLUMNS[tableName];
  if (!pgCols) {
    console.log(`  ${warn('SKIP')} ${tableName} — no PG column mapping defined`);
    return 0;
  }

  // Get SQLite column names
  const sqlitePragma = sqliteDb.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  const sqliteCols = new Set(sqlitePragma.map(c => c.name));

  // Only use columns that exist in BOTH SQLite and PG schema
  const cols = pgCols.filter(col => sqliteCols.has(col));

  if (cols.length === 0) {
    console.log(`  ${warn('SKIP')} ${tableName} — no matching columns`);
    return 0;
  }

  // Read all rows from SQLite
  const sqliteRows = sqliteDb.prepare(`SELECT ${cols.join(', ')} FROM ${tableName}`).all() as Record<string, unknown>[];

  if (sqliteRows.length === 0) {
    console.log(`  ${ok('OK')}   ${tableName}: 0 rows (empty)`);
    return 0;
  }

  // Transform and insert in chunks
  let inserted = 0;
  for (let i = 0; i < sqliteRows.length; i += CHUNK_SIZE) {
    const chunk = sqliteRows.slice(i, i + CHUNK_SIZE);
    const valueRows = chunk.map(row =>
      cols.map(col => transformValue(tableName, col, row[col]))
    );
    await insertBatch(pool, tableName, cols, valueRows);
    inserted += chunk.length;
  }

  console.log(`  ${ok('OK')}   ${tableName}: ${inserted} rows migrated`);
  return inserted;
}

// ── Reset serial sequences ────────────────────────────────────────────────────

async function resetSequences(pool: pg.Pool): Promise<void> {
  console.log('\nResetting serial sequences...');
  for (const tableName of SERIAL_TABLES) {
    try {
      await pool.query(`
        SELECT setval(
          pg_get_serial_sequence('${tableName}', 'id'),
          COALESCE((SELECT MAX(id) FROM ${tableName}), 0) + 1,
          false
        )
      `);
      console.log(`  ${ok('OK')}   ${tableName} sequence reset`);
    } catch (err) {
      console.log(`  ${warn('SKIP')} ${tableName} — ${(err as Error).message}`);
    }
  }
}

// ── Backfill search_vector columns ────────────────────────────────────────────
// Note: The trigger handles NEW inserts automatically, but existing rows
// migrated without the trigger firing need a manual UPDATE to populate search_vector.

async function backfillSearchVectors(pool: pg.Pool): Promise<void> {
  console.log('\nBackfilling search_vector columns...');

  const msgResult = await pool.query('SELECT COUNT(*) as cnt FROM messages');
  const msgCount = parseInt(msgResult.rows[0].cnt);
  if (msgCount > 0) {
    await pool.query(`
      UPDATE messages SET search_vector =
        setweight(to_tsvector('english', COALESCE(content, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(sender_name, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(channel_type, '')), 'C')
    `);
    console.log(`  ${ok('OK')}   messages.search_vector backfilled (${msgCount} rows)`);
  } else {
    console.log(`  ${warn('SKIP')} messages — 0 rows`);
  }

  const conResult = await pool.query('SELECT COUNT(*) as cnt FROM concepts');
  const conCount = parseInt(conResult.rows[0].cnt);
  if (conCount > 0) {
    await pool.query(`
      UPDATE concepts SET search_vector =
        to_tsvector('english', COALESCE(content, ''))
    `);
    console.log(`  ${ok('OK')}   concepts.search_vector backfilled (${conCount} rows)`);
  } else {
    console.log(`  ${warn('SKIP')} concepts — 0 rows`);
  }
}

// ── Spot-check validation ─────────────────────────────────────────────────────

interface SpotCheckResult {
  table: string;
  ok: number;
  fail: number;
  total: number;
}

async function spotCheck(
  tableName: string,
  sqliteDb: Database.Database,
  pool: pg.Pool,
  pgCols: string[]
): Promise<SpotCheckResult> {
  const tableExists = sqliteDb.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(tableName) as { name: string } | undefined;
  if (!tableExists) return { table: tableName, ok: 0, fail: 0, total: 0 };

  const sqlitePragma = sqliteDb.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  const sqliteCols = new Set(sqlitePragma.map(c => c.name));
  const cols = pgCols.filter(col => sqliteCols.has(col));
  if (cols.length === 0) return { table: tableName, ok: 0, fail: 0, total: 0 };

  // Determine primary key column(s)
  const pkInfo = sqliteDb.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string; pk: number }>;
  const pkCols = pkInfo.filter(c => c.pk > 0 && cols.includes(c.name)).map(c => c.name);
  const pkCol = pkCols[0] || cols[0];

  const sampleRows = sqliteDb.prepare(
    `SELECT ${cols.join(', ')} FROM ${tableName} ORDER BY RANDOM() LIMIT 5`
  ).all() as Record<string, unknown>[];

  if (sampleRows.length === 0) return { table: tableName, ok: 0, fail: 0, total: 0 };

  let okCount = 0;
  let failCount = 0;

  for (const sqliteRow of sampleRows) {
    const pkVal = sqliteRow[pkCol];
    const pgResult = await pool.query(
      `SELECT * FROM ${tableName} WHERE ${pkCol} = $1`,
      [pkVal]
    );

    if (pgResult.rows.length === 0) {
      console.error(`    ${fail('MISSING')} ${tableName} pk=${pkVal}`);
      failCount++;
      continue;
    }

    const pgRow = pgResult.rows[0];
    let rowMatch = true;

    for (const col of cols) {
      if (col === 'search_vector') continue; // tsvector — skip

      const sqliteRaw = sqliteRow[col];
      const pgRaw = pgRow[col];
      const jsonCols = JSON_COLUMNS[tableName] || [];

      if (jsonCols.includes(col)) {
        // Compare JSON by stringifying after normalization
        let sqliteVal: unknown = sqliteRaw;
        let pgVal: unknown = pgRaw;
        try {
          if (typeof sqliteRaw === 'string' && sqliteRaw.trim()) {
            sqliteVal = JSON.parse(sqliteRaw);
          }
        } catch { sqliteVal = null; }

        const sqliteStr = JSON.stringify(sqliteVal);
        const pgStr = JSON.stringify(pgVal);

        if (sqliteStr !== pgStr) {
          // Minor format differences are acceptable for jsonb (key ordering, etc.)
          // Only flag as mismatch if deeply different
          const sqliteNorm = JSON.stringify(JSON.parse(sqliteStr || 'null'));
          const pgNorm = JSON.stringify(JSON.parse(pgStr || 'null'));
          if (sqliteNorm !== pgNorm) {
            console.error(`    ${fail('MISMATCH')} ${tableName}.${col} pk=${pkVal}`);
            rowMatch = false;
          }
        }
      } else {
        // Direct comparison — account for null/undefined equivalence
        const sqliteStr = sqliteRaw === null || sqliteRaw === undefined ? 'null' : String(sqliteRaw);
        const pgStr = pgRaw === null || pgRaw === undefined ? 'null' : String(pgRaw);
        if (sqliteStr !== pgStr) {
          console.error(`    ${fail('MISMATCH')} ${tableName}.${col} pk=${pkVal}: sqlite=${sqliteStr.slice(0, 50)} pg=${pgStr.slice(0, 50)}`);
          rowMatch = false;
        }
      }
    }

    if (rowMatch) okCount++; else failCount++;
  }

  return { table: tableName, ok: okCount, fail: failCount, total: sampleRows.length };
}

// ── FTS Verification ──────────────────────────────────────────────────────────

async function verifyFTS(pool: pg.Pool): Promise<boolean> {
  console.log('\nVerifying full-text search...');
  let allPassed = true;
  let testsRun = 0;

  // Test concepts FTS
  const conceptSamples = await pool.query('SELECT content FROM concepts WHERE content IS NOT NULL AND length(content) > 10 LIMIT 10');
  for (const row of conceptSamples.rows.slice(0, 5)) {
    const words = (row.content as string).split(/\s+/).filter((w: string) => w.length > 4 && /^[a-zA-Z]+$/.test(w));
    const word = words[0];
    if (!word) continue;
    const result = await pool.query(
      `SELECT COUNT(*) as cnt FROM concepts WHERE search_vector @@ websearch_to_tsquery('english', $1)`,
      [word]
    );
    const cnt = parseInt(result.rows[0].cnt);
    console.log(`  FTS concepts "${word}": ${cnt} results ${cnt > 0 ? ok('OK') : fail('EMPTY')}`);
    if (cnt === 0) allPassed = false;
    testsRun++;
  }

  // Test messages FTS
  const messageSamples = await pool.query('SELECT content FROM messages WHERE content IS NOT NULL AND length(content) > 10 LIMIT 10');
  for (const row of messageSamples.rows.slice(0, 5)) {
    const words = (row.content as string).split(/\s+/).filter((w: string) => w.length > 4 && /^[a-zA-Z]+$/.test(w));
    const word = words[0];
    if (!word) continue;
    const result = await pool.query(
      `SELECT COUNT(*) as cnt FROM messages WHERE search_vector @@ websearch_to_tsquery('english', $1)`,
      [word]
    );
    const cnt = parseInt(result.rows[0].cnt);
    console.log(`  FTS messages "${word}": ${cnt} results ${cnt > 0 ? ok('OK') : fail('EMPTY')}`);
    if (cnt === 0) allPassed = false;
    testsRun++;
  }

  if (testsRun === 0) {
    console.log(`  ${warn('SKIP')} FTS — no searchable content in concepts or messages (tables are empty)`);
    // Not a failure — empty tables can't be searched
    return true;
  }

  return allPassed;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`${BOLD}Porter SQLite → PostgreSQL Migration${RESET}`);
  console.log(`SQLite: ${SQLITE_PATH}`);
  console.log(`PG:     ${DATABASE_URL.replace(/:([^:@]+)@/, ':***@')}`);
  console.log('');

  // 1. Connect to SQLite (read-only)
  console.log('Connecting to SQLite...');
  const sqliteDb = new Database(SQLITE_PATH, { readonly: true });
  console.log(`  ${ok('OK')}   Connected`);

  // 2. Connect to PostgreSQL
  console.log('Connecting to PostgreSQL...');
  const pool = new Pool({ connectionString: DATABASE_URL });
  await pool.query('SELECT 1'); // test connection
  console.log(`  ${ok('OK')}   Connected`);

  // 3. Run consolidated migration (creates tables if they don't exist)
  console.log('\nRunning consolidated PG migration (DDL)...');
  const { migrateConsolidated } = await import('../backend/src/db/migrate-consolidated.js');
  await migrateConsolidated(pool);
  console.log(`  ${ok('OK')}   Schema ready`);

  // 4. Migrate each table in FK order
  console.log('\nMigrating data...');
  const migrationCounts: Record<string, number> = {};
  for (const tableName of TABLE_ORDER) {
    const count = await migrateTable(sqliteDb, pool, tableName);
    migrationCounts[tableName] = count;
  }

  // 5. Reset serial sequences
  await resetSequences(pool);

  // 6. Backfill search_vector
  await backfillSearchVectors(pool);

  // 7. Row count validation
  console.log('\nValidating row counts...');
  interface CountResult {
    table: string;
    sqlite: number;
    pg: number;
    status: string;
  }
  const countResults: CountResult[] = [];

  for (const tableName of TABLE_ORDER) {
    const tableExists = sqliteDb.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
    ).get(tableName) as { name: string } | undefined;

    if (!tableExists) {
      countResults.push({ table: tableName, sqlite: 0, pg: 0, status: 'SKIP' });
      continue;
    }

    const sqliteCount = (sqliteDb.prepare(`SELECT COUNT(*) as cnt FROM ${tableName}`).get() as { cnt: number }).cnt;
    const pgResult = await pool.query(`SELECT COUNT(*) as cnt FROM ${tableName}`);
    const pgCount = parseInt(pgResult.rows[0].cnt);

    const status = sqliteCount === pgCount ? 'OK' : 'MISMATCH';
    countResults.push({ table: tableName, sqlite: sqliteCount, pg: pgCount, status });
  }

  // 8. Spot-check
  console.log('\nRunning spot-checks (5 records per table)...');
  const spotResults: SpotCheckResult[] = [];

  for (const tableName of TABLE_ORDER) {
    const pgCols = PG_COLUMNS[tableName];
    if (!pgCols) continue;
    const result = await spotCheck(tableName, sqliteDb, pool, pgCols);
    if (result.total > 0) {
      spotResults.push(result);
    }
  }

  // 9. FTS verification
  const ftsOk = await verifyFTS(pool);

  // 10. Print summary table
  console.log(`\n${BOLD}═══════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}Table                          │ SQLite │  PG   │ Status   │ Spot-check${RESET}`);
  console.log('──────────────────────────────────────────────────────────────────────');

  let anyMismatch = false;
  let anySpotFail = false;

  for (const row of countResults) {
    const spotData = spotResults.find(s => s.table === row.table);
    const spotStr = spotData ? `${spotData.ok}/${spotData.total} OK` : 'N/A';

    const statusColor = row.status === 'OK' ? ok(row.status.padEnd(8)) :
                        row.status === 'SKIP' ? warn(row.status.padEnd(8)) :
                        fail(row.status.padEnd(8));

    const spotColor = spotData && spotData.fail > 0 ? fail(spotStr) :
                      spotData ? ok(spotStr) : spotStr;

    const tableStr = row.table.padEnd(30);
    const sqliteStr = String(row.sqlite).padStart(6);
    const pgStr = String(row.pg).padStart(5);

    console.log(`${tableStr} │ ${sqliteStr} │ ${pgStr} │ ${statusColor} │ ${spotColor}`);

    if (row.status === 'MISMATCH') anyMismatch = true;
    if (spotData && spotData.fail > 0) anySpotFail = true;
  }

  console.log('──────────────────────────────────────────────────────────────────────');

  const ftsStatus = ftsOk ? ok('PASSED') : fail('FAILED');
  console.log(`FTS verification: ${ftsStatus}`);

  // Summary
  const overallOk = !anyMismatch && !anySpotFail && ftsOk;
  console.log('');
  if (overallOk) {
    console.log(`${GREEN}${BOLD}Migration COMPLETE — all checks passed.${RESET}`);
    console.log(`\nNext steps:`);
    console.log(`  1. Set DATABASE_URL in your environment`);
    console.log(`  2. Start Porter: systemctl --user start porter`);
    console.log(`  3. Verify: curl http://127.0.0.1:3001/api/v1/health`);
  } else {
    console.log(`${RED}${BOLD}Migration FAILED — check errors above.${RESET}`);
    if (anyMismatch) console.log('  - Row count mismatches detected');
    if (anySpotFail) console.log('  - Spot-check field mismatches detected');
    if (!ftsOk) console.log('  - FTS verification failed');
  }

  sqliteDb.close();
  await pool.end();

  process.exit(overallOk ? 0 : 1);
}

main().catch(err => {
  console.error(fail(`Fatal error: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
