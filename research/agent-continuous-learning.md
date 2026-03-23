# Agent Continuous Learning via Email Subscriptions

**Author:** Moe (concept) + Claude (architecture)
**Date:** 2026-03-23
**Status:** Approved concept, awaiting scheduling

---

## Vision

Every agent gets an email address. Each agent subscribes to industry blogs relevant to its role. Blog posts arrive as newsletters, get extracted to clean markdown, analyzed by the agent, and fed into Memory V2's signal→concept promotion pipeline. Over time, agents develop genuine domain expertise through continuous passive learning.

This is Porter's moat — every day agents run, they get smarter. Competitors starting fresh can't replicate months of accumulated signal.

---

## Prerequisites

- Email infrastructure operational (MX records, SMTP/IMAP for askporter.app)
- Memory V2 signal→concept pipeline working (already built)
- Agent identity rebuild on concept threshold (already built — 5+ signals)

---

## Phase 1: Email Infrastructure for Agents

**Goal:** Each agent gets a functional inbox.

### Tasks
1. **Agent email provisioning** — when an agent is created/forged, auto-provision `{agent-slug}@askporter.app` (or subdomain like `agents.askporter.app`)
2. **IMAP polling service** — background worker checks agent inboxes on a schedule (every 15-30 min)
3. **Email parser** — extract sender, subject, date, HTML body from each message
4. **Agent inbox table** — `agent_emails` table: id, agent_id, from, subject, raw_html, received_at, status (unread/processed/rejected)
5. **Admin UI** — inbox view per agent showing received emails and processing status

### Decisions
- **Email provider:** Self-hosted (Postfix/Dovecot) vs managed (Fastmail API, Google Workspace, Mailgun inbound)? Managed is simpler but costs per-mailbox. Recommendation: **Mailgun inbound routing** — one catch-all on `agents.askporter.app`, route by To address, webhook delivers to Porter API. No IMAP polling needed.
- **Catch-all vs individual:** Catch-all is simpler. `*@agents.askporter.app` → webhook → Porter routes by prefix.

---

## Phase 2: Content Extraction Pipeline

**Goal:** Turn raw email HTML into clean, structured markdown.

### Tasks
1. **Readability extraction** — integrate Mozilla Readability (JS, runs in Node) to strip navigation, ads, footers, tracking pixels. Extract article title + body.
2. **HTML-to-Markdown conversion** — Turndown.js converts clean HTML to markdown. Configure for: preserving headers, links, code blocks, images (as URLs).
3. **Metadata extraction** — source blog name, author, publish date, estimated read time, detected topics/tags (keyword extraction, no LLM needed here).
4. **Content deduplication** — hash extracted content body. If same hash exists (same article from multiple newsletters), skip. Also fuzzy-match title+date for near-duplicates.
5. **Document store** — `agent_documents` table: id, agent_id, email_id, title, author, source, markdown_content, content_hash, extracted_at, analysis_status
6. **Quality gate** — reject emails that aren't articles (promotional, transactional, unsubscribe confirmations). Simple heuristic: word count < 200 = skip. No article body detected by Readability = skip.

### Libraries
- `@mozilla/readability` — article extraction (used by Firefox)
- `turndown` — HTML to Markdown
- `crypto.createHash('sha256')` — content dedup
- All lightweight, no external APIs needed

---

## Phase 3: Agent Analysis & Learning

**Goal:** Agent reads extracted articles and generates Memory V2 signals.

### Tasks
1. **Relevance scoring** — first pass with local Qwen (cheap): "Is this article relevant to {agent_role}? Score 0-10." Articles scoring < 4 get archived without further analysis. Saves LLM costs.
2. **Deep analysis** — relevant articles go to the agent's assigned model. Prompt: "You are {agent_name}, a {agent_role}. Read this article and extract 1-5 key insights relevant to your expertise. Format as discrete observations." Output: list of signal candidates.
3. **Signal creation** — each insight becomes a Memory V2 Signal (low-trust). Tagged with source article, date, confidence.
4. **Concept promotion** — existing Memory V2 logic handles this. When 3+ signals from different sources converge on the same insight, promote to Concept (high-trust, durable knowledge).
5. **Identity rebuild trigger** — existing 5+ new concepts threshold triggers agent respawn with updated knowledge. The agent's personality/behavior evolves.
6. **Learning log** — `agent_learning_log` table: id, agent_id, document_id, signals_created, concepts_promoted, analyzed_at. Visible in admin.

### Cost Control
- **Batch processing:** Run analysis once daily (overnight SGT), not real-time
- **Qwen triage first:** Only 30-40% of articles should pass relevance gate
- **Token budget per agent:** Configurable daily/weekly cap on analysis tokens
- **Cheapest capable model:** Use Qwen for triage, GPT-5.4 for deep analysis only when needed

---

## Phase 4: Subscription Management

**Goal:** Agents discover and subscribe to relevant content sources.

### Tasks
1. **Subscription table** — `agent_subscriptions`: id, agent_id, source_name, source_url, email_address_used, subscribed_at, status (active/paused/unsubscribed), articles_received, last_article_at
2. **Admin subscription UI** — manage subscriptions per agent. Add/remove/pause.
3. **Agent-recommended sources** — given an agent's role, have it suggest 5-10 relevant newsletters/blogs. Admin approves before subscribing. Prompt: "You are a {role}. What are the top 10 industry newsletters you should read?"
4. **Auto-subscribe flow** — once approved, Porter navigates to the blog's subscribe page and submits the agent's email. Most newsletters just need an email field POST. Build a simple subscription worker that handles common patterns.
5. **Health monitoring** — detect dead subscriptions (no emails in 30+ days), alert admin

---

## Phase 5: Feedback Loop & Visibility

**Goal:** Make learning visible and steerable.

### Tasks
1. **Agent knowledge dashboard** — per-agent view: subscriptions, articles processed, signals generated, concepts formed, last learning event
2. **Learning timeline** — visual timeline showing what the agent learned and when
3. **Manual feed** — admin can drop a URL or markdown file directly into an agent's learning pipeline (bypass email)
4. **Agent self-reporting** — in chat, agent can reference learned concepts: "Based on recent industry analysis, I've observed that..."
5. **Cross-agent knowledge sharing** — when one agent learns something relevant to another agent's domain, create a signal for the second agent too (with lower confidence)
6. **Usage in work output** — agents cite their learned concepts when producing deliverables. Verifiable chain: source article → signal → concept → work output.

---

## Database Schema (Draft)

```sql
-- Agent email addresses
CREATE TABLE agent_emails (
  id INTEGER PRIMARY KEY,
  agent_id TEXT NOT NULL,
  email_address TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Inbound emails
CREATE TABLE agent_inbox (
  id INTEGER PRIMARY KEY,
  agent_id TEXT NOT NULL,
  from_address TEXT,
  subject TEXT,
  raw_html TEXT,
  received_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'unread' CHECK (status IN ('unread','processing','processed','rejected'))
);

-- Extracted articles
CREATE TABLE agent_documents (
  id INTEGER PRIMARY KEY,
  agent_id TEXT NOT NULL,
  inbox_id INTEGER REFERENCES agent_inbox(id),
  title TEXT,
  author TEXT,
  source TEXT,
  markdown_content TEXT,
  content_hash TEXT UNIQUE,
  word_count INTEGER,
  relevance_score REAL,
  extracted_at TEXT DEFAULT (datetime('now')),
  analysis_status TEXT DEFAULT 'pending' CHECK (analysis_status IN ('pending','analyzing','complete','skipped'))
);

-- Subscriptions
CREATE TABLE agent_subscriptions (
  id INTEGER PRIMARY KEY,
  agent_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT,
  subscribed_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active','paused','unsubscribed')),
  articles_received INTEGER DEFAULT 0,
  last_article_at TEXT
);

-- Learning log
CREATE TABLE agent_learning_log (
  id INTEGER PRIMARY KEY,
  agent_id TEXT NOT NULL,
  document_id INTEGER REFERENCES agent_documents(id),
  signals_created INTEGER DEFAULT 0,
  concepts_promoted INTEGER DEFAULT 0,
  analyzed_at TEXT DEFAULT (datetime('now'))
);
```

---

## Dependencies

| Phase | Depends On | Estimated Complexity |
|-------|-----------|---------------------|
| Phase 1 | Email infrastructure (MX, Mailgun or equivalent) | Medium |
| Phase 2 | Phase 1 | Low (solved libraries) |
| Phase 3 | Phase 2 + Memory V2 (exists) | Medium |
| Phase 4 | Phase 1 | Low-Medium |
| Phase 5 | Phases 1-4 | Medium |

---

## Open Questions

1. Self-hosted email vs Mailgun inbound routing? (Recommendation: Mailgun)
2. Token budget per agent per day? (Suggestion: configurable, default 10k tokens/day)
3. Should agents share a single email domain or each workspace gets its own?
4. Archive policy — keep all articles forever or prune after concept extraction?
5. Should this integrate with RSS as well, or email-only for v1?
