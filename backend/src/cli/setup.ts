#!/usr/bin/env tsx
/**
 * Porter Setup CLI — auto-configures any machine for Porter's multi-model Bridge.
 *
 * Usage: cd /home/lobster/documents/porter/backend && npx tsx src/cli/setup.ts
 *
 * Idempotent — safe to run multiple times.
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
  print(`  ${C.green}\u2713${C.reset} ${msg}`);
}

function skip(msg: string) {
  print(`  ${C.gray}\u2013${C.reset} ${C.gray}${msg}${C.reset}`);
}

function warn(msg: string) {
  print(`  ${C.yellow}!${C.reset} ${C.yellow}${msg}${C.reset}`);
}

function err(msg: string) {
  print(`  ${C.red}\u2717${C.reset} ${C.red}${msg}${C.reset}`);
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

// ---------------------------------------------------------------------------
// Utility: which — check if a binary is in PATH
// ---------------------------------------------------------------------------

function which(bin: string): string | null {
  return run(`which ${bin}`);
}

// ---------------------------------------------------------------------------
// Utility: safe JSON parse
// ---------------------------------------------------------------------------

function safeJsonRead(filePath: string): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Utility: ensure directory exists
// ---------------------------------------------------------------------------

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Utility: safe file write (creates parent dirs)
// ---------------------------------------------------------------------------

function safeWrite(filePath: string, content: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// Utility: append to file if marker not present
// ---------------------------------------------------------------------------

function appendIfMissing(filePath: string, marker: string, block: string) {
  let existing = '';
  try {
    existing = fs.readFileSync(filePath, 'utf8');
  } catch {}
  if (existing.includes(marker)) {
    return false; // already present
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
  print(`${C.bold}${C.cyan}\u2501\u2501\u2501 Porter Setup \u2501\u2501\u2501${C.reset}`);
  print(`${C.dim}v${version} \u2014 multi-model Bridge configurator${C.reset}`);
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
    warn('Brain offline at :3001 (will continue \u2014 start server later)');
    return false;
  }
}

// ===================================================================
// STEP 3: Detect installed CLIs
// ===================================================================

interface CliInfo {
  name: string;
  bin: string;
  versionFlag: string;
  found: boolean;
  version: string;
  path: string;
}

function step3_detectCLIs(): CliInfo[] {
  header('CLI Detection');

  const clis: { name: string; bin: string; versionFlag: string }[] = [
    { name: 'Claude Code', bin: 'claude', versionFlag: '--version' },
    { name: 'OpenAI Codex', bin: 'codex', versionFlag: '--version' },
    { name: 'Google Gemini', bin: 'gemini', versionFlag: '--version' },
    { name: 'OpenClaw', bin: 'openclaw', versionFlag: '--version' },
    { name: 'Ollama', bin: 'ollama', versionFlag: '--version' },
  ];

  const results: CliInfo[] = [];

  for (const cli of clis) {
    const binPath = which(cli.bin);
    if (binPath) {
      let ver = run(`${cli.bin} ${cli.versionFlag}`) ?? 'unknown';
      // Trim version to first line and first ~60 chars
      ver = ver.split('\n')[0].slice(0, 60);
      ok(`${cli.name} (${cli.bin}) \u2014 ${ver}`);
      results.push({ ...cli, found: true, version: ver, path: binPath });
    } else {
      skip(`${cli.name} (${cli.bin}) \u2014 not installed`);
      results.push({ ...cli, found: false, version: '', path: '' });
    }
  }

  return results;
}

// ===================================================================
// STEP 4: Install porter-ctx script
// ===================================================================

function step4_porterCtx() {
  header('Porter Context Script');

  const targetPath = path.join(HOME, '.local', 'bin', 'porter-ctx');

  // Read the existing porter-ctx as template
  let content = '';
  const existingPath = path.join(HOME, '.local', 'bin', 'porter-ctx');
  try {
    content = fs.readFileSync(existingPath, 'utf8');
  } catch {}

  if (!content) {
    // Generate a fresh porter-ctx from the embedded template
    content = generatePorterCtx();
  }

  // Update paths in the script to match detected porter root
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

  // Ensure ~/.local/bin is in PATH hint
  const pathEnv = process.env.PATH || '';
  if (!pathEnv.includes(path.join(HOME, '.local', 'bin'))) {
    warn(`~/.local/bin not in PATH \u2014 add it: export PATH="$HOME/.local/bin:$PATH"`);
  }
}

function generatePorterCtx(): string {
  return `#!/usr/bin/env bash
# Porter Context Banner \u2014 shows project state before launching any CLI
# Usage: porter-ctx [cli-command]
# Example: porter-ctx claude, porter-ctx codex, porter-ctx gemini

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
echo -e "\${B}\${C}\u2501\u2501\u2501 Porter Bridge \u2501\u2501\u2501\${N}"
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
  echo -e "  \${B}Server:\${N}   \${G}\u25cf\${N} :3001 \${D}(API + Admin + Bridge)\${N}"
else
  echo -e "  \${B}Server:\${N}   \${R}\u25cf\${N} :3001 \${D}(offline)\${N}"
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
echo -e "  \${G}\u2192\${N} \${B}\${PROJECT_NAME}\${N} \${D}(\${PROJECT_DIR})\${N}"
echo -e "\${D}\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\${N}"
echo ""

# Launch the CLI in the project directory
if [ -n "$1" ]; then
  cd "$PROJECT_DIR"
  exec "$@"
fi
`;
}

// ===================================================================
// STEP 5: Register session start hooks
// ===================================================================

function step5_registerHooks(clis: CliInfo[]) {
  header('Session Hooks');

  const hookCommand = `node "${SESSION_HOOK}"`;

  // --- Claude Code ---
  const claude = clis.find((c) => c.bin === 'claude');
  if (claude?.found) {
    registerClaudeHook(hookCommand);
  } else {
    skip('Claude Code \u2014 not installed, skipping hook');
  }

  // --- Codex ---
  const codex = clis.find((c) => c.bin === 'codex');
  if (codex?.found) {
    registerCodexHook(hookCommand);
  } else {
    skip('Codex \u2014 not installed, skipping hook');
  }

  // --- Gemini ---
  const gemini = clis.find((c) => c.bin === 'gemini');
  if (gemini?.found) {
    registerGeminiHook(hookCommand);
  } else {
    skip('Gemini \u2014 not installed, skipping hook');
  }

  // --- OpenClaw ---
  const openclaw = clis.find((c) => c.bin === 'openclaw');
  if (openclaw?.found) {
    registerOpenClawHook();
  } else {
    skip('OpenClaw \u2014 not installed, skipping hook');
  }
}

function registerClaudeHook(hookCommand: string) {
  const settingsPath = path.join(HOME, '.claude', 'settings.json');
  const settings = safeJsonRead(settingsPath);

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];

  const porterHook = { type: 'command', command: hookCommand };

  // Check if porter hook already exists in any group
  let found = false;
  for (const group of settings.hooks.SessionStart) {
    if (!group.hooks) continue;
    for (const h of group.hooks) {
      if (h.command && h.command.includes('session-hook.')) {
        h.command = hookCommand; // update path
        found = true;
      }
    }
  }

  if (!found) {
    // Find existing group or create one
    if (settings.hooks.SessionStart.length > 0 && settings.hooks.SessionStart[0].hooks) {
      settings.hooks.SessionStart[0].hooks.push(porterHook);
    } else {
      settings.hooks.SessionStart.push({ hooks: [porterHook] });
    }
  }

  ensureDir(path.dirname(settingsPath));
  safeWrite(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  ok(`Claude Code \u2014 hook ${found ? 'updated' : 'added'} in ${settingsPath}`);
}

function registerCodexHook(hookCommand: string) {
  const configPath = path.join(HOME, '.codex', 'config.toml');
  let content = '';
  try {
    content = fs.readFileSync(configPath, 'utf8');
  } catch {}

  // TOML needs the raw command without wrapping quotes inside the value.
  // hookCommand is: node "/path/to/session-hook.cjs"
  // For TOML we use the path without inner quotes since TOML handles that.
  const tomlCommand = `node ${SESSION_HOOK}`;

  const marker = 'session-hook.';
  if (content.includes(marker)) {
    // Update the existing hook command line
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(marker)) {
        lines[i] = `command = "${tomlCommand}"`;
      }
    }
    safeWrite(configPath, lines.join('\n'));
    ok(`Codex \u2014 hook updated in ${configPath}`);
  } else {
    const block = `
# Porter Bridge session hook
[[hooks]]
event = "SessionStart"
command = "${tomlCommand}"
`;
    appendIfMissing(configPath, 'Porter Bridge session hook', block);
    ok(`Codex \u2014 hook added to ${configPath}`);
  }
}

function registerGeminiHook(hookCommand: string) {
  const settingsPath = path.join(HOME, '.gemini', 'settings.json');
  const settings = safeJsonRead(settingsPath);

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];

  const porterHook = { type: 'command', command: hookCommand };

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
  ok(`Gemini \u2014 hook ${found ? 'updated' : 'added'} in ${settingsPath}`);
}

function registerOpenClawHook() {
  const agentsPath = path.join(HOME, '.openclaw', 'workspace', 'AGENTS.md');
  let content = '';
  try {
    content = fs.readFileSync(agentsPath, 'utf8');
  } catch {}

  if (!content) {
    skip('OpenClaw \u2014 AGENTS.md not found, skipping');
    return;
  }

  // Update the checkpoint path to be dynamic
  const newCheckpoint = `${PORTER_ROOT}/tasks/checkpoint.md`;
  if (content.includes(newCheckpoint)) {
    ok('OpenClaw \u2014 AGENTS.md already points to Porter checkpoint');
  } else {
    // Replace any old checkpoint path
    content = content.replace(
      /\/home\/[^\s]*\/tasks\/checkpoint\.md/g,
      newCheckpoint
    );
    safeWrite(agentsPath, content);
    ok(`OpenClaw \u2014 AGENTS.md updated to use ${newCheckpoint}`);
  }
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
alias pcodex='porter-ctx codex'
alias pgemini='porter-ctx gemini'
alias popenclaw='porter-ctx openclaw'
`;

  // Check if already present
  let existing = '';
  try {
    existing = fs.readFileSync(aliasFile, 'utf8');
  } catch {}

  if (existing.includes(marker)) {
    ok(`Aliases already present in ${aliasFile}`);
  } else {
    // Remove old Porter Bridge aliases if present (different marker)
    if (existing.includes("alias pclaude='porter-ctx claude'")) {
      ok(`Aliases already present in ${aliasFile}`);
    } else {
      appendIfMissing(aliasFile, marker, block);
      ok(`Aliases written to ${aliasFile}`);
    }
  }
}

// ===================================================================
// STEP 7: Gateway context files
// ===================================================================

function step7_gatewayContext(clis: CliInfo[]) {
  header('Gateway Context Files');

  const claude = clis.find((c) => c.bin === 'claude');
  const codex = clis.find((c) => c.bin === 'codex');
  const gemini = clis.find((c) => c.bin === 'gemini');
  const openclaw = clis.find((c) => c.bin === 'openclaw');

  // OpenClaw — use existing files (already configured)
  if (openclaw?.found) {
    const wsDir = path.join(HOME, '.openclaw', 'workspace');
    if (fs.existsSync(path.join(wsDir, 'SOUL.md'))) {
      ok('OpenClaw \u2014 context files already in ~/.openclaw/workspace/');
    } else {
      writeGatewayContext('openclaw', 'OpenClaw', 'GPT-5.4', wsDir);
      ok('OpenClaw \u2014 context files written');
    }
  }

  // Claude — write context to project CLAUDE.md (already managed by CLAUDE.md system)
  if (claude?.found) {
    ok('Claude Code \u2014 context via CLAUDE.md + session hook (managed by repo)');
  }

  // Codex — write context files to ~/.codex/workspace/
  if (codex?.found) {
    const wsDir = path.join(HOME, '.codex', 'workspace');
    writeGatewayContext('codex', 'Codex', 'GPT-5.4 Codex', wsDir);
    ok(`Codex \u2014 context files written to ${wsDir}/`);
  }

  // Gemini — write GEMINI.md bridge context
  if (gemini?.found) {
    const geminiDir = path.join(HOME, '.gemini');
    const geminiMdPath = path.join(geminiDir, 'GEMINI.md');
    let existing = '';
    try {
      existing = fs.readFileSync(geminiMdPath, 'utf8');
    } catch {}
    if (existing.includes('Porter') && existing.includes('Bridge')) {
      ok('Gemini \u2014 GEMINI.md already has Porter context');
    } else {
      const ctx = buildBridgeContext('gemini', 'Gemini', 'Gemini 2.5 Pro');
      safeWrite(geminiMdPath, ctx);
      ok(`Gemini \u2014 context written to ${geminiMdPath}`);
    }
  }
}

function writeGatewayContext(bin: string, name: string, model: string, dir: string) {
  ensureDir(dir);

  // SOUL.md
  const soul = `# SOUL.md \u2014 Operating Principles

You are ${name}, running ${model} inside Porter's multi-model Bridge.

## Core Rules

1. **Never guess.** Read the actual code. Check the actual data. Verify actual state.
2. **Be concise.** Lead with the answer. Skip filler words, preamble, transitions.
3. **Have opinions.** Disagree when something is wrong. Suggest better approaches.
4. **Be resourceful.** Try to figure it out before asking. Read files, check context, search.
5. **Earn trust through competence.** Careful with external actions, bold with internal ones.

## Architecture Awareness

- Porter IS the product. One monorepo:
  - **Brain** (\`backend/\`) :3001 \u2014 Fastify API, PostgreSQL, AI Router, Bridge, Memory V3
  - **Admin** (\`admin/\`) :5175 \u2014 SaaS control plane, Bridge UI, Intelligence, CRM
- ONE source of truth: 1 database (PostgreSQL), 1 schema.
- Porter is ALWAYS the router. All model calls go through the Bridge layer.

## Context Continuity

- Read \`${PORTER_ROOT}/tasks/checkpoint.md\` at session start
- You are part of a multi-model system \u2014 other models work on Porter too
- Update the checkpoint after completing any work
`;

  // IDENTITY.md
  const identity = `# IDENTITY.md \u2014 ${name} in Porter's Bridge

- **Name:** ${name}
- **Model:** ${model}
- **Role:** Gateway in Porter's multi-model Bridge
- **Porter Root:** ${PORTER_ROOT}

## Position in the Bridge

Porter dispatches AI requests through multiple gateways. You are one of them.
Porter's routing engine selects which gateway handles each request based on
task complexity, model capabilities, health status, and cost.

## What This Means

- You are a worker, not the orchestrator. Porter coordinates.
- Other models may have done work since your last session. Always check state.
- The canonical checkpoint is at \`${PORTER_ROOT}/tasks/checkpoint.md\` \u2014 read it.
`;

  // TOOLS.md
  const tools = `# TOOLS.md \u2014 Porter Environment

## Services

- **Porter Brain:** http://127.0.0.1:3001 (Fastify backend, API + AI Router + Bridge)
- **PostgreSQL:** database \`porter\`, user \`lobster\`

## Key Paths

- Porter (monorepo): \`${PORTER_ROOT}\`
- Brain: \`${PORTER_ROOT}/backend/\`
- Canonical checkpoint: \`${PORTER_ROOT}/tasks/checkpoint.md\`
- Projects registry: \`/home/lobster/documents/projects.md\`

## Constraints

- No sudo.
- No package installs without Moe's explicit approval.
`;

  safeWrite(path.join(dir, 'SOUL.md'), soul);
  safeWrite(path.join(dir, 'IDENTITY.md'), identity);
  safeWrite(path.join(dir, 'TOOLS.md'), tools);
}

function buildBridgeContext(bin: string, name: string, model: string): string {
  return `# ${name} \u2014 Porter Bridge Context

You are ${name} (${model}), a gateway in Porter's multi-model Bridge.

## Core Rules

1. Never guess \u2014 read the actual code, check the actual data.
2. Be concise \u2014 lead with the answer.
3. Have opinions \u2014 disagree when something is wrong.

## Architecture

- Porter monorepo: \`${PORTER_ROOT}\`
- Brain (\`backend/\`) :3001 \u2014 Fastify API, PostgreSQL, AI Router, Bridge
- Admin (\`admin/\`) :5175 \u2014 SaaS control plane

## Session Start

1. Read \`${PORTER_ROOT}/tasks/checkpoint.md\`
2. Check \`git log --oneline -5\` in the Porter repo
3. Ask Moe what he's working on
4. Update the checkpoint after completing work

## Key Paths

- Checkpoint: \`${PORTER_ROOT}/tasks/checkpoint.md\`
- Projects: \`/home/lobster/documents/projects.md\`
- Brain DB: \`psql -d porter\`
`;
}

// ===================================================================
// STEP 8: Verify session-hook.cjs exists
// ===================================================================

function step8_sessionHook() {
  header('Session Hook Script');

  if (fs.existsSync(SESSION_HOOK)) {
    const stat = fs.statSync(SESSION_HOOK);
    ok(`session-hook.cjs exists (${stat.size} bytes)`);

    // Quick syntax check
    const result = run(`node --check "${SESSION_HOOK}"`);
    if (result !== null || run(`node -e "require('${SESSION_HOOK}')"`) !== null) {
      ok('session-hook.cjs \u2014 syntax OK');
    }
  } else {
    err(`session-hook.cjs missing at ${SESSION_HOOK}`);
  }
}

// ===================================================================
// STEP 9: Summary
// ===================================================================

function step9_summary(brainOnline: boolean, clis: CliInfo[]) {
  header('Summary');

  const installed = clis.filter((c) => c.found);
  const missing = clis.filter((c) => !c.found);

  print('');
  print(`  ${C.bold}Configured:${C.reset}`);
  for (const cli of installed) {
    print(`    ${C.green}\u2713${C.reset} ${cli.name} \u2014 hook registered, context files written`);
  }

  if (missing.length > 0) {
    print('');
    print(`  ${C.bold}Not installed (skipped):${C.reset}`);
    for (const cli of missing) {
      print(`    ${C.gray}\u2013 ${cli.name}${C.reset}`);
    }
  }

  print('');
  print(`  ${C.bold}Files:${C.reset}`);
  print(`    ${C.dim}porter-ctx:${C.reset}    ~/.local/bin/porter-ctx`);
  print(`    ${C.dim}session-hook:${C.reset}  ${SESSION_HOOK}`);
  print(`    ${C.dim}aliases:${C.reset}       ~/.bash_aliases`);

  print('');
  print(`  ${C.bold}Next steps:${C.reset}`);
  if (!brainOnline) {
    print(`    1. Start Brain: ${C.cyan}systemctl --user start porter-fastify${C.reset}`);
  }
  print(`    ${brainOnline ? '1' : '2'}. Source aliases: ${C.cyan}source ~/.bash_aliases${C.reset}`);
  print(`    ${brainOnline ? '2' : '3'}. Launch a CLI: ${C.cyan}pclaude${C.reset}, ${C.cyan}pcodex${C.reset}, ${C.cyan}pgemini${C.reset}, or ${C.cyan}popenclaw${C.reset}`);

  print('');
  print(`${C.dim}\u2501\u2501\u2501 Setup complete \u2501\u2501\u2501${C.reset}`);
  print('');
}

// ===================================================================
// Main
// ===================================================================

function main() {
  step1_banner();
  const brainOnline = step2_brain();
  const clis = step3_detectCLIs();
  step4_porterCtx();
  step5_registerHooks(clis);
  step6_aliases();
  step7_gatewayContext(clis);
  step8_sessionHook();
  step9_summary(brainOnline, clis);
}

main();
