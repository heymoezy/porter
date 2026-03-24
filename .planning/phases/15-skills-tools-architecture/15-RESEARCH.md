# Phase 15: Skills & Tools Architecture - Research

**Researched:** 2026-03-24
**Domain:** PostgreSQL schema design, JSONB-to-relational migration, Drizzle ORM, Fastify CRUD APIs, template-instance lifecycle
**Confidence:** HIGH

## Summary

Phase 15 replaces two flat/hardcoded registries with proper relational tables and CRUD APIs. Currently, skills are a TypeScript constant (`SKILL_CATALOG` in `admin/skills.ts`) and tools are stored in an unrelated `environment_tools` table (porter.py legacy) with no proper registry. Both are referenced as JSONB arrays on `agent_templates.skills` and `agent_templates.tools`. This phase migrates to proper `skills` and `tools` PostgreSQL tables with junction tables (`template_skills`, `template_tools`) replacing the JSONB arrays.

The migration has a clear shape: a new `migrate-15.ts` file (following the `migrate-memv3.ts` pattern) creates the four new tables in a single transaction, seeds the 37 SKILL_CATALOG entries plus a system tools registry, and does NOT touch agent_templates or personas in this phase — the junction tables start populated from the existing JSONB arrays. The admin/skills.ts and admin/tools.ts routes are then rewritten to query the new tables instead of the hardcoded constant and environment_tools respectively.

The template-to-instance lifecycle (deep clone with persona row + .md files) already works in `backend/src/routes/v1/templates.ts`. Phase 15 adds the `deployed_by` field, `is_internal` flag (already exists on agent_templates), and ensures the forge's Station 2 (Trainer) and Station 3 (Outfitter) read from the new junction tables instead of the JSONB arrays.

**Primary recommendation:** One migration file, four tables (`skills`, `tools`, `template_skills`, `template_tools`), full CRUD on both admin routes, forge updated to use junction tables.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Skill Data Model
- Proper `skills` PostgreSQL table — migrate SKILL_CATALOG from hardcoded constant in admin/skills.ts to DB with full CRUD
- Schema: id, name, description, category, source, enabled, visible, featured, icon, color, cover_image, short_label, sort_order, config_schema (JSONB)
- Keep existing 10 categories (Orchestration, Memory, Infrastructure, Creative, Writing, Research, Operations, Quality, Development, AI)
- Junction table `template_skills` replacing the skills JSONB array on agent_templates — proper relational model

#### Tool Data Model
- Proper `tools` PostgreSQL table — unified tool registry replacing legacy environment_tools
- Schema: id, name, description, category, type (system/integration), enabled, visible, featured, icon, color, cover_image, short_label, sort_order, config_schema (JSONB), requires (JSONB), version
- Two types: `system` (infra tools like git, node) and `integration` (external services like GitHub, Slack)
- workspace_connections become "configured instances" of integration-type tools
- Junction table `template_tools` replacing the tools JSONB array on agent_templates — mirrors skill pattern
- API shapes must support rich, visual card-based presentation — not garbage text lists

#### Template-to-Instance Lifecycle
- Deep clone on deploy — instantiation copies all template data into persona row + .md files; instance is fully self-contained
- Templates are fully immutable read-only components — only admins update via admin API
- Instance customization: name, avatar, appearance_spec, config overrides (skills on/off, tool preferences)
- `is_internal` flag on template + `deployed_by` field on persona for Porter-internal vs customer distinction

#### Visibility & Admin Control
- Three-state visibility: `enabled` (functional on/off) + `visible` (UI on/off) + `featured` (highlighted/promoted)
- Rich visual fields: icon (emoji or icon name), color (hex for category tint), cover_image (optional URL), short_label (1-2 words for cards)
- Ordering: sort_order per item + category_order on categories lookup + featured_order for promoted items
- Global (platform-level) scope only for v2 — per-workspace availability is future

### Claude's Discretion
- Migration strategy for existing SKILL_CATALOG → DB table
- Exact API endpoint paths and response shapes
- Index strategy for the new tables
- Seed data for system tools registry

### Deferred Ideas (OUT OF SCOPE)
- Per-workspace skill/tool availability (future phase — v2 is global only)
- Custom user-created tools (third tool type beyond system/integration)
- Skill versioning and changelog
- Tool health monitoring and auto-detection refresh
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pg (node-postgres) | already in use | PostgreSQL pool queries | Established pattern in all migrate-*.ts files |
| drizzle-orm/pg-core | already in use | Schema type definitions | All schema types live in schema.ts |
| zod | already in use | Route input validation | Required by fastify-zod-openapi integration |
| fastify | already in use | Route handlers | All admin routes follow same plugin pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crypto.randomUUID | Node built-in | Generating skill/tool UUIDs | For all new row IDs |
| fs/promises | Node built-in | .md file operations during instantiation | Already used in templates.ts |

**No new dependencies needed.** This phase is entirely internal schema + API work.

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
├── db/
│   ├── migrate-15.ts           # New: skills_tools migration
│   └── schema.ts               # Updated: add 4 new table definitions
├── routes/v1/admin/
│   ├── skills.ts               # Rewritten: queries skills table + template_skills
│   └── tools.ts                # Rewritten: queries tools table + template_tools
└── routes/v1/
    └── templates.ts            # Updated: instantiate reads junction tables
```

### Pattern 1: Migration File (follows migrate-memv3.ts)
**What:** Single-transaction migration with idempotency guard in schema_migrations.
**When to use:** All DDL changes in this project.
**Example (from migrate-memv3.ts):**
```typescript
// Source: backend/src/db/migrate-memv3.ts
const check = await client.query(
  `SELECT 1 FROM schema_migrations WHERE id = 'memory_v3'`
);
if (check.rowCount && check.rowCount > 0) {
  await client.query('COMMIT');
  return;
}
// ... DDL ...
await client.query(`INSERT INTO schema_migrations (id) VALUES ('memory_v3')`);
await client.query('COMMIT');
```
Migration key for this phase: `skills_tools_v1`

### Pattern 2: Drizzle Schema Table Definition (for schema.ts)
**What:** Add table definitions using pgTable. No Drizzle migrations — raw SQL in migrate-*.ts handles DDL.
**When to use:** Every new table must have a corresponding Drizzle type for TypeScript usage.
```typescript
// Source: backend/src/db/schema.ts — existing pattern
export const skills = pgTable('skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').default(''),
  category: text('category').notNull(),
  source: text('source').default('porter-curated'),
  enabled: integer('enabled').default(1),
  visible: integer('visible').default(1),
  featured: integer('featured').default(0),
  icon: text('icon').default(''),
  color: text('color').default(''),
  coverImage: text('cover_image').default(''),
  shortLabel: text('short_label').default(''),
  sortOrder: integer('sort_order').default(50),
  featuredOrder: integer('featured_order').default(0),
  configSchema: jsonb('config_schema').default(sql`'{}'::jsonb`),
  createdAt: doublePrecision('created_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
  updatedAt: doublePrecision('updated_at').default(sql`EXTRACT(EPOCH FROM NOW())`),
});
```

### Pattern 3: Admin Route Plugin (follows admin/skills.ts pattern)
**What:** Fastify plugin registered under `/api/admin/` prefix with platform_admin gate.
**When to use:** All admin CRUD in this phase.
**Key:** Routes are registered in `admin/index.ts` — add new route files there.

### Pattern 4: Junction Table Seed from JSONB Array
**What:** During migration, read the JSONB `skills` and `tools` arrays from all `agent_templates` rows and insert rows into `template_skills` and `template_tools`.
**When to use:** One-time migration in migrate-15.ts.
**Example:**
```sql
-- Read template skills arrays and seed junction table
INSERT INTO template_skills (template_id, skill_id, sort_order)
SELECT
  at.id as template_id,
  s.id as skill_id,
  ROW_NUMBER() OVER (PARTITION BY at.id ORDER BY s.name) as sort_order
FROM agent_templates at
CROSS JOIN LATERAL jsonb_array_elements_text(at.skills) AS skill_name(value)
JOIN skills s ON s.id = skill_name.value
ON CONFLICT DO NOTHING;
```
Note: skills that don't have a matching id in the skills table are silently skipped — this is safe because SKILL_CATALOG is seeded first.

### Pattern 5: ok()/err() Envelope
**What:** All route returns use `ok(data)` or `err(code, message)`.
**Source:** `backend/src/lib/envelope.js`
**Non-negotiable:** Every route handler returns one of these two.

### Anti-Patterns to Avoid
- **Hardcoded SKILL_CATALOG in route file:** The entire point of this phase is to remove this. The route becomes a thin DB query layer.
- **Using Drizzle migrations:** Porter uses raw SQL in migrate-*.ts files. Drizzle push/generate commands are not used.
- **Modifying existing migration files:** Never edit migrate-consolidated.ts or migrate-memv3.ts. Only add new migrate-15.ts.
- **JSONB arrays for relationships:** Do not keep the skills/tools JSONB on agent_templates as the source of truth — junction tables are the source after this phase.
- **Nullable junction FKs:** template_skills.skill_id and template_tools.tool_id must be non-null TEXT referencing the registry tables.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotent migrations | Custom migration state tracking | schema_migrations table pattern (established) | Already working across 2 migration files |
| Input validation | Manual type checking | Zod schemas | Already required for OpenAPI spec generation |
| Pool management | Custom PG connections | pool from db/client.js | Already handles pooling, reconnect, etc. |
| JSON field parsing | Inline JSON.parse | parseJsonField() helper (copy from templates.ts) | Handles null/undefined/already-parsed values |
| UUID generation | Custom ID schemes | crypto.randomUUID() | Already used everywhere |

**Key insight:** This codebase has very consistent, well-established patterns. The planner should not invent new approaches — copy the nearest existing equivalent.

## Common Pitfalls

### Pitfall 1: Forgetting to Register Migration in server startup
**What goes wrong:** migrate-15.ts is written but never called — tables don't exist in production.
**Why it happens:** The server entry point (e.g., `backend/src/server.ts` or `index.ts`) calls each migrate function explicitly.
**How to avoid:** Find where migrateConsolidated and migrateMemoryV3 are called and add migrateSkillsTools15 in the same sequence.
**Warning signs:** Pool query errors on startup referencing missing tables.

### Pitfall 2: Seed Skipping Due to Conflict Guard
**What goes wrong:** seedTemplates() uses `ON CONFLICT DO NOTHING` and checks `COUNT(*) >= 100` — if templates already exist, seed is skipped entirely. Similarly, the skills seed needs its own guard.
**Why it happens:** The 37 SKILL_CATALOG entries need to be inserted once. If migrate-15.ts runs twice, it must not duplicate them.
**How to avoid:** Seed inside the migration transaction (already guarded by the idempotency check), or use `INSERT ... ON CONFLICT DO NOTHING` per row.

### Pitfall 3: Forge Stations Reading Old JSONB After Migration
**What goes wrong:** forge.ts Station 2 (runTrainer) reads `SELECT skills FROM agent_templates WHERE id = $1` — JSONB array. After Phase 15, the source of truth is template_skills junction table.
**Why it happens:** forge.ts is not touched when new tables are created.
**How to avoid:** Update runTrainer to query `template_skills JOIN skills` instead of the JSONB field. Similarly update runOutfitter for template_tools.

### Pitfall 4: template_id Orphan Risk on persona.deployed_by
**What goes wrong:** Adding `deployed_by` field to personas table as ALTER TABLE, but personas table has no migration guard for this column addition.
**Why it happens:** PostgreSQL `ALTER TABLE ADD COLUMN IF NOT EXISTS` is safe but must be inside the migration.
**How to avoid:** Use `ALTER TABLE personas ADD COLUMN IF NOT EXISTS deployed_by TEXT` in migrate-15.ts.

### Pitfall 5: Admin templates route proxies porter.py
**What goes wrong:** `admin/templates.ts` currently proxies to porter.py for template listing — it does NOT read from agent_templates directly. The Phase 15 junction table population depends on agent_templates being the live source.
**Why it happens:** Phase 12 seeded templates into PostgreSQL agent_templates. The admin templates route still proxies porter.py but falls back to PostgreSQL for internal templates.
**How to avoid:** The junction table seed in migrate-15.ts reads from PostgreSQL `agent_templates` directly — which is correct. The porter.py proxy in admin/templates.ts is separate and doesn't affect the migration.

### Pitfall 6: Route Ordering Conflict (Fastify param routes)
**What goes wrong:** Routes like `GET /api/admin/skills/categories` conflict with `GET /api/admin/skills/:id` if registered in wrong order.
**Why it happens:** Fastify matches literal routes before param routes only if registered first.
**How to avoid:** Register all literal routes (e.g., `/categories`, `/featured`) BEFORE `/:id` routes. Same lesson from Phase 11 STATE.md decision.

### Pitfall 7: Drizzle schema.ts INTEGER vs BOOLEAN
**What goes wrong:** PostgreSQL has a real BOOLEAN type, but the existing codebase uses INTEGER 0/1 (from SQLite era). Mixing them breaks comparisons.
**Why it happens:** The migration from SQLite preserved INTEGER columns.
**How to avoid:** Use `integer('enabled').default(1)` (not `boolean`) in schema.ts to match established codebase pattern. Raw SQL in migrate-15.ts uses INTEGER for enabled/visible/featured.

## Code Examples

Verified patterns from codebase:

### Migration File Structure
```typescript
// Source: backend/src/db/migrate-memv3.ts
import pg from 'pg';

export async function migrateSkillsTools(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'skills_tools_v1'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }
    // ... CREATE TABLE IF NOT EXISTS ...
    // ... seed data with ON CONFLICT DO NOTHING ...
    await client.query(`INSERT INTO schema_migrations (id) VALUES ('skills_tools_v1')`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

### Admin Route CRUD Pattern (from admin/skills.ts)
```typescript
// Source: backend/src/routes/v1/admin/skills.ts
export default async function skillsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async () => {
    const rows = (await pool.query('SELECT * FROM skills ORDER BY sort_order, name')).rows;
    return ok({ skills: rows, total: rows.length });
  });

  fastify.post('/', async (req, reply) => {
    const parsed = createSkillSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(err('INVALID_INPUT', ...));
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO skills (...) VALUES (...)', [...]);
    return reply.code(201).send(ok({ skill: { id, ...parsed.data } }));
  });

  fastify.put('/:id', async (req, reply) => { ... });
  fastify.delete('/:id', async (req, reply) => { ... });
}
```

### Junction Table Query (for forge.ts Station 2 update)
```sql
-- Source: pattern from Phase 10 join patterns in STATE.md
SELECT s.id, s.name, s.description, s.category, s.source
FROM template_skills ts
JOIN skills s ON s.id = ts.skill_id
WHERE ts.template_id = $1
ORDER BY ts.sort_order ASC
```

### Agent Instantiation with deployed_by (updated templates.ts pattern)
```typescript
// Source: backend/src/routes/v1/templates.ts lines 307-318
await pool.query(`
  INSERT INTO personas (id, name, role, config, created_at, status, owner, is_temporary, template_id, deployed_by)
  VALUES ($1, $2, $3, $4, $5, 'idle', $6, 0, $7, $8)
`, [agentId, name, role, JSON.stringify(cfg), now, username, template.id, username]);
```

### SKILL_CATALOG Migration Seed (complete reference for 37 skills)
The 37 skills to seed are in `backend/src/routes/v1/admin/skills.ts` in the SKILL_CATALOG constant. Categories present: Orchestration (9), Memory (2), Infrastructure (3), Creative (1), Writing (2), Operations (1), Research (2), Quality (1), Development (3), AI & LLM (1), Design (1), Other (1). The CONTEXT.md says "keep 10 categories" — the actual catalog has 12 (AI & LLM, Design, Other are additional). Keep all as-is; do not collapse.

### System Tools Registry Seed
Claude's discretion item — recommended seed data for system tools:
```sql
-- system type tools (infra, detected at runtime)
INSERT INTO tools (id, name, category, type, description, short_label, icon, sort_order, version)
VALUES
  ('git', 'Git', 'development', 'system', 'Version control', 'Git', 'git', 10, ''),
  ('node', 'Node.js', 'development', 'system', 'JavaScript runtime', 'Node', 'node', 11, ''),
  ('python3', 'Python', 'development', 'system', 'Python 3 interpreter', 'Python', 'python', 12, ''),
  ('npm', 'npm', 'development', 'system', 'Node package manager', 'npm', 'npm', 13, ''),
  ('tmux', 'tmux', 'infrastructure', 'system', 'Terminal multiplexer', 'tmux', 'terminal', 20, ''),
  ('docker', 'Docker', 'infrastructure', 'system', 'Container runtime', 'Docker', 'docker', 21, '')
ON CONFLICT DO NOTHING;

-- integration type tools (external services — instances via workspace_connections)
INSERT INTO tools (id, name, category, type, description, short_label, icon, sort_order)
VALUES
  ('github', 'GitHub', 'development', 'integration', 'Repository, issues, PRs', 'GitHub', 'github', 30),
  ('slack', 'Slack', 'communication', 'integration', 'Team messaging', 'Slack', 'slack', 31),
  ('gmail', 'Gmail', 'communication', 'integration', 'Email via Gmail', 'Gmail', 'gmail', 32),
  ('google-calendar', 'Google Calendar', 'productivity', 'integration', 'Calendar sync', 'GCal', 'calendar', 33),
  ('whatsapp', 'WhatsApp', 'communication', 'integration', 'WhatsApp messaging', 'WhatsApp', 'whatsapp', 34),
  ('brave-search', 'Brave Search', 'research', 'integration', 'Web search via Brave API', 'Search', 'search', 35),
  ('gemini', 'Gemini', 'ai', 'integration', 'Google Gemini AI', 'Gemini', 'gemini', 40),
  ('ollama', 'Ollama', 'ai', 'integration', 'Local LLM runner', 'Ollama', 'ollama', 41),
  ('openclaw', 'OpenClaw', 'ai', 'integration', 'OpenClaw AI gateway', 'OpenClaw', 'claw', 42)
ON CONFLICT DO NOTHING;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SKILL_CATALOG TypeScript constant | `skills` PostgreSQL table | Phase 15 | Skills become manageable at runtime |
| environment_tools (porter.py legacy) | `tools` PostgreSQL table | Phase 15 | Unified tool registry, admin CRUD |
| JSONB arrays on agent_templates | template_skills, template_tools junction tables | Phase 15 | Proper relational model, queryable |
| Forge reads JSONB arrays | Forge reads junction tables | Phase 15 | Forge pulls live skill/tool data |

**Deprecated/outdated:**
- `SKILL_CATALOG` constant in admin/skills.ts: replaced by skills table query
- `environment_tools` table (porter.py only, no Fastify equivalent): superseded by tools table
- `agent_templates.skills` JSONB: becomes readonly legacy column; junction table is canonical after Phase 15

## Open Questions

1. **Should agent_templates.skills/tools JSONB be removed or kept as read-only legacy?**
   - What we know: forge.ts reads these columns directly; removing them breaks forge until it's updated
   - What's unclear: Whether the plan should remove the columns in this phase or leave them as legacy
   - Recommendation: Keep columns (don't ALTER TABLE DROP) — they cost nothing and avoid forge breakage. Update forge to prefer junction tables but fall back to JSONB if junction table is empty. Clean removal is a future phase.

2. **Where is migrate-15.ts called from?**
   - What we know: migrate-memv3.ts is called from the server startup chain
   - What's unclear: The exact server entry point file path (not inspected — may be `backend/src/server.ts` or `backend/src/index.ts`)
   - Recommendation: Planner should find the startup file at plan time with `grep -r "migrateMemoryV3" backend/src/` and add migrateSkillsTools alongside it.

3. **admin/templates.ts currently proxies porter.py — does Phase 15 change this?**
   - What we know: The proxy returns templates from porter.py for non-internal templates. Phase 15 does not rewrite this route.
   - What's unclear: Whether the planner should also migrate the admin/templates.ts to read PostgreSQL directly (removing porter.py dependency)
   - Recommendation: Out of scope for Phase 15 per CONTEXT.md deferred items. Leave proxy as-is.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (35 tests) |
| Config file | `tests/playwright.config.ts` (or similar) |
| Quick run command | `cd /home/lobster/documents/porter/tests && npx playwright test --grep "skill\|tool\|template"` |
| Full suite command | `cd /home/lobster/documents/porter/tests && npx playwright test` |

### Phase Requirements → Test Map

No formal requirement IDs were specified for Phase 15. Testing strategy by area:

| Area | Behavior | Test Type | Automated Command |
|------|----------|-----------|-------------------|
| Skills CRUD | GET /api/admin/skills returns all skills from DB | API smoke | Playwright or curl |
| Tools CRUD | GET /api/admin/tools returns registry from DB | API smoke | Playwright or curl |
| Template skills | GET /api/v1/templates/:id returns skills from junction table | API smoke | Playwright or curl |
| Instantiation | POST /api/v1/templates/:id/instantiate creates persona with junction-sourced skills | API smoke | Playwright or curl |
| Migration idempotency | Running migrate-15.ts twice does not duplicate rows | Unit | Playwright or test script |
| Forge Station 2 | After migration, Trainer reads from template_skills | Integration | Manual |

### Sampling Rate
- **Per task commit:** Run `npx playwright test --grep "admin"` (admin-related tests only)
- **Per wave merge:** `cd tests && npx playwright test` (full 35-test suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] No existing Playwright tests specifically cover `/api/admin/skills` or `/api/admin/tools` CRUD — new tests needed
- [ ] No test for template instantiation junction table sourcing

*(Most gaps are acceptable given the API-backend-only phase — primary validation is curl/HTTP smoke tests)*

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `backend/src/routes/v1/admin/skills.ts` — confirmed SKILL_CATALOG is hardcoded constant with 37 entries
- Direct codebase inspection: `backend/src/routes/v1/admin/tools.ts` — confirmed environment_tools query, no skills table
- Direct codebase inspection: `backend/src/db/migrate-consolidated.ts` — confirmed agent_templates schema with JSONB skills/tools columns
- Direct codebase inspection: `backend/src/db/migrate-memv3.ts` — confirmed migration file pattern
- Direct codebase inspection: `backend/src/services/forge.ts` — confirmed Station 2/3 read from JSONB columns
- Direct codebase inspection: `backend/src/routes/v1/templates.ts` — confirmed current instantiation logic (persona row + .md files)
- Direct codebase inspection: `backend/src/db/schema.ts` — confirmed Drizzle schema patterns (doublePrecision timestamps, jsonb defaults, integer for booleans)

### Secondary (MEDIUM confidence)
- porter.py environment_tools grep — confirmed original table structure (tool_key, detected, version, source, health, last_checked_at)
- seed-templates.ts — confirmed 103 templates use string arrays for skills/tools, seeded with ON CONFLICT DO NOTHING

### Tertiary (LOW confidence)
- None — all claims based on direct codebase reads

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture: HIGH — migration pattern, route pattern, schema pattern all directly observed in codebase
- Pitfalls: HIGH — 6 of 7 pitfalls identified from direct code inspection, 1 (server startup file) needs planner verification
- Seed data: MEDIUM — system tools list is Claude's discretion; exact tool IDs may need adjustment

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable codebase, no fast-moving external dependencies)
