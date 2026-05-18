#!/usr/bin/env node
// Porter Session Start — silo-directives shim
//
// Slim wrapper around /api/v1/intellect/context that fetches Porter's
// scoped silo directives (software / admin / data-room / etc.) for the
// current session. The HEAVY LIFTING for active-project + checkpoint
// + ACTION REQUIRED output is done by Porter's session-hook.cjs
// (called separately from settings.json). This file ONLY contributes
// silo-directive injection and stays empty if Porter can't be reached.
//
// Phase 48.1 Plan 04: reads SessionStart event payload (JSON with
// session_id + cwd) from stdin, forwards both to /context so the
// silo detector picks the right silo. Falls back gracefully.

const http = require('http');

const PORTER_HOST = '127.0.0.1';
const PORTER_PORT = 3001;

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

async function main() {
  const event = await readStdinJson();
  const sessionId = event && event.session_id ? String(event.session_id) : null;
  const cwd = event && event.cwd ? String(event.cwd) : process.cwd();

  const params = new URLSearchParams();
  if (cwd) params.set('cwd', cwd);
  if (sessionId) params.set('session_id', sessionId);
  const qs = params.toString();
  const resp = await getJson('/api/v1/intellect/context' + (qs ? '?' + qs : ''));

  // Only emit a section if Porter actually returned scoped context (silo
  // directives + concepts). On miss / offline / empty, stay silent — the
  // backbone hook (session-hook.cjs) handles the user-visible "Porter
  // Backbone offline" notice. No duplication.
  if (!resp || !resp.data || !resp.data.context) return;

  process.stdout.write(String(resp.data.context).trim() + '\n');
}

main().catch(() => {
  // Silent on failure — backbone hook covers the visible state.
});
