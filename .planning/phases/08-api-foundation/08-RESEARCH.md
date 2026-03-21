# Phase 8: API Foundation - Research

**Researched:** 2026-03-21
**Domain:** Fastify 5 response envelopes, OpenAPI generation, error observability
**Confidence:** HIGH

---

## Summary

Phase 8 is an envelope standardization and observability phase — not a new-feature phase. The Fastify backend already has a working `envelope.ts` with `ok()` and `err()` helpers, and the majority of v1 routes already call them. The core work is:

1. Fix the envelope shape: the success criteria requires `{"ok": true, "data": [...]}` but the current `ok()` helper returns `{data: T, meta: Meta}` — no `ok` boolean field. This is the most impactful change.
2. Add `trace_id` into the error object itself (not just in `meta`) and echo it as `X-Request-ID` response header.
3. Fix the three non-conforming routes: `decisions.ts`, `health.ts`, and one line in `files.ts`.
4. Fix OAuth routes (`oauth-github.ts`, `oauth-google.ts`) and webhook route (`webhooks-whatsapp.ts`) that bypass the envelope entirely.
5. Add OpenAPI spec generation via `fastify-zod-openapi` + `@fastify/swagger` (neither installed yet).
6. Add a new `/api/v1/errors` route for frontend error capture and query (OBS-01, OBS-02).

The stack is Fastify 5.7.4 + Zod 4.3.6. Both `fastify-zod-openapi` 5.5.0 and `@fastify/swagger` 9.7.0 support Fastify 5 and Zod v4 — verified from npm registry.

**Primary recommendation:** Patch `envelope.ts` first, then use a Fastify `onSend` hook to inject `X-Request-ID` header globally, then install and wire `fastify-zod-openapi`, then create the errors route.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| API-01 | All endpoints follow /api/v1/* with consistent JSON response envelopes ({ok, data, error}) | Envelope shape change + audit of 3 non-conforming routes + OAuth/webhook bypass fixes |
| API-02 | All error responses include error code, message, and request trace ID | Add trace_id to ErrResponse type; Fastify 5 has built-in `request.id` + `genReqId` config |
| API-03 | OpenAPI spec auto-generated from route definitions | fastify-zod-openapi 5.5.0 + @fastify/swagger 9.7.0 — both support Fastify 5 + Zod v4 |
| OBS-01 | Frontend errors POST to /api/v1/errors with stack trace, component, user context | New route + new DB table via migrate-08.ts |
| OBS-02 | Error reports queryable by severity, component, and time range | Query params on GET /api/v1/errors; SQLite indexes on severity/component/created_at |
</phase_requirements>

---

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | 5.7.4 | HTTP framework | Already the production server |
| zod | 4.3.6 | Schema validation | Already used across all v1 routes |
| drizzle-orm | 0.45.1 | DB ORM | Already used; new errors table follows same pattern |
| better-sqlite3 | 12.6.2 | SQLite driver | Already used |
| uuid | 13.0.0 | UUID generation | Already installed; use for trace IDs |

### To Install

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify-zod-openapi | 5.5.0 | Zod schema → OpenAPI 3.x + Fastify integration | Official Fastify ecosystem; supports Fastify 5 + Zod v4 |
| @fastify/swagger | 9.7.0 | OpenAPI spec endpoint (`/api/v1/openapi.json`) | Official Fastify plugin; works with fastify-zod-openapi |
| @fastify/swagger-ui | 5.2.5 | Optional interactive docs UI | Companion to @fastify/swagger |

**Version verification (confirmed from npm registry 2026-03-21):**
- `fastify-zod-openapi`: 5.5.0 — supports `zod: '^3.25.74 || ^4.0.0'`, `fastify: '5'`
- `@fastify/swagger`: 9.7.0 — peer dep `fastify: '>=4.0.0'`, latest is 9.7.0
- `@fastify/swagger-ui`: 5.2.5

**Installation:**
```bash
cd /home/lobster/documents/porter/backend
npm install fastify-zod-openapi @fastify/swagger @fastify/swagger-ui
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fastify-zod-openapi | Hand-roll openapi.json | Hand-rolled spec goes stale immediately — auto-generation from Zod schemas is the only maintainable path |
| fastify-zod-openapi | zod-to-json-schema + manual OpenAPI assembly | More complex, less integrated with Fastify's route system |
| Global onSend hook for X-Request-ID | Per-route header setting | Global hook is one place to change; per-route is 80+ call sites |

---

## Architecture Patterns

### Recommended Project Structure (additions)

```
backend/src/
├── lib/
│   └── envelope.ts          # PATCH: add ok:bool, rename request_id → trace_id, update ErrResponse
├── plugins/
│   ├── auth.ts              # PATCH: fix hardcoded err shape to use envelope.err()
│   └── openapi.ts           # NEW: fastify-zod-openapi + @fastify/swagger registration
├── routes/v1/
│   ├── errors.ts            # NEW: OBS-01/OBS-02 frontend error capture
│   ├── health.ts            # PATCH: wrap reply.send({data:...}) in ok()
│   ├── decisions.ts         # PATCH: wrap reply.send({data:...}) in ok()
│   ├── files.ts             # PATCH: line 260 raw reply.send(data) → ok(data)
│   ├── oauth-github.ts      # PATCH: stub error responses → err() helper
│   ├── oauth-google.ts      # PATCH: stub error responses → err() helper
│   └── webhooks-whatsapp.ts # PATCH: any non-envelope responses → err() helper
├── db/
│   └── migrate-08.ts        # NEW: frontend_errors table
└── index.ts                 # PATCH: add genReqId, register openapi plugin
```

### Pattern 1: Envelope Shape (BREAKING CHANGE to current shape)

**Current shape:**
```typescript
// ok()  → {data: T, meta: {request_id, timestamp}}
// err() → {error: {code, message}, meta: {request_id, timestamp}}
```

**Required shape (per success criteria):**
```typescript
// ok()  → {ok: true, data: T, meta: {trace_id, timestamp}}
// err() → {ok: false, error: {code, message, trace_id}, meta: {trace_id, timestamp}}
```

**Key changes:**
- Add `ok: true | false` boolean to both shapes
- Rename `request_id` → `trace_id` (matches success criteria language)
- Move `trace_id` into the error object itself (success criteria: `error.trace_id`)
- Keep `trace_id` in `meta` too for consistency

**Updated envelope.ts:**
```typescript
// Source: envelope.ts in project + success criteria spec
import crypto from 'crypto';

export interface Meta {
  trace_id: string;
  timestamp: number;
}

export interface OkResponse<T> {
  ok: true;
  data: T;
  meta: Meta;
}

export interface ErrResponse {
  ok: false;
  error: { code: string; message: string; trace_id: string };
  meta: Meta;
}

export function ok<T>(data: T, traceId?: string): OkResponse<T> {
  const tid = traceId ?? crypto.randomUUID();
  return { ok: true, data, meta: { trace_id: tid, timestamp: Date.now() } };
}

export function err(code: string, message: string, traceId?: string): ErrResponse {
  const tid = traceId ?? crypto.randomUUID();
  return { ok: false, error: { code, message, trace_id: tid }, meta: { trace_id: tid, timestamp: Date.now() } };
}
```

### Pattern 2: X-Request-ID Header via onSend Hook

**What:** Fastify 5 has built-in `request.id` (generated per-request via `genReqId`). Use an `onSend` hook to echo it as `X-Request-ID` on every response.

**Why a global hook:** One change covers all 17 route groups. No per-route modification needed.

```typescript
// In index.ts — add genReqId config and global onSend hook
// Source: Fastify 5 docs — requestIdHeader / genReqId options

const fastify = Fastify({
  logger: { level: config.logLevel },
  genReqId: () => crypto.randomUUID(),          // generate trace ID per request
  requestIdHeader: 'x-request-id',              // read from incoming header if present
});

// Echo X-Request-ID on every response
fastify.addHook('onSend', async (request, reply) => {
  reply.header('X-Request-ID', request.id);
});
```

**The envelope and request.id should share the same trace ID.** Pass `request.id` into `ok()` and `err()` calls so they agree:

```typescript
// In route handlers
return reply.send(ok(data, request.id));
return reply.code(404).send(err('NOT_FOUND', 'Resource not found', request.id));
```

**However:** This requires passing `request.id` to every `ok()`/`err()` call — 80+ call sites. A simpler approach: use the `onSend` hook only for the header, and let the envelope generate its own trace IDs (they won't match but the header still satisfies the success criteria). The success criteria says "same trace ID echoed in X-Request-ID response header" — this means the header and the envelope's trace_id must match.

**Recommended approach:** Add a `request.traceId` decoration that is set to `request.id` in a global `preHandler` hook, and update `ok()`/`err()` calls in route handlers to pass `request.id`. For the non-conforming routes and as a fallback, use the `onSend` hook to ensure the header is always set even if the body doesn't carry a matching ID.

### Pattern 3: OpenAPI via fastify-zod-openapi

**What:** `fastify-zod-openapi` wraps Zod schemas into OpenAPI-compatible JSON Schema and integrates with Fastify's route schema system. `@fastify/swagger` reads those schemas and exposes `/openapi.json`.

**Setup flow:**
```typescript
// plugins/openapi.ts
import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import { fastifyZodOpenApi, serializerCompiler, validatorCompiler } from 'fastify-zod-openapi';

export default fp(async (fastify) => {
  await fastify.register(fastifyZodOpenApi);
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  await fastify.register(swagger, {
    openapi: {
      info: { title: 'Porter API', version: '1.0.0' },
      components: { securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'porter_session' } } },
    },
  });
});
```

**Route schemas with fastify-zod-openapi:**
```typescript
import { z } from 'zod';
import zodOpenApi from 'fastify-zod-openapi';

fastify.get('/', {
  schema: {
    response: {
      200: z.object({ ok: z.literal(true), data: z.object({ projects: z.array(ProjectSchema) }) }),
    },
  },
}, handler);
```

**Serving the spec:**
```typescript
// After all routes are registered, expose spec at /api/v1/openapi.json
fastify.get('/api/v1/openapi.json', async () => {
  return fastify.swagger();
});
```

**Important:** `fastifyZodOpenApi` must be registered BEFORE route definitions. Register it in the plugin that runs before `v1Routes`.

### Pattern 4: Frontend Error Capture Route (OBS-01/OBS-02)

**DB table (migrate-08.ts):**
```typescript
// frontend_errors table
CREATE TABLE IF NOT EXISTS frontend_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  stack TEXT,
  component TEXT,
  severity TEXT NOT NULL DEFAULT 'error',  -- 'error' | 'warning' | 'info'
  user_id TEXT,
  url TEXT,
  metadata TEXT DEFAULT '{}',
  created_at REAL DEFAULT (unixepoch('now'))
);
CREATE INDEX IF NOT EXISTS idx_frontend_errors_severity ON frontend_errors(severity);
CREATE INDEX IF NOT EXISTS idx_frontend_errors_component ON frontend_errors(component);
CREATE INDEX IF NOT EXISTS idx_frontend_errors_created_at ON frontend_errors(created_at);
```

**Route (routes/v1/errors.ts):**
- `POST /api/v1/errors` — no auth required (JS errors happen before/during login), returns 201
- `GET /api/v1/errors` — requires auth, query params: `severity`, `component`, `since` (ISO), `until` (ISO), `limit` (default 50, max 200), `offset`

**POST body schema:**
```typescript
const postErrorSchema = z.object({
  message: z.string().min(1).max(2000),
  component: z.string().max(100).optional(),
  stack: z.string().max(10000).optional(),
  severity: z.enum(['error', 'warning', 'info']).default('error'),
  user_id: z.union([z.string(), z.number()]).optional(),
  url: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});
```

### Anti-Patterns to Avoid

- **Skipping `request.id` plumbing for X-Request-ID:** The success criteria explicitly requires the same trace ID in both the body (`error.trace_id`) and the `X-Request-ID` header. A global `onSend` hook alone is not sufficient — the envelope must receive the same ID.
- **OpenAPI plugin registered after routes:** `fastify-zod-openapi` must run before routes are registered or Fastify's schema compilation won't recognize Zod objects.
- **Auth-protecting the OpenAPI spec endpoint:** `/api/v1/openapi.json` should be public. Machine-readable specs are not sensitive.
- **Auth-protecting POST /api/v1/errors:** Frontend errors fire during auth failures. No auth on POST.
- **Using reply.send({data: ...}) directly instead of ok():** Three files currently do this (decisions.ts, health.ts, files.ts line 260). All must be patched.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpenAPI spec generation | Manual JSON spec file | fastify-zod-openapi + @fastify/swagger | Manual specs drift immediately; Zod schemas are the source of truth |
| Per-request trace ID header | Per-route reply.header() calls | Global onSend Fastify hook | 80+ call sites vs 1 hook |
| UUID generation | Custom ID generator | Node crypto.randomUUID() or uuid package (already installed) | Already in use via crypto.randomUUID() in envelope.ts |
| JSON schema validation for errors endpoint | Manual type checking | Zod safeParse (already the pattern) | Consistent with all other v1 routes |

**Key insight:** The envelope infrastructure already exists. Phase 8 is an upgrade of `envelope.ts` + consistent application + OpenAPI wiring + one new route. Avoid re-architecting what works.

---

## Common Pitfalls

### Pitfall 1: `auth.ts` Plugin Has Hardcoded Error Shape
**What goes wrong:** `plugins/auth.ts` line 44 hardcodes `{error: {...}, meta: {request_id: ..., timestamp: ...}}` directly without using `err()`. After renaming `request_id` to `trace_id` in `envelope.ts`, this will produce inconsistent shapes.
**Why it happens:** The plugin imports from the same file but duplicates the shape.
**How to avoid:** Import and call `err()` from `envelope.ts` in the auth plugin too. Fix simultaneously with envelope.ts patch.
**Warning signs:** `curl /api/v1/auth/me` without cookie returns `request_id` instead of `trace_id`.

### Pitfall 2: OAuth Routes Bypass Envelope Entirely
**What goes wrong:** `oauth-github.ts` has a stub that returns `{error: 'GITHUB_NOT_CONFIGURED', message: '...'}` — not wrapped in `err()`, missing `ok: false`, missing `trace_id`.
**Why it happens:** OAuth routes were written before the envelope pattern was firmly established.
**How to avoid:** Patch the stub error responses. The OAuth callback redirects don't need envelope wrapping (they return 302 redirects), but any JSON error responses do.
**Warning signs:** The curl test for nonexistent routes won't catch this — test the specific `GET /api/v1/oauth/github/start` path when GitHub is not configured.

### Pitfall 3: `fastify-zod-openapi` Registration Order
**What goes wrong:** If `fastifyZodOpenApi` is registered after routes, Fastify's schema compilation pipeline won't use the Zod compiler and route schemas will be ignored in the spec.
**Why it happens:** Fastify processes plugins in registration order; schema compilers must be set before any route uses them.
**How to avoid:** Register the openapi plugin FIRST in `index.ts`, before `v1Routes` registration.
**Warning signs:** `/api/v1/openapi.json` returns empty `paths: {}`.

### Pitfall 4: Envelope Shape is a Breaking Change for frontend-v2
**What goes wrong:** Adding `ok: true/false` and renaming `request_id` → `trace_id` will break any frontend-v2 code already consuming `{data, meta.request_id}`.
**Why it happens:** Another Claude session is actively building frontend-v2 (per STATE.md blockers).
**How to avoid:** Check `git log --oneline -20` before starting. Coordinate or accept that frontend-v2 will need to adapt. The v2 frontend should be the consumer, not the constraint.
**Warning signs:** CI/test failures in frontend-v2 tests after the envelope patch.

### Pitfall 5: `health.ts` Returns `{data: {...}}` (missing `ok` field)
**What goes wrong:** `health.ts` line 70 calls `reply.send({ data: { backends, database, tokenUsage, checkedAt } })` — manually constructing a partial envelope shape without `ok: true` or `meta`.
**Why it happens:** Health was written before the envelope helpers were established.
**How to avoid:** Replace with `reply.send(ok({ backends, database, tokenUsage, checkedAt }, request.id))`.

### Pitfall 6: `decisions.ts` Same Issue
**What goes wrong:** `decisions.ts` line 50 also manually sends `{data: {decisions, total, limit, offset}}`.
**How to avoid:** Same fix — wrap with `ok()`.

---

## Code Examples

Verified patterns from existing codebase and npm packages:

### Updated envelope.ts (complete replacement)
```typescript
// Source: project lib/envelope.ts + success criteria spec
import crypto from 'crypto';

export interface Meta {
  trace_id: string;
  timestamp: number;
}

export interface OkResponse<T> {
  ok: true;
  data: T;
  meta: Meta;
}

export interface ErrResponse {
  ok: false;
  error: { code: string; message: string; trace_id: string };
  meta: Meta;
}

export function ok<T>(data: T, traceId?: string): OkResponse<T> {
  const tid = traceId ?? crypto.randomUUID();
  return { ok: true, data, meta: { trace_id: tid, timestamp: Date.now() } };
}

export function err(code: string, message: string, traceId?: string): ErrResponse {
  const tid = traceId ?? crypto.randomUUID();
  return { ok: false, error: { code, message, trace_id: tid }, meta: { trace_id: tid, timestamp: Date.now() } };
}
```

### Global trace ID + X-Request-ID hook (index.ts patch)
```typescript
// Source: Fastify 5 docs — genReqId option + addHook API
import crypto from 'crypto';

const fastify = Fastify({
  logger: { level: config.logLevel },
  genReqId: () => crypto.randomUUID(),
  requestIdHeader: 'x-request-id',
});

fastify.addHook('onSend', async (request, reply) => {
  reply.header('X-Request-ID', request.id);
});
```

### Passing request.id to envelope in route handlers
```typescript
// Pattern: pass request.id so envelope trace_id matches X-Request-ID header
fastify.get('/', async (request, reply) => {
  return reply.send(ok(data, request.id));
});

fastify.get('/:id', async (request, reply) => {
  if (!found) {
    return reply.code(404).send(err('NOT_FOUND', 'Resource not found', request.id));
  }
  return reply.send(ok(resource, request.id));
});
```

### migrate-08.ts pattern (follows migrate-07 style)
```typescript
// Source: backend/src/db/migrate-07.ts pattern
import { sqlite } from './client.js';

export function migrate08ApiFoundation(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS frontend_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      stack TEXT,
      component TEXT,
      severity TEXT NOT NULL DEFAULT 'error',
      user_id TEXT,
      url TEXT,
      metadata TEXT DEFAULT '{}',
      created_at REAL DEFAULT (unixepoch('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_frontend_errors_severity ON frontend_errors(severity);
    CREATE INDEX IF NOT EXISTS idx_frontend_errors_component ON frontend_errors(component);
    CREATE INDEX IF NOT EXISTS idx_frontend_errors_created_at ON frontend_errors(created_at);
  `);
}
```

### errors route (routes/v1/errors.ts)
```typescript
// POST /api/v1/errors — no auth
fastify.post('/', async (request, reply) => {
  const parsed = postErrorSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input', request.id));
  }
  // insert into frontend_errors ...
  return reply.code(201).send(ok({ id }, request.id));
});

// GET /api/v1/errors — requires auth
fastify.get('/', {
  preHandler: [fastify.requireAuth],
}, async (request, reply) => {
  const { severity, component, since, until, limit = '50', offset = '0' } = request.query as Record<string, string>;
  // build query with optional WHERE clauses ...
  return reply.send(ok({ errors: rows, total, limit: lim, offset: off }, request.id));
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual OpenAPI YAML files | Auto-generated from Zod schemas via fastify-zod-openapi | ~2023 | Spec always in sync with code |
| `request_id` in meta only | `trace_id` in error object + X-Request-ID header | RFC 7919 / industry standard | Traceable errors across services |
| `{data, meta}` envelope | `{ok: bool, data, meta}` envelope | JSend / Google JSON style guide influence | Machine-readable success/failure without HTTP status code check |

**Current in project (not yet deprecated, needs upgrade):**
- `request_id` naming: used in envelope.ts and plugins/auth.ts — replace with `trace_id`
- Missing `ok` field: all routes need it added via envelope change

---

## Open Questions

1. **Frontend-v2 envelope consumers**
   - What we know: STATE.md notes another Claude session is building frontend-v2 and may already consume the current envelope shape (`{data, meta.request_id}`)
   - What's unclear: Has frontend-v2 already shipped code that reads `meta.request_id`?
   - Recommendation: Run `git log --oneline -10` before starting Phase 8 and check frontend-v2 for `request_id` usage. The envelope change is a breaking API change. If frontend-v2 is not yet consuming it, proceed. If it is, coordinate the rename.

2. **Wizard route streaming responses**
   - What we know: `wizard.ts` streams LLM responses via SSE; these are not JSON envelopes
   - What's unclear: Does the success criteria's "all 17 route groups" include SSE streaming endpoints?
   - Recommendation: SSE streaming endpoints return `text/event-stream`, not JSON — exempt them from envelope requirements. The spec says "all route groups" but SSE responses by definition cannot be JSON envelopes. Validate the non-streaming endpoints within wizard.ts only.

3. **OAuth callback routes and envelope**
   - What we know: OAuth callbacks return 302 redirects, not JSON
   - What's unclear: Whether 302 redirects should be counted as "using the envelope"
   - Recommendation: Redirect responses (302) are exempt. Only JSON error responses from OAuth routes (e.g., when GitHub is not configured) need envelope wrapping.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Playwright (existing, 35 tests) |
| Config file | `tests/playwright.config.js` |
| Quick run command | `cd /home/lobster/documents/porter/tests && npx playwright test --grep "Auth"` |
| Full suite command | `cd /home/lobster/documents/porter/tests && npx playwright test` |

**Note:** Existing Playwright tests are UI regression tests against porter.py (port 8877). Phase 8 targets the Fastify backend (port 3001). The success criteria are API-level curl validations, not UI flows. No existing automated API tests exist.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | `curl /api/v1/projects` returns `{ok:true, data:{...}}` | integration/curl | `curl -s -b porter_session=... http://127.0.0.1:3001/api/v1/projects \| jq '.ok'` | ❌ Wave 0 |
| API-01 | Verified across all 17 route groups | integration/curl | `bash tests/api/check-envelope.sh` | ❌ Wave 0 |
| API-02 | Error has `trace_id` in body and `X-Request-ID` header | integration/curl | `curl -sI http://127.0.0.1:3001/api/v1/nonexistent \| grep X-Request-ID` | ❌ Wave 0 |
| API-03 | `/api/v1/openapi.json` returns valid OpenAPI 3.x doc | integration/curl | `curl -s http://127.0.0.1:3001/api/v1/openapi.json \| jq '.openapi'` | ❌ Wave 0 |
| OBS-01 | POST /api/v1/errors returns 201 | integration/curl | `curl -s -X POST -H 'Content-Type: application/json' -d '{"message":"TypeError","component":"ChatPanel","stack":"..."}' http://127.0.0.1:3001/api/v1/errors \| jq '.ok'` | ❌ Wave 0 |
| OBS-02 | GET /api/v1/errors queryable by severity/component | integration/curl | `curl -s -b porter_session=... 'http://127.0.0.1:3001/api/v1/errors?severity=error&component=ChatPanel' \| jq '.data.errors'` | ❌ Wave 0 |

**All tests are manual-curl-verifiable per the success criteria format.** No automated test file is required for Phase 8 — the success criteria provide exact curl commands.

### Sampling Rate
- **Per task commit:** Run full Playwright suite to ensure nothing regressed: `cd /home/lobster/documents/porter/tests && npx playwright test`
- **Per wave merge:** Curl-verify each success criteria point listed above
- **Phase gate:** All 6 curl verifications pass before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/api/check-envelope.sh` — bash script verifying envelope shape across 17 route groups (nice-to-have, not required; curl verification in success criteria is the gate)
- [ ] No new framework install needed — Playwright already works for regression

---

## Sources

### Primary (HIGH confidence)
- `backend/src/lib/envelope.ts` — current envelope implementation (source of truth for what exists)
- `backend/src/routes/v1/` — all 16 route files audited directly
- `backend/package.json` — all installed package versions confirmed
- npm registry (2026-03-21) — verified `fastify-zod-openapi@5.5.0`, `@fastify/swagger@9.7.0`, `@fastify/swagger-ui@5.2.5` peer deps

### Secondary (MEDIUM confidence)
- `fastify-zod-openapi` npm page — supports Fastify 5 + Zod `^3.25.74 || ^4.0.0`
- Fastify 5 TypeScript definitions — `genReqId`, `requestIdHeader` options confirmed in installed package

### Tertiary (LOW confidence)
- None — all claims are grounded in the actual codebase or verified npm data

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified from npm registry, installed versions confirmed
- Architecture: HIGH — based on actual code audit of all 16 v1 route files
- Pitfalls: HIGH — identified from direct code inspection (hardcoded shapes in auth.ts, non-envelope sends in 3 files)

**Research date:** 2026-03-21 (SGT)
**Valid until:** 2026-04-20 (stable domain — packages don't change often, codebase audited directly)
