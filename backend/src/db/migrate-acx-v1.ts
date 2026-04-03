/**
 * migrate-acx-v1.ts — Adaptive Agent Context: Phase 38
 *
 * Adds optional `tags TEXT[]` column to the `directives` table.
 * Tags enable skill→directive affinity matching in the directive scorer.
 *
 * Tag vocabulary:
 *   coding, security, api, testing, deployment, memory, routing,
 *   skills, performance, ui, data
 *
 * One-time UPDATE assigns 1-3 tags per directive based on content keyword analysis.
 * A GIN index is created for fast tag lookups.
 */

import { pool } from './client.js';

const TAG_VOCAB = [
  'coding', 'security', 'api', 'testing', 'deployment',
  'memory', 'routing', 'skills', 'performance', 'ui', 'data',
] as const;

type Tag = typeof TAG_VOCAB[number];

/**
 * Heuristic tag assignment based on keyword matches in directive content.
 * Returns 1-3 tags. Never returns an empty array — always at least one tag.
 */
function assignTags(content: string): Tag[] {
  const lower = content.toLowerCase();
  const matched: Tag[] = [];

  // Tag pattern map: tag → keywords that trigger it
  const patterns: Array<{ tag: Tag; keywords: string[] }> = [
    {
      tag: 'coding',
      keywords: ['code', 'refactor', 'implement', 'debug', 'function', 'module', 'typescript', 'javascript', 'build', 'compile', 'test'],
    },
    {
      tag: 'security',
      keywords: ['security', 'auth', 'token', 'permission', 'access', 'credential', 'secret', 'encrypt', 'bypass', 'attack'],
    },
    {
      tag: 'api',
      keywords: ['api', 'endpoint', 'route', 'request', 'response', 'http', 'rest', 'fastify', 'curl', 'payload'],
    },
    {
      tag: 'testing',
      keywords: ['test', 'verify', 'playwright', 'assert', 'check', 'validate', 'proof', 'prove'],
    },
    {
      tag: 'deployment',
      keywords: ['deploy', 'ship', 'restart', 'service', 'systemctl', 'push', 'git commit', 'version bump', 'health'],
    },
    {
      tag: 'memory',
      keywords: ['memory', 'checkpoint', 'recall', 'concept', 'directive', 'episode', 'signal', 'context', 'inject'],
    },
    {
      tag: 'routing',
      keywords: ['route', 'routing', 'bridge', 'gateway', 'dispatch', 'model call', 'fallback', 'backend'],
    },
    {
      tag: 'skills',
      keywords: ['skill', 'worker', 'agent', 'forge', 'persona', 'template', 'assign', 'evolve'],
    },
    {
      tag: 'performance',
      keywords: ['performance', 'latency', 'token', 'budget', 'cost', 'concurrency', 'queue', 'slow', 'fast'],
    },
    {
      tag: 'ui',
      keywords: ['ui', 'frontend', 'react', 'component', 'design', 'style', 'css', 'admin', 'dashboard', 'page'],
    },
    {
      tag: 'data',
      keywords: ['database', 'postgres', 'postgresql', 'drizzle', 'schema', 'table', 'query', 'migration', 'sql', 'row'],
    },
  ];

  for (const { tag, keywords } of patterns) {
    if (keywords.some(kw => lower.includes(kw))) {
      matched.push(tag);
    }
    if (matched.length >= 3) break;
  }

  // Every directive gets at least a generic tag based on prefix conventions
  if (matched.length === 0) {
    matched.push('routing'); // fallback — routing is the broadest operating context
  }

  return matched.slice(0, 3);
}

export async function runMigration(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add tags column if not already present
    const colCheck = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'directives' AND column_name = 'tags'`,
    );

    if (colCheck.rows.length === 0) {
      console.log('[migrate-acx-v1] Adding tags column to directives...');
      await client.query(`ALTER TABLE directives ADD COLUMN tags TEXT[]`);
      console.log('[migrate-acx-v1] tags column added.');
    } else {
      console.log('[migrate-acx-v1] tags column already exists — skipping ALTER.');
    }

    // 2. Create GIN index if not already present
    const idxCheck = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'directives' AND indexname = 'idx_directives_tags'`,
    );

    if (idxCheck.rows.length === 0) {
      console.log('[migrate-acx-v1] Creating GIN index on directives.tags...');
      await client.query(
        `CREATE INDEX idx_directives_tags ON directives USING GIN(tags)`,
      );
      console.log('[migrate-acx-v1] GIN index created.');
    } else {
      console.log('[migrate-acx-v1] GIN index already exists — skipping.');
    }

    // 3. One-time tag assignment for directives with no tags yet
    const directives = await client.query<{ id: string; content: string }>(
      `SELECT id, content FROM directives WHERE tags IS NULL`,
    );

    if (directives.rows.length === 0) {
      console.log('[migrate-acx-v1] All directives already have tags — skipping UPDATE pass.');
    } else {
      console.log(`[migrate-acx-v1] Assigning tags to ${directives.rows.length} directive(s)...`);
      for (const row of directives.rows) {
        const tags = assignTags(row.content);
        await client.query(
          `UPDATE directives SET tags = $1 WHERE id = $2`,
          [tags, row.id],
        );
        console.log(`[migrate-acx-v1]   ${row.id} → [${tags.join(', ')}]`);
      }
      console.log('[migrate-acx-v1] Tag assignment complete.');
    }

    await client.query('COMMIT');
    console.log('[migrate-acx-v1] Migration complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate-acx-v1] Migration failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Run when called directly
runMigration().catch(err => {
  console.error(err);
  process.exit(1);
});
