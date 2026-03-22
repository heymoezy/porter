# Phase 12: CRM Intelligence and Agent Templates — Research

**Researched:** 2026-03-22
**Domain:** Async job queuing, Ollama structured output, SQLite schema design, agent template catalog, .md file generation
**Confidence:** HIGH (all key findings verified against live codebase; no speculative claims)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Contact AI analysis**
- Structured output: sentiment (positive/neutral/negative), engagement_score (0-100), churn_risk (low/medium/high), key_topics (array), last_interaction_summary, communication_style, relationship_stage (new/active/at-risk/churned)
- Autonomous trigger: agents sweep contact DB continuously (24/7), self-adjusting frequency; POST /contacts/:id/analyze also available for on-demand
- Cheap model always: Ollama/Qwen for all analysis. No AI router — force cheap backend directly
- Separate analysis table: `contact_analyses` with FK to contacts; full history of all analyses; GET /contacts/:id includes latest analysis
- Never stale data: analysis always works from current interaction history, never cached snapshots

**Contact timeline**
- All four touchpoint types: messages sent/received, project events, file uploads, analysis events
- Single flat feed: one chronological array, each item has a `type` label
- Global across projects: all touchpoints from all linked projects and conversations
- All history, paginated: no time limit, default limit=50 offset=0

**Template catalog**
- 100 templates minimum: fully developed with complete .md content (SOUL.md, ROLE_CARD.md, IDENTITY.md, SKILLS.md), skills, tools, system_prompt — quality AND quantity
- DB table storage: `agent_templates` table in SQLite
- Full .md content in DB: system_prompt, soul_text, role_card_text, identity_text, skills_text columns
- Template visibility: `is_internal` flag
- Category taxonomy: Claude's discretion (research doc suggests 10, prior Claude research suggests 9)
- Tags for search: each template has tags array

**Template instantiation**
- Full agent + persona files: POST /templates/:id/instantiate creates personas DB row AND writes all .md files to personas/<id>/
- Track template origin: `template_id` column on personas table
- Override fields on create: POST body accepts name, role, description, project_id
- Strict validation: template declares required_backends and required_tools; 422 with specific missing items if fail; NO partial agents
- Auto-assignment: agents auto-assign to relevant project context
- Always fresh: instantiation reads from DB at call time, no caching

### Claude's Discretion
- Agent template category taxonomy (after research)
- Exact schema column names and types for agent_templates and contact_analyses tables
- Autonomous sweep scheduling mechanism (scheduler job vs event-driven — likely scheduler with self-adjusting interval)
- Analysis prompt engineering for structured output extraction
- Template .md file generation for 100 templates (content quality)
- Migration file structure (migrate-12.ts)

### Deferred Ideas (OUT OF SCOPE)
- Social media rabbit holes (email/LinkedIn/social deep research) — Phase 13
- Marketing flywheel agents — own phase
- Agent shared message board — own phase
- Automatic upgrade propagation — needs versioning system
- Agent XP/leveling system — future phase
- Cross-user feedback loop — needs feedback infrastructure
- Anonymized trend database — future data phase
- Building actual internal Porter agents (CRM sweep, maintenance) — needs message board + more infra
- Porter admin agent management tab — admin frontend work
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CRM-03 | AI-powered contact analysis generated from interaction history | contact_analyses table + Ollama dispatch + scheduler sweep pattern |
| CRM-04 | Contact activity timeline aggregates all touchpoints across projects | UNION query across messages/project events/files/analyses; existing contact_projects + contact_conversations linkages |
| TMPL-01 | 100 agent templates with complete skills, tools, and system prompt definitions | agent_templates table; 10-category taxonomy; full .md content stored in DB columns |
| TMPL-02 | Templates searchable and filterable by category via API | GET /api/v1/templates with ?category= and ?tag= query params; SQLite index on category |
| TMPL-03 | Template instantiation creates a fully configured, ready-to-work agent | personas INSERT + .md file writes + required_backends/required_tools validation + 422 on missing deps |
</phase_requirements>

---

## Summary

Phase 12 adds two backend capabilities: CRM intelligence (async AI analysis of contacts from interaction history, plus a unified activity timeline) and an agent template catalog (100 fully-defined templates that instantiate into dispatchable agents in one call).

The existing codebase provides all the plumbing needed. The scheduler is a 2-second-tick polling loop that already handles multiple job types (invite drips, external calls, AI dispatches) via the `agent_jobs` table. The analysis sweep fits naturally as a new trigger type on that same infrastructure. Ollama dispatch is already wired in `ai-router.ts`; the analysis service bypasses the routing logic and calls Ollama directly via `fetch()` to `POST /api/generate` with `stream: false`. The contacts API in `contacts.ts` is where `/analyze` and `/timeline` sub-routes are added. The agents API in `agents.ts` shows the creation pattern; instantiation builds on it, adding .md file writes and `template_id` tracking.

The most time-intensive deliverable is the 100-template content — each template needs system_prompt, soul_text, role_card_text, identity_text, and skills_text columns populated with quality content. These are written once into the migration SQL and never generated at runtime.

**Primary recommendation:** Build in four plans: (1) migration + schema, (2) CRM analysis API + scheduler sweep, (3) contact timeline API, (4) template catalog + instantiation API. Wave structure should match this grouping.

---

## Standard Stack

### Core (already in use — no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | existing | SQLite sync queries | Already in use; `sqlite.prepare()` pattern throughout |
| Drizzle ORM | existing | Schema definition + simple CRUD | Schema definitions live in schema.ts |
| Fastify 5 | existing | Route plugin pattern | All v1 routes follow `export default async function xV1Routes(fastify, opts)` |
| Node.js `fs/promises` | stdlib | Write .md files on instantiation | No new dependency; used for persona file writes |
| Node.js `crypto` | stdlib | UUID generation for new rows | `crypto.randomUUID()` used everywhere |
| Zod | existing | Request validation schemas | `z.object()` schemas at top of each route file |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Ollama REST API | runtime | Cheap model dispatch for analysis | POST /api/generate with `stream: false` — same pattern as ai-router.ts line 283 |

**Installation:** None required. All dependencies exist.

---

## Architecture Patterns

### Recommended Project Structure

New files created in this phase:
```
backend/src/
├── db/
│   └── migrate-12.ts            # contact_analyses + agent_templates tables
├── routes/v1/
│   ├── contacts.ts              # add /analyze + /timeline sub-routes (existing file)
│   └── templates.ts             # new route file: GET / + GET /:id + POST /:id/instantiate
└── services/
    └── contact-analyzer.ts      # Ollama dispatch + structured output parser

personas/
└── <new-agent-id>/              # created by instantiation (SOUL.md, ROLE_CARD.md, IDENTITY.md, SKILLS.md)
```

### Pattern 1: Async Job with 202 Accepted

POST /contacts/:id/analyze queues a job and returns 202 immediately. The scheduler picks it up within 2 seconds (next tick). The caller polls GET /contacts/:id to see when `ai_analysis` appears.

```typescript
// POST /:id/analyze — returns 202, queues job into agent_jobs
fastify.post<{ Params: { id: string } }>('/:id/analyze', {
  preHandler: [fastify.requireAuth],
}, async (request, reply) => {
  const { id } = request.params;
  const existing = sqlite.prepare('SELECT id FROM contacts WHERE id = ?').get(id);
  if (!existing) return reply.code(404).send(err('CONTACT_NOT_FOUND', 'Contact not found'));

  const jobId = crypto.randomUUID();
  sqlite.prepare(`
    INSERT INTO agent_jobs (id, agent_id, trigger_type, trigger_data, status, scheduled_for, created_at)
    VALUES (?, 'system', 'contact_analysis', ?, 'pending', unixepoch('now'), unixepoch('now'))
  `).run(jobId, JSON.stringify({ contact_id: id }));

  return reply.code(202).send(ok({ job_id: jobId, message: 'Analysis queued' }));
});
```

The scheduler's `executeJob()` function gains a new branch for `trigger_type === 'contact_analysis'`. It calls the contact-analyzer service which queries interaction history, sends to Ollama, parses the JSON response, and writes to `contact_analyses`.

### Pattern 2: Ollama Structured Output (Direct, No Router)

The analysis service calls Ollama with a structured prompt. Ollama/Qwen returns JSON; parse with `JSON.parse()` and validate shape before writing to DB. If parse fails, log error and mark job failed — never write partial data.

```typescript
// backend/src/services/contact-analyzer.ts
import { config } from '../config.js';

export interface ContactAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative';
  engagement_score: number;      // 0-100
  churn_risk: 'low' | 'medium' | 'high';
  key_topics: string[];
  last_interaction_summary: string;
  communication_style: string;
  relationship_stage: 'new' | 'active' | 'at-risk' | 'churned';
}

export async function analyzeContact(contactId: string, interactionHistory: string): Promise<ContactAnalysis> {
  const prompt = buildAnalysisPrompt(contactId, interactionHistory);

  const resp = await fetch(`${config.ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaModel,
      prompt,
      stream: false,
      format: 'json',   // Ollama format hint — helps but not guaranteed
    }),
    signal: AbortSignal.timeout(30000), // 30s timeout for analysis jobs
  });

  const data = await resp.json() as { response: string };
  // Parse and validate — throw on invalid shape so scheduler marks job failed
  return parseAnalysisResponse(data.response);
}
```

**Key:** Use `format: 'json'` in the Ollama request body. Qwen2.5-coder supports this hint. The response field is still a string — `JSON.parse(data.response)` is required. Validate shape before accepting.

### Pattern 3: Timeline UNION Query

The timeline endpoint assembles touchpoints from four tables into one chronological flat array using a SQLite UNION ALL query. This runs in a single DB round-trip.

```typescript
// GET /:id/timeline
// Returns all touchpoints DESC, paginated
const rows = sqlite.prepare(`
  SELECT 'message' as type, m.id as ref_id, m.content as detail,
         m.created_at, m.sender_type as actor
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  JOIN contact_conversations cc ON cc.conversation_id = c.id
  WHERE cc.contact_id = ?

  UNION ALL

  SELECT 'project_event' as type, p.id as ref_id, p.name as detail,
         cp.attached_at as created_at, 'system' as actor
  FROM projects p
  JOIN contact_projects cp ON cp.project_id = p.id
  WHERE cp.contact_id = ?

  UNION ALL

  SELECT 'file' as type, f.id as ref_id, f.filename as detail,
         fc.attached_at as created_at, f.uploaded_by as actor
  FROM files f
  JOIN file_contacts fc ON fc.file_id = f.id
  WHERE fc.contact_id = ?

  UNION ALL

  SELECT 'analysis' as type, ca.id as ref_id,
         ca.raw_json as detail, ca.created_at, 'system' as actor
  FROM contact_analyses ca
  WHERE ca.contact_id = ?

  ORDER BY created_at DESC
  LIMIT ? OFFSET ?
`).all(id, id, id, id, limit, offset);
```

### Pattern 4: Template Instantiation with Validation

```typescript
// POST /templates/:id/instantiate
fastify.post<{ Params: { id: string } }>('/:id/instantiate', {
  preHandler: [fastify.requireAuth],
}, async (request, reply) => {
  const template = sqlite.prepare('SELECT * FROM agent_templates WHERE id = ?').get(templateId);
  if (!template) return reply.code(404).send(err('TEMPLATE_NOT_FOUND', 'Template not found'));

  // Strict validation — 422 with specific missing items
  const requiredBackends = JSON.parse(template.required_backends || '[]') as string[];
  const requiredTools = JSON.parse(template.required_tools || '[]') as string[];
  const missing: { backends: string[]; tools: string[] } = { backends: [], tools: [] };

  for (const backend of requiredBackends) {
    const available = await probeBackend(backend);  // reuse from ai-router pattern
    if (!available) missing.backends.push(backend);
  }
  // tools validation: check workspace_connections or feature flags

  if (missing.backends.length > 0 || missing.tools.length > 0) {
    return reply.code(422).send(err('MISSING_DEPENDENCIES',
      `Cannot instantiate: missing ${JSON.stringify(missing)}`));
  }

  // Create persona row
  const agentId = 'agent_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  // INSERT into personas with template_id tracked in config blob

  // Write .md files to personas/<agentId>/
  const personaDir = path.join(process.env.HOME!, 'documents/porter/personas', agentId);
  await fs.mkdir(personaDir, { recursive: true });
  await fs.writeFile(path.join(personaDir, 'SOUL.md'), template.soul_text);
  await fs.writeFile(path.join(personaDir, 'ROLE_CARD.md'), template.role_card_text);
  await fs.writeFile(path.join(personaDir, 'IDENTITY.md'), template.identity_text);
  await fs.writeFile(path.join(personaDir, 'SKILLS.md'), template.skills_text);

  return reply.code(201).send(ok({ agent: formatAgent(agentRow) }));
});
```

### Pattern 5: Autonomous Sweep Scheduling

The sweep registers into `agent_jobs` with a future `scheduled_for` timestamp. After completing analysis for a contact, it schedules the next sweep for that contact based on activity level. High-activity contacts get swept more frequently; inactive contacts less frequently.

```typescript
// In scheduler.ts — new executeJob branch:
if (job.trigger_type === 'contact_analysis') {
  const data = JSON.parse(job.trigger_data || '{}') as { contact_id: string };
  try {
    const analysis = await runContactAnalysis(data.contact_id);
    // Write to contact_analyses table
    // Schedule next sweep: base_interval * activity_multiplier
    const nextInterval = computeNextInterval(analysis.engagement_score);
    scheduleContactAnalysis(data.contact_id, nextInterval);
    markJobComplete(job.id, JSON.stringify({ contact_id: data.contact_id }));
  } catch (e) {
    markJobFailed(job.id, String(e));
  }
  return;
}
```

**Sweep initialization:** On startup (or when the feature flag is enabled), a seed job is inserted for each contact that has never been analyzed. This bootstraps the autonomous loop without manual triggers.

### Pattern 6: Migration File (migrate-12.ts)

Follows the exact pattern of migrate-11.ts:
- Idempotency check via `schema_migrations` table
- `sqlite.exec()` for each table/index
- Seed data for 100 templates embedded as INSERT statements at the end
- Single `schema_migrations` INSERT on success

### Anti-Patterns to Avoid

- **AI router bypass must be explicit:** Analysis calls Ollama's `/api/generate` directly. Never call `aiRouterDispatch()` for analysis — it routes based on message complexity, not cost policy.
- **No partial instantiation:** If .md file write fails after DB insert, roll back the persona row. Use try/catch around file writes with DB cleanup.
- **No stale contact data in analysis prompt:** Always query `messages`, `contact_conversations`, `contact_projects` fresh at job execution time — never cache interaction history.
- **No route ordering issue:** Register `/analyze` and `/timeline` routes BEFORE `/:id` param routes to avoid Fastify route conflict (same lesson as Phase 11: GET /search before /:id).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Async job queue | Custom queue/worker infrastructure | Existing `agent_jobs` table + scheduler tick | Already handles retries, backoff, concurrent claim, system jobs |
| Ollama dispatch | New HTTP client wrapper | `fetch()` directly to `config.ollamaUrl + '/api/generate'` | Same pattern as ai-router.ts line 283 |
| Backend availability check | New probe logic | Reuse `probeBackend()` from ai-router.ts | Already handles HEAD→405 fallback |
| Agent creation flow | New persona writer | Extend existing `agents.ts` pattern + `db.insert(schema.personas)` | formatAgent(), parseJsonField() all reusable |
| Pagination | Custom cursor logic | limit/offset pattern from contacts.ts and agents.ts | Consistent with all other list endpoints |

**Key insight:** The job queue, AI dispatch, and persona creation patterns are already production-proven. Phase 12 adds trigger types and new tables, not new infrastructure.

---

## Common Pitfalls

### Pitfall 1: Ollama JSON format hint is advisory, not guaranteed
**What goes wrong:** `format: 'json'` in Ollama request body encourages JSON output but Qwen2.5-coder 1.5b may wrap it in markdown code fences or add preamble text.
**Why it happens:** Small models don't reliably follow format hints.
**How to avoid:** Strip markdown fences before `JSON.parse()`. If parse still fails, log the raw response and mark job failed — don't retry with malformed data.
**Warning signs:** `SyntaxError: Unexpected token` in job error column.

### Pitfall 2: Template seed data size in migration
**What goes wrong:** 100 templates × 5 text columns = ~500 INSERT statements. If any INSERT fails, the migration aborts mid-way and leaves partial data.
**Why it happens:** SQLite transaction not wrapping the seed inserts.
**How to avoid:** Wrap all 100 template INSERTs in a single `sqlite.transaction(() => { ... })()` call inside migrate-12.ts.

### Pitfall 3: Personas directory path assumption
**What goes wrong:** Instantiation writes .md files to a hardcoded path like `./personas/` relative to CWD.
**Why it happens:** Developer assumes process.cwd() === repo root.
**How to avoid:** Use `path.join(process.env.HOME!, 'documents/porter/personas', agentId)` — the absolute path. Cross-check with config.dataDir if personas move to dataDir in future.

### Pitfall 4: Sweep bootstrap creates duplicate jobs
**What goes wrong:** Every backend restart seeds analysis jobs for contacts, creating duplicate pending entries.
**Why it happens:** Naive INSERT without checking for existing pending jobs.
**How to avoid:** Use `INSERT OR IGNORE` with a unique constraint on `(contact_id, status='pending')`, OR check for existing pending `contact_analysis` jobs before seeding.

### Pitfall 5: Timeline UNION query with mismatched column count
**What goes wrong:** SQLite UNION requires each SELECT to have the same number of columns; a mismatch causes a silent error or wrong data.
**Why it happens:** Adding a new table arm without matching all columns.
**How to avoid:** Alias all columns explicitly in every UNION arm. Test with `sqlite3` CLI before wiring into route.

### Pitfall 6: 422 response without specific missing items
**What goes wrong:** Instantiation returns 422 with a generic "missing dependencies" message, not listing which backends/tools are missing.
**Why it happens:** Error handler stringifies the whole `missing` object as a single error code.
**How to avoid:** Include both `missing.backends` and `missing.tools` arrays in the error response body. The success criterion explicitly requires "specific reason" in the 422.

### Pitfall 7: Fastify route conflict — /:id vs /analyze
**What goes wrong:** `GET /:id` route captures `/analyze` as a contact ID, returning 404 instead of the analyze handler.
**Why it happens:** Fastify resolves parametric routes before static string routes if registered first.
**How to avoid:** Register `POST /:id/analyze` and `GET /:id/timeline` BEFORE `GET /:id` in contacts.ts. (Lesson from Phase 11: static routes before parametric.)

---

## Code Examples

Verified patterns from live codebase:

### Scheduler: Registering a new trigger type
```typescript
// scheduler.ts — add to executeJob() before the catch-all aiRouterDispatch block
if (job.trigger_type === 'contact_analysis') {
  // ... handler
  return;
}
```
Source: scheduler.ts lines 153-291 — existing pattern for invite_drip and external_call branches.

### Inserting a system job (no persona required)
```typescript
sqlite.prepare(`
  INSERT INTO agent_jobs (id, agent_id, trigger_type, trigger_data, status, scheduled_for, created_at)
  VALUES (?, 'system', 'contact_analysis', ?, 'pending', unixepoch('now'), unixepoch('now'))
`).run(crypto.randomUUID(), JSON.stringify({ contact_id: id }));
```
Source: scheduler.ts line 28-37 (scheduleDripReminder pattern). agent_id='system' bypasses the LEFT JOIN persona requirement in claimNextJob().

### Ollama direct call (no router)
```typescript
const resp = await fetch(`${config.ollamaUrl}/api/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: config.ollamaModel, prompt: req.message, stream: false }),
});
const data = await resp.json() as { response: string };
```
Source: ai-router.ts lines 279-285.

### Agent creation (reuse for instantiation)
```typescript
db.insert(schema.personas).values({
  id,
  name,
  role: role ?? '',
  config: JSON.stringify(config),
  createdAt: now,
  status: 'idle',
  owner: request.sessionUser!.username,
}).run();
```
Source: agents.ts lines 195-205.

### Migration idempotency guard
```typescript
const migrationId = 'phase12_crm_intelligence';
const existing = sqlite.prepare(`SELECT 1 FROM schema_migrations WHERE id = ?`).get(migrationId);
if (existing) return;
// ... all DDL and seed data
sqlite.prepare(`INSERT INTO schema_migrations (id) VALUES (?)`).run(migrationId);
```
Source: migrate-11.ts lines 4-8 and 217.

---

## Schema Design (Claude's Discretion)

### contact_analyses table
```sql
CREATE TABLE contact_analyses (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  sentiment TEXT NOT NULL CHECK(sentiment IN ('positive','neutral','negative')),
  engagement_score INTEGER NOT NULL CHECK(engagement_score BETWEEN 0 AND 100),
  churn_risk TEXT NOT NULL CHECK(churn_risk IN ('low','medium','high')),
  relationship_stage TEXT NOT NULL CHECK(relationship_stage IN ('new','active','at-risk','churned')),
  key_topics TEXT NOT NULL DEFAULT '[]',   -- JSON array
  last_interaction_summary TEXT,
  communication_style TEXT,
  raw_json TEXT,                            -- full Ollama response for auditability
  job_id TEXT,                              -- link back to the agent_job that produced this
  created_at REAL DEFAULT (unixepoch('now'))
);
CREATE INDEX idx_ca_contact ON contact_analyses(contact_id, created_at DESC);
```

GET /contacts/:id adds a `ai_analysis` key containing the most recent row from `contact_analyses` (ORDER BY created_at DESC LIMIT 1).

### agent_templates table
```sql
CREATE TABLE agent_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  tags TEXT NOT NULL DEFAULT '[]',          -- JSON array for flexible search
  skills TEXT NOT NULL DEFAULT '[]',        -- JSON array
  tools TEXT NOT NULL DEFAULT '[]',         -- JSON array
  required_backends TEXT NOT NULL DEFAULT '[]',  -- JSON array: ['ollama','openclaw']
  required_tools TEXT NOT NULL DEFAULT '[]',     -- JSON array: ['github','email']
  system_prompt TEXT NOT NULL DEFAULT '',
  soul_text TEXT NOT NULL DEFAULT '',
  role_card_text TEXT NOT NULL DEFAULT '',
  identity_text TEXT NOT NULL DEFAULT '',
  skills_text TEXT NOT NULL DEFAULT '',
  is_internal INTEGER NOT NULL DEFAULT 0,   -- 1 = admin-only, 0 = user-visible
  sort_order INTEGER DEFAULT 50,
  created_at REAL DEFAULT (unixepoch('now'))
);
CREATE INDEX idx_at_category ON agent_templates(category);
CREATE INDEX idx_at_internal ON agent_templates(is_internal);
```

### personas table — new column
```sql
ALTER TABLE personas ADD COLUMN template_id TEXT;
```
This is an `ALTER TABLE` in migrate-12.ts (not a new table). The template_id is stored here and also in the config JSON blob for backward compatibility.

---

## Category Taxonomy (Claude's Discretion — Recommended)

Based on the research doc (10 categories, ~100 total templates) and the existing categories in `research/agent-templates.md`:

| # | Category | Template Count | Examples |
|---|----------|---------------|---------|
| 1 | engineering | 15 | Frontend Dev, Backend Dev, DevOps, QA, ML Engineer |
| 2 | design | 10 | UI Designer, UX Researcher, Brand Strategist, Motion Designer |
| 3 | content | 12 | Content Writer, Technical Writer, SEO, Email Marketer, Translator |
| 4 | research | 10 | Research Analyst, Market Researcher, Fact Checker, User Researcher |
| 5 | business | 10 | Product Manager, Business Analyst, Financial Analyst, Growth Hacker |
| 6 | creative | 8 | Storyteller, Game Designer, Video Producer, Creative Director |
| 7 | support | 8 | Customer Support, Community Manager, Onboarding Specialist |
| 8 | legal | 6 | Legal Analyst, Compliance Officer, Privacy Specialist |
| 9 | data-ai | 8 | Data Scientist, ML Ops, Prompt Engineer, BI Developer |
| 10 | domain | 13 | Crypto Analyst, Healthcare, E-commerce, HR, Sales Ops, DevRel |

**Total: 100 templates.** This matches the existing research doc exactly and provides clean API filtering (`?category=engineering`).

---

## Analysis Prompt Engineering (Claude's Discretion)

The analysis prompt must elicit valid JSON from Qwen2.5-coder:1.5b (1.0GB model — small, instruction-following but not reliable on complex schemas).

**Recommended prompt structure:**
```
You are a CRM analysis engine. Analyze the following contact interaction history and return ONLY valid JSON.

Contact: {contact_name}
Interaction history:
{messages_summary}

Return this exact JSON structure:
{
  "sentiment": "positive|neutral|negative",
  "engagement_score": <0-100>,
  "churn_risk": "low|medium|high",
  "key_topics": ["topic1", "topic2"],
  "last_interaction_summary": "<one sentence>",
  "communication_style": "<one sentence>",
  "relationship_stage": "new|active|at-risk|churned"
}

Rules:
- Return ONLY the JSON object, no other text
- engagement_score must be an integer 0-100
- key_topics must be an array of strings
```

**Context building:** Query up to 20 most recent messages from all conversations linked to the contact. Truncate long messages to 200 chars each. Total prompt should stay under 2000 chars for the 1.5b model.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Templates in porter.py dict (AGENT_TEMPLATES) | Templates in SQLite agent_templates table | Phase 12 (now) | Relational, searchable, survives deploys |
| Manual agent creation only | Template instantiation in one API call | Phase 12 (now) | Agents dispatchable immediately |
| No contact intelligence | Async AI analysis with structured fields | Phase 12 (now) | CRM becomes intelligent |
| Contact page = static address book | Contact with timeline + analysis | Phase 12 (now) | Full relationship picture |

---

## Open Questions

1. **personas directory location for instantiation**
   - What we know: `personas/porter-core/` exists at repo root; `config.dataDir` points to `~/.porter/`
   - What's unclear: Should instantiated personas be written to `~/documents/porter/personas/` (repo) or `~/.porter/personas/` (data dir)?
   - Recommendation: Use repo path `~/documents/porter/personas/` for consistency with existing porter-core. Add a config key `personasDir` if this needs to become configurable.

2. **Sweep bootstrap — what "never analyzed" means**
   - What we know: contact_analyses table is new; all existing contacts have never been analyzed
   - What's unclear: Bootstrap on startup for ALL contacts, or only contacts with interaction history?
   - Recommendation: Only bootstrap contacts that have at least one conversation linked (via contact_conversations). Contacts with no messages produce useless analysis.

3. **required_tools validation in instantiation**
   - What we know: `workspace_connections` table tracks which tools are connected + their status
   - What's unclear: Should "tool available" mean `status = 'connected'` in workspace_connections, or just that the connection exists?
   - Recommendation: Require `status = 'connected'` in workspace_connections for tools declared as required. Return the tool name and its current status in the 422 response.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bash smoke scripts (existing pattern — smoke-phase11.sh) |
| Config file | None — shell scripts, self-contained |
| Quick run command | `bash tests/smoke-phase12.sh` |
| Full suite command | `cd tests && npx playwright test` (35 tests) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CRM-03 | POST /contacts/:id/analyze returns 202; after job completes, GET /contacts/:id has ai_analysis | smoke | `bash tests/smoke-phase12.sh` | Wave 0 |
| CRM-03 | Analysis derived from actual message history (not generic) | smoke | `bash tests/smoke-phase12.sh` | Wave 0 |
| CRM-04 | GET /contacts/:id/timeline returns all four touchpoint types | smoke | `bash tests/smoke-phase12.sh` | Wave 0 |
| CRM-04 | Timeline paginated with limit/offset | smoke | `bash tests/smoke-phase12.sh` | Wave 0 |
| TMPL-01 | GET /templates returns 100 templates with fully populated fields | smoke | `bash tests/smoke-phase12.sh` | Wave 0 |
| TMPL-02 | GET /templates?category=marketing returns only matching templates | smoke | `bash tests/smoke-phase12.sh` | Wave 0 |
| TMPL-03 | POST /templates/:id/instantiate returns 201 agent record when backends available | smoke | `bash tests/smoke-phase12.sh` | Wave 0 |
| TMPL-03 | POST /templates/:id/instantiate returns 422 with specific reason when backend missing | smoke | `bash tests/smoke-phase12.sh` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bash tests/smoke-phase12.sh` (quick smoke covering all 5 requirements)
- **Per wave merge:** `cd tests && npx playwright test` (full 35-test Playwright suite)
- **Phase gate:** Full Playwright suite green + smoke-phase12.sh 100% PASS before /gsd:verify-work

### Wave 0 Gaps
- [ ] `tests/smoke-phase12.sh` — covers CRM-03, CRM-04, TMPL-01, TMPL-02, TMPL-03
- [ ] `backend/src/db/migrate-12.ts` — contact_analyses + agent_templates + ALTER TABLE personas
- [ ] `backend/src/services/contact-analyzer.ts` — Ollama dispatch + prompt builder + JSON parser
- [ ] `backend/src/routes/v1/templates.ts` — new route file
- [ ] Register templates route in `backend/src/routes/v1/index.ts`

---

## Sources

### Primary (HIGH confidence)
- Live codebase: `backend/src/services/scheduler.ts` — scheduler tick loop, claimNextJob, executeJob pattern
- Live codebase: `backend/src/services/ai-router.ts` — Ollama dispatch pattern lines 279-308
- Live codebase: `backend/src/routes/v1/contacts.ts` — existing CRUD, getContactFull(), sub-route patterns
- Live codebase: `backend/src/routes/v1/agents.ts` — agent creation, formatAgent(), parseJsonField()
- Live codebase: `backend/src/db/migrate-11.ts` — migration pattern with idempotency
- Live codebase: `backend/src/db/schema.ts` — all existing tables including contacts, conversations, files, personas
- Live codebase: `research/agent-templates.md` — 10-category taxonomy with ~100 template definitions
- Live codebase: `personas/CLAUDE.md` — persona file structure (SOUL, ROLE_CARD, IDENTITY, MEMORY, DELIVERABLES)

### Secondary (MEDIUM confidence)
- Ollama documentation (from training): `format: 'json'` hint supported in Ollama REST API for structured output
- SQLite UNION ALL documentation: all SELECT arms must have same column count and compatible types

### Tertiary (LOW confidence)
- Qwen2.5-coder:1.5b JSON reliability: based on general knowledge of small model JSON adherence; the pitfall about stripping markdown fences should be treated as a precaution

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified in live codebase
- Architecture: HIGH — patterns verified directly in scheduler.ts, ai-router.ts, contacts.ts, agents.ts
- Schema design: HIGH — follows exact patterns from migrate-11.ts; column names are Claude's discretion but informed by existing schema
- Category taxonomy: HIGH — directly from research/agent-templates.md (the canonical reference)
- Pitfalls: HIGH — most are concrete lessons from Phase 11 STATE.md decisions (route ordering, z.record args, etc.) or obvious SQLite constraints

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable codebase; no external API dependencies to drift)
