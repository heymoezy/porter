---
phase: 03-route-migration
verified: 2026-03-20T20:30:00+08:00
status: gaps_found
score: 5/7 success criteria verified
re_verification: false
gaps:
  - truth: "React login page POSTs to /api/v1/auth/login on form submit"
    status: failed
    reason: "LoginPage.tsx fetch call targets legacy /login (porter.py) instead of /api/v1/auth/login. The api.ts login() function is correctly updated but LoginPage.tsx uses its own inline fetch with the wrong path."
    artifacts:
      - path: "frontend/src/pages/LoginPage.tsx"
        issue: "Line 41: fetch('/login', ...) — must be '/api/v1/auth/login'"
    missing:
      - "Change fetch('/login') to fetch('/api/v1/auth/login') in LoginPage.tsx handleSubmit"
      - "Update success redirect: check for json.data?.username instead of data.ok"
  - truth: "Design system tokens are used by the Login page (not just that they exist)"
    status: failed
    reason: "LoginPage.tsx imports only from 'react' and 'framer-motion'. It does not import from design-system/tokens. It uses CSS variable strings inline (e.g. 'var(--bg)') but does not import the token constants. The token file exists and exports all required values, but the page is not wired to it."
    artifacts:
      - path: "frontend/src/pages/LoginPage.tsx"
        issue: "No import from './design-system/tokens' or '../design-system/tokens'. Uses CSS var() strings directly."
    missing:
      - "Add import tokens from '../design-system/tokens' (or named imports)"
      - "Reference at least one token constant in the component (e.g. elevation.glow, animation.spring)"
human_verification:
  - test: "Visual inspection of /v2/login page"
    expected: "Login card with motion entrance animation, Porter logo/wordmark, #uname field, #pw field, .login-btn button, error shake animation"
    why_human: "Page renders in browser — cannot verify Polsia-level visual aliveness, animation feel, or glass effect quality programmatically"
  - test: "Full login flow via React SPA at /v2/login"
    expected: "Filling #uname=moe, #pw=porter and clicking .login-btn redirects to porter.py at port 8877"
    why_human: "The React login page posts to /login (porter.py legacy path) which is alive — but this deviates from the plan requirement of /api/v1/auth/login. Human must confirm the redirect destination is acceptable as-is or needs fixing."
---

# Phase 3: Route Migration Verification Report

**Phase Goal:** Auth, projects, and agents are fully owned by Fastify — porter.py handlers are deprecated, system prompts are razor-thin, design system tokens established, React login/register pages built, and all 35 Playwright tests pass
**Verified:** 2026-03-20T20:30:00+08:00 (SGT)
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | System prompts 200-300 tokens — _build_lean_identity() replaces _build_context_suffix() | VERIFIED | _build_lean_identity() at porter.py:2562 queries personas table, builds 90-103 token prompts. Circuit breaker at prompt.circuit_breaker. _build_context_suffix() marked DEPRECATED Phase 3 at line 2625. 2 active call sites confirmed. |
| 2 | Fastify owns /api/v1/auth/*, /api/v1/projects/*, /api/v1/agents/* with response envelope and request tracing | VERIFIED | auth.ts, projects.ts, agents.ts all exist with full CRUD, use ok()/err() envelope with crypto.randomUUID() request_id. Registered via v1Routes in index.ts at prefix /api/v1. proxyPlugin is last. |
| 3 | All v1 routes use shared db/client.ts — no per-route Database instantiation | VERIFIED | All three v1 route files import `{ db } from '../../db/client.js'`. Zero `new Database` calls in any v1 route file or legacy auth.ts. |
| 4 | Design system tokens established for all new React components | VERIFIED | frontend/src/design-system/tokens.ts exports colors, spacing, typography, animation, elevation, radius, tokens. frontend/src/design-system/index.css has 33 --ds-* CSS custom properties. |
| 5 | React login page feels alive with motion — React Router handles /login, /register, /* | VERIFIED (partial) | LoginPage.tsx uses framer-motion (motion.div, motion.button, cardControls shake animation). React Router set up in main.tsx with createBrowserRouter for /login, /register, /*. basename=/v2 confirmed. RegisterPage.tsx exists (218 lines). Playwright contract selectors #uname, #pw, .login-btn all present. |
| 6 | Frontend API client points to /api/v1/* paths | PARTIAL | api.ts login() → /api/v1/auth/login, logout() → /api/v1/auth/logout, 401 redirect → /v2/login. BUT LoginPage.tsx form submit directly fetch('/login') — the legacy porter.py path. This is the standalone React page's own fetch, not via api.ts. |
| 7 | All 35 Playwright tests pass | VERIFIED | Confirmed: npx playwright test produced "35 passed (1.5m)" with zero failures. |

**Score: 5/7 truths fully verified** (Truth 6 partially fails due to LoginPage.tsx fetch URL; Truth 5 partially fails due to design token import gap)

---

## Required Artifacts

### Plan 03-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `porter.py` | `_build_lean_identity()` function | VERIFIED | Function at line 2562, DB-only, no file I/O, circuit breaker, awareness_mode toggle |

### Plan 03-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/plugins/auth.ts` | Session + API key auth decorator | VERIFIED | fp(authPlugin), decorateRequest('sessionUser'), requireAuth decorator, uses db/client.ts |
| `backend/src/routes/v1/index.ts` | Route registration hub | VERIFIED | Registers authV1Routes, projectV1Routes, agentV1Routes with correct prefixes |
| `backend/src/routes/v1/auth.ts` | /api/v1/auth/login, /logout, /me | VERIFIED | POST /login (Zod + scrypt), POST /logout (cookie clear + session delete), GET /me (requireAuth + DB lookup). All return ok()/err() envelope. |
| `backend/src/lib/envelope.ts` | ok(), err(), meta() helpers | VERIFIED | All three exported, meta() uses crypto.randomUUID(), timestamp: Date.now() |
| `backend/src/lib/logger.ts` | Structured logger with request tracing | VERIFIED | logEvent() and createRequestId() exported |

### Plan 03-03 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/routes/v1/projects.ts` | CRUD routes for /api/v1/projects/* | VERIFIED | 5 routes, requireAuth preHandler, ok()/err() envelope, shared db, JSON field parsing |
| `backend/src/routes/v1/agents.ts` | CRUD routes for /api/v1/agents/* | VERIFIED | 5 routes, config blob parsed (description, skills, tools, awareness_mode), appearance_spec parsed, soft-delete on DELETE |
| `backend/src/db/schema.ts` | personas table in Drizzle | VERIFIED | `export const personas = sqliteTable('personas', ...)` at line 92 |

### Plan 03-04 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/design-system/tokens.ts` | Token constants | VERIFIED | exports colors, spacing, typography, animation, elevation, radius, tokens (default) |
| `frontend/src/design-system/index.css` | CSS --ds-* custom properties | VERIFIED | 33 --ds-* properties across spacing, typography, elevation, radius, animation |
| `frontend/src/pages/LoginPage.tsx` | React login with motion + Playwright selectors | VERIFIED (partial) | Has #uname, #pw, .login-btn. Uses framer-motion. Card shake animation. Does NOT import design-system/tokens. POSTs to legacy /login path (not /api/v1/auth/login). |
| `frontend/src/pages/RegisterPage.tsx` | Registration page | VERIFIED | 218 lines, exists, same design language |
| `frontend/src/main.tsx` | React Router with /login, /register, /* | VERIFIED | createBrowserRouter, basename /v2, LoginPage and RegisterPage imported and routed |

### Plan 03-05 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/lib/api.ts` | API client with /api/v1/* paths | VERIFIED (partial) | login() → /api/v1/auth/login, logout() → /api/v1/auth/logout, 401 → /v2/login. ApiError class fixed. Legacy /login path removed from api.ts. BUT LoginPage.tsx uses own inline fetch('/login'). |
| `backend/src/index.ts` | Fastify with SPA serving for /v2/* | VERIFIED | @fastify/static registered for /v2/, SPA catch-all reads index.html via fs.readFileSync, proxyPlugin is LAST |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `_build_lean_identity()` | `personas` table | `SELECT name, role, config FROM personas WHERE id=?` | VERIFIED | Pattern found at porter.py:2574-2577 |
| `_build_lean_identity()` | dispatch call sites | replaces _build_context_suffix | VERIFIED | Called at line 43529 (dispatch) and 46879 (preview). _build_context_suffix deprecated at 2625. |
| `backend/src/routes/v1/auth.ts` | `backend/src/db/client.ts` | `import { db } from '../../db/client.js'` | VERIFIED | Line 2 of auth.ts |
| `backend/src/routes/v1/auth.ts` | `backend/src/lib/envelope.ts` | `import { ok, err } from '../../lib/envelope.js'` | VERIFIED | Line 5 of auth.ts |
| `backend/src/index.ts` | `backend/src/routes/v1/index.ts` | `fastify.register(v1Routes, { prefix: '/api/v1' })` | VERIFIED | Line 42 of index.ts |
| `frontend/src/pages/LoginPage.tsx` | `/api/v1/auth/login` | fetch POST on form submit | FAILED | Line 41: fetch('/login') — targets porter.py legacy path, not /api/v1/auth/login |
| `frontend/src/main.tsx` | `frontend/src/pages/LoginPage.tsx` | React Router route definition | VERIFIED | Line 11: `{ path: '/login', element: <LoginPage /> }` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| PERF-01 | 03-01 | System prompt cap at 2K tokens, eliminate bloat | SATISFIED | _build_lean_identity() produces 90-103 tokens. Circuit breaker at 2K. _build_context_suffix deprecated. |
| PERF-02 | 03-02, 03-03, 03-04, 03-05 | Core route migration to Fastify (auth, projects, agents) via strangler fig | SATISFIED (with gap) | /api/v1/auth/*, /api/v1/projects/*, /api/v1/agents/* all functional in Fastify. Response envelope with request_id on all routes. porter.py handlers marked deprecated. Frontend api.ts points to v1 paths. Gap: LoginPage.tsx inline fetch still targets legacy /login. |

Both PERF-01 and PERF-02 are satisfied at the infrastructure level. The LoginPage gap is a UI-layer wiring issue within an otherwise complete route migration.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `frontend/src/pages/LoginPage.tsx` | 41 | `fetch('/login', ...)` — wrong API endpoint | WARNING | React SPA login POSTs to porter.py legacy path instead of Fastify /api/v1/auth/login. The page works (porter.py is still alive) but violates the plan's stated requirement and creates confusion about which auth path owns login. |
| `frontend/src/pages/LoginPage.tsx` | 1-2 | No import of design-system/tokens | INFO | Page uses CSS var() strings directly rather than importing design system token constants. Token file exists and is correct — page should reference it to demonstrate the design system is actually wired. |

No blocker anti-patterns found (no return null, no empty stubs, no TODO/FIXME in v1 routes).

---

## Human Verification Required

### 1. Visual Quality of React Login Page

**Test:** Visit http://127.0.0.1:3001/v2/login in a browser
**Expected:** Porter logo, dark card with motion entrance animation, #uname and #pw inputs with focus glow, .login-btn with hover animation. Entering wrong credentials shakes the card. Overall energy should feel "alive" per Polsia reference.
**Why human:** Animation quality, visual appeal, and "aliveness" cannot be assessed programmatically.

### 2. Login Flow End-to-End via React SPA

**Test:** At /v2/login, enter moe/porter and submit
**Expected:** Should authenticate and redirect to the main Porter app
**Why human:** The redirect destination (window.location.href points to port 8877 or '/' depending on current port) needs human confirmation that the UX flow is acceptable. The page posts to /login (porter.py) which works, but differs from plan intent.

---

## Gaps Summary

Two gaps prevent full goal achievement:

**Gap 1 — LoginPage API endpoint mismatch (WARNING severity):**
The React login page at `frontend/src/pages/LoginPage.tsx` contains `fetch('/login', ...)` (line 41), targeting the legacy porter.py handler. The plan explicitly required `POST /api/v1/auth/login`. The `api.ts` library function was correctly updated to use the v1 path, but `LoginPage.tsx` bypasses it with its own inline fetch. This means the React SPA's login form does not exercise Fastify's auth infrastructure — it keeps hitting the deprecated porter.py handler. Fix: change line 41 to `fetch('/api/v1/auth/login', ...)` and update the success condition on line 48 to check `json.data?.username != null`.

**Gap 2 — Design system tokens not imported in LoginPage (INFO severity):**
`LoginPage.tsx` imports only from 'react' and 'framer-motion'. It does not import from `design-system/tokens.ts`. The plan required that pages be "built against" the design system tokens. The CSS var() strings used inline (e.g. `'var(--bg)'`) correspond to the token values but bypass the TypeScript token constants entirely. Fix: add `import tokens from '../design-system/tokens'` and use at least one token reference (e.g. `elevation.glow` for box shadow, `animation.spring` for framer config).

These two gaps are related — they both involve the same file (LoginPage.tsx) and stem from the plan's checkpoint iteration expanding scope, during which the React page was built without wiring into the newly created design system or v1 auth route.

The core phase infrastructure (Fastify routes, response envelope, auth plugin, shared DB client, system prompt overhaul, Playwright tests) is solid and complete.

---

_Verified: 2026-03-20T20:30:00+08:00 (SGT)_
_Verifier: Claude (gsd-verifier)_
