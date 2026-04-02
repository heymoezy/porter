import fs from 'fs';
import path from 'path';
import { queryAll, queryOne } from '../db/pg.js';

const SKILLS_ROOT = path.resolve(process.env.PORTER_SKILLS_DIR || '/home/lobster/documents/porter/skills');
const BUILDER_ROOT = path.join(SKILLS_ROOT, '_builder');
const RESEARCH_ROOT = path.join(SKILLS_ROOT, '_research');

const EXPECTED_PACK_FILES = ['SKILL.md', 'prompt.md', 'guides/qa-checklist.md', 'examples/README.md', 'meta/skill.json'];

const SCAFFOLD_PHRASES = [
  'none yet',
  '- none',
  'Operate as ',
  'Porter-specific notes',
  'Add examples',
  'TODO',
  'TBD',
  'placeholder',
  'When a project requires',
  'When Porter delegates work',
  'When specialized',
];

const SCAFFOLD_WORD_THRESHOLD = 300;
const BASELINE_WORD_THRESHOLD = 600;
const PRODUCTION_WORD_THRESHOLD = 1200;

export interface SkillAgentAssignment {
  id: string;
  name: string;
  role: string;
  enabled: boolean;
}

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  source: string;
  enabled: boolean;
  visible: boolean;
  featured: boolean;
  icon: string;
  color: string;
  cover_image: string;
  short_label: string;
  sort_order: number;
  featured_order: number;
  config_schema: Record<string, unknown>;
  agent_count: number;
  template_count: number;
  agents: SkillAgentAssignment[];
  files: SkillFileSummary[];
  packStatus: 'ready' | 'partial' | 'missing';
  hasPrompt: boolean;
  hasExamples: boolean;
  hasChecklist: boolean;
  hasMetadata: boolean;
  qualityTier?: QualityTier;
  diagnostics?: PackDiagnostics;
}

export interface SkillFileSummary {
  path: string;
  name: string;
  ext: string;
  size: number;
  kind: 'skill' | 'guide' | 'json' | 'example' | 'script' | 'other';
}

export interface SkillLibrarySummary {
  totalSkills: number;
  visibleSkills: number;
  featuredSkills: number;
  assignedSkills: number;
  totalAssignments: number;
  totalTemplatesUsingSkills: number;
  totalFiles: number;
  categories: Record<string, number>;
  sources: Record<string, number>;
  status: {
    ready: number;
    partial: number;
    missing: number;
  };
  tiers: {
    scaffold: number;
    baseline: number;
    production: number;
    'high-performing': number;
  };
}

export interface SkillBuilderBlueprint {
  id: string;
  name: string;
  description: string;
  category: string;
  source: string;
  prompt: string;
  triggers: string[];
  inputs: Array<{ key: string; label: string; type: string; required: boolean; help: string }>;
  outputs: string[];
  checks: string[];
  examples: Array<{ title: string; user: string; assistant: string }>;
  tools: string[];
  related_repositories: Array<{ name: string; url: string; note: string }>;
}

export type QualityTier = 'scaffold' | 'baseline' | 'production' | 'high-performing';

export interface PackDiagnostics {
  fileCount: number;
  nonEmptyCount: number;
  totalWords: number;
  scaffoldPhraseMatches: number;
  scaffoldPct: number;
  missingFiles: string[];
  emptyFiles: string[];
  qualityTier: QualityTier;
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeReadText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function detectKind(name: string): SkillFileSummary['kind'] {
  const lower = name.toLowerCase();
  if (lower === 'skill.md') return 'skill';
  if (lower.endsWith('.guide.md') || lower.includes('guide')) return 'guide';
  if (lower.endsWith('.example.md') || lower.includes('example')) return 'example';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.sh') || lower.endsWith('.ts') || lower.endsWith('.js') || lower.endsWith('.py')) return 'script';
  return 'other';
}

function getSkillDir(skillId: string): string {
  return path.join(SKILLS_ROOT, skillId);
}

function listSkillFiles(skillId: string): SkillFileSummary[] {
  const dir = getSkillDir(skillId);
  if (!fs.existsSync(dir)) return [];
  return walk(dir)
    .filter(file => fs.statSync(file).isFile())
    .map(file => {
      const stat = fs.statSync(file);
      const relative = path.relative(dir, file);
      return {
        path: relative,
        name: path.basename(file),
        ext: path.extname(file).replace('.', ''),
        size: stat.size,
        kind: detectKind(path.basename(file)),
      } satisfies SkillFileSummary;
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function evaluatePackStatus(files: SkillFileSummary[]) {
  const names = new Set(files.map(f => f.path.toLowerCase()));
  const hasSkill = names.has('skill.md');
  const hasMetadata = names.has('meta/skill.json');
  const hasPrompt = names.has('prompt.md') || names.has('guides/prompting.md');
  const hasExamples = Array.from(names).some(name => name.startsWith('examples/'));
  const hasChecklist = names.has('guides/qa-checklist.md');
  const complete = hasSkill && hasMetadata && hasPrompt && hasExamples && hasChecklist;
  const any = hasSkill || hasMetadata || hasPrompt || hasExamples || hasChecklist;
  return {
    packStatus: complete ? 'ready' : any ? 'partial' : 'missing',
    hasPrompt,
    hasExamples,
    hasChecklist,
    hasMetadata,
  } as const;
}

export function computePackDiagnostics(skillId: string, files: SkillFileSummary[]): PackDiagnostics {
  const dir = getSkillDir(skillId);
  const presentPaths = new Set(files.map(f => f.path));
  const missingFiles = EXPECTED_PACK_FILES.filter(p => !presentPaths.has(p));
  const emptyFiles: string[] = [];
  let totalWords = 0;
  let scaffoldPhraseMatches = 0;

  for (const file of files) {
    const fullPath = path.join(dir, file.path);
    const text = safeReadText(fullPath);
    if (!text.trim()) { emptyFiles.push(file.path); continue; }
    totalWords += text.split(/\s+/).filter(Boolean).length;
    for (const phrase of SCAFFOLD_PHRASES) {
      if (text.includes(phrase)) scaffoldPhraseMatches++;
    }
  }

  const scaffoldPct = files.length > 0
    ? Math.round((scaffoldPhraseMatches / (files.length * SCAFFOLD_PHRASES.length)) * 100)
    : 100;

  let qualityTier: QualityTier = 'scaffold';
  if (missingFiles.length === 0 && emptyFiles.length === 0) {
    if (totalWords >= PRODUCTION_WORD_THRESHOLD && scaffoldPhraseMatches <= 2) qualityTier = 'high-performing';
    else if (totalWords >= BASELINE_WORD_THRESHOLD && scaffoldPhraseMatches <= 4) qualityTier = 'production';
    else if (totalWords >= SCAFFOLD_WORD_THRESHOLD) qualityTier = 'baseline';
  }

  return {
    fileCount: files.length,
    nonEmptyCount: files.length - emptyFiles.length,
    totalWords,
    scaffoldPhraseMatches,
    scaffoldPct,
    missingFiles,
    emptyFiles,
    qualityTier,
  };
}

export function writeSkillPackFile(skillId: string, relativePath: string, content: string): boolean {
  const base = path.resolve(getSkillDir(skillId));
  const target = path.resolve(base, relativePath);
  if (!target.startsWith(base + path.sep) && target !== base) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return true;
}

export async function getSkillLibrary() {
  ensureDir(SKILLS_ROOT);

  const rows = await queryAll<any>(`
    SELECT s.*,
      COALESCE((SELECT COUNT(*) FROM template_skills ts WHERE ts.skill_id = s.id), 0)::int AS template_count,
      COALESCE((SELECT COUNT(*) FROM persona_skills ps WHERE ps.skill_name = s.id AND ps.enabled = 1), 0)::int AS agent_count
    FROM skills s
    ORDER BY s.featured DESC, s.featured_order, s.sort_order, s.name
  `);

  const assignments = await queryAll<any>(`
    SELECT ps.skill_name, ps.persona_id, ps.enabled, p.name, p.role
    FROM persona_skills ps
    LEFT JOIN personas p ON p.id = ps.persona_id
    ORDER BY ps.skill_name, p.name
  `);

  const bySkill = new Map<string, SkillAgentAssignment[]>();
  for (const row of assignments) {
    const list = bySkill.get(row.skill_name) ?? [];
    list.push({
      id: row.persona_id,
      name: row.name || row.persona_id,
      role: row.role || '',
      enabled: !!row.enabled,
    });
    bySkill.set(row.skill_name, list);
  }

  const skills: SkillRecord[] = rows.map((row: any) => {
    const files = listSkillFiles(row.id);
    const status = evaluatePackStatus(files);
    // Fast quality tier for list view: use file size sum as proxy for word count
    const totalSize = files.reduce((s, f) => s + f.size, 0);
    const presentPaths = new Set(files.map(f => f.path));
    const hasMissing = EXPECTED_PACK_FILES.some(p => !presentPaths.has(p));
    const hasEmpty = files.some(f => f.size === 0);
    let qualityTier: QualityTier = 'scaffold';
    if (!hasMissing && !hasEmpty) {
      if (totalSize >= 4000) qualityTier = 'high-performing';
      else if (totalSize >= 2000) qualityTier = 'production';
      else if (totalSize >= 1000) qualityTier = 'baseline';
    }
    return {
      ...row,
      enabled: !!row.enabled,
      visible: !!row.visible,
      featured: !!row.featured,
      config_schema: row.config_schema || {},
      agent_count: row.agent_count || 0,
      template_count: row.template_count || 0,
      agents: bySkill.get(row.id) ?? [],
      files,
      ...status,
      qualityTier,
    } satisfies SkillRecord;
  });

  const summary: SkillLibrarySummary = {
    totalSkills: skills.length,
    visibleSkills: skills.filter(s => s.visible).length,
    featuredSkills: skills.filter(s => s.featured).length,
    assignedSkills: skills.filter(s => s.agent_count > 0).length,
    totalAssignments: assignments.length,
    totalTemplatesUsingSkills: skills.reduce((sum, s) => sum + s.template_count, 0),
    totalFiles: skills.reduce((sum, s) => sum + s.files.length, 0),
    categories: {},
    sources: {},
    status: { ready: 0, partial: 0, missing: 0 },
    tiers: { scaffold: 0, baseline: 0, production: 0, 'high-performing': 0 },
  };

  for (const skill of skills) {
    summary.categories[skill.category] = (summary.categories[skill.category] || 0) + 1;
    summary.sources[skill.source] = (summary.sources[skill.source] || 0) + 1;
    summary.status[skill.packStatus]++;
    if (skill.qualityTier) summary.tiers[skill.qualityTier]++;
  }

  return { skills, summary, roots: { skills: SKILLS_ROOT, builder: BUILDER_ROOT, research: RESEARCH_ROOT } };
}

export async function getSkillDetail(skillId: string) {
  const row = await queryOne<any>(`
    SELECT s.*,
      COALESCE((SELECT COUNT(*) FROM template_skills ts WHERE ts.skill_id = s.id), 0)::int AS template_count,
      COALESCE((SELECT COUNT(*) FROM persona_skills ps WHERE ps.skill_name = s.id AND ps.enabled = 1), 0)::int AS agent_count
    FROM skills s
    WHERE s.id = $1
  `, [skillId]);

  if (!row) return null;

  const library = await getSkillLibrary();
  const skill = library.skills.find(s => s.id === skillId) ?? null;
  if (!skill) return null;
  const diagnostics = computePackDiagnostics(skillId, skill.files);
  return { ...skill, qualityTier: diagnostics.qualityTier, diagnostics };
}

export function ensureSkillPack(blueprint: SkillBuilderBlueprint) {
  ensureDir(SKILLS_ROOT);
  ensureDir(BUILDER_ROOT);
  ensureDir(RESEARCH_ROOT);

  const dir = getSkillDir(blueprint.id);
  const metaDir = path.join(dir, 'meta');
  const guidesDir = path.join(dir, 'guides');
  const examplesDir = path.join(dir, 'examples');
  const assetsDir = path.join(dir, 'assets');

  ensureDir(metaDir);
  ensureDir(guidesDir);
  ensureDir(examplesDir);
  ensureDir(assetsDir);

  const triggerLine = blueprint.triggers.length ? blueprint.triggers.map(t => `- ${t}`).join('\n') : '- none yet';
  const inputsBlock = blueprint.inputs.length
    ? blueprint.inputs.map(input => `- \`${input.key}\` (${input.type}${input.required ? ', required' : ''}) — ${input.label}. ${input.help}`.trim()).join('\n')
    : '- none';
  const outputsBlock = blueprint.outputs.length ? blueprint.outputs.map(output => `- ${output}`).join('\n') : '- none';
  const checksBlock = blueprint.checks.length ? blueprint.checks.map(check => `- ${check}`).join('\n') : '- none';
  const toolsBlock = blueprint.tools.length ? blueprint.tools.map(tool => `- ${tool}`).join('\n') : '- none';
  const reposBlock = blueprint.related_repositories.length
    ? blueprint.related_repositories.map(repo => `- [${repo.name}](${repo.url}) — ${repo.note}`).join('\n')
    : '- none';

  const skillMd = `---
name: ${blueprint.name}
description: ${blueprint.description}
category: ${blueprint.category}
source: ${blueprint.source}
---

# ${blueprint.name}

## Purpose
${blueprint.description}

## When to use
${triggerLine}

## Inputs
${inputsBlock}

## Outputs
${outputsBlock}

## Primary workflow
1. Read the user request and restate the goal internally.
2. Gather missing context from Porter data, files, or live APIs.
3. Produce the working artifact, not just advice.
4. Validate with the QA checklist before returning.
5. Persist durable scaffolding if the skill owns reusable assets.

## Guardrails
- Stay inside Porter's architecture.
- Prefer concrete changes over vague suggestions.
- Keep outputs concise, but ship-complete.

## References
- prompt.md
- guides/qa-checklist.md
- examples/
- meta/skill.json
- related repositories:
${reposBlock}
`;

  const promptMd = `# Prompting Guide — ${blueprint.name}

## System intent
${blueprint.prompt}

## Required behaviors
${checksBlock}

## Tool / dependency hints
${toolsBlock}

## Porter-specific notes
- Prefer existing DB state over hardcoded assumptions.
- If this skill creates files, keep them inside the canonical Porter repo structure.
- If UI is involved, optimize for signal density and short copy.
`;

  const qaMd = `# QA Checklist — ${blueprint.name}

${checksBlock}
`;

  const examplesIndex = blueprint.examples.map((example, index) => {
    const filename = `${String(index + 1).padStart(2, '0')}-${example.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
    const content = `# ${example.title}

## User
${example.user}

## Ideal output
${example.assistant}
`;
    fs.writeFileSync(path.join(examplesDir, filename), content, 'utf8');
    return `- ${filename}`;
  }).join('\n') || '- none';

  const metaJson = {
    id: blueprint.id,
    name: blueprint.name,
    description: blueprint.description,
    category: blueprint.category,
    source: blueprint.source,
    triggers: blueprint.triggers,
    inputs: blueprint.inputs,
    outputs: blueprint.outputs,
    checks: blueprint.checks,
    tools: blueprint.tools,
    related_repositories: blueprint.related_repositories,
    generated_at: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(dir, 'SKILL.md'), skillMd, 'utf8');
  fs.writeFileSync(path.join(dir, 'prompt.md'), promptMd, 'utf8');
  fs.writeFileSync(path.join(guidesDir, 'qa-checklist.md'), qaMd, 'utf8');
  fs.writeFileSync(path.join(examplesDir, 'README.md'), `# Examples\n\n${examplesIndex}\n`, 'utf8');
  fs.writeFileSync(path.join(metaDir, 'skill.json'), JSON.stringify(metaJson, null, 2), 'utf8');

  return { dir, files: listSkillFiles(blueprint.id) };
}

export function getSkillPackText(skillId: string, relativePath: string) {
  const base = getSkillDir(skillId);
  const target = path.resolve(base, relativePath);
  if (!target.startsWith(base)) return null;
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
  return safeReadText(target);
}

export function getResearchNotes() {
  ensureDir(RESEARCH_ROOT);
  const notesPath = path.join(RESEARCH_ROOT, 'top-repositories.md');
  return safeReadText(notesPath);
}
