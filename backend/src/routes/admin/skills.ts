import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { ok, err } from '../../lib/admin-envelope.js';
import { queryAll, queryOne, execute } from '../../db/pg-helpers.js';
import { proxyToAdmin } from '../../lib/admin-proxy.js';
import { writeSkillsManifest } from '../../services/skills-manifest.js';

// ── Quality scoring (ported from admin/backend/src/services/skill-library.ts) ──

const SKILLS_ROOT = path.resolve(process.env.PORTER_SKILLS_DIR || '/home/lobster/projects/Porter/skills');

const EXPECTED_PACK_FILES = ['SKILL.md', 'prompt.md', 'guides/qa-checklist.md', 'examples/README.md', 'meta/skill.json'];

const SCAFFOLD_PHRASES = [
  'none yet', '- none', 'Operate as ', 'Porter-specific notes',
  'Add examples', 'TODO', 'TBD', 'placeholder',
  'When a project requires', 'When Porter delegates work', 'When specialized',
];

export type QualityTier = 'scaffold' | 'baseline' | 'production' | 'high-performing' | 'stale';

export interface PackDiagnostics {
  fileCount: number;
  nonEmptyCount: number;
  totalWords: number;
  scaffoldPhraseMatches: number;
  scaffoldPct: number;
  missingFiles: string[];
  emptyFiles: string[];
  qualityTier: QualityTier;
  qualityScore: number;
  exampleCount: number;
  guideCount: number;
  components: {
    completeness: number;
    specificity: number;
    examples: number;
    richness: number;
    uniqueness: number;
    usage: number;
    effectiveness: number;
  };
}

interface SkillFileSummary {
  path: string;
  name: string;
  ext: string;
  size: number;
  kind: 'skill' | 'guide' | 'json' | 'example' | 'script' | 'other';
}

interface TelemetryData {
  total_uses: number;
  avg_effectiveness: number;
  last_used: number | null;
}

function safeReadText(filePath: string): string {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}

function walkSkillDir(dir: string): SkillFileSummary[] {
  if (!fs.existsSync(dir)) return [];
  const results: SkillFileSummary[] = [];
  function recurse(current: string) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { recurse(full); continue; }
      const relative = path.relative(dir, full);
      const lower = entry.name.toLowerCase();
      let kind: SkillFileSummary['kind'] = 'other';
      if (lower === 'skill.md') kind = 'skill';
      else if (lower.includes('guide') || lower.endsWith('.guide.md')) kind = 'guide';
      else if (lower.includes('example') || lower.endsWith('.example.md')) kind = 'example';
      else if (lower.endsWith('.json')) kind = 'json';
      else if (lower.endsWith('.sh') || lower.endsWith('.ts') || lower.endsWith('.js') || lower.endsWith('.py')) kind = 'script';
      const ext = path.extname(entry.name).slice(1);
      let size = 0;
      try { size = fs.statSync(full).size; } catch { /* ok */ }
      results.push({ path: relative, name: entry.name, ext, size, kind });
    }
  }
  recurse(dir);
  return results;
}

function computePackDiagnostics(skillId: string, files: SkillFileSummary[], telemetry?: TelemetryData): PackDiagnostics {
  const dir = path.join(SKILLS_ROOT, skillId);
  const presentPaths = new Set(files.map(f => f.path));
  const missingFiles = EXPECTED_PACK_FILES.filter(p => !presentPaths.has(p));
  const emptyFiles: string[] = [];
  let totalWords = 0;
  let scaffoldPhraseMatches = 0;
  let promptScaffoldMatches = 0;

  for (const file of files) {
    const text = safeReadText(path.join(dir, file.path));
    if (!text.trim()) { emptyFiles.push(file.path); continue; }
    totalWords += text.split(/\s+/).filter(Boolean).length;
    let fileScaffoldCount = 0;
    for (const phrase of SCAFFOLD_PHRASES) {
      if (text.includes(phrase)) { scaffoldPhraseMatches++; fileScaffoldCount++; }
    }
    if (file.path === 'prompt.md') promptScaffoldMatches = fileScaffoldCount;
  }

  const exampleCount = files.filter(f => f.kind === 'example').length;
  const guideCount = files.filter(f => f.kind === 'guide').length;

  const completenessScore = (EXPECTED_PACK_FILES.length - missingFiles.length) * 4;
  const specificityScore = Math.min(20, (totalWords / 1200) * 20);
  const exampleScore = Math.min(15, (exampleCount / 5) * 15);
  const guideScore = Math.min(15, (guideCount / 3) * 15);
  const promptScore = Math.max(0, 10 - (promptScaffoldMatches * 2));
  const usageScore = telemetry ? Math.min(10, (telemetry.total_uses / 50) * 10) : 0;
  const eff = telemetry ? telemetry.avg_effectiveness : 0;
  const effectivenessScore = Math.min(10, (eff > 1 ? eff / 10 : eff * 10));

  const qualityScore = Math.round(completenessScore + specificityScore + exampleScore + guideScore + promptScore + usageScore + effectivenessScore);

  let qualityTier: QualityTier = 'scaffold';
  if (qualityScore > 75) qualityTier = 'high-performing';
  else if (qualityScore > 50) qualityTier = 'production';
  else if (qualityScore > 25) qualityTier = 'baseline';

  if (telemetry?.last_used) {
    const thirtyDaysAgo = Date.now() / 1000 - (30 * 24 * 60 * 60);
    if (telemetry.last_used < thirtyDaysAgo) qualityTier = 'stale';
  }

  const scaffoldPct = files.length > 0
    ? Math.round((scaffoldPhraseMatches / (files.length * SCAFFOLD_PHRASES.length)) * 100)
    : 100;

  return {
    fileCount: files.length,
    nonEmptyCount: files.length - emptyFiles.length,
    totalWords,
    scaffoldPhraseMatches,
    scaffoldPct,
    missingFiles,
    emptyFiles,
    qualityTier,
    qualityScore,
    exampleCount,
    guideCount,
    components: {
      completeness: completenessScore,
      specificity: Math.round(specificityScore),
      examples: Math.round(exampleScore),
      richness: Math.round(guideScore),
      uniqueness: Math.round(promptScore),
      usage: Math.round(usageScore),
      effectiveness: Math.round(effectivenessScore),
    },
  };
}

// ── End quality scoring ──────────────────────────────────────────────────────

interface SkillRow {
  id: string; name: string; description: string; category: string; source: string;
  enabled: number; visible: number; featured: number;
  icon: string; color: string; short_label: string;
  sort_order: number; featured_order: number;
  pack_status: string;
  tags: string | null;
  template_count: number; agent_count: number;
  total_uses: number; avg_effectiveness: number; last_used: number | null;
}

export default async function skillsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // ── List ────────────────────────────────────────────────
  fastify.get('/', async (req) => {
    try {
      const qs = req.query as Record<string, string | undefined>;
      const searchQ = qs.search?.trim().toLowerCase();
      const categoryQ = qs.category?.trim();
      const featuredQ = qs.featured === 'true';
      const packStatusQ = qs.packStatus?.trim();

      const rows = await queryAll<SkillRow>(`
        SELECT s.*,
          COALESCE((SELECT COUNT(*) FROM template_skills ts WHERE ts.skill_id = s.id), 0)::int AS template_count,
          COALESCE((SELECT COUNT(*) FROM persona_skills ps WHERE ps.skill_name = s.id AND ps.enabled = 1), 0)::int AS agent_count,
          COALESCE((SELECT SUM(ps.times_selected) FROM persona_skills ps WHERE ps.skill_name = s.id), 0)::int AS total_uses,
          COALESCE((SELECT AVG(ps.effectiveness_score) FROM persona_skills ps WHERE ps.skill_name = s.id), 0)::float AS avg_effectiveness,
          (SELECT MAX(ps.last_used_at) FROM persona_skills ps WHERE ps.skill_name = s.id) AS last_used
        FROM skills s
        ORDER BY s.featured DESC, s.featured_order, s.sort_order, s.name
      `);

      const assignments = await queryAll<{
        skill_name: string; persona_id: string; enabled: number;
        name: string | null; role: string | null;
      }>(`
        SELECT ps.skill_name, ps.persona_id, ps.enabled, p.name, p.role
        FROM persona_skills ps
        LEFT JOIN personas p ON p.id = ps.persona_id
        ORDER BY ps.skill_name, p.name
      `);

      const bySkill = new Map<string, Array<{ id: string; name: string; role: string; enabled: boolean }>>();
      for (const a of assignments) {
        const list = bySkill.get(a.skill_name) ?? [];
        list.push({ id: a.persona_id, name: a.name || a.persona_id, role: a.role || '', enabled: !!a.enabled });
        bySkill.set(a.skill_name, list);
      }

      // Parse tags from jsonb
      function parseTags(raw: string | null): string[] {
        if (!raw) return [];
        try { return Array.isArray(raw) ? raw : JSON.parse(raw); } catch { return []; }
      }

      let skills = rows.map(row => {
        const files = walkSkillDir(path.join(SKILLS_ROOT, row.id));
        const telemetry: TelemetryData = {
          total_uses: row.total_uses || 0,
          avg_effectiveness: row.avg_effectiveness || 0,
          last_used: row.last_used,
        };
        const diag = computePackDiagnostics(row.id, files, telemetry);
        return {
          id: row.id,
          name: row.name,
          description: row.description || '',
          category: row.category || 'Unknown',
          source: row.source || 'detected',
          enabled: !!row.enabled,
          visible: !!row.visible,
          featured: !!row.featured,
          icon: row.icon || '',
          color: row.color || '',
          short_label: row.short_label || '',
          sort_order: row.sort_order ?? 50,
          featured_order: row.featured_order ?? 0,
          pack_status: row.pack_status || 'missing',
          tags: parseTags(row.tags),
          template_count: row.template_count ?? 0,
          agent_count: row.agent_count ?? 0,
          agents: bySkill.get(row.id) ?? [],
          qualityScore: diag.qualityScore,
          qualityTier: diag.qualityTier,
        };
      });

      // Build allTags from full set before filtering
      const allTags: Record<string, number> = {};
      for (const s of skills) {
        for (const t of s.tags) {
          allTags[t] = (allTags[t] || 0) + 1;
        }
      }

      // Apply filters
      if (categoryQ) skills = skills.filter(s => s.category === categoryQ);
      if (featuredQ) skills = skills.filter(s => s.featured);
      if (packStatusQ) skills = skills.filter(s => s.pack_status === packStatusQ);
      if (searchQ) {
        skills = skills.filter(s =>
          s.name.toLowerCase().includes(searchQ) ||
          s.description.toLowerCase().includes(searchQ) ||
          s.id.toLowerCase().includes(searchQ) ||
          s.tags.some(t => t.toLowerCase().includes(searchQ))
        );
      }

      const categories: Record<string, number> = {};
      const sources: Record<string, number> = {};
      const packStatuses: Record<string, number> = {};
      const tiers: Record<string, number> = { scaffold: 0, baseline: 0, production: 0, 'high-performing': 0, stale: 0 };
      for (const s of skills) {
        categories[s.category] = (categories[s.category] || 0) + 1;
        sources[s.source] = (sources[s.source] || 0) + 1;
        packStatuses[s.pack_status] = (packStatuses[s.pack_status] || 0) + 1;
        if (s.qualityTier) tiers[s.qualityTier] = (tiers[s.qualityTier] || 0) + 1;
      }

      return ok({
        skills,
        totalSkills: skills.length,
        visibleSkills: skills.filter(s => s.visible).length,
        featuredSkills: skills.filter(s => s.featured).length,
        assignedSkills: skills.filter(s => s.agent_count > 0).length,
        totalAssignments: assignments.length,
        totalTemplatesUsingSkills: skills.reduce((sum, s) => sum + s.template_count, 0),
        categories,
        sources,
        packStatuses,
        tiers,
        allTags,
      });
    } catch {
      return ok({ skills: [], totalSkills: 0, visibleSkills: 0, featuredSkills: 0, assignedSkills: 0, totalAssignments: 0, totalTemplatesUsingSkills: 0, categories: {}, sources: {}, packStatuses: {}, tiers: { scaffold: 0, baseline: 0, production: 0, 'high-performing': 0, stale: 0 }, allTags: {} });
    }
  });

  // ── Create ──────────────────────────────────────────────
  fastify.post('/', async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const id = String(body.id || '').trim();
    const name = String(body.name || '').trim();
    if (!id || !name) { reply.status(400); return err('INVALID', 'id and name required'); }

    const exists = await queryOne('SELECT id FROM skills WHERE id = $1', [id]);
    if (exists) { reply.status(409); return err('CONFLICT', `Skill ${id} already exists`); }

    await execute(`
      INSERT INTO skills (id, name, description, category, source, enabled, visible, featured, icon, color, short_label, sort_order, featured_order, pack_status, config_schema)
      VALUES ($1, $2, $3, $4, $5, 1, 1, 0, '', '', '', 50, 0, 'missing', '{}')
    `, [id, name, body.description || '', body.category || 'Unknown', body.source || 'porter-curated']);

    return ok({ id, created: true });
  });

  // ── Update ──────────────────────────────────────────────
  fastify.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const exists = await queryOne('SELECT id FROM skills WHERE id = $1', [id]);
    if (!exists) { reply.status(404); return err('NOT_FOUND', `Skill ${id} not found`); }

    const fields: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const key of ['name', 'description', 'category', 'source', 'icon', 'color', 'short_label']) {
      if (body[key] !== undefined) { fields.push(`${key} = $${idx}`); vals.push(body[key]); idx++; }
    }
    for (const key of ['enabled', 'visible', 'featured']) {
      if (body[key] !== undefined) { fields.push(`${key} = $${idx}`); vals.push(body[key] ? 1 : 0); idx++; }
    }
    for (const key of ['sort_order', 'featured_order']) {
      if (body[key] !== undefined) { fields.push(`${key} = $${idx}`); vals.push(Number(body[key])); idx++; }
    }
    if (body.tags !== undefined) {
      fields.push(`tags = $${idx}`); vals.push(JSON.stringify(body.tags)); idx++;
    }
    if (fields.length === 0) return ok({ id, updated: false });

    fields.push(`updated_at = EXTRACT(EPOCH FROM NOW())`);
    vals.push(id);
    await execute(`UPDATE skills SET ${fields.join(', ')} WHERE id = $${idx}`, vals);
    return ok({ id, updated: true });
  });

  // ── Delete ──────────────────────────────────────────────
  fastify.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exists = await queryOne('SELECT id FROM skills WHERE id = $1', [id]);
    if (!exists) { reply.status(404); return err('NOT_FOUND', `Skill ${id} not found`); }

    // Find affected personas before deletion for SKILLS.md regeneration (SOT-06)
    const affectedPersonas = await queryAll<{ persona_id: string; name: string }>(
      `SELECT DISTINCT ps.persona_id, p.name FROM persona_skills ps
       JOIN personas p ON p.id = ps.persona_id
       WHERE ps.skill_id = $1 OR ps.skill_name = $1`,
      [id]
    );

    await execute('DELETE FROM persona_skills WHERE skill_id = $1 OR skill_name = $1', [id]);
    await execute('DELETE FROM template_skills WHERE skill_id = $1', [id]);
    await execute('DELETE FROM skills WHERE id = $1', [id]);

    // Regenerate SKILLS.md for affected personas (SOT-06)
    for (const p of affectedPersonas) {
      try { await writeSkillsManifest(p.persona_id, p.name); } catch (e) {
        console.error(`Failed to regenerate SKILLS.md for ${p.persona_id}:`, e);
      }
    }

    return ok({ id, deleted: true });
  });

  // ── Quality audit (Phase 36 — QLT-05) ───────────────────
  fastify.get('/audit', async () => {
    const rows = await queryAll<{ id: string; name: string; total_uses: number; avg_effectiveness: number; last_used: number | null }>(`
      SELECT s.id, s.name,
        COALESCE((SELECT SUM(ps.times_selected) FROM persona_skills ps WHERE ps.skill_name = s.id), 0)::int AS total_uses,
        COALESCE((SELECT AVG(ps.effectiveness_score) FROM persona_skills ps WHERE ps.skill_name = s.id), 0)::float AS avg_effectiveness,
        (SELECT MAX(ps.last_used_at) FROM persona_skills ps WHERE ps.skill_name = s.id) AS last_used
      FROM skills s
      ORDER BY s.name
    `);

    const reports = [];
    for (const row of rows) {
      const files = walkSkillDir(path.join(SKILLS_ROOT, row.id));
      const telemetry: TelemetryData = {
        total_uses: row.total_uses || 0,
        avg_effectiveness: row.avg_effectiveness || 0,
        last_used: row.last_used,
      };
      const diag = computePackDiagnostics(row.id, files, telemetry);

      // Persist computed scores to DB
      await execute(`
        UPDATE skills
        SET quality_score = $2,
            quality_tier = $3,
            updated_at = EXTRACT(EPOCH FROM NOW())
        WHERE id = $1
      `, [row.id, diag.qualityScore, diag.qualityTier]);

      reports.push({
        id: row.id,
        name: row.name,
        qualityScore: diag.qualityScore,
        qualityTier: diag.qualityTier,
        missingFiles: diag.missingFiles,
        scaffoldPct: diag.scaffoldPct,
        totalWords: diag.totalWords,
        usageCount: row.total_uses,
        effectiveness: row.avg_effectiveness,
        components: diag.components,
      });
    }

    return ok({
      timestamp: Date.now(),
      totalSkills: reports.length,
      scaffold: reports.filter(r => r.qualityTier === 'scaffold').length,
      baseline: reports.filter(r => r.qualityTier === 'baseline').length,
      production: reports.filter(r => r.qualityTier === 'production').length,
      highPerforming: reports.filter(r => r.qualityTier === 'high-performing').length,
      stale: reports.filter(r => r.qualityTier === 'stale').length,
      reports,
    });
  });

  // ── Research notes ──────────────────────────────────────
  fastify.get('/research', async () => {
    const researchRoot = path.join(SKILLS_ROOT, '_research');
    try { await fsp.mkdir(researchRoot, { recursive: true }); } catch { /* ignore */ }
    const notesPath = path.join(researchRoot, 'top-repositories.md');
    let notes = '';
    try { notes = await fsp.readFile(notesPath, 'utf8'); } catch { notes = ''; }
    return ok({ notes });
  });

  // ── Evolution Proposals ──────────────────────────────────

  // GET /proposals — list proposals with optional status/persona_id filters
  fastify.get('/proposals', async (req) => {
    const { status, persona_id } = req.query as { status?: string; persona_id?: string };
    let sql = `
      SELECT sep.*,
             p.name AS persona_name,
             s.name AS skill_name,
             s.description AS skill_description
      FROM skill_evolution_proposals sep
      LEFT JOIN personas p ON p.id = sep.persona_id
      LEFT JOIN skills s ON s.id = sep.skill_id
    `;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (status) { conditions.push(`sep.status = $${params.length + 1}`); params.push(status); }
    if (persona_id) { conditions.push(`sep.persona_id = $${params.length + 1}`); params.push(persona_id); }
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ` ORDER BY sep.created_at DESC LIMIT 100`;
    const rows = await queryAll(sql, params);
    return ok({ proposals: rows });
  });

  // POST /proposals/:proposalId/approve — apply change, regen SKILLS.md, log event
  fastify.post('/proposals/:proposalId/approve', async (req, reply) => {
    const { proposalId } = req.params as { proposalId: string };
    const proposal = await queryOne<{
      id: string; persona_id: string; skill_id: string; change_type: string;
      proposed_change: Record<string, unknown>; reasoning: string;
      triggering_feedback_ids: string[]; status: string;
    }>(`SELECT * FROM skill_evolution_proposals WHERE id = $1 AND status = 'pending'`, [proposalId]);
    if (!proposal) {
      reply.status(404);
      return err('NOT_FOUND', 'Proposal not found or already reviewed');
    }

    // Capture effectiveness_before from persona_skills
    const psRow = await queryOne<{ effectiveness_score: number | null }>(
      `SELECT effectiveness_score FROM persona_skills
       WHERE persona_id = $1 AND (skill_id = $2 OR skill_name = $2)`,
      [proposal.persona_id, proposal.skill_id]
    );
    const effectivenessBefore = psRow?.effectiveness_score ?? null;

    // Apply change based on change_type
    if (proposal.change_type === 'remove_skill') {
      await execute(
        `DELETE FROM persona_skills WHERE persona_id = $1 AND (skill_id = $2 OR skill_name = $2)`,
        [proposal.persona_id, proposal.skill_id]
      );
    } else if (proposal.change_type === 'add_skill') {
      await execute(
        `INSERT INTO persona_skills (persona_id, skill_id, skill_name, enabled)
         VALUES ($1, $2, $2, 1)
         ON CONFLICT (persona_id, skill_id) DO NOTHING`,
        [proposal.persona_id, proposal.skill_id]
      );
    }
    // rewrite_prompt and enrich_examples are flagged for manual follow-up — no persona_skills mutation

    // Regenerate SKILLS.md for this persona
    const personaRow = await queryOne<{ name: string }>('SELECT name FROM personas WHERE id = $1', [proposal.persona_id]);
    if (personaRow) {
      try { await writeSkillsManifest(proposal.persona_id, personaRow.name); } catch (e) {
        console.error('Failed to regenerate SKILLS.md after proposal approve:', e);
      }
    }

    // Log evolution event
    const eventId = crypto.randomUUID();
    await execute(
      `INSERT INTO skill_evolution_events
         (id, persona_id, skill_id, proposal_id, change_type, change_detail,
          triggered_by, effectiveness_before, effectiveness_after, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, EXTRACT(EPOCH FROM NOW()))`,
      [
        eventId,
        proposal.persona_id,
        proposal.skill_id,
        proposal.id,
        proposal.change_type,
        JSON.stringify(proposal.proposed_change),
        JSON.stringify(proposal.triggering_feedback_ids ?? []),
        effectivenessBefore,
      ]
    );

    // Mark proposal approved
    const reviewer = (req as any).user?.username ?? 'admin';
    await execute(
      `UPDATE skill_evolution_proposals
       SET status = 'approved', reviewed_at = EXTRACT(EPOCH FROM NOW()), reviewed_by = $2
       WHERE id = $1`,
      [proposalId, reviewer]
    );

    return ok({ approved: true, proposal_id: proposalId });
  });

  // POST /proposals/:proposalId/reject — mark rejected, log rejection event
  fastify.post('/proposals/:proposalId/reject', async (req, reply) => {
    const { proposalId } = req.params as { proposalId: string };
    const body = (req.body ?? {}) as { reason?: string };
    const proposal = await queryOne<{
      id: string; persona_id: string; skill_id: string; change_type: string;
      proposed_change: Record<string, unknown>; reasoning: string;
      triggering_feedback_ids: string[]; status: string;
    }>(`SELECT * FROM skill_evolution_proposals WHERE id = $1 AND status = 'pending'`, [proposalId]);
    if (!proposal) {
      reply.status(404);
      return err('NOT_FOUND', 'Proposal not found or already reviewed');
    }

    const reviewer = (req as any).user?.username ?? 'admin';
    await execute(
      `UPDATE skill_evolution_proposals
       SET status = 'rejected', reviewed_at = EXTRACT(EPOCH FROM NOW()), reviewed_by = $2
       WHERE id = $1`,
      [proposalId, reviewer]
    );

    // Log rejection event
    const eventId = crypto.randomUUID();
    await execute(
      `INSERT INTO skill_evolution_events
         (id, persona_id, skill_id, proposal_id, change_type, change_detail,
          triggered_by, effectiveness_before, effectiveness_after, created_at)
       VALUES ($1, $2, $3, $4, 'rejected', $5, $6, NULL, NULL, EXTRACT(EPOCH FROM NOW()))`,
      [
        eventId,
        proposal.persona_id,
        proposal.skill_id,
        proposal.id,
        JSON.stringify({ original_proposal: proposal.proposed_change, rejection_reason: body.reason ?? null }),
        JSON.stringify(proposal.triggering_feedback_ids ?? []),
      ]
    );

    return ok({ rejected: true, proposal_id: proposalId });
  });

  // GET /proposals/:proposalId — single proposal with full detail
  fastify.get('/proposals/:proposalId', async (req, reply) => {
    const { proposalId } = req.params as { proposalId: string };
    const row = await queryOne(
      `SELECT sep.*,
              p.name AS persona_name,
              s.name AS skill_name,
              s.description AS skill_description
       FROM skill_evolution_proposals sep
       LEFT JOIN personas p ON p.id = sep.persona_id
       LEFT JOIN skills s ON s.id = sep.skill_id
       WHERE sep.id = $1`,
      [proposalId]
    );
    if (!row) { reply.status(404); return err('NOT_FOUND', 'Proposal not found'); }
    return ok({ proposal: row });
  });

  // ── Skill pack file read/write ───────────────────────────

  // GET /:id/files/* — read a skill pack file from disk
  fastify.get('/:id/files/*', async (req, reply) => {
    const { id, '*': relativePath } = req.params as { id: string; '*': string };
    if (!relativePath) { reply.status(400); return err('INVALID_INPUT', 'file path is required'); }

    const skillDir = path.join(SKILLS_ROOT, id);
    const target = path.resolve(skillDir, relativePath);
    if (!target.startsWith(skillDir + path.sep) && target !== skillDir) {
      reply.status(403); return err('FORBIDDEN', 'Path traversal rejected');
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      reply.status(404); return err('NOT_FOUND', 'File not found');
    }
    try {
      const text = fs.readFileSync(target, 'utf8');
      return ok({ text });
    } catch {
      reply.status(500); return err('READ_ERROR', 'Failed to read file');
    }
  });

  // PUT /:id/files/* — write a skill pack file back to disk
  fastify.put('/:id/files/*', async (req, reply) => {
    const { id, '*': relativePath } = req.params as { id: string; '*': string };
    const { content } = (req.body ?? {}) as { content?: string };

    if (typeof content !== 'string') {
      reply.status(400); return err('INVALID_INPUT', 'content must be a string');
    }
    if (!relativePath) {
      reply.status(400); return err('INVALID_INPUT', 'file path is required');
    }

    const skillDir = path.join(SKILLS_ROOT, id);
    const target = path.resolve(skillDir, relativePath);
    if (!target.startsWith(skillDir + path.sep) && target !== skillDir) {
      reply.status(403); return err('FORBIDDEN', 'Path traversal rejected');
    }

    try {
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, content, 'utf8');
      return ok({ saved: true, path: relativePath });
    } catch (e) {
      reply.status(500); return err('WRITE_ERROR', (e as Error).message);
    }
  });

  // GET /:id/effectiveness — per-skill effectiveness across all agents
  fastify.get('/:id/effectiveness', async (req) => {
    const { id } = req.params as { id: string };
    const rows = await queryAll(
      `SELECT ps.persona_id, p.name AS persona_name,
              COALESCE(ps.times_selected, 0) AS times_selected,
              COALESCE(ps.times_completed, 0) AS times_completed,
              COALESCE(ps.positive_feedback_count, 0) AS positive_count,
              COALESCE(ps.negative_feedback_count, 0) AS negative_count,
              ps.effectiveness_score,
              ps.last_used_at
       FROM persona_skills ps
       LEFT JOIN personas p ON p.id = ps.persona_id
       WHERE COALESCE(ps.skill_id, ps.skill_name) = $1
       ORDER BY ps.effectiveness_score DESC NULLS LAST`,
      [id]
    );
    return ok({ skill_id: id, agents: rows });
  });

  // GET /:id — skill detail with files list and diagnostics
  fastify.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await queryOne<SkillRow & { config_schema: string | null; quality_score: number | null; quality_tier: string | null }>(`
      SELECT s.*,
        COALESCE((SELECT COUNT(*) FROM template_skills ts WHERE ts.skill_id = s.id), 0)::int AS template_count,
        COALESCE((SELECT COUNT(*) FROM persona_skills ps WHERE ps.skill_name = s.id AND ps.enabled = 1), 0)::int AS agent_count,
        COALESCE((SELECT SUM(ps.times_selected) FROM persona_skills ps WHERE ps.skill_name = s.id), 0)::int AS total_uses,
        COALESCE((SELECT AVG(ps.effectiveness_score) FROM persona_skills ps WHERE ps.skill_name = s.id), 0)::float AS avg_effectiveness,
        (SELECT MAX(ps.last_used_at) FROM persona_skills ps WHERE ps.skill_name = s.id) AS last_used
      FROM skills s
      WHERE s.id = $1
    `, [id]);
    if (!row) { reply.status(404); return err('NOT_FOUND', `Skill ${id} not found`); }

    const files = walkSkillDir(path.join(SKILLS_ROOT, row.id));
    const telemetry: TelemetryData = {
      total_uses: row.total_uses || 0,
      avg_effectiveness: row.avg_effectiveness || 0,
      last_used: row.last_used,
    };
    const diagnostics = computePackDiagnostics(row.id, files, telemetry);

    function parseTags(raw: string | null): string[] {
      if (!raw) return [];
      try { return Array.isArray(raw) ? raw : JSON.parse(raw as string); } catch { return []; }
    }

    const skill = {
      id: row.id,
      name: row.name,
      description: row.description || '',
      category: row.category || 'Unknown',
      source: row.source || 'detected',
      enabled: !!row.enabled,
      visible: !!row.visible,
      featured: !!row.featured,
      icon: row.icon || '',
      color: row.color || '',
      short_label: row.short_label || '',
      sort_order: row.sort_order ?? 50,
      featured_order: row.featured_order ?? 0,
      pack_status: row.pack_status || 'missing',
      tags: parseTags(row.tags),
      template_count: row.template_count ?? 0,
      agent_count: row.agent_count ?? 0,
      files,
      diagnostics,
      qualityScore: diagnostics.qualityScore,
      qualityTier: diagnostics.qualityTier,
    };

    return ok({ skill });
  });

  // ── Toggle persona assignment ───────────────────────────
  fastify.put('/:personaId/:skillId/toggle', async (req) => {
    const { personaId, skillId } = req.params as { personaId: string; skillId: string };
    // Support both skill_id and skill_name for backwards compat during transition
    const row = await queryOne<{ enabled: number; skill_name: string }>(
      'SELECT enabled, skill_name FROM persona_skills WHERE persona_id = $1 AND (skill_id = $2 OR skill_name = $2)',
      [personaId, skillId]
    );
    if (!row) return ok({ error: 'not_found' });
    const newEnabled = row.enabled ? 0 : 1;
    await execute(
      'UPDATE persona_skills SET enabled = $1 WHERE persona_id = $2 AND (skill_id = $3 OR skill_name = $3)',
      [newEnabled, personaId, skillId]
    );
    // Regenerate SKILLS.md (SOT-06)
    const persona = await queryOne<{ name: string }>('SELECT name FROM personas WHERE id = $1', [personaId]);
    if (persona) {
      try { await writeSkillsManifest(personaId, persona.name); } catch (e) {
        console.error('Failed to regenerate SKILLS.md:', e);
      }
    }
    return ok({ personaId, skillId, enabled: !!newEnabled });
  });

  // ── Pack generation proxy (to admin backend) ────────────
  fastify.post('/builder/generate', async (req) => {
    const result = await proxyToAdmin('/api/admin/skills/builder/generate', {
      method: 'POST',
      body: req.body,
      timeout: 30000,
    });
    if (!result.ok) return ok({ error: result.error });
    return ok(result.data);
  });

  fastify.post('/builder/generate-all', async () => {
    const result = await proxyToAdmin('/api/admin/skills/builder/generate-all', {
      method: 'POST',
      timeout: 120000,
    });
    if (!result.ok) return ok({ error: result.error });
    return ok(result.data);
  });

  // ── Import from external repos (proxy to admin backend) ──

  fastify.post('/import/scan', async (req) => {
    const result = await proxyToAdmin('/api/admin/skills/import/scan', {
      method: 'POST',
      body: req.body,
      timeout: 60000,
    });
    if (!result.ok) return ok({ error: result.error });
    return ok(result.data);
  });

  fastify.post('/import/execute', async (req) => {
    const result = await proxyToAdmin('/api/admin/skills/import/execute', {
      method: 'POST',
      body: req.body,
      timeout: 120000,
    });
    if (!result.ok) return ok({ error: result.error });
    return ok(result.data);
  });
}
