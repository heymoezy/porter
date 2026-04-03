/**
 * atlas-agent.ts -- Atlas Structural Health Agent: Phase 47-03
 *
 * Periodically scans every project with an fs_path, verifies canonical
 * directory structure, auto-repairs missing directories, flags missing
 * _system files and misplaced root files, and logs all findings to the
 * project activity feed.
 */

import fs from 'fs/promises';
import path from 'path';
import { pool } from '../db/client.js';
import { CANONICAL_DIRS } from './project-substrate.js';

export const ATLAS_WATCHER_TYPE = 'atlas_structural';

interface AtlasFinding {
  type: 'missing_dir' | 'missing_file' | 'misplaced_file' | 'repaired';
  path: string;
  detail: string;
}

/** Files expected in _system/ -- flagged if missing but NOT auto-recreated */
const EXPECTED_SYSTEM_FILES = [
  'project.md', 'checkpoint.md', 'memory.md', 'decisions.md', 'tasks.md', 'agents.md',
];

/** Files allowed in the project root (not flagged as misplaced) */
const ROOT_ALLOWLIST = new Set([
  'README.md', 'readme.md', '.gitignore', '.gitkeep',
]);

/**
 * Run a structural health check on a single project.
 * Missing canonical directories are auto-repaired. Missing _system files
 * and misplaced root files are flagged but not touched.
 */
export async function runAtlasCheck(
  projectId: string,
  fsPath: string,
  projectName: string,
): Promise<AtlasFinding[]> {
  const findings: AtlasFinding[] = [];

  // Verify project root exists
  try {
    await fs.access(fsPath);
  } catch {
    return [{ type: 'missing_dir', path: fsPath, detail: 'Project root directory missing' }];
  }

  // Check canonical directories -- auto-repair if missing
  for (const dir of CANONICAL_DIRS) {
    const dirPath = path.join(fsPath, dir);
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
      findings.push({ type: 'repaired', path: dir, detail: `Recreated missing directory /${dir}/` });
    }
  }

  // Check _system files -- flag only, do not recreate
  for (const file of EXPECTED_SYSTEM_FILES) {
    const filePath = path.join(fsPath, '_system', file);
    try {
      await fs.access(filePath);
    } catch {
      findings.push({ type: 'missing_file', path: `_system/${file}`, detail: `System file missing: ${file}` });
    }
  }

  // Check for misplaced files in root -- flag files that should be in subdirectories
  try {
    const entries = await fs.readdir(fsPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.startsWith('.')) continue;           // skip hidden files
      if (ROOT_ALLOWLIST.has(entry.name)) continue;       // skip known root files
      findings.push({
        type: 'misplaced_file',
        path: entry.name,
        detail: `File "${entry.name}" found in project root -- should be in a subdirectory (intake/, context/, work/, outputs/, or archive/)`,
      });
    }
  } catch (err) {
    console.error('[atlas] Error reading project root %s:', fsPath, err);
  }

  return findings;
}

/**
 * Log Atlas findings to the project activity feed and emit SSE.
 * No-op for clean projects (zero findings).
 */
async function logAtlasFindings(
  projectId: string,
  projectName: string,
  findings: AtlasFinding[],
): Promise<void> {
  if (findings.length === 0) return;

  const repaired = findings.filter(f => f.type === 'repaired').length;
  const missing  = findings.filter(f => f.type === 'missing_dir' || f.type === 'missing_file').length;
  const misplaced = findings.filter(f => f.type === 'misplaced_file').length;

  const parts: string[] = [];
  if (repaired)  parts.push(`${repaired} repaired`);
  if (missing)   parts.push(`${missing} missing`);
  if (misplaced) parts.push(`${misplaced} misplaced files`);
  const summary = `Atlas: ${parts.join(', ')}`;

  try {
    await pool.query(
      `INSERT INTO agent_activity (agent_id, job_id, project_id, event_type, summary, detail)
       VALUES ('atlas', $1, $2, $3, $4, $5)`,
      [null, projectId, 'atlas_check', summary, JSON.stringify({ findings, checked_at: Date.now() / 1000 })],
    );

    const { emitSSE } = await import('./scheduler.js');
    await emitSSE('project:activity', {
      projectId,
      eventType: 'atlas_check',
      findingCount: findings.length,
    }).catch(() => {});
  } catch (err) {
    console.error('[atlas] Error logging findings for project %s:', projectId, err);
  }
}

/**
 * Schedule Atlas checks for all active projects with provisioned filesystem paths.
 * Each project is checked independently -- one failure does not stop others.
 */
export async function scheduleAtlasRuns(): Promise<void> {
  const { rows } = await pool.query<{ id: string; name: string; fs_path: string }>(
    `SELECT id, name, fs_path FROM projects WHERE fs_path IS NOT NULL AND status = 'active'`,
  );

  let totalFindings = 0;

  for (const project of rows) {
    try {
      const findings = await runAtlasCheck(project.id, project.fs_path, project.name);
      await logAtlasFindings(project.id, project.name, findings);
      totalFindings += findings.length;
    } catch (err) {
      console.error('[atlas] Error checking project %s (%s):', project.name, project.id, err);
    }
  }

  console.log('[atlas] checked %d projects, %d findings', rows.length, totalFindings);
}
