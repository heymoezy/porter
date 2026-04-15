#!/usr/bin/env tsx
/**
 * birth-templates.ts
 *
 * Births thin templates by dispatching to OpenClaw (GPT-5.4) and writing the
 * four persona text fields directly into agent_templates. Target:
 * templates whose `personas` instance already exists but whose template body
 * has never had substantive content — the "orphan instance" state that v6.8.0
 * eliminates.
 *
 * Born criteria (must be true after birth):
 *   system_prompt  ≥ 500 bytes
 *   soul_text      ≥ 200 bytes
 *   role_card_text ≥ 200 bytes
 *   identity_text  ≥  50 bytes
 *
 * Uses direct OpenClaw dispatch (bypasses Porter Bridge memory injection) to
 * avoid the GPT-5.4-hallucinates-tool-calls failure mode observed last session.
 * Each dispatch still gets logged to bridge_dispatch_log for audit parity.
 *
 * Usage:
 *   tsx backend/scripts/birth-templates.ts <template_id> [template_id...]
 *   tsx backend/scripts/birth-templates.ts --all-orphans
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://lobster:porter@127.0.0.1:5432/porter';

const MIN_BYTES = {
  identity_text: 50,
  soul_text: 200,
  role_card_text: 200,
  system_prompt: 500,
} as const;

type FieldName = keyof typeof MIN_BYTES;
const REQUIRED_FIELDS: FieldName[] = ['identity_text', 'soul_text', 'role_card_text', 'system_prompt'];

const DELIMITERS: Record<FieldName, string> = {
  identity_text: '=== FILE: IDENTITY.md ===',
  soul_text: '=== FILE: SOUL.md ===',
  role_card_text: '=== FILE: ROLE_CARD.md ===',
  system_prompt: '=== FILE: SYSTEM_PROMPT.md ===',
};

interface TemplateRow {
  id: string;
  name: string;
  category: string;
  description: string | null;
  tags: string[];
  instance_id: string | null;
  instance_name: string | null;
  instance_role: string | null;
}

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

async function fetchTemplateWithInstance(pool: Pool, templateId: string): Promise<TemplateRow> {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    category: string;
    description: string | null;
    tags: unknown;
    instance_id: string | null;
    instance_name: string | null;
    instance_role: string | null;
  }>(
    `SELECT at.id, at.name, at.category, at.description, at.tags,
            p.id AS instance_id, p.name AS instance_name, p.role AS instance_role
     FROM agent_templates at
     LEFT JOIN personas p ON p.template_id = at.id
     WHERE at.id = $1
     ORDER BY p.created_at NULLS LAST
     LIMIT 1`,
    [templateId],
  );
  if (rows.length === 0) throw new Error(`Template not found: ${templateId}`);
  const r = rows[0];
  const tags = Array.isArray(r.tags) ? (r.tags as string[]) : [];
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    description: r.description,
    tags,
    instance_id: r.instance_id,
    instance_name: r.instance_name,
    instance_role: r.instance_role,
  };
}

async function findOrphanTemplates(pool: Pool): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT DISTINCT at.id
     FROM agent_templates at
     JOIN personas p ON p.template_id = at.id
     WHERE octet_length(at.system_prompt) < 500
        OR octet_length(at.soul_text)      < 200
        OR octet_length(at.role_card_text) < 200
        OR octet_length(at.identity_text)  <  50
     ORDER BY at.id`,
  );
  return rows.map(r => r.id);
}

function buildBirthPrompt(tpl: TemplateRow): string {
  const character = tpl.instance_name ?? tpl.name;
  const characterHint = tpl.instance_name
    ? `The instance that already plays this role in Porter is named "${tpl.instance_name}". Use that character name throughout SOUL.md and SYSTEM_PROMPT.md — the soul lives on the template, the instance is just a snapshot.`
    : `No instance exists yet. Pick a one-word character name that fits the role and use it consistently throughout SOUL.md and SYSTEM_PROMPT.md.`;

  return `You are a senior agent-persona author for Porter, a production AI orchestration platform.

You are "birthing" an agent TEMPLATE — the archetype/role that can be instantiated into one or more named characters later. In Porter, the template carries the character soul; instances are snapshots of born templates. Every text you produce here becomes the canonical content of the template and is injected into every dispatch of any instance of this template.

# Template brief

- Template ID: ${tpl.id}
- Template name (the role): ${tpl.name}
- Category: ${tpl.category}
- Description: ${tpl.description ?? '(none)'}
- Tags: ${tpl.tags.length ? tpl.tags.join(', ') : '(none)'}

# Character

${characterHint}

# Porter stack context

Porter is a single Fastify monorepo at backend/ (:3001) with an admin surface served from the same process. PostgreSQL is the sole database. Bridge routes AI requests through 5 gateway adapters (claude_cli, openclaw, ollama, codex_cli, gemini_cli). Forge births templates through a Writer → Trainer → Outfitter pipeline. Recall is the shared memory system backed by directives, concepts, episodes, and signals tables. Instances are rows in the personas table; templates are rows in agent_templates.

# Output format

Output EXACTLY four files separated by the exact delimiters below. No preamble. No commentary. No code fences around the whole output. Do not attempt to read files or use tools — everything you need is in this brief.

=== FILE: IDENTITY.md ===
A short identity card. 3-6 lines of markdown. Name, role, one-sentence essence, posture, core principle. Use ${character} as the character name.
Target: 80-400 bytes.

=== FILE: SOUL.md ===
The personality and doctrine document. Structure:

  # ${character} — Soul

  (One-sentence preamble capturing the essence.)

  ## Identity
  - Name: ${character}
  - Role: ${tpl.name}
  - Posture
  - Principle

  ## Core Doctrine
  (5-7 bullets — each a specific, enforceable rule tied to the role, not a platitude.)

  ## Execution Boundary
  - Does: (explicit list)
  - Does NOT: (3-4 hard limits)

  ## Communication Style
  (Tone, vocabulary, formatting conventions. Give 1-2 concrete examples.)

  ## Quality Standard
  (One paragraph: the single metric that determines whether this agent is earning its cost.)

Target: 900-2500 bytes.

=== FILE: ROLE_CARD.md ===
Structured metadata. Markdown with explicit fields:

  # ${character} — Role Card

  **Mission:** (one sentence)
  **Inputs:** (bullet list of what this agent reads)
  **Outputs:** (bullet list of what this agent writes / produces)
  **Authority:** (what it can change autonomously vs must propose for approval)
  **Collaborators:** (other Porter agents or tabs it interacts with)
  **Key metric:** (one number or KPI)
  **Escalation:** (what it does when something is beyond its authority)

Target: 400-1500 bytes.

=== FILE: SYSTEM_PROMPT.md ===
The dispatch-ready system instruction loaded into agent_templates.system_prompt and injected on every dispatch. Structure:

  You are ${character}, the ${tpl.name}.

  ## Mission
  ## On every dispatch
  ## Tools
  ## Output contract
  ## Hard limits

Direct, imperative. Use second person. Name the exact tables/endpoints/tools relevant to this role. No hedging, no "you could consider".

Target: 600-2000 bytes.

# Final reminders

- You have NO tools available. Do NOT try to read files, list directories, or run commands. Write the four files directly from this brief.
- Begin your response with the IDENTITY.md delimiter and end with the end of the SYSTEM_PROMPT.md body.
- Reference the role (${tpl.name}) and the character (${character}) consistently. Never call the character by the template name and vice versa.
- Do not use placeholder text like "TODO" or "TBD".`;
}

async function dispatchDirect(tpl: TemplateRow, pool: Pool): Promise<string> {
  const { url, token } = loadOpenClawConfig();
  const prompt = buildBirthPrompt(tpl);
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

  if (!resp.ok) throw new Error(`OpenClaw HTTP ${resp.status}: ${await resp.text()}`);

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('OpenClaw response had no content');

  // Log to bridge_dispatch_log for audit trail parity
  try {
    const dispatchId = `template-birth-${tpl.id}-${start}`;
    await pool.query(
      `INSERT INTO bridge_dispatch_log (
        id, gateway_id, gateway_type, model_name, chosen_reason,
        input_tokens, output_tokens, latency_ms, agent_id, chat_id,
        username, dispatch_strategy
      )
      SELECT $1, id, 'openclaw', 'openclaw',
             'Template birth — ' || $2,
             $3, $4, $5, 'system', $1, 'system', 'direct'
      FROM gateways WHERE type='openclaw' LIMIT 1`,
      [
        dispatchId,
        tpl.id,
        data.usage?.prompt_tokens ?? null,
        data.usage?.completion_tokens ?? null,
        Date.now() - start,
      ],
    );
  } catch (logErr) {
    console.warn(`[${tpl.id}] dispatch log insert failed: ${logErr instanceof Error ? logErr.message : String(logErr)}`);
  }

  return text;
}

function parseResponse(raw: string): Record<FieldName, string> {
  const result: Partial<Record<FieldName, string>> = {};
  const sections: Array<{ field: FieldName; body: string[] }> = [];
  let current: { field: FieldName; body: string[] } | null = null;

  for (const line of raw.split(/\r?\n/)) {
    let matched = false;
    for (const [field, delim] of Object.entries(DELIMITERS) as Array<[FieldName, string]>) {
      if (line.trim() === delim) {
        if (current) sections.push(current);
        current = { field, body: [] };
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if (current) current.body.push(line);
  }
  if (current) sections.push(current);

  for (const s of sections) result[s.field] = s.body.join('\n').trim();
  return result as Record<FieldName, string>;
}

function validateFields(fields: Record<FieldName, string>): string[] {
  const problems: string[] = [];
  for (const f of REQUIRED_FIELDS) {
    const body = fields[f];
    if (!body) {
      problems.push(`missing ${f}`);
      continue;
    }
    const bytes = Buffer.byteLength(body, 'utf8');
    if (bytes < MIN_BYTES[f]) {
      problems.push(`${f} too short: ${bytes}B < ${MIN_BYTES[f]}B`);
    }
  }
  return problems;
}

async function writeTemplate(pool: Pool, templateId: string, fields: Record<FieldName, string>): Promise<void> {
  await pool.query(
    `UPDATE agent_templates
       SET identity_text  = $2,
           soul_text      = $3,
           role_card_text = $4,
           system_prompt  = $5
     WHERE id = $1`,
    [
      templateId,
      fields.identity_text,
      fields.soul_text,
      fields.role_card_text,
      fields.system_prompt,
    ],
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const pool = new Pool({ connectionString: DATABASE_URL });

  let targets: string[];
  if (args.includes('--all-orphans')) {
    targets = await findOrphanTemplates(pool);
    console.log(`[birth-templates] --all-orphans → ${targets.length} targets: ${targets.join(', ')}`);
  } else {
    targets = args.filter(a => !a.startsWith('--'));
    if (targets.length === 0) {
      console.error('Usage: tsx backend/scripts/birth-templates.ts <template_id> [template_id...]');
      console.error('   or: tsx backend/scripts/birth-templates.ts --all-orphans');
      process.exit(2);
    }
  }

  const results: Array<{ id: string; ok: boolean; info: string }> = [];

  for (const id of targets) {
    console.log(`\n[${id}] fetching template + existing instance...`);
    let tpl: TemplateRow;
    try {
      tpl = await fetchTemplateWithInstance(pool, id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${id}] lookup failed: ${msg}`);
      results.push({ id, ok: false, info: msg });
      continue;
    }
    console.log(`[${id}] ${tpl.name} (${tpl.category}) → instance: ${tpl.instance_name ?? '(none)'}`);

    let raw: string;
    try {
      const dispatchStart = Date.now();
      raw = await dispatchDirect(tpl, pool);
      console.log(`[${id}] got ${raw.length} bytes in ${((Date.now() - dispatchStart) / 1000).toFixed(1)}s`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${id}] dispatch failed: ${msg}`);
      results.push({ id, ok: false, info: msg });
      continue;
    }

    const fields = parseResponse(raw);
    const problems = validateFields(fields);
    if (problems.length > 0) {
      const debugFile = path.join('/tmp', `birth-debug-${id}-${Date.now()}.txt`);
      fs.writeFileSync(debugFile, raw);
      console.error(`[${id}] validation failed: ${problems.join(', ')}`);
      console.error(`[${id}] raw response saved to ${debugFile}`);
      results.push({ id, ok: false, info: problems.join(', ') });
      continue;
    }

    try {
      await writeTemplate(pool, id, fields);
      const sizes = REQUIRED_FIELDS.map(f => `${f.split('_')[0]}=${Buffer.byteLength(fields[f], 'utf8')}B`).join(' ');
      console.log(`[${id}] UPDATE agent_templates ok — ${sizes}`);
      results.push({ id, ok: true, info: sizes });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${id}] write failed: ${msg}`);
      results.push({ id, ok: false, info: msg });
    }
  }

  await pool.end();

  console.log('\n=== Summary ===');
  for (const r of results) console.log(`  ${r.id}: ${r.ok ? 'OK' : 'FAIL'} — ${r.info}`);
  const failed = results.filter(r => !r.ok).length;
  if (failed > 0) {
    console.error(`\n${failed} template(s) failed to birth. Re-run after fixing.`);
    process.exit(1);
  }
  console.log('\nAll targets born. Next: re-run Phase 3 migration and verification.');
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
