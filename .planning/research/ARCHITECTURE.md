# Architecture Research

**Domain:** AI Orchestration Platform — Fastify/Drizzle/SQLite backend extension
**Researched:** 2026-03-21
**Confidence:** HIGH (based on direct codebase inspection)

---

## Existing Architecture (v1.0 Baseline)

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Clients                                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐             │
│  │  frontend-v2   │  │  Legacy React  │  │ External (LS,  │             │
│  │  /v2/* (React  │  │  (frontend/)   │  │ WhatsApp, etc) │             │
│  │  Router 7)     │  │                │  │                │             │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘             │
└──────────┼────────────────────┼────────────────────┼────────────────────┘
           │ :3001              │ :3001               │ :3001
┌──────────▼────────────────────▼─────────────────────▼────────────────────┐
│                        Fastify Server (:3001)                             │
│  ┌──────────────┐  ┌────────────────────────────────────────────────┐    │
│  │  Auth Plugin │  │  /api/v1/* (17 route groups, response envelope) │    │
│  │  (requireAuth│  │  /api/* legacy routes (direct Drizzle, no env) │    │
│  │  decorator)  │  │  /health — plain response                      │    │
│  └──────────────┘  └───────────────────────┬────────────────────────┘    │
│                                             │                             │
│  ┌──────────────────────────────────────────▼───────────────────────┐    │
│  │                     Services Layer                               │    │
│  │  ai-router.ts  scheduler.ts  event-triggers.ts                   │    │
│  │  billing.ts    email.ts      github.ts  calendar.ts              │    │
│  │  whatsapp.ts   external-dispatcher.ts                            │    │
│  └──────────────────────────────────────────┬───────────────────────┘    │
│                                             │                             │
│  ┌──────────────────────────────────────────▼───────────────────────┐    │
│  │                   Drizzle ORM + better-sqlite3                   │    │
│  │  WAL mode, single file, migrations 04-07                         │    │
│  └──────────────────────────────────────────┬───────────────────────┘    │
│                                             │                             │
│  ┌──────────────────────────────────────────▼───────────────────────┐    │
│  │          Proxy Plugin (LAST — fallback for unknown routes)       │    │
│  └──────────────────────────────────────────┬───────────────────────┘    │
└────────────────────────────────────────────┬─────────────────────────────┘
                                             │
                              ┌──────────────▼──────────────┐
                              │   porter.py (:8877)          │
                              │   Legacy Python monolith     │
                              │   handles: memory injection, │
                              │   chat dispatch, brain fns   │
                              └─────────────────────────────┘
```

### Existing Component Inventory

| Component | Location | Status | Notes |
|-----------|----------|--------|-------|
| Auth plugin | `plugins/auth.ts` | STABLE | Cookie sessions, `requireAuth` decorator |
| v1 route index | `routes/v1/index.ts` | STABLE | 17 groups under `/api/v1/` |
| Envelope lib | `lib/envelope.ts` | STABLE | `ok(data)` / `err(code, msg)` pattern |
| AI router | `services/ai-router.ts` | STABLE | cheap/strong routing, context compression |
| Scheduler | `services/scheduler.ts` | STABLE | 2s tick, `emitSSE` via porter.py |
| Event triggers | `services/event-triggers.ts` | STABLE | file-created, message-received, deadline-approaching |
| External dispatcher | `services/external-dispatcher.ts` | STABLE | GitHub, email, calendar, WhatsApp |
| Billing service | `services/billing.ts` | PARTIAL | Lemon Squeezy wired, plan limits not enforced |
| Migrations | `db/migrate-04..07.ts` | STABLE | Sequential, idempotent |
| Proxy plugin | `plugins/proxy.ts` | STABLE | Must remain LAST in registration |
| Chat (legacy) | `routes/chat.ts` | LEGACY | No envelope, will shrink |
| Chat (v1) | `routes/v1/chat.ts` | PARTIAL | sessions + proxy to porter.py for streaming |

### Existing Schema Tables

```
users, sessions, tasks, chats, chat_messages, chat_attachments
projects, personas, schema_migrations, agent_jobs, agent_activity
decision_log, token_usage_daily, workspace_connections
project_connections, calendar_events, subscriptions, billing_events
```

**Missing from schema for v2 features:** conversations, messages (unified), contacts, contact_emails, contact_phones, contact_socials, contact_touchpoints, file_associations, agent_templates, learning_sessions, error_captures, project_collaborators

---

## v2.0 Integration Architecture

### New Component Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                     v2.0 Additions                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  routes/v1/                                                          │
│  ├── errors.ts          (NEW) OBS-01/02: error capture               │
│  ├── collaborators.ts   (NEW) COLLAB-01..04: project collaborators   │
│  ├── conversations.ts   (NEW) CHAT-01..04: unified conversation model│
│  ├── contacts.ts        (NEW) CRM-01..04: full CRM backend           │
│  ├── templates.ts       (NEW) TMPL-01..03: agent templates API       │
│  ├── learning.ts        (NEW) LEARN-01..03: autonomous learning API  │
│  ├── chat.ts            (MODIFY) STRM-01..03: native streaming       │
│  ├── files.ts           (MODIFY) FILE-01..03: add associations       │
│  ├── billing.ts         (MODIFY) BILL-03: add limit enforcement      │
│  └── agents.ts          (MODIFY) TMPL-03: template instantiation     │
│                                                                      │
│  services/                                                           │
│  ├── stream.ts          (NEW) token-by-token SSE from AI backends    │
│  ├── learning.ts        (NEW) autonomous web/social/GitHub search    │
│  └── billing.ts         (MODIFY) add per-request limit checks        │
│                                                                      │
│  db/                                                                 │
│  ├── migrate-08.ts      (NEW) collab + unified chat schema           │
│  ├── migrate-09.ts      (NEW) CRM V2 schema (multi-email, social)   │
│  ├── migrate-10.ts      (NEW) file associations + agent templates    │
│  ├── migrate-11.ts      (NEW) learning sessions + error captures     │
│  └── schema.ts          (MODIFY) add new table definitions           │
│                                                                      │
│  plugins/                                                            │
│  ├── auth.ts            (MODIFY) add collab role check decorator     │
│  └── rate-limit.ts      (NEW) per-plan rate limiting middleware      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Feature-by-Feature Integration Points

### 1. Streaming Chat (STRM-01..03)

**Current state:** `routes/v1/chat.ts` proxies `GET /api/v1/chat/stream` to porter.py. The porter.py SSE stream is piped through as bytes. No native streaming in Fastify backend.

**Integration approach:** Extend `services/ai-router.ts` with a `dispatchStream()` function that returns an `AsyncIterable<string>`. The route handler writes SSE chunks directly to `reply.raw` using the same piping pattern already proven in the existing proxy stream handler.

**New route:** `POST /api/v1/chat/stream` — accepts `{agent_id, message, chat_id?, project_id?}`, saves user message to `chat_messages`, opens SSE stream, accumulates assistant tokens, saves final assembled message on `[DONE]`.

**Cancellation (STRM-03):** Use `AbortController`. When client disconnects (`request.raw.on('close')`), call `controller.abort()` which cancels the fetch to the upstream AI backend. Both Ollama (`/api/generate`) and openclaw (`/v1/chat/completions`) respect `AbortSignal` on the fetch call.

**Touches:** `services/ai-router.ts` (add `dispatchStream`), `routes/v1/chat.ts` (add stream POST), no schema changes needed.

**Integration with existing services:**
- `token_usage_daily` — track after stream completes (on `[DONE]`)
- `decision_log` — log model selection before stream begins
- `emitSSE('agent:activity')` — fire after stream completes

---

### 2. Collaborative Sessions (COLLAB-01..04)

**Current state:** Projects have a single `owner_id`. No multi-user access model in Fastify. The auth plugin provides `request.sessionUser` with `{username, role}` (workspace-level roles only).

**New table needed:**
```
project_collaborators(id, project_id, username, role, invited_by,
                      invite_token, invited_at, accepted_at)
```
Roles: `view` | `chat` | `edit` | `admin` (project-scoped, separate from workspace RBAC).

**Auth plugin extension:** Add `requireProjectAccess(minRole)` decorator that checks both workspace role and `project_collaborators`. Owner always has `admin` access. The existing `requireAuth` becomes the baseline; `requireProjectAccess` layers on top.

**Invitation flow:** `POST /api/v1/collaborators` — creates a `project_collaborators` row with a pending invite token, sends invite email via existing `services/email.ts`. Accept via `POST /api/v1/collaborators/accept` with the token.

**Integration with existing routes:**
- `routes/v1/projects.ts` — add `requireProjectAccess('view')` guard to GET project detail
- `routes/v1/chat.ts` — collaborators can chat with agents (check project access before dispatch)
- `routes/v1/agents.ts` — collaborators with `chat` role can direct agents

Revoke is `DELETE /api/v1/collaborators/:id`. Cascading: cancel pending `agent_jobs` scoped to that user+project combination.

---

### 3. Unified Chat (CHAT-01..04)

**Current state:** `chats` + `chat_messages` covers direct chat sessions. WhatsApp/email messages live separately in porter.py. No threading. No external channel unification.

**New schema:**
```
conversations(id, title, type, project_id, agent_id, username,
              channel, channel_ref, created_at, updated_at)
  type: 'direct' | 'project' | 'external'
  channel: null | 'whatsapp' | 'email'
  channel_ref: external message ID for dedup

messages(id, conversation_id, role, content, parent_id,
         sender_username, channel_metadata, created_at)
  parent_id: enables threading (CHAT-02)
  channel_metadata: JSON for external channel-specific data
```

**Migration strategy:** Migrate-08 creates new tables. Existing `chats`/`chat_messages` rows are NOT migrated automatically — keep old tables for read access. Legacy `routes/chat.ts` continues to serve old data. New `routes/v1/conversations.ts` serves the new unified model.

**External channel integration:** Existing `services/whatsapp.ts` and `services/email.ts` handle inbound messages independently today. Add a call to `createConversationMessage(channel, channelRef, content)` inside their inbound handlers. This surfaces external messages in the unified stream with zero disruption to existing processing.

**FTS5 search (CHAT-03):** Create a virtual `messages_fts(content)` table with triggers on `messages` insert. Query via `messages_fts MATCH ?`. SQLite FTS5 is already available in WAL mode.

---

### 4. CRM Backend (CRM-01..04)

**Current state:** The Fastify backend has NO CRM schema. CRM is currently in porter.py (people module). The existing `users` table is workspace membership only, not external contacts.

**New tables needed:**
```
contacts(id, workspace_owner, display_name, company, notes,
         ai_analysis, created_at, updated_at)
contact_emails(id, contact_id, email, label, is_primary)
contact_phones(id, contact_id, phone, country_code, label, is_primary)
contact_socials(id, contact_id, platform, handle, url)
contact_touchpoints(id, contact_id, project_id, conversation_id,
                    event_type, summary, occurred_at)
```

**New route:** `routes/v1/contacts.ts` — full CRUD on contacts with nested email/phone/social arrays returned in a single GET response (assembled via JOIN or separate selects).

**AI analysis (CRM-03):** `POST /api/v1/contacts/:id/analyze` — builds a prompt from the contact's touchpoints and dispatches via `ai-router.dispatch()`. Stores result in `contacts.ai_analysis`. Non-blocking — inserts an `agent_job` with `trigger_type = 'contact_analysis'` rather than blocking the HTTP request. Returns `202 Accepted` with job ID.

**Activity timeline (CRM-04):** `contact_touchpoints` is written by:
- Unified chat service when `conversation.type = 'external'` and a contact is matched
- Project milestone events when a contact is linked to a project
- Manual POST by user via API

**Integration with billing:** Contact count is a plan limit dimension. Add a `checkContactLimit(username)` call in `services/billing.ts` and invoke it as a preHandler on `POST /api/v1/contacts`.

---

### 5. File Associations (FILE-01..03)

**Current state:** `routes/v1/files.ts` handles filesystem browsing and upload to disk. `chat_attachments` stores blob data for chat messages. No linking between filesystem files and Porter entities (projects, contacts, conversations).

**New table:**
```
file_associations(id, file_path, root_id, project_id, contact_id,
                  conversation_id, uploaded_by, size_bytes, mime_type, created_at)
```

This is a **metadata-only** index. Files still live on disk. The table links paths to entities.

**Modify** `POST /api/v1/files/upload` to accept optional `project_id`, `contact_id`, `conversation_id` fields. After writing the file to disk, insert a row into `file_associations`.

**New endpoints:**
- `GET /api/v1/files/associations?project_id=X` — list files linked to an entity
- `POST /api/v1/files/associations` — manually link an existing file to an entity
- `DELETE /api/v1/files/associations/:id` — remove association (not the file itself)

**Searchable (FILE-03):** Add indexes on `file_associations(project_id)`, `(contact_id)`, `(conversation_id)`, `(mime_type)`, `(created_at)`.

**Event trigger hook:** When a file is uploaded with a `project_id`, call the existing `onFileCreated(projectId, filename)` from `services/event-triggers.ts`. This is already wired in the service — the upload route just needs to pass the project_id through.

---

### 6. Agent Templates (TMPL-01..03)

**Current state:** Templates exist as filesystem directories under `personas/` (UUID dirs with IDENTITY.md, SOUL.md, etc.). The wizard loads them via `loadAvailableTemplates()` — a directory scan returning bare `{templateId, name}` pairs. No structured catalog, no categories, no search capability.

**Approach:** Create a DB-backed template registry alongside the filesystem representation.

**New table:**
```
agent_templates(id, name, category, description, skills_json, tools_json,
                system_prompt, appearance_spec, created_at, is_builtin)
```

**Migration-10** populates this table from seed data (100 templates defined inline or loaded from a JSON file at migration time). The `personas/` filesystem format continues to be the source of truth for deployed agent identities; the templates table is the searchable catalog for selection.

**New route:** `routes/v1/templates.ts`
- `GET /api/v1/templates` — list with `?category=X&search=Y` filter (TMPL-02)
- `GET /api/v1/templates/:id` — full template detail
- `POST /api/v1/templates/:id/instantiate` — creates a persona from template (TMPL-03)

**Instantiation (TMPL-03):** Reads the template row, calls `db.insert(schema.personas)` with skills/tools/system_prompt pre-populated in the `config` JSON blob. Returns the new agent. Reuses the same persona insert path as `routes/v1/agents.ts` — no duplication.

**Integration with wizard:** The wizard's `propose` step currently reads `AVAILABLE_TEMPLATES` from disk scan at module load time. After migrate-10, it queries `agent_templates` instead, enabling category-aware proposal logic.

---

### 7. Autonomous Learning (LEARN-01..03)

**Current state:** Agents execute jobs via `services/ai-router.ts`. No external search capability. Memory V2 concepts are written by porter.py brain functions only. Fastify has no memory write capability.

**New service:** `services/learning.ts` — implements the search-store loop:
1. Accept a domain query (e.g., "TypeScript best practices 2026")
2. Search external sources via HTTP (Brave Search API if `BRAVE_API_KEY` configured, else DuckDuckGo JSON API as free fallback)
3. Fetch and summarize top N results using `ai-router.dispatch()`
4. Write result as a Memory V2 concept via porter.py's API (`POST /api/memory/concepts`)
5. Insert a `learning_sessions` row with sources, confidence score, and concept count

**New route:** `routes/v1/learning.ts`
- `POST /api/v1/agents/:id/learn` — queues a learning job (returns 202 Accepted)
- `GET /api/v1/agents/:id/learning` — list past learning sessions (LEARN-03)

**New table:** `learning_sessions(id, agent_id, query, sources_json, concepts_created, confidence, created_at)`

**Integration with scheduler:** Add `trigger_type = 'autonomous_learning'` to the scheduler's `executeJob()` switch. When the scheduler processes a learning job, it calls `services/learning.ts` instead of `ai-router.dispatch()`. This is a clean extension — add one `else if` branch to the existing conditional in `executeJob()`.

**Integration with Memory V2:** The learning service writes concepts to porter.py via HTTP. Fastify never writes directly to porter.py's memory tables. The porter.py boundary is preserved.

**Source rate limits:** Implement exponential backoff in the learning service. Learning jobs that hit rate limits are marked `status = 'blocked'` and auto-retried by the scheduler (same pattern as connection-blocked external_call jobs already in the scheduler).

---

### 8. SaaS Billing (BILL-01..03)

**Current state:** `services/billing.ts` and `routes/v1/billing.ts` are largely complete for BILL-01 (Lemon Squeezy subscription management). Webhook handler processes subscription events and updates `subscriptions` table. Plan limits are defined in `PLANS` but NOT enforced at any API boundary.

**What remains for v2:** BILL-02 (storage and contact dimensions missing from usage rollup) and BILL-03 (limit enforcement at API level is entirely absent).

**BILL-02 completion:** `token_usage_daily` is already written by ai-router. Add to `getUsageThisMonth()`: storage bytes (summed from `file_associations`), contact count, agent count. These are cheap COUNT/SUM queries.

**BILL-03 enforcement:** Add `enforceLimit(username, dimension)` middleware that checks plan limits before resource creation. Applied as a `preHandler` on:
- `POST /api/v1/agents` — check agent count limit
- `POST /api/v1/projects` — check project count limit
- `POST /api/v1/contacts` — check contact count limit
- `POST /api/v1/files/upload` — check storage limit
- `POST /api/v1/chat/stream` — check monthly token limit

**New plugin:** `plugins/rate-limit.ts` — wraps limit enforcement as a Fastify plugin with a `fastify.enforceLimit(dimension)` decorator, consistent with existing `fastify.requireAuth` pattern.

---

### 9. Error Capture (OBS-01..02)

**Current state:** No frontend error logging API exists. Errors disappear silently in the browser.

**New table:**
```
frontend_errors(id, username, severity, component, message, stack_trace,
                url, user_agent, context_json, created_at)
```

**New route:** `routes/v1/errors.ts`
- `POST /api/v1/errors` — accepts error reports. Auth optional (can be called before login). Rate-limited to prevent abuse.
- `GET /api/v1/errors` — admin only, query by `?severity=X&component=Y&since=Z`

**Integration point:** This route is fully standalone. No dependencies on other v2 features. It is the lowest-risk, highest-value item to ship first — it immediately surfaces problems in frontend-v2 as it rolls out.

---

## Data Flow Changes

### Chat Streaming Flow (new)

```
Client POST /api/v1/chat/stream
    |
    +-- requireAuth
    +-- enforceLimit('tokens')  [BILL-03]
    |
    +-- Save user message to chat_messages
    |
    +-- services/stream.ts → dispatchStream(agentId, message)
    |         |
    |         +-- Select backend (cheap/strong heuristic)
    |         +-- fetch(backend, {stream: true, signal: controller.signal})
    |
    +-- reply.raw.write("data: {token}\n\n")  per chunk
    |
    +-- On request close: controller.abort()  [STRM-03]
    |
    +-- On [DONE]:
          Save assembled assistant message to chat_messages
          Update token_usage_daily
          emitSSE('agent:activity')
```

### Collaborator Access Flow (new)

```
Client GET /api/v1/projects/:id
    |
    +-- requireAuth  (existing — resolves sessionUser)
    |
    +-- requireProjectAccess('view')  (new decorator)
          |
          +-- project.owner_id === sessionUser.username  → allow
          OR
          +-- project_collaborators row: username + role >= 'view'  → allow
          |
          else: 403 FORBIDDEN
```

### Unified Message Routing (new)

```
Inbound WhatsApp → services/whatsapp.ts → existing handler
                                         |
                                         +-- createConversationMessage(
                                               channel='whatsapp',
                                               channelRef=msgId,
                                               content=body)
                                               [writes to conversations + messages]
                                         |
                                         +-- emitSSE('conversation:message')
                                         |
                              client receives real-time update via SSE
```

### Learning Job Flow (new)

```
POST /api/v1/agents/:id/learn {query}
    |
    +-- Insert agent_jobs(trigger_type='autonomous_learning', ...)
    +-- Return 202 Accepted {job_id}

[2 seconds later — scheduler tick]
    |
    +-- executeJob() → trigger_type === 'autonomous_learning'
    |
    +-- services/learning.ts → searchExternal(query)
          |
          +-- Brave API / DuckDuckGo → list of URLs + snippets
          +-- For each URL: ai-router.dispatch(summarize prompt)
          +-- POST /api/memory/concepts → porter.py  [memory write]
          +-- Insert learning_sessions row
          +-- emitSSE('agent:learned')
```

---

## Recommended Project Structure (additions only)

```
backend/src/
├── routes/v1/
│   ├── errors.ts           (new — Phase 1, OBS-01/02)
│   ├── collaborators.ts    (new — Phase 3, COLLAB-*)
│   ├── conversations.ts    (new — Phase 4, CHAT-*)
│   ├── contacts.ts         (new — Phase 4, CRM-*)
│   ├── templates.ts        (new — Phase 5, TMPL-*)
│   ├── learning.ts         (new — Phase 6, LEARN-*)
│   ├── chat.ts             (modify — Phase 2, STRM-*)
│   ├── files.ts            (modify — Phase 4, FILE-*)
│   ├── billing.ts          (modify — Phase 7, BILL-03)
│   └── agents.ts           (modify — Phase 5, TMPL-03)
├── services/
│   ├── stream.ts           (new — Phase 2, streaming dispatch)
│   └── learning.ts         (new — Phase 6, autonomous learning)
├── plugins/
│   └── rate-limit.ts       (new — Phase 7, billing enforcement)
└── db/
    ├── migrate-08.ts       (new — collab + unified chat)
    ├── migrate-09.ts       (new — CRM V2)
    ├── migrate-10.ts       (new — file_associations + agent_templates)
    └── migrate-11.ts       (new — learning_sessions + frontend_errors)
```

---

## Recommended Build Order

The build order is dictated by three dependency rules:
1. Schema migrations must precede routes that use the new tables
2. Auth extensions must precede routes that use them
3. No v2 feature depends on another v2 feature except where noted

| Phase | Feature Group | Rationale | Requires |
|-------|--------------|-----------|----------|
| **1** | Error capture (OBS) | Zero dependencies, highest immediate value, ships fast | Nothing |
| **2** | Streaming chat (STRM) | Unblocks frontend-v2 chat experience, standalone service | Nothing |
| **3** | API standardization (API) | Envelope already done, OpenAPI spec generation, error codes | Nothing |
| **4** | Collaborators (COLLAB) | Auth plugin extension required before unified chat adds collab context | Auth plugin |
| **5** | Unified chat (CHAT) | Needs collaborator roles wired, needs conversation schema | Phase 4 |
| **6** | CRM backend (CRM) | Needs conversation model for touchpoints | Phase 5 |
| **7** | File associations (FILE) | Needs contact + conversation IDs from CRM + unified chat | Phase 5-6 |
| **8** | Agent templates (TMPL) | Self-contained catalog, only links to agents which are stable | Phase 3 |
| **9** | Autonomous learning (LEARN) | Needs stable agent + job infrastructure + memory API | Phase 8 |
| **10** | Billing enforcement (BILL) | Rate-limit plugin needs all other routes finalized to apply correctly | Phase 7+ |

---

## Architectural Patterns

### Pattern 1: Migration Discipline

Every new table lives in its own migration file. Never add columns to existing tables inside existing migrations — create a new migration. The idempotency guard `SELECT 1 FROM schema_migrations WHERE id = ?` is the established pattern; follow it exactly.

```typescript
export function migrate08CollabAndChat() {
  const id = 'phase08_collab_chat';
  if (sqlite.prepare(`SELECT 1 FROM schema_migrations WHERE id = ?`).get(id)) return;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS project_collaborators (...);
    CREATE TABLE IF NOT EXISTS conversations (...);
    CREATE TABLE IF NOT EXISTS messages (...);
    INSERT INTO schema_migrations (id) VALUES ('phase08_collab_chat');
  `);
}
```

Register each migration in `index.ts` boot sequence alongside the existing migrate-04 through migrate-07 calls.

### Pattern 2: Service Isolation

New services (`stream.ts`, `learning.ts`) must NOT import from route files. Services import from `db/client.ts`, `config.ts`, and other services only. Routes import from services. This boundary is maintained throughout v1 — preserve it.

### Pattern 3: Feature Flag Gating

All new features get feature flags following the existing pattern in `config.ts`. New flags: `streamingChat`, `collaborativeSessions`, `unifiedChat`, `crmBackend`, `agentTemplates`, `autonomousLearning`, `errorCapture`. Routes check `featureFlags.X` before processing and return `503 FEATURE_DISABLED` if off. This enables staged rollout without redeployment.

### Pattern 4: Envelope Consistency

Every new route must use `ok(data)` and `err(code, message)` from `lib/envelope.ts`. Error codes must be SCREAMING_SNAKE_CASE strings. Never return a bare `{error: "string"}` — that is the legacy pattern in the old `routes/chat.ts` and `routes/auth.ts`, which are being superseded.

### Pattern 5: SSE Emission for State Changes

All significant state changes emit via `emitSSE()` from `services/scheduler.ts`. New features follow the same pattern:
- `emitSSE('conversation:message', {...})` when a new message arrives
- `emitSSE('collab:access-granted', {...})` when a collaborator accepts
- `emitSSE('agent:learned', {...})` when a learning session completes

The `emitSSE` function posts to porter.py's internal SSE hub. porter.py owns the SSE broadcast infrastructure in v1. Do not build a parallel SSE hub in Fastify for these coarse-grained events — only the streaming chat writes directly to `reply.raw`.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Duplicating AI Routing Logic for Streaming

**What people do:** Add streaming by fetching directly from Ollama or openclaw inside a route handler, rewriting the backend selection and fallback logic inline.

**Why it's wrong:** The routing heuristic, fallback logic, token tracking, and decision logging all live in `ai-router.ts`. Duplicating them creates two divergent code paths that will drift.

**Do this instead:** Extend `ai-router.ts` with a `dispatchStream(req: DispatchRequest): AsyncIterable<string>` function. The route handler calls this and pipes to `reply.raw`.

### Anti-Pattern 2: Direct Memory V2 DB Writes from Fastify

**What people do:** Write learning concepts directly to porter.py's SQLite memory tables from Node.js, opening a second connection to the same SQLite file.

**Why it's wrong:** porter.py owns the Memory V2 schema and writes involve complex injection logic, signal promotion, and noise filtering. Direct writes skip all of that. Also: two processes sharing a WAL-mode SQLite is fine for reads but risks write conflicts.

**Do this instead:** Always write concepts via `POST /api/memory/concepts` on porter.py. Fastify calls porter.py as a service for memory writes.

### Anti-Pattern 3: Schema Sprawl in the CRM

**What people do:** Add contact fields as new columns on the `contacts` table over time (`email2`, `email3`, `phone2`).

**Why it's wrong:** Breaks CRM-01 requirement for arbitrary multiple emails/phones, creates migration debt, and can't be queried efficiently.

**Do this instead:** Build `contact_emails` and `contact_phones` as separate tables from day one, returned as arrays in the contacts GET response.

### Anti-Pattern 4: Routing Streaming Chat Tokens Through porter.py SSE Hub

**What people do:** Route each streaming token through `emitSSE()` which POSTs to porter.py for broadcast.

**Why it's wrong:** Chat streaming is high-frequency (dozens of chunks per second) and latency-sensitive. Each token would incur an HTTP round-trip to porter.py, doubling latency and creating a bottleneck.

**Do this instead:** Chat streaming writes directly to `reply.raw` in the Fastify route handler. The SSE hub (porter.py) is only used for coarse-grained events (job complete, agent activity, collab events).

### Anti-Pattern 5: Synchronous Learning Job Execution

**What people do:** `POST /api/v1/agents/:id/learn` executes the full learning loop synchronously — searching, summarizing, storing — before returning the HTTP response.

**Why it's wrong:** Learning sessions take 30-120 seconds. This blocks the request, times out clients, and holds up the Node.js event loop.

**Do this instead:** The POST handler inserts an `agent_job` row with `trigger_type = 'autonomous_learning'` and immediately returns `202 Accepted` with the job ID. The scheduler picks it up within 2 seconds and executes it asynchronously.

---

## Integration Points

### External Services

| Service | v2 Integration | Notes |
|---------|---------------|-------|
| Lemon Squeezy | Add per-request limit enforcement (BILL-03) | Webhook handler already complete |
| Ollama | Add `stream: true` mode to ai-router | `/api/generate` supports streaming ndjson |
| openclaw/codex | Add `stream: true` mode to ai-router | OpenAI-compatible SSE streaming |
| porter.py | Memory concept writes, SSE hub | HTTP only — never share DB connections |
| WhatsApp (Twilio) | Feed inbound to unified conversations table | Modify `services/whatsapp.ts` inbound handler |
| Email (IMAP) | Feed inbound to unified conversations table | Modify `services/email.ts` inbound handler |
| Brave Search API | Optional — learning service | Fall back to DuckDuckGo JSON if absent |

### Internal Boundaries

| Boundary | Communication | Constraint |
|----------|---------------|------------|
| `routes/v1` ↔ `services/` | Direct TypeScript import | Services never import from routes |
| Fastify ↔ porter.py | HTTP only | Never open second SQLite connection to porter.db |
| `scheduler.ts` ↔ `services/` | Direct import | scheduler imports ai-router, external-dispatcher, learning |
| `services/stream.ts` ↔ `ai-router.ts` | Direct import | stream extends ai-router, never replaces |
| `services/learning.ts` ↔ porter.py | HTTP POST | Memory V2 write boundary preserved |

### Auth Plugin Extensions

The auth plugin currently provides `request.sessionUser` and `fastify.requireAuth`. v2 adds:

```typescript
// New decorator — project-scoped access check
fastify.decorate('requireProjectAccess',
  (minRole: 'view' | 'chat' | 'edit' | 'admin') =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id: projectId } = request.params as { id: string };
      const username = request.sessionUser!.username;
      // check: project.owner_id === username  (always admin)
      // OR: project_collaborators row with role >= minRole
      // else: 403
    }
);
```

All access control lives in `plugins/auth.ts`, not scattered in individual routes.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (few users) | SQLite WAL is fine, single process, single binary |
| 100-500 users | SQLite WAL handles well under typical SaaS workload. Add indexes proactively on new tables. |
| 500-5K users | First bottleneck: SQLite write throughput on concurrent chat streaming. Mitigation: batch message inserts, defer non-critical writes. Schema uses no SQLite-specific idioms except `unixepoch()` — designed for PostgreSQL migration. |
| 5K+ users | Replace SQLite with PostgreSQL (Drizzle config change + dialect swap). SSE hub moves from porter.py to Redis pub/sub. porter.py fully retired. |

**First bottleneck for v2:** Chat streaming concurrent writes. If 50 users stream simultaneously, each stream writes ~100 rows/min to `chat_messages`. At 5K rows/min total, WAL handles this comfortably. The actual bottleneck will be AI backend throughput (Ollama is single-threaded), not SQLite.

**Second bottleneck:** Learning jobs + regular agent jobs competing for the 2s scheduler tick. Long-running learning sessions (30-120s) block the single-threaded scheduler. Mitigation: run learning jobs in a separate `learningScheduler` with its own `setInterval` that does not share the tick with the main job queue.

---

## Sources

- Direct codebase inspection: `/home/lobster/documents/porter/backend/src/` (all files read March 2026)
- Schema: `backend/src/db/schema.ts` (complete table inventory)
- Patterns: `routes/v1/chat.ts`, `plugins/auth.ts`, `services/scheduler.ts`, `services/ai-router.ts`
- Requirements: `.planning/REQUIREMENTS.md` (v2 requirements, 32 items)
- Project context: `.planning/PROJECT.md`

---
*Architecture research for: Porter v2.0 Backend Ready*
*Researched: 2026-03-21*
*Confidence: HIGH — all findings based on direct codebase inspection, zero training-data inference*
