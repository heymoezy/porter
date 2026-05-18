#!/usr/bin/env node
// Porter Backbone Session Hook — Universal (works with any CLI)
//
// Porter is INFRASTRUCTURE serving N peer projects (ymc.capital, Porter-the-
// repo, Deals/Stablekey, etc.). This hook outputs TWO distinct sections:
//
//   1. Backbone status (always) — Brain online?, gateway in use, DB stats.
//      This is Porter-the-orchestrator declaring itself, never a project.
//
//   2. Active project (variable) — whichever peer the user is currently
//      working on, resolved by Porter via /api/v1/intellect/active-project
//      (cwd > session pin > global pin > none). When 'none', we ASK MOE
//      with recent-by-mtime hints. We NEVER default to Porter-the-project.
//
// Called by Claude, Codex, Gemini, OpenClaw session hooks. JSON event
// payload arrives on stdin (claude-code wire format with cwd + session_id).

const http = require('http');

const PORTER_HOST = '127.0.0.1';
const PORTER_PORT = 3001;

// Skip heavy context when called from Bridge dispatch (one-shot questions)
if (process.env.PORTER_BRIDGE_DISPATCH) {
  process.stdout.write('Answer the question directly. Do not read files or load context. Be concise.');
  process.exit(0);
}

// ── stdin event payload (claude-code SessionStart wire format) ──────────────
function readStdinJson(timeoutMs = 800) {
  return new Promise((resolve) => {
    let buf = '';
    const t = setTimeout(() => resolve(null), timeoutMs);
    try { process.stdin.setEncoding('utf8'); }
    catch { clearTimeout(t); return resolve(null); }
    process.stdin.on('data', (chunk) => { buf += chunk; });
    process.stdin.on('end', () => {
      clearTimeout(t);
      if (!buf || !buf.trim()) return resolve(null);
      try { resolve(JSON.parse(buf)); } catch { resolve(null); }
    });
    process.stdin.on('error', () => { clearTimeout(t); resolve(null); });
  });
}

// ── Porter API helpers ─────────────────────────────────────────────────────
function getJson(path) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: PORTER_HOST, port: PORTER_PORT, path, method: 'GET', timeout: 3000 },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function getBackboneStatus() {
  const health = await getJson('/health');
  return {
    online: !!health,
    porterVersion: health && health.version ? String(health.version) : null,
  };
}

async function getActiveProject(cwd, sessionId) {
  const params = new URLSearchParams();
  if (cwd) params.set('cwd', cwd);
  if (sessionId) params.set('session_id', sessionId);
  const qs = params.toString();
  const resp = await getJson('/api/v1/intellect/active-project' + (qs ? '?' + qs : ''));
  return resp && resp.data ? resp.data : null;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const event = await readStdinJson();
  const sessionId = event && event.session_id ? String(event.session_id) : null;
  const cwd = event && event.cwd ? String(event.cwd) : process.cwd();
  const cliName = process.env.PORTER_CLI || 'unknown';

  const [backbone, active] = await Promise.all([
    getBackboneStatus(),
    getActiveProject(cwd, sessionId),
  ]);

  const lines = [];

  // ── Section 1: Porter Backbone (always) ──────────────────────────────────
  lines.push('## Porter Backbone');
  lines.push('');
  const brainTag = backbone.online ? `online :3001${backbone.porterVersion ? ` v${backbone.porterVersion}` : ''}` : 'OFFLINE';
  lines.push(`Gateway: ${cliName} | Brain: ${brainTag}`);
  lines.push('Porter is the infrastructure backbone — Bridge, Recall, Forge. It serves peer projects; it is NOT one of them.');
  lines.push('');

  // ── Section 2: Active Project (variable) ─────────────────────────────────
  lines.push('## Active Project');
  lines.push('');
  if (!active || active.source === 'none') {
    lines.push('**Not pinned.** Ask Moe which project before responding.');
    if (active && Array.isArray(active.recent_hints) && active.recent_hints.length) {
      lines.push('');
      lines.push('Recent (by CHECKPOINT.md mtime):');
      for (const h of active.recent_hints) {
        lines.push(`- \`${h.project}\``);
      }
    }
    lines.push('');
    lines.push('To pin: `curl -X POST http://127.0.0.1:3001/api/v1/intellect/active-project -H "content-type: application/json" -d \'{"project":"ymc.capital"}\'`');
  } else {
    const label = active.subproject ? `${active.project}/${active.subproject}` : active.project;
    lines.push(`**${label}** _(pinned via ${active.source})_`);
    if (active.checkpoint_path) {
      lines.push('');
      lines.push(`### CHECKPOINT.md (${active.checkpoint_path})`);
      lines.push(active.checkpoint_excerpt || '_empty_');
    }
    if (active.git_log) {
      lines.push('');
      lines.push(`### Recent commits (${label})`);
      lines.push(active.git_log);
    }
    lines.push('');
    lines.push(`**ACTION REQUIRED:** Before responding to anything Moe says, quote the active project's name and version, and the last line of CHECKPOINT.md. Say: "Loaded ${label}. Last: <summary>. What are we working on?"`);
  }

  process.stdout.write(lines.join('\n'));
}

main().catch(() => {
  process.stdout.write('## Porter Backbone\n\n(Backbone unavailable — Porter API offline. Ask Moe which project before responding.)\n');
});
