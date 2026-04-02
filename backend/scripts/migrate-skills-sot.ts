import { pool } from '../src/db/client.js';

async function main() {
  console.log('=== SOT Migration: Skills Source of Truth ===\n');

  // Step 1: DDL — ensure skill_id column exists
  await pool.query('ALTER TABLE persona_skills ADD COLUMN IF NOT EXISTS skill_id TEXT');
  console.log('[Step 1] DDL applied: persona_skills.skill_id ensured');

  // Step 2: Populate template_skills from agent_templates.skills JSONB
  const templates = (await pool.query('SELECT id, skills FROM agent_templates')).rows;
  const allSkills = (await pool.query('SELECT id FROM skills')).rows.map((r: { id: string }) => r.id);
  const skillSet = new Set(allSkills);

  let tsCreated = 0;
  const unmatched: string[] = [];

  for (const t of templates) {
    const tags: string[] = typeof t.skills === 'string' ? JSON.parse(t.skills) : (t.skills ?? []);
    let sortIdx = 0;
    for (const tag of tags) {
      // Exact match
      if (skillSet.has(tag)) {
        const res = await pool.query(
          'INSERT INTO template_skills (template_id, skill_id, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [t.id, tag, sortIdx++]
        );
        if (res.rowCount && res.rowCount > 0) tsCreated++;
        continue;
      }
      // Fuzzy: find skills.id containing the tag
      const fuzzy = (await pool.query(
        "SELECT id FROM skills WHERE id LIKE '%' || $1 || '%' LIMIT 1",
        [tag]
      )).rows[0];
      if (fuzzy) {
        const res = await pool.query(
          'INSERT INTO template_skills (template_id, skill_id, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [t.id, fuzzy.id, sortIdx++]
        );
        if (res.rowCount && res.rowCount > 0) tsCreated++;
      } else {
        unmatched.push(`${t.id}: ${tag}`);
      }
    }
  }

  console.log(`[Step 2] template_skills population complete`);

  // Step 3: Migrate persona_skills.skill_id for existing rows
  const ps = (await pool.query('SELECT persona_id, skill_name FROM persona_skills WHERE skill_id IS NULL')).rows;
  let psMigrated = 0;
  const psUnmatched: string[] = [];

  for (const row of ps) {
    // Exact match
    if (skillSet.has(row.skill_name)) {
      await pool.query(
        'UPDATE persona_skills SET skill_id = $1 WHERE persona_id = $2 AND skill_name = $3',
        [row.skill_name, row.persona_id, row.skill_name]
      );
      psMigrated++;
      continue;
    }
    // Fuzzy match
    const fuzzy = (await pool.query(
      "SELECT id FROM skills WHERE id LIKE '%' || $1 || '%' LIMIT 1",
      [row.skill_name]
    )).rows[0];
    if (fuzzy) {
      await pool.query(
        'UPDATE persona_skills SET skill_id = $1 WHERE persona_id = $2 AND skill_name = $3',
        [fuzzy.id, row.persona_id, row.skill_name]
      );
      psMigrated++;
    } else {
      psUnmatched.push(`${row.persona_id}: ${row.skill_name}`);
    }
  }

  console.log(`[Step 3] persona_skills migration complete`);

  // Step 4: Report
  console.log(`\n=== Migration Report ===`);
  console.log(`Templates processed: ${templates.length}`);
  console.log(`template_skills rows created: ${tsCreated}`);
  console.log(`Unmatched JSONB tags: ${unmatched.length}`);
  if (unmatched.length > 0) {
    console.log(`  ${unmatched.slice(0, 20).join('\n  ')}${unmatched.length > 20 ? `\n  ... and ${unmatched.length - 20} more` : ''}`);
  }
  console.log(`persona_skills migrated: ${psMigrated}/${ps.length + psMigrated}`);
  if (psUnmatched.length > 0) {
    console.log(`Unmatched persona_skills: ${psUnmatched.join(', ')}`);
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
