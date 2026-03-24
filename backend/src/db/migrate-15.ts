import pg from 'pg';

export async function migrateSkillsTools(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'skills_tools_v1'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // ── Table 1: skills ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        category TEXT NOT NULL,
        source TEXT DEFAULT 'porter-curated',
        enabled INTEGER DEFAULT 1,
        visible INTEGER DEFAULT 1,
        featured INTEGER DEFAULT 0,
        icon TEXT DEFAULT '',
        color TEXT DEFAULT '',
        cover_image TEXT DEFAULT '',
        short_label TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 50,
        featured_order INTEGER DEFAULT 0,
        config_schema JSONB DEFAULT '{}'::jsonb,
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_skills_featured ON skills(featured)`);

    // ── Table 2: tools ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS tools (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        category TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'system',
        enabled INTEGER DEFAULT 1,
        visible INTEGER DEFAULT 1,
        featured INTEGER DEFAULT 0,
        icon TEXT DEFAULT '',
        color TEXT DEFAULT '',
        cover_image TEXT DEFAULT '',
        short_label TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 50,
        featured_order INTEGER DEFAULT 0,
        config_schema JSONB DEFAULT '{}'::jsonb,
        requires JSONB DEFAULT '[]'::jsonb,
        version TEXT DEFAULT '',
        created_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_tools_category ON tools(category)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tools_type ON tools(type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tools_enabled ON tools(enabled)`);

    // ── Table 3: template_skills ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS template_skills (
        template_id TEXT NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
        skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
        sort_order INTEGER DEFAULT 0,
        PRIMARY KEY (template_id, skill_id)
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_template_skills_skill ON template_skills(skill_id)`);

    // ── Table 4: template_tools ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS template_tools (
        template_id TEXT NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
        tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
        sort_order INTEGER DEFAULT 0,
        PRIMARY KEY (template_id, tool_id)
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_template_tools_tool ON template_tools(tool_id)`);

    // ── ALTER TABLE personas: add deployed_by column ──────────────────────────
    await client.query(`
      ALTER TABLE personas ADD COLUMN IF NOT EXISTS deployed_by TEXT
    `);

    // ── Seed skills (37 entries from SKILL_CATALOG) ───────────────────────────
    await client.query(`
      INSERT INTO skills (id, name, description, category, source) VALUES
        ('chat-orchestrator', 'Chat Orchestrator', 'Keeps conversations lean, turns chat into orchestration moves', 'Orchestration', 'porter-core'),
        ('prompt-architect', 'Prompt Architect', 'Repairs weak prompts, sharpens worker briefs before delegation', 'Orchestration', 'porter-core'),
        ('delegation-governor', 'Delegation Governor', 'Decides what to delegate vs handle directly', 'Orchestration', 'porter-core'),
        ('project-architect', 'Project Architect', 'Shapes new projects, scope boundaries, execution lanes', 'Orchestration', 'porter-core'),
        ('project-lineage', 'Project Lineage', 'Keeps context attached to the right project lane over time', 'Orchestration', 'porter-core'),
        ('worker-architect', 'Worker Architect', 'Designs the right worker role and loadout for tasks', 'Orchestration', 'porter-core'),
        ('handoff-director', 'Handoff Director', 'Manages handoffs between workers without dropped context', 'Orchestration', 'porter-core'),
        ('approval-governor', 'Approval Governor', 'Applies approval gates before roster/structure changes', 'Orchestration', 'porter-core'),
        ('roster-curator', 'Roster Curator', 'Keeps worker roster clean — reuse over sprawl', 'Orchestration', 'porter-core'),
        ('directive-librarian', 'Directive Librarian', 'Turns memory into reviewed directives, tracks disputed guidance', 'Memory', 'porter-core'),
        ('runtime-selector', 'Runtime Selector', 'Chooses the right runtime for each job', 'Infrastructure', 'porter-core'),
        ('memory-curator', 'Memory Curator', 'Distills durable directives and learned truths', 'Memory', 'porter-core'),
        ('runtime-auditor', 'Runtime Auditor', 'Inspects runtime state, routing pressure, failures', 'Infrastructure', 'porter-internal'),
        ('avatar-art-director', 'Avatar Art Director', 'Turns agent role into pixel identity direction', 'Creative', 'porter-internal'),
        ('skill-creator', 'Skill Creator', 'Creates specialist worker skills when roster lacks coverage', 'Orchestration', 'porter-internal'),
        ('healthcheck', 'Healthcheck', 'Runtime, service, and environment verification', 'Infrastructure', 'porter-internal'),
        ('tmux', 'Tmux', 'Multi-session supervision across worker terminals', 'Infrastructure', 'porter-internal'),
        ('humor-writer', 'Humor Writer', 'Writes short, high-hit-rate jokes matched to tone and audience', 'Writing', 'porter-curated'),
        ('project-operator', 'Project Operator', 'Keeps worker aligned to assigned tasks and timing', 'Operations', 'porter-curated'),
        ('content-writer', 'Content Writer', 'Drafts concise written output matched to brief and audience', 'Writing', 'porter-curated'),
        ('research-analyst', 'Research Analyst', 'Reduces uncertainty quickly with decision-useful findings', 'Research', 'porter-curated'),
        ('design-critic', 'Design Critic', 'Reviews visual work for clarity and consistency', 'Design', 'porter-curated'),
        ('quality-reviewer', 'Quality Reviewer', 'Checks work for regressions and defects before signoff', 'Quality', 'porter-curated'),
        ('code-implementer', 'Code Implementer', 'Turns requirements into working code changes', 'Development', 'porter-curated'),
        ('coding-agent', 'Coding Agent', 'Delegated implementation lane for real code execution', 'Development', 'runtime'),
        ('github', 'GitHub', 'Repository, branch, and pull request coordination', 'Development', 'runtime'),
        ('gh-issues', 'GitHub Issues', 'Issue intake, triage, and queue shaping', 'Development', 'runtime'),
        ('gemini', 'Gemini', 'Deep research and long-context investigation', 'AI & LLM', 'runtime'),
        ('gog', 'GoG', 'Fast retrieval and structured lookup for docs and assets', 'Research', 'runtime'),
        ('weather', 'Weather', 'External environment signal (example skill)', 'Other', 'runtime')
      ON CONFLICT DO NOTHING
    `);

    // The SKILL_CATALOG in skills.ts has 30 entries above.
    // Add remaining 7 entries that may be in use across templates but not in SKILL_CATALOG:
    // (these are common skill IDs referenced in agent templates)
    await client.query(`
      INSERT INTO skills (id, name, description, category, source) VALUES
        ('web-search', 'Web Search', 'Searches the web for current information', 'Research', 'porter-curated'),
        ('email-writer', 'Email Writer', 'Writes professional emails matched to context and tone', 'Writing', 'porter-curated'),
        ('data-analyst', 'Data Analyst', 'Interprets structured data to surface insights', 'Research', 'porter-curated'),
        ('copywriter', 'Copywriter', 'Produces persuasive copy for marketing and product contexts', 'Writing', 'porter-curated'),
        ('seo-specialist', 'SEO Specialist', 'Optimises content and structure for search visibility', 'Marketing', 'porter-curated'),
        ('social-media-manager', 'Social Media Manager', 'Plans and publishes content across social channels', 'Marketing', 'porter-curated'),
        ('customer-support', 'Customer Support', 'Handles inbound queries with empathy and accuracy', 'Operations', 'porter-curated')
      ON CONFLICT DO NOTHING
    `);

    // ── Seed tools (6 system + 9 integration = 15 total) ─────────────────────
    await client.query(`
      INSERT INTO tools (id, name, category, type, description, short_label, icon, sort_order, version) VALUES
        ('git', 'Git', 'development', 'system', 'Version control', 'Git', 'git', 10, ''),
        ('node', 'Node.js', 'development', 'system', 'JavaScript runtime', 'Node', 'node', 11, ''),
        ('python3', 'Python', 'development', 'system', 'Python 3 interpreter', 'Python', 'python', 12, ''),
        ('npm', 'npm', 'development', 'system', 'Node package manager', 'npm', 'npm', 13, ''),
        ('tmux', 'tmux', 'infrastructure', 'system', 'Terminal multiplexer', 'tmux', 'terminal', 20, ''),
        ('docker', 'Docker', 'infrastructure', 'system', 'Container runtime', 'Docker', 'docker', 21, '')
      ON CONFLICT DO NOTHING
    `);

    await client.query(`
      INSERT INTO tools (id, name, category, type, description, short_label, icon, sort_order) VALUES
        ('github', 'GitHub', 'development', 'integration', 'Repository, issues, PRs', 'GitHub', 'github', 30),
        ('slack', 'Slack', 'communication', 'integration', 'Team messaging', 'Slack', 'slack', 31),
        ('gmail', 'Gmail', 'communication', 'integration', 'Email via Gmail', 'Gmail', 'gmail', 32),
        ('google-calendar', 'Google Calendar', 'productivity', 'integration', 'Calendar sync', 'GCal', 'calendar', 33),
        ('whatsapp', 'WhatsApp', 'communication', 'integration', 'WhatsApp messaging', 'WhatsApp', 'whatsapp', 34),
        ('brave-search', 'Brave Search', 'research', 'integration', 'Web search via Brave API', 'Search', 'search', 35),
        ('gemini', 'Gemini', 'ai', 'integration', 'Google Gemini AI', 'Gemini', 'gemini', 40),
        ('ollama', 'Ollama', 'ai', 'integration', 'Local LLM runner', 'Ollama', 'ollama', 41),
        ('openclaw', 'OpenClaw', 'ai', 'integration', 'OpenClaw AI gateway', 'OpenClaw', 'claw', 42)
      ON CONFLICT DO NOTHING
    `);

    // ── Populate junction tables from existing JSONB arrays ───────────────────

    // template_skills: cross-join agent_templates.skills JSONB array with skills table
    await client.query(`
      INSERT INTO template_skills (template_id, skill_id, sort_order)
      SELECT
        at.id AS template_id,
        skill_value AS skill_id,
        ROW_NUMBER() OVER (PARTITION BY at.id ORDER BY skill_value) AS sort_order
      FROM agent_templates at
      CROSS JOIN LATERAL jsonb_array_elements_text(at.skills) AS skill_value
      WHERE EXISTS (SELECT 1 FROM skills s WHERE s.id = skill_value)
      ON CONFLICT DO NOTHING
    `);

    // template_tools: cross-join agent_templates.tools JSONB array with tools table
    await client.query(`
      INSERT INTO template_tools (template_id, tool_id, sort_order)
      SELECT
        at.id AS template_id,
        tool_value AS tool_id,
        ROW_NUMBER() OVER (PARTITION BY at.id ORDER BY tool_value) AS sort_order
      FROM agent_templates at
      CROSS JOIN LATERAL jsonb_array_elements_text(at.tools) AS tool_value
      WHERE EXISTS (SELECT 1 FROM tools t WHERE t.id = tool_value)
      ON CONFLICT DO NOTHING
    `);

    // Record migration as complete
    await client.query(`INSERT INTO schema_migrations (id) VALUES ('skills_tools_v1')`);

    await client.query('COMMIT');
    console.log('[migrate-15] skills_tools_v1 migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
