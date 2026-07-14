/**
 * Intellect Tool Detector
 *
 * Periodic scan of available tools on the system. Updates the canonical
 * environment_tools registry with detection status, version, health, and —
 * as of R8 — the REAL absolute path(s), kind, how-detected, install recipe,
 * and a richer status (present|missing|drift). Runs as a scheduled Intellect
 * workflow.
 *
 * WHY: tools like libreoffice/playwright/puppeteer were being reinstalled
 * repeatedly because sessions `which` their own PATH, miss the tool, and
 * install it somewhere new. Porter now OWNS the canonical location so every
 * session/agent asks Porter (porter_which_tool / GET /api/admin/tools/registry)
 * instead of reinstalling.
 *
 * Design: binaries are detected via `which` + `--version`. Browser bundles
 * (playwright chromium cache, puppeteer chrome cache) are detected by scanning
 * their known cache directories — and version DRIFT (more than one build
 * present) is flagged so we can prune. Missing tools carry an install_recipe.
 */

import { pool } from '../../db/client.js';
import { logIntellectEvent } from './file-watcher.js';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

interface ToolSpec {
  key: string;
  binary: string;
  versionCmd?: string;
  source?: 'local' | 'npm-global' | 'service';
  kind?: 'binary' | 'npm' | 'browser' | 'service';
  installRecipe?: string;
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
  { key: 'claude', binary: 'claude', versionCmd: 'claude --version', source: 'npm-global', kind: 'npm', installRecipe: 'npm i -g @anthropic-ai/claude-code' },
  { key: 'codex', binary: 'codex', versionCmd: 'codex --version', source: 'npm-global', kind: 'npm', installRecipe: 'npm i -g @openai/codex' },
  { key: 'gemini', binary: 'gemini', versionCmd: 'gemini --version', source: 'npm-global', kind: 'npm', installRecipe: 'npm i -g @google/gemini-cli' },
  { key: 'tmux', binary: 'tmux', installRecipe: 'apt-get install -y tmux (needs sudo — ask Moe)' },
  { key: 'jq', binary: 'jq', versionCmd: 'jq --version', installRecipe: 'apt-get install -y jq (needs sudo — ask Moe)' },
  { key: 'rsync', binary: 'rsync', versionCmd: 'rsync --version' },
  { key: 'htop', binary: 'htop', versionCmd: 'htop --version' },
  { key: 'tsx', binary: 'tsx', versionCmd: 'tsx --version', source: 'npm-global', kind: 'npm', installRecipe: 'npm i -g tsx' },
  { key: 'systemctl', binary: 'systemctl', versionCmd: 'systemctl --version' },
  { key: 'journalctl', binary: 'journalctl', versionCmd: 'journalctl --version' },
  { key: 'ffmpeg', binary: 'ffmpeg', versionCmd: 'ffmpeg -version', installRecipe: 'apt-get install -y ffmpeg (needs sudo — ask Moe)' },
  { key: 'sqlite3', binary: 'sqlite3', versionCmd: 'sqlite3 --version', installRecipe: 'apt-get install -y sqlite3 (needs sudo — ask Moe)' },
  // NOTE: playwright + puppeteer browser bundles are handled by
  // detectBrowsersAndDocs() below (cache-scan with drift detection), not here.
];

interface DetectResult {
  found: boolean;
  version: string;
  path: string;
}

/**
 * Resolve a CLI, preferring the canonical global install over whatever `which` happens to hit.
 *
 * WHY (2026-07-14): `which codex` resolved to /home/lobster/node_modules/.bin/codex — a STRAY
 * install, v0.128.0, from an accidental package.json sitting in the home directory. The canonical
 * codex is v0.144.3 in ~/.npm-global/bin. The registry recorded the stray one as canonical, Bridge's
 * boot-time discovery read the registry, and every Bridge call to codex_cli therefore ran a stale
 * binary that exited 1 and silently failed over to Claude.
 *
 * The damage from that is subtle and worse than an outage: asking a "second model" for a second
 * opinion and quietly getting Claude back is not a second opinion. It is the same model agreeing
 * with itself while wearing a different name. It ran for hours before anyone looked at the logs.
 *
 * So: the canonical global install wins. A stray node_modules in someone's home directory does not
 * get to define which version of a tool the whole platform runs.
 */
function which(binary: string): string {
  const canonical = join(homedir(), '.npm-global', 'bin', binary);
  if (existsSync(canonical)) return canonical;
  try {
    return execSync(`which ${binary}`, { timeout: 5000, stdio: 'pipe', encoding: 'utf8' })
      .trim()
      .split('\n')[0];
  } catch {
    return '';
  }
}

function detect(spec: ToolSpec): DetectResult {
  const path = which(spec.binary);
  if (!path) return { found: false, version: '', path: '' };
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
  return { found: true, version, path };
}

/** Upsert a fully-described registry row. */
async function upsertTool(row: {
  key: string;
  detected: number;
  health: string;
  status: string;
  version: string;
  source: string;
  kind: string;
  canonicalPath: string;
  altPaths: string[];
  howDetected: string;
  installRecipe: string;
  now: number;
}): Promise<boolean> {
  const altPathsJson = row.altPaths.length ? JSON.stringify(row.altPaths) : '';
  const { rows: existing } = await pool.query<{ detected: number; version: string; canonical_path: string; status: string }>(
    `SELECT detected, version, canonical_path, status FROM environment_tools WHERE tool_key = $1`,
    [row.key]
  );
  const changed =
    existing.length === 0 ||
    existing[0].detected !== row.detected ||
    (row.version && existing[0].version !== row.version) ||
    existing[0].canonical_path !== row.canonicalPath ||
    existing[0].status !== row.status;

  await pool.query(
    `INSERT INTO environment_tools
       (tool_key, detected, health, status, version, source, kind, canonical_path, alt_paths, how_detected, install_recipe, last_checked_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (tool_key) DO UPDATE SET
       detected = $2, health = $3, status = $4, version = $5, source = $6, kind = $7,
       canonical_path = $8, alt_paths = $9, how_detected = $10, install_recipe = $11, last_checked_at = $12`,
    [row.key, row.detected, row.health, row.status, row.version, row.source, row.kind,
     row.canonicalPath, altPathsJson, row.howDetected, row.installRecipe, row.now]
  );
  return changed;
}

/**
 * Detect browser bundles (playwright/puppeteer) by scanning their cache dirs,
 * plus document tooling (libreoffice/soffice). Flags version DRIFT when more
 * than one build of the same browser is present — that's the reinstall smell.
 */
async function detectBrowsersAndDocs(now: number): Promise<{ detected: number; missing: number; changed: number; drift: number }> {
  let detected = 0, missing = 0, changed = 0, drift = 0;
  const home = homedir();

  // ── Playwright chromium cache ────────────────────────────────────────────
  const pwRoot = join(home, '.cache', 'ms-playwright');
  {
    let chromiumBuilds: string[] = [];
    const execPaths: string[] = [];
    if (existsSync(pwRoot)) {
      try {
        chromiumBuilds = readdirSync(pwRoot)
          .filter((d) => /^chromium-\d+$/.test(d))
          .sort();
        for (const b of chromiumBuilds) {
          const exec = join(pwRoot, b, 'chrome-linux64', 'chrome');
          if (existsSync(exec)) execPaths.push(exec);
        }
      } catch { /* ignore */ }
    }
    // Same rule as puppeteer below: canonical = the build the INSTALLED playwright pins, read from
    // its own browsers.json — not the highest-numbered folder in the cache. Porter's tests pin
    // chromium-1208 while the cache also holds 1217 (ymc/site + themozaic), so "newest folder wins"
    // had the registry advertising a browser Porter itself never launches.
    // NOTE: resolve the package ENTRY, then walk to its root — playwright-core declares an "exports"
    // map that does not expose browsers.json, so require.resolve('playwright-core/browsers.json')
    // throws. Asking for a subpath the package refuses to export is how this silently fell back to
    // the cache scan on the first attempt.
    let pinned = '';
    try {
      const entry = createRequire(import.meta.url).resolve('playwright-core');
      const root = entry.slice(0, entry.indexOf('playwright-core') + 'playwright-core'.length);
      const { browsers } = JSON.parse(readFileSync(join(root, 'browsers.json'), 'utf8')) as {
        browsers: Array<{ name: string; revision: string }>;
      };
      const rev = browsers.find((b) => b.name === 'chromium')?.revision;
      const exec = rev ? join(pwRoot, `chromium-${rev}`, 'chrome-linux64', 'chrome') : '';
      if (exec && existsSync(exec)) pinned = exec;
    } catch { /* playwright absent → fall back to the scan */ }

    const found = pinned !== '' || execPaths.length > 0;
    const isDrift = chromiumBuilds.length > 1;
    if (found) detected++; else missing++;
    if (isDrift) drift++;
    const canonical = pinned || (execPaths.length ? execPaths[execPaths.length - 1] : '');
    const status = !found ? 'missing' : isDrift ? 'drift' : 'present';
    const health = !found ? 'missing' : isDrift ? 'drift' : 'ok';
    const c = await upsertTool({
      key: 'playwright', detected: found ? 1 : 0, health, status,
      version: found ? `chromium builds: ${chromiumBuilds.join(', ')}` : '',
      source: 'browser', kind: 'browser',
      canonicalPath: canonical, altPaths: execPaths,
      howDetected: pinned ? 'playwright-core/browsers.json' : 'cache-scan',
      installRecipe: `PLAYWRIGHT_BROWSERS_PATH=${pwRoot} npx playwright install chromium  (browsers live in ${pwRoot}; run _ops/bin/browser-gc.sh to prune builds nothing pins)`,
      now,
    });
    if (c) changed++;
  }

  // ── Puppeteer chrome cache ───────────────────────────────────────────────
  //
  // The canonical Chrome is the one puppeteer ACTUALLY RESOLVES TO — asked of puppeteer itself, not
  // guessed from the cache directory.
  //
  // This used to sort the cache dir and take the last entry, i.e. the highest-numbered directory on
  // disk. That is "newest folder wins", which is not the same question as "which browser does our
  // code launch". On 2026-07-14 those two answers diverged: the cache held Chrome 148, no installed
  // puppeteer resolved to it, and the registry had pinned it anyway. Porter's own self-QA had been
  // launching an ORPHANED browser that survived only because nothing ever garbage-collected the
  // cache — and it broke the moment something did (_ops/bin/browser-gc.sh).
  //
  // A registry that reports the newest thing on disk rather than the thing in use is not a registry;
  // it is a directory listing with extra steps. It also violated this codebase's rule #2 — no
  // hardcoded binary locations — by freezing a revision-pinned absolute path.
  const ppRoot = join(home, '.cache', 'puppeteer');
  {
    const chromeDir = join(ppRoot, 'chrome');
    let versions: string[] = [];
    const execPaths: string[] = [];
    if (existsSync(chromeDir)) {
      try {
        versions = readdirSync(chromeDir).filter((d) => /^linux-/.test(d)).sort();
        for (const v of versions) {
          const exec = join(chromeDir, v, 'chrome-linux64', 'chrome');
          if (existsSync(exec)) execPaths.push(exec);
        }
      } catch { /* ignore */ }
    }

    // Authoritative: what does the installed puppeteer launch?
    let resolved = '';
    try {
      const pp = await import('puppeteer');
      const p = (pp.default ?? pp) as { executablePath?: () => string };
      const e = p.executablePath?.();
      if (e && existsSync(e)) resolved = e;
    } catch { /* puppeteer absent → fall back to the scan below */ }

    const found = resolved !== '' || execPaths.length > 0;
    // Drift is now a real signal: more than one Chrome on disk means some project pins a different
    // revision (today ymc/site is a minor version behind ymc/backend), and the extra copy is ~370 MB.
    const isDrift = versions.length > 1;
    if (found) detected++; else missing++;
    if (isDrift) drift++;
    const canonical = resolved || (execPaths.length ? execPaths[execPaths.length - 1] : '');
    const status = !found ? 'missing' : isDrift ? 'drift' : 'present';
    const health = !found ? 'missing' : isDrift ? 'drift' : 'ok';
    const c = await upsertTool({
      key: 'puppeteer', detected: found ? 1 : 0, health, status,
      version: found ? `chrome builds: ${versions.join(', ')}` : '',
      source: 'browser', kind: 'browser',
      canonicalPath: canonical, altPaths: execPaths,
      howDetected: resolved ? 'puppeteer.executablePath()' : 'cache-scan',
      installRecipe: `PUPPETEER_CACHE_DIR=${ppRoot} npx puppeteer browsers install chrome  (browsers live in ${ppRoot}; run _ops/bin/browser-gc.sh to prune builds nothing resolves to)`,
      now,
    });
    if (c) changed++;
  }

  // ── LibreOffice / soffice (document conversion) ──────────────────────────
  {
    const path = which('libreoffice') || which('soffice');
    const found = !!path;
    let version = '';
    if (found) {
      try {
        version = execSync(`${path} --version`, { timeout: 8000, stdio: 'pipe', encoding: 'utf8' }).trim().split('\n')[0].slice(0, 100);
      } catch { version = 'detected (version unknown)'; }
    }
    if (found) detected++; else missing++;
    const status = found ? 'present' : 'missing';
    const health = found ? 'ok' : 'missing';
    const c = await upsertTool({
      key: 'libreoffice', detected: found ? 1 : 0, health, status,
      version, source: 'local', kind: 'binary',
      canonicalPath: path, altPaths: [],
      howDetected: 'which',
      installRecipe: 'MISSING — needs a persistent user-local install (no sudo). Options for Moe: (a) portable AppImage from https://www.libreoffice.org/download/appimage/ into ~/apps/libreoffice, symlink soffice into ~/.npm-global/bin; (b) `snap install libreoffice` (needs snapd/sudo); (c) apt `apt-get install -y libreoffice-core --no-install-recommends` (needs sudo). Register canonical_path here once installed.',
      now,
    });
    if (c) changed++;
  }

  return { detected, missing, changed, drift };
}

export interface ToolDetectionResult {
  total: number;
  detected: number;
  missing: number;
  changed: number;
  drift: number;
}

export async function runToolDetection(): Promise<ToolDetectionResult> {
  const now = Date.now() / 1000;
  let detected = 0;
  let missing = 0;
  let changed = 0;

  for (const spec of TOOL_SPECS) {
    const result = detect(spec);
    const source = spec.source ?? 'local';
    const kind = spec.kind ?? 'binary';
    const health = result.found ? 'ok' : 'missing';
    const status = result.found ? 'present' : 'missing';

    if (result.found) detected++;
    else missing++;

    const c = await upsertTool({
      key: spec.key, detected: result.found ? 1 : 0, health, status,
      version: result.version, source, kind,
      canonicalPath: result.path, altPaths: [],
      howDetected: 'which',
      installRecipe: !result.found ? (spec.installRecipe ?? '') : (spec.installRecipe ?? ''),
      now,
    });
    if (c) changed++;
  }

  // Browser bundles + document tooling (drift-aware).
  const bd = await detectBrowsersAndDocs(now);
  detected += bd.detected;
  missing += bd.missing;
  changed += bd.changed;

  // The Stalwart mail probe used to live here. Deleted 2026-07-13: Stalwart is not
  // installed, nothing in Porter reads STALWART_URL/STALWART_API_KEY, and the probe
  // curl'd 127.0.0.1:8080 — the port of the DELETED portal.py, not Stalwart's 8443.
  // It was reporting a mail server's health off a dead Python SaaS's port.

  const result: ToolDetectionResult = {
    total: TOOL_SPECS.length + 3, // + playwright, puppeteer, libreoffice
    detected,
    missing,
    changed,
    drift: bd.drift,
  };

  if (changed > 0) {
    await logIntellectEvent('tools_detected', 'tool_detector', { ...result });
    console.log(`[intellect:tool-detector] scan complete: ${detected}/${result.total} detected, ${changed} changed, ${bd.drift} drift`);
  }

  return result;
}
