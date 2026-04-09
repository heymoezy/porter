/**
 * Intellect Memory Validator — validates file references in memory entries.
 * Extracts file paths from memory content, registers them in memory_references,
 * and periodically validates they still exist on disk.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pool } from '../../db/client.js';
import { logIntellectEvent } from './file-watcher.js';

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
      // Try fuzzy match: same filename in nearby directories
      const fileName = path.basename(ref.ref_value);
      const parentDir = path.dirname(path.dirname(ref.ref_value));
      let newPath: string | null = null;

      try {
        newPath = findFileRecursive(parentDir, fileName, 3);
      } catch { /* ignore search errors */ }

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
        await logIntellectEvent('memory_auto_fixed', 'validator', {
          action: 'path_corrected',
          oldPath: ref.ref_value,
          newPath,
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
            action: 'reference_broken',
            filePath: ref.ref_value,
            memory: { table: ref.memory_table, id: ref.memory_id },
          });
        }
        broken++;
      }
    }
  }

  return { total: rows.length, valid, broken, fixed };
}

/** Simple recursive file search (limited depth). */
function findFileRecursive(dir: string, fileName: string, maxDepth: number): string | null {
  if (maxDepth <= 0 || !fs.existsSync(dir)) return null;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'build') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === fileName) return fullPath;
      if (entry.isDirectory()) {
        const found = findFileRecursive(fullPath, fileName, maxDepth - 1);
        if (found) return found;
      }
    }
  } catch { /* permission or read error */ }
  return null;
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
