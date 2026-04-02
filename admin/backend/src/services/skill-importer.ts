import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { queryOne, execute } from '../db/pg.js';

// ── Types ──────────────────────────────────────────────────

export interface ImportCandidate {
  id: string;
  name: string;
  description: string;
  category: string;
  source: string;
  dirPath: string;
  files: string[];
  conflict: boolean;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

// ── Constants ──────────────────────────────────────────────

const TEMP_ROOT = '/tmp/porter-skill-import';
const SKILLS_ROOT = process.env.PORTER_SKILLS_DIR || '/home/lobster/documents/porter/skills';

// ── Helpers ────────────────────────────────────────────────

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Extract repo name from URL (e.g. "anthropics/skills" from "https://github.com/anthropics/skills") */
function repoNameFromUrl(url: string): string {
  const match = url.match(/([^/]+\/[^/.]+)(?:\.git)?$/);
  return match?.[1] || url;
}

/** Parse YAML-like frontmatter from SKILL.md content */
function parseFrontmatter(content: string): Record<string, string> {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return {};

  const result: Record<string, string> = {};
  for (const line of fmMatch[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value) result[key] = value;
  }
  return result;
}

/** Recursively find all SKILL.md files (case-insensitive) */
function findSkillFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden dirs, node_modules, .git
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      results.push(...findSkillFiles(full));
    } else if (entry.name.toLowerCase() === 'skill.md') {
      results.push(full);
    }
  }
  return results;
}

/** List all files in a directory (non-recursive for top level, recursive for subdirs) */
function listDirFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const sub of listDirFilesRecursive(full)) {
        results.push(path.relative(dir, sub));
      }
    } else {
      results.push(entry.name);
    }
  }
  return results;
}

function listDirFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listDirFilesRecursive(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

/** Copy a directory recursively */
function copyDirSync(src: string, dest: string) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ── Public API ─────────────────────────────────────────────

/**
 * Clone a repo (shallow) and scan for SKILL.md files.
 * Returns a list of import candidates.
 */
export async function scanRepo(repoUrl: string): Promise<ImportCandidate[]> {
  // Normalize URL
  let url = repoUrl.trim();
  if (!url.startsWith('http') && !url.startsWith('git@')) {
    url = `https://github.com/${url}`;
  }
  if (!url.endsWith('.git')) {
    url = `${url}.git`;
  }

  // Prepare temp directory
  ensureDir(TEMP_ROOT);
  const dirName = `clone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cloneDir = path.join(TEMP_ROOT, dirName);

  // Clone (shallow, single branch)
  try {
    execSync(`git clone --depth 1 --single-branch ${JSON.stringify(url)} ${JSON.stringify(cloneDir)}`, {
      timeout: 60000,
      stdio: 'pipe',
    });
  } catch (e) {
    throw new Error(`Failed to clone repository: ${(e as Error).message?.split('\n')[0] || 'unknown error'}`);
  }

  // Scan for SKILL.md files
  const skillFiles = findSkillFiles(cloneDir);
  if (skillFiles.length === 0) {
    return [];
  }

  const source = repoNameFromUrl(repoUrl);
  const candidates: ImportCandidate[] = [];

  for (const skillFile of skillFiles) {
    const dirPath = path.dirname(skillFile);
    const content = fs.readFileSync(skillFile, 'utf8');
    const fm = parseFrontmatter(content);

    // Derive id from frontmatter name or directory name
    const rawName = fm.name || path.basename(dirPath);
    const id = slugify(rawName);
    if (!id) continue;

    // Check for conflict with existing skill in DB
    const existing = await queryOne<{ id: string }>('SELECT id FROM skills WHERE id = $1', [id]);

    candidates.push({
      id,
      name: fm.name || rawName,
      description: fm.description || '',
      category: fm.category || inferCategory(dirPath, cloneDir),
      source,
      dirPath,
      files: listDirFiles(dirPath),
      conflict: !!existing,
    });
  }

  return candidates;
}

/** Infer category from directory structure (parent folder name) */
function inferCategory(dirPath: string, cloneRoot: string): string {
  const relative = path.relative(cloneRoot, dirPath);
  const parts = relative.split(path.sep);
  // If there's a parent directory above the skill dir, use it as category
  if (parts.length >= 2) {
    return parts[parts.length - 2]
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }
  return 'Imported';
}

/**
 * Import selected candidates: copy files to Porter's skills dir + insert into DB.
 */
export async function importCandidates(
  candidates: ImportCandidate[],
  overwrite: boolean
): Promise<ImportResult> {
  ensureDir(SKILLS_ROOT);

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const destDir = path.join(SKILLS_ROOT, candidate.id);

      // Check conflict
      if (fs.existsSync(destDir) && !overwrite) {
        skipped++;
        continue;
      }

      // Copy files
      if (fs.existsSync(destDir) && overwrite) {
        fs.rmSync(destDir, { recursive: true, force: true });
      }
      copyDirSync(candidate.dirPath, destDir);

      // Upsert into DB
      await execute(`
        INSERT INTO skills (id, name, description, category, source, enabled, visible, featured, icon, color, short_label, sort_order, featured_order, pack_status, config_schema)
        VALUES ($1, $2, $3, $4, $5, 1, 1, 0, '', '', '', 50, 0, 'ready', '{}')
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          source = EXCLUDED.source,
          pack_status = 'ready',
          updated_at = EXTRACT(EPOCH FROM NOW())
      `, [
        candidate.id,
        candidate.name,
        candidate.description,
        candidate.category,
        `github:${candidate.source}`,
      ]);

      imported++;
    } catch (e) {
      errors.push(`${candidate.id}: ${(e as Error).message}`);
    }
  }

  return { imported, skipped, errors };
}

/**
 * Remove all temp clone directories.
 */
export function cleanupTemp(): void {
  if (fs.existsSync(TEMP_ROOT)) {
    fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
  }
}
