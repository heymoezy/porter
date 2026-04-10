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
 */
import { pool } from '../db/client.js';
import { config } from '../config.js';
import { writeSkillsManifest } from './skills-manifest.js';
import { createMailbox } from './mail/mailbox-service.js';
import { getProvider } from './mail/provider-factory.js';
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

// SSE clients
const sseClients = new Set<{ write: (data: string) => boolean; end: () => void }>();

// ── Settings ─────────────────────────────────────────────

async function getSetting(key: string): Promise<string> {
  const row = (await pool.query('SELECT value FROM forge_settings WHERE key = $1', [key])).rows[0] as { value: string } | undefined;
  return row?.value ?? '';
}

async function setSetting(key: string, value: string): Promise<void> {
  await pool.query(
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

/** Queue a single template for forging. Returns the pipeline item ID or null if already queued. */
async function queueTemplate(templateId: string, wave?: number): Promise<string | null> {
  const settings = await getSettings();
  const cycle = 1;
  const targetWave = wave ?? settings.currentWave;

  const exists = (await pool.query(
    'SELECT 1 FROM forge_pipeline WHERE template_id = $1 AND cycle = $2', [templateId, cycle]
  )).rows[0];
  if (exists) return null;

  const id = crypto.randomUUID();
  await pool.query(`
    INSERT INTO forge_pipeline (id, template_id, station, status, wave, cycle)
    VALUES ($1, $2, 1, 'queued', $3, $4)
  `, [id, templateId, targetWave, cycle]);

  emitForgeEvent({
    type: 'forge:item_queued',
    data: { id, template_id: templateId, wave: targetWave },
    timestamp: Date.now(),
  });

  return id;
}

/** Queue multiple templates at once. Returns count queued. */
async function queueTemplates(templateIds: string[], wave?: number): Promise<number> {
  let count = 0;
  for (const id of templateIds) {
    if (await queueTemplate(id, wave)) count++;
  }
  return count;
}

// Keep seedPipeline as a convenience but it's no longer auto-called
async function seedPipeline(): Promise<void> {
  const templates = (await pool.query('SELECT id FROM agent_templates WHERE is_internal = 0')).rows as Array<{ id: string }>;
  const settings = await getSettings();
  await queueTemplates(templates.map(t => t.id), settings.currentWave + 1);
}

// ── Atomic Claim ─────────────────────────────────────────

async function claimNext(station: number): Promise<PipelineItem | null> {
  const settings = await getSettings();
  const leaseExpiry = Date.now() / 1000 + 300; // 5 minute lease

  // Debug: check available items
  const available = (await pool.query(
    'SELECT COUNT(*) as n FROM forge_pipeline WHERE status = $1 AND station = $2 AND wave <= $3',
    ['queued', station, settings.currentWave]
  )).rows[0] as { n: number };
  console.log(`[forge] claimNext station=${station}: ${available.n} available (wave<=${settings.currentWave})`);

  if (available.n === 0) return null;

  // Claim: two-step (SELECT then UPDATE) for compatibility
  const candidate = (await pool.query(
    'SELECT id FROM forge_pipeline WHERE status = $1 AND station = $2 AND wave <= $3 ORDER BY wave, created_at LIMIT 1',
    ['queued', station, settings.currentWave]
  )).rows[0] as { id: string } | undefined;

  if (!candidate) return null;

  await pool.query(
    "UPDATE forge_pipeline SET status = 'claimed', worker_id = $1, lease_expires_at = $2, updated_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $3",
    [WORKER_ID, leaseExpiry, candidate.id]
  );

  const item = (await pool.query('SELECT * FROM forge_pipeline WHERE id = $1', [candidate.id])).rows[0] as PipelineItem | undefined;
  console.log(`[forge] Claimed: ${item?.template_id} (station=${item?.station})`);

  return item ?? null;
}

async function renewLease(id: string): Promise<void> {
  await pool.query(
    'UPDATE forge_pipeline SET lease_expires_at = $1 WHERE id = $2 AND worker_id = $3',
    [Date.now() / 1000 + 300, id, WORKER_ID]
  );
}

async function recoverStaleLeases(): Promise<void> {
  const now = Date.now() / 1000;
  await pool.query(
    "UPDATE forge_pipeline SET status = 'queued', worker_id = NULL, lease_expires_at = NULL WHERE status = 'claimed' AND lease_expires_at < $1",
    [now]
  );
}

// ── Station Execution ────────────────────────────────────

async function createStationRun(pipelineId: string, station: number, phase: string, sequence: number): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(`
    INSERT INTO forge_station_runs (id, pipeline_id, station, phase, run_sequence)
    VALUES ($1, $2, $3, $4, $5)
  `, [id, pipelineId, station, phase, sequence]);
  return id;
}

async function completeStationRun(runId: string, status: string, detail: Record<string, unknown>): Promise<void> {
  await pool.query(`
    UPDATE forge_station_runs
    SET status = $1, writer_model = $2, checker_model = $3, quality_score = $4,
        rubric = $5, qa_rationale = $6, files_touched = $7, skills_assigned = $8,
        tools_mapped = $9, flags = $10, tokens_used = $11, cost_actual = $12,
        duration_ms = $13, completed_at = EXTRACT(EPOCH FROM NOW())
    WHERE id = $14
  `, [
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
  ]);
}

async function advanceStation(item: PipelineItem): Promise<void> {
  const nextStation = item.station + 1;
  if (nextStation > 4) return;

  const status = nextStation === 4 ? 'complete' : 'queued';
  if (nextStation === 4) {
    await pool.query(`
      UPDATE forge_pipeline
      SET station = $1, status = $2, worker_id = NULL, lease_expires_at = NULL,
          updated_at = EXTRACT(EPOCH FROM NOW()), completed_at = EXTRACT(EPOCH FROM NOW())
      WHERE id = $3
    `, [nextStation, status, item.id]);
  } else {
    await pool.query(`
      UPDATE forge_pipeline
      SET station = $1, status = $2, worker_id = NULL, lease_expires_at = NULL,
          updated_at = EXTRACT(EPOCH FROM NOW())
      WHERE id = $3
    `, [nextStation, status, item.id]);
  }

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

  await pool.query(`
    UPDATE forge_pipeline
    SET status = $1, error = $2, attempt_count = $3, worker_id = NULL,
        lease_expires_at = NULL, updated_at = EXTRACT(EPOCH FROM NOW())
    WHERE id = $4
  `, [status, error, newAttempt, item.id]);

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
    // Check if agent already exists (idempotent)
    if (!item.agent_id) {
      // Look up the template
      const tmplRow = (await pool.query<{
        name: string;
        category: string;
        description: string;
        system_prompt: string;
        soul_text: string;
        role_card_text: string;
        identity_text: string;
        skills_text: string;
        skills: string;
        tools: string;
      }>(
        `SELECT name, category, description, system_prompt, soul_text,
                role_card_text, identity_text, skills_text, skills, tools
         FROM agent_templates WHERE id = $1`, [item.template_id]
      )).rows[0];

      if (!tmplRow) throw new Error(`Template ${item.template_id} not found`);
      const displayName = tmplRow.name;

      // Read skills/tools from junction tables (same as templates.ts instantiate)
      const junctionSkills = (await pool.query(
        'SELECT skill_id FROM template_skills WHERE template_id = $1 ORDER BY sort_order',
        [item.template_id]
      )).rows.map((r: { skill_id: string }) => r.skill_id);

      const junctionTools = (await pool.query(
        'SELECT tool_id FROM template_tools WHERE template_id = $1 ORDER BY sort_order',
        [item.template_id]
      )).rows.map((r: { tool_id: string }) => r.tool_id);

      const toolsList = junctionTools.length > 0
        ? junctionTools
        : (tmplRow.tools ? JSON.parse(tmplRow.tools) : []);

      // Create persona directly (no HTTP call — avoids auth requirement)
      const agentId = 'agent_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      const cfg = {
        description: tmplRow.description || '',
        skills: junctionSkills,
        tools: toolsList,
        template_id: item.template_id,
      };

      await pool.query(`
        INSERT INTO personas (id, name, role, config, created_at, status, owner, is_temporary, template_id, deployed_by)
        VALUES ($1, $2, $3, $4, NOW()::text, 'idle', 'forge', 0, $5, 'forge')
        ON CONFLICT (id) DO NOTHING
      `, [agentId, displayName, tmplRow.category, JSON.stringify(cfg), item.template_id]);

      // Assign skills to persona
      for (const skillId of junctionSkills) {
        await pool.query(`
          INSERT INTO persona_skills (persona_id, skill_name, skill_id, enabled, assigned_at)
          VALUES ($1, $2, $3, 1, EXTRACT(EPOCH FROM NOW()))
          ON CONFLICT DO NOTHING
        `, [agentId, skillId, skillId]);
      }

      await pool.query('UPDATE forge_pipeline SET agent_id = $1 WHERE id = $2', [agentId, item.id]);
      item.agent_id = agentId;
    }

    // ── AI Enrichment: write persona config from template text ────────
    // Re-read template (tmplRow may be stale if agent already existed)
    const templateData = (await pool.query<{
      name: string;
      category: string;
      description: string;
      system_prompt: string;
      soul_text: string;
      role_card_text: string;
      identity_text: string;
      skills_text: string;
    }>(
      `SELECT name, category, description, system_prompt, soul_text,
              role_card_text, identity_text, skills_text
       FROM agent_templates WHERE id = $1`,
      [item.template_id]
    )).rows[0];

    if (templateData && item.agent_id) {
      // If template already has rich text, use it directly. Otherwise generate.
      const hasRichSoul = (templateData.soul_text?.length ?? 0) > 100;
      const hasRichIdentity = (templateData.identity_text?.length ?? 0) > 100;
      const hasRichRole = (templateData.role_card_text?.length ?? 0) > 100;

      // Write what we have from template directly to persona columns
      if (hasRichSoul || hasRichIdentity || hasRichRole) {
        await pool.query(
          `UPDATE personas SET
            config = COALESCE(config, '{}'::jsonb) ||
              jsonb_build_object(
                'system_prompt', $2::text,
                'soul_text', $3::text,
                'role_card_text', $4::text,
                'identity_text', $5::text,
                'template_id', $6::text
              )
           WHERE id = $1`,
          [
            item.agent_id,
            templateData.system_prompt || '',
            templateData.soul_text || '',
            templateData.role_card_text || '',
            templateData.identity_text || '',
            item.template_id,
          ]
        );
      }

      // ── Birth record (lightweight Memory V2 init) ───────────────────
      const birthNote = `Born from template ${item.template_id} (${templateData.name}). ` +
        `Category: ${templateData.category}. ${templateData.description || ''}`;
      await pool.query(
        `INSERT INTO agent_notes
          (id, agent_id, content, note_type, confidence_score, source_type, status,
           created_by, created_at, updated_at)
         VALUES ($1, $2, $3, 'birth', 90, 'forge', 'active',
                 'forge:writer', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
         ON CONFLICT DO NOTHING`,
        [crypto.randomUUID(), item.agent_id, birthNote]
      );

      // ── Agent email provisioning ────────────────────────────────────
      // Create a Stalwart mailbox: <agent-name>@askporter.app
      try {
        const { rows: domainRows } = await pool.query<{ id: string }>(
          `SELECT id FROM mail_domains WHERE domain = 'askporter.app' LIMIT 1`
        );
        if (domainRows.length > 0) {
          const localPart = templateData.name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 30);

          // Check if mailbox already exists
          const { rows: existingMb } = await pool.query(
            `SELECT id FROM mailboxes WHERE local_part = $1 AND domain_id = $2`,
            [localPart, domainRows[0].id]
          );
          if (existingMb.length === 0) {
            const provider = getProvider();
            const mb = await createMailbox(provider, {
              domainId: domainRows[0].id,
              localPart,
              displayName: templateData.name,
              mailboxType: 'agent',
              agentId: item.agent_id,
            });
            // Link agent to mailbox
            await pool.query(
              `INSERT INTO agent_mailboxes (agent_id, mailbox_id, role, created_at)
               VALUES ($1, $2, 'primary', EXTRACT(EPOCH FROM NOW()))
               ON CONFLICT DO NOTHING`,
              [item.agent_id, mb.id]
            );
          }
        }
      } catch (mailErr) {
        // Non-blocking: email is nice-to-have, not critical for forging
        console.warn(`[forge:writer] mailbox creation failed for ${item.agent_id}:`,
          mailErr instanceof Error ? mailErr.message : mailErr);
      }
    }

    consecutiveBrainFailures = 0;

    await completeStationRun(runId, 'pass', {
      writer_model: 'template-direct',
      enrichment: templateData ? {
        hasSoul: (templateData.soul_text?.length ?? 0) > 100,
        hasIdentity: (templateData.identity_text?.length ?? 0) > 100,
        hasRole: (templateData.role_card_text?.length ?? 0) > 100,
      } : null,
      files_touched: ['persona.config', 'agent_notes.birth', 'mailbox'],
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

    // Auto-pause if Brain is consistently down
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
      'SELECT ts.skill_id FROM template_skills ts WHERE ts.template_id = $1 ORDER BY ts.sort_order',
      [item.template_id]
    )).rows as Array<{ skill_id: string }>;

    const templateSkillIds = junctionSkills.map(r => r.skill_id);

    // Map to persona_skills with skill_id (upsert)
    const assigned: string[] = [];
    for (const skillId of templateSkillIds) {
      await pool.query(`
        INSERT INTO persona_skills (persona_id, skill_name, skill_id, enabled, assigned_at)
        VALUES ($1, $2, $3, 1, EXTRACT(EPOCH FROM NOW()))
        ON CONFLICT DO NOTHING
      `, [item.agent_id, skillId, skillId]);
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
      const persona = (await pool.query('SELECT name FROM personas WHERE id = $1', [item.agent_id])).rows[0] as { name: string } | undefined;
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
    // Read template tools — prefer junction table (Phase 15), fall back to JSONB if empty
    const junctionTools = (await pool.query(
      'SELECT tt.tool_id FROM template_tools tt WHERE tt.template_id = $1 ORDER BY tt.sort_order',
      [item.template_id]
    )).rows as Array<{ tool_id: string }>;

    let templateTools: string[];
    if (junctionTools.length > 0) {
      templateTools = junctionTools.map(r => r.tool_id);
    } else {
      // Fallback: read JSONB (pre-Phase 15 data or empty junction)
      const template = (await pool.query('SELECT tools FROM agent_templates WHERE id = $1', [item.template_id])).rows[0] as { tools: string } | undefined;
      templateTools = template?.tools ? JSON.parse(template.tools) : [];
    }
    const flags: string[] = [];
    const mapped: string[] = [];

    // Check workspace_connections for each tool
    for (const tool of templateTools) {
      const conn = (await pool.query(
        "SELECT 1 FROM workspace_connections WHERE provider = $1 AND status = 'connected'", [tool]
      )).rows[0];
      if (conn) {
        mapped.push(tool);
      } else {
        flags.push(`Tool '${tool}' not connected — skipped`);
      }
    }

    // Set appearance_spec if empty
    const persona = (await pool.query('SELECT appearance_spec FROM personas WHERE id = $1', [item.agent_id])).rows[0] as { appearance_spec: string } | undefined;
    if (!persona?.appearance_spec || persona.appearance_spec === '{}') {
      // Default appearance based on template category
      const tmpl = (await pool.query('SELECT category FROM agent_templates WHERE id = $1', [item.template_id])).rows[0] as { category: string } | undefined;
      const defaultSpec = JSON.stringify({
        skin: '#f1c27d', hair: '#2c1b18', eyes: '#1a1a2e',
        shirt: tmpl?.category === 'engineering' ? '#2563eb' : '#64748b',
        hairStyle: 'short',
      });
      await pool.query('UPDATE personas SET appearance_spec = $1 WHERE id = $2', [defaultSpec, item.agent_id]);
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
  const settings = await getSettings();
  if (!settings.running) { console.log('[forge] tick: not running'); return; }

  console.log(`[forge] tick: wave=${settings.currentWave}, checking stations...`);

  // Recover stale leases
  await recoverStaleLeases();

  // Try each station in order — claim one item
  // Station 1=writer, 2=trainer, 3=outfitter, 4=complete
  for (const station of [1, 2, 3]) {
    const item = await claimNext(station);
    if (!item) continue;

    switch (station) {
      case 1: await runWriter(item); break;
      case 2: await runTrainer(item); break;
      case 3: await runOutfitter(item); break;
    }

    // One item per tick
    return;
  }

  // Nothing to process — emit idle stats
  const state = await getState();
  emitForgeEvent({
    type: 'forge:stats',
    data: state.stats,
    timestamp: Date.now(),
  });
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

  const stats = {
    queued: (await pool.query("SELECT COUNT(*) as n FROM forge_pipeline WHERE status = 'queued'")).rows[0].n,
    claimed: (await pool.query("SELECT COUNT(*) as n FROM forge_pipeline WHERE status = 'claimed'")).rows[0].n,
    complete: (await pool.query("SELECT COUNT(*) as n FROM forge_pipeline WHERE status = 'complete'")).rows[0].n,
    error: (await pool.query("SELECT COUNT(*) as n FROM forge_pipeline WHERE status = 'error'")).rows[0].n,
    dead_letter: (await pool.query("SELECT COUNT(*) as n FROM forge_pipeline WHERE status = 'dead_letter'")).rows[0].n,
  };

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
  await pool.query("DELETE FROM forge_station_runs");
  await pool.query("DELETE FROM forge_pipeline");
  await setSetting('current_wave', '0');
  console.log('[forge] Pipeline reset');
}

async function retryItem(pipelineId: string): Promise<boolean> {
  const item = (await pool.query(
    "SELECT * FROM forge_pipeline WHERE id = $1 AND (status = 'error' OR status = 'dead_letter')", [pipelineId]
  )).rows[0];
  if (!item) return false;

  await pool.query(`
    UPDATE forge_pipeline SET status = 'queued', error = NULL, worker_id = NULL,
      lease_expires_at = NULL, attempt_count = 0, updated_at = EXTRACT(EPOCH FROM NOW())
    WHERE id = $1
  `, [pipelineId]);

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
