# Phase 1: Foundation - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the codebase safe to build on: eliminate silent failures (623 broad exception catches), fix SQLite concurrency, migrate projects from JSON to SQLite, set up Fastify proxy baseline, audit CSS for consistency, implement proper dark/light theming, and create a boot sequence for fresh installs. This phase also includes major cleanup: deleting the admin/system_admin infrastructure, simplifying the user model, and removing deprecated code.

</domain>

<decisions>
## Implementation Decisions

### Embedded HTML Pages
- Phase 1: Fix all 1,767 hardcoded colors in porter.py's embedded pages to use CSS variables
- Phase 3: Move LOGIN_PAGE, REGISTER_PAGE, PAGE, ADMIN_PAGE, LANDING_PAGE to React routes
- Claude's discretion on phased timing — quick CSS variable fix now, full React migration later
- CSS variable system: Claude decides single source of truth (recommend `:root` as universal, `@theme` reads from it)

### Admin System Deletion
- **Delete the entire admin/system_admin view** — ADMIN_PAGE HTML, /admin/ routes, platform_admin-only endpoints
- **Delete the 4-role hierarchy** — platform_admin, admin, operator, viewer → replaced with owner + member
- **Delete users: system, admin, jacob** — only keep moe for now
- **Simplify to owner + member roles only** — project owner has full control, members have limited access
- This is a significant code deletion — ROLE_CAPS dict, auth_check_cap(), admin capability checks all go
- Preserve the DB column for roles (future use) but don't enforce the complex hierarchy

### Landing Page
- Marketing page but design last — make it a clean placeholder for now
- Current version has wrong branding, wrong information, wrong colors
- Placeholder should be minimal and not embarrassing — just branding + login button

### Branding & Palette
- Current orange (#f7931a) palette is a placeholder — new palette needed
- Claude designs the palette based on product direction (AI orchestration for non-technical users)
- Should "feel amazing" — user likes current dark tones but defers to what works best for users
- Name may change from "Porter" — don't hardcode the name anywhere, make it configurable

### Dark/Light Theming
- Currently dark-only, zero light mode code exists
- Follow system preference (prefers-color-scheme) as default
- Existing appearance toggle in main nav stays — switches between light and dark
- Three states: system (default), dark (forced), light (forced)
- All colors must use CSS variables — no hardcoded hex values anywhere
- Claude's discretion on toggle placement and design

### Boot Sequence
- Auto-install dependencies with user notification ("Installing X, Y, Z...")
- Detect → notify → install → configure → verify workflow
- Auto-recover on crash — check logs, reconnect services, resume
- Minimum to run: just Node + SQLite, AI backends configured later
- Structured logging for all system events/errors — discoverable bugs for development pipeline
- Claude's discretion on web vs CLI vs hybrid for setup surface

### Error Pipeline
- All errors captured in structured logs
- Auto-create GitHub issues for crashes (future phase — note for later)
- Bug reporting + feature request flow from users (future phase)
- Log tab visibility: Claude's discretion on whether users see system logs

### Projects Migration
- Move projects from porter_config.json to SQLite table
- Claude's discretion on migration strategy (one-shot vs dual-write)
- Goal: porter_config.json dies completely — everything in DB
- Schema should align with GSD-like project flow (not the previous misguided direction)
- Speed, privacy, and user firewalling are key concerns for SaaS multi-tenancy
- Project files: Claude decides DB vs filesystem based on agent access needs + privacy
- Env-level config (port, data dir) moves to .env or environment variables, not JSON

### Claude's Discretion
- CSS variable system architecture (`:root` vs `@theme` vs both)
- Exception handling replacement patterns and logging severity model
- SQLite pooling implementation details
- Fastify proxy configuration and route delegation
- Migration strategy timing (one-shot vs dual-write)
- Boot sequence surface (web, CLI, or hybrid)
- New color palette design
- Log tab visibility for end users

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Codebase Analysis
- `.planning/codebase/ARCHITECTURE.md` — Current system architecture, layers, data flow, entry points
- `.planning/codebase/STACK.md` — Current technology stack with versions
- `.planning/codebase/STRUCTURE.md` — Directory layout, file purposes, naming conventions, where to add new code
- `.planning/codebase/CONVENTIONS.md` — Coding conventions, import organization, error handling patterns
- `.planning/codebase/CONCERNS.md` — Tech debt, security issues, performance bottlenecks, fragile areas
- `.planning/codebase/INTEGRATIONS.md` — External services, auth, CI/CD, environment configuration

### Project Context
- `.planning/PROJECT.md` — Vision, core value, constraints, key decisions
- `.planning/REQUIREMENTS.md` — All v1 requirements with phase mapping
- `.planning/research/SUMMARY.md` — Research findings, recommended stack, architecture approach, pitfalls

### Porter-Specific
- `CLAUDE.md` — Project rules, architecture non-negotiables, release governance, known hardcoding violations
- `research/porter-memory-v2.md` — Memory V2 design doc (relevant for Cortex removal in FOUND-04)
- `research/projects-v2-plan.md` — Projects V2 redesign spec (relevant for schema decisions)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/index.css` — 45-line CSS with both `@theme` and `:root` variables (needs consolidation)
- `frontend/src/lib/api.ts` — API client wrapper with auth and error handling
- `frontend/src/store/app.ts` — Zustand store (AppState: activeTab, sidebarCollapsed)
- `backend/src/db/schema.ts` — Drizzle ORM schema reference (can be extended for projects table)
- `backend/src/routes/` — Route file structure (auth.ts, tasks.ts, chat.ts, files.ts, admin.ts, ai.ts, events.ts)

### Established Patterns
- Tailwind CSS 4 with `@theme` for component styling
- `:root` CSS variables duplicated from `@theme` for non-Tailwind contexts
- Zustand for client state, React Query for server state
- Fastify 5 with TypeScript as the target backend framework
- Drizzle ORM with better-sqlite3 for database access

### Integration Points
- `porter.py` line 324: `_db_conn()` — current SQLite connection point (needs pooling)
- `porter.py` line 330: `_db_init()` — schema definitions (23+ tables)
- `porter.py` ROLE_CAPS dict — role system to be deleted
- `porter.py` DEFAULT_PREFERENCES — config defaults (many to be removed with Cortex)
- `backend/src/index.ts` — Fastify entry point (needs proxy plugin to porter.py)
- `frontend/src/main.tsx` — React entry point
- Embedded HTML pages: LOGIN_PAGE (line 13028), REGISTER_PAGE (13216), PAGE (13297), ADMIN_PAGE (46916), LANDING_PAGE (46731)

### Key Metrics
- 623 `except:` or `except Exception` patterns in porter.py
- 1,767 hardcoded color values across embedded HTML pages
- 5 embedded HTML pages in porter.py
- 4 users to delete (system, admin, jacob — keep moe only)
- Current CSS: 45 lines (frontend/src/index.css)

</code_context>

<specifics>
## Specific Ideas

- "I really need a good name, and a good URL" — project name may change from Porter. Make the name configurable, not hardcoded.
- "It needs to feel amazing" — the palette and theming should be premium quality, not just functional
- "Every user's bug should be discoverable by the core system" — logging is not just for debugging, it's a product pipeline input
- "We don't use Porter to build Porter" — external tools only for development
- "Reverse all previously bad/misguided decisions" — actively simplify, don't preserve complexity for backwards compatibility
- Current dark palette (neutral grays + orange) is liked but recognized as a placeholder

</specifics>

<deferred>
## Deferred Ideas

- "Porter God" platform orchestrator that oversees all user session Porters — future SaaS infrastructure
- Bug reporting + feature request flow from users (direct chat with platform Porter)
- AARRR pirate metrics woven into the product (first mission = stickiness, collaborators = free acquisition, X posts = awareness)
- Revenue ladder: storage charges, collaboration as premium, what's free vs paid
- Cloud vs local file storage for multi-user collaboration (privacy + file sharing)
- Guided onboarding with a real meaningful first project (not generic)
- Login with Google (OAuth) — not now, not in production environment yet
- Auto-create GitHub issues for production crashes
- Log tab visibility decision for end users

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-20*
