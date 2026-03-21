# Pitfalls Research

**Domain:** AI Orchestration Platform — v2.0 Feature Addition (Streaming, Collaboration, CRM, Billing, Autonomous Learning)
**Researched:** 2026-03-21
**Confidence:** HIGH (grounded in actual codebase analysis + verified against external sources)

This file extends the v1.0 pitfalls (`researched: 2026-03-20`) with pitfalls specific to the v2.0 feature set: token streaming, collaborative RBAC, unified chat, CRM, file associations, agent templates, autonomous learning, Lemon Squeezy billing, and error capture. The v1.0 pitfalls remain valid and are not repeated here.

---

## Critical Pitfalls

### Pitfall 1: SSE Streaming That Proxies Instead of Streams

**What goes wrong:**
The current `GET /api/v1/chat/stream` route (chat.ts:165-227) already exists but it proxies the full response from porter.py via `fetch()` and then pipes it. This is block-dump streaming — the backend accumulates the full response from porter.py before forwarding, because `fetch()` on a response from porter.py resolves the full body before the pump loop begins. From the client's perspective, the response arrives in one block after the model finishes generation, not token-by-token.

Moving to true token streaming means the AI backend (Ollama, OpenClaw) must emit each token as a separate SSE `data:` event, and the Fastify handler must forward each event chunk to the client socket immediately, with zero buffering. The failure mode is subtle: the pump loop in chat.ts looks correct but `reply.raw.write(value)` will buffer if the socket's write buffer is full and backpressure is not handled. Under slow clients or slow network, Node.js silently drops events or delays them, producing the same block-dump effect despite the streaming code being "correct."

**Why it happens:**
Developers test streaming on localhost where the client consumes faster than the buffer fills. The streaming "works" locally but degrades on remote connections or under load. The proxy pattern (porter.py → Fastify → client) adds an extra buffering layer that defeats streaming even when both sides support it.

**How to avoid:**
- The Fastify handler must own the full AI call — no proxying through porter.py for streaming routes. Call the AI backend directly from Fastify (Ollama or OpenClaw) using their native streaming APIs.
- For Ollama: use `fetch(ollamaUrl, { method: 'POST', body: ... })` with `upstream.body.getReader()` and emit each chunk as `data: {"token":"..."}\n\n` immediately without buffering.
- For OpenClaw: use the same ReadableStream reader pattern.
- Check `reply.raw.write(chunk)` return value. If it returns `false`, wait for the `drain` event before writing more. Ignoring backpressure causes silent event drops on slow connections.
- Send SSE heartbeat (`data: [PING]\n\n`) every 15 seconds to prevent proxy/load balancer timeout disconnections.
- Set `X-Accel-Buffering: no` header (already in current code — keep it).
- Never buffer the full streaming response in a string before sending — each token must hit the wire immediately.

**Warning signs:**
- Streaming "works" in curl/localhost but not in the browser behind the SSH tunnel
- `time_to_first_token` is nearly equal to `total_generation_time` (entire response arrives at once)
- Nginx logs show single large response body instead of chunked transfer encoding
- Client shows spinner until done, then whole response appears

**Phase to address:** Streaming phase (first v2.0 phase). This is foundational — unified chat and collaborative sessions both depend on streaming being real.

---

### Pitfall 2: Cancellation That Does Not Actually Stop the LLM

**What goes wrong:**
STRM-03 requires that a client can cancel a streaming response and the backend stops generation. The naive implementation: client sends `DELETE /api/v1/chat/stream/:id` → backend marks a flag in a Map → next streaming chunk checks flag → pump loop breaks. This has two failure modes.

First, the AbortSignal is not passed to the upstream AI backend fetch call. The pump loop breaks on the Node.js side, but Ollama or OpenClaw continues generating tokens and consuming GPU/CPU resources because the HTTP connection to them is still open. The backend "stopped" streaming to the client but the model runs to completion.

Second, when the client closes the browser tab or navigates away, the `request.socket.on('close')` event fires but there is no wiring that propagates this to the upstream abort. The generation runs to completion, the full token count is billed, and the resources are wasted.

**Why it happens:**
The pattern requires threading an `AbortController` signal through the entire call stack: Fastify request → AI router dispatch → fetch to Ollama/OpenClaw → ReadableStream reader. Every layer must check or forward the signal. Most implementations stop at the first layer.

**How to avoid:**
```typescript
// In the streaming route handler
const ac = new AbortController();
request.raw.on('close', () => ac.abort());

// Pass signal to upstream fetch
const upstream = await fetch(aiUrl, {
  method: 'POST',
  body: JSON.stringify(payload),
  signal: ac.signal,  // THIS stops Ollama when client disconnects
});

// Also pass to reader loop
try {
  while (true) {
    const { done, value } = await reader.read();
    if (done || ac.signal.aborted) break;
    reply.raw.write(formatSSEChunk(value));
  }
} finally {
  reader.cancel();  // Release stream resources
  reply.raw.end();
}
```
The `fastify-racing` plugin provides a pre-built `request.abortSignal` that fires on client disconnect — consider using it to avoid reinventing this wiring.

**Warning signs:**
- Ollama process shows 100% CPU after user cancelled a response
- Token usage logs show complete token counts for "cancelled" responses
- `htop` shows sustained model load after every user abort

**Phase to address:** Streaming phase. Cancellation must be part of the initial streaming implementation, not a follow-up.

---

### Pitfall 3: Per-Project RBAC That Leaks Across Projects

**What goes wrong:**
COLLAB-02 requires per-person roles at the project level. The existing RBAC (4 global roles: platform_admin, admin, operator, viewer) is enforced via `fastify.requireAuth` and `auth_check_cap()`. Adding per-project roles means a user can be "editor" on project A and "viewer" on project B. The critical failure mode is an IDOR (Insecure Direct Object Reference): a user authenticates as an editor on project A, then calls `GET /api/v1/projects/project-B-id/agents` — the auth middleware confirms the session is valid (global role check passes), but never checks whether this user has any access to project B.

This is especially dangerous because chat messages, file uploads, and agent interactions are all associated with a project. A single missed project-scope check means a collaborator on one project can read all messages, files, and agent activity from any other project they can guess the ID of.

**Why it happens:**
Global RBAC is implemented once in middleware and developers trust it. Project-scoped checks require explicit code in each route handler — "does this user have at least `view` permission on project X?" Every new route is a potential miss. The check is easy to forget when adding a new route under time pressure.

**How to avoid:**
- Create a `project_collaborators` table: `(project_id, username, role, invited_by, created_at)`.
- Write a single `requireProjectAccess(projectId, minRole)` Fastify middleware factory that: (1) verifies the session, (2) checks the `project_collaborators` table for the user+project combination, (3) enforces role hierarchy (admin > edit > chat > view), (4) short-circuits if the user is the project owner.
- Every route that touches project-scoped data MUST call this middleware. Make it impossible to forget: create a route registration wrapper `registerProjectRoute()` that requires the minimum role parameter.
- Write an integration test that attempts cross-project access with a valid session token from project A and verifies 403 from all project B endpoints.

**Warning signs:**
- `GET /api/v1/projects/:id` succeeds for any authenticated user regardless of collaboration status
- Chat messages from a private project are visible to workspace members who were not invited
- A new route was added to agents.ts without a project-scope permission check

**Phase to address:** Collaboration phase. The `project_collaborators` table and `requireProjectAccess` middleware must be established before any collaborative feature is built. Never retrofit.

---

### Pitfall 4: Unified Chat Schema That Cannot Evolve

**What goes wrong:**
CHAT-01 requires a single conversation API covering agents, projects, and external channel messages. The existing `chats` + `chat_messages` schema (schema.ts:45-74) was designed for single-user, single-agent conversations. Extending it for unified chat by adding columns (`channel_type`, `external_id`, `parent_message_id`, `thread_root_id`) to the existing tables creates an unmigrateable mess.

The deeper problem: SQLite does not support `ADD COLUMN` with a non-null constraint or a DEFAULT value that requires a subquery. Adding `parent_message_id TEXT REFERENCES chat_messages(id)` to a table with 50,000 existing rows requires either a table rebuild (full lock, minutes of downtime on the VPS) or accepting that all historical messages have `parent_message_id = NULL` and treating that as "no parent" — which is fine, but the Drizzle schema and TypeScript types must explicitly model this as nullable and never assume all messages have a thread context.

The schema also currently stores blobs in `chat_attachments.data` (schema.ts:72). For unified chat that surfaces WhatsApp images, email attachments, and uploaded files in the same stream, storing binary blobs in SQLite will destroy database performance. A single large attachment makes the entire table row larger, slowing down message list queries that don't need the blob at all.

**Why it happens:**
Chat schemas start simple and grow incrementally. Each feature adds one column. Nobody redesigns because "it still works." By the time external channels are added, the schema has 15 columns and is unmaintainable.

**How to avoid:**
- Design the unified conversation schema from scratch for v2.0. Do not extend `chats`/`chat_messages`. Create new tables: `conversations`, `messages`, `message_attachments`. Migrate existing chats to the new schema in the migration script.
- `messages` schema: `(id, conversation_id, parent_message_id, role, content, channel_type, external_id, created_at)`. `channel_type` is an enum: `agent | user | email | whatsapp | webhook`.
- Never store blob data in `message_attachments`. Store `file_path` and `file_size`. The actual file lives on disk or in the uploads directory. The blob column in `chat_attachments` must be removed in v2.0 migration.
- Use `parent_message_id` for threading (nullable = root message). Add an index on `(conversation_id, parent_message_id)` for efficient thread queries.
- Write the Drizzle schema first. Run Drizzle's type inference to verify the TypeScript types are correct before writing any route code.

**Warning signs:**
- New conversation features require touching the `chats` table in porter.py AND the `chats` table in the Fastify schema
- `message_attachments` table contains blob columns being loaded in LIST queries (catastrophic N+1)
- Thread queries require recursive CTEs on a table with no `parent_message_id` index

**Phase to address:** Unified chat phase. Schema design must precede any chat route implementation.

---

### Pitfall 5: Webhook Idempotency Not Implemented for Billing

**What goes wrong:**
Lemon Squeezy retries webhook delivery up to 3 times with exponential backoff (5s, 25s, 125s). If the Fastify handler processes a `subscription_created` event and then takes >5 seconds to respond (database write slow, downstream API call), Lemon Squeezy retries. The handler processes the same event again. Now the user has two subscription records, double-charged, with two trial periods starting.

The `billing_events` table already has `ls_event_id` (schema.ts:249) designed for deduplication. But if the dedup check and the event processing are not in the same database transaction, a race condition between two concurrent retry deliveries can pass the dedup check simultaneously, both finding no existing record, and both inserting.

**Why it happens:**
Webhook handlers are written to process one event at a time. The happy path (single delivery) works in testing. Retry behavior is only visible in production when the handler is slow or the server is under load.

**How to avoid:**
```typescript
// In the webhook handler
const result = sqlite.transaction(() => {
  // Atomic dedup check + insert
  const existing = sqlite.prepare(
    'SELECT 1 FROM billing_events WHERE ls_event_id = ?'
  ).get(event.meta.event_id);
  if (existing) return { duplicate: true };

  sqlite.prepare(
    'INSERT INTO billing_events (ls_event_id, event_type, username, payload) VALUES (?, ?, ?, ?)'
  ).run(event.meta.event_id, eventType, username, JSON.stringify(event));

  return { duplicate: false };
})();

if (result.duplicate) {
  return reply.code(200).send({ ok: true, skipped: true }); // Acknowledge to stop retries
}
// Now process the event (update subscription, etc.)
```
The dedup check and the event record insert MUST be in the same SQLite transaction. The webhook handler must respond 200 immediately after the transaction commits — do not make external API calls before responding.

**Warning signs:**
- `billing_events` table shows duplicate `ls_event_id` values
- User subscription status oscillates between states (webhook replays overwriting each other)
- Stripe/LS dashboard shows "webhook failed" even though the handler ran

**Phase to address:** Billing phase. Idempotency must be implemented before the billing webhook goes live, not after the first duplicate is discovered.

---

### Pitfall 6: Plan Limit Enforcement at the Wrong Layer

**What goes wrong:**
BILL-03 requires plan limits enforced at the API level. The common mistake is implementing limits as checks in individual route handlers: "if user is on free plan, return 403 if they already have 5 projects." This scatters enforcement across dozens of handlers. When a new route is added (e.g., `POST /api/v1/projects/duplicate`), it skips the limit check. Users exceed plan limits through new routes before anyone notices.

The second mistake is checking limits against a count query without locking: `SELECT COUNT(*) FROM projects WHERE owner = ?` → check → `INSERT`. Under concurrent requests, two simultaneous project creation requests both see count=4 (limit=5), both pass, both insert, leaving the user with 6 projects on a 5-project plan.

**Why it happens:**
Limit enforcement feels like a one-time "add a check here" problem. Developers add checks where they remember to and miss places they forgot. The race condition is invisible under single-user testing.

**How to avoid:**
- Create a single `enforceLimit(username, resource, limit)` function that wraps the count check in a SQLite transaction with a table-level lock: `BEGIN EXCLUSIVE; SELECT COUNT(*); if count >= limit ROLLBACK; INSERT; COMMIT`. `BEGIN EXCLUSIVE` prevents concurrent writers from passing the limit simultaneously.
- Call `enforceLimit` via a Fastify preHandler middleware applied to ALL resource-creating routes in bulk. Do not call it manually inside handlers.
- Keep plan limits in a central config object (already started in billing.ts). Never hardcode a limit number in a route handler.
- Test: write a concurrent test that sends 10 simultaneous project creation requests for a user on a 5-project plan and verifies exactly 5 succeed.

**Warning signs:**
- User has more projects/agents than their plan allows (check database counts vs. plan definitions)
- New route added to projects.ts without a preHandler reference to `enforceLimit`
- Plan limit tests only test single-threaded sequential creation

**Phase to address:** Billing phase. Limit enforcement architecture must be established before any route uses it.

---

### Pitfall 7: Autonomous Learning That Gets Porter Banned or Sued

**What goes wrong:**
LEARN-01 requires agents to search web, X/Twitter, Reddit, and GitHub. The naive implementation: agent calls a `web_search` tool in a loop, fetches pages, extracts text, stores as Memory V2 concepts. On a 2 vCPU VPS with no rate limiting, an agent doing 50 searches per learning session hits target sites with a sustained crawl that triggers IP bans within hours. X/Twitter's API has strict rate limits (15-60 requests per 15 minutes depending on endpoint) and blocking unauthenticated scraping is aggressive.

Reddit's API (after the 2023 changes) requires OAuth with explicit rate limiting at 100 requests/minute. GitHub's API is 60 unauthenticated requests/hour, 5,000 with token. Scraping GitHub web pages (not API) violates ToS.

GDPR risk: if learning extracts personal data (names, emails visible on public GitHub profiles, Reddit usernames linked to posts) and stores it as Memory V2 concepts, Porter has created a personal data store without a legal basis for processing. Maximum fine: €20M or 4% of revenue.

**Why it happens:**
Agents are tested against controlled URLs that don't rate limit. Production behavior against real targets is only discovered after banning.

**How to avoid:**
- Use official APIs only: Brave Search API (for web), GitHub API with token, Reddit OAuth API, X Basic API (not scraping). Never scrape HTML pages.
- Implement a per-domain rate limiter with conservative defaults: GitHub = 1 req/sec, Reddit = 1 req/2sec, Brave Search = 1 req/sec. This is a hard cap, not a guideline.
- Every learning session must log: source URL, request count, response status, what was stored. Learning sessions that produce 0 new concepts should not continue. Hard limit: 20 external requests per learning session, 3 sessions per agent per day.
- GDPR: agents must only store domain knowledge (facts, patterns, technical information), never personal identifiers. Strip all user/author attribution before storing as a concept. Add explicit filtering: if a chunk contains an email address or @username, discard it.
- Implement `robots.txt` checking before any page fetch. Cache robots.txt for 24 hours per domain.

**Warning signs:**
- Agent learning logs show HTTP 429 responses from target sites
- Memory V2 concepts contain author names, email addresses, or social handles
- Learning sessions produce hundreds of tool calls per run
- VPS IP address appears in abuse complaint databases

**Phase to address:** Autonomous learning phase. Rate limiting and GDPR filtering must be implemented before agents are allowed to reach the internet.

---

### Pitfall 8: Two Claude Sessions Causing Silent Schema Drift

**What goes wrong:**
The project explicitly states two Claude sessions work on the codebase simultaneously (frontend-v2 session and backend session). If both sessions add migrations independently without coordination:

- Backend session adds migration `migrate-08.ts` that creates `project_collaborators` table
- Frontend session (AARRR analytics) adds migration `migrate-08.ts` that creates `analytics_events` table
- Both run at startup and check `schema_migrations` table for their migration ID
- Both use the same file name but different IDs → migrations coexist with the same file number → future git merge creates a conflict in the migration directory

Worse: if the schema.ts Drizzle file is modified by both sessions in the same session without coordination, a merge conflict in schema.ts produces TypeScript that compiles but generates incorrect SQL (silently incorrect — Drizzle infers from the merged struct).

**Why it happens:**
Each Claude session is autonomous and unaware of what the other is doing to shared files. The migration system uses sequential numbering (migrate-08, migrate-09) which creates inherent coordination conflicts.

**How to avoid:**
- Use content-addressed migration IDs, not sequence numbers. The migration ID in `schema_migrations` table is already a string — use a domain-based prefix: `v2_collab_project_collaborators`, `v2_billing_plan_limits`, not `migrate-08`. This eliminates numbering conflicts.
- Migration files: use descriptive names, not numbers: `migrate-collab.ts`, `migrate-crm.ts`. No two sessions will pick the same descriptive name for different features.
- schema.ts is a shared file — designate it as backend-session-only. Frontend-v2 session must not modify schema.ts. If frontend needs to know the schema, read from the compiled types or a separate types export file.
- Before any session starts a new feature, read `.planning/STATE.md` to see what tables and files the other session has touched.

**Warning signs:**
- Two migration files exist with the same number (migrate-08.ts appears twice in different branches)
- schema.ts has merge conflict markers after a git pull
- `schema_migrations` table has no entry for a migration that the migration file claims to have run

**Phase to address:** API standardization phase (first phase). Migration naming convention must be established before any feature adds a migration.

---

### Pitfall 9: File Associations Creating Orphaned Files

**What goes wrong:**
FILE-01 requires files associated with projects, contacts, and conversations. The current files implementation stores uploaded files on disk with metadata in the database. When a file is uploaded during a conversation, the file hits disk. If the database insert for the association fails (constraint violation, timeout), the file on disk has no database record — an orphaned file. Over weeks, the disk fills with files that no route can serve or delete.

The reverse is also a problem: if a project is deleted and the cascade delete for `project_files` runs, but the `ON DELETE CASCADE` is not configured on the foreign key (SQLite doesn't enforce foreign keys by default unless `PRAGMA foreign_keys = ON` is set), the database records delete but the files remain on disk.

**Why it happens:**
File upload is a two-step operation: (1) write bytes to disk, (2) insert database record. These steps are not atomic. Any failure between them produces orphaned state. SQLite foreign key enforcement is disabled by default in SQLite — `PRAGMA foreign_keys = ON` must be explicitly set per connection.

**How to avoid:**
```typescript
// In db/client.ts — add foreign key enforcement
const sqlite = new Database(config.dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 30000');
sqlite.pragma('foreign_keys = ON');  // REQUIRED — add this
```

For file upload flow: write the database record FIRST (with `status = 'pending'`), then write the file to disk, then update the record to `status = 'complete'`. A scheduled cleanup job (runs every hour) deletes disk files whose database record has `status = 'pending'` for more than 10 minutes.

For project/contact deletion: use SQLite `ON DELETE CASCADE` on `project_files.project_id` foreign key, and verify `PRAGMA foreign_keys = ON` is set before the delete runs.

**Warning signs:**
- `du -sh /home/lobster/uploads/` is larger than the sum of all `file_size` values in the files table
- File count on disk does not match file count in database
- Project deletion leaves stale files in uploads directory

**Phase to address:** File handling phase. The orphaned file cleanup job and `foreign_keys = ON` pragma must be in the first migration that adds file association tables.

---

### Pitfall 10: Agent Template "Instantiation" That Produces Non-Working Agents

**What goes wrong:**
TMPL-03 requires that template instantiation creates a "fully configured, ready-to-work agent." The common failure: template instantiation creates a persona record with the template's skills and system prompt, but the agent is not actually ready to work because:

1. The required backend (e.g., `preferred_backend: 'anthropic-claude'`) is not configured in the user's workspace — the agent silently fails on first dispatch.
2. The template's `tools` array references tool IDs that are not registered in the workspace's connections — tool calls error at runtime.
3. The system prompt contains placeholder text (`{{COMPANY_NAME}}`, `{{USER_GOAL}}`) that was never replaced at instantiation time — the agent gives nonsensical self-introductions.

The failure is silent in all three cases: the agent is created (201 response), but the first conversation reveals it is broken. The user blames Porter.

**Why it happens:**
Template instantiation is implemented as a database insert that copies template fields to a persona record. The validation step ("is this agent actually runnable in this workspace?") is skipped because it requires checking workspace state at instantiation time, which is more complex than a simple copy.

**How to avoid:**
- Create a `validateTemplateForWorkspace(templateId, workspaceId)` function that checks: (a) all required backends are available, (b) all required tools are connected, (c) no unresolved placeholders remain in the system prompt.
- If validation fails, return a 422 with specific errors: "Agent requires Claude backend but no Claude API key is configured." Do not create the agent record.
- Placeholders in system prompts must use a defined syntax (`{{PLACEHOLDER_NAME}}`) and instantiation must accept a `params` object that fills them. If required params are missing, fail with 422.
- Write a test: instantiate a template in a workspace with no connections configured, verify 422 response with actionable error message.

**Warning signs:**
- Agents created from templates show `status: idle` but never respond to messages
- Template system prompts contain `{{` in any conversation log (placeholder not substituted)
- Agent creation succeeds but first dispatch logs show `backend_unavailable` error

**Phase to address:** Agent templates phase. Validation must be built into the instantiation route, not treated as a post-launch improvement.

---

### Pitfall 11: Usage Metering That Loses Data Under Concurrent AI Calls

**What goes wrong:**
BILL-02 requires usage metering: API calls, tokens consumed, and storage per workspace. The existing `token_usage_daily` table accumulates token counts (schema.ts:171-179). The current write pattern: read today's row, add the new tokens, write the updated row. Under concurrent AI calls (multiple users or background agents all generating at the same time), two concurrent reads both see `input_tokens = 500`, both compute `500 + 100 = 600`, both write `600`. The correct value is `700`. Token counts are under-reported.

**Why it happens:**
Read-modify-write on a counter is not atomic unless wrapped in a transaction or done as an atomic SQL `UPDATE ... SET col = col + ?`. Every implementation that reads first, computes in application code, then writes is vulnerable to this race.

**How to avoid:**
```sql
-- Atomic increment — never read-modify-write
INSERT INTO token_usage_daily (model, date, input_tokens, output_tokens, request_count)
VALUES (?, ?, ?, ?, 1)
ON CONFLICT (model, date) DO UPDATE SET
  input_tokens = input_tokens + excluded.input_tokens,
  output_tokens = output_tokens + excluded.output_tokens,
  request_count = request_count + 1;
```
This SQLite `INSERT OR ... DO UPDATE` is atomic under WAL mode. No transaction needed. Add a `UNIQUE(model, date)` constraint to the `token_usage_daily` table (it's currently missing — add it in the billing migration).

For per-user (per-workspace) metering: add a `username` column to `token_usage_daily` with `UNIQUE(model, date, username)`. Without this, you cannot produce per-user billing reports.

**Warning signs:**
- Total tokens billed is less than actual model API costs (underbilling)
- `token_usage_daily` has no unique constraint on `(model, date)` — multiple rows for same day
- Concurrent load test shows token counts diverging from expected values

**Phase to address:** Billing phase, specifically usage metering implementation. Add the unique constraint in the same migration that adds per-user metering.

---

### Pitfall 12: CRM Activity Timeline That Becomes a Write-Heavy Bottleneck

**What goes wrong:**
CRM-04 requires a contact activity timeline aggregating all touchpoints across projects. The naive implementation: every interaction (chat message, file upload, project update, email sent) triggers an INSERT into `contact_activity` with a `contact_id` foreign key. For a workspace with 500 contacts and active agents, this produces hundreds of activity writes per minute. SQLite's single-writer model means every activity insert queues behind the others. Chat message writes, which users are waiting for, get queued behind activity log writes they cannot see.

**Why it happens:**
Activity logging feels like a "just add an insert" problem. The write volume of a high-activity workspace is only visible at scale.

**How to avoid:**
- Activity inserts must be asynchronous — never in the request handler path. Buffer activity events in an in-memory queue and flush to SQLite in a single batch every 5 seconds.
- Activity data is write-once, append-only, and never updated. This is a good candidate for WAL-optimized bulk inserts: `BEGIN; INSERT ...; INSERT ...; INSERT ...; COMMIT` in a single transaction.
- For the contact timeline query, add a covering index on `(contact_id, created_at DESC)`. Without it, the timeline query scans the full activity table.
- Partition activity by recency: keep last 90 days in `contact_activity` table, archive older rows to `contact_activity_archive` via a nightly job. Timeline queries only touch the live table.

**Warning signs:**
- Chat latency increases when contact-heavy features are active
- `contact_activity` table grows at >10,000 rows/day
- Timeline query takes >100ms on a contact with >1,000 events

**Phase to address:** CRM phase. Async activity buffering must be part of the CRM implementation from day one.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems in this specific v2.0 context.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Proxy streaming through porter.py → Fastify → client | Reuse existing porter.py AI dispatch | Block-dump responses; defeats the entire purpose of STRM-01; streaming appears to work in tests but fails for users | Never for streaming routes — Fastify must own the AI call directly |
| Adding columns to existing `chats`/`chat_messages` tables instead of new `conversations`/`messages` tables | Fewer migrations, existing data works immediately | Schema becomes unmaintainable; external channel messages don't fit; threading requires NULL-handling everywhere | Only if unified chat is explicitly descoped |
| Permission checks inside route handlers instead of middleware | Easier to write the first handler | Any new route is an unprotected endpoint by default; IDOR vulnerabilities compound | Never for project-scoped resources — always middleware |
| Storing file blobs in SQLite `chat_attachments.data` column | Simplest possible implementation | Table scans load all blobs into memory; database file balloons; backups are multi-GB | Never — files go on disk, database stores path only |
| Webhook handler that makes external API calls before responding | Feels complete — process and respond in one shot | Lemon Squeezy retries if response takes >5s; duplicate processing; double billing | Never — respond 200 immediately, process asynchronously |
| Sequential migration file numbers (migrate-08, migrate-09) | Intuitive ordering | Conflicts when two sessions add migrations independently; merge produces duplicate numbers | Never in multi-session development — use descriptive IDs |
| Read-modify-write for token counters | Simple code | Race conditions under concurrent AI calls; systematic underbilling | Never — use atomic SQL UPDATE with `col = col + ?` |

---

## Integration Gotchas

Common mistakes when connecting to external services added in v2.0.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Lemon Squeezy webhooks | Processing the event before responding 200, causing retries | Dedup check + event record insert in one transaction, then respond 200, then process async |
| Lemon Squeezy webhooks | No signature verification on the webhook endpoint | Verify `X-Signature` HMAC-SHA256 before processing any payload — already started in billing.ts `verifyWebhookSignature` |
| Brave Search / web APIs | Agent fires searches in a tight loop with no delay | Per-domain rate limiter: 1 req/sec max, 20 requests per learning session hard cap |
| GitHub API | Treating it as freely scrapable HTML | Use only GitHub REST API with token; 5,000 requests/hour with token vs 60 without |
| X/Twitter | Scraping timeline HTML | Use X Basic API (OAuth 2.0); rate limits are per endpoint, not global; store OAuth tokens per workspace connection |
| Reddit | Using old API patterns post-2023 | OAuth required; check `https://www.reddit.com/dev/api/` for current rate limits before implementing |
| Ollama streaming | Reading full response body then forwarding | Use `getReader()` on `response.body` and forward each chunk as individual SSE event |
| OpenClaw streaming | Assuming same format as OpenAI streaming | Verify OpenClaw streaming format matches `data: {"choices":[{"delta":{"content":"..."}}]}` — test with curl before wiring to route |

---

## Performance Traps

Patterns specific to v2.0 features that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `project_collaborators` checked via full table scan on every request | API latency increases as collaboration scales | Index on `(project_id, username)` — add at table creation time | ~1,000 collaborator records |
| FTS5 index on `messages` not kept in sync with content table | Full-text search returns stale or missing results | Use FTS5 content table triggers (BEFORE UPDATE, AFTER INSERT, AFTER DELETE) at table creation | First update without trigger |
| Unified chat `messages` queried without `conversation_id` filter | Message list endpoint becomes a full table scan | Enforce `conversation_id` as required query parameter; index on `(conversation_id, created_at)` | ~10,000 messages |
| Per-user token metering queried for billing without date range | Monthly billing report scans full `token_usage_daily` table | Always query with `date >= period_start AND date <= period_end`; composite index on `(username, date)` | ~365 days of records |
| Agent learning session that runs 100 URL fetches serially | Learning session takes 5+ minutes, blocks scheduler slot | Parallel fetch with controlled concurrency (Promise.allSettled with 3 concurrent max) and per-domain delay | Every learning session at scale |
| Orphaned files on disk from failed upload-association transactions | Disk fills silently over weeks | Hourly cleanup job: delete files with `status = 'pending'` for >10 minutes | After ~1,000 failed uploads |
| Error capture endpoint receiving high-volume frontend errors with no dedup | Error table grows unbounded; same JS error logged thousands of times | Dedup by `(component, message, fingerprint)` within a 1-hour window; rate limit per session token | Any JS error in a busy component |

---

## Security Mistakes

Domain-specific security issues introduced by v2.0 features.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Project collaborator role not checked on agent dispatch | Viewer-role collaborator sends message that triggers agent tool execution | `requireProjectAccess` middleware enforces minimum `chat` role before any agent interaction |
| Lemon Squeezy webhook endpoint without signature verification | Attacker sends fake `subscription_updated` event to grant themselves a paid plan | Verify HMAC-SHA256 of request body against `X-Signature` header using LS signing secret |
| Error capture endpoint logs stack traces without auth | Attacker posts arbitrary data to `/api/v1/errors`; endpoint becomes a spam vector | Require valid session token on error capture endpoint; rate limit at 10 errors/minute per session |
| Autonomous learning stores scraped personal data as Memory V2 concepts | GDPR violation; user data from GitHub/Reddit stored without legal basis | Strip all personal identifiers (emails, @usernames, full names) from scraped content before storage |
| File download endpoint serves files without project-scope check | User A downloads files associated with project B by guessing file IDs | File serve endpoint checks `project_collaborators` for the file's project before streaming content |
| CRM contacts accessible to all workspace members | Contact data (email, phone, notes) visible to operator-role users who should not see it | CRM endpoints require explicit `crm_access` permission flag; default operator role does not have it |
| Billing plan limit bypass via race condition | User creates resources beyond plan limit via simultaneous requests | Use `BEGIN EXCLUSIVE` transaction for resource creation with count check; never read-then-write |

---

## UX Pitfalls

Common user experience mistakes specific to the v2.0 feature set.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Streaming that shows completed response with a "streaming" animation | Deceives users into thinking it's real-time; builds false trust | Only show streaming UI when `time_to_first_token < 500ms`; if response arrives in one block, render immediately without animation |
| Collaborative session invite with no email notification | Invitee never knows they were added; collaboration feature appears broken | Send email notification on invite (use workspace email connection if available, fallback to system email) |
| Plan limit error that returns 403 with no explanation | User doesn't know why their action failed or how to upgrade | Return 402 (Payment Required) with `{"error": "PLAN_LIMIT", "limit": 5, "current": 5, "upgrade_url": "..."}` |
| Agent template instantiation that silently creates a broken agent | User thinks their agent works; first conversation reveals it doesn't | Validate at creation time; return 422 with specific missing requirements before creating the agent record |
| Autonomous learning with no user-visible progress | User triggers learning, nothing happens visibly for minutes | Emit SSE events for each learning step: `searching`, `fetching`, `storing`, `complete`; surface in agent activity feed |
| Error capture that shows no feedback to the frontend | Frontend errors are silently swallowed; developers don't know the endpoint works | Error capture endpoint returns `{"ok": true, "captured": true, "error_id": "..."}` for frontend confirmation |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces specific to v2.0 features.

- [ ] **Token streaming:** SSE events appear in browser — verify `time_to_first_token` is less than 2 seconds for a 100-token response (not just that events eventually arrive)
- [ ] **Stream cancellation:** Client sends abort — verify Ollama CPU drops to idle within 3 seconds (model actually stopped, not just client disconnected)
- [ ] **Project collaboration:** User added as collaborator — verify they cannot access any other project's endpoints with their session token (IDOR test)
- [ ] **Webhook billing:** Subscription created event received — verify no duplicate `billing_events` rows exist after sending the same `ls_event_id` twice
- [ ] **Plan limits:** Limit check added to project creation — verify that 10 concurrent creation requests for a 5-project plan produce exactly 5 successes (race condition test)
- [ ] **File associations:** File uploaded to project — verify that deleting the project also removes the file from disk (cascade delete with `foreign_keys = ON` test)
- [ ] **Agent template instantiation:** Template instantiated — verify that the agent's first message does not contain any `{{PLACEHOLDER}}` text
- [ ] **Autonomous learning:** Learning session completes — verify that `contact_activity` table contains no `@username` or email address strings (GDPR filter test)
- [ ] **Usage metering:** Tokens recorded after AI call — verify that 100 concurrent AI calls produce exactly the correct total token count (no undercounting from read-modify-write)
- [ ] **Error capture:** Frontend error posted — verify endpoint rejects unauthenticated requests with 401 and accepts authenticated ones with 200
- [ ] **CRM activity timeline:** Contact viewed — verify that timeline query completes in under 100ms for a contact with 1,000 activity events (index verification)
- [ ] **Unified chat schema:** New conversation created — verify that `PRAGMA foreign_keys = ON` is set on the connection before any cascade delete is tested

---

## Recovery Strategies

When v2.0 pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Streaming proxy delivers block-dump responses | HIGH | Refactor streaming route to call AI backend directly (remove proxy path); retest with `time_to_first_token` measurement; no data migration needed |
| IDOR vulnerability discovered in project-scoped endpoints | HIGH | Audit all routes for missing `requireProjectAccess` call; add middleware retroactively; add integration test; rotate all session tokens as precaution |
| Duplicate Lemon Squeezy webhook processing | MEDIUM | Identify all duplicate `ls_event_id` entries; determine which processed state is correct; manually revert incorrect subscription state; add idempotency check |
| Plan limits bypassed via race condition | MEDIUM | Add `BEGIN EXCLUSIVE` transaction immediately; audit how many users exceed their limits; decide whether to grandfather or enforce |
| Orphaned files filling disk | LOW | Run `SELECT id, file_path FROM files WHERE status = 'pending' AND created_at < unixepoch() - 600`; delete listed files; add cleanup job |
| FTS5 index desync from content table | MEDIUM | Run `INSERT INTO messages_fts(messages_fts) VALUES('rebuild')` to force full rebuild; add correct triggers; test with search query |
| Usage metering undercounting (read-modify-write race) | LOW-MEDIUM | Cannot retroactively fix historical undercounting; migrate to atomic `UPDATE SET col = col + ?` immediately; document the gap in billing records |
| Autonomous learning agent banned from target site | LOW | Remove offending domain from allowed sources; add to permanent blocklist; reduce rate limits globally; notify Moe of ban |

---

## Pitfall-to-Phase Mapping

How v2.0 roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Block-dump streaming (Pitfall 1) | Streaming phase | `time_to_first_token` < 2s measured via automated test |
| Cancellation not stopping LLM (Pitfall 2) | Streaming phase | Ollama CPU drops after client abort measured via htop observation |
| Per-project RBAC leaking (Pitfall 3) | Collaboration phase — establish middleware before any route | 10 cross-project IDOR attempts all return 403 |
| Unified chat schema cannot evolve (Pitfall 4) | Unified chat phase — schema design before route code | Schema reviewed and approved before first migration runs |
| Webhook idempotency missing (Pitfall 5) | Billing phase | Same webhook event sent twice produces one `billing_events` row |
| Plan limits enforced at wrong layer (Pitfall 6) | Billing phase | 10 concurrent creation requests produce exactly N successes where N = plan limit |
| Autonomous learning banned/GDPR violation (Pitfall 7) | Autonomous learning phase | Learning session log shows no personal identifiers stored; rate limiter fires at correct threshold |
| Two sessions causing schema drift (Pitfall 8) | API standardization phase (first) | Migration naming convention documented in `.planning/STATE.md` before any v2 migration is written |
| Orphaned files from failed uploads (Pitfall 9) | File handling phase | `PRAGMA foreign_keys = ON` verified in client.ts; cleanup job exists and is registered in scheduler |
| Template instantiation producing broken agents (Pitfall 10) | Agent templates phase | Template instantiation with missing backend returns 422 with actionable error |
| Token metering race condition (Pitfall 11) | Billing phase | 100 concurrent metering writes produce exactly correct total count |
| CRM activity timeline bottleneck (Pitfall 12) | CRM phase | Activity writes are async (not in request handler); timeline query <100ms with covering index |

---

## Sources

**High Confidence (direct codebase analysis):**
- `/home/lobster/documents/porter/backend/src/routes/v1/chat.ts` — streaming proxy implementation (direct inspection)
- `/home/lobster/documents/porter/backend/src/db/schema.ts` — schema state, missing constraints (direct inspection)
- `/home/lobster/documents/porter/backend/src/services/billing.ts` — billing service patterns (direct inspection)
- `/home/lobster/documents/porter/backend/src/db/migrate-07.ts` — migration pattern (direct inspection)
- `/home/lobster/documents/porter/.planning/PROJECT.md` — dual-session coordination risk (direct inspection)

**High Confidence (official documentation):**
- [Lemon Squeezy Webhook Requests](https://docs.lemonsqueezy.com/help/webhooks/webhook-requests) — retry behavior: 5s, 25s, 125s
- [SQLite FTS5 Extension](https://www.sqlite.org/fts5.html) — trigger requirements for external content tables
- [Node.js Backpressuring in Streams](https://nodejs.org/en/learn/modules/backpressuring-in-streams) — `write()` return value and drain event

**Medium Confidence (verified via multiple sources):**
- [SQLite Concurrent Writes and "database is locked" errors](https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/) — WAL single-writer limitation
- [Managing Asynchronous Operations in Node.js with AbortController](https://blog.appsignal.com/2025/02/12/managing-asynchronous-operations-in-nodejs-with-abortcontroller.html) — abort signal threading pattern
- [fastify-racing plugin](https://github.com/metcoder95/fastify-racing) — pre-built client disconnect abort signal
- [Advanced: Stopping Streams — AI SDK](https://ai-sdk.dev/docs/advanced/stopping-streams) — abort signal pattern for LLM streams
- [How to Implement Webhook Idempotency](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency) — dedup pattern
- [Is Web Scraping Legal in 2025?](https://www.browserless.io/blog/is-web-scraping-legal) — GDPR risk, ToS considerations
- [Web Scraping in 2025: The €20 Million GDPR Mistake](https://medium.com/deep-tech-insights/web-scraping-in-2025-the-20-million-gdpr-mistake-you-cant-afford-to-make-07a3ce240f4f) — personal data scraping risk
- [Managing Multiple Claude Code Sessions Without Worktrees](https://blog.gitbutler.com/parallel-claude-code) — parallel session coordination
- [Claude Code Worktrees Guide](https://claudefa.st/blog/guide/development/worktree-guide) — migration conflict prevention

---
*Pitfalls research for: Porter v2.0 — Adding streaming, collaboration, unified chat, CRM, file associations, agent templates, autonomous learning, billing, error capture to existing Fastify/SQLite SaaS*
*Researched: 2026-03-21*
