/**
 * Intellect Memory Validator — validates file references in memory entries.
 * Extracts file paths from memory content, registers them in memory_references,
 * and periodically validates they still exist on disk.
 *
 * When the validator auto-corrects a reference (file moved/renamed), it ALSO
 * rewrites the source memory's `content` column so CLI /context injection
 * stops serving the stale path. Ambiguous matches (multiple candidates, or
 * candidates in noise directories like admin/ build/ archive/) are NOT
 * auto-corrected — they get marked `broken` for human review.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pool } from '../../db/client.js';
import { logIntellectEvent } from './file-watcher.js';

/** Whitelist of memory tables we can rewrite content on. */
const REWRITABLE_TABLES = new Set([
  'directives',
  'concepts',
  'project_notes',
  'agent_notes',
]);

/**
 * Directories whose contents are noise for fuzzy match purposes — duplicated
 * builds, archives, vendored copies, dot-folders, etc. We never auto-correct
 * a reference into these.
 */
const FUZZY_MATCH_NOISE_DIRS = new Set([
  'node_modules',
  '.git',
  'build',
  'dist',
  '.next',
  '.cache',
  '__pycache__',
  'archive',
  'archived',
  '.archived',
  'old',
  'legacy',
  'backup',
  'backups',
  'vendor',
  'admin', // Porter-specific: admin/ contains a stale duplicate of tasks/checkpoint.md
]);

// ── Path extraction ─────────────────────────────────────────────────────

const FILE_PATH_REGEX = /\/home\/\S+?\.(ts|tsx|js|jsx|json|md|py|sh|sql|css|html|yaml|yml|toml|svg|png|jpg|gif|ico|env|txt|csv|conf)\b/g;

/** Extract file paths from memory content text. */
function extractFilePaths(content: string): string[] {
  const matches = content.match(FILE_PATH_REGEX);
  if (!matches) return [];
  // Deduplicate and clean trailing punctuation
  return [...new Set(matches.map(p => p.replace(/[),;:'"]+$/, '')))];
}

// ── Reference registration ──────────────────────────────────────────────

/** Scan a memory table and register any file path references not yet tracked. */
async function registerReferencesForTable(tableName: string): Promise<number> {
  const { rows } = await pool.query<{ id: string; content: string }>(
    `SELECT id, content FROM ${tableName} WHERE status = 'active'`,
  );

  let registered = 0;
  for (const row of rows) {
    const paths = extractFilePaths(row.content);
    for (const filePath of paths) {
      // Insert with ON CONFLICT to handle duplicates safely
      const result = await pool.query(
        `INSERT INTO memory_references (id, memory_table, memory_id, ref_type, ref_value)
         VALUES ($1, $2, $3, 'file', $4)
         ON CONFLICT (memory_table, memory_id, ref_type, ref_value) DO NOTHING`,
        [randomUUID(), tableName, row.id, filePath],
      );
      if (result.rowCount && result.rowCount > 0) registered++;
    }
  }
  return registered;
}

// ── Validation sweep ────────────────────────────────────────────────────

/** Validate all file references against the filesystem. */
async function validateAllReferences(): Promise<{
  total: number;
  valid: number;
  broken: number;
  fixed: number;
}> {
  const { rows } = await pool.query<{
    id: string;
    ref_value: string;
    status: string;
    memory_table: string;
    memory_id: string;
  }>(`SELECT id, ref_value, status, memory_table, memory_id FROM memory_references WHERE ref_type = 'file'`);

  const now = Date.now() / 1000;
  let valid = 0;
  let broken = 0;
  let fixed = 0;

  for (const ref of rows) {
    const exists = fs.existsSync(ref.ref_value);

    if (exists) {
      // Mark valid and update timestamp
      if (ref.status !== 'valid') {
        await pool.query(
          `UPDATE memory_references SET status = 'valid', last_validated_at = $1 WHERE id = $2`,
          [now, ref.id],
        );
        fixed++;
      } else {
        await pool.query(
          `UPDATE memory_references SET last_validated_at = $1 WHERE id = $2`,
          [now, ref.id],
        );
      }
      valid++;
    } else {
      // Fuzzy match: collect all candidates (same basename) within bounded depth,
      // skipping noise directories. If the result is unambiguous (1 hit), and
      // not in a noise directory, auto-correct. Otherwise mark broken — humans
      // can fix ambiguous cases via the admin UI.
      const fileName = path.basename(ref.ref_value);
      const parentDir = path.dirname(path.dirname(ref.ref_value));
      let candidates: string[] = [];

      try {
        candidates = findAllRecursive(parentDir, fileName, 3, 6 /* cap */);
      } catch { /* ignore search errors */ }

      const acceptable = candidates.filter(c => !inNoiseDir(c));
      const newPath = acceptable.length === 1 ? acceptable[0] : null;

      if (newPath) {
        // Check if another reference already points to the corrected path for this memory
        const existingCheck = await pool.query(
          `SELECT id FROM memory_references WHERE memory_table = $1 AND memory_id = $2 AND ref_type = 'file' AND ref_value = $3 AND id != $4 LIMIT 1`,
          [ref.memory_table, ref.memory_id, newPath, ref.id],
        );
        if (existingCheck.rowCount && existingCheck.rowCount > 0) {
          // A valid reference already exists for this path — just delete this stale one
          await pool.query(`DELETE FROM memory_references WHERE id = $1`, [ref.id]);
        } else {
          await pool.query(
            `UPDATE memory_references SET ref_value = $1, status = 'valid', last_validated_at = $2 WHERE id = $3`,
            [newPath, now, ref.id],
          );
        }

        // Fix 3: Propagate the corrected path back into the source memory's
        // content. Otherwise CLI /context injection keeps serving the stale
        // path string and the rule appears to drift.
        const propagated = await propagateCorrectionToContent(
          ref.memory_table,
          ref.memory_id,
          ref.ref_value,
          newPath
        );

        await logIntellectEvent('memory_auto_fixed', 'validator', {
          action: 'path_corrected',
          oldPath: ref.ref_value,
          newPath,
          contentPropagated: propagated,
          memory: { table: ref.memory_table, id: ref.memory_id },
        });
        fixed++;
        valid++;
      } else {
        if (ref.status !== 'broken') {
          await pool.query(
            `UPDATE memory_references SET status = 'broken', last_validated_at = $1 WHERE id = $2`,
            [now, ref.id],
          );
          await logIntellectEvent('memory_stale', 'validator', {
            action: candidates.length > 0 ? 'reference_ambiguous' : 'reference_broken',
            filePath: ref.ref_value,
            ambiguousMatchCount: candidates.length,
            memory: { table: ref.memory_table, id: ref.memory_id },
          });
        }
        broken++;
      }
    }
  }

  return { total: rows.length, valid, broken, fixed };
}

/** Return true if any path segment is in the noise list. */
function inNoiseDir(filePath: string): boolean {
  const segments = filePath.split(path.sep);
  for (const seg of segments) {
    if (FUZZY_MATCH_NOISE_DIRS.has(seg)) return true;
  }
  return false;
}

/**
 * Recursive search collecting up to `cap` matching paths. Skips noise dirs at
 * traversal time so we don't waste cycles inside node_modules etc.
 */
function findAllRecursive(
  dir: string,
  fileName: string,
  maxDepth: number,
  cap: number,
  out: string[] = []
): string[] {
  if (maxDepth <= 0 || out.length >= cap || !fs.existsSync(dir)) return out;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (out.length >= cap) break;
      if (FUZZY_MATCH_NOISE_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === fileName) {
        out.push(fullPath);
      } else if (entry.isDirectory()) {
        findAllRecursive(fullPath, fileName, maxDepth - 1, cap, out);
      }
    }
  } catch { /* permission or read error */ }
  return out;
}

/**
 * Rewrite the source memory's `content` column so the corrected path is
 * embedded in the memory itself, not just the reference table.
 *
 * Returns true if the content was actually rewritten (the old path was found
 * in the content). False if not — which usually means the path was extracted
 * from a different field or the content has been edited since extraction.
 *
 * Safe-by-construction: only operates on whitelisted tables, only does an
 * exact string replace, never modifies anything else.
 */
async function propagateCorrectionToContent(
  table: string,
  memoryId: string,
  oldPath: string,
  newPath: string
): Promise<boolean> {
  if (!REWRITABLE_TABLES.has(table)) return false;
  if (oldPath === newPath) return false;
  // Use a parameterized REPLACE() update so we don't risk SQL injection on
  // table name (table is whitelisted) and the strings flow as bind values.
  const sql = `UPDATE ${table}
               SET content = REPLACE(content, $1, $2),
                   updated_at = EXTRACT(EPOCH FROM NOW())
               WHERE id = $3 AND content LIKE '%' || $1 || '%'`;
  const result = await pool.query(sql, [oldPath, newPath, memoryId]);
  return (result.rowCount ?? 0) > 0;
}

// ── Full sweep (called by scheduler) ────────────────────────────────────

export async function runMemoryValidation(): Promise<void> {
  console.log('[intellect:validator] starting memory validation sweep...');

  // Step 1: Register any new file references from memory content
  const tables = ['directives', 'concepts', 'project_notes', 'agent_notes'];
  let totalRegistered = 0;
  for (const table of tables) {
    try {
      const count = await registerReferencesForTable(table);
      totalRegistered += count;
    } catch (err) {
      console.error(`[intellect:validator] error scanning ${table}:`, (err as Error).message);
    }
  }

  // Step 2: Validate all references against filesystem
  const result = await validateAllReferences();

  if (totalRegistered > 0 || result.broken > 0 || result.fixed > 0) {
    await logIntellectEvent('validation_sweep', 'validator', {
      newReferences: totalRegistered,
      ...result,
    });
  }

  console.log(
    `[intellect:validator] sweep complete: ${result.total} refs, ${result.valid} valid, ${result.broken} broken, ${result.fixed} fixed, ${totalRegistered} new`
  );
}
