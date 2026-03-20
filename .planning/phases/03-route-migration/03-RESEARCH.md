# Phase 3: Route Migration - Research

**Researched:** 2026-03-20
**Domain:** Fastify route migration, strangler fig pattern, React Router SPA, system prompt design
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**System Prompt Revolution**
- Radical reduction — system prompts become razor-thin. Just agent identity + how to use Porter resources. Everything else (memory, project context, tools, constraints) fetched on-demand via DB queries
- No front-loading — memory injection is real-time DB queries, not cached blobs
- No caching — always query fresh from DB with proper indices
- Agent identity in prompt: name, role, direction, how to use Porter resources. ~200-300 tokens naturally
- Awareness toggle — per-agent setting: "aware" (knows about other agents) vs "sandboxed" (only knows Porter)
- Squad roster eliminated — Porter is the sole orchestrator. No squad concept in prompts
- Soul + rules merged — no separate soul/mission and rules blocks. One compact identity block
- Light guardrails in prompt — 2-3 non-negotiable anti-hallucination rules baked in. Tiny, always present
- 2K token circuit breaker — safety net, not a budget. If prompt exceeds 2K, respawn agent with lean prompt
- Respawn is a show — pixel character does transformation animation when agent respawns
- Identity rebuild → activity feed note: "Identity updated: learned 3 new preferences."

**API Overhaul**
- Full REST overhaul — professional quality, consistent naming across all endpoints
- API versioning: /api/v1/* — all Fastify routes under /api/v1/. Future-proof for breaking changes
- Clean break: /api/personas/* → /api/v1/agents/* — no backward compat aliases. Frontend updated in same migration
- Full path restructure: /api/v1/auth/*, /api/v1/agents/*, /api/v1/projects/*, /api/v1/memory/*, etc.
- Public-ready from day one — consistent error codes, proper HTTP status codes, structured responses
- Auth: session cookies + API keys — web app uses session cookies, external consumers use Bearer token API keys
- No rate limiting yet — deferred until API monetization strategy exists
- No OpenAPI spec yet — build routes first, add spec generation later

**Embedded Pages → React**
- Login page: alive like Polsia — motion, energy, dynamic. Live agent activity and system metrics visible
- Chat with Porter on login — visible but requires registration
- Registration: email + password only for now — no social OAuth buttons yet
- LOGIN_PAGE, REGISTER_PAGE, PAGE → React routes — embedded HTML in porter.py deleted. Fastify serves React SPA

**Response Standardization**
- Robust logging on every response — errors include trace IDs
- Every bug discoverable — structured error data for Porter's diagnostic system

### Claude's Discretion
- Response envelope format (recommend: {data, error, meta} wrapper)
- Error contract design (recommend: machine code + human message on every error)
- Request tracing approach (recommend: X-Request-Id on every response, logged server-side)
- Session + API key implementation details
- Exact system prompt guardrail wording (2-3 anti-hallucination rules)
- React Router structure for login/register/main pages
- Login page animation and live activity display implementation
- DB index strategy for real-time agent context queries

### Deferred Ideas (OUT OF SCOPE)
- Social OAuth login (Apple, Google, Microsoft, X) — Phase 7
- API rate limiting + monetization — future phase
- OpenAPI spec generation — add @fastify/swagger after routes are stable
- Agent-to-agent communication — Phase 4 autonomy
- Agent spawning/ephemeral instances — Phase 4 scope
- "Always active" background learning — Phase 4 event-driven autonomy
- Porter self-healing from error logs — auto-diagnosis pipeline is Phase 6 transparency
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PERF-01 | System prompt audit — cap interactive prompts at 2K tokens, eliminate bloat causing slowness | Current `_build_context_suffix` assembles SOUL.md + RULES.md + memory injection up to ~2500 tokens. Must be replaced with identity-only inline prompt + on-demand DB fetch pattern |
| PERF-02 | Core route migration to Fastify (auth, projects, agents) via strangler fig proxy | Existing strangler fig proxy in `backend/src/plugins/proxy.ts` is operational. Routes registered before proxy in Fastify automatically shadow porter.py. Auth routes already drafted at `/login` and `/logout`; need upgrade to `/api/v1/auth/*` |
</phase_requirements>

---

## Summary

Phase 3 migrates three route groups — auth, projects, and agents — from porter.py to Fastify, simultaneously restructuring the entire API surface to `/api/v1/*` and moving all embedded HTML pages (LOGIN_PAGE, REGISTER_PAGE, PAGE) to React Router routes. The strangler fig proxy from Phase 1 is already operational: any route registered in Fastify before the proxy plugin automatically shadows porter.py with no coordination needed.

The biggest implementation complexity is not the route ports themselves, but the dual concerns that run across all of them: (1) the `/api/personas/*` → `/api/v1/agents/*` rename touches every frontend call site simultaneously, requiring an atomic frontend + backend swap; and (2) the system prompt overhaul replaces a 2,500-token file-reading function (`_build_context_suffix`) with a 200-300 token identity-only inline block. Both changes must keep all 35 Playwright tests passing at each vertical slice.

The personas table already exists in porter.db with full CRUD capabilities. The projects table is also in porter.db with the Drizzle schema in `backend/src/db/schema.ts`. The shared `db/client.ts` with WAL + busy_timeout=30000 is ready; the two existing route files (auth.ts, tasks.ts) incorrectly instantiate their own DB connections — all new routes must use the shared `db/client.ts` instead.

**Primary recommendation:** Migrate routes as vertical slices (auth first, projects second, agents third), update frontend API paths atomically with each slice, run all 35 Playwright tests after each slice, and delete porter.py handlers only after tests pass. System prompt overhaul runs as Plan 03-01 before any route work begins.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fastify | 5.7.4 | HTTP server framework | Already installed, Phase 1 decision |
| Drizzle ORM | 0.45.1 | Type-safe SQLite queries | Already installed, used in auth/tasks routes |
| better-sqlite3 | 12.6.2 | SQLite driver | Already installed, WAL+busy_timeout configured |
| Zod | 4.3.6 | Runtime request validation | Already installed, use for all route body schemas |
| @fastify/cookie | 11.0.2 | Session cookie handling | Already installed |
| react-router-dom | 7.13.1 | Client-side routing for SPA pages | Not yet installed — needed for login/register/main routes |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @fastify/jwt | 10.0.0 | JWT signing for API keys | API key Bearer token auth |
| framer-motion | latest | Login page animation | Polsia-style animated login |
| uuid | 13.0.0 | Session/API key token generation | Already installed in backend |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @fastify/jwt | crypto.randomBytes() for API keys | JWT is standard for external consumers; random tokens are simpler but less structured |
| framer-motion | CSS transitions | framer-motion gives imperative control needed for "alive" login experience |
| react-router-dom | hash routing | React Router BrowserRouter is standard for SPAs; hash routing is legacy |

**Installation (new deps only):**
```bash
cd /home/lobster/documents/porter/frontend && npm install react-router-dom framer-motion
cd /home/lobster/documents/porter/backend && npm install @fastify/jwt
```

---

## Architecture Patterns

### Recommended Project Structure

```
backend/src/
├── db/
│   ├── client.ts         # Shared DB instance (WAL, busy_timeout) — EXISTING, use this
│   └── schema.ts         # Drizzle schema: users, sessions, projects, etc.
├── plugins/
│   ├── proxy.ts          # Strangler fig fallback — registered LAST
│   └── auth.ts           # Session + API key auth decorator (new)
├── routes/
│   ├── v1/               # All new routes under /api/v1/
│   │   ├── auth.ts       # /api/v1/auth/login, /logout, /me
│   │   ├── agents.ts     # /api/v1/agents/* (renamed from personas)
│   │   ├── projects.ts   # /api/v1/projects/*
│   │   └── index.ts      # Register all v1 routes with prefix
│   ├── auth.ts           # EXISTING — legacy /login, /logout (keep until tests pass, then delete)
│   └── tasks.ts          # EXISTING
└── index.ts              # Register v1 routes + proxy
```

```
frontend/src/
├── pages/                # New directory for full-page React Router views
│   ├── LoginPage.tsx     # /login route — alive like Polsia
│   ├── RegisterPage.tsx  # /register route
│   └── AppPage.tsx       # / route — main app (current Layout.tsx wrapped)
├── components/           # Existing reusable components
├── lib/
│   └── api.ts            # Update: /api/v1/* paths, no more /login form fetch
└── main.tsx              # Add BrowserRouter + routes
```

### Pattern 1: Fastify Route Prefix for v1

Fastify's `register` with `prefix` option namespaces all routes under a path. This is the standard approach for API versioning.

```typescript
// backend/src/routes/v1/index.ts
import { FastifyInstance } from 'fastify';
import authRoutes from './auth.js';
import agentRoutes from './agents.js';
import projectRoutes from './projects.js';

export default async function v1Routes(fastify: FastifyInstance) {
  fastify.register(authRoutes, { prefix: '/api/v1/auth' });
  fastify.register(agentRoutes, { prefix: '/api/v1/agents' });
  fastify.register(projectRoutes, { prefix: '/api/v1/projects' });
}

// backend/src/index.ts — register before proxy
fastify.register(v1Routes);
// ...
fastify.register(proxyPlugin); // LAST
```

**Confidence: HIGH** — Fastify prefix docs confirm this is the canonical pattern (Fastify 5 docs).

### Pattern 2: Shared DB Client (Not Per-Route Instantiation)

The existing `auth.ts` and `tasks.ts` incorrectly create a new `Database('../porter.db')` per route plugin. The shared `db/client.ts` already has WAL + busy_timeout configured. All new routes must import from it.

```typescript
// backend/src/db/client.ts — EXISTING, correct
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { config } from '../config.js';

const sqlite = new Database(config.dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 30000');

export const db = drizzle(sqlite, { schema });
export { sqlite };

// Use in routes:
import { db } from '../db/client.js';
// NOT: const sqlite = new Database('../porter.db')
```

**Confidence: HIGH** — verified from codebase analysis. The path `'../porter.db'` in existing routes is also wrong (it's relative to the binary, not the source); `config.dbPath` resolves correctly.

### Pattern 3: Auth Decorator for Protected Routes

Fastify decorators enable reusable auth checking across all protected routes without repeating the session lookup.

```typescript
// backend/src/plugins/auth.ts
import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';

declare module 'fastify' {
  interface FastifyRequest {
    sessionUser: { username: string; role: string; displayName: string | null } | null;
  }
}

export default fp(async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('sessionUser', null);

  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies.porter_session;
    if (!token) return;

    const session = db.select().from(schema.sessions)
      .where(eq(schema.sessions.token, token)).get();
    if (!session || session.expires < Date.now() / 1000) return;

    const user = db.select().from(schema.users)
      .where(eq(schema.users.username, session.username)).get();
    if (user) {
      request.sessionUser = {
        username: user.username,
        role: user.role ?? 'operator',
        displayName: user.displayName,
      };
    }
  });

  // Convenience method for route handlers
  fastify.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.sessionUser) {
      reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
  });
});
```

**Confidence: HIGH** — Fastify plugin + decorator pattern is the canonical approach.

### Pattern 4: Response Envelope Standard

All /api/v1/* responses use a consistent envelope. This is Claude's discretion; this is the recommended approach.

```typescript
// Success
{ "data": { ... }, "meta": { "request_id": "uuid", "timestamp": 1234567890 } }

// Error
{ "error": { "code": "AGENT_NOT_FOUND", "message": "Agent with ID x does not exist" }, "meta": { ... } }
```

Machine-readable `code` field enables frontend and Porter to act on error types programmatically. `request_id` is included in every response for log correlation. The meta object also carries `timestamp` for cache-busting awareness.

**Confidence: HIGH** — this is a standard SaaS API pattern.

### Pattern 5: Strangler Fig Route Claim

When Fastify registers a route (e.g. `POST /api/v1/auth/login`), the proxy plugin falls through to porter.py only for paths that have no matching Fastify route. This means:

1. Register Fastify route under `/api/v1/`
2. Frontend updates calls to use `/api/v1/` paths
3. Old porter.py handler for the legacy path remains — it only fires if the old path is still called
4. After Playwright tests pass, delete porter.py legacy handler

The proxy plugin does NOT claim `POST /login` — that path is registered by the existing `auth.ts`. Do not delete the old auth.ts until after the `/api/v1/auth/login` migration is complete and tested.

### Pattern 6: React Router SPA with Login/Register/App Routes

React Router 7 uses `createBrowserRouter` (the recommended API since v6.4). The Fastify static plugin serves the React SPA for all non-API paths; React Router handles client-side routing.

```typescript
// frontend/src/main.tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AppPage } from './pages/AppPage'; // wraps existing Layout.tsx

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/', element: <AppPage /> },
  { path: '*', element: <AppPage /> }, // catch-all
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
```

Fastify must serve the React SPA for all non-API GET requests (catch-all to `frontend/dist/index.html`). This replaces porter.py's `LANDING_PAGE`, `LOGIN_PAGE`, and `PAGE` handlers.

```typescript
// backend/src/index.ts — add before proxy
import staticFiles from '@fastify/static';
import path from 'path';

fastify.register(staticFiles, {
  root: path.join(process.cwd(), '../frontend/dist'),
  prefix: '/v2/', // matches Vite's base path
});

// Catch-all: serve index.html for all non-API GET routes
fastify.get('/*', async (request, reply) => {
  return reply.sendFile('index.html', path.join(process.cwd(), '../frontend/dist'));
});
```

**Confidence: HIGH** — verified react-router-dom v7.13.1 available; createBrowserRouter is the v6.4+ recommended API.

### Pattern 7: System Prompt Overhaul — Identity-Only Block

The current `_build_context_suffix()` reads SOUL.md (file I/O), RULES.md (file I/O), memory injection (DB query), prior work recall (DB FTS5 query), squad roster (DB query). This is replaced with an inline identity block assembled from DB-only fields, with no file I/O.

```python
def _build_lean_identity(persona_id: str) -> str:
    """Phase 3: Razor-thin identity block. 200-300 tokens max.

    Replaces _build_context_suffix(). No file I/O. DB-only.
    Squad roster eliminated. Rules merged into identity.
    """
    conn = _db_conn()
    row = conn.execute(
        "SELECT name, role, config FROM personas WHERE id=?", (persona_id,)
    ).fetchone()
    conn.close()
    if not row:
        return ""

    config = json.loads(row["config"] or "{}")
    name = row["name"]
    role = config.get("description") or row["role"] or "assistant"

    # Awareness: check per-agent setting
    aware_flag = config.get("awareness_mode", "aware")
    porter_hint = (
        "You work within Porter. Use Porter resources for tasks outside your scope."
        if aware_flag == "aware"
        else "You are a focused assistant. Direct all questions to your assigned domain."
    )

    # Fixed guardrails — always present, never omitted
    GUARDRAILS = (
        "Rules: Never fabricate data. Never claim tasks are done without verification. "
        "Always say when you don't know."
    )

    prompt = f"You are {name}, {role}. {porter_hint} {GUARDRAILS}"

    # Circuit breaker: if somehow over 2K tokens, log and return minimal
    if _estimate_tokens(prompt) > 2000:
        mlog.emit("warn", "system", "prompt.circuit_breaker",
                  f"Prompt exceeded 2K for {persona_id}, using minimal fallback",
                  extra={"persona_id": persona_id})
        return f"You are {name}. {GUARDRAILS}"

    return prompt
```

**Confidence: HIGH** — this pattern eliminates all file I/O and replaces the 2,500-token budget system with a flat 200-300 token identity block as per locked decisions.

### Anti-Patterns to Avoid

- **Per-route DB instantiation:** Each of the existing route files creates `new Database('../porter.db')`. This bypasses the shared WAL/busy_timeout config and creates connection leaks. All new v1 routes must import from `db/client.ts`.
- **Legacy path aliases for renamed routes:** The decision is a clean break — `/api/personas/*` → `/api/v1/agents/*` with no aliases. Do not add redirect handlers or compatibility shims.
- **Modifying Playwright tests:** Tests exercise UI behavior, not API paths directly. The login flow in tests uses the HTML form (`#uname`, `#pw`, `.login-btn`) — as long as the React login page renders the same selectors, tests pass without modification.
- **Deleting porter.py handlers before tests pass:** Always verify 35 green tests before removing porter.py code.
- **Registering proxy before v1 routes:** Proxy must remain LAST in Fastify registration order.
- **Blocking system prompt reads on file I/O:** The new identity block must not read SOUL.md or RULES.md files.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Route prefixing | Manual path concatenation | Fastify `register` with `prefix` option | Fastify's prefix handles all edge cases including `/` normalization |
| Session validation | Custom middleware per-route | Fastify `preHandler` hook + `decorateRequest` | Fastify hooks compose cleanly across plugin scopes |
| API key signing | Raw token strings only | @fastify/jwt | JWT is standard for external consumers; self-contained verification |
| Client-side routing | Manual URL history manipulation | react-router-dom v7 | Hash routing, state restoration, and back/forward are tricky to hand-roll |
| Login animation | CSS keyframes only | framer-motion | Complex entrance/exit sequences need orchestration that CSS alone can't express cleanly |
| Token estimation | External tokenizer library | `_estimate_tokens()` already in porter.py | The existing 4-chars-per-token heuristic is good enough for a circuit breaker |

**Key insight:** The strangler fig proxy is already handling the hard part. Route migration is mostly additive — register Fastify routes, update frontend paths, confirm tests pass, then delete porter.py handlers.

---

## Common Pitfalls

### Pitfall 1: Playwright Login Tests Break on React Router Transition

**What goes wrong:** The Playwright tests do `page.goto('/login')` and look for `#uname`, `#pw`, `.login-btn`. If the React login page uses different element IDs or class names, all 35 tests fail immediately.

**Why it happens:** The embedded `LOGIN_PAGE` HTML has hardcoded element IDs that the tests target. When React replaces the embedded page, developers use different component structure.

**How to avoid:** React login page MUST render `id="uname"` for the username field, `id="pw"` for the password field, and `.login-btn` class on the submit button. These are test contract selectors — treat them as a fixed interface.

**Warning signs:** Any test failure in the "Auth" describe block or "can log in and reach main app" test.

### Pitfall 2: Version Badge Test Breaks After PAGE Deletion

**What goes wrong:** The "version badge shows in sidebar" test looks for `PORTER v\d+\.\d+\.\d+` text in the sidebar. This text is currently rendered inside the embedded `PAGE` HTML. When PAGE is replaced by React, the version badge must be explicitly included in the React sidebar component.

**Why it happens:** The React `Sidebar.tsx` component likely doesn't include the version badge yet — it's in the porter.py embedded HTML.

**How to avoid:** Check `frontend/src/components/Sidebar.tsx` — ensure it has a version badge element that reads the version from `/api/version` or a build-time constant.

### Pitfall 3: DB Path Mismatch in Existing Routes

**What goes wrong:** `auth.ts` and `tasks.ts` use `new Database('../porter.db')`. The actual DB is at `config.dbPath` (resolved from `PORTER_DATA_DIR` env var). On a dev machine these may coincide, but in production they will not.

**Why it happens:** The routes were written before `db/client.ts` existed.

**How to avoid:** All new v1 routes import `{ db }` from `'../db/client.js'`. Also fix the existing `auth.ts` and `tasks.ts` as part of this phase.

### Pitfall 4: Personas Table Schema vs Frontend Expectations

**What goes wrong:** The `personas` table has 30+ columns including `config` (JSON blob), `soul_hash`, `appearance_spec`, etc. The frontend currently reads data from porter.py's `/api/personas` handler, which assembles a different shape than a raw Drizzle query would return.

**Why it happens:** porter.py shapes the persona response with computed fields (e.g., soul content, skill list, memory summaries). A raw DB select returns raw schema columns.

**How to avoid:** The Fastify agents routes must construct the same response shape that the frontend currently expects. Read the porter.py `/api/personas` GET handler (line 46670) to understand the current response schema before writing the Fastify equivalent. Map columns explicitly — don't return raw Drizzle rows.

### Pitfall 5: /api/v1/* Paths Not Caught by Proxy for Porter.py Legacy Calls

**What goes wrong:** After migrating `/api/personas` to `/api/v1/agents`, any call from porter.py internals (e.g., background workflows that query `/api/personas`) will 404 since that path is now owned by Fastify.

**Why it happens:** porter.py has internal HTTP calls to its own API routes.

**How to avoid:** Grep porter.py for any `urllib.request` calls to `/api/personas` or other routes being migrated. Either keep the old paths active in Fastify (aliased to v1) until internal calls are updated, or fix internal calls to use direct DB queries instead.

### Pitfall 6: Session Cookie SameSite / Domain Mismatch

**What goes wrong:** Fastify sets `porter_session` cookie with `sameSite: 'strict'` and porter.py expects the same cookie name. During migration, both systems read the same cookie. If Fastify sets a cookie with different options than porter.py expects (e.g., different `path`, `domain`), sessions break.

**Why it happens:** Two systems writing/reading the same cookie during transition period.

**How to avoid:** Match cookie options exactly: `httpOnly: true`, `sameSite: 'strict'`, `path: '/'`, `maxAge: SESSION_TTL`. Use `SESSION_TTL = 30 * 24 * 60 * 60` (30 days, matching porter.py line 304).

### Pitfall 7: React SPA Catch-All Conflicts with API Routes

**What goes wrong:** Fastify serves `index.html` for `/*` catch-all. If this is registered before API routes, all API calls return the SPA HTML instead of JSON.

**Why it happens:** Route registration order in Fastify. More specific routes take priority over catch-all only if registered first.

**How to avoid:** Register all `/api/v1/*` routes first. Register static file serving and SPA catch-all last (but before proxy). The correct order is: v1 routes → static files → SPA catch-all → proxy.

---

## Code Examples

### Auth Route — /api/v1/auth/login

```typescript
// Source: derived from existing auth.ts + porter.py POST /login handler
import { FastifyInstance } from 'fastify';
import { db } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);

export default async function authV1Routes(fastify: FastifyInstance) {
  fastify.post('/login', async (request, reply) => {
    const { username, password } = request.body as { username: string; password: string };
    const requestId = crypto.randomUUID();

    const user = db.select().from(schema.users)
      .where(eq(schema.users.username, username)).get();
    if (!user) {
      return reply.code(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
        meta: { request_id: requestId }
      });
    }

    const hash = (await scrypt(password, user.salt, 32)) as Buffer;
    if (hash.toString('hex') !== user.passwordHash) {
      return reply.code(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
        meta: { request_id: requestId }
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = (Date.now() / 1000) + (30 * 24 * 60 * 60);

    db.insert(schema.sessions).values({
      token,
      username,
      expires,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    }).run();

    reply.setCookie('porter_session', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60,
    });

    return reply.send({
      data: { ok: true, username },
      meta: { request_id: requestId }
    });
  });

  fastify.post('/logout', async (request, reply) => {
    const token = request.cookies.porter_session;
    if (token) {
      db.delete(schema.sessions).where(eq(schema.sessions.token, token)).run();
    }
    reply.clearCookie('porter_session', { path: '/' });
    return { data: { ok: true }, meta: { request_id: crypto.randomUUID() } };
  });

  fastify.get('/me', async (request, reply) => {
    const token = request.cookies.porter_session;
    if (!token) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });

    const session = db.select().from(schema.sessions)
      .where(eq(schema.sessions.token, token)).get();
    if (!session || session.expires < Date.now() / 1000) {
      return reply.code(401).send({ error: { code: 'SESSION_EXPIRED', message: 'Session expired' } });
    }

    const user = db.select().from(schema.users)
      .where(eq(schema.users.username, session.username)).get();
    if (!user) return reply.code(404).send({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });

    return {
      data: {
        username: user.username,
        displayName: user.displayName ?? user.username,
        role: user.role ?? 'operator',
        email: user.email,
      },
      meta: { request_id: crypto.randomUUID() }
    };
  });
}
```

### Agents Route — /api/v1/agents (list)

```typescript
// Note: personas table has a 'config' JSON blob with extended fields.
// The response must match the shape porter.py's /api/personas returns.
fastify.get('/', async (request, reply) => {
  if (!request.sessionUser) return reply.code(401).send({ error: { code: 'UNAUTHORIZED' } });

  const rows = db.select().from(schema.personas)
    .where(eq(schema.personas.status, 'active'))
    .orderBy(schema.personas.sortOrder)
    .all();

  const agents = rows.map(row => {
    const config = JSON.parse(row.config ?? '{}');
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      status: row.status,
      agent_group: row.agentGroup,
      appearance_spec: row.appearanceSpec ? JSON.parse(row.appearanceSpec) : {},
      appearance_style: row.appearanceStyle,
      description: config.description ?? '',
      // ... other fields from config blob
    };
  });

  return { data: { agents, count: agents.length }, meta: { request_id: crypto.randomUUID() } };
});
```

### React Router Setup

```typescript
// frontend/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import App from './App';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/', element: <App /> },
  { path: '*', element: <App /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
```

### System Prompt Token Measurement

```python
# Measure current _build_context_suffix() output before deleting it
def _measure_prompt_tokens(persona_id: str) -> int:
    """Audit tool: measure current prompt size before migration."""
    suffix = _build_context_suffix(persona_id, message="test")
    tokens = _estimate_tokens(suffix)
    mlog.emit("info", "system", "prompt.audit",
              f"Persona {persona_id}: {tokens} estimated tokens",
              extra={"persona_id": persona_id, "tokens": tokens})
    return tokens
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| porter.py handles all routes | Fastify proxy with route claiming | Phase 1 | New routes can be Fastify-native without touching porter.py |
| All API at /api/* | /api/v1/* namespace | Phase 3 | Clean versioning for future breaking changes |
| /api/personas/* | /api/v1/agents/* | Phase 3 | Consistent product language (personas→agents) |
| Embedded HTML pages (LOGIN_PAGE, etc.) | React Router SPA pages | Phase 3 | Single SPA instead of hybrid server-rendered HTML |
| _build_context_suffix: 2,500-token file-reading | _build_lean_identity: 200-300 token DB-only | Phase 3 | Eliminates file I/O from every dispatch path |
| Per-route Database() instantiation | Shared db/client.ts | Phase 3 | Single WAL connection with proper busy_timeout |

**Deprecated/outdated after this phase:**
- `LOGIN_PAGE`, `REGISTER_PAGE`, `PAGE`, `LANDING_PAGE` — embedded HTML blobs in porter.py. Deleted after React SPA claims these routes.
- porter.py `do_GET /login`, `do_GET /register`, `do_GET /`, `do_POST /login`, `do_POST /logout` handlers — deleted after Fastify routes claim them and tests pass.
- `_build_context_suffix()` and SOUL.md/RULES.md file reading in porter.py — replaced by `_build_lean_identity()`.
- `_mem_inject_for_dispatch()` — no longer called at dispatch time; memory is on-demand.
- Squad roster assembly block in `_build_context_suffix` — squad concept eliminated from prompts.
- `/api/personas/*` handlers in porter.py — deleted after `/api/v1/agents/*` migration is complete and frontend updated.

---

## Open Questions

1. **Does porter.py call its own /api/personas/ internally?**
   - What we know: porter.py has ~12 persona endpoints and uses the personas table directly via `_db_conn()`. It likely does NOT call itself via HTTP for persona lookups.
   - What's unclear: Whether any background workflow or chat action does an HTTP request to `/api/personas/`.
   - Recommendation: Run `grep -n 'urllib.*personas\|requests.*personas' porter.py` before migration. If any self-calls exist, fix them to use direct DB queries before claiming the route.

2. **Does the React frontend already call /api/personas/ or does it call porter.py's embedded UI directly?**
   - What we know: The React frontend in `frontend/src/` is served at `/v2/` (Vite base path). The main porter.py `PAGE` HTML serves a different frontend (the main embedded app at `/`). The React SPA is currently a secondary interface.
   - What's unclear: Whether the Playwright tests exercise the React SPA at `/v2/` or the embedded porter.py HTML at `/`.
   - Recommendation: Check `playwright.config.js` — base URL is `http://127.0.0.1:8877` (root), which hits the embedded porter.py HTML. The React SPA migration moves `/` from embedded HTML to React Router.

3. **What is the exact response shape of /api/personas/:id that the embedded frontend relies on?**
   - What we know: The `config` column is a JSON blob containing extended fields. The response shape may vary significantly from the raw Drizzle schema.
   - What's unclear: Exact fields consumed by the embedded JS frontend.
   - Recommendation: Read the porter.py handler at line 46788 (GET /api/personas/:id) to get the exact response mapping before writing the Fastify equivalent.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Playwright 1.58.2 |
| Config file | `tests/playwright.config.js` |
| Quick run command | `cd /home/lobster/documents/porter/tests && npx playwright test --grep "Auth"` |
| Full suite command | `cd /home/lobster/documents/porter/tests && npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERF-01 | System prompt audit — no prompt exceeds 2K tokens | unit (Python script) | `python3 /tmp/test_prompt_audit.py` | Wave 0 |
| PERF-01 | _build_lean_identity returns < 300 tokens for any agent | unit (Python script) | `python3 /tmp/test_lean_identity.py` | Wave 0 |
| PERF-02 | Login flow works end-to-end through Fastify | e2e (Playwright) | `npx playwright test --grep "Auth"` | ✅ existing |
| PERF-02 | All 35 Playwright tests pass after each route migration | e2e (Playwright) | `npx playwright test` | ✅ existing |
| PERF-02 | /api/v1/auth/login returns 200 with session cookie | smoke | `curl -X POST http://127.0.0.1:8877/api/v1/auth/login -d '{"username":"moe","password":"porter"}'` | manual |
| PERF-02 | /api/v1/agents returns agent list | smoke | `curl -b porter_session=TOKEN http://127.0.0.1:8877/api/v1/agents` | manual |
| PERF-02 | /api/v1/projects returns project list | smoke | `curl -b porter_session=TOKEN http://127.0.0.1:8877/api/v1/projects` | manual |

### Sampling Rate
- **Per task commit:** `cd /home/lobster/documents/porter/tests && npx playwright test` (full suite — 35 tests, ~90s)
- **Per wave merge:** Full suite green
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `/tmp/test_prompt_audit.py` — measures current `_build_context_suffix()` output for all personas, records baseline token counts. Covers PERF-01 measurement requirement.
- [ ] `/tmp/test_lean_identity.py` — calls `_build_lean_identity()` after implementation, asserts all agents produce < 300 tokens. Covers PERF-01 cap requirement.

*(All other testing is covered by the existing 35-test Playwright suite.)*

---

## Sources

### Primary (HIGH confidence)

- `backend/src/routes/auth.ts` — existing auth route with session/cookie pattern
- `backend/src/db/client.ts` — shared DB instance with WAL + busy_timeout=30000
- `backend/src/db/schema.ts` — Drizzle schema: users, sessions, projects tables
- `backend/src/plugins/proxy.ts` — strangler fig proxy (registered last)
- `tests/ui-regression.spec.js` — 35 Playwright tests with exact selector expectations
- `porter.py line 50136-50260` — POST /login handler with full auth logic
- `porter.py line 2561-2620` — `_build_context_suffix()` current implementation
- `porter.py line 46670+` and `52162+` — GET/POST persona route handlers
- `porter.py line 48779+` and `52830+` — GET/POST project route handlers
- `porter.db` schema — personas (30 cols), projects (13 cols), users (13 cols)
- `frontend/package.json` — no react-router-dom currently installed
- `tests/playwright.config.js` — base URL `http://127.0.0.1:8877`, headless Chromium

### Secondary (MEDIUM confidence)

- react-router-dom v7.13.1 available on npm (verified via `npm view`)
- framer-motion available on npm (verified via `npm view`)
- @fastify/jwt v10.0.0 available on npm (verified via `npm view`)
- Fastify 5 prefix-based route registration — standard pattern in Fastify docs

### Tertiary (LOW confidence)

- polsia.com animation style — not directly researched; design implementation is Claude's discretion

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified via npm registry and codebase inspection
- Architecture: HIGH — patterns derived from existing codebase conventions and Fastify 5 standard usage
- Pitfalls: HIGH — derived from direct reading of test selectors, porter.py code, and existing route structure

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable stack; 30-day validity)
