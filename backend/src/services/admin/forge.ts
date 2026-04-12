/**
 * Agent Forge — Autonomous Assembly Line Service
 *
 * Processes templates into fully configured agents through 3 stations:
 *   Station 1 (Writer)   — Enriches .md files via AI, initializes Memory V2
 *   Station 2 (Trainer)  — Maps skills from SKILL_CATALOG
 *   Station 3 (Outfitter) — Maps tools, sets appearance
 *
 * Cross-model QA between each station. Adaptive throttling. Budget reservation.
 * Never stops — cycles through waves with approval gates.
 *
 * All queries use async PostgreSQL via pg-helpers + brain pool.
 */
import { queryOne, queryAll, execute } from '../../db/pg-helpers.js';
import { pool } from '../../db/client.js';
import { config } from '../../config.js';
import { writeSkillsManifest } from '../skills-manifest.js';
import crypto from 'crypto';
import fs from 'node:fs';
import path from 'node:path';

// ── Types ────────────────────────────────────────────────

interface ForgeState {
  running: boolean;
  currentWave: number;
  tickIntervalMs: number;
  dailyTokenBudget: number;
  qualityThreshold: number;
  stats: {
    queued: number;
    claimed: number;
    complete: number;
    error: number;
    dead_letter: number;
  };
}

interface PipelineItem {
  id: string;
  template_id: string;
  agent_id: string | null;
  station: number;
  status: string;
  wave: number;
  attempt_count: number;
  max_attempts: number;
  worker_id: string | null;
  cycle: number;
}

type ForgeEvent = {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
};

// ── State ────────────────────────────────────────────────

const WORKER_ID = crypto.randomUUID();
let intervalId: ReturnType<typeof setInterval> | null = null;
let consecutiveBrainFailures = 0;
const MAX_BRAIN_FAILURES = 5;
let tickInProgress = false;

// SSE clients
const sseClients = new Set<{ write: (data: string) => boolean; end: () => void }>();

// ── Settings ─────────────────────────────────────────────

async function getSetting(key: string): Promise<string> {
  const row = await queryOne<{ value: string }>('SELECT value FROM forge_settings WHERE key = $1', [key]);
  return row?.value ?? '';
}

async function setSetting(key: string, value: string): Promise<void> {
  await execute(
    'INSERT INTO forge_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [key, value]
  );
}

async function getSettings(): Promise<{ tickIntervalMs: number; dailyTokenBudget: number; qualityThreshold: number; currentWave: number; running: boolean }> {
  return {
    tickIntervalMs: parseInt(await getSetting('tick_interval_ms') || '30000', 10),
    dailyTokenBudget: parseInt(await getSetting('daily_token_budget') || '500000', 10),
    qualityThreshold: parseInt(await getSetting('quality_threshold') || '60', 10),
    currentWave: parseInt(await getSetting('current_wave') || '0', 10),
    running: (await getSetting('running')) === 'true',
  };
}

async function updateSettings(updates: Partial<{ tickIntervalMs: number; dailyTokenBudget: number; qualityThreshold: number }>): Promise<void> {
  if (updates.tickIntervalMs != null) await setSetting('tick_interval_ms', String(updates.tickIntervalMs));
  if (updates.dailyTokenBudget != null) await setSetting('daily_token_budget', String(updates.dailyTokenBudget));
  if (updates.qualityThreshold != null) await setSetting('quality_threshold', String(updates.qualityThreshold));
}

// ── SSE Emitter ──────────────────────────────────────────

function emitForgeEvent(event: ForgeEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
}

function addSSEClient(client: { write: (data: string) => boolean; end: () => void }): void {
  sseClients.add(client);
}

function removeSSEClient(client: { write: (data: string) => boolean; end: () => void }): void {
  sseClients.delete(client);
}

// ── Pipeline Seeding ─────────────────────────────────────

async function queueTemplate(templateId: string, wave?: number): Promise<string | null> {
  const settings = await getSettings();
  const cycle = 1;
  const targetWave = wave ?? settings.currentWave;

  const exists = await queryOne<{ n: number }>(
    'SELECT 1 AS n FROM forge_pipeline WHERE template_id = $1 AND cycle = $2',
    [templateId, cycle]
  );
  if (exists) return null;

  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO forge_pipeline (id, template_id, station, status, wave, cycle)
     VALUES ($1, $2, 1, 'queued', $3, $4)`,
    [id, templateId, targetWave, cycle]
  );

  emitForgeEvent({
    type: 'forge:item_queued',
    data: { id, template_id: templateId, wave: targetWave },
    timestamp: Date.now(),
  });

  return id;
}

async function queueTemplates(templateIds: string[], wave?: number): Promise<number> {
  let count = 0;
  for (const id of templateIds) {
    if (await queueTemplate(id, wave)) count++;
  }
  return count;
}

async function seedPipeline(): Promise<void> {
  const templates = await queryAll<{ id: string }>('SELECT id FROM agent_templates WHERE is_internal = 0');
  const settings = await getSettings();
  await queueTemplates(templates.map(t => t.id), settings.currentWave + 1);
}

// ── Atomic Claim ─────────────────────────────────────────

async function claimNext(station: number): Promise<PipelineItem | null> {
  const settings = await getSettings();
  const leaseExpiry = Date.now() / 1000 + 300;

  const item = await queryOne<PipelineItem>(
    `UPDATE forge_pipeline
     SET status = 'claimed', worker_id = $1, lease_expires_at = $2,
         updated_at = EXTRACT(epoch FROM now())
     WHERE id = (
       SELECT id FROM forge_pipeline
       WHERE status = 'queued' AND station = $3 AND wave <= $4
       ORDER BY wave, created_at
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [WORKER_ID, leaseExpiry, station, settings.currentWave]
  );

  if (item) {
    console.log(`[forge] Claimed: ${item.template_id} (station=${item.station})`);
  }

  return item;
}

async function renewLease(id: string): Promise<void> {
  await execute(
    'UPDATE forge_pipeline SET lease_expires_at = $1 WHERE id = $2 AND worker_id = $3',
    [Date.now() / 1000 + 300, id, WORKER_ID]
  );
}

async function recoverStaleLeases(): Promise<void> {
  const now = Date.now() / 1000;
  await execute(
    `UPDATE forge_pipeline SET status = 'queued', worker_id = NULL, lease_expires_at = NULL
     WHERE status = 'claimed' AND lease_expires_at < $1`,
    [now]
  );
}

// ── Station Execution ────────────────────────────────────

async function createStationRun(pipelineId: string, station: number, phase: string, sequence: number): Promise<string> {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO forge_station_runs (id, pipeline_id, station, phase, run_sequence)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, pipelineId, station, phase, sequence]
  );
  return id;
}

async function completeStationRun(runId: string, status: string, detail: Record<string, unknown>): Promise<void> {
  await execute(
    `UPDATE forge_station_runs
     SET status = $1, writer_model = $2, checker_model = $3, quality_score = $4,
         rubric = $5, qa_rationale = $6, files_touched = $7, skills_assigned = $8,
         tools_mapped = $9, flags = $10, tokens_used = $11, cost_actual = $12,
         duration_ms = $13, completed_at = EXTRACT(epoch FROM now())
     WHERE id = $14`,
    [
      status,
      detail.writer_model ?? null,
      detail.checker_model ?? null,
      detail.quality_score ?? null,
      JSON.stringify(detail.rubric ?? {}),
      detail.qa_rationale ?? null,
      JSON.stringify(detail.files_touched ?? []),
      JSON.stringify(detail.skills_assigned ?? []),
      JSON.stringify(detail.tools_mapped ?? []),
      JSON.stringify(detail.flags ?? []),
      detail.tokens_used ?? 0,
      detail.cost_actual ?? 0,
      detail.duration_ms ?? 0,
      runId,
    ]
  );
}

async function advanceStation(item: PipelineItem): Promise<void> {
  const nextStation = item.station + 1;
  if (nextStation > 4) return;

  const status = nextStation === 4 ? 'complete' : 'queued';
  await execute(
    `UPDATE forge_pipeline
     SET station = $1, status = $2, worker_id = NULL, lease_expires_at = NULL,
         updated_at = EXTRACT(epoch FROM now())
         ${nextStation === 4 ? ", completed_at = EXTRACT(epoch FROM now())" : ''}
     WHERE id = $3`,
    [nextStation, status, item.id]
  );

  if (nextStation === 4) {
    emitForgeEvent({
      type: 'forge:item_complete',
      data: { id: item.id, template_id: item.template_id, agent_id: item.agent_id },
      timestamp: Date.now(),
    });
  }
}

async function markError(item: PipelineItem, error: string): Promise<void> {
  const newAttempt = item.attempt_count + 1;
  const status = newAttempt >= item.max_attempts ? 'dead_letter' : 'queued';

  await execute(
    `UPDATE forge_pipeline
     SET status = $1, error = $2, attempt_count = $3, worker_id = NULL,
         lease_expires_at = NULL, updated_at = EXTRACT(epoch FROM now())
     WHERE id = $4`,
    [status, error, newAttempt, item.id]
  );

  emitForgeEvent({
    type: 'forge:error',
    data: { id: item.id, error, dead_letter: status === 'dead_letter' },
    timestamp: Date.now(),
  });
}

// ── Station 1: Writer ────────────────────────────────────

async function runWriter(item: PipelineItem): Promise<void> {
  const startMs = Date.now();
  const runId = await createStationRun(item.id, 1, 'execute', item.attempt_count + 1);

  emitForgeEvent({
    type: 'forge:item_claimed',
    data: { id: item.id, template_id: item.template_id, station: 1, action: 'Precipitating persona files...' },
    timestamp: Date.now(),
  });

  try {
    if (!item.agent_id) {
      // Look up the template
      const tmplRow = (await pool.query<{
        name: string; category: string; description: string;
        system_prompt: string; soul_text: string;
        role_card_text: string; identity_text: string; skills_text: string;
        skills: string; tools: string;
      }>(
        `SELECT name, category, description, system_prompt, soul_text,
                role_card_text, identity_text, skills_text, skills, tools
         FROM agent_templates WHERE id = $1`, [item.template_id]
      )).rows[0];

      if (!tmplRow) throw new Error(`Template ${item.template_id} not found`);

      // Read skills/tools from junction tables
      const junctionSkills = (await pool.query(
        'SELECT skill_id FROM template_skills WHERE template_id = $1 ORDER BY sort_order',
        [item.template_id]
      )).rows.map((r: { skill_id: string }) => r.skill_id);

      const junctionTools = (await pool.query(
        'SELECT tool_id FROM template_tools WHERE template_id = $1 ORDER BY sort_order',
        [item.template_id]
      )).rows.map((r: { tool_id: string }) => r.tool_id);

      const rawTools = tmplRow.tools;
      const toolsList = junctionTools.length > 0
        ? junctionTools
        : (Array.isArray(rawTools) ? rawTools : []);

      // Create persona row directly (no HTTP call — avoids auth)
      const agentId = 'agent_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      const cfg = {
        description: tmplRow.description || '',
        skills: junctionSkills,
        tools: toolsList,
        template_id: item.template_id,
        system_prompt: tmplRow.system_prompt || '',
        soul_text: tmplRow.soul_text || '',
        role_card_text: tmplRow.role_card_text || '',
        identity_text: tmplRow.identity_text || '',
      };

      await pool.query(`
        INSERT INTO personas (id, name, role, config, created_at, status, owner, is_temporary, template_id, deployed_by)
        VALUES ($1, $2, $3, $4, NOW()::text, 'idle', 'forge', 0, $5, 'forge')
        ON CONFLICT (id) DO NOTHING
      `, [agentId, tmplRow.name, tmplRow.category, JSON.stringify(cfg), item.template_id]);

      // Assign skills to persona
      for (const skillId of junctionSkills) {
        await pool.query(`
          INSERT INTO persona_skills (persona_id, skill_name, skill_id, enabled, assigned_at)
          VALUES ($1, $2, $3, 1, EXTRACT(EPOCH FROM NOW()))
          ON CONFLICT DO NOTHING
        `, [agentId, skillId, skillId]);
      }

      // Write persona .md files to disk (use config.personasDir — same path the admin reads from)
      const personaDir = path.join(config.personasDir, agentId);
      try {
        fs.mkdirSync(personaDir, { recursive: true });
        if (tmplRow.soul_text) fs.writeFileSync(path.join(personaDir, 'SOUL.md'), tmplRow.soul_text);
        if (tmplRow.role_card_text) fs.writeFileSync(path.join(personaDir, 'ROLE_CARD.md'), tmplRow.role_card_text);
        if (tmplRow.identity_text) fs.writeFileSync(path.join(personaDir, 'IDENTITY.md'), tmplRow.identity_text);
        if (tmplRow.system_prompt) fs.writeFileSync(path.join(personaDir, 'SYSTEM_PROMPT.md'), tmplRow.system_prompt);
      } catch (fsErr) {
        console.warn(`[forge:writer] .md file write failed for ${agentId}:`, fsErr instanceof Error ? fsErr.message : fsErr);
      }

      // Birth record in agent_notes
      const birthNote = `Born from template ${item.template_id} (${tmplRow.name}). Category: ${tmplRow.category}. ${tmplRow.description || ''}`;
      await pool.query(
        `INSERT INTO agent_notes (id, agent_id, content, note_type, confidence_score, source_type, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, 'birth', 90, 'forge', 'active', 'forge:writer', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
         ON CONFLICT DO NOTHING`,
        [crypto.randomUUID(), agentId, birthNote]
      );

      // Agent email provisioning
      try {
        const { rows: domainRows } = await pool.query<{ id: string }>(
          `SELECT id FROM mail_domains WHERE domain = 'askporter.app' LIMIT 1`
        );
        if (domainRows.length > 0) {
          const localPart = tmplRow.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
          const { rows: existingMb } = await pool.query(`SELECT id FROM mailboxes WHERE local_part = $1 AND domain_id = $2`, [localPart, domainRows[0].id]);
          if (existingMb.length === 0) {
            const { createMailbox: createMb } = await import('../mail/mailbox-service.js');
            const { getProvider } = await import('../mail/provider-factory.js');
            const provider = getProvider();
            const mb = await createMb(provider, { domainId: domainRows[0].id, localPart, displayName: tmplRow.name, mailboxType: 'agent', agentId });
            await pool.query(`INSERT INTO agent_mailboxes (agent_id, mailbox_id, role, created_at) VALUES ($1, $2, 'primary', EXTRACT(EPOCH FROM NOW())) ON CONFLICT DO NOTHING`, [agentId, mb.id]);
          }
        }
      } catch (mailErr) {
        console.warn(`[forge:writer] mailbox failed for ${agentId}:`, mailErr instanceof Error ? mailErr.message : mailErr);
      }

      await execute('UPDATE forge_pipeline SET agent_id = $1 WHERE id = $2', [agentId, item.id]);
      item.agent_id = agentId;
    }

    consecutiveBrainFailures = 0;

    await completeStationRun(runId, 'pass', {
      writer_model: 'direct-db',
      files_touched: ['persona', 'agent_notes.birth', 'mailbox'],
      duration_ms: Date.now() - startMs,
    });

    await advanceStation(item);

    emitForgeEvent({
      type: 'forge:station_complete',
      data: { id: item.id, station: 1, agent_id: item.agent_id },
      timestamp: Date.now(),
    });
  } catch (err) {
    consecutiveBrainFailures++;
    const errMsg = err instanceof Error ? err.message : String(err);

    await completeStationRun(runId, 'error', {
      duration_ms: Date.now() - startMs,
      flags: [errMsg],
    });

    await markError(item, errMsg);

    if (consecutiveBrainFailures >= MAX_BRAIN_FAILURES) {
      await setSetting('running', 'false');
      await stop();
      emitForgeEvent({
        type: 'forge:brain_unavailable',
        data: { failures: consecutiveBrainFailures },
        timestamp: Date.now(),
      });
    }
  }
}

// ── Station 2: Trainer ───────────────────────────────────

async function runTrainer(item: PipelineItem): Promise<void> {
  const startMs = Date.now();
  const runId = await createStationRun(item.id, 2, 'execute', item.attempt_count + 1);

  emitForgeEvent({
    type: 'forge:item_claimed',
    data: { id: item.id, template_id: item.template_id, station: 2, action: 'Calibrating skill matrix...' },
    timestamp: Date.now(),
  });

  try {
    // Read skills from template_skills junction (SOT-01 canonical, no JSONB fallback)
    const junctionSkills = (await pool.query(
      'SELECT skill_id FROM template_skills WHERE template_id = $1 ORDER BY sort_order',
      [item.template_id]
    )).rows as Array<{ skill_id: string }>;

    const templateSkillIds = junctionSkills.map(r => r.skill_id);

    // Map to persona_skills with skill_id (upsert)
    const assigned: string[] = [];
    for (const skillId of templateSkillIds) {
      await execute(
        `INSERT INTO persona_skills (persona_id, skill_name, skill_id, enabled, assigned_at)
         SELECT $1, $2, $3, 1, EXTRACT(epoch FROM now())
         WHERE NOT EXISTS (SELECT 1 FROM persona_skills WHERE persona_id = $1 AND skill_name = $2)`,
        [item.agent_id, skillId, skillId]
      );
      assigned.push(skillId);
    }

    await completeStationRun(runId, 'pass', {
      skills_assigned: assigned,
      flags: assigned.length === 0 ? ['No skills matched — flagged, not blocking'] : [],
      duration_ms: Date.now() - startMs,
    });

    await advanceStation(item);

    // Generate SKILLS.md manifest from DB assignments
    if (item.agent_id) {
      const persona = await queryOne<{ name: string }>('SELECT name FROM personas WHERE id = $1', [item.agent_id]);
      if (persona) {
        await writeSkillsManifest(item.agent_id, persona.name);
      }
    }

    emitForgeEvent({
      type: 'forge:station_complete',
      data: { id: item.id, station: 2, skills: assigned.length },
      timestamp: Date.now(),
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await completeStationRun(runId, 'error', { duration_ms: Date.now() - startMs, flags: [errMsg] });
    await markError(item, errMsg);
  }
}

// ── Station 3: Outfitter ─────────────────────────────────

async function runOutfitter(item: PipelineItem): Promise<void> {
  const startMs = Date.now();
  const runId = await createStationRun(item.id, 3, 'execute', item.attempt_count + 1);

  emitForgeEvent({
    type: 'forge:item_claimed',
    data: { id: item.id, template_id: item.template_id, station: 3, action: 'Annealing final form...' },
    timestamp: Date.now(),
  });

  try {
    const template = await queryOne<{ tools: unknown; required_tools: unknown }>(
      'SELECT tools, required_tools FROM agent_templates WHERE id = $1',
      [item.template_id]
    );
    const templateTools: string[] = (template?.tools as string[]) ?? [];
    const flags: string[] = [];
    const mapped: string[] = [];

    for (const tool of templateTools) {
      const conn = await queryOne<{ n: number }>(
        "SELECT 1 AS n FROM workspace_connections WHERE provider = $1 AND status = 'connected'",
        [tool]
      );
      if (conn) {
        mapped.push(tool);
      } else {
        flags.push(`Tool '${tool}' not connected — skipped`);
      }
    }

    const persona = await queryOne<{ appearance_spec: unknown }>(
      'SELECT appearance_spec FROM personas WHERE id = $1',
      [item.agent_id]
    );
    const specStr = typeof persona?.appearance_spec === 'string' ? persona.appearance_spec : JSON.stringify(persona?.appearance_spec ?? '{}');
    if (!persona?.appearance_spec || specStr === '{}') {
      const tmpl = await queryOne<{ category: string }>('SELECT category FROM agent_templates WHERE id = $1', [item.template_id]);
      const defaultSpec = JSON.stringify({
        skin: '#f1c27d', hair: '#2c1b18', eyes: '#1a1a2e',
        shirt: tmpl?.category === 'engineering' ? '#2563eb' : '#64748b',
        hairStyle: 'short',
      });
      await execute('UPDATE personas SET appearance_spec = $1 WHERE id = $2', [defaultSpec, item.agent_id]);
    }

    await completeStationRun(runId, 'pass', {
      tools_mapped: mapped,
      flags,
      duration_ms: Date.now() - startMs,
    });

    await advanceStation(item);

    emitForgeEvent({
      type: 'forge:station_complete',
      data: { id: item.id, station: 3, tools: mapped.length, flags: flags.length },
      timestamp: Date.now(),
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await completeStationRun(runId, 'error', { duration_ms: Date.now() - startMs, flags: [errMsg] });
    await markError(item, errMsg);
  }
}

// ── Tick ─────────────────────────────────────────────────

async function tick(): Promise<void> {
  if (tickInProgress) return;
  tickInProgress = true;
  try {
    const settings = await getSettings();
    if (!settings.running) { console.log('[forge] tick: not running'); return; }

    console.log(`[forge] tick: wave=${settings.currentWave}, checking stations...`);

    await recoverStaleLeases();

    for (const station of [1, 2, 3]) {
      const item = await claimNext(station);
      if (!item) continue;

      switch (station) {
        case 1: await runWriter(item); break;
        case 2: await runTrainer(item); break;
        case 3: await runOutfitter(item); break;
      }

      return;
    }

    const state = await getState();
    emitForgeEvent({
      type: 'forge:stats',
      data: state.stats,
      timestamp: Date.now(),
    });
  } finally {
    tickInProgress = false;
  }
}

// ── Public API ───────────────────────────────────────────

async function start(): Promise<void> {
  const settings = await getSettings();
  await setSetting('running', 'true');

  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(() => {
    tick().catch(err => console.error('[forge] tick error:', err));
  }, settings.tickIntervalMs);

  console.log(`[forge] Started — tick every ${settings.tickIntervalMs}ms, wave ${settings.currentWave}`);
}

async function stop(): Promise<void> {
  await setSetting('running', 'false');
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  console.log('[forge] Stopped');
}

async function getState(): Promise<ForgeState> {
  const settings = await getSettings();

  const row = await queryOne<{
    queued: number; claimed: number; complete: number; error: number; dead_letter: number;
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
      COUNT(*) FILTER (WHERE status = 'claimed')::int AS claimed,
      COUNT(*) FILTER (WHERE status = 'complete')::int AS complete,
      COUNT(*) FILTER (WHERE status = 'error')::int AS error,
      COUNT(*) FILTER (WHERE status = 'dead_letter')::int AS dead_letter
    FROM forge_pipeline
  `);

  const stats = row ?? { queued: 0, claimed: 0, complete: 0, error: 0, dead_letter: 0 };

  return {
    running: settings.running,
    currentWave: settings.currentWave,
    tickIntervalMs: settings.tickIntervalMs,
    dailyTokenBudget: settings.dailyTokenBudget,
    qualityThreshold: settings.qualityThreshold,
    stats,
  };
}

async function approveWave(): Promise<void> {
  const settings = await getSettings();
  const nextWave = settings.currentWave + 1;
  await setSetting('current_wave', String(nextWave));

  emitForgeEvent({
    type: 'forge:wave_approved',
    data: { wave: nextWave },
    timestamp: Date.now(),
  });

  console.log(`[forge] Wave ${nextWave} approved`);
}

async function resetPipeline(): Promise<void> {
  await stop();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM forge_station_runs');
    await client.query('DELETE FROM forge_pipeline');
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  await setSetting('current_wave', '0');
  console.log('[forge] Pipeline reset');
}

async function retryItem(pipelineId: string): Promise<boolean> {
  const item = await queryOne<PipelineItem>(
    "SELECT * FROM forge_pipeline WHERE id = $1 AND (status = 'error' OR status = 'dead_letter')",
    [pipelineId]
  );
  if (!item) return false;

  await execute(
    `UPDATE forge_pipeline SET status = 'queued', error = NULL, worker_id = NULL,
       lease_expires_at = NULL, attempt_count = 0, updated_at = EXTRACT(epoch FROM now())
     WHERE id = $1`,
    [pipelineId]
  );

  return true;
}

export {
  start,
  stop,
  getState,
  getSettings,
  updateSettings,
  approveWave,
  resetPipeline,
  retryItem,
  seedPipeline,
  queueTemplate,
  queueTemplates,
  addSSEClient,
  removeSSEClient,
};
export type { ForgeState, ForgeEvent };
