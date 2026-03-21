# Phase 7: External Connections - Research

**Researched:** 2026-03-21
**Domain:** OAuth2, external service integrations (GitHub/Email/Calendar/WhatsApp), credential encryption, background job queuing
**Confidence:** HIGH (stack pre-researched in STACK.md, codebase fully read, versions verified against npm registry)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- OAuth popup/redirect flow for GitHub and Google (not API key entry for those services)
- Meta Business verification flow for WhatsApp (one Business number per workspace)
- API key paste as fallback for services without OAuth
- Dedicated Connections page in UI — top-level nav or settings sub-page with service cards, connect/disconnect buttons, status dots, last sync time
- Project-level overrides via dropdown pointing to a different workspace connection (not per-project OAuth) — leverages existing `project_connections` table
- Admin-only connection management — operators/viewers can see and use but not configure
- AES-256-GCM encryption for all credentials at rest; key derived from `PORTER_SECRET` env var; credentials in `workspace_connections.meta_json`
- Auto-retry with silent token refresh; if refresh fails: mark 'needs_reauth', amber SSE toast
- Agent jobs depending on broken connection queue with 'blocked' status until reauth
- One WhatsApp Business number per workspace (Meta Cloud API)
- Agent identity in WhatsApp: name prefix + emoji (e.g., "Writer: draft...")
- @mention routing for agents; Porter dispatches to best agent when no @mention
- Project-linked WhatsApp group chats
- Fully autonomous agent email — agents send as part of work, plus configurable notifications
- IMAP IDLE polling via imapflow with OAuth2 (no raw passwords)
- Rule-based + AI fallback inbound email routing
- Outbound identity: workspace email with agent name in display name
- Bidirectional Google Calendar sync — read events, push milestones/deadlines to Calendar
- Agent awareness + urgency boost for approaching deadlines; wires into Phase 4 event trigger
- Calendar display on project dashboard timeline (primary); dedicated calendar view as secondary (deferred)
- GitHub: read + PR creation scope only; no direct push to main
- OAuth2 via @fastify/oauth2; octokit for all GitHub API calls
- All external API calls routed through background worker — no HTTP handler blocks on external response

### Claude's Discretion
- Exact Connections page layout and card design
- OAuth redirect URL configuration and callback handling
- IMAP IDLE reconnection strategy
- WhatsApp webhook URL setup (public endpoint exposure)
- Calendar sync interval and conflict resolution
- Background worker queue architecture for external calls
- Hardcoding purge strategy and order of operations

### Deferred Ideas (OUT OF SCOPE)
- Full email engine (self-hosted mail server, per-agent addresses)
- Dedicated full calendar view page
- Microsoft 365 Calendar (@microsoft/microsoft-graph-client)
- Full GitHub write access (direct push, merge PRs, manage labels)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONN-01 | GitHub integration — connect repos via OAuth, agents can read/write code, create PRs | @fastify/oauth2 v8.2.0 + octokit v5.0.5; workspace_connections table ready; Fastify v1 route pattern established |
| CONN-02 | Email integration — Porter sends notifications, agents can send/receive email | nodemailer v8.0.3 (outbound) + imapflow v1.2.16 (IMAP IDLE inbound); OAuth2 for Gmail/Outlook |
| CONN-03 | Calendar integration — sync deadlines via Google Calendar, agents aware of schedules | googleapis v171.4.0; event-triggers.ts already has deadline-approaching trigger to wire into |
| CONN-04 | WhatsApp bidirectional bridge — Meta Cloud API, agent-specific chat, group chats | Direct fetch() to graph.facebook.com/v21.0; Fastify webhook receiver; no SDK needed (official SDK is Alpha) |
| CONN-05 | All external connections configurable via UI — zero hardcoded API keys, tokens, paths, URLs | CLAUDE.md lists all known violations; AES-256-GCM via Node.js built-in crypto; PORTER_SECRET env var |
</phase_requirements>

---

## Summary

Phase 7 wires Porter agents into four external services (GitHub, email, Google Calendar, WhatsApp) and simultaneously purges all hardcoded configuration from the codebase. The DB infrastructure is largely ready: `workspace_connections`, `project_connections`, and `environment_tools` tables exist in porter.py's schema (lines 752-790). The Fastify backend needs Drizzle schemas for those three tables, Fastify v1 CRUD routes for connections management, and new service modules (`github.ts`, `email.ts`, `calendar.ts`, `whatsapp.ts`).

The entire stack is pre-researched: octokit v5.0.5, @fastify/oauth2 v8.2.0, nodemailer v8.0.3, imapflow v1.2.16, googleapis v171.4.0 — all verified against the npm registry as of 2026-03-21. @fastify/oauth2 requires `@fastify/cookie` which is already installed at v11.0.2. WhatsApp uses direct `fetch()` calls to the Meta Cloud API (official SDK is Alpha/incomplete — do not use it).

The single most important architectural constraint: all external API calls must be routed through background `agent_jobs` rows, never blocking HTTP handlers. The scheduler in `scheduler.ts` already executes `agent_jobs` — external integration merely becomes a new trigger type processed there. Credential security requires AES-256-GCM using Node.js's built-in `crypto` module (no third-party crypto libs needed — AES-256-GCM is confirmed available in this environment).

**Primary recommendation:** Implement in this order — (1) credential encryption utility + DB migration, (2) connections CRUD API + UI, (3) hardcoding purge, (4) GitHub, (5) Email, (6) Calendar, (7) WhatsApp, (8) project-level overrides, (9) external call queuing pattern. The order matters because later services depend on the encryption utility and connections API scaffolding.

---

## Standard Stack

### Core (already installed — do not reinstall)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | 5.7.4 | HTTP server | Already running; all new routes go into `/api/v1/connections/*` |
| drizzle-orm | 0.45.1 | DB ORM | Already used for all Phase 4-6 schemas |
| better-sqlite3 | 12.6.2 | SQLite driver | Already installed, WAL mode, synchronous API |
| zod | 4.3.6 | Request validation | Standard for all v1 routes |
| @fastify/cookie | 11.0.2 | Cookie handling | Already installed; required peer dep for @fastify/oauth2 |
| node:crypto | built-in | AES-256-GCM encryption | Built into Node.js; no install needed; aes-256-gcm confirmed available |

### New Libraries to Install
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| octokit | 5.0.5 | GitHub REST + GraphQL API | All GitHub API calls after OAuth token obtained |
| @fastify/oauth2 | 8.2.0 | OAuth2 authorization code flow | GitHub OAuth + Google OAuth callbacks |
| nodemailer | 8.0.3 | Send emails via SMTP | Agent outbound email, notifications |
| @types/nodemailer | 7.0.11 | TypeScript types for nodemailer | Dev dependency |
| imapflow | 1.2.16 | IMAP IDLE inbound email | Watching inbox for email-triggered agent actions |
| googleapis | 171.4.0 | Google Calendar API | Calendar read/write, OAuth token refresh |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node:crypto (built-in) | node-forge / crypto-js | No benefit — built-in AES-256-GCM is identical in capability with zero install overhead |
| fetch() for WhatsApp | whatsapp-web.js | whatsapp-web.js violates Meta ToS, uses Puppeteer (memory-heavy), gets numbers banned |
| fetch() for WhatsApp | official WhatsApp Node SDK | SDK is 0.0.5-Alpha, incomplete, not production-ready |
| imapflow | node-imap | node-imap unmaintained since 2019; imapflow is modern, Promise-based, supports OAuth2 |
| googleapis | node-google-calendar | googleapis is official SDK with auto token refresh; node-google-calendar is unmaintained |

**Installation:**
```bash
cd /home/lobster/documents/porter/backend
npm install octokit @fastify/oauth2
npm install nodemailer imapflow googleapis
npm install -D @types/nodemailer
```

**Version verification (confirmed against npm registry 2026-03-21):**
- octokit: 5.0.5
- @fastify/oauth2: 8.2.0
- nodemailer: 8.0.3
- @types/nodemailer: 7.0.11
- imapflow: 1.2.16
- googleapis: 171.4.0

---

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
├── db/
│   ├── migrate-07.ts         # workspace_connections + project_connections Drizzle schemas
│   └── schema.ts             # + workspaceConnections, projectConnections exports
├── lib/
│   └── credential-crypto.ts  # AES-256-GCM encrypt/decrypt for meta_json
├── services/
│   ├── github.ts             # Octokit wrapper; reads from workspace_connections
│   ├── email.ts              # nodemailer outbound + imapflow IMAP IDLE
│   ├── calendar.ts           # googleapis Google Calendar read/write
│   └── whatsapp.ts           # Meta Cloud API fetch wrapper
└── routes/v1/
    ├── connections.ts         # CRUD for workspace_connections + project overrides
    ├── oauth-github.ts        # @fastify/oauth2 GitHub start/callback
    ├── oauth-google.ts        # @fastify/oauth2 Google start/callback
    └── webhooks/
        ├── whatsapp.ts        # POST /api/v1/webhooks/whatsapp (Meta sends here)
        └── email.ts           # optional inbound email webhook

frontend/src/
└── modules/
    └── connections/
        ├── ConnectionsPage.tsx        # Main page: service cards
        ├── ServiceCard.tsx            # Individual provider card (icon, status dot, connect/disconnect)
        ├── OAuthConnectButton.tsx     # Triggers popup OAuth flow
        └── ProjectConnectionsPanel.tsx # Per-project override dropdown
```

### Pattern 1: AES-256-GCM Credential Encryption
**What:** Encrypt the `meta_json` blob before writing to DB; decrypt at call time only.
**When to use:** Every write to `workspace_connections.meta_json`; decrypt only inside service modules when making external calls.
**Example:**
```typescript
// backend/src/lib/credential-crypto.ts
// Source: Node.js built-in crypto docs
import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12; // GCM standard

function getDerivedKey(): Buffer {
  const secret = process.env.PORTER_SECRET;
  if (!secret) throw new Error('PORTER_SECRET env var is required for credential encryption');
  return crypto.scryptSync(secret, 'porter-connections-salt', KEY_LEN);
}

export function encryptCredential(plaintext: string): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv(hex):tag(hex):ciphertext(hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptCredential(encoded: string): string {
  const key = getDerivedKey();
  const [ivHex, tagHex, ctHex] = encoded.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
```

### Pattern 2: OAuth2 Flow via @fastify/oauth2
**What:** Register @fastify/oauth2 plugin per provider; callback stores tokens in workspace_connections.
**When to use:** GitHub and Google Calendar connections.
**Example:**
```typescript
// backend/src/routes/v1/oauth-github.ts
// Source: @fastify/oauth2 v8 official README
import oauth2 from '@fastify/oauth2';

export default async function githubOAuthRoutes(fastify: FastifyInstance) {
  fastify.register(oauth2, {
    name: 'githubOAuth2',
    credentials: {
      client: {
        id: process.env.GITHUB_CLIENT_ID ?? '',
        secret: process.env.GITHUB_CLIENT_SECRET ?? '',
      },
      auth: oauth2.GITHUB_CONFIGURATION,
    },
    scope: ['repo', 'read:user'],
    startRedirectPath: '/auth/github/start',
    callbackUri: `${process.env.PORTER_PUBLIC_URL}/api/v1/oauth/github/callback`,
  });

  fastify.get('/auth/github/callback', async (request, reply) => {
    const token = await fastify.githubOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
    // Encrypt and store in workspace_connections.meta_json
    const encrypted = encryptCredential(JSON.stringify({
      access_token: token.token.access_token,
      refresh_token: token.token.refresh_token,
    }));
    // INSERT OR REPLACE into workspace_connections ...
    return reply.redirect('/v2/settings/connections?connected=github');
  });
}
```

### Pattern 3: External Calls via agent_jobs Queue
**What:** Route all external API calls through the agent_jobs scheduler, never blocking HTTP handlers.
**When to use:** Every time an agent triggers a GitHub action, email send, calendar read, or WhatsApp message.
**Example:**
```typescript
// When an agent wants to send an email, create a job — don't call nodemailer directly from the HTTP handler
sqlite.prepare(`
  INSERT INTO agent_jobs (id, agent_id, project_id, trigger_type, trigger_data, prompt, status, scheduled_for)
  VALUES (?, ?, ?, 'external_call', ?, ?, 'pending', unixepoch('now'))
`).run(
  crypto.randomUUID(), agentId, projectId,
  JSON.stringify({ service: 'email', action: 'send', to, subject, body }),
  `Send email to ${to}: ${subject}`
);
```
Then the scheduler's `executeJob()` dispatches based on `trigger_type === 'external_call'` and `trigger_data.service`.

### Pattern 4: IMAP IDLE for Inbound Email
**What:** imapflow maintains a persistent IMAP IDLE connection; new messages fire an event that creates an agent_job.
**When to use:** Inbound email monitoring.
**Example:**
```typescript
// backend/src/services/email.ts
// Source: imapflow official docs (https://imapflow.com/)
import { ImapFlow } from 'imapflow';

export async function startImapIdle(credentials: ImapCredentials) {
  const client = new ImapFlow({
    host: credentials.host,
    port: credentials.port,
    secure: true,
    auth: {
      user: credentials.user,
      accessToken: credentials.accessToken, // OAuth2 token — never raw password
    },
  });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    client.on('exists', async () => {
      // New message arrived — fetch and route to agent
      const messages = await client.fetch('*', { source: true });
      // Insert agent_job for routing
    });
    await client.idle(); // IDLE blocks until server sends EXISTS notification
  } finally {
    lock.release();
    await client.logout();
  }
}
```

### Pattern 5: WhatsApp via Meta Cloud API
**What:** Direct fetch() calls to graph.facebook.com v21.0; Fastify webhook route receives inbound.
**When to use:** All WhatsApp send/receive.
**Example:**
```typescript
// backend/src/services/whatsapp.ts
export async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string,
) {
  const resp = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
  if (!resp.ok) throw new Error(`WhatsApp API error: ${resp.status}`);
  return resp.json();
}

// Webhook receiver — Meta verifies with GET, sends messages via POST
// GET /api/v1/webhooks/whatsapp — handle hub.challenge verification
// POST /api/v1/webhooks/whatsapp — receive messages, verify X-Hub-Signature-256
```

### Anti-Patterns to Avoid
- **Blocking HTTP handler on external API call:** Never await a GitHub/email/calendar/WhatsApp call inside a Fastify route handler. Always create an `agent_job` row and return immediately.
- **Storing raw secrets in meta_json:** Always encrypt before INSERT, decrypt only inside service module at call time. Never log decrypted values.
- **Per-project OAuth flows:** Project-level overrides use a dropdown pointing to a workspace connection — NOT a separate OAuth flow per project. This is locked.
- **Using whatsapp-web.js:** ToS violation, Puppeteer memory footprint, account ban risk. Use Meta Cloud API direct fetch().
- **Hardcoded OAuth redirect URIs:** PORTER_PUBLIC_URL env var must be configurable — never hardcode the callback domain.
- **Storing PORTER_SECRET with a hardcoded fallback:** `process.env.PORTER_SECRET ?? ''` is wrong. Throw immediately if missing — like `openclawToken` does today.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub API pagination, rate limiting, auth | Custom GitHub fetch wrapper | octokit | Octokit handles retry, pagination, token refresh, GraphQL + REST |
| OAuth2 authorization code flow | Custom redirect/callback | @fastify/oauth2 | State param, PKCE, callback URL handling, token exchange — many edge cases |
| Google Calendar token refresh | Manual OAuth token management | googleapis | Google SDK auto-refreshes expired tokens transparently |
| AES cipher key derivation | Custom key derivation | crypto.scryptSync() + AES-256-GCM | Node.js built-in is correct, audited, zero deps |
| IMAP protocol | Raw IMAP socket | imapflow | IMAP IDLE, TLS, OAuth2, reconnection — substantial protocol complexity |
| WhatsApp webhook signature verification | Custom HMAC-SHA256 | Standard crypto.createHmac('sha256') against X-Hub-Signature-256 | Simple but security-critical — use established pattern |

**Key insight:** Every one of these problems has edge cases (token refresh races, pagination bugs, IMAP reconnection storms, OAuth state parameter forgery) that take weeks to discover in production. The ecosystem libraries encode years of hard-won fixes.

---

## Common Pitfalls

### Pitfall 1: PORTER_SECRET Missing at Runtime
**What goes wrong:** `encryptCredential()` throws at startup or when first credential is saved. Tokens in meta_json become unreadable.
**Why it happens:** Env var not set in the systemd unit file. Encrypted tokens use a different key after unit restart with new secret.
**How to avoid:** Validate PORTER_SECRET presence at Fastify startup, before `migrate07`. Throw with a clear message: "PORTER_SECRET must be set — generate with: openssl rand -hex 32". Document in CLAUDE.md.
**Warning signs:** "PORTER_SECRET env var is required" error in logs; connections show status 'disconnected' after restart.

### Pitfall 2: OAuth Callback URL Mismatch
**What goes wrong:** GitHub/Google returns "redirect_uri mismatch" error. User sees OAuth error page.
**Why it happens:** The callback URI registered in GitHub/Google Console must match exactly the URI sent in the authorization request. Includes protocol, port, path.
**How to avoid:** PORTER_PUBLIC_URL env var is the single source for the base URL in all OAuth callback URIs. Never hardcode. Document setup: "Set PORTER_PUBLIC_URL to your public-facing URL (e.g., https://yourserver.com)".
**Warning signs:** OAuth flow fails on first callback; GitHub shows "redirect_uri_mismatch" in URL.

### Pitfall 3: WhatsApp Webhook Not Publicly Reachable
**What goes wrong:** Meta cannot verify the webhook endpoint. WhatsApp inbound messages never arrive.
**Why it happens:** Porter runs on `127.0.0.1:8877` bound locally. Meta requires a public HTTPS endpoint.
**How to avoid:** The WhatsApp webhook route (`/api/v1/webhooks/whatsapp`) must be exposed through nginx/caddy to public internet on port 443. Document this as a connection setup prerequisite. Show in UI: "WhatsApp requires a public HTTPS URL. Configure PORTER_PUBLIC_URL first."
**Warning signs:** Meta Webhook Configuration shows "Token verification failed"; inbound messages not received.

### Pitfall 4: IMAP IDLE Connection Dropping Silently
**What goes wrong:** imapflow IDLE connection drops after server-side timeout (typically 29 minutes for Gmail); new emails stop triggering agent jobs.
**Why it happens:** IMAP servers impose IDLE timeout. Client must re-issue IDLE periodically.
**How to avoid:** imapflow handles IDLE re-issues automatically when `.idle()` returns; wrap in a reconnect loop with exponential backoff. Mark connection 'degraded' via SSE if reconnect exceeds 3 attempts.
**Warning signs:** Email triggers stop firing; imapflow emits 'close' event; no new agent_jobs created.

### Pitfall 5: Google Calendar Webhook vs Polling
**What goes wrong:** Bidirectional sync implemented as push webhooks fails to keep Calendar updated because Porter isn't publicly registered as a notification receiver.
**Why it happens:** Google Calendar push notifications also require a public HTTPS endpoint registered with Google. Less obvious setup requirement.
**How to avoid:** For Phase 7, use polling-based sync (60-second interval, scheduler tick) rather than push webhooks. Push webhooks can be upgraded in a future phase once PORTER_PUBLIC_URL setup is established via WhatsApp.
**Warning signs:** Calendar sync only updates when manually triggered.

### Pitfall 6: Credentials Visible in Logs After Decrypt
**What goes wrong:** Access tokens appear in Fastify request/response logs or console.log output.
**Why it happens:** Developer adds logging inside service modules; Fastify body serialization; error messages include token values.
**How to avoid:** Never log the return value of `decryptCredential()`. Service modules must extract only the minimum needed fields. Redact tokens in error messages: `token.slice(0, 8) + '...'`.
**Warning signs:** Token strings visible in server logs; grep for 'access_token' in log files.

### Pitfall 7: Drizzle Schema vs Porter.py Schema Drift
**What goes wrong:** `workspace_connections` columns in `schema.ts` don't match what porter.py created in SQLite. Drizzle queries fail with "no such column".
**Why it happens:** porter.py's CREATE TABLE is the source of truth for existing tables. Drizzle schema must map to what actually exists.
**How to avoid:** Read porter.py lines 752-790 carefully. The existing `workspace_connections` columns are: id, provider, kind, status, display_name, scopes_json, tools_json, last_sync_at, last_error, installed_by, meta_json, created_at, updated_at. The migration (migrate-07.ts) must check existing columns before ALTER TABLE, as porter.py may have already created the table.
**Warning signs:** `SQLITE_ERROR: no such column` at startup; Drizzle type errors on query results.

---

## Code Examples

Verified patterns from official sources and existing codebase:

### Migration Pattern (from migrate-04.ts / migrate-06.ts)
```typescript
// backend/src/db/migrate-07.ts
import { sqlite } from './client.js';

export function migrate07ExternalConnections() {
  const applied = sqlite.prepare(
    `SELECT 1 FROM schema_migrations WHERE id = 'phase07_external_connections'`
  ).get();
  if (applied) return;

  // workspace_connections may already exist (created by porter.py)
  // Only ADD columns that don't exist yet
  const cols = sqlite.prepare(`PRAGMA table_info(workspace_connections)`).all() as { name: string }[];
  const colNames = cols.map(c => c.name);

  sqlite.exec(`
    -- Ensure tables exist (safe — porter.py may have already created them)
    CREATE TABLE IF NOT EXISTS workspace_connections (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'api_key',
      status TEXT NOT NULL DEFAULT 'disconnected',
      display_name TEXT DEFAULT '',
      scopes_json TEXT DEFAULT '[]',
      tools_json TEXT DEFAULT '[]',
      last_sync_at REAL DEFAULT 0,
      last_error TEXT DEFAULT '',
      installed_by TEXT DEFAULT '',
      meta_json TEXT DEFAULT '{}',
      created_at REAL NOT NULL DEFAULT (strftime('%s','now')),
      updated_at REAL NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS project_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      access_mode TEXT NOT NULL DEFAULT 'read',
      enabled_tools_json TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      attached_by TEXT DEFAULT '',
      attached_at REAL NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(project_id, connection_id)
    );

    -- Calendar sync table (new in Phase 7)
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      project_id TEXT,
      google_event_id TEXT NOT NULL,
      title TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT,
      all_day INTEGER DEFAULT 0,
      synced_at REAL DEFAULT (unixepoch('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_calendar_events_project ON calendar_events(project_id, start_at);
  `);

  // Add meta_encrypted column if not exists (marks that meta_json is AES-256-GCM encrypted)
  if (!colNames.includes('meta_encrypted')) {
    sqlite.exec(`ALTER TABLE workspace_connections ADD COLUMN meta_encrypted INTEGER DEFAULT 0`);
  }

  sqlite.prepare(`INSERT INTO schema_migrations (id) VALUES ('phase07_external_connections')`).run();
  console.log('[migrate-07] External connections tables ready');
}
```

### Connection Status SSE Pattern (extends emitSSE from scheduler.ts)
```typescript
// Reuse emitSSE from scheduler.ts — already exported
import { emitSSE } from '../services/scheduler.js';

// When OAuth completes successfully
await emitSSE('connection:status', {
  provider: 'github',
  status: 'connected',
  display_name: 'github-username',
});

// When token refresh fails
await emitSSE('connection:status', {
  provider: 'github',
  status: 'needs_reauth',
  message: 'GitHub token expired — reconnect required',
});
```

### External Call Queue Pattern
```typescript
// In any route handler that needs external work done:
// Source: established agent_jobs pattern from scheduler.ts
function queueExternalCall(
  agentId: string,
  projectId: string | null,
  service: 'github' | 'email' | 'calendar' | 'whatsapp',
  action: string,
  params: Record<string, unknown>,
): string {
  const jobId = crypto.randomUUID();
  sqlite.prepare(`
    INSERT INTO agent_jobs
      (id, agent_id, project_id, trigger_type, trigger_data, status, scheduled_for)
    VALUES (?, ?, ?, 'external_call', ?, 'pending', unixepoch('now'))
  `).run(jobId, agentId, projectId, JSON.stringify({ service, action, ...params }));
  return jobId;
}
```

### Feature Flag Pattern for Phase 7
```typescript
// config.ts — add to featureFlags object
externalConnections: process.env.FEATURE_EXTERNAL_CONNECTIONS === 'true',
```
All connections routes and webhook handlers check this flag on startup.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Store OAuth tokens in plaintext config files | AES-256-GCM encrypted in SQLite | Standard since GDPR/SOC2 became common | Required for PORTER_SECRET mandate |
| node-imap (unmaintained) | imapflow (from nodemailer ecosystem) | 2021 when node-imap stalled | OAuth2 support, Promise API, active maintenance |
| whatsapp-web.js (Puppeteer automation) | Meta Cloud API direct REST | 2022 when Meta formalized Cloud API | ToS compliant, no Puppeteer overhead, stable |
| Octokit split packages (@octokit/rest) | octokit (batteries-included v5) | 2023 when octokit v5 released | Single import, TypeScript-first, all GitHub APIs |
| googleapis monolith import | Tree-shaken @googleapis/* sub-packages | 2022 | Reduces bundle; use `googleapis` for now, optimize later |

**Deprecated/outdated:**
- `whatsapp` npm package (0.0.5-Alpha): incomplete, no production use — do not install
- `node-imap`: last commit 2019, no OAuth2 support — never use
- Raw password storage for IMAP: OAuth2 is the only acceptable path for Gmail/Outlook

---

## Open Questions

1. **PORTER_PUBLIC_URL setup for OAuth and WhatsApp**
   - What we know: WhatsApp webhook and OAuth callbacks require a publicly reachable HTTPS URL.
   - What's unclear: Whether nginx/caddy is already configured on this VPS, and what the public URL is for Porter.
   - Recommendation: The Connections UI should display a setup check — "Configure PORTER_PUBLIC_URL (currently: unset) to enable OAuth and WhatsApp." Plan 07-01 (connection settings UI) should surface this as a prerequisite status.

2. **porter.py workspace_connections CRUD deprecation timing**
   - What we know: porter.py has full CRUD at lines 53095-53198. Phase 7 builds Fastify v1 equivalents.
   - What's unclear: Whether porter.py CRUD should be marked deprecated in Phase 7 or kept until a dedicated strangler-fig pass.
   - Recommendation: Follow the established pattern — add `# DEPRECATED: use /api/v1/connections` comment to porter.py handlers in Plan 07-01; do not delete until Playwright tests pass for v1 equivalents.

3. **meta_json encryption migration for existing rows**
   - What we know: Any existing `workspace_connections` rows have plaintext `meta_json`.
   - What's unclear: Are there real connections in the DB right now, or is the table empty?
   - Recommendation: migrate-07.ts should check for rows with `meta_encrypted = 0` (or NULL) and encrypt them on startup if PORTER_SECRET is set. Safe to run idempotently.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Python stdlib unittest (test_p0_p1.py pattern) at /tmp/ only — not committed to git |
| Config file | none — stdlib http.cookiejar + urllib pattern |
| Quick run command | `python3 /tmp/test_conn07.py --quick` |
| Full suite command | `python3 /tmp/test_conn07.py && cd /home/lobster/documents/porter/tests && npx playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONN-01 | GET /api/v1/connections returns workspace_connections rows | integration | `python3 /tmp/test_conn07.py::test_connections_list` | Wave 0 |
| CONN-01 | GitHub connection stores encrypted token in DB | integration | `python3 /tmp/test_conn07.py::test_github_token_encrypted` | Wave 0 |
| CONN-02 | Email connection stored with correct provider type | integration | `python3 /tmp/test_conn07.py::test_email_connection` | Wave 0 |
| CONN-03 | Calendar sync inserts rows into calendar_events table | integration | `python3 /tmp/test_conn07.py::test_calendar_sync` | Wave 0 |
| CONN-04 | WhatsApp webhook GET returns hub.challenge | smoke | `python3 /tmp/test_conn07.py::test_whatsapp_webhook_verify` | Wave 0 |
| CONN-05 | No hardcoded paths/tokens — grep codebase | static analysis | `python3 /tmp/test_conn07.py::test_no_hardcoding` | Wave 0 |
| CONN-05 | PORTER_SECRET absent → startup logs clear error | unit | `python3 /tmp/test_conn07.py::test_missing_secret_error` | Wave 0 |
| CONN-01-05 | 35 Playwright regression tests still green | e2e | `cd /home/lobster/documents/porter/tests && npx playwright test` | Exists |

### Sampling Rate
- **Per task commit:** `python3 /tmp/test_conn07.py --quick` (individual feature slice)
- **Per wave merge:** `python3 /tmp/test_conn07.py` full suite
- **Phase gate:** Full Python suite + 35 Playwright tests green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `/tmp/test_conn07.py` — covers CONN-01 through CONN-05 (connection list, token encryption, webhook verify, hardcoding grep, missing-secret error)
- [ ] Framework install: already available (Python stdlib, no install needed)
- [ ] SSE event type `connection:status` must be added to `TYPED_EVENTS` in `SSEProvider.tsx`

---

## Sources

### Primary (HIGH confidence)
- npm registry (2026-03-21) — octokit@5.0.5, @fastify/oauth2@8.2.0, nodemailer@8.0.3, @types/nodemailer@7.0.11, imapflow@1.2.16, googleapis@171.4.0 — verified via `npm view [pkg] version`
- porter.py lines 752-790 — workspace_connections, project_connections, environment_tools table schemas — read directly
- porter.py lines 53095-53198 — existing CRUD handlers for workspace_connections — read directly
- backend/src/ — entire Fastify backend structure, patterns, db/schema.ts, services/, routes/v1/ — read directly
- backend/src/config.ts — featureFlags pattern, env var conventions — read directly
- Node.js built-in crypto — AES-256-GCM cipher confirmed available in this runtime via `crypto.getCiphers()`
- .planning/research/STACK.md — pre-researched library recommendations (lines 66-86) — read directly

### Secondary (MEDIUM confidence)
- .planning/phases/07-external-connections/07-CONTEXT.md — all locked decisions, WhatsApp interaction model, email architecture — read directly
- STACK.md alternatives table — confirmed: whatsapp-web.js ToS violation, node-imap unmaintained, official WhatsApp SDK Alpha status

### Tertiary (LOW confidence — warrants validation)
- IMAP IDLE 29-minute Gmail timeout: widely documented community knowledge; verify imapflow's auto-reconnect behavior against imapflow docs before implementing the reconnect loop
- Google Calendar polling vs push webhook recommendation: based on operational simplicity reasoning, not from Calendar API docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm registry; existing packages confirmed installed; AES-256-GCM confirmed available in Node.js runtime
- Architecture: HIGH — directly read all integration points in codebase; workspace_connections table confirmed in porter.py and schema; migration pattern confirmed from 4 prior phases
- Pitfalls: HIGH for items 1-4 (PORTER_SECRET, OAuth URL, webhook exposure, IMAP drop) — well-documented; MEDIUM for items 5-7 (Calendar, log leakage, Drizzle drift)

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable APIs; npm versions may update but won't break within 30 days)
