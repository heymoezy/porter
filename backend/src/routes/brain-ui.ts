import Fastify from 'fastify';
import { pool } from '../db/client.js';
import { config, featureFlags } from '../config.js';

const BRAIN_UI_PORT = parseInt(process.env.BRAIN_UI_PORT || '5176', 10);
const BRAIN_UI_HOST = process.env.BRAIN_UI_HOST || '127.0.0.1';

export async function startBrainUI() {
  const app = Fastify({ logger: false });

  // API: Brain internals
  app.get('/api/status', async () => {
    const tables: { table: string; rows: number }[] = [];
    try {
      const { rows } = await pool.query(`
        SELECT schemaname || '.' || relname AS table, n_live_tup AS rows
        FROM pg_stat_user_tables ORDER BY n_live_tup DESC
      `);
      for (const r of rows) tables.push({ table: r.table.replace('public.', ''), rows: Number(r.rows) });
    } catch {}

    let dbSize = 0;
    try {
      const r = await pool.query("SELECT pg_database_size(current_database()) as s");
      dbSize = Number(r.rows[0].s);
    } catch {}

    let dbConnected = false;
    let dbLatency = 0;
    try {
      const t = Date.now();
      await pool.query('SELECT 1');
      dbLatency = Date.now() - t;
      dbConnected = true;
    } catch {}

    let sessions = 0;
    try {
      const r = await pool.query("SELECT count(*) as c FROM sessions WHERE expires > EXTRACT(EPOCH FROM NOW())");
      sessions = Number(r.rows[0].c);
    } catch {}

    let users = 0;
    try {
      const r = await pool.query("SELECT count(*) as c FROM users");
      users = Number(r.rows[0].c);
    } catch {}

    let pendingJobs = 0;
    try {
      const r = await pool.query("SELECT count(*) as c FROM agent_jobs WHERE status = 'pending'");
      pendingJobs = Number(r.rows[0].c);
    } catch {}

    let recentErrors = 0;
    try {
      const r = await pool.query("SELECT count(*) as c FROM error_log WHERE resolved = 0");
      recentErrors = Number(r.rows[0].c);
    } catch {}

    // Registered routes (from main Fastify, not this UI server)
    const routes: string[] = [];

    return {
      db: { engine: 'postgresql', connected: dbConnected, latencyMs: dbLatency, sizeBytes: dbSize, tableCount: tables.length },
      tables,
      stats: { users, sessions, pendingJobs, unresolvedErrors: recentErrors },
      config: {
        port: config.port,
        host: config.host,
        databaseUrl: config.databaseUrl.replace(/:[^:@]+@/, ':***@'), // mask password
        dataDir: config.dataDir,
        ollamaUrl: config.ollamaUrl,
        openclawUrl: config.openclawUrl,
        porterPyUrl: config.porterPyUrl,
        features: Object.entries(featureFlags).filter(([,v]) => v).map(([k]) => k),
      },
      routes: routes.slice(0, 100),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid,
    };
  });

  // Serve the dashboard HTML
  app.get('/', async (_req, reply) => {
    reply.type('text/html').send(DASHBOARD_HTML);
  });

  await app.listen({ port: BRAIN_UI_PORT, host: BRAIN_UI_HOST });
  console.log(`Brain dashboard at http://${BRAIN_UI_HOST}:${BRAIN_UI_PORT}`);
}

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Porter Brain</title>
<style>
  :root { --bg: #0f1117; --surface: #1a1d27; --raised: #242836; --border: #333a4a; --text: #e8ecf4; --dim: #8892a8; --accent: #6c8cff; --green: #4ade80; --red: #f87171; --yellow: #fbbf24; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; background: var(--bg); color: var(--text); font-size: 13px; line-height: 1.5; }
  .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
  header { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; border-bottom: 1px solid var(--border); padding-bottom: 16px; }
  header h1 { font-size: 20px; font-weight: 600; }
  header .badge { background: var(--accent); color: #fff; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  header .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dim); }
  header .dot.up { background: var(--green); box-shadow: 0 0 8px var(--green); }
  header .dot.down { background: var(--red); box-shadow: 0 0 8px var(--red); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .card .label { color: var(--dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .card .value { font-size: 24px; font-weight: 700; }
  .card .value.green { color: var(--green); }
  .card .value.red { color: var(--red); }
  .card .value.yellow { color: var(--yellow); }
  .section { margin-bottom: 24px; }
  .section h2 { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--dim); text-transform: uppercase; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); }
  th { background: var(--raised); color: var(--dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  td { font-size: 12px; }
  .row-data td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .bar { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
  .bar-fill { height: 100%; background: var(--accent); border-radius: 2px; }
  .config-grid { display: grid; grid-template-columns: 160px 1fr; gap: 4px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .config-grid .key { color: var(--dim); }
  .config-grid .val { color: var(--text); word-break: break-all; }
  .routes-list { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; max-height: 400px; overflow-y: auto; white-space: pre; font-size: 11px; color: var(--dim); }
  .refresh { background: var(--raised); border: 1px solid var(--border); color: var(--text); padding: 6px 16px; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 12px; }
  .refresh:hover { background: var(--accent); color: #fff; }
  .ts { color: var(--dim); font-size: 11px; margin-left: auto; }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>Porter Brain</h1>
    <span class="badge">PostgreSQL</span>
    <span id="dot" class="dot"></span>
    <span id="status-text" style="color:var(--dim);font-size:12px">connecting...</span>
    <span class="ts" id="ts"></span>
    <button class="refresh" onclick="load()">Refresh</button>
  </header>

  <div class="grid" id="stats"></div>

  <div class="section">
    <h2>Database Tables</h2>
    <table id="tables-table"><thead><tr><th>Table</th><th>Rows</th><th></th></tr></thead><tbody id="tables-body"></tbody></table>
  </div>

  <div class="section">
    <h2>Configuration</h2>
    <div class="config-grid" id="config"></div>
  </div>

  <div class="section">
    <h2>Registered Routes</h2>
    <div class="routes-list" id="routes">loading...</div>
  </div>
</div>

<script>
function fmt(n) { if (n >= 1e9) return (n/1e9).toFixed(1)+'G'; if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n >= 1e3) return (n/1e3).toFixed(1)+'K'; return String(n); }
function fmtBytes(b) { if (b >= 1e9) return (b/1e9).toFixed(1)+' GB'; if (b >= 1e6) return (b/1e6).toFixed(1)+' MB'; if (b >= 1e3) return (b/1e3).toFixed(1)+' KB'; return b+' B'; }
function fmtUptime(s) { const h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return h > 0 ? h+'h '+m+'m' : m+'m'; }

async function load() {
  try {
    const res = await fetch('/api/status');
    const d = await res.json();

    document.getElementById('dot').className = 'dot ' + (d.db.connected ? 'up' : 'down');
    document.getElementById('status-text').textContent = d.db.connected ? 'connected — ' + d.db.latencyMs + 'ms' : 'disconnected';
    document.getElementById('ts').textContent = new Date().toLocaleTimeString();

    const maxRows = Math.max(1, ...d.tables.map(t => t.rows));

    document.getElementById('stats').innerHTML = [
      { label: 'Tables', value: d.db.tableCount, color: '' },
      { label: 'DB Size', value: fmtBytes(d.db.sizeBytes), color: '' },
      { label: 'Users', value: d.stats.users, color: '' },
      { label: 'Sessions', value: d.stats.sessions, color: 'green' },
      { label: 'Pending Jobs', value: d.stats.pendingJobs, color: d.stats.pendingJobs > 0 ? 'yellow' : '' },
      { label: 'Errors', value: d.stats.unresolvedErrors, color: d.stats.unresolvedErrors > 0 ? 'red' : 'green' },
      { label: 'Uptime', value: fmtUptime(d.uptime), color: '' },
      { label: 'Memory', value: fmtBytes(d.memory.rss), color: '' },
    ].map(s => '<div class="card"><div class="label">'+s.label+'</div><div class="value '+(s.color||'')+'">'+s.value+'</div></div>').join('');

    document.getElementById('tables-body').innerHTML = d.tables.map(t =>
      '<tr class="row-data"><td>'+t.table+'</td><td>'+fmt(t.rows)+'</td><td style="width:120px"><div class="bar"><div class="bar-fill" style="width:'+Math.max(1,t.rows/maxRows*100)+'%"></div></div></td></tr>'
    ).join('');

    const cfg = d.config;
    document.getElementById('config').innerHTML = Object.entries(cfg).map(([k,v]) =>
      '<span class="key">'+k+'</span><span class="val">'+(Array.isArray(v) ? v.join(', ') || '(none)' : v)+'</span>'
    ).join('');

    document.getElementById('routes').textContent = d.routes.join('\\n');
  } catch(e) {
    document.getElementById('dot').className = 'dot down';
    document.getElementById('status-text').textContent = 'error: ' + e.message;
  }
}

load();
setInterval(load, 15000);
</script>
</body>
</html>`;
