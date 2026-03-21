# Stack Research

**Domain:** AI Orchestration SaaS Platform — v2.0 Backend Ready
**Researched:** 2026-03-21
**Confidence:** HIGH (versions npm-verified; integration points code-verified against backend/)

---

## Scope: What This Document Covers

This is the **v2.0 addendum** to the existing STACK.md. The prior STACK.md (2026-03-20) covered v1.0 features: scheduling, real-time SSE, GitHub/email/calendar connections, WhatsApp, and the strangler-fig migration. All of that still applies.

This document covers only the **new additions** required for v2.0 features:

| Feature | New Need |
|---------|----------|
| Token-by-token SSE streaming | Native streaming from Ollama + OpenClaw without porter.py proxy |
| Stream cancellation | AbortController propagation from HTTP disconnect to AI backend |
| Collaborative sessions (COLLAB-01-04) | Project-level RBAC table; invitation email; per-resource permission checks |
| Unified chat model (CHAT-01-04) | Schema additions: threaded messages, FTS5 search, external channel fan-in |
| CRM backend (CRM-01-04) | Schema: multi-email, multi-phone, social links, activity timeline |
| File associations (FILE-01-03) | Schema: file_associations pivot table; searchable metadata |
| 100 agent templates (TMPL-01-03) | In-codebase JSON/TS data; no new library; category-indexed search |
| Autonomous learning (LEARN-01-03) | Lightweight HTML scraper; source attribution in memory_concepts |
| Lemon Squeezy billing (BILL-01-03) | Official SDK for checkout + webhooks; webhook signature verification |
| Error capture (OBS-01-02) | Single POST endpoint; queryable error_reports table |
| OpenAPI spec (API-01-03) | @fastify/swagger + fastify-type-provider-zod bridge |
| Plan enforcement (BILL-03) | @fastify/rate-limit with per-user async max function |

**What is NOT re-researched (working, do not change):**
- Fastify 5.7.4, Drizzle 0.45.1, better-sqlite3 12.6.2, Zod 4.3.6
- @fastify/cookie, @fastify/cors, @fastify/multipart, @fastify/static, @fastify/oauth2
- @fastify/websocket, nodemailer, imapflow, googleapis, octokit
- Cookie-based session auth (authPlugin, requireAuth decorator)
- Envelope pattern (lib/envelope.ts: ok(), err(), meta())
- SSE hub at /api/events

---

## Core Technologies (existing — confirmed working)

| Technology | Version | Purpose |
|------------|---------|---------|
| Fastify | 5.7.4 | HTTP server |
| Drizzle ORM | 0.45.1 | Type-safe SQLite queries |
| better-sqlite3 | 12.6.2 | SQLite driver (synchronous) |
| Zod | 4.3.6 | Runtime validation |
| uuid | 13.0.0 | ID generation |

---

## New Libraries Needed

### Streaming Chat (STRM-01, STRM-02, STRM-03)

The current `/api/v1/chat/stream` route proxies to porter.py. v2.0 needs native Fastify streaming from Ollama and OpenClaw backends directly — no Python intermediary.

**Problem:** Native `fetch()` in Node.js 18+ returns a ReadableStream. Ollama streams NDJSON. OpenClaw streams OpenAI-compatible SSE. Both need to be normalized to a single SSE event format before forwarding to the client.

**Solution:** Use `ollama` (official JS SDK) for Ollama streaming — it returns an AsyncGenerator with `{ done, response }` chunks. For OpenClaw (OpenAI-compatible), use raw `fetch` with a streaming reader and line-buffer parser — no extra library needed, Node.js 18+ fetch handles it.

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| ollama | 0.6.3 | Official Ollama JS SDK | Returns AsyncIterable<ChatResponse> with `stream: true`; handles NDJSON line buffering internally; avoids manual chunk boundary parsing |

**Cancellation pattern (STRM-03):**
```typescript
// In the route handler:
const ac = new AbortController();
request.socket.on('close', () => ac.abort());

// Pass to ollama:
const stream = await ollama.chat({ model, messages, stream: true, signal: ac.signal });

// Pass to OpenClaw fetch:
const res = await fetch(openclawUrl, { signal: ac.signal, ... });
```

No additional library is needed for cancellation — Node.js `AbortController` + socket close event covers it.

**Why NOT langchain/openai SDK for Ollama:** ollama-js (npm: `ollama`) is the official Ollama SDK at 0.6.3. LangChain adds 40+ MB of transitive dependencies for no benefit here. The existing OpenClaw backend is OpenAI-wire-compatible, so `fetch` with raw streaming is sufficient.

---

### OpenAPI Spec Generation (API-01, API-02, API-03)

The existing routes use Zod schemas for validation but expose no OpenAPI spec. v2.0 requires auto-generated OpenAPI documentation from route definitions.

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| @fastify/swagger | 9.7.0 | OpenAPI 3.0/3.1 spec generation | Official Fastify plugin; reads route JSON schemas and emits spec at /api/v1/docs/json |
| @fastify/swagger-ui | 5.2.5 | Swagger UI browser interface | Serves interactive docs at /api/v1/docs; paired with @fastify/swagger |
| fastify-type-provider-zod | 6.1.0 | Zod → JSON Schema bridge for Fastify | Converts Zod v4 schemas used in route definitions into JSON Schema for Swagger to consume; requires Fastify ^5.5.0 and Zod >=4.1.5 |

**Integration pattern:**
```typescript
// In index.ts, register BEFORE routes:
await fastify.register(swagger, {
  openapi: {
    openapi: '3.0.3',
    info: { title: 'Porter API', version: 'v2.0.0' },
  },
  transform: jsonSchemaTransform, // from fastify-type-provider-zod
});
await fastify.register(swaggerUi, { routePrefix: '/api/v1/docs' });

// Set type provider on fastify instance:
const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
```

**Why NOT zod-openapi or fastify-zod:** `fastify-type-provider-zod` at v6.1.0 is the most actively maintained bridge for Fastify 5 + Zod 4. It has explicit peer deps on Fastify ^5.5.0 and is updated monthly. The older `fastify-zod` is unmaintained.

---

### Plan Enforcement + Rate Limiting (BILL-03)

Per-user API rate limits based on subscription plan. Existing billing service (`services/billing.ts`) has `resolvePlan()` — this plugs into it.

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| @fastify/rate-limit | 10.3.0 | Per-route rate limiting with async max function | Fastify 5 compatible (v9+ supports Fastify 5); supports `async (request, key) => number` for `max` param, enabling per-plan limits without a store |

**Integration pattern:**
```typescript
// In v1 routes:
fastify.register(rateLimit, {
  global: false, // opt-in per route
  keyGenerator: (req) => req.sessionUser?.username ?? req.ip,
  max: async (req) => {
    const plan = resolvePlan(req.sessionUser!.username);
    return plan.plan === 'enterprise' ? 10000
         : plan.plan === 'cloud_team' ? 5000
         : plan.plan === 'cloud'      ? 1000
         : 100; // free
  },
  timeWindow: '1 minute',
  errorResponseBuilder: () => err('RATE_LIMITED', 'API limit reached for your plan'),
});
```

**Why NOT Redis-backed store:** The in-memory store is sufficient for a single-server deployment. SQLite WAL mode is already handling persistent data. Adding Redis for rate limiting on a 2 vCPU VPS is wasteful. If Porter becomes multi-instance, add Redis then.

---

### Autonomous Learning — Web Scraping (LEARN-01, LEARN-02, LEARN-03)

Agents need to fetch and extract knowledge from web pages, GitHub repos, and Reddit threads. This is a background service that stores results as Memory V2 concepts.

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| cheerio | 1.2.0 | HTML parsing and content extraction | Lightweight jQuery-like API for server-side HTML; no browser overhead; ~500KB; suitable for static content (MDN, GitHub READMEs, Reddit JSON API, blog posts) |

**No Playwright or Puppeteer.** Running a headless Chromium instance on a 2 vCPU/8GB VPS alongside porter.py + Node.js + SQLite is not viable. Cheerio handles the 90% case — public web pages with server-rendered HTML.

**For JavaScript-rendered pages:** Use the page's JSON API directly when available (Reddit exposes JSON at `?format=json` on any URL; GitHub has the REST API via octokit already installed). Do not run headless browsers.

**External sources covered by existing libraries:**
- GitHub: `octokit` (already installed) — REST API for repos, issues, READMEs
- General web: `cheerio` + native `fetch` — HTML parsing for blog posts, documentation

**Reddit:** Use the unofficial JSON endpoint (`https://reddit.com/r/{sub}.json`) — free tier, no SDK needed, handles rate limiting with exponential backoff in the service.

**Twitter/X:** Do not implement. API costs $100/month minimum. Agents can be prompted to share X links in chat; human pastes content.

**Learning pipeline (no new libraries):**
```
scheduler.ts → learningService.ts
  → fetch(url) + cheerio.load(html)
  → extract title, body text, metadata
  → LLM summarization (via existing ai-router)
  → db.insert(memory_concepts, { source_url, confidence, content })
```

---

### Lemon Squeezy Billing (BILL-01, BILL-02, BILL-03)

The existing `services/billing.ts` already implements Lemon Squeezy API calls using raw `fetch`. The existing `subscriptions` and `billing_events` tables are already in schema. The existing `services/billing.ts` has `verifyWebhookSignature()`, `createCheckout()`, and `getCustomerPortalUrl()`.

**What's new in v2.0:** The billing service exists but the webhook handler and plan limit enforcement need to be wired into actual routes. No new libraries are needed — the existing implementation uses `fetch` directly against the LS API.

**However:** The official SDK exists and is worth adopting for cleaner TypeScript types:

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| @lemonsqueezy/lemonsqueezy.js | 4.0.0 | Official LS SDK — typed API client | Provides full TypeScript types for subscriptions, customers, checkouts; eliminates raw `fetch` boilerplate in billing.ts; webhook signature verification built-in |

**Verdict:** This is a quality-of-life upgrade, not a requirement. The existing raw `fetch` approach in `billing.ts` works. Adopt the official SDK when refactoring `billing.ts` in the v2.0 billing phase — do not prioritize over other features.

**Webhook signature verification (BILL-01):** Already implemented via `verifyWebhookSignature()` in billing.ts using Node.js `crypto.createHmac`. No additional library needed.

---

## Schema Additions (No New Libraries)

These are pure Drizzle schema additions to `backend/src/db/schema.ts`. All use existing SQLite + Drizzle + better-sqlite3 infrastructure.

### Collaborative Sessions (COLLAB-01-04)

New table: `project_collaborators`
```typescript
export const projectCollaborators = sqliteTable('project_collaborators', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  username: text('username').notNull(),
  role: text('role').notNull().default('view'), // 'view' | 'chat' | 'edit' | 'admin'
  invitedBy: text('invited_by').notNull(),
  invitedAt: real('invited_at').default(sql`(unixepoch('now'))`),
  acceptedAt: real('accepted_at'),
  revokedAt: real('revoked_at'),
});
```

New table: `project_invites`
```typescript
export const projectInvites = sqliteTable('project_invites', {
  token: text('token').primaryKey(),            // UUID, single-use
  projectId: text('project_id').notNull(),
  email: text('email').notNull(),
  role: text('role').notNull().default('view'),
  invitedBy: text('invited_by').notNull(),
  expiresAt: real('expires_at').notNull(),       // 7 days
  usedAt: real('used_at'),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});
```

**Invite emails:** Use existing `nodemailer` (already installed) with a template. No new email library needed.

### Unified Chat Model (CHAT-01-04)

Schema additions to existing `chats` and `chat_messages` tables:

```typescript
// Add to chatMessages:
parentMessageId: integer('parent_message_id'),   // for threading
channelType: text('channel_type').default('agent'), // 'agent' | 'email' | 'whatsapp' | 'project'
externalId: text('external_id'),                 // external message ID (WhatsApp, email)
```

FTS5 virtual table for CHAT-03 (full-text search) — created via raw SQL in a new migration, not Drizzle schema (Drizzle does not support CREATE VIRTUAL TABLE):
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS chat_messages_fts USING fts5(
  content,
  content='chat_messages',
  content_rowid='id'
);
```

**Why raw SQL for FTS5:** Drizzle has an open feature request (#2046) for FTS5 support but it is not shipped as of v0.45.1. The standard pattern is a migration file with `sqlite.exec(sql)` using the existing `better-sqlite3` client.

### CRM Backend (CRM-01-04)

Extend existing `people` table (exists in porter.py DB, needs Fastify schema definition):

```typescript
export const contacts = sqliteTable('contacts', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id'),            // for future multi-tenant
  firstName: text('first_name'),
  lastName: text('last_name'),
  company: text('company'),
  notes: text('notes'),
  aiAnalysis: text('ai_analysis'),              // CRM-03: LLM-generated summary
  lastAnalyzedAt: real('last_analyzed_at'),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
  updatedAt: real('updated_at').default(sql`(unixepoch('now'))`),
});

export const contactEmails = sqliteTable('contact_emails', {  // CRM-01
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: text('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  label: text('label').default('work'),          // 'work' | 'personal' | 'other'
  isPrimary: integer('is_primary').default(0),
});

export const contactPhones = sqliteTable('contact_phones', {  // CRM-01
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: text('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  phone: text('phone').notNull(),
  countryCode: text('country_code').default('+1'),
  label: text('label').default('mobile'),
  isPrimary: integer('is_primary').default(0),
});

export const contactSocialLinks = sqliteTable('contact_social_links', {  // CRM-02
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: text('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),          // 'linkedin' | 'x' | 'github' | 'website'
  url: text('url').notNull(),
});

export const contactActivity = sqliteTable('contact_activity', {  // CRM-04
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: text('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  activityType: text('activity_type').notNull(), // 'chat' | 'email' | 'whatsapp' | 'note' | 'meeting'
  projectId: text('project_id'),
  summary: text('summary'),
  detail: text('detail'),
  occurredAt: real('occurred_at').notNull(),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});
```

**No phone/country code validation library needed.** Store raw strings as entered. Country codes are user-supplied text ('+65', '+1', etc.). Validation can be added later if needed.

### File Associations (FILE-01-03)

New pivot table:
```typescript
export const fileAssociations = sqliteTable('file_associations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fileId: text('file_id').notNull(),             // references existing file uploads
  entityType: text('entity_type').notNull(),     // 'project' | 'contact' | 'conversation'
  entityId: text('entity_id').notNull(),
  associatedBy: text('associated_by').notNull(),
  associatedAt: real('associated_at').default(sql`(unixepoch('now'))`),
});
```

Existing `@fastify/multipart` handles file upload. Existing file serving infrastructure stays. This is metadata only.

### Agent Templates (TMPL-01-03)

100 templates stored as TypeScript data in `src/data/agent-templates.ts` — no database table, no new library. Templates are loaded at startup and served via API. Indexed by category for filtering.

```typescript
export interface AgentTemplate {
  id: string;
  name: string;
  category: string;      // 'engineering' | 'marketing' | 'research' | 'ops' | ...
  role: string;
  systemPrompt: string;
  skills: string[];
  tools: string[];       // from existing tool registry
  preferredBackend: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}
```

**Why not a DB table:** Templates are static content, not user data. They ship with the codebase. Searching/filtering 100 records in-memory is faster than SQLite for this scale.

### Error Capture (OBS-01-02)

New table:
```typescript
export const errorReports = sqliteTable('error_reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  severity: text('severity').default('error'),   // 'warn' | 'error' | 'fatal'
  component: text('component'),                  // React component name or route
  message: text('message').notNull(),
  stack: text('stack'),
  userContext: text('user_context'),             // JSON: username, plan, page, UA
  appVersion: text('app_version'),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});
```

Single POST route at `/api/v1/errors`. Admin query route with filters. No external error monitoring service — self-hosted, queryable via API.

---

## What NOT to Add

| Avoid | Why | What to Use Instead |
|-------|-----|---------------------|
| Playwright / Puppeteer | Headless browser needs 300-500MB RAM; kills the 2 vCPU VPS under load | cheerio + fetch for static pages; octokit for GitHub; Reddit JSON API |
| BullMQ / Redis | Redis adds 200MB+ RAM; existing toad-scheduler handles current load | toad-scheduler (already installed via @fastify/schedule) |
| Socket.IO | Heavy abstraction; @fastify/websocket already installed and sufficient | @fastify/websocket (already installed) |
| LangChain | 40MB+ of dependencies for AI routing Porter already handles | ollama (0.6.3, 180KB); raw fetch for OpenClaw |
| Stripe | Lemon Squeezy is already the billing decision with existing schema | @lemonsqueezy/lemonsqueezy.js |
| Sentry / DataDog | External service with cost; v2.0 is self-hosted error capture | Custom errorReports table + query endpoint |
| libSQL / Turso | Adds network latency; better-sqlite3 is ~100x faster for this workload | better-sqlite3 (already installed) |
| phone-number validation libs | Over-engineering; store as text, validate format server-side with regex | Zod .regex() in route schema |
| prisma | Migration complexity; Drizzle is already installed | Drizzle ORM (already installed) |
| Fastify WebSocket for chat streaming | WebSocket is bidirectional; SSE is simpler for AI token streaming | raw `reply.raw.write()` with SSE headers |

---

## Installation

```bash
cd /home/lobster/documents/porter/backend

# Streaming AI (replaces porter.py proxy for Ollama)
npm install ollama

# OpenAPI spec + Swagger UI
npm install @fastify/swagger @fastify/swagger-ui fastify-type-provider-zod

# Plan-based rate limiting
npm install @fastify/rate-limit

# Autonomous learning (HTML parsing)
npm install cheerio

# Optional: Official Lemon Squeezy SDK (adopt when refactoring billing.ts)
npm install @lemonsqueezy/lemonsqueezy.js
```

All other v2.0 features (collaboration, unified chat, CRM, file associations, templates, error capture) require **schema changes only** — no new npm packages.

---

## Version Compatibility

| Package | Version | Peer Requirements | Notes |
|---------|---------|-------------------|-------|
| ollama | 0.6.3 | Node.js 18+ | Official Ollama JS SDK; uses native fetch + AsyncIterable |
| @fastify/swagger | 9.7.0 | Fastify ^5.x | Must register before routes; exposes fastify.swagger() decorator |
| @fastify/swagger-ui | 5.2.5 | Fastify ^5.x, @fastify/swagger ^9 | Register after @fastify/swagger |
| fastify-type-provider-zod | 6.1.0 | Fastify ^5.5.0, Zod >=4.1.5 | Porter has Fastify 5.7.4 + Zod 4.3.6 — both satisfy requirements |
| @fastify/rate-limit | 10.3.0 | Fastify ^5.x | In-memory store by default; async max function for per-plan limits |
| cheerio | 1.2.0 | Node.js 18+ | No peer conflicts; types included |
| @lemonsqueezy/lemonsqueezy.js | 4.0.0 | Node.js 18+ | TypeScript-native; replaces raw fetch in billing.ts |

---

## Integration Points with Existing Stack

| New Feature | Attaches To | Integration Notes |
|-------------|-------------|-------------------|
| Ollama streaming | `routes/v1/chat.ts` | Replace the proxy-to-porter.py GET /stream with native ollama SDK call; reuse existing SSE header pattern from `reply.raw.write()` |
| OpenAPI spec | `index.ts` (startup) | Register `@fastify/swagger` + `fastify-type-provider-zod` before `v1Routes`; all existing Zod schemas in v1 routes become documented automatically |
| Rate limiting | `routes/v1/index.ts` | Register `@fastify/rate-limit` as global plugin with per-user async max; override per-route for public endpoints |
| Collaboration RBAC | `plugins/auth.ts` | Extend `requireAuth` to accept optional `projectRole` check; collaborators resolved from `project_collaborators` table |
| CRM contacts | New `routes/v1/contacts.ts` | New v1 route group; `services/crm.ts` for AI analysis trigger; reuse existing `nodemailer` for invite emails |
| File associations | `routes/v1/files.ts` | Add `entity_type` + `entity_id` fields to existing upload endpoint; `fileAssociations` pivot written on upload |
| Agent templates | New `routes/v1/templates.ts` | Static data from `data/agent-templates.ts`; in-memory filter by category; template instantiation calls existing persona creation logic |
| Autonomous learning | `services/scheduler.ts` | New `learningJob` registered in existing scheduler; uses `cheerio` + existing `ai-router` for summarization; writes to `memory_concepts` |
| Error capture | New `routes/v1/errors.ts` | Public POST (no auth required to capture errors); admin GET with filters requires auth |
| Lemon Squeezy SDK | `services/billing.ts` | Refactor existing `lsApiFetch` helper to use SDK; webhook handler in `routes/v1/billing.ts` uses SDK's `webhookHasMeta` type guard |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| New library versions | HIGH | All versions verified via `npm show` against live registry |
| Fastify 5 compatibility | HIGH | fastify-type-provider-zod@6.1.0 explicitly requires Fastify ^5.5.0; @fastify/swagger@9+ and @fastify/rate-limit@10+ are Fastify 5 compatible per official repos |
| Ollama streaming via ollama-js | HIGH | Official Ollama SDK; AsyncIterable pattern confirmed in docs and DeepWiki |
| Cheerio for web scraping | HIGH | Stable library (1.2.0); jQuery-like API; suitable for static HTML; limitation (JS-rendered pages) well-documented |
| Schema design (CRM, collaboration) | MEDIUM | Standard relational patterns; no novel approach; FTS5 via raw SQL is established workaround for Drizzle limitation |
| @lemonsqueezy/lemonsqueezy.js as optional | HIGH | Existing raw-fetch implementation already works; SDK is a quality upgrade, not a requirement |
| AbortController cancellation | HIGH | Native Node.js 18+ feature; socket close event pattern is established |
| FTS5 via raw SQL migration | HIGH | Drizzle issue #2046 confirms no native FTS5; raw SQL pattern confirmed working in astro-db-fts example |
| Agent templates as static TS data | HIGH | 100 records in memory is negligible; no query complexity needed |

---

## Sources

- npm registry (live) — ollama@0.6.3, @fastify/swagger@9.7.0, @fastify/swagger-ui@5.2.5, fastify-type-provider-zod@6.1.0, @fastify/rate-limit@10.3.0, cheerio@1.2.0, @lemonsqueezy/lemonsqueezy.js@4.0.0 — HIGH confidence
- [fastify-type-provider-zod GitHub](https://github.com/turkerdev/fastify-type-provider-zod) — Fastify ^5.5.0 + Zod >=4.1.5 peer deps confirmed — HIGH confidence
- [Ollama JS streaming docs](https://github.com/ollama/ollama-js) — AsyncIterable with `stream: true` confirmed — HIGH confidence
- [Drizzle FTS5 feature request #2046](https://github.com/drizzle-team/drizzle-orm/issues/2046) — confirms no native FTS5; raw SQL pattern required — HIGH confidence
- [astro-db-fts](https://github.com/delucis/astro-db-fts) — working FTS5 pattern with Drizzle via raw sql\`\` — HIGH confidence
- [Ollama streaming capabilities](https://docs.ollama.com/capabilities/streaming) — SSE + NDJSON both supported — HIGH confidence
- [Cheerio official site](https://cheerio.js.org/) — version 1.2.0; static HTML only; no browser — HIGH confidence
- [lemonsqueezy.js official SDK](https://github.com/lmsqueezy/lemonsqueezy.js) — official Lemon Squeezy SDK, TypeScript-native, v4.0.0 — HIGH confidence
- [WebSearch] @fastify/rate-limit async max function — per-plan enforcement pattern — MEDIUM confidence (community documentation, consistent with official README)
- backend/src/db/schema.ts — existing schema verified by code read — HIGH confidence
- backend/src/services/billing.ts — existing billing implementation verified by code read — HIGH confidence

---

*Stack research for: Porter v2.0 Backend Ready — new feature additions only*
*Researched: 2026-03-21*
