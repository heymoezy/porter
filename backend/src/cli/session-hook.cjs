#!/usr/bin/env node
// Porter Session Start Hook — Universal (works with any CLI)
// Outputs context that tells the AI to load checkpoint and project state.
// Called by Claude, Codex, Gemini, OpenClaw session hooks.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORTER_DIR = path.resolve(__dirname, '..', '..', '..');
const CHECKPOINT = path.join(PORTER_DIR, 'tasks', 'checkpoint.md');
const PROJECTS = '/home/lobster/documents/projects.md';

// Skip heavy context when called from Bridge dispatch (one-shot questions)
if (process.env.PORTER_BRIDGE_DISPATCH) {
  process.stdout.write('Answer the question directly. Do not read files or load context. Be concise.');
  process.exit(0);
}

const lines = [];

// Detect which CLI is calling us (env hint or fallback to cwd heuristic)
const cliName = process.env.PORTER_CLI || 'unknown';

// Check if we're in a porter-related directory
const cwd = process.cwd();
const isPorter = cwd.startsWith(PORTER_DIR);

// Read checkpoint (truncated to keep output manageable)
let checkpoint = '';
try {
  checkpoint = fs.readFileSync(CHECKPOINT, 'utf8').slice(0, 1500);
} catch {}

// Get recent git log from porter
let gitLog = '';
try {
  gitLog = execSync('git log --oneline -5 --format="%h %s (%ar)"', {
    cwd: PORTER_DIR,
    encoding: 'utf8',
    timeout: 3000,
  }).trim();
} catch {}

// Get Brain directives count via psql
let directiveCount = 0;
try {
  const out = execSync(
    "psql -d porter -tAc \"SELECT COUNT(*) FROM directives WHERE status='active';\"",
    { encoding: 'utf8', timeout: 3000 }
  ).trim();
  directiveCount = parseInt(out) || 0;
} catch {}

// Get Brain concepts count
let conceptCount = 0;
try {
  const out = execSync(
    "psql -d porter -tAc \"SELECT COUNT(*) FROM concepts WHERE status='active';\"",
    { encoding: 'utf8', timeout: 3000 }
  ).trim();
  conceptCount = parseInt(out) || 0;
} catch {}

// Check Brain server health
let brainOnline = false;
try {
  execSync('curl -sf --max-time 2 http://127.0.0.1:3001/health', {
    encoding: 'utf8',
    timeout: 3000,
  });
  brainOnline = true;
} catch {}

// Build output
lines.push('## Porter Session Context');
lines.push('');
lines.push(`Gateway: ${cliName} | Brain: ${brainOnline ? 'online :3001' : 'OFFLINE'}`);

if (isPorter) {
  lines.push(`Working directory is inside Porter (${cwd}).`);
} else {
  lines.push('Ask Moe which project he is working on before doing anything.');
  lines.push('Active projects: read /home/lobster/documents/projects.md');
}

if (checkpoint) {
  lines.push('');
  lines.push('### Checkpoint (truncated)');
  lines.push(checkpoint);
}

if (gitLog) {
  lines.push('');
  lines.push('### Recent Porter commits');
  lines.push(gitLog);
}

const dbParts = [];
if (directiveCount > 0) dbParts.push(`${directiveCount} directives`);
if (conceptCount > 0) dbParts.push(`${conceptCount} concepts`);
if (dbParts.length > 0) {
  lines.push('');
  lines.push(`Brain DB: ${dbParts.join(', ')} active. System prompt pipeline is live.`);
}

lines.push('');
lines.push(
  '**ACTION REQUIRED:** Before responding to ANYTHING Moe says, you MUST first read the checkpoint file and git log, then tell Moe what you loaded. Say: "Loaded checkpoint. Porter [version]. Last: [summary]. What are we working on?" Do this FIRST in your response, then address what Moe said.'
);

process.stdout.write(lines.join('\n'));
