#!/usr/bin/env tsx
/**
 * One-shot SQLite → PostgreSQL data migration.
 * Run with Porter STOPPED: DATABASE_URL=... npx tsx scripts/migrate-sqlite-to-pg.ts
 */
import Database from 'better-sqlite3';
import pg from 'pg';

const SQLITE_PATH = process.env.SQLITE_PATH || `${process.env.HOME}/.porter/porter.db`;
const PG_URL = process.env.DATABASE_URL || 'postgresql://lobster:porter@127.0.0.1:5432/porter';

// Tables to migrate (only those with data or that admin code expects).
// Order respects FK dependencies.
const TABLES = [
  'users', 'sessions', 'tasks', 'chats', 'chat_messages', 'chat_attachments',
  'projects', 'personas', 'schema_migrations',
  'agent_jobs', 'agent_activity', 'decision_log', 'token_usage_daily',
  'workspace_connections', 'project_connections', 'calendar_events',
  'subscriptions', 'auth_tokens', 'billing_events',
  'project_collaborators', 'collaboration_events',
  'companies', 'contacts', 'contact_emails', 'contact_phones', 'contact_social',
  'conversations', 'messages', 'files', 'file_projects', 'file_contacts', 'file_conversations',
  'contact_conversations', 'contact_projects',
  'contact_analyses', 'concepts', 'learning_sessions',
  // agent_templates SKIPPED — seeded by seed-templates.ts on first boot
  'customer_events', 'customer_scores', 'admin_agent_tasks',
  'error_log', 'email_messages', 'workspace_settings',
  'forge_pipeline', 'forge_station_runs', 'forge_settings',
  'audit_log', 'invites', 'invite_uses',
  'agent_messages', 'persona_skills',
];

// JSON columns that need parsing before PG insert (PG driver handles object→jsonb)
const JSON_COLUMNS: Record<string, Set<string>> = {
  tasks: new Set(['tags']),
  chats: new Set(['metadata']),
  projects: new Set(['milestones', 'artifacts', 'links', 'metadata']),
  personas: new Set(['fallback_backends', 'config', 'appearance_spec']),
  agent_jobs: new Set(['trigger_data']),
  decision_log: new Set(['alternatives']),
  workspace_connections: new Set(['scopes_json', 'tools_json', 'meta_json']),
  project_connections: new Set(['enabled_tools_json']),
  conversations: new Set(['metadata']),
  messages: new Set(['channel_metadata']),
  contact_analyses: new Set(['key_topics', 'raw_json']),
  agent_templates: new Set(['tags', 'skills', 'tools', 'required_backends', 'required_tools']),
  learning_sessions: new Set(['sources_visited', 'confidence_distribution']),
  billing_events: new Set(['payload']),
  customer_events: new Set(['event_data']),
  admin_agent_tasks: new Set(['payload']),
  error_log: new Set(['metadata']),
  forge_pipeline: new Set(['flags', 'instance_learnings']),
  forge_station_runs: new Set(['rubric', 'files_touched', 'skills_assigned', 'tools_mapped', 'flags']),
  audit_log: new Set(['details']),
  agent_messages: new Set(['injected_memories']),
};

// Tables with SERIAL PKs that need sequence reset
const SERIAL_TABLES = [
  'chat_messages', 'agent_activity', 'decision_log', 'token_usage_daily',
  'project_connections', 'auth_tokens', 'billing_events', 'collaboration_events',
  'contact_emails', 'contact_phones', 'contact_social', 'messages',
  'file_projects', 'file_contacts', 'file_conversations',
  'contact_conversations', 'contact_projects',
  'customer_events', 'admin_agent_tasks', 'error_log', 'email_messages',
  'forge_station_runs', 'audit_log', 'invite_uses', 'agent_messages',
];

function parseJsonSafe(val: unknown, fallback: string = '{}'): unknown {
  if (val === null || val === undefined) return JSON.parse(fallback);
  if (typeof val === 'object') return val; // already parsed
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return JSON.parse(fallback); }
  }
  return JSON.parse(fallback);
}

async function main() {
  console.log(`SQLite: ${SQLITE_PATH}`);
  console.log(`PG:     ${PG_URL}`);

  const sqliteDb = new Database(SQLITE_PATH, { readonly: true });
  const pool = new pg.Pool({ connectionString: PG_URL });

  const results: { table: string; sqlite: number; pg: number; status: string }[] = [];

  for (const table of TABLES) {
    // Check if table exists in SQLite
    const exists = sqliteDb.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
    ).get(table);
    if (!exists) {
      results.push({ table, sqlite: 0, pg: 0, status: 'SKIP (not in SQLite)' });
      continue;
    }

    const rows = sqliteDb.prepare(`SELECT * FROM [${table}]`).all() as Record<string, unknown>[];
    if (rows.length === 0) {
      results.push({ table, sqlite: 0, pg: 0, status: 'EMPTY' });
      continue;
    }

    // Get PG column names — only insert columns that exist in PG
    const pgColsResult = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
      [table]
    );
    const pgColSet = new Set(pgColsResult.rows.map((r: any) => r.column_name));
    const sqliteCols = Object.keys(rows[0]);
    const cols = sqliteCols.filter(c => pgColSet.has(c) && c !== 'search_vector');
    const jsonCols = JSON_COLUMNS[table] || new Set();

    // Detect ISO date strings in timestamp columns and convert to epoch
    const timestampCols = new Set<string>();
    for (const c of cols) {
      const sample = rows[0][c];
      if (typeof sample === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(sample)) {
        timestampCols.add(c);
      }
    }

    // Batch insert in chunks of 200
    const CHUNK = 200;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const placeholders = chunk.map((_, ri) =>
        `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`
      ).join(', ');

      const values = chunk.flatMap(row =>
        cols.map(c => {
          const val = row[c];
          if (jsonCols.has(c)) return parseJsonSafe(val, c.endsWith('s') || c === 'tags' || c === 'skills' || c === 'tools' ? '[]' : '{}');
          // Convert ISO date strings to epoch for doublePrecision columns
          if (timestampCols.has(c) && typeof val === 'string') {
            const ms = new Date(val).getTime();
            return isNaN(ms) ? null : ms / 1000;
          }
          return val;
        })
      );

      try {
        await pool.query(
          `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
          values
        );
        inserted += chunk.length;
      } catch (err: any) {
        console.error(`  ERROR inserting into ${table} (chunk ${i}): ${err.message}`);
        // Try row-by-row for this chunk
        for (const row of chunk) {
          const singlePlaceholders = `(${cols.map((_, ci) => `$${ci + 1}`).join(', ')})`;
          const singleValues = cols.map(c => {
            const val = row[c];
            if (jsonCols.has(c)) return parseJsonSafe(val, c.endsWith('s') || c === 'tags' || c === 'skills' || c === 'tools' ? '[]' : '{}');
            if (timestampCols.has(c) && typeof val === 'string') {
              const ms = new Date(val).getTime();
              return isNaN(ms) ? null : ms / 1000;
            }
            return val;
          });
          try {
            await pool.query(
              `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${singlePlaceholders} ON CONFLICT DO NOTHING`,
              singleValues
            );
            inserted++;
          } catch (rowErr: any) {
            console.error(`    ROW ERROR ${table}: ${rowErr.message}`);
          }
        }
      }
    }

    // Verify count
    const pgCount = await pool.query(`SELECT COUNT(*) as n FROM ${table}`);
    const pgN = parseInt(pgCount.rows[0].n);
    results.push({
      table,
      sqlite: rows.length,
      pg: pgN,
      status: pgN >= rows.length ? 'OK' : 'MISMATCH',
    });
    console.log(`  ${table}: ${rows.length} → ${pgN} ${pgN >= rows.length ? '✓' : '✗'}`);
  }

  // Reset serial sequences
  console.log('\nResetting sequences...');
  for (const table of SERIAL_TABLES) {
    try {
      const seqName = await pool.query(
        `SELECT pg_get_serial_sequence($1, 'id')`, [table]
      );
      if (seqName.rows[0]?.pg_get_serial_sequence) {
        await pool.query(
          `SELECT setval($1, COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`,
          [seqName.rows[0].pg_get_serial_sequence]
        );
      }
    } catch { /* table might not have serial id */ }
  }

  // Backfill search vectors
  console.log('\nBackfilling search vectors...');
  await pool.query(`
    UPDATE messages SET search_vector =
      setweight(to_tsvector('english', COALESCE(content, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(sender_name, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(channel_type, '')), 'C')
    WHERE search_vector IS NULL
  `);
  await pool.query(`
    UPDATE concepts SET search_vector =
      to_tsvector('english', COALESCE(content, ''))
    WHERE search_vector IS NULL
  `);

  // Summary
  console.log('\n' + '='.repeat(65));
  console.log(`${'Table'.padEnd(30)} ${'SQLite'.padStart(7)} ${'PG'.padStart(7)} Status`);
  console.log('='.repeat(65));
  let failures = 0;
  for (const r of results) {
    const line = `${r.table.padEnd(30)} ${String(r.sqlite).padStart(7)} ${String(r.pg).padStart(7)} ${r.status}`;
    console.log(line);
    if (r.status === 'MISMATCH') failures++;
  }
  console.log('='.repeat(65));

  sqliteDb.close();
  await pool.end();

  if (failures > 0) {
    console.error(`\n${failures} table(s) have mismatched row counts!`);
    process.exit(1);
  }
  console.log('\nMigration complete. All row counts match.');
}

main().catch(err => { console.error(err); process.exit(1); });
