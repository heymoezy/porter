/**
 * project-substrate.ts -- Project Substrate: Phase 47
 *
 * Provisions canonical filesystem structure for every project.
 * Creates /_system/ with 6 seed .md files and 5 working directories.
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { pool } from '../db/client.js';
import { config, LOCAL_HOSTS } from '../config.js';

/** The 6 canonical directories every project gets */
export const CANONICAL_DIRS = ['_system', 'intake', 'context', 'work', 'outputs', 'archive'] as const;

/** Seed file templates for _system/ directory */
export const SYSTEM_FILES: Record<string, (opts: SubstrateOpts) => string> = {
  'project.md': (o) =>
    `# ${o.name}\n\nType: ${o.type}\nCreated: ${new Date().toISOString().slice(0, 10)}\nStatus: active\n\n## Description\n\n${o.description}\n`,
  'checkpoint.md': (_o) =>
    `# Checkpoint\n\nLast updated: ${new Date().toISOString().slice(0, 10)}\n\n## Current State\n\nProject just created.\n\n## Next Steps\n\n- Define project goals\n`,
  'memory.md': (_o) =>
    `# Memory\n\nProject knowledge and context.\n`,
  'decisions.md': (_o) =>
    `# Decisions\n\nProject decisions log.\n`,
  'tasks.md': (_o) =>
    `# Tasks\n\nProject task tracking.\n`,
  'agents.md': (_o) =>
    `# Agents\n\nAssigned agents and their roles.\n`,
};

export interface SubstrateOpts {
  projectId: string;
  name: string;
  slug: string;
  type: string;
  description: string;
}

/**
 * Resolve the projects root directory from porter_config.json mounts.
 * Falls back to config.dataDir + '/projects'.
 */
function resolveProjectsRoot(): string {
  try {
    const cfgPath = path.join(config.dataDir, 'porter_config.json');
    const raw = fsSync.readFileSync(cfgPath, 'utf-8');
    const cfg = JSON.parse(raw);

    // nodes[*].mounts — look for a "projects" mount
    const nodes = cfg.nodes || cfg.fleet?.devices || {};
    for (const node of Object.values(nodes) as any[]) {
      if (node.type !== 'local' && !LOCAL_HOSTS.has(node.host)) continue;
      const mounts = node.mounts || [];
      for (const m of mounts) {
        if (m.id === 'projects' && m.path) return m.path;
      }
    }

    // Legacy locations fallback
    if (cfg.locations) {
      for (const loc of cfg.locations) {
        if (loc.id === 'projects' && loc.path) return loc.path;
      }
    }
  } catch {
    // Config not found or not parseable — use default
  }

  return path.join(config.dataDir, 'projects');
}

/**
 * Provision the canonical filesystem structure for a project.
 *
 * Creates 6 directories and 6 seed files in _system/.
 * Idempotent: missing directories are created, existing files are preserved.
 * Non-blocking: errors are logged but never thrown.
 *
 * @returns The absolute project path, or null on error.
 */
export async function provisionProjectStructure(opts: SubstrateOpts): Promise<string | null> {
  try {
    const root = resolveProjectsRoot();
    const projectDir = path.join(root, opts.slug);

    // Create all 6 canonical directories
    for (const dir of CANONICAL_DIRS) {
      await fs.mkdir(path.join(projectDir, dir), { recursive: true });
    }

    // Seed _system/ files (only if they don't exist)
    for (const [filename, templateFn] of Object.entries(SYSTEM_FILES)) {
      const filePath = path.join(projectDir, '_system', filename);
      try {
        await fs.access(filePath);
        // File exists — preserve it
      } catch {
        // File does not exist — create it
        await fs.writeFile(filePath, templateFn(opts), 'utf-8');
      }
    }

    // Update the fs_path in the database
    await pool.query('UPDATE projects SET fs_path = $1 WHERE id = $2', [projectDir, opts.projectId]);

    console.log('[substrate] Provisioned project structure: %s', projectDir);
    return projectDir;
  } catch (error) {
    console.error('[substrate] Failed to provision project structure for %s:', opts.projectId, error);
    return null;
  }
}
