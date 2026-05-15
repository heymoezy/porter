#!/usr/bin/env tsx
/**
 * Porter Setup CLI — auto-configures any machine for Porter (claude_cli only).
 *
 * Usage: cd /home/lobster/projects/Porter/backend && npx tsx src/cli/setup.ts
 *
 * Idempotent — safe to run multiple times.
 *
 * History: prior to v6.9.0 this wizard configured 5 CLIs as Bridge gateways
 * (Claude/Codex/Gemini/OpenClaw/Ollama). The Bridge collapsed to claude_cli only
 * in v6.9.0; non-claude adapters were deleted. This wizard now only detects and
 * configures the Claude Code CLI (the single Bridge gateway). Codex/Gemini/etc.
 * may still be installed on the host — they just aren't Bridge gateways.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename_resolved = fileURLToPath(import.meta.url);
const __dirname_resolved = path.dirname(__filename_resolved);
const PORTER_ROOT = path.resolve(__dirname_resolved, '..', '..', '..');
const BACKEND_ROOT = path.resolve(__dirname_resolved, '..', '..');
const HOME = os.homedir();
const SESSION_HOOK = path.join(__dirname_resolved, 'session-hook.cjs');

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function print(msg: string) {
  process.stdout.write(msg + '\n');
}

function ok(msg: string) {
  print(`  ${C.green}✓${C.reset} ${msg}`);
}

function skip(msg: string) {
  print(`  ${C.gray}–${C.reset} ${C.gray}${msg}${C.reset}`);
}

function warn(msg: string) {
  print(`  ${C.yellow}!${C.reset} ${C.yellow}${msg}${C.reset}`);
}

function err(msg: string) {
  print(`  ${C.red}✗${C.reset} ${C.red}${msg}${C.reset}`);
}

function header(msg: string) {
  print('');
  print(`${C.bold}${C.cyan}${msg}${C.reset}`);
}

// ---------------------------------------------------------------------------
// Utility: run a command, return stdout or null on failure
// ---------------------------------------------------------------------------

function run(cmd: string, opts?: { timeout?: number; cwd?: string }): string | null {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      timeout: opts?.timeout ?? 5000,
      cwd: opts?.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function which(bin: string): string | null {
  return run(`which ${bin}`);
}

function safeJsonRead(filePath: string): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeWrite(filePath: string, content: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function appendIfMissing(filePath: string, marker: string, block: string) {
  let existing = '';
  try {
    existing = fs.readFileSync(filePath, 'utf8');
  } catch {}
  if (existing.includes(marker)) {
    return false;
  }
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, (existing.endsWith('\n') || existing === '' ? '' : '\n') + block, 'utf8');
  return true;
}

// ===================================================================
// STEP 1: Banner
// ===================================================================

function step1_banner() {
  let version = '?.?.?';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(BACKEND_ROOT, 'package.json'), 'utf8'));
    version = pkg.version || version;
  } catch {}

  print('');
  print(`${C.bold}${C.cyan}━━━ Porter Setup ━━━${C.reset}`);
  print(`${C.dim}v${version} — claude_cli gateway configurator${C.reset}`);
  print(`${C.dim}Porter root: ${PORTER_ROOT}${C.reset}`);
}

// ===================================================================
// STEP 2: Verify Brain connectivity
// ===================================================================

function step2_brain(): boolean {
  header('Brain Connectivity');

  const result = run('curl -sf --max-time 3 http://127.0.0.1:3001/health');
  if (result !== null) {
    ok('Brain online at :3001');
    return true;
  } else {
    warn('Brain offline at :3001 (will continue — start server later)');
    return false;
  }
}

// ===================================================================
// STEP 3: Detect Claude Code CLI (the only Bridge gateway since v6.9.0)
// ===================================================================

interface CliInfo {
  name: string;
  bin: string;
  versionFlag: string;
  found: boolean;
  version: string;
  path: string;
}

function step3_detectCLI(): CliInfo {
  header('CLI Detection');

  const cli = { name: 'Claude Code', bin: 'claude', versionFlag: '--version' };
  const binPath = which(cli.bin);

  if (binPath) {
    let ver = run(`${cli.bin} ${cli.versionFlag}`) ?? 'unknown';
    ver = ver.split('\n')[0].slice(0, 60);
    ok(`${cli.name} (${cli.bin}) — ${ver}`);
    return { ...cli, found: true, version: ver, path: binPath };
  } else {
    err(`${cli.name} (${cli.bin}) — not installed`);
    warn('Porter\'s Bridge requires the Claude Code CLI. Install it before continuing.');
    return { ...cli, found: false, version: '', path: '' };
  }
}

// ===================================================================
// STEP 4: Install porter-ctx script
// ===================================================================

function step4_porterCtx() {
  header('Porter Context Script');

  const targetPath = path.join(HOME, '.local', 'bin', 'porter-ctx');

  let content = '';
  const existingPath = path.join(HOME, '.local', 'bin', 'porter-ctx');
  try {
    content = fs.readFileSync(existingPath, 'utf8');
  } catch {}

  if (!content) {
    content = generatePorterCtx();
  }

  content = content.replace(
    /PORTER_DIR="[^"]*"/,
    `PORTER_DIR="${PORTER_ROOT}"`
  );
  content = content.replace(
    /CHECKPOINT="[^"]*"/,
    `CHECKPOINT="${PORTER_ROOT}/tasks/checkpoint.md"`
  );

  ensureDir(path.join(HOME, '.local', 'bin'));
  fs.writeFileSync(targetPath, content, { mode: 0o755 });

  ok(`porter-ctx installed at ${targetPath}`);

  const pathEnv = process.env.PATH || '';
  if (!pathEnv.includes(path.join(HOME, '.local', 'bin'))) {
    warn(`~/.local/bin not in PATH — add it: export PATH="$HOME/.local/bin:$PATH"`);
  }
}

function generatePorterCtx(): string {
  return `#!/usr/bin/env bash
# Porter Context Banner — shows project state before launching claude
# Usage: porter-ctx [claude]

CHECKPOINT="${PORTER_ROOT}/tasks/checkpoint.md"
PORTER_DIR="${PORTER_ROOT}"

# Colors
C="\\033[36m"  # cyan
G="\\033[32m"  # green
Y="\\033[33m"  # yellow
R="\\033[31m"  # red
D="\\033[2m"   # dim
B="\\033[1m"   # bold
N="\\033[0m"   # reset

echo ""
echo -e "\${B}\${C}━━━ Porter ━━━\${N}"
echo ""

# Version from package.json
VER=$(node -p "require('${BACKEND_ROOT}/package.json').version" 2>/dev/null)
echo -e "  \${B}Porter:\${N}   \${G}v\${VER:-?}\${N}"

# Last git commit
LAST_COMMIT=$(git -C "$PORTER_DIR" log --oneline -1 --format="%s (%ar)" 2>/dev/null)
echo -e "  \${B}Last:\${N}     \${D}\${LAST_COMMIT:-unknown}\${N}"

# Server health
echo ""
if curl -s --max-time 2 "http://127.0.0.1:3001/health" >/dev/null 2>&1; then
  echo -e "  \${B}Server:\${N}   \${G}●\${N} :3001 \${D}(API + Admin + Bridge)\${N}"
else
  echo -e "  \${B}Server:\${N}   \${R}●\${N} :3001 \${D}(offline)\${N}"
fi

# Project picker
echo ""
echo -e "  \${B}Projects:\${N}"
echo -e "    \${C}1\${N}) Porter         \${D}${PORTER_ROOT}\${N}"
echo -e "    \${C}2\${N}) Other"
echo ""
read -p "  Which project? [1-2]: " PROJECT_CHOICE

case "$PROJECT_CHOICE" in
  1) PROJECT_DIR="${PORTER_ROOT}" ; PROJECT_NAME="Porter" ;;
  2) read -p "  Path: " PROJECT_DIR ; PROJECT_NAME="$(basename "$PROJECT_DIR")" ;;
  *) PROJECT_DIR="${PORTER_ROOT}" ; PROJECT_NAME="Porter" ;;
esac

echo ""
echo -e "  \${G}→\${N} \${B}\${PROJECT_NAME}\${N} \${D}(\${PROJECT_DIR})\${N}"
echo -e "\${D}━━━━━━━━━━━━━━━━━━━━━\${N}"
echo ""

# Launch the CLI in the project directory
if [ -n "$1" ]; then
  cd "$PROJECT_DIR"
  exec "$@"
fi
`;
}

// ===================================================================
// STEP 5: Register Claude Code session start hook
// ===================================================================

function step5_registerHook(cli: CliInfo) {
  header('Session Hook');

  if (!cli.found) {
    skip('Claude Code — not installed, skipping hook');
    return;
  }

  const hookCommand = `node "${SESSION_HOOK}"`;
  const settingsPath = path.join(HOME, '.claude', 'settings.json');
  const settings = safeJsonRead(settingsPath);

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];

  const porterHook = { type: 'command', command: hookCommand };

  // Update existing hook if present in any group
  let found = false;
  for (const group of settings.hooks.SessionStart) {
    if (!group.hooks) continue;
    for (const h of group.hooks) {
      if (h.command && h.command.includes('session-hook.')) {
        h.command = hookCommand;
        found = true;
      }
    }
  }

  if (!found) {
    if (settings.hooks.SessionStart.length > 0 && settings.hooks.SessionStart[0].hooks) {
      settings.hooks.SessionStart[0].hooks.push(porterHook);
    } else {
      settings.hooks.SessionStart.push({ hooks: [porterHook] });
    }
  }

  ensureDir(path.dirname(settingsPath));
  safeWrite(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  ok(`Claude Code — hook ${found ? 'updated' : 'added'} in ${settingsPath}`);
}

// ===================================================================
// STEP 6: Shell aliases
// ===================================================================

function step6_aliases() {
  header('Shell Aliases');

  const aliasFile = path.join(HOME, '.bash_aliases');
  const marker = '# Porter CLI aliases';
  const block = `
# Porter CLI aliases
alias pclaude='porter-ctx claude'
`;

  let existing = '';
  try {
    existing = fs.readFileSync(aliasFile, 'utf8');
  } catch {}

  if (existing.includes(marker)) {
    ok(`Aliases already present in ${aliasFile}`);
  } else if (existing.includes("alias pclaude='porter-ctx claude'")) {
    ok(`Aliases already present in ${aliasFile}`);
  } else {
    appendIfMissing(aliasFile, marker, block);
    ok(`Aliases written to ${aliasFile}`);
  }
}

// ===================================================================
// STEP 7: Verify session-hook.cjs exists
// ===================================================================

function step7_sessionHook() {
  header('Session Hook Script');

  if (fs.existsSync(SESSION_HOOK)) {
    const stat = fs.statSync(SESSION_HOOK);
    ok(`session-hook.cjs exists (${stat.size} bytes)`);

    const result = run(`node --check "${SESSION_HOOK}"`);
    if (result !== null || run(`node -e "require('${SESSION_HOOK}')"`) !== null) {
      ok('session-hook.cjs — syntax OK');
    }
  } else {
    err(`session-hook.cjs missing at ${SESSION_HOOK}`);
  }
}

// ===================================================================
// STEP 8: Summary
// ===================================================================

function step8_summary(brainOnline: boolean, cli: CliInfo) {
  header('Summary');

  print('');
  print(`  ${C.bold}Configured:${C.reset}`);
  if (cli.found) {
    print(`    ${C.green}✓${C.reset} ${cli.name} — hook registered (single Bridge gateway)`);
  } else {
    print(`    ${C.red}✗${C.reset} ${cli.name} — not installed`);
  }

  print('');
  print(`  ${C.bold}Files:${C.reset}`);
  print(`    ${C.dim}porter-ctx:${C.reset}    ~/.local/bin/porter-ctx`);
  print(`    ${C.dim}session-hook:${C.reset}  ${SESSION_HOOK}`);
  print(`    ${C.dim}aliases:${C.reset}       ~/.bash_aliases`);

  print('');
  print(`  ${C.bold}Next steps:${C.reset}`);
  let n = 1;
  if (!brainOnline) {
    print(`    ${n++}. Start Brain: ${C.cyan}systemctl --user start porter-fastify${C.reset}`);
  }
  print(`    ${n++}. Source aliases: ${C.cyan}source ~/.bash_aliases${C.reset}`);
  print(`    ${n++}. Launch Claude: ${C.cyan}pclaude${C.reset}`);

  print('');
  print(`${C.dim}━━━ Setup complete ━━━${C.reset}`);
  print('');
}

// ===================================================================
// Main
// ===================================================================

function main() {
  step1_banner();
  const brainOnline = step2_brain();
  const cli = step3_detectCLI();
  step4_porterCtx();
  step5_registerHook(cli);
  step6_aliases();
  step7_sessionHook();
  step8_summary(brainOnline, cli);
}

main();
