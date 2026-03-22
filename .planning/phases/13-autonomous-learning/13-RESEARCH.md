# Phase 13: Autonomous Learning - Research

**Researched:** 2026-03-22
**Domain:** Autonomous web research, source scraping, Memory V2 concepts table, scheduler patterns, PII scrubbing
**Confidence:** HIGH (core patterns from existing codebase; MEDIUM on DuckDuckGo fallback strategy)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Learning trigger model**
- Autonomous only — no on-demand POST endpoint. Porter runs a continuous 24/7 research sweep across all templates. Like contact-analyzer but for knowledge acquisition.
- Round-robin across all templates — every template gets attention. No prioritization by popularity or activity. All 100+ templates rotate evenly through the research queue.
- Self-adjusting cadence — like contact-analyzer's engagement-based intervals. Templates in richer/faster-moving domains get more frequent sessions. Simple domains get less.
- Scheduler integration — uses existing agent_jobs + scheduler.ts pattern. Bootstrap function seeds initial jobs on startup. Each completed session schedules the next.

**Source strategy**
- DuckDuckGo HTML scrape for general web search — free, no API key, zero cost per cycle. Rate-limited by politeness delay.
- GitHub Search API for code/repos/docs — REST API, 60 req/hr unauthenticated, 5000/hr with token. Porter already has GitHub OAuth from Phase 7.
- Reddit JSON endpoints for community knowledge — append .json to Reddit URLs, no auth needed. Rate-limited but free for reading public content.
- robots.txt respected — check and cache robots.txt per domain before fetching. Obey disallow rules. Cache TTL 24h.
- 20-request cap per session — Claude determines whether this counts outbound HTTP requests or search queries during research/planning. Session logs `capped: true` if limit hit.

**Knowledge extraction**
- Structured expertise frameworks — output is patterns, tradeoffs, best practices, decision trees.
- Iterative research loop — query → search → summarize → gap analysis → refine query → repeat.
- Confidence scores via source authority — official docs/GitHub repos = high. Blog posts by known authors = medium. Forum comments/Reddit = lower.
- PII scrubbing: prompt + regex — double protection. LLM prompt instructs "extract ONLY domain knowledge, never personal info." Post-extraction regex strips emails, @handles, phone numbers, personal names.
- Ollama/Qwen for all extraction — cheap model always, like contact-analyzer. No AI router involvement.

**Memory V2 bridge**
- General-purpose concepts table in Drizzle — build proper Memory V2 concepts table fresh in Drizzle. Columns: memory_kind, trust_tier, scope, source_url, confidence_score, etc.
- Clean slate — no migration of existing porter.py memory data.
- FTS5 for search — concepts table gets FTS5 index for text search.

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

### Deferred Ideas (OUT OF SCOPE)
- Gap discovery -> new agents
- Skill/tool discovery -> agent rebuilds
- Project improvement suggestions
- Cross-user feedback loop
- Template versioning
- On-demand learning API (POST /agents/:id/learn)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LEARN-01 | Agents can search external sources (web, GitHub, Reddit) for domain knowledge | Source integration patterns: DuckDuckGo HTML, GitHub Search API via existing octokit, Reddit JSON endpoint; scheduler `learning_session` trigger type; `learner.ts` service |
| LEARN-02 | Learned knowledge stored as concepts in Memory V2 with source attribution | New `concepts` Drizzle table with `memory_kind`, `trust_tier`, `scope`, `source_url`, `confidence_score`; PII scrubbing pipeline; FTS5 virtual table |
| LEARN-03 | Learning sessions logged with sources, confidence scores, and what was retained | `learning_sessions` table with `sources_visited`, `concepts_retained`, `confidence_distribution`, `capped` fields; GET /agents/:id/learning-sessions route |
</phase_requirements>

---

## Summary

Phase 13 builds an autonomous knowledge acquisition engine on top of the patterns already established in Phase 12 (contact-analyzer, scheduler). The core pattern is identical: a background service (learner.ts) does work, scheduler.ts queues and re-enqueues jobs with `trigger_type = 'learning_session'`, and migrate-13.ts creates the persistence layer.

The key new complexity is the Memory V2 concepts table (the first Drizzle-backed implementation of the Memory V2 design from research/porter-memory-v2.md), and the multi-source research loop across web, GitHub, and Reddit. Both are well-understood individually; the challenge is integrating them cleanly within the 20-request-per-session cap.

**Critical discovery:** DuckDuckGo's HTML endpoint has become significantly more aggressive with bot detection in 2025-2026, requiring vqd token management, consistent headers, and frequent 202 rate-limit responses from all automated access points (open-webui, crewAI, local-deep-research all report issues). The locked decision to use DuckDuckGo HTML scraping is technically risky. The planner should implement DuckDuckGo as primary with a graceful fallback architecture, and note this risk prominently. The `duck-duck-scrape` npm package (v2.2.7, MIT, already handles vqd) is the best available option.

**Primary recommendation:** Follow the contact-analyzer pattern exactly for learner.ts. Use `duck-duck-scrape` for web search (handles vqd complexity), existing `octokit` for GitHub (already in package.json), and Reddit `.json` endpoints with a custom User-Agent header. Build the concepts table as a clean Drizzle-managed table per the Memory V2 design doc.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | ^12.6.2 | concepts + learning_sessions tables | Already in project, WAL mode, synchronous access |
| `drizzle-orm` | ^0.45.1 | Schema definitions for new tables | All Phase 8+ tables use Drizzle |
| `octokit` | ^5.0.5 | GitHub Search API | Already in package.json, used in github.ts; authenticated = 30 req/min vs 10 unauthenticated |
| Node `fetch` | built-in | Reddit JSON, DuckDuckGo, robots.txt fetching | No dep needed, used in contact-analyzer.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `duck-duck-scrape` | 2.2.7 | DuckDuckGo web search | Handles vqd token management internally; use over raw HTML scraping |
| `robots-parser` | 3.0.1 | Parse robots.txt before fetching any domain | Whenever a domain URL needs to be fetched for content |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `duck-duck-scrape` | Raw `html.duckduckgo.com/html/` fetch | DDG now requires vqd token session management — duck-duck-scrape handles this; raw fetch needs manual vqd extraction and fails frequently with 202 |
| `duck-duck-scrape` | SearXNG self-hosted | SearXNG requires Docker setup — not viable without explicit infra approval. Excellent fallback if DuckDuckGo proves unreliable in production |
| `robots-parser` | Manual regex robots.txt parsing | robots.txt has wildcard rules, path matching, and crawl-delay fields — RFC 9309 compliance via library prevents edge case errors |

**Installation (new deps only):**
```bash
cd /home/lobster/documents/porter/backend && npm install duck-duck-scrape robots-parser
```

**Version verification (2026-03-22):**
- `duck-duck-scrape` latest: 2.2.7 (MIT, 27 published versions, maintained)
- `robots-parser` latest: 3.0.1 (MIT)

---

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
├── db/
│   ├── migrate-13.ts         # concepts + learning_sessions + FTS5 indexes
│   └── schema.ts             # concepts, learningSessions Drizzle tables (append)
├── services/
│   └── learner.ts            # research loop engine — primary new file
└── routes/v1/
    ├── agents.ts             # extend: GET /:id/learning-sessions sub-route
    └── memory.ts             # new file: GET /memory/concepts?agent_id=X (or template_id=X)
tests/
└── smoke-phase13.sh          # phase gate validation
```

### Pattern 1: Scheduler Integration (trigger_type = 'learning_session')

**What:** Add a new trigger_type to the existing scheduler. Like `contact_analysis`, `learning_session` jobs are self-seeding — bootstrap creates initial jobs per template on startup, and each completed job re-enqueues the next at a self-adjusted interval.

**When to use:** All background autonomous learning is triggered via this path.

```typescript
// Source: backend/src/services/scheduler.ts (existing contact_analysis pattern)

// In scheduler.ts executeJob():
if (job.trigger_type === 'learning_session') {
  const data = JSON.parse(job.trigger_data || '{}') as { template_id?: string };
  const templateId = data.template_id;
  if (!templateId) {
    markJobFailed(job.id, 'Missing template_id in learning_session trigger_data');
    return;
  }

  const template = sqlite.prepare('SELECT id FROM agent_templates WHERE id = ?').get(templateId);
  if (!template) {
    markJobComplete(job.id, JSON.stringify({ skipped: true, reason: 'template_deleted' }));
    return; // Template deleted — do NOT re-enqueue
  }

  try {
    const { runLearningSession } = await import('./learner.js');
    const result = await runLearningSession(templateId);
    // Write to learning_sessions table
    // ...
    markJobComplete(job.id, JSON.stringify({ session_id: sessionId }));
    scheduleNextLearningSession(templateId, result.domainActivity);
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    markJobFailed(job.id, errMsg);
    scheduleNextLearningSession(templateId, -1); // Error backoff
  }
  return;
}
```

### Pattern 2: learner.ts — Research Loop Engine

**What:** The core service. Runs one learning session for a template. Implements the iterative query → search → summarize → gap analysis → refine → repeat loop. Respects the 20-request cap. Returns structured session results.

**When to use:** Called only from scheduler.ts via dynamic import (same as contact-analyzer.ts pattern).

```typescript
// Source: backend/src/services/learner.ts (new file following contact-analyzer.ts pattern)

export interface LearningSessionResult {
  session_id: string;
  template_id: string;
  sources_visited: SourceVisit[];     // Each HTTP request with url, source_type, status
  concepts_retained: number;          // Count of concepts written to DB
  confidence_distribution: {          // Breakdown of confidence levels
    high: number;
    medium: number;
    low: number;
  };
  capped: boolean;                    // true if 20-request limit hit
  duration_ms: number;
  created_at: number;
}

export interface SourceVisit {
  url: string;
  source_type: 'web' | 'github' | 'reddit';
  fetched_at: number;
  http_status: number;
  robots_blocked: boolean;
}

export interface ExtractedConcept {
  content: string;
  source_url: string;
  confidence_score: number;  // 0-100, based on source authority
  memory_kind: 'concept';
  trust_tier: 'low' | 'medium' | 'high';
}
```

### Pattern 3: Confidence Score via Source Authority

**What:** Trust hierarchy for sources, translated to numeric confidence 0-100.

**When to use:** When inserting any concept into the concepts table.

```typescript
// Source: CONTEXT.md locked decision — "Domain-based trust hierarchy, not LLM self-assessment"

function sourceConfidence(url: string): { score: number; tier: 'low' | 'medium' | 'high' } {
  const OFFICIAL_DOMAINS = [
    'github.com', 'docs.github.com', 'developer.mozilla.org', 'nodejs.org',
    'fastify.io', 'npmjs.com', 'typescript-lang.org', 'drizzle-orm.io'
  ];
  const MEDIUM_DOMAINS = [
    'stackoverflow.com', 'medium.com', 'dev.to', 'smashingmagazine.com'
  ];
  // reddit.com, subreddits = low tier
  if (OFFICIAL_DOMAINS.some(d => url.includes(d))) return { score: 85, tier: 'high' };
  if (MEDIUM_DOMAINS.some(d => url.includes(d))) return { score: 55, tier: 'medium' };
  if (url.includes('reddit.com')) return { score: 30, tier: 'low' };
  return { score: 40, tier: 'low' }; // Unknown source
}
```

### Pattern 4: PII Scrubbing Pipeline

**What:** Double protection — LLM prompt instructs no personal data extraction, then post-extraction regex strips known PII patterns from concept content.

**When to use:** Applied to ALL extracted concepts before any DB write.

```typescript
// Source: CONTEXT.md locked decision — "prompt + regex double protection"

const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,  // emails
  /\B@[A-Za-z0-9_]+\b/g,                                       // @handles
  /\b\+?[\d][\d\s\-().]{7,}\d\b/g,                             // phone numbers
  // Personal names: harder — rely on prompt instruction + spot-check
];

function scrubPII(text: string): string {
  let clean = text;
  for (const pattern of PII_PATTERNS) {
    clean = clean.replace(pattern, '[REDACTED]');
  }
  return clean;
}
```

### Pattern 5: robots.txt Check with 24h Cache

**What:** Before fetching any page for content, check if the learner's user-agent is allowed. Cache parsed robots.txt in memory with TTL to avoid redundant fetches.

**When to use:** Before every content fetch.

```typescript
// Source: CONTEXT.md locked decision — "check and cache robots.txt per domain, 24h TTL"

const robotsCache = new Map<string, { rules: ReturnType<typeof robotsParser>; expiresAt: number }>();

async function isAllowed(url: string): Promise<boolean> {
  const { hostname } = new URL(url);
  const now = Date.now();
  let cached = robotsCache.get(hostname);

  if (!cached || cached.expiresAt < now) {
    const robotsUrl = `https://${hostname}/robots.txt`;
    const resp = await fetch(robotsUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': LEARNER_USER_AGENT }
    }).catch(() => null);

    const content = resp?.ok ? await resp.text() : '';
    const rules = robotsParser(robotsUrl, content);
    robotsCache.set(hostname, { rules, expiresAt: now + 24 * 3600 * 1000 });
    cached = robotsCache.get(hostname)!;
  }

  return cached.rules.isAllowed(url, LEARNER_USER_AGENT) ?? true;
}
```

### Pattern 6: migrate-13.ts Structure

**What:** Two new tables (concepts, learning_sessions) plus FTS5 virtual table for concepts.

**When to use:** Follows exact pattern from migrate-12.ts.

```typescript
// Source: backend/src/db/migrate-12.ts (existing migration pattern)

export function migrate13AutonomousLearning(): void {
  const migrationId = 'phase13_autonomous_learning';
  const existing = sqlite.prepare(
    `SELECT 1 FROM schema_migrations WHERE id = ?`
  ).get(migrationId);
  if (existing) return;

  // 1. concepts table — Memory V2 general-purpose relational store
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS concepts (
      id TEXT PRIMARY KEY,
      memory_kind TEXT NOT NULL DEFAULT 'concept'
        CHECK(memory_kind IN ('directive','concept','episode','signal')),
      trust_tier TEXT NOT NULL DEFAULT 'low'
        CHECK(trust_tier IN ('low','medium','high')),
      scope TEXT NOT NULL DEFAULT 'global'
        CHECK(scope IN ('global','project','agent','run')),
      scope_id TEXT,                       -- agent_id, project_id, etc. for non-global scope
      content TEXT NOT NULL,               -- plain text fact/pattern/framework
      source_type TEXT NOT NULL DEFAULT 'learning'
        CHECK(source_type IN ('learning','dispatch','session','human','operator')),
      source_url TEXT,                     -- URL where concept was learned
      confidence_score INTEGER NOT NULL DEFAULT 0
        CHECK(confidence_score BETWEEN 0 AND 100),
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('active','archived','superseded','dismissed')),
      review_state TEXT NOT NULL DEFAULT 'accepted'
        CHECK(review_state IN ('pending','accepted','rejected')),
      superseded_by_id TEXT,
      last_used_at REAL,
      use_count INTEGER NOT NULL DEFAULT 0,
      session_id TEXT,                     -- learning_sessions.id that created this
      created_at REAL DEFAULT (unixepoch('now')),
      updated_at REAL DEFAULT (unixepoch('now'))
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_concepts_scope ON concepts(scope, scope_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_concepts_status ON concepts(status, trust_tier)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_concepts_session ON concepts(session_id)`);

  // 2. concepts FTS5 virtual table (mirrors Phase 11 messages_fts pattern)
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS concepts_fts USING fts5(
      content,
      content_rowid='rowid',
      content='concepts'
    )
  `);
  // FTS5 triggers to stay in sync
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS concepts_ai AFTER INSERT ON concepts BEGIN
      INSERT INTO concepts_fts(rowid, content) VALUES (new.rowid, new.content);
    END
  `);
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS concepts_ad AFTER DELETE ON concepts BEGIN
      INSERT INTO concepts_fts(concepts_fts, rowid, content) VALUES('delete', old.rowid, old.content);
    END
  `);
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS concepts_au AFTER UPDATE ON concepts BEGIN
      INSERT INTO concepts_fts(concepts_fts, rowid, content) VALUES('delete', old.rowid, old.content);
      INSERT INTO concepts_fts(rowid, content) VALUES (new.rowid, new.content);
    END
  `);

  // 3. learning_sessions — audit log per template research run
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS learning_sessions (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
      job_id TEXT,
      sources_visited TEXT NOT NULL DEFAULT '[]',   -- JSON array of SourceVisit
      concepts_retained INTEGER NOT NULL DEFAULT 0,
      confidence_distribution TEXT NOT NULL DEFAULT '{"high":0,"medium":0,"low":0}',
      capped INTEGER NOT NULL DEFAULT 0,            -- 1 if 20-request cap hit
      duration_ms INTEGER,
      error TEXT,
      created_at REAL DEFAULT (unixepoch('now'))
    )
  `);
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_ls_template ON learning_sessions(template_id, created_at DESC)
  `);

  sqlite.prepare(`INSERT INTO schema_migrations (id) VALUES (?)`).run(migrationId);
  console.log('[migrate-13] concepts + learning_sessions + FTS5: created');
}
```

### Pattern 7: scheduleNextLearningSession (self-adjusting cadence)

**What:** Like `scheduleNextContactAnalysis` in scheduler.ts. Domain activity score drives frequency.

**When to use:** Called at end of every learning_session job (success AND error path).

```typescript
// Source: backend/src/services/scheduler.ts (scheduleNextContactAnalysis pattern)

// domainActivity: 0-100 score (learner determines based on domain velocity)
// -1 = error backoff
export function scheduleNextLearningSession(templateId: string, domainActivity: number): void {
  let intervalSec: number;
  if (domainActivity < 0) {
    intervalSec = 12 * 3600;      // 12 hours (error backoff)
  } else if (domainActivity >= 70) {
    intervalSec = 24 * 3600;      // 24 hours (fast-moving domain: TypeScript, AI, React)
  } else if (domainActivity >= 30) {
    intervalSec = 48 * 3600;      // 48 hours (medium-velocity)
  } else {
    intervalSec = 7 * 24 * 3600;  // 7 days (stable/slow domain: accounting, law basics)
  }

  const scheduledFor = Date.now() / 1000 + intervalSec;
  sqlite.prepare(`
    INSERT INTO agent_jobs (id, agent_id, trigger_type, trigger_data, status, scheduled_for, created_at)
    VALUES (?, 'system', 'learning_session', ?, 'pending', ?, unixepoch('now'))
  `).run(
    crypto.randomUUID(),
    JSON.stringify({ template_id: templateId }),
    scheduledFor,
  );
}
```

### Anti-Patterns to Avoid

- **Bypassing AI router then accidentally using it:** learner.ts MUST call `fetch(config.ollamaUrl + '/api/generate', ...)` directly. Never import `dispatch` from ai-router.ts.
- **Storing raw scraped content as concepts:** Content must pass through Ollama extraction prompt + PII scrub before any DB write. Never store raw HTML or raw API responses as concept content.
- **Per-domain robots.txt fetch on every URL:** Cache per-domain with 24h TTL using the in-memory Map pattern shown above. Avoid one `fetch('/robots.txt')` per page.
- **Blocking the scheduler with long learner sessions:** Each session has a 20-request cap. Session runtime should be bounded (target < 60s per session given Qwen's 30s timeout per call). Design the iterative loop to respect a total elapsed time budget.
- **Single `bootstrapLearning()` thundering herd:** Like contact-analyzer, stagger template bootstrapping across a window (10 minutes for 100+ templates = ~6s spacing per template).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DuckDuckGo vqd token session management | Custom vqd extraction from HTML | `duck-duck-scrape` npm | vqd is a session-bound anti-bot token; extracting it requires parsing specific JS payloads. duck-duck-scrape handles this. |
| robots.txt wildcard path matching | Regex rules | `robots-parser` npm | Wildcards, `Allow`/`Disallow` priority rules, `Crawl-delay`, `$` anchors — RFC 9309 compliance is non-trivial |
| GitHub API client | Raw `fetch()` to api.github.com | Existing `octokit` in github.ts | Octokit already handles auth, rate limit headers, pagination |
| FTS5 virtual table sync | Manual index updates on writes | SQLite AFTER INSERT/UPDATE/DELETE triggers | Triggers are the idiomatic FTS5 sync pattern (see Phase 11 messages_fts) |

**Key insight:** The existing `octokit` package (already in package.json) supports `GET /search/repositories` and `GET /search/code` endpoints directly — no new package needed for GitHub search.

---

## Common Pitfalls

### Pitfall 1: DuckDuckGo Rate Limit / Bot Detection
**What goes wrong:** `fetch('https://html.duckduckgo.com/html/?q=...')` returns 202 or a CAPTCHA HTML page, not search results.
**Why it happens:** DuckDuckGo's anti-bot measures require a vqd token and consistent session headers. Raw fetch without vqd fails immediately.
**How to avoid:** Use `duck-duck-scrape` which handles vqd extraction internally. Add a 2-3 second politeness delay between search queries (not between page fetches). If `duck-duck-scrape` fails, catch the error and mark the search as skipped (don't fail the whole session).
**Warning signs:** `result.length === 0` from duck-duck-scrape, or `response` contains "Too Many Requests".

### Pitfall 2: GitHub Search API Secondary Rate Limits
**What goes wrong:** GitHub returns 403 with `secondary rate limit` message even when under 30 req/min primary limit.
**Why it happens:** GitHub's secondary rate limits apply to rapid concurrent requests (within a 1-second window), not just per-minute totals. Even 2 search queries in quick succession can trigger this.
**How to avoid:** Add a 500ms-1s delay between GitHub API calls. Use authenticated requests (octokit with existing workspace connection token) to get 30 req/min vs 10 for unauthenticated. The 20-request session cap provides natural spacing.
**Warning signs:** HTTP 403, message contains "secondary rate limit".

### Pitfall 3: Reddit Blocking Data-Center IPs
**What goes wrong:** Reddit returns 429 or serves CAPTCHA for requests from VPS/data-center IPs.
**Why it happens:** Reddit flags non-residential IP ranges as scrapers. The server runs on a VPS (AMD EPYC, shared infrastructure).
**How to avoid:** Set a realistic browser-like User-Agent header (`Mozilla/5.0 (compatible; PorterLearner/1.0; educational research)`). Add 1-2s delay between Reddit requests. If blocked, mark Reddit as unavailable for that session and rely on web + GitHub sources.
**Warning signs:** HTTP 429, response body contains `{"message":"Too Many Requests","error":429}`.

### Pitfall 4: Concepts Table Scope Confusion
**What goes wrong:** Learning sessions write concepts with scope='global' instead of scoping to the template.
**Why it happens:** The concepts table has a `scope` column with values: global/project/agent/run. For template-linked knowledge, the correct scope is 'agent' with `scope_id = template_id`.
**How to avoid:** Always write template learning concepts with `scope='agent'` and `scope_id = template.id`. The `GET /memory/concepts?agent_id=X` endpoint filters on `scope='agent' AND scope_id = agent_id`.

### Pitfall 5: Qwen JSON Parsing Failure on Concept Extraction
**What goes wrong:** Ollama returns Qwen output with markdown code fences, or malformed JSON that crashes `JSON.parse`.
**Why it happens:** Qwen sometimes wraps JSON output in ```json ... ``` blocks even when `format: 'json'` is specified.
**How to avoid:** Use the same pattern as `contact-analyzer.ts` — strip leading/trailing code fence markers before `JSON.parse`. Use a try/catch and return empty concept array on parse failure rather than throwing.
**Warning signs:** `JSON.parse` throws `SyntaxError: Unexpected token`. Raw response starts with backtick.

### Pitfall 6: concepts INTEGER id vs TEXT id for FTS5 Rowid
**What goes wrong:** FTS5 virtual table `content_rowid` alignment breaks if concepts uses TEXT primary key.
**Why it happens:** FTS5 `content_rowid` must reference an INTEGER rowid. SQLite assigns an implicit INTEGER rowid to every row even with TEXT PRIMARY KEY — `content_rowid='rowid'` uses the implicit rowid.
**How to avoid:** The schema above uses `content_rowid='rowid'` referencing SQLite's implicit rowid (not the `id` TEXT column). This is the same pattern as Phase 11's `messages_fts`. Do NOT use `content_rowid='id'` — it fails with TEXT PKs.

---

## Code Examples

### DuckDuckGo Search via duck-duck-scrape
```typescript
// Source: https://github.com/Snazzah/duck-duck-scrape (MIT, v2.2.7)
import { search } from 'duck-duck-scrape';

const results = await search('TypeScript async patterns site:github.com', {
  safeSearch: 0,
});
// results.results: Array<{ title, url, description, hostname }>
// Returns [] on rate limit rather than throwing — check length
```

### GitHub Repository Search via existing octokit
```typescript
// Source: docs.github.com/en/rest/search — octokit already in package.json
import { getGitHubClient } from './github.js';

const octokit = await getGitHubClient(); // Uses workspace OAuth token
const { data } = await octokit.request('GET /search/repositories', {
  q: 'topic:typescript stars:>100',
  sort: 'stars',
  per_page: 5,
});
// data.items: Array<{ full_name, description, html_url, stargazers_count }>
```

### Reddit Subreddit JSON Fetch
```typescript
// Source: https://til.simonwillison.net/reddit/scraping-reddit-json
// Reddit .json endpoint — public, no auth, 10 req/min for unauthed

const LEARNER_USER_AGENT = 'PorterLearner/1.0 (educational research bot)';

const url = `https://www.reddit.com/r/${subreddit}/top.json?limit=10&t=month`;
const resp = await fetch(url, {
  headers: { 'User-Agent': LEARNER_USER_AGENT },
  signal: AbortSignal.timeout(10000),
});
if (!resp.ok) {
  // 429 = rate limited; treat as source unavailable, don't throw
  return [];
}
const data = await resp.json() as {
  data: { children: Array<{ data: { title: string; selftext: string; permalink: string } }> }
};
const posts = data.data.children.map(c => ({
  title: c.data.title,
  text: c.data.selftext,
  url: `https://www.reddit.com${c.data.permalink}`,
}));
```

### Ollama Extraction Call (contact-analyzer pattern)
```typescript
// Source: backend/src/services/contact-analyzer.ts (verified, lines 167-205)

const resp = await fetch(`${config.ollamaUrl}/api/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: config.ollamaModel,
    prompt: extractionPrompt,
    stream: false,
    format: 'json',
  }),
  signal: AbortSignal.timeout(30000),
});
if (!resp.ok) throw new Error(`Ollama returned HTTP ${resp.status}`);
const data = await resp.json() as { response: string };
let cleaned = data.response.trim();
if (cleaned.startsWith('```')) {
  cleaned = cleaned.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '');
}
const parsed = JSON.parse(cleaned);
```

### Learning Session Extraction Prompt Pattern
```typescript
// Source: CONTEXT.md locked decision — structured expertise frameworks, not data dumps

const extractionPrompt = `You are a knowledge extraction engine for a domain expert AI agent.
Analyze the following web content about "${topic}" and extract ONLY domain knowledge.

STRICT RULES:
- Extract patterns, best practices, tradeoffs, and decision frameworks
- NEVER extract personal information: no email addresses, usernames, personal names, phone numbers
- Output structured expertise, not encyclopedic facts
- Each concept must be a standalone actionable insight

Content:
${contentChunk}

Return ONLY this exact JSON:
{
  "concepts": [
    {
      "content": "<one concrete insight, pattern, or best practice — max 200 chars>",
      "concept_type": "pattern|tradeoff|best_practice|decision_framework|common_mistake"
    }
  ],
  "domain_activity": <integer 0-100 — how fast-moving is this domain>
}

Rules:
- Return ONLY the JSON object
- Maximum 5 concepts per chunk
- concepts array may be empty if no actionable knowledge found
- domain_activity: 80-100 = rapidly evolving (AI, JS frameworks), 20-40 = stable (SQL basics, HTTP fundamentals)`;
```

### Request Cap Tracking
```typescript
// Source: CONTEXT.md — "20-request cap per session, logs capped: true if hit"
// Decision: cap = outbound HTTP requests (each fetch() call counts as 1)

class SessionBudget {
  private used = 0;
  private readonly max: number;

  constructor(max = 20) { this.max = max; }

  consume(n = 1): boolean {
    if (this.used + n > this.max) return false; // would exceed cap
    this.used += n;
    return true;
  }

  get remaining() { return this.max - this.used; }
  get capped() { return this.used >= this.max; }
  get count() { return this.used; }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DuckDuckGo raw HTML fetch | Must use vqd token session (or duck-duck-scrape) | 2024-2025 | Raw fetch no longer reliable; need library wrapper |
| Reddit OAuth via legacy app creation | Self-service API keys discontinued Nov 2025 | Nov 2025 | Must use .json endpoints (unauthenticated) or pre-existing OAuth; no new self-service keys |
| GitHub Search: 60 req/hr unauthenticated | 10 req/min unauthenticated; authenticated (OAuth) = 30 req/min | May 2025 update | Authenticated via workspace GitHub connection preferred for better rate limits |
| porter.py memory tables | Drizzle-managed concepts table (Phase 13 first implementation) | Phase 13 | General-purpose Memory V2 store, replaces ad-hoc porter.py tables |

**Deprecated/outdated:**
- `porter.py` memory/cortex tables: All Memory V2 storage for the Fastify backend goes in the new Drizzle `concepts` table. Phase 13 is the first clean implementation.
- Manual vqd extraction from DuckDuckGo HTML: duck-duck-scrape wraps this.

---

## Open Questions

1. **DuckDuckGo reliability at VPS IP**
   - What we know: DuckDuckGo rate-limits automated clients; duck-duck-scrape v2.2.7 handles vqd; multiple popular tools (open-webui, crewAI) report frequent 202 responses.
   - What's unclear: Whether porter's VPS IP (76.13.190.52) will consistently trigger anti-bot blocks or if a proper User-Agent + 2-3s delays are sufficient.
   - Recommendation: Implement DuckDuckGo as primary, design `runLearningSession` to degrade gracefully (session continues with GitHub + Reddit sources if web search fails). Log `sources_blocked` per session for monitoring.

2. **Request cap semantics: HTTP requests vs search queries**
   - What we know: CONTEXT.md says "Claude determines whether this counts outbound HTTP requests or search queries." The 20-request cap needs a concrete definition.
   - What's unclear: Whether one DuckDuckGo search (which may internally make 2-3 HTTP calls via duck-duck-scrape) counts as 1 or 3.
   - Recommendation: Count user-visible "search/fetch actions" (1 web search = 1, 1 GitHub search = 1, 1 page content fetch = 1). Don't count internal retry or robots.txt fetches. This gives the most intuitive session budget.

3. **Iterative loop depth within 20-request cap**
   - What we know: Each iteration consumes at minimum: 1 search + 1-2 content fetches + 1 Ollama call. At 20 requests, that's roughly 4-5 full iterations.
   - What's unclear: The right balance between iteration depth and source breadth.
   - Recommendation: Start with 3 iterations max per session (search + fetch + extract + gap analysis). Adjust based on real session logs.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bash + curl (smoke tests, project standard) |
| Config file | tests/smoke-phase13.sh (Wave 0 gap) |
| Quick run command | `./tests/smoke-phase13.sh` |
| Full suite command | `./tests/smoke-phase13.sh && cd tests && npx playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LEARN-01 | GET /agents/:id/learning-sessions returns array | smoke | `./tests/smoke-phase13.sh` | ❌ Wave 0 |
| LEARN-01 | learning_session job appears in agent_jobs after bootstrap | smoke | `./tests/smoke-phase13.sh` | ❌ Wave 0 |
| LEARN-02 | GET /memory/concepts?agent_id=:id returns concepts with source_url and confidence_score populated | smoke | `./tests/smoke-phase13.sh` | ❌ Wave 0 |
| LEARN-02 | Grep concepts content for email/handle patterns returns zero | smoke | `./tests/smoke-phase13.sh` | ❌ Wave 0 |
| LEARN-03 | GET /agents/:id/learning-sessions returns records with sources_visited, concepts_retained, confidence_distribution, capped fields | smoke | `./tests/smoke-phase13.sh` | ❌ Wave 0 |
| LEARN-03 | Session with 20 HTTP requests has capped=true | smoke | `./tests/smoke-phase13.sh` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `./tests/smoke-phase13.sh`
- **Per wave merge:** `./tests/smoke-phase13.sh && cd tests && npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/smoke-phase13.sh` — covers LEARN-01, LEARN-02, LEARN-03 (model: smoke-phase12.sh)
- [ ] `backend/src/db/migrate-13.ts` — concepts + learning_sessions + FTS5
- [ ] `backend/src/db/schema.ts` — append concepts, learningSessions Drizzle table definitions
- [ ] `backend/src/services/learner.ts` — research loop engine

---

## Sources

### Primary (HIGH confidence)
- `backend/src/services/contact-analyzer.ts` — Ollama call pattern, parseAnalysis, DEFAULT fallback, clampScore — primary implementation template
- `backend/src/services/scheduler.ts` — scheduleNextContactAnalysis, bootstrapContactAnalysis, executeJob contact_analysis branch — scheduler extension pattern
- `backend/src/db/schema.ts` — Drizzle table definitions, sql`` defaults, real/integer/text column patterns
- `backend/src/db/migrate-12.ts` — migrate function structure, idempotency guard, schema_migrations insert
- `backend/src/lib/envelope.ts` — ok()/err() response helpers
- `backend/src/services/github.ts` — octokit usage pattern, resolveClient, markNeedsReauth
- `research/porter-memory-v2.md` — Memory V2 data model: memory_kind, trust_tier, scope, status, source_type, review_state fields
- `.planning/phases/02-memory-v2/02-CONTEXT.md` — FTS5 search, scope model (global/project/agent), 500-token injection cap
- `backend/src/config.ts` — config.ollamaUrl, config.ollamaModel constants

### Secondary (MEDIUM confidence)
- [GitHub REST API Rate Limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) — authenticated search: 30 req/min; unauthenticated: 10 req/min; updated May 2025
- [Simon Willison — Scraping Reddit JSON](https://til.simonwillison.net/reddit/scraping-reddit-json) — .json endpoint format, User-Agent requirement, Listing data structure
- [duck-duck-scrape npm](https://www.npmjs.com/package/duck-duck-scrape) — v2.2.7, MIT license, handles vqd
- [robots-parser npm](https://www.npmjs.com/package/robots-parser) — v3.0.1, RFC 9309 compliant

### Tertiary (LOW confidence — flagged for validation)
- DuckDuckGo vqd reliability in 2026: Multiple community reports (open-webui, crewAI, local-deep-research issues) suggest ongoing 202 rate-limit problems. Duck-duck-scrape is the best available wrapper but may still fail on VPS IPs.
- Reddit blocking data-center IPs: Inferred from general scraping guidance; not verified against porter's specific IP range.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already in project or verified on npm with current versions
- Architecture: HIGH — direct extension of proven Phase 12 patterns (contact-analyzer, scheduler)
- Pitfalls: HIGH — DuckDuckGo bot detection and GitHub secondary rate limits verified from multiple community sources; FTS5 rowid pattern verified from Phase 11 implementation
- DuckDuckGo reliability: MEDIUM — library exists but VPS IP behavior not tested

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (30 days for DuckDuckGo/Reddit API behavior; GitHub rate limits stable)
