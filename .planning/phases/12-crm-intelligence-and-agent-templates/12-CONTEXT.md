# Phase 12: CRM Intelligence and Agent Templates - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Two capabilities: (1) AI-powered contact analysis — autonomous agent sweep of contacts based on interaction history, producing structured CRM intelligence fields; (2) Searchable agent template catalog — 100 fully-developed templates with one-call instantiation into ready-to-work agents. Backend API only — zero frontend.

</domain>

<decisions>
## Implementation Decisions

### Contact AI analysis
- **Structured output** — analysis produces a JSON object with: sentiment (positive/neutral/negative), engagement_score (0-100), churn_risk (low/medium/high), key_topics (array), last_interaction_summary, communication_style, relationship_stage (new/active/at-risk/churned)
- **Autonomous trigger** — agents sweep the contact database continuously (24/7). Self-adjusting frequency based on activity. NOT manual-only. POST /contacts/:id/analyze also available for on-demand analysis
- **Cheap model always** — Ollama/Qwen for all analysis jobs. Cost-efficient since this runs autonomously at scale. No AI router — force cheap backend
- **Separate analysis table** — `contact_analyses` table with FK to contacts. Keeps full history of all analyses so scores can be tracked over time. GET /contacts/:id includes latest analysis
- **Never stale data** — analysis must always work from current interaction history, never cached snapshots. This is a non-negotiable priority

### Contact timeline
- **All four touchpoint types** — messages sent/received, project events, file uploads, analysis events (when AI analysis ran and what changed)
- **Single flat feed** — one chronological array, each item has a `type` label (message, project_event, file, analysis). Frontend renders per type
- **Global across projects** — GET /contacts/:id/timeline returns all touchpoints from all linked projects and conversations. Full relationship picture
- **All history, paginated** — no time limit. Default limit=50, offset=0. Matches existing agent activity pagination pattern

### Template catalog
- **100 templates minimum** — fully developed with complete .md file content (SOUL.md, ROLE_CARD.md, IDENTITY.md, SKILLS.md), skills, tools, system_prompt. Quality AND quantity
- **DB table storage** — `agent_templates` table in SQLite. Fast, relational, searchable. No JSON seed files
- **Full .md content in DB** — each template row stores system_prompt, soul_text, role_card_text, identity_text, skills_text columns. Self-contained — no AI generation at instantiation time
- **Template visibility** — `is_internal` flag. Internal templates (system/maintenance agents) visible only in Porter admin, not exposed to users. These are Porter's "special sauce"
- **Category taxonomy** — Claude to research optimal categories. Research doc suggests 10, prior Claude research suggests 9. Researcher agent will deep-dive agent taxonomy before planning
- **Tags for search** — each template has tags array for flexible search beyond category hierarchy

### Template instantiation
- **Full agent + persona files** — POST /templates/:id/instantiate creates personas DB row AND writes all .md files to personas/<id>/ directory. Agent is immediately dispatchable
- **Track template origin** — `template_id` column on personas table. Know which template spawned an agent. Enables future upgrade propagation
- **Override fields on create** — POST body accepts name, role, description, project_id overrides. Template provides defaults, user overrides what they want
- **Strict validation** — template declares required_backends and required_tools. Instantiation checks availability of each. Returns 422 with specific missing items if validation fails. NO partial agents. No degraded creation
- **Auto-assignment** — agents auto-assign to relevant project context. No floating workers waiting for instructions. Porter's differentiator: auto-assigned, auto-on, get shit done
- **Always fresh** — instantiation reads template data from DB at call time. No caching. Template updates immediately affect new instantiations

### Claude's Discretion
- Agent template category taxonomy (after research)
- Exact schema column names and types for agent_templates and contact_analyses tables
- Autonomous sweep scheduling mechanism (scheduler job vs event-driven — likely scheduler with self-adjusting interval)
- Analysis prompt engineering for structured output extraction
- Template .md file generation for 100 templates (content quality)
- Migration file structure (migrate-12.ts)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Agent templates
- `research/agent-templates.md` — Template library design: 100 templates across 10 categories, architecture, API endpoints, implementation plan
- `research/porter-agents-v2-design-brief.md` — Agent V2 architecture: porter hero + worker grid, guided creation, concepts tab
- `personas/porter-core/ROLE_CARD.md` — Porter's role card format — template for all agent role cards
- `personas/porter-core/SOUL.md` — Porter's soul format — template for agent soul files
- `personas/CLAUDE.md` — Persona directory structure rules (IDENTITY.md, SOUL.md, USER.md, MEMORY.md, ROLE_CARD.md, DELIVERABLES.md)

### CRM and contacts
- `research/crm-redesign-spec.md` — CRM redesign spec: Directory + Relationships views, project/agent linkage, AI analysis
- `backend/src/routes/v1/contacts.ts` — Current contacts API: CRUD, multi-value fields, conversation/project linking
- `backend/src/routes/v1/conversations.ts` — Unified conversations API (Phase 11) — source of interaction history for analysis

### Existing agent infrastructure
- `backend/src/routes/v1/agents.ts` — Current agent API: CRUD, ephemeral agents, activity feed, job queue
- `backend/src/db/schema.ts` — Drizzle schema with personas table and config blob pattern
- `backend/src/services/ai-router.ts` — AI router (NOT used for analysis — cheap model forced, but reference for backend detection)
- `backend/src/services/scheduler.ts` — 2s-tick scheduler for autonomous jobs

### Database patterns
- `backend/src/db/migrate-11.ts` — Phase 11 migration (conversations, contacts, files) — latest migration pattern
- `backend/src/lib/envelope.ts` — ok()/err() response envelope helpers

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `contacts.ts` CRUD: full contact API with multi-value fields — analysis endpoints extend this
- `agents.ts` CRUD: agent creation, formatAgent(), parseJsonField() — instantiation builds on this
- `ok()`/`err()` envelope helpers: consistent response format
- `requireAuth` preHandler: auth for all new endpoints
- `crypto.randomUUID()`: existing ID generation pattern
- `scheduler.ts`: 2s-tick scheduler for autonomous sweep jobs
- Existing persona .md file structure (SOUL, ROLE_CARD, IDENTITY, SKILLS) — instantiation writes these

### Established Patterns
- Drizzle ORM + better-sqlite3 for table definitions
- Hybrid SQL: sqlite.prepare() for complex queries, Drizzle for simple CRUD
- Route plugin pattern in routes/v1/ directory
- Migration files: migrate-NN.ts run on startup
- Agent jobs: async queue via agent_jobs table for background work
- Config JSON blob on personas table for extensible agent metadata

### Integration Points
- `contacts.ts`: needs /analyze and /timeline sub-routes added
- `agents.ts`: needs template_id column, instantiation creates via existing creation flow
- `scheduler.ts`: autonomous analysis sweep registers as a scheduled workflow
- `personas/` directory: instantiation writes .md files here per existing convention
- `ai-router.ts`: analysis bypasses router, forces cheap model directly

</code_context>

<specifics>
## Specific Ideas

- Agents are a video game — they level up over time, get better, receive upgrades. template_id tracking enables this future pattern
- Internal system agents are Porter's special sauce — never exposed to users. They run the business autonomously (CRM sweep, maintenance, marketing). Live in admin only
- Porter's differentiator is auto-assignment, auto-on — no checkpoints, no prompts, no reminders. Agents get shit done
- Analysis must use game theory and probability thinking — engagement scoring isn't just message count, it's behavioral pattern analysis
- The flywheel: better contact analysis → better engagement → more users → more data → better analysis

</specifics>

<deferred>
## Deferred Ideas

- **Social media rabbit holes** — using email/LinkedIn/social profiles to deep-research users beyond interaction history → Phase 13 (Autonomous Learning)
- **Marketing flywheel agents** — agents that use contact analysis to re-engage churning users, FOMO-driven outreach → its own phase (needs analysis data from Phase 12 first)
- **Agent shared message board** — inter-agent communication system → its own phase
- **Automatic upgrade propagation** — when a template improves, push upgrades to existing agents spawned from it → needs versioning system
- **Agent XP/leveling system** — gamification of agent improvement → future phase
- **Cross-user feedback loop** — agents learning from usage across all users to improve templates → needs feedback infrastructure
- **Anonymized trend database** — aggregate contact analysis data for market insights or data sales → future data phase
- **Building actual internal Porter agents** — the CRM sweep agent, maintenance agents, etc. → needs message board + more infra
- **Porter admin agent management tab** — admin frontend for internal agents → admin frontend work

</deferred>

---

*Phase: 12-crm-intelligence-and-agent-templates*
*Context gathered: 2026-03-22*
