/**
 * Intellect File Watcher — watches project directories for filesystem changes.
 * When files are renamed/moved/deleted, validates memory references and flags stale ones.
 * Runs inside the Fastify process using chokidar.
 */

import chokidar from 'chokidar';
import path from 'node:path';
import { pool } from '../../db/client.js';
import { randomUUID } from 'node:crypto';

// ── State ───────────────────────────────────────────────────────────────

let watcher: ReturnType<typeof chokidar.watch> | null = null;
const watchedDirs = new Set<string>();
const DEBOUNCE_MS = 500;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const pendingChanges: Map<string, 'change' | 'add' | 'unlink' | 'rename'> = new Map();

// ── Start/Stop ──────────────────────────────────────────────────────────

export function startFileWatcher(projectDirs: string[]): void {
  if (watcher) return; // already running

  const dirs = projectDirs.filter(d => d && d.length > 5); // safety: skip bogus paths
  if (dirs.length === 0) {
    console.log('[intellect:file-watcher] no project directories to watch');
    return;
  }

  watcher = chokidar.watch(dirs, {
    persistent: true,
    ignoreInitial: true,
    depth: 10,
    ignored: [
      '**/node_modules/**',
      '**/.git/**',
      '**/build/**',
      '**/dist/**',
      '**/.next/**',
      '**/__pycache__/**',
      '**/*.pyc',
      '**/package-lock.json',
    ],
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher
    .on('add', (p: string) => queueChange(p, 'add'))
    .on('change', (p: string) => queueChange(p, 'change'))
    .on('unlink', (p: string) => queueChange(p, 'unlink'))
    .on('error', (err: unknown) => console.error('[intellect:file-watcher] error:', err));

  for (const d of dirs) watchedDirs.add(d);
  console.log(`[intellect:file-watcher] watching ${dirs.length} project directories`);
}

export function stopFileWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
    watchedDirs.clear();
    console.log('[intellect:file-watcher] stopped');
  }
}

export function addProjectDir(dir: string): void {
  if (!watcher || watchedDirs.has(dir)) return;
  watcher.add(dir);
  watchedDirs.add(dir);
  console.log(`[intellect:file-watcher] added watch: ${dir}`);
}

// ── Debounced processing ────────────────────────────────────────────────

function queueChange(filePath: string, eventType: 'add' | 'change' | 'unlink' | 'rename') {
  pendingChanges.set(filePath, eventType);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => processPendingChanges(), DEBOUNCE_MS);
}

async function processPendingChanges(): Promise<void> {
  const changes = new Map(pendingChanges);
  pendingChanges.clear();

  for (const [filePath, eventType] of changes) {
    try {
      if (eventType === 'unlink') {
        await handleFileDeleted(filePath);
      } else if (eventType === 'add') {
        await handleFileAdded(filePath);
      }
      // 'change' events on existing files don't affect memory references
    } catch (err) {
      console.error(`[intellect:file-watcher] error processing ${eventType} ${filePath}:`, (err as Error).message);
    }
  }
}

// ── Event handlers ──────────────────────────────────────────────────────

async function handleFileDeleted(filePath: string): Promise<void> {
  // Find memory references pointing to this path
  const { rows } = await pool.query<{ id: string; memory_table: string; memory_id: string }>(
    `SELECT id, memory_table, memory_id FROM memory_references WHERE ref_type = 'file' AND ref_value = $1 AND status = 'valid'`,
    [filePath],
  );

  if (rows.length === 0) return;

  // Mark references as broken
  const now = Date.now() / 1000;
  await pool.query(
    `UPDATE memory_references SET status = 'broken', last_validated_at = $1 WHERE ref_type = 'file' AND ref_value = $2 AND status = 'valid'`,
    [now, filePath],
  );

  // Log the event
  await logIntellectEvent('memory_stale', 'file_watcher', {
    action: 'file_deleted',
    filePath,
    affectedReferences: rows.length,
    affectedMemories: rows.map(r => ({ table: r.memory_table, id: r.memory_id })),
  });

  console.log(`[intellect:file-watcher] file deleted: ${filePath} — ${rows.length} memory reference(s) marked broken`);
}

async function handleFileAdded(filePath: string): Promise<void> {
  // Check if any broken references match by filename (fuzzy: same name, different dir)
  const fileName = path.basename(filePath);
  const { rows } = await pool.query<{ id: string; ref_value: string; memory_table: string; memory_id: string }>(
    `SELECT id, ref_value, memory_table, memory_id FROM memory_references WHERE ref_type = 'file' AND status = 'broken' AND ref_value LIKE $1`,
    [`%/${fileName}`],
  );

  if (rows.length === 0) return;

  // Auto-fix: update broken references to new path
  const now = Date.now() / 1000;
  for (const row of rows) {
    await pool.query(
      `UPDATE memory_references SET ref_value = $1, status = 'valid', last_validated_at = $2 WHERE id = $3`,
      [filePath, now, row.id],
    );

    await logIntellectEvent('memory_auto_fixed', 'file_watcher', {
      action: 'reference_updated',
      oldPath: row.ref_value,
      newPath: filePath,
      memory: { table: row.memory_table, id: row.memory_id },
    });
  }

  console.log(`[intellect:file-watcher] file added: ${filePath} — auto-fixed ${rows.length} broken reference(s)`);
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function logIntellectEvent(
  eventType: string,
  sourceType: string,
  details: Record<string, unknown>,
): Promise<void> {
  await pool.query(
    `INSERT INTO intellect_events (id, event_type, source_type, details_json) VALUES ($1, $2, $3, $4::jsonb)`,
    [randomUUID(), eventType, sourceType, JSON.stringify(details)],
  );
}

export { logIntellectEvent };
