/**
 * Tools env-file generator (R8 discoverability).
 *
 * Emits a single shell-sourceable file (default: ~/porter/tools.env) that
 * exports the canonical tool locations Porter has detected, so ANY session
 * that sources it finds tools instead of reinstalling them:
 *
 *   PLAYWRIGHT_BROWSERS_PATH  → the ONE chromium cache (kills version drift)
 *   PUPPETEER_CACHE_DIR       → the ONE puppeteer chrome cache
 *   PATH                      → prepends the npm-global bin dir
 *   PORTER_TOOL_<KEY>         → absolute canonical_path for each present tool
 *
 * Opt-in (documented, NOT auto-applied): add this ONE line to ~/.bashrc or the
 * SessionStart hook:
 *
 *   [ -f "$HOME/porter/tools.env" ] && source "$HOME/porter/tools.env"
 *
 * The file is generated from the canonical environment_tools registry, so it
 * always reflects the latest detection.
 */

import { pool } from '../../db/client.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export function defaultToolsEnvPath(): string {
  return join(homedir(), 'porter', 'tools.env');
}

interface ToolRow {
  tool_key: string;
  detected: number;
  kind: string;
  canonical_path: string;
  status: string;
}

export async function buildToolsEnvContent(): Promise<string> {
  const home = homedir();
  const { rows } = await pool.query<ToolRow>(
    `SELECT tool_key, detected, kind, canonical_path, status
       FROM environment_tools ORDER BY tool_key`
  );

  const lines: string[] = [];
  lines.push('# Porter canonical tools env — GENERATED, do not edit by hand.');
  lines.push('# Regenerate: GET /api/admin/tools/registry?regenerateEnv=1 (or the tool-detector job).');
  lines.push('# Opt-in: add to ~/.bashrc →  [ -f "$HOME/porter/tools.env" ] && source "$HOME/porter/tools.env"');
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Canonical browser caches — the anti-drift knobs.
  lines.push('# Browser caches (source-of-truth locations; stop reinstalling elsewhere)');
  lines.push(`export PLAYWRIGHT_BROWSERS_PATH="${join(home, '.cache', 'ms-playwright')}"`);
  lines.push(`export PUPPETEER_CACHE_DIR="${join(home, '.cache', 'puppeteer')}"`);
  lines.push('');

  // npm-global bin on PATH.
  const npmGlobalBin = join(home, '.npm-global', 'bin');
  lines.push('# npm-global bins (claude, codex, gemini, tsx, ...)');
  lines.push(`case ":$PATH:" in *":${npmGlobalBin}:"*) ;; *) export PATH="${npmGlobalBin}:$PATH" ;; esac`);
  lines.push('');

  // Per-tool canonical paths for tools that have one.
  lines.push('# Per-tool canonical absolute paths (present tools only)');
  for (const r of rows) {
    if (!r.detected || !r.canonical_path) continue;
    const varName = 'PORTER_TOOL_' + r.tool_key.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    lines.push(`export ${varName}="${r.canonical_path}"`);
  }
  lines.push('');
  return lines.join('\n');
}

export async function generateToolsEnvFile(path = defaultToolsEnvPath()): Promise<{ path: string; bytes: number }> {
  const content = await buildToolsEnvContent();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { mode: 0o644 });
  return { path, bytes: Buffer.byteLength(content) };
}
