import fs from 'fs';
import path from 'path';
import { FastifyInstance } from 'fastify';
import { ok, err } from '../../lib/admin-envelope.js';
import { queryAll, queryOne, execute } from '../../db/pg-helpers.js';
import { proxyToAdmin } from '../../lib/admin-proxy.js';
import { writeSkillsManifest } from '../../services/skills-manifest.js';

// ── Quality scoring (ported from admin/backend/src/services/skill-library.ts) ──

const SKILLS_ROOT = path.resolve(process.env.PORTER_SKILLS_DIR || '/home/lobster/projects/porter/skills');

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
      results.push({ path: relative, kind });
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
