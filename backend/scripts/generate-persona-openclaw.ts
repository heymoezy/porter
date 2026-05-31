#!/usr/bin/env tsx
/**
 * generate-persona-openclaw.ts
 *
 * Canonical "birth via OpenClaw" primitive. Dispatches a detailed role brief
 * to OpenClaw (GPT-5.4) through Porter Bridge and writes the four persona
 * files (IDENTITY.md, SOUL.md, ROLE_CARD.md, SYSTEM_PROMPT.md) for each
 * listed agent into /personas/{instance_id}/.
 *
 * Every dispatch is logged in bridge_dispatch_log with attribution to the
 * requesting agent. No hand-crafting. No "background agent" fiction.
 *
 * Usage:
 *   tsx backend/scripts/generate-persona-openclaw.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import os from 'node:os';
import { Pool } from 'pg';

const PORTER_URL = process.env.PORTER_URL ?? 'http://127.0.0.1:3001';
const SERVICE_TOKEN = process.env.PORTER_SERVICE_TOKEN ?? 'porter-local-service-2026';
const REPO_ROOT = path.resolve(path.join(import.meta.dirname, '..', '..'));
const PERSONAS_DIR = path.join(REPO_ROOT, 'personas');
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://lobster:porter@127.0.0.1:5432/porter';

function loadOpenClawConfig(): { url: string; token: string } {
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), '.openclaw');
  const cfgPath = path.join(stateDir, 'openclaw.json');
  const raw = fs.readFileSync(cfgPath, 'utf8');
  const cfg = JSON.parse(raw) as { gateway?: { auth?: { token?: string }; port?: number } };
  const token = cfg.gateway?.auth?.token;
  if (!token) throw new Error(`No gateway.auth.token in ${cfgPath}`);
  const port = cfg.gateway?.port ?? 18789;
  return { url: `http://127.0.0.1:${port}`, token };
}

const MIN_BYTES = {
  'IDENTITY.md': 200,
  'SOUL.md': 1800,
  'ROLE_CARD.md': 900,
  'SYSTEM_PROMPT.md': 900,
} as const;

type FileName = keyof typeof MIN_BYTES;
const REQUIRED_FILES: FileName[] = ['IDENTITY.md', 'SOUL.md', 'ROLE_CARD.md', 'SYSTEM_PROMPT.md'];

interface AgentBrief {
  instanceId: string;
  templateId: string;
  name: string;
  category: string;
  oneLiner: string;
  reports: string;
  tables: { read: string[]; write: string[] };
  endpoints: { read: string[]; write: string[] };
  cadence: string;
  successMetric: string;
  toolingNotes: string;
}

const AGENTS: AgentBrief[] = [
  {
    instanceId: 'forge-queuemaster',
    templateId: 'tmpl-forge-queuemaster',
    name: 'Forge Queuemaster',
    category: 'operations',
    oneLiner:
      'Forge Queuemaster owns the Forge pipeline end-to-end — queues, stations, quality, throughput. Every agent that gets born goes through the queuemaster first.',
    reports:
      'The Forge admin tab at /forge. Every tick emits an activity entry that the tab subscribes to via SSE. The queuemaster IS the authoritative source of what the Forge is doing at any moment.',
    tables: {
      read: [
        'forge_pipeline',
        'forge_station_runs',
        'forge_settings',
        'agent_templates',
        'personas',
        'intelligence_feed',
      ],
      write: ['intelligence_feed (status summaries)', 'bridge_dispatch_log (via Bridge attribution)'],
    },
    endpoints: {
      read: ['/api/admin/forge', '/api/admin/forge/events (SSE)'],
      write: ['/api/admin/forge/start', '/api/admin/forge/stop', '/api/admin/forge/queue'],
    },
    cadence:
      'Heartbeat every 30 seconds. On each tick, read forge_pipeline state, compare against forge_settings (running flag, tick_interval_ms, quality_threshold), summarise current wave and any stuck items.',
    successMetric:
      "Wave throughput: how many queued templates complete all three stations (Writer → Trainer → Outfitter) per hour without manual intervention. The queuemaster's job is to keep this number climbing.",
    toolingNotes:
      'The three internal station phases (Writer, Trainer, Outfitter) are the queuemaster\'s own sub-doctrines. The SYSTEM_PROMPT must spell out each phase\'s responsibilities so the queuemaster can reason about station status without a separate agent per phase. Writer = generates persona text and writes .md files. Trainer = assigns skills from template_skills. Outfitter = maps tools from template_tools and finalises appearance_spec.',
  },
  {
    instanceId: 'bridge-vigil',
    templateId: 'tmpl-bridge-vigil',
    name: 'Bridge Vigil',
    category: 'operations',
    oneLiner:
      'Vigil keeps the Bridge honest. Every gateway, every 30 seconds. If a gateway starts lying about its health, Vigil catches it and trips the circuit breaker.',
    reports:
      'The Gateway/Bridge admin tab at /bridge. Every health probe updates gateways.status and gateways.last_health_at. Every circuit trip lands in intelligence_feed.',
    tables: {
      read: ['gateways', 'bridge_dispatch_log (recent failures)'],
      write: [
        'gateways (status, last_health_at, circuit_state)',
        'intelligence_feed (trips, recoveries)',
      ],
    },
    endpoints: {
      read: ['/api/admin/bridge', '/api/admin/bridge/capacity', '/api/admin/health'],
      write: ['intelligence_feed rows via agent dispatches'],
    },
    cadence:
      'Heartbeat every 30 seconds. On each tick, probe every enabled gateway: HTTP health check where applicable, CLI version check for subprocess adapters. A gateway that fails two consecutive probes moves to circuit_state=open.',
    successMetric:
      'Mean time to detect a dead gateway should be under 60 seconds. Mean time to recover (circuit goes from open to half-open to closed after probes recover) should be under 3 minutes.',
    toolingNotes:
      'Vigil is dispatched through the openclaw adapter so it has server-side tools (bash, read_file, write_file). Its SYSTEM_PROMPT must instruct it to use the bash tool for each probe and to write structured observations back to intelligence_feed via SQL. Never just describe what it would do — actually do it on every tick.',
  },
  {
    instanceId: 'bridge-ledger',
    templateId: 'tmpl-bridge-ledger',
    name: 'Bridge Ledger',
    category: 'operations',
    oneLiner:
      'Ledger counts what everyone else spends. Every token has a cost. Every dispatch has a price. Ledger tracks both and enforces the budget.',
    reports:
      'The Gateway/Bridge admin tab at /bridge (costs section). Ledger populates token_usage_daily and flags budget anomalies to intelligence_feed.',
    tables: {
      read: [
        'bridge_dispatch_log',
        'subscriptions',
        'billing_events',
        'models',
        'model_versions',
      ],
      write: [
        'token_usage_daily (daily aggregations)',
        'intelligence_feed (budget warnings, leaks)',
      ],
    },
    endpoints: {
      read: ['/api/admin/costs', '/api/admin/bridge/costs'],
      write: ['token_usage_daily rows via SQL'],
    },
    cadence:
      'Heartbeat hourly (cron: 0 * * * *). Each tick re-aggregates the current day\'s bridge_dispatch_log into token_usage_daily, flags any dispatch missing cost attribution (null input_tokens OR null output_tokens OR null estimated_cost_usd), and raises a budget_warning in intelligence_feed when any user exceeds 80% of their daily cap.',
    successMetric:
      'Attribution coverage: percentage of dispatches in bridge_dispatch_log with complete cost data (tokens, cost, user, agent, project). Target: 100%. Below 95% means Ledger is not doing its job.',
    toolingNotes:
      'Ledger is dispatched through the openclaw adapter with SQL and bash tools. Its SYSTEM_PROMPT must instruct it to use SQL for aggregation (not bash), show totals and deltas in accounting language ("$0.0034" not "0.0034", "14,200 tokens" not "14.2k"), and never retroactively adjust historical costs when pricing changes.',
  },
];

function buildPrompt(agent: AgentBrief): string {
  return `You are a senior agent-persona author for Porter, a production AI orchestration platform.

Your task: write FOUR persona files for a Porter agent instance that will run autonomously inside Porter. These files are production artifacts — they will be committed to the repo at /home/lobster/projects/Porter/personas/${agent.instanceId}/ and used by the Bridge dispatch pipeline on every invocation. Quality matters. Cut-and-paste filler will be rejected.

# Agent brief

- Instance ID: ${agent.instanceId}
- Template ID: ${agent.templateId}
- Display name: ${agent.name}
- Category: ${agent.category}
- One-liner: ${agent.oneLiner}
- Reports to: ${agent.reports}

# Tables it owns

- READS: ${agent.tables.read.join(', ')}
- WRITES: ${agent.tables.write.join(', ')}

# Endpoints

- READS: ${agent.endpoints.read.join(', ')}
- WRITES: ${agent.endpoints.write.join(', ')}

# Cadence and success metric

- Cadence: ${agent.cadence}
- Success metric: ${agent.successMetric}

# Tooling and behaviour notes

${agent.toolingNotes}

# Porter stack context (for grounding)

Porter is a single Fastify monorepo at backend/ (:3001) with an admin surface at admin/ served from the same process. PostgreSQL is the sole database. Bridge routes AI requests through 5 gateway adapters (claude_cli, openclaw, ollama, codex_cli, gemini_cli). Forge births agents through a 3-station pipeline (Writer → Trainer → Outfitter). Recall is the shared memory system backed by directives/concepts/episodes/signals tables. Personas are instances born from agent_templates.

Routing the agent's own dispatches: this agent is expected to be dispatched on a heartbeat through the Bridge pipeline and to use server-side tools (bash, read_file, write_file, SQL) provided by the openclaw adapter.

# Files to write

You will output FOUR files separated by exact delimiters. Do not add commentary before, between, or after the delimiters. Do not wrap in code fences.

=== FILE: IDENTITY.md ===
A short identity card. 3-6 lines of markdown. Name, role, one-sentence essence, posture ("precise, conservative" or "vigilant, fast"), core principle. Target: 200-500 bytes.

=== FILE: SOUL.md ===
The personality and doctrine document. This is law — it defines how the agent thinks and what it will never do. Structure:

  # ${agent.name} — Soul

  (One-sentence preamble capturing the essence.)

  ## Identity
  - Name
  - Role
  - Posture
  - Principle

  ## Core Doctrine
  (5-7 bullets. Reference the exact tables and endpoints above. Each bullet is a specific, enforceable rule, not a platitude. Use table and column names verbatim.)

  ## Execution Boundary
  - Reads: (explicit list)
  - Writes: (explicit list)
  - Does NOT: (3-4 hard limits this agent will refuse to cross)

  ## Communication Style
  (How it phrases its outputs — tone, vocabulary, formatting conventions. Give 2-3 concrete before/after examples.)

  ## Quality Standard
  (One paragraph: the single metric that determines whether this agent is earning its cost.)

Target: 2000-3500 bytes. Be specific about tables, columns, thresholds, and units. Do not write "things like..." or "for example..." — name exact schema objects.

=== FILE: ROLE_CARD.md ===
Structured metadata for the Forge pipeline and Porter admin. Markdown with explicit fields:

  # ${agent.name} — Role Card

  **Mission:** (one sentence)
  **Cadence:** (exact cron expression + human description)
  **Reports to:** (the surface / tab this agent updates)
  **Inputs:** (bullet list of tables and endpoints it reads)
  **Outputs:** (bullet list of tables and endpoints it writes)
  **Authority:** (what it can change autonomously vs. what it must propose for approval)
  **Collaborators:** (other Porter agents it interacts with)
  **Key metric:** (one number, with target)
  **Escalation:** (what it does when something is beyond its authority)

Target: 1000-1800 bytes.

=== FILE: SYSTEM_PROMPT.md ===
The dispatch-ready system instruction that will be loaded into agent_templates.system_prompt and injected at every dispatch. This is the operational instruction set the model receives on every tick. Structure:

  You are ${agent.name}, a Porter operations agent.

  ## Mission
  ## On every tick
  ## Tools
  ## Output contract
  ## Hard limits

Be direct and imperative. Use second person ("You read...", "You write...", "You never..."). Name exact tools, exact SQL tables, exact endpoints. No hedging. Include explicit instructions to use the server-side tools (bash, read_file, write_file, SQL) rather than describing what it would do.

Target: 1000-1800 bytes.

# Final reminders

- You have NO tools available. Do NOT attempt to read files, search the filesystem, list directories, or run commands. Everything you need is in this brief. Write the four files directly from the brief.
- Do NOT preface your output with phrases like "Let me check...", "First I'll look at...", or "Let me verify...". Begin your response with the IDENTITY.md delimiter and end with the end of the SYSTEM_PROMPT.md body.
- Output ONLY the four files separated by the exact delimiters above. Nothing else.
- Use markdown inside each file. No code fences around the whole files.
- Reference the exact table and column names provided in the brief.
- Do not use placeholder text like "TODO", "TBD", or "example.com".
- Write like this agent already exists and is running in production — because as soon as you finish, it will be.`;
}

interface ParseResult {
  files: Record<FileName, string>;
  missing: FileName[];
  undersize: Array<{ file: FileName; bytes: number; min: number }>;
}

function parseResponse(raw: string): ParseResult {
  const files: Partial<Record<FileName, string>> = {};
  const delimiterPattern = /^=== FILE: (IDENTITY\.md|SOUL\.md|ROLE_CARD\.md|SYSTEM_PROMPT\.md) ===\s*$/m;

  const sections: Array<{ name: FileName; content: string }> = [];
  const lines = raw.split(/\r?\n/);
  let currentName: FileName | null = null;
  let currentBuf: string[] = [];

  const flush = () => {
    if (currentName) {
      sections.push({ name: currentName, content: currentBuf.join('\n').trim() });
    }
    currentBuf = [];
  };

  for (const line of lines) {
    const m = line.match(/^=== FILE: (IDENTITY\.md|SOUL\.md|ROLE_CARD\.md|SYSTEM_PROMPT\.md) ===\s*$/);
    if (m) {
      flush();
      currentName = m[1] as FileName;
      continue;
    }
    if (currentName) currentBuf.push(line);
  }
  flush();

  for (const s of sections) files[s.name] = s.content;

  const missing: FileName[] = REQUIRED_FILES.filter(f => !files[f]);
  const undersize: ParseResult['undersize'] = [];
  for (const f of REQUIRED_FILES) {
    const body = files[f];
    if (body) {
      const bytes = Buffer.byteLength(body, 'utf8');
      if (bytes < MIN_BYTES[f]) undersize.push({ file: f, bytes, min: MIN_BYTES[f] });
    }
  }

  return { files: files as Record<FileName, string>, missing, undersize };
}

async function dispatchViaBridge(agentBrief: AgentBrief): Promise<string> {
  const prompt = buildPrompt(agentBrief);

  const resp = await fetch(`${PORTER_URL}/api/v1/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Porter-Service-Token': SERVICE_TOKEN,
    },
    body: JSON.stringify({
      message: prompt,
      backend: 'openclaw',
      chat_id: `forge-birth-${agentBrief.instanceId}-${Date.now()}`,
      agent_id: 'lobster',
    }),
  });

  if (!resp.ok) {
    throw new Error(`Bridge dispatch HTTP ${resp.status}: ${await resp.text()}`);
  }
  if (!resp.body) throw new Error('Bridge dispatch returned no body');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullResponse = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const evt of events) {
      const dataLine = evt.split('\n').find(l => l.startsWith('data: '));
      if (!dataLine) continue;
      try {
        const payload = JSON.parse(dataLine.slice(6));
        if (payload.done && typeof payload.full_response === 'string') {
          fullResponse = payload.full_response;
        }
      } catch {
        /* skip malformed frames */
      }
    }
  }

  if (!fullResponse) throw new Error('Bridge dispatch stream ended with no full_response');
  return fullResponse;
}

/**
 * Direct OpenClaw dispatch — bypasses Porter Bridge memory injection.
 * Used as fallback when the bridge path fails because GPT-5.4 hallucinates
 * tool use after seeing memory context. After a successful direct dispatch
 * we manually log to bridge_dispatch_log so the audit trail stays complete.
 */
async function dispatchDirect(agentBrief: AgentBrief): Promise<string> {
  const { url, token } = loadOpenClawConfig();
  const prompt = buildPrompt(agentBrief);
  const start = Date.now();

  const resp = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: 'openclaw',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 6000,
      temperature: 0.7,
      stream: false,
    }),
    signal: AbortSignal.timeout(360_000),
  });

  if (!resp.ok) {
    throw new Error(`Direct OpenClaw HTTP ${resp.status}: ${await resp.text()}`);
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('Direct OpenClaw response had no content');

  // Log to bridge_dispatch_log for audit trail parity with the bridge path
  try {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const dispatchId = `forge-birth-${agentBrief.instanceId}-${start}`;
    await pool.query(
      `INSERT INTO bridge_dispatch_log (
        id, gateway_id, gateway_type, model_name, chosen_reason,
        input_tokens, output_tokens, latency_ms, agent_id, chat_id,
        username, dispatch_strategy
      )
      SELECT $1, id, 'openclaw', 'openclaw',
             'Direct dispatch (forge-birth bypass) — ' || $2,
             $3, $4, $5, 'lobster', $1, 'system', 'direct'
      FROM gateways WHERE type='openclaw' LIMIT 1`,
      [
        dispatchId,
        agentBrief.instanceId,
        data.usage?.prompt_tokens ?? null,
        data.usage?.completion_tokens ?? null,
        Date.now() - start,
      ],
    );
    await pool.end();
  } catch (logErr) {
    console.warn(`[${agentBrief.instanceId}] dispatch log insert failed: ${logErr instanceof Error ? logErr.message : String(logErr)}`);
  }

  return text;
}

async function dispatch(agentBrief: AgentBrief, mode: 'bridge' | 'direct'): Promise<string> {
  if (mode === 'direct') return dispatchDirect(agentBrief);
  return dispatchViaBridge(agentBrief);
}

function agentAlreadyComplete(agent: AgentBrief): boolean {
  const dir = path.join(PERSONAS_DIR, agent.instanceId);
  for (const f of REQUIRED_FILES) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) return false;
    const bytes = fs.statSync(p).size;
    if (bytes < MIN_BYTES[f]) return false;
  }
  return true;
}

async function main(): Promise<void> {
  const forceAgents = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const forceAll = process.argv.includes('--force');
  const directMode: 'bridge' | 'direct' = process.argv.includes('--direct') ? 'direct' : 'bridge';

  console.log(`[generate-persona-openclaw] Porter: ${PORTER_URL}, personas dir: ${PERSONAS_DIR}`);
  if (forceAgents.length) {
    console.log(`[generate-persona-openclaw] targeted: ${forceAgents.join(', ')}`);
  } else if (forceAll) {
    console.log('[generate-persona-openclaw] --force: rewriting all agents');
  } else {
    console.log('[generate-persona-openclaw] default: skip agents with complete files, retry incomplete ones');
  }

  const results: Array<{ agent: string; ok: boolean; bytes?: number; error?: string; skipped?: boolean }> = [];

  const targets = forceAgents.length
    ? AGENTS.filter(a => forceAgents.includes(a.instanceId))
    : AGENTS;

  for (const agent of targets) {
    if (!forceAll && !forceAgents.length && agentAlreadyComplete(agent)) {
      console.log(`[${agent.instanceId}] already complete — skipping`);
      results.push({ agent: agent.instanceId, ok: true, skipped: true });
      continue;
    }
    console.log(`\n[${agent.instanceId}] dispatching to openclaw via ${directMode}...`);
    const start = Date.now();
    let raw: string;
    try {
      raw = await dispatch(agent, directMode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${agent.instanceId}] dispatch failed: ${msg}`);
      results.push({ agent: agent.instanceId, ok: false, error: msg });
      continue;
    }
    const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[${agent.instanceId}] received ${raw.length} bytes in ${elapsedSec}s`);

    const parsed = parseResponse(raw);

    if (parsed.missing.length > 0) {
      console.error(`[${agent.instanceId}] MISSING files: ${parsed.missing.join(', ')}`);
      const debugDir = path.join('/tmp', `persona-debug-${agent.instanceId}-${Date.now()}.txt`);
      fs.writeFileSync(debugDir, raw);
      console.error(`[${agent.instanceId}] raw response saved to ${debugDir}`);
      results.push({ agent: agent.instanceId, ok: false, error: `missing files: ${parsed.missing.join(', ')}` });
      continue;
    }
    if (parsed.undersize.length > 0) {
      const details = parsed.undersize.map(u => `${u.file}=${u.bytes}B<${u.min}`).join(', ');
      console.error(`[${agent.instanceId}] UNDERSIZE files: ${details}`);
      results.push({ agent: agent.instanceId, ok: false, error: `undersize: ${details}` });
      continue;
    }

    const outDir = path.join(PERSONAS_DIR, agent.instanceId);
    fs.mkdirSync(outDir, { recursive: true });
    let totalBytes = 0;
    for (const f of REQUIRED_FILES) {
      const body = parsed.files[f];
      const target = path.join(outDir, f);
      fs.writeFileSync(target, body + '\n', 'utf8');
      const bytes = Buffer.byteLength(body, 'utf8');
      totalBytes += bytes;
      console.log(`[${agent.instanceId}]   ${f}: ${bytes} bytes`);
    }
    results.push({ agent: agent.instanceId, ok: true, bytes: totalBytes });
  }

  console.log('\n=== Summary ===');
  for (const r of results) {
    const status = r.ok ? `OK (${r.bytes} bytes total)` : `FAIL — ${r.error}`;
    console.log(`  ${r.agent}: ${status}`);
  }
  const anyFail = results.some(r => !r.ok);
  if (anyFail) {
    console.error('\nOne or more agents failed. Re-run after fixing.');
    process.exit(1);
  }
  console.log('\nAll agents birthed. Next: Phase B (seed templates + instances).');
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
