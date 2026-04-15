#!/usr/bin/env tsx
/**
 * seed-autonomy-agents.ts
 *
 * Phase B of the autonomy launch. Reads the 4 persona .md files that Phase A
 * wrote via OpenClaw and inserts rows into agent_templates + personas so the
 * Forge and Gateway tabs have real dispatchable owners.
 *
 * Idempotent: re-running updates the same rows via ON CONFLICT.
 *
 * Usage:
 *   tsx backend/scripts/seed-autonomy-agents.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://lobster:porter@127.0.0.1:5432/porter';
const REPO_ROOT = path.resolve(path.join(import.meta.dirname, '..', '..'));
const PERSONAS_DIR = path.join(REPO_ROOT, 'personas');

interface SeedAgent {
  instanceId: string;
  templateId: string;
  name: string;
  category: string;
  description: string;
  heartbeatCron: string;
  heartbeatIntervalSec: number;
  preferredBackend: 'openclaw';
  tags: string[];
  appearanceSpec: Record<string, unknown>;
  agentGroup: string;
}

const AGENTS: SeedAgent[] = [
  {
    instanceId: 'forge-queuemaster',
    templateId: 'tmpl-forge-queuemaster',
    name: 'Forge Queuemaster',
    category: 'operations',
    description: 'Owns the Forge pipeline. Orchestrates Writer → Trainer → Outfitter stations and reports live status to the Forge admin tab.',
    heartbeatCron: '*/30 * * * * *',
    heartbeatIntervalSec: 30,
    preferredBackend: 'openclaw',
    tags: ['forge', 'pipeline', 'orchestration'],
    appearanceSpec: {
      style: 'minecraft',
      skin: 'foreman',
      palette: { primary: '#C9822E', secondary: '#4B2E1A', accent: '#F5C36A' },
      tool: 'clipboard',
    },
    agentGroup: 'operations',
  },
  {
    instanceId: 'bridge-vigil',
    templateId: 'tmpl-bridge-vigil',
    name: 'Bridge Vigil',
    category: 'operations',
    description: 'Probes every gateway every 30 seconds. Updates gateways.status, trips circuit breakers, flags recoveries to intelligence_feed.',
    heartbeatCron: '*/30 * * * * *',
    heartbeatIntervalSec: 30,
    preferredBackend: 'openclaw',
    tags: ['bridge', 'health', 'monitoring'],
    appearanceSpec: {
      style: 'minecraft',
      skin: 'watchman',
      palette: { primary: '#2E7AC9', secondary: '#0F1E38', accent: '#7ACCF5' },
      tool: 'lantern',
    },
    agentGroup: 'operations',
  },
  {
    instanceId: 'bridge-atlas',
    templateId: 'tmpl-bridge-atlas',
    name: 'Bridge Atlas',
    category: 'operations',
    description: 'Recomputes routing confidence hourly from outcome scores, latency, and cost. Proposes routing_rules updates for operator approval.',
    heartbeatCron: '0 * * * *',
    heartbeatIntervalSec: 3600,
    preferredBackend: 'openclaw',
    tags: ['bridge', 'routing', 'optimization'],
    appearanceSpec: {
      style: 'minecraft',
      skin: 'cartographer',
      palette: { primary: '#7B3FBF', secondary: '#2A1747', accent: '#C299F0' },
      tool: 'compass',
    },
    agentGroup: 'operations',
  },
  {
    instanceId: 'bridge-ledger',
    templateId: 'tmpl-bridge-ledger',
    name: 'Bridge Ledger',
    category: 'operations',
    description: 'Aggregates bridge_dispatch_log into token_usage_daily every hour. Flags cost leaks, budget approaches, and missing attribution.',
    heartbeatCron: '0 * * * *',
    heartbeatIntervalSec: 3600,
    preferredBackend: 'openclaw',
    tags: ['bridge', 'cost', 'budget'],
    appearanceSpec: {
      style: 'minecraft',
      skin: 'clerk',
      palette: { primary: '#2C8754', secondary: '#0E2E1B', accent: '#7FD6A5' },
      tool: 'ledger',
    },
    agentGroup: 'operations',
  },
];

function readFileOrThrow(p: string, label: string): string {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing persona file ${label}: ${p}`);
  }
  return fs.readFileSync(p, 'utf8').trim();
}

async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  console.log(`[seed-autonomy-agents] using ${DATABASE_URL}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const agent of AGENTS) {
      const dir = path.join(PERSONAS_DIR, agent.instanceId);
      const identity = readFileOrThrow(path.join(dir, 'IDENTITY.md'), `${agent.instanceId}/IDENTITY.md`);
      const soul = readFileOrThrow(path.join(dir, 'SOUL.md'), `${agent.instanceId}/SOUL.md`);
      const roleCard = readFileOrThrow(path.join(dir, 'ROLE_CARD.md'), `${agent.instanceId}/ROLE_CARD.md`);
      const systemPrompt = readFileOrThrow(path.join(dir, 'SYSTEM_PROMPT.md'), `${agent.instanceId}/SYSTEM_PROMPT.md`);

      // 1. Upsert agent_templates row (the component)
      await client.query(
        `INSERT INTO agent_templates (
          id, name, category, description, tags,
          system_prompt, soul_text, role_card_text, identity_text,
          is_internal, heartbeat_interval, archetype, appearance_spec, lifecycle
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          description = EXCLUDED.description,
          tags = EXCLUDED.tags,
          system_prompt = EXCLUDED.system_prompt,
          soul_text = EXCLUDED.soul_text,
          role_card_text = EXCLUDED.role_card_text,
          identity_text = EXCLUDED.identity_text,
          is_internal = EXCLUDED.is_internal,
          heartbeat_interval = EXCLUDED.heartbeat_interval,
          archetype = EXCLUDED.archetype,
          appearance_spec = EXCLUDED.appearance_spec,
          lifecycle = EXCLUDED.lifecycle`,
        [
          agent.templateId,
          agent.name,
          agent.category,
          agent.description,
          JSON.stringify(agent.tags),
          systemPrompt,
          soul,
          roleCard,
          identity,
          1, // is_internal
          agent.heartbeatIntervalSec,
          'sentinel',
          JSON.stringify(agent.appearanceSpec),
          'persistent',
        ],
      );
      console.log(`  ✓ template upsert: ${agent.templateId}`);

      // 2. Upsert personas row (the instance)
      const now = new Date().toISOString();
      await client.query(
        `INSERT INTO personas (
          id, name, role, agent_group,
          preferred_backend, fallback_backends,
          status, created_at, config,
          is_system, is_public, is_locked, managed_by_porter,
          appearance_style, appearance_spec,
          heartbeat_enabled, heartbeat_cron,
          template_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          agent_group = EXCLUDED.agent_group,
          preferred_backend = EXCLUDED.preferred_backend,
          fallback_backends = EXCLUDED.fallback_backends,
          status = EXCLUDED.status,
          is_system = EXCLUDED.is_system,
          is_public = EXCLUDED.is_public,
          is_locked = EXCLUDED.is_locked,
          managed_by_porter = EXCLUDED.managed_by_porter,
          appearance_style = EXCLUDED.appearance_style,
          appearance_spec = EXCLUDED.appearance_spec,
          heartbeat_enabled = EXCLUDED.heartbeat_enabled,
          heartbeat_cron = EXCLUDED.heartbeat_cron,
          template_id = EXCLUDED.template_id`,
        [
          agent.instanceId,
          agent.name,
          agent.description,
          agent.agentGroup,
          agent.preferredBackend,
          JSON.stringify(['openclaw']),
          'active',
          now,
          JSON.stringify({ autonomy_launch: '2026-04-12' }),
          1, // is_system
          1, // is_public
          1, // is_locked (platform agents — can't be edited from product UI)
          1, // managed_by_porter
          'minecraft',
          JSON.stringify(agent.appearanceSpec),
          1, // heartbeat_enabled
          agent.heartbeatCron,
          agent.templateId,
        ],
      );
      console.log(`  ✓ instance upsert: ${agent.instanceId}`);
    }

    await client.query('COMMIT');
    console.log('\n[seed-autonomy-agents] all 4 templates + 4 instances committed.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Verification
  const verifyTpl = await pool.query<{ id: string; bytes: number }>(
    `SELECT id, octet_length(system_prompt) AS bytes FROM agent_templates WHERE id = ANY($1) ORDER BY id`,
    [AGENTS.map(a => a.templateId)],
  );
  const verifyInst = await pool.query<{ id: string; hb: number; cron: string }>(
    `SELECT id, heartbeat_enabled AS hb, heartbeat_cron AS cron FROM personas WHERE id = ANY($1) ORDER BY id`,
    [AGENTS.map(a => a.instanceId)],
  );

  console.log('\n=== Verification ===');
  console.log('Templates:');
  verifyTpl.rows.forEach(r => console.log(`  ${r.id}: system_prompt=${r.bytes}B`));
  console.log('Instances:');
  verifyInst.rows.forEach(r => console.log(`  ${r.id}: heartbeat_enabled=${r.hb} cron=${r.cron}`));

  if (verifyTpl.rows.length !== AGENTS.length || verifyInst.rows.length !== AGENTS.length) {
    throw new Error('Verification failed: row counts mismatch');
  }

  await pool.end();
}

seed().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
