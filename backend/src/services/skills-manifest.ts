import { pool } from '../db/client.js';
import path from 'path';
import fs from 'fs/promises';

interface SkillManifestEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  packPath: string;
  enabled: boolean;
}

/**
 * Generate SKILLS.md manifest for a persona from their persona_skills + skills registry.
 * Writes a thin manifest file -- no prose, just IDs, descriptions, and pack paths.
 */
export async function generateSkillsManifest(personaId: string, personaName: string): Promise<string> {
  const rows = (await pool.query(`
    SELECT ps.skill_id, ps.enabled, s.name, s.description, s.category
    FROM persona_skills ps
    JOIN skills s ON s.id = ps.skill_id
    WHERE ps.persona_id = $1 AND ps.skill_id IS NOT NULL
    ORDER BY s.category, s.name
  `, [personaId])).rows as Array<{
    skill_id: string; enabled: number; name: string; description: string; category: string;
  }>;

  const entries: SkillManifestEntry[] = rows.map(r => ({
    id: r.skill_id,
    name: r.name,
    description: r.description || '',
    category: r.category,
    packPath: `skills/${r.skill_id}/`,
    enabled: r.enabled === 1,
  }));

  const now = new Date().toISOString();
  const activeEntries = entries.filter(e => e.enabled);
  const disabledEntries = entries.filter(e => !e.enabled);

  let md = `# SKILLS -- ${personaName}\n\n`;
  md += `> Auto-generated manifest. Do not edit manually.\n`;
  md += `> Source: persona_skills table | Generated: ${now}\n\n`;

  if (activeEntries.length === 0) {
    md += `## Active Skills (0)\n\n_(no skills assigned)_\n`;
  } else {
    md += `## Active Skills (${activeEntries.length})\n\n`;
    // Group by category
    const byCategory = new Map<string, SkillManifestEntry[]>();
    for (const e of activeEntries) {
      const cat = e.category || 'uncategorized';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(e);
    }
    for (const [cat, skills] of byCategory) {
      md += `### ${cat}\n\n`;
      for (const s of skills) {
        md += `- **${s.id}** -- ${s.name}${s.description ? `: ${s.description.slice(0, 120)}` : ''}\n`;
        md += `  Pack: \`${s.packPath}\`\n`;
      }
      md += `\n`;
    }
  }

  if (disabledEntries.length > 0) {
    md += `## Disabled Skills (${disabledEntries.length})\n\n`;
    for (const s of disabledEntries) {
      md += `- ~~${s.id}~~ -- ${s.name}\n`;
    }
    md += `\n`;
  }

  md += `_Last regenerated: ${now}_\n`;
  return md;
}

/**
 * Write the SKILLS.md manifest to the persona's directory on disk.
 */
export async function writeSkillsManifest(personaId: string, personaName: string): Promise<void> {
  const personaDir = path.join(process.env.HOME!, 'documents/porter/personas', personaId);
  const content = await generateSkillsManifest(personaId, personaName);
  await fs.mkdir(personaDir, { recursive: true });
  await fs.writeFile(path.join(personaDir, 'SKILLS.md'), content, 'utf-8');
}
