# Phase 3: Route Migration - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate auth, projects, and agents from porter.py to Fastify via strangler fig pattern. Audit and radically slim system prompts. Move embedded HTML pages (login, register, main) to React routes. Standardize the API surface as a professional, public-ready REST API. All 35 Playwright tests pass after migration. porter.py route handlers for auth/projects/agents are deleted — Fastify owns them.

</domain>

<decisions>
## Implementation Decisions

### System Prompt Revolution
- **Radical reduction** — system prompts become razor-thin. Just agent identity + how to use Porter resources. Everything else (memory, project context, tools, constraints) fetched on-demand via DB queries and Porter's orchestration layer
- **No front-loading** — memory injection is real-time DB queries, not cached blobs. Project context is fetched when relevant, not stuffed in the prompt. Tools are implicit in Porter's logic, not enumerated
- **No caching** — caching introduces stale data. This is a real-time agent world. Always query fresh from DB with proper indices
- **Agent identity in prompt:** name, role, direction, how to use Porter resources. That's it. ~200-300 tokens naturally
- **Awareness toggle** — per-agent user-configurable setting: "aware" (knows about other agents, can suggest delegation) vs "sandboxed" (only knows Porter). User decides per agent
- **Squad roster eliminated** — Porter is the sole orchestrator. No squad concept in prompts
- **Soul + rules merged** — no separate soul/mission and rules/constraints blocks. One compact identity block
- **Light guardrails in prompt** — 2-3 non-negotiable anti-hallucination rules baked into every agent's identity. Tiny, always present. Not bloated .md files — DB references and indices
- **2K token circuit breaker** — not a budget, a safety net. If a prompt somehow exceeds 2K, respawn the agent with a lean prompt. Never send a bloated prompt
- **Respawn is a show** — when an agent respawns (prompt optimization, evolution), the pixel character does its transformation animation. Everything visible, everything alive
- **Identity rebuild → activity feed note** — when system prompt is rebuilt after learning: "Identity updated: learned 3 new preferences." No diff view, just acknowledgment

### API Overhaul
- **Full REST overhaul** — professional quality, no vibe coding slop. Consistent naming convention across all endpoints
- **API versioning: /api/v1/*** — all Fastify routes namespaced under /api/v1/. Future-proof for breaking changes
- **Clean break: /api/personas/* → /api/v1/agents/*** — no backward compat aliases. Frontend updated in same migration
- **Full path restructure:** /api/v1/auth/*, /api/v1/agents/*, /api/v1/projects/*, /api/v1/memory/*, etc.
- **Public-ready from day one** — designed as if external developers will use it. Consistent error codes, proper HTTP status codes, structured responses
- **Auth: session cookies + API keys** — web app uses session cookies, external consumers use Bearer token API keys. Both coexist. Standard SaaS pattern
- **No rate limiting yet** — deferred until API monetization strategy exists. No customers yet. Noted for future phase
- **No OpenAPI spec yet** — build routes first, add spec generation later. Don't slow down migration

### Embedded Pages → React
- **Login page: alive like Polsia** — motion, energy, dynamic. NOT a static form. Live agent activity and system metrics visible on the login screen. Users see Porter is alive before logging in
- **Chat with Porter on login** — visible but requires registration. Teaser that pulls users in
- **Registration: email + password only for now** — social OAuth (Apple, Google, Microsoft, X) buttons added when OAuth is wired in Phase 7. No dead/disabled UI
- **LOGIN_PAGE, REGISTER_PAGE, PAGE → React routes** — embedded HTML in porter.py deleted. Fastify serves the React SPA, React Router handles these pages

### Response Standardization
- **Robust logging on every response** — errors include trace IDs. Porter can self-diagnose issues through the global system. Auto-diagnosis pipeline is a first-class concern
- **Every bug discoverable** — structured error data that Porter's diagnostic system can correlate and act on

### Claude's Discretion
- Response envelope format (recommend: {data, error, meta} wrapper)
- Error contract design (recommend: machine code + human message on every error)
- Request tracing approach (recommend: X-Request-Id on every response, logged server-side)
- Session + API key implementation details
- Exact system prompt guardrail wording (2-3 anti-hallucination rules)
- React Router structure for login/register/main pages
- Login page animation and live activity display implementation
- DB index strategy for real-time agent context queries

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Codebase Analysis
- `.planning/codebase/ARCHITECTURE.md` — Current system architecture, HTTP handler layer, data flow, entry points
- `.planning/codebase/STACK.md` — Technology stack: Fastify 5, Drizzle ORM, React 19, Vite 8, TailwindCSS 4
- `.planning/codebase/STRUCTURE.md` — Directory layout, where to add new code
- `.planning/codebase/CONVENTIONS.md` — Coding conventions, error handling patterns
- `.planning/codebase/CONCERNS.md` — Tech debt, 683 broad exception catches, SQLite concurrency issues

### Prior Phase Decisions
- `.planning/phases/01-foundation/01-CONTEXT.md` — Phase 1: Fastify proxy baseline, CSS variables, embedded pages decision ("Phase 3: Move to React routes"), admin deletion, role simplification
- `.planning/phases/02-memory-v2/02-CONTEXT.md` — Phase 2: Memory V2 injection design, _build_context_suffix, memory injection architecture (being replaced by on-demand queries in Phase 3)

### Project Context
- `.planning/PROJECT.md` — Vision, constraints, gradual migration strategy
- `.planning/REQUIREMENTS.md` — PERF-01 (system prompt audit), PERF-02 (core route migration)
- `CLAUDE.md` — Release governance, 35-test regression requirement, porter.py patching approach

### Design References
- `research/porter-memory-v2.md` — Memory V2 design (relevant: injection path being replaced with on-demand DB queries)

### Existing Fastify Backend
- `backend/src/index.ts` — Fastify entry point, plugin registration, proxy setup
- `backend/src/routes/auth.ts` — Reference auth implementation (login/logout/session)
- `backend/src/db/schema.ts` — Drizzle schema: users, sessions, projects, tasks, chats tables
- `backend/src/config.ts` — Config with env vars, feature flags, proxy URL
- `backend/src/plugins/proxy.ts` — Strangler fig proxy to porter.py (registered LAST)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/routes/auth.ts` — Reference login/logout/session implementation. Needs upgrade to /api/v1/auth/* paths and API key support
- `backend/src/db/schema.ts` — Drizzle schema with users, sessions, projects tables. Ready for Fastify routes to query
- `backend/src/config.ts` — Config + feature flags pattern. Extend for new migration flags
- `backend/src/plugins/proxy.ts` — Strangler fig proxy already working. Routes claimed by Fastify automatically bypass porter.py
- `frontend/src/lib/api.ts` — API client wrapper. Needs update for /api/v1/* paths

### Established Patterns
- Fastify plugin registration order: named routes first, proxy LAST (Phase 1 decision)
- Drizzle ORM with better-sqlite3 for all DB access in Fastify
- `/tmp/patch_*.py` scripts for porter.py modifications (file too large for Edit tool)
- `mlog.emit()` for structured logging in porter.py — equivalent needed in Fastify
- Cookie-based sessions with `porter_session` token

### Integration Points
- **Auth routes in porter.py:** `/login` (GET line 46392, POST line 50136), `/logout` (POST line 50263), `/api/me` (GET line 46441)
- **Project routes in porter.py:** ~10+ endpoints under `/api/projects/*` (GET lines 48830-48864, POST lines 52830-53002)
- **Agent routes in porter.py:** ~12+ endpoints under `/api/personas/*` (GET lines 46771-46788, POST lines 52205-53035)
- **System prompt assembly:** `_build_context_suffix()` (line 2561), `_mem_inject_for_dispatch()` (line 2446) — to be radically slimmed
- **Frontend API calls:** All `/api/personas/*` calls need renaming to `/api/v1/agents/*`
- **Playwright tests:** 35 tests that exercise auth, projects, agents — must stay green

### Key Metrics
- ~10 project API endpoints to migrate
- ~12 agent/persona API endpoints to migrate
- 3 auth endpoints to migrate (login, logout, session/me)
- 5 embedded HTML pages to delete from porter.py (LOGIN_PAGE, REGISTER_PAGE, PAGE, ADMIN_PAGE, LANDING_PAGE)
- Frontend-wide /api/personas/* → /api/v1/agents/* rename
- 35 Playwright tests to keep passing

</code_context>

<specifics>
## Specific Ideas

- "This is all dumb to include everything in a system prompt — everyone else is doing this because they don't have Porter, that's our fucking special sauce" — Porter's on-demand context is a competitive differentiator. No one else has an orchestrator that can fetch context dynamically
- "Agents are ALWAYS ACTIVE... learning from what's happening in the system" — system prompt must plant the seed for Phase 4 autonomy. Agents know they're part of a living system
- "Agents can talk to each other, spawn instances, ask Porter... they need to be relentless and find the best most efficient way" — Phase 4 scope, but Phase 3 prompt design enables it
- "Don't keep legacy for legacy sake ever. Burn it down. No BANDAIDS EVER!" — clean break on API naming, no aliases, no backward compat shims
- "Do a complete overhaul so it's 100% professional quality no vibe coding slop" — full REST restructure, not a partial rename
- "Login needs to feel alive like the Polsia page" — dynamic, animated login with live system data. Reference: polsia.com
- "Everything is a show... if an agent is respawning let's embrace it and make it cool" — respawn animations are a product feature, not a technical detail
- "Keep logs robust so you can auto-diagnose and fix errors through the Porter global system" — logging is a pipeline for Porter self-healing, not just debugging
- "Friction is bad. This is a hard rule for everything we do" — speed over approval gates. No Porter-approves-everything bottleneck
- "I hate caching as it introduces stale data — this is old website world" — always fresh DB queries, proper indices, no caching layer

</specifics>

<deferred>
## Deferred Ideas

- **Social OAuth login** (Apple, Google, Microsoft, X) — Phase 7 when OAuth is wired. Buttons added to login page at that time
- **API rate limiting + monetization** — future phase when customers exist. Need monetization strategy first
- **OpenAPI spec generation** — add @fastify/swagger after routes are stable
- **Agent-to-agent communication** — Phase 4 autonomy. Phase 3 system prompt plants the seed but doesn't implement
- **Agent spawning/ephemeral instances** — Phase 4 scope
- **"Always active" background learning** — Phase 4 event-driven autonomy
- **Porter self-healing from error logs** — auto-diagnosis pipeline is Phase 6 transparency

</deferred>

---

*Phase: 03-route-migration*
*Context gathered: 2026-03-20*
