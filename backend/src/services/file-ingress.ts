/**
 * file-ingress.ts -- Intelligence Ingress Pipeline: Phase 47 Plan 02
 *
 * Classifies uploaded files by extension/MIME into categories and routes them
 * to the correct project subdirectory. Emits a memory signal (concept row)
 * and updates the project's _system/project.md with the file reference.
 *
 * All ingress operations are best-effort -- errors are logged, never blocking
 * the upload response.
 */

import { pool } from '../db/client.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { emitSSE } from './scheduler.js';

// -- Types -------------------------------------------------------------------

export type FileCategory = 'document' | 'code' | 'data' | 'media' | 'config' | 'archive' | 'other';

// -- Category-to-directory mapping -------------------------------------------

export const CATEGORY_DIR_MAP: Record<FileCategory, string> = {
  document: 'context',
  code: 'work',
  data: 'context',
  media: 'outputs',
  config: 'work',
  archive: 'archive',
  other: 'intake',
};

// -- Extension lookup tables -------------------------------------------------

const DOCUMENT_EXTS = new Set([
  'md', 'txt', 'pdf', 'doc', 'docx', 'rtf', 'odt', 'tex',
]);

const CODE_EXTS = new Set([
  'py', 'js', 'ts', 'tsx', 'jsx', 'sh', 'rs', 'go', 'java', 'c', 'cpp', 'h',
  'rb', 'php', 'bash', 'sql', 'graphql', 'css',
]);

const DATA_EXTS = new Set([
  'csv', 'tsv', 'xlsx', 'xls', 'sqlite', 'db', 'parquet',
]);

const MEDIA_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico',
  'mp3', 'mp4', 'webm', 'wav', 'ogg', 'avi', 'mov',
]);

const CONFIG_EXTS = new Set([
  'env', 'ini', 'conf', 'cfg', 'properties',
  'gitignore', 'dockerignore', 'editorconfig',
]);

const ARCHIVE_EXTS = new Set([
  'zip', 'gz', 'tar', 'rar', '7z', 'bz2',
]);

/** Well-known config filenames for ambiguous extensions (json, yaml, yml, xml, toml) */
const CONFIG_FILENAMES = new Set([
  'package.json', 'tsconfig.json', 'jsconfig.json', '.eslintrc.json',
  '.prettierrc.json', 'composer.json', 'manifest.json',
  'docker-compose.yml', 'docker-compose.yaml', '.eslintrc.yml',
  '.prettierrc.yml', 'ansible.cfg', 'pom.xml', 'web.xml',
  'cargo.toml', 'pyproject.toml', 'deno.json', 'biome.json',
]);

/** Extensions that are ambiguous between config and data */
const AMBIGUOUS_EXTS = new Set(['json', 'yaml', 'yml', 'xml', 'toml']);

// -- Classification (pure, no LLM) ------------------------------------------

/**
 * Classify a file into one of 7 categories based on extension and filename.
 * Pure function -- no async, no LLM calls, instant classification.
 */
export function classifyFile(filename: string, _mimeType: string): FileCategory {
  const lower = filename.toLowerCase();
  const ext = lower.includes('.') ? lower.split('.').pop()! : '';

  // Exact extension lookups (non-ambiguous)
  if (DOCUMENT_EXTS.has(ext)) return 'document';
  if (CODE_EXTS.has(ext)) return 'code';
  if (DATA_EXTS.has(ext)) return 'data';
  if (MEDIA_EXTS.has(ext)) return 'media';
  if (CONFIG_EXTS.has(ext)) return 'config';
  if (ARCHIVE_EXTS.has(ext)) return 'archive';

  // Ambiguous extensions: config filename check first, then default to data
  if (AMBIGUOUS_EXTS.has(ext)) {
    if (CONFIG_FILENAMES.has(lower)) return 'config';
    return 'data';
  }

  // html: document by default (code contexts would use .tsx/.jsx)
  if (ext === 'html' || ext === 'htm') return 'document';

  return 'other';
}

// -- Route file (move from uploads to project dir) ---------------------------

/**
 * Move a file from the uploads directory to the correct project subdirectory.
 * Creates the target directory if needed. Handles filename collisions by
 * appending _1, _2, etc. Falls back to copy+unlink on cross-device moves.
 */
export async function routeFile(opts: {
  diskPath: string;
  filename: string;
  projectFsPath: string;
  category: FileCategory;
}): Promise<string> {
  const { diskPath, filename, projectFsPath, category } = opts;
  const targetDir = path.join(projectFsPath, CATEGORY_DIR_MAP[category]);
  await fs.mkdir(targetDir, { recursive: true });

  // Resolve collision-free target path
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let targetPath = path.join(targetDir, filename);
  let counter = 0;

  while (true) {
    try {
      await fs.access(targetPath);
      // File exists -- increment counter
      counter++;
      targetPath = path.join(targetDir, `${base}_${counter}${ext}`);
    } catch {
      // File does not exist -- good to go
      break;
    }
  }

  // Move file (rename, or copy+unlink on cross-device)
  try {
    await fs.rename(diskPath, targetPath);
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'EXDEV') {
      await fs.copyFile(diskPath, targetPath);
      await fs.unlink(diskPath);
    } else {
      throw e;
    }
  }

  return targetPath;
}

// -- Memory signal emission --------------------------------------------------

async function emitIngressSignal(opts: {
  projectId: string;
  filename: string;
  category: FileCategory;
  targetDir: string;
}): Promise<void> {
  const { projectId, filename, category, targetDir } = opts;
  const id = crypto.randomUUID();
  const now = Date.now() / 1000;
  const content = `File ingested: ${filename} classified as ${category}, routed to ${targetDir}`;

  try {
    await pool.query(
      `INSERT INTO concepts (id, memory_kind, trust_tier, scope, scope_id, content, source_type, status, review_state, created_at, updated_at)
       VALUES ($1, 'concept', 'medium', 'project', $2, $3, 'file_ingress', 'active', 'accepted', $4, $4)`,
      [id, projectId, content, now],
    );
  } catch (e) {
    console.error('[file-ingress] Failed to emit concept signal:', e);
  }
}

// -- Project context update --------------------------------------------------

async function appendFileReference(opts: {
  projectFsPath: string;
  filename: string;
  category: FileCategory;
  targetPath: string;
}): Promise<void> {
  const { projectFsPath, filename, category, targetPath } = opts;
  const projectMd = path.join(projectFsPath, '_system', 'project.md');
  const relPath = path.relative(projectFsPath, targetPath);

  try {
    let content: string;
    try {
      content = await fs.readFile(projectMd, 'utf-8');
    } catch {
      // project.md doesn't exist yet -- nothing to update
      return;
    }

    if (!content.includes('## Files')) {
      content += '\n## Files\n\n';
    }

    content += `- [${category}] ${filename} -> ${relPath}\n`;
    await fs.writeFile(projectMd, content, 'utf-8');
  } catch (e) {
    console.error('[file-ingress] Failed to update project.md:', e);
  }
}

// -- Main entry point --------------------------------------------------------

/**
 * Process an uploaded file through the intelligence ingress pipeline.
 *
 * 1. Look up the project's fs_path
 * 2. Classify the file by extension
 * 3. Route (move) it to the correct project subdirectory
 * 4. Update the files table with the new disk path
 * 5. Emit a memory signal (concept row) -- fire-and-forget
 * 6. Update _system/project.md with file reference -- fire-and-forget
 * 7. Emit SSE event for real-time UI updates
 *
 * Returns { category, newPath } on success, null on any error.
 * Never blocks or fails the upload.
 */
export async function processIngress(opts: {
  fileId: string;
  filename: string;
  diskPath: string;
  mimeType: string;
  projectId: string;
}): Promise<{ category: FileCategory; newPath: string } | null> {
  const { fileId, filename, diskPath, mimeType, projectId } = opts;

  try {
    // 1. Look up project fs_path
    const result = await pool.query(
      'SELECT fs_path FROM projects WHERE id = $1',
      [projectId],
    );
    const fsPath = result.rows[0]?.fs_path as string | undefined;
    if (!fsPath) {
      console.warn(`[file-ingress] Project ${projectId} has no fs_path -- skipping ingress`);
      return null;
    }

    // 2. Classify
    const category = classifyFile(filename, mimeType);

    // 3. Route to project directory
    const newPath = await routeFile({
      diskPath,
      filename,
      projectFsPath: fsPath,
      category,
    });

    // 4. Update files table with new location
    await pool.query(
      'UPDATE files SET disk_path = $1 WHERE id = $2',
      [newPath, fileId],
    );

    // 5. Memory signal (fire-and-forget)
    emitIngressSignal({
      projectId,
      filename,
      category,
      targetDir: CATEGORY_DIR_MAP[category],
    }).catch((e) => console.error('[file-ingress] Signal emission error:', e));

    // 6. Project context update (fire-and-forget)
    appendFileReference({
      projectFsPath: fsPath,
      filename,
      category,
      targetPath: newPath,
    }).catch((e) => console.error('[file-ingress] Project.md update error:', e));

    // 7. SSE event
    emitSSE('project:file-ingress', { projectId, fileId, filename, category }).catch(() => {});

    return { category, newPath };
  } catch (e) {
    console.error('[file-ingress] Pipeline error:', e);
    return null;
  }
}
