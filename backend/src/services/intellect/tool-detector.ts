/**
 * Intellect Tool Detector
 *
 * Periodic scan of available tools on the system. Updates environment_tools
 * table with detection status, version, and health. Runs as a scheduled
 * Intellect workflow.
 *
 * Design: each tool has a detect command (usually `which` + `--version`).
 * If the binary exists and returns a version string, it's detected + healthy.
 * If missing, it's detected=false + health='missing'.
 *
 * This replaces the stub POST /api/admin/env-tools/refresh endpoint.
 */

import { pool } from '../../db/client.js';
import { logIntellectEvent } from './file-watcher.js';
import { execSync } from 'node:child_process';

interface ToolSpec {
  key: string;
  binary: string;
  versionCmd?: string;
  source?: 'local' | 'npm-global' | 'service';
}

const TOOL_SPECS: ToolSpec[] = [
  { key: 'git', binary: 'git', versionCmd: 'git --version' },
  { key: 'node', binary: 'node', versionCmd: 'node --version' },
  { key: 'npm', binary: 'npm', versionCmd: 'npm --version' },
  { key: 'python3', binary: 'python3', versionCmd: 'python3 --version' },
  { key: 'curl', binary: 'curl', versionCmd: 'curl --version' },
  { key: 'wget', binary: 'wget', versionCmd: 'wget --version' },
  { key: 'psql', binary: 'psql', versionCmd: 'psql --version' },
  { key: 'docker', binary: 'docker', versionCmd: 'docker --version' },
  { key: 'ollama', binary: 'ollama', versionCmd: 'ollama --version' },
  { key: 'claude', binary: 'claude', versionCmd: 'claude --version', source: 'npm-global' },
  { key: 'codex', binary: 'codex', versionCmd: 'codex --version', source: 'npm-global' },
  { key: 'gemini', binary: 'gemini', versionCmd: 'gemini --version', source: 'npm-global' },
  { key: 'tmux', binary: 'tmux' },
  { key: 'jq', binary: 'jq', versionCmd: 'jq --version' },
  { key: 'rsync', binary: 'rsync', versionCmd: 'rsync --version' },
  { key: 'htop', binary: 'htop', versionCmd: 'htop --version' },
  { key: 'tsx', binary: 'tsx', versionCmd: 'tsx --version', source: 'npm-global' },
  { key: 'systemctl', binary: 'systemctl', versionCmd: 'systemctl --version' },
  { key: 'journalctl', binary: 'journalctl', versionCmd: 'journalctl --version' },
  { key: 'ffmpeg', binary: 'ffmpeg', versionCmd: 'ffmpeg -version' },
  { key: 'sqlite3', binary: 'sqlite3', versionCmd: 'sqlite3 --version' },
  { key: 'playwright', binary: 'npx', versionCmd: 'npx playwright --version' },
];

function detect(spec: ToolSpec): { found: boolean; version: string } {
  try {
    // Check if binary exists
    execSync(`which ${spec.binary}`, { timeout: 5000, stdio: 'pipe' });
    // Get version
    let version = '';
    if (spec.versionCmd) {
      try {
        version = execSync(spec.versionCmd, { timeout: 5000, stdio: 'pipe', encoding: 'utf8' })
          .trim()
          .split('\n')[0]
          .slice(0, 100);
      } catch {
        version = 'detected (version unknown)';
      }
    }
    return { found: true, version };
  } catch {
    return { found: false, version: '' };
  }
}

export interface ToolDetectionResult {
  total: number;
  detected: number;
  missing: number;
  changed: number;
}

export async function runToolDetection(): Promise<ToolDetectionResult> {
  const now = Date.now() / 1000;
  let detected = 0;
  let missing = 0;
  let changed = 0;

  for (const spec of TOOL_SPECS) {
    const result = detect(spec);
    const source = spec.source ?? 'local';
    const health = result.found ? 'ok' : 'missing';
    const detectedInt = result.found ? 1 : 0;

    if (result.found) detected++;
    else missing++;

    // Upsert with change detection
    const { rows: existing } = await pool.query<{ detected: number; version: string }>(
      `SELECT detected, version FROM environment_tools WHERE tool_key = $1`,
      [spec.key]
    );

    if (existing.length > 0) {
      const prev = existing[0];
      const stateChanged = prev.detected !== detectedInt ||
        (result.version && prev.version !== result.version);
      if (stateChanged) changed++;

      await pool.query(
        `UPDATE environment_tools SET detected = $1, health = $2, version = $3,
                source = $4, last_checked_at = $5 WHERE tool_key = $6`,
        [detectedInt, health, result.version, source, now, spec.key]
      );
    } else {
      await pool.query(
        `INSERT INTO environment_tools (tool_key, detected, health, version, source, last_checked_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tool_key) DO UPDATE SET detected = $2, health = $3, version = $4,
           source = $5, last_checked_at = $6`,
        [spec.key, detectedInt, health, result.version, source, now]
      );
      changed++;
    }
  }

  // Also probe Stalwart mail service
  try {
    execSync('curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/ 2>&1', {
      timeout: 3000, encoding: 'utf8'
    });
    await pool.query(
      `INSERT INTO environment_tools (tool_key, detected, health, version, source, last_checked_at)
       VALUES ('stalwart', 1, 'ok', 'JMAP mail server', 'service', $1)
       ON CONFLICT (tool_key) DO UPDATE SET detected = 1, health = 'ok', last_checked_at = $1`,
      [now]
    );
    detected++;
  } catch {
    await pool.query(
      `INSERT INTO environment_tools (tool_key, detected, health, version, source, last_checked_at)
       VALUES ('stalwart', 0, 'unavailable', '', 'service', $1)
       ON CONFLICT (tool_key) DO UPDATE SET detected = 0, health = 'unavailable', last_checked_at = $1`,
      [now]
    );
    missing++;
  }

  const result: ToolDetectionResult = {
    total: TOOL_SPECS.length + 1,
    detected,
    missing,
    changed,
  };

  if (changed > 0) {
    await logIntellectEvent('tools_detected', 'tool_detector', { ...result });
    console.log(`[intellect:tool-detector] scan complete: ${detected}/${result.total} detected, ${changed} changed`);
  }

  return result;
}
