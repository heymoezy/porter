# Phase 13: Autonomous Learning - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Porter autonomously acquires domain expertise for all agent templates by searching web, GitHub, and Reddit. Learned knowledge is stored as Memory V2 concepts in a new Drizzle-managed relational table with full source attribution and confidence scores. No personal identifiers stored. Session caps and robots.txt respected. No on-demand trigger API — this is system-level, always-on, "press play once, never stops."

**ROADMAP.md success criteria must be rewritten** — remove `POST /api/v1/agents/:id/learn` (autonomous-only, no on-demand trigger). Rewrite around system sweep behavior.

</domain>

<decisions>
## Implementation Decisions

### Learning trigger model
- **Autonomous only** — no on-demand POST endpoint. Porter itself runs a continuous 24/7 research sweep across all templates. Like contact-analyzer but for knowledge acquisition
- **Round-robin across all templates** — every template gets attention. No prioritization by popularity or activity. All 100+ templates rotate evenly through the research queue
- **Self-adjusting cadence** — like contact-analyzer's engagement-based intervals. Templates in richer/faster-moving domains get more frequent sessions. Simple domains get less. Claude determines exact frequency heuristics based on resource constraints (2 vCPU, 8GB RAM, Ollama local)
- **Scheduler integration** — uses existing agent_jobs + scheduler.ts pattern. Bootstrap function seeds initial jobs on startup. Each completed session schedules the next

### Source strategy
- **DuckDuckGo HTML scrape** for general web search — free, no API key, zero cost per cycle. Rate-limited by politeness delay
- **GitHub Search API** for code/repos/docs — REST API, 60 req/hr unauthenticated, 5000/hr with token. Porter already has GitHub OAuth from Phase 7
- **Reddit JSON endpoints** for community knowledge — append .json to Reddit URLs, no auth needed. Rate-limited but free for reading public content
- **robots.txt respected** — check and cache robots.txt per domain before fetching. Obey disallow rules. Cache TTL reasonable (24h)
- **20-request cap per session** — Claude determines whether this counts outbound HTTP requests or search queries during research/planning. Session logs `capped: true` if limit hit

### Knowledge extraction
- **Structured expertise frameworks** — output is patterns, tradeoffs, best practices, decision trees. "Here's how to approach X." Framework building, not data collection. Not encyclopedic fact dumps
- **Iterative research loop** — query -> search -> summarize -> gap analysis -> refine query -> repeat. Like Local Deep Researcher pattern. Produces deeper expertise per session. Uses more of the request cap but quality justifies it
- **Confidence scores via source authority** — official docs/GitHub repos = high confidence. Blog posts by known authors = medium. Forum comments/Reddit = lower. Domain-based trust hierarchy, not LLM self-assessment
- **PII scrubbing: prompt + regex** — double protection. LLM extraction prompt instructs "extract ONLY domain knowledge, never personal info." Post-extraction regex strips emails, @handles, phone numbers, personal names. GDPR-safe by design
- **Ollama/Qwen for all extraction** — cheap model always, like contact-analyzer. No AI router involvement. Direct Ollama calls for cost efficiency at scale

### Memory V2 bridge
- **General-purpose concepts table in Drizzle** — build the proper Memory V2 concepts table fresh in Drizzle. Columns: memory_kind, trust_tier, scope, source_url, confidence_score, etc. per the Memory V2 design doc. Relational, not learning-specific. Future memory features use the same table
- **Clean slate** — existing porter.py memory data is all test/dev work and is expendable. No migration of existing data. Fresh start
- **FTS5 for search** — concepts table gets FTS5 index for text search, following existing pattern from Phase 11 conversations

### Claude's Discretion
- Exact DuckDuckGo scraping approach (HTML parsing, result extraction)
- GitHub API query construction for optimal results per template domain
- Reddit subreddit discovery strategy per template category
- Iterative research loop depth (how many refine cycles per session)
- Request cap semantics (outbound HTTP vs search queries)
- Self-adjusting cadence heuristics (what makes a domain "rich" vs "simple")
- Exact Drizzle schema columns for the concepts table (guided by Memory V2 design doc)
- Migration file structure (migrate-13.ts)
- Extraction prompt engineering for structured frameworks
- Regex PII patterns list
- robots.txt caching implementation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Memory V2 system
- `research/porter-memory-v2.md` — Memory V2 design doc: 4-layer model, data model fields (memory_kind, trust_tier, scope, source_url, confidence, etc.), lifecycle, injection rules
- `.planning/phases/02-memory-v2/02-CONTEXT.md` — Phase 2 decisions: noise filtering, scope isolation, injection cap, FTS5 search

### Existing autonomous patterns
- `backend/src/services/contact-analyzer.ts` — CRM analysis pattern: direct Ollama calls, structured JSON extraction, parseAnalysis(), DEFAULT fallbacks. **Primary code pattern to follow**
- `backend/src/services/scheduler.ts` — 2s-tick scheduler, self-adjusting intervals (scheduleNextContactAnalysis), bootstrap seeding, agent_jobs table
- `backend/src/db/schema.ts` — Drizzle schema definitions, existing table patterns

### External source integration
- `backend/src/services/github.ts` — Existing GitHub service (Phase 7) with OAuth, API patterns
- `backend/src/routes/v1/connections.ts` — Connections infrastructure for external service access

### Database and API patterns
- `backend/src/db/migrate-12.ts` — Latest migration file pattern
- `backend/src/lib/envelope.ts` — ok()/err() response envelope helpers
- `backend/src/routes/v1/agents.ts` — Agent routes (learning-sessions endpoint extends this)

### Phase 12 context
- `.planning/phases/12-crm-intelligence-and-agent-templates/12-CONTEXT.md` — Template catalog decisions, 100+ templates, cheap model pattern, scheduler integration

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `contact-analyzer.ts`: Direct Ollama call pattern, structured output parsing, clampScore(), DEFAULT fallback object — **primary pattern for learning extraction**
- `scheduler.ts`: scheduleNextContactAnalysis() as pattern for scheduleNextLearningSession(), bootstrapContactAnalysis() as pattern for bootstrapLearning()
- `github.ts`: GitHub API integration, OAuth token access — reuse for GitHub Search API
- `ok()`/`err()` envelope helpers for any new API endpoints
- `requireAuth` preHandler for protected routes
- Agent_jobs table for async background work queue

### Established Patterns
- Drizzle ORM + better-sqlite3 for table definitions
- Hybrid SQL: sqlite.prepare() for complex queries, Drizzle for simple CRUD
- Route plugin pattern in routes/v1/ directory
- Migration files: migrate-NN.ts run on startup
- FTS5 virtual tables for full-text search (Phase 11 conversations)
- Direct Ollama fetch() calls bypassing AI router for background work

### Integration Points
- `scheduler.ts`: Register learning sweep as a new trigger_type (learning_session)
- `agents.ts`: Add GET /agents/:id/learning-sessions sub-route
- New `memory.ts` route file for GET /memory/concepts?agent_id=X (or template_id=X)
- New `learner.ts` service for the research loop engine
- migrate-13.ts: concepts table + learning_sessions table + FTS5 indexes

</code_context>

<specifics>
## Specific Ideas

- "Press play once, never stops" — the system is autonomous by default. No human intervention after initial setup
- "Framework building, not data collection" — expertise is structured patterns and decision trees, not article dumps or fact lists
- "Every template should reach expert-level autonomously" — like Moe's Google Ads kit (15 skills replacing $3-5K/month agencies). Templates should be that good
- "The system is self-evolving — not waiting to be told" — Porter continuously gets smarter and applies that intelligence
- "Relational always" — general-purpose concepts table, not a learning-specific silo

</specifics>

<deferred>
## Deferred Ideas

- **Gap discovery -> new agents** — when Porter identifies a domain gap, it creates a new agent template automatically. Needs template self-creation infrastructure
- **Skill/tool discovery -> agent rebuilds** — when Porter finds new tools/approaches, it rebuilds existing agent profiles with upgraded capabilities. Needs agent evolution infrastructure
- **Project improvement suggestions** — when Porter learns new info relevant to active projects, it proactively suggests improvements. Needs project-awareness in the learning pipeline
- **Cross-user feedback loop** — agents learning from usage across all users to improve templates. Needs feedback infrastructure
- **Template versioning** — when learning improves a template's knowledge, version the template. Needs versioning system
- **On-demand learning API** — POST /agents/:id/learn for manual override. Descoped to autonomous-only for Phase 13. Can add later if needed

</deferred>

---

*Phase: 13-autonomous-learning*
*Context gathered: 2026-03-22*
