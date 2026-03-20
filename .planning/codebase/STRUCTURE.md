# Codebase Structure

**Analysis Date:** 2026-03-20

## Directory Layout

```
porter/
├── porter.py                     # Main application (single file, ~900KB)
├── porter-agent.py               # Agent subprocess wrapper
├── porter_config.json            # Configuration (user accounts, projects, preferences)
├── porter.db                     # SQLite database (auto-created)
├── frontend/                     # React SPA frontend
│   ├── src/
│   │   ├── main.tsx             # Entry point
│   │   ├── App.tsx              # Root component
│   │   ├── index.css            # Global styles
│   │   ├── components/          # Reusable React components
│   │   ├── modules/             # Feature modules (chat, etc.)
│   │   ├── store/               # Zustand state management
│   │   ├── lib/                 # Utilities (api.ts client wrapper)
│   │   └── hooks/               # Custom React hooks
│   ├── public/                  # Static assets
│   ├── dist/                    # Built output (served by porter.py)
│   ├── package.json             # Frontend dependencies
│   └── vite.config.ts           # Vite build config
├── backend/                      # Legacy/hybrid backend structure
│   └── src/
│       ├── index.ts             # Fastify entry (reference only)
│       ├── routes/              # Route definitions
│       │   ├── auth.ts
│       │   ├── tasks.ts
│       │   ├── chat.ts
│       │   ├── files.ts
│       │   ├── admin.ts
│       │   ├── ai.ts
│       │   └── events.ts
│       └── db/
│           └── schema.ts        # Schema reference
├── memory/                       # Persistent memory/state storage
│   ├── people/                  # Contact/user profiles
│   ├── projects/                # Project context files
│   ├── artifacts/               # Generated outputs
│   ├── decisions/               # Strategic decisions
│   ├── transcripts/             # Chat history archives
│   ├── compliance/              # Audit/compliance records
│   ├── indexes/                 # Search indexes
│   └── pointers/                # References to external content
├── chat/                         # Chat message archives
├── tests/                        # Playwright E2E tests
├── research/                     # Design docs, planning
├── tasks/                        # Working files (checkpoint.md, lessons.md)
└── docs/                         # Documentation
```

## Directory Purposes

**porter.py (Root):**
- Purpose: Complete web application server
- Contains: HTTP handler, routing, business logic, database ops, config management
- Key responsibilities: Handle requests, manage workflows, coordinate backends
- Size: ~900KB (monolithic by design)

**frontend/src/:**
- Purpose: React user interface
- Contains: Components, hooks, API client wrapper, state management
- Files: 8+ React/TS files organized by feature
- Build: Vite compiles to `frontend/dist/`, served statically by porter.py

**frontend/src/components/:**
- Purpose: Shared React components (Layout, Sidebar, etc.)
- Contains: Layout manager, navigation, common UI patterns
- Pattern: Functional components with hooks, styled inline or via CSS modules

**frontend/src/modules/:**
- Purpose: Feature-specific UI sections
- Contains: chat/ subdir with ChatView and related logic
- Pattern: Self-contained feature area with own state and styles

**frontend/src/store/:**
- Purpose: Zustand state management
- Contains: app.ts with AppState (activeTab, sidebarCollapsed)
- Pattern: Minimal, UI-only state (not data; data fetched from API via React Query)

**frontend/src/lib/:**
- Purpose: Utility functions and API client
- Contains: api.ts (fetch wrapper with auth and error handling)
- Pattern: ApiError class, generic api<T>() function, login() helper

**backend/src/ (Legacy Reference):**
- Purpose: Reference architecture (Fastify routes, DB schema)
- Contains: Route structure (auth, tasks, chat, files, admin, ai, events)
- Note: Routes are currently implemented in porter.py; this shows intended structure

**memory/:**
- Purpose: Persistent structured memory and state
- Contains: Persona directives, project context, decision logs, audit trails
- Organization: Scoped by type (people/, projects/) and purpose (decisions/, compliance/)

**tests/:**
- Purpose: Regression test suite (Playwright E2E)
- Contains: 35 test files covering UI flows, auth, chat, etc.
- Run: `cd /home/lobster/documents/porter/tests && npx playwright test`

**research/:**
- Purpose: Architecture and design documentation
- Contains: Design briefs (agents-v2, memory-v2), planning docs, whitepapers
- Examples: porter-agents-v2-design-brief.md, porter-memory-v2.md

**tasks/:**
- Purpose: Working files for development
- Contains: checkpoint.md (task state), lessons.md (recurring patterns/fixes)
- Convention: Checkpoint updated on every task state change

## Key File Locations

**Entry Points:**

- `porter.py` main block (bottom): Starts HTTPServer, binds to port, runs forever
- `frontend/src/main.tsx`: Creates React root, mounts App component
- `/` (GET): Returns embedded PAGE (React built output) or LANDING_PAGE
- `/api/*` (GET/POST): Routes to business logic handlers
- Background workflow loop: Spawned as thread, checks intervals every 0.1s

**Configuration:**

- `porter_config.json`: User accounts, projects, preferences, workflow intervals
  - Structure: { username, password, projects: [...], preferences: {...} }
  - Path: `{PORTER_DATA_DIR}/porter_config.json` (defaults to ~/.porter/)
  - Synced: `load_config()` at startup, `save_config()` on changes

- `porter.py` line 90: `DEFAULT_PREFERENCES` dict (initial config template)
- `porter.py` line 241-277: System workflow registration (7 workflows defined)

**Core Logic:**

- `porter.py` line 8537: `load_config()` — reads porter_config.json
- `porter.py` line 8645: `save_config()` — writes porter_config.json
- `porter.py` line 3168: `_project_by_id()` — fetch project by ID
- `porter.py` line 2680: `_build_project_dispatch_context()` — assemble context
- `porter.py` line 3307: `_smart_route()` — select backend for request
- `porter.py` line 3482: `_mem_search()` — query memory system
- `porter.py` line 10599: `_save_chat_message()` — persist chat
- `porter.py` line 2489: `_hygiene_run()` — cleanup background task

**Database:**

- `porter.db` (auto-created): SQLite database at `{PORTER_DATA_DIR}/porter.db`
- Schema: 23+ tables (sessions, users, tasks, chats, memories, directives, etc.)
- Initialization: `_db_init()` at startup (line 330)
- Migrations: Inline ALTER TABLE for schema evolution

**Testing:**

- `tests/` directory: Playwright test files
- `tests/playwright.config.ts`: Playwright configuration
- Run command: `npx playwright test`

## Naming Conventions

**Files:**

- Python: `snake_case.py` (e.g., porter.py, porter-agent.py)
- TypeScript/TSX: `PascalCase` for components (e.g., App.tsx, Layout.tsx), `camelCase` for utilities (e.g., api.ts)
- Configuration: JSON (e.g., porter_config.json, vite.config.ts)
- Data: SQLite (e.g., porter.db)

**Directories:**

- Feature modules: `lowercase` (e.g., frontend/, backend/, memory/, tests/, research/)
- Feature areas: `lowercase` (e.g., chat/, projects/, artifacts/)
- Component folders: `PascalCase` (e.g., components/, modules/)

**Functions/Methods:**

- Public/export: `camelCase` or `PascalCase` (classes)
- Internal (porter.py): `_prefixed_snake_case` (indicates private utility)
- Async: Usually suffixed with descriptive verb (e.g., `_save_chat_message`, `_build_context()`)

**Variables:**

- Constant config: `UPPERCASE_SNAKE_CASE` (e.g., `PORT`, `AVATAR_DIR`, `SESSION_TTL`)
- Runtime state: `lowercase_snake_case` or `_lowercase_snake_case` if private
- Types: `PascalCase` (TypeScript interfaces/types)

## Where to Add New Code

**New HTTP Route:**

1. Handler dispatch: Add `elif parsed.path == "/api/new-endpoint":` block in Handler.do_GET() or Handler.do_POST()
2. Business logic: Create `def _handle_new_endpoint():` utility function
3. Testing: Add Playwright test in `tests/test_*.spec.ts`
4. Example location: `porter.py` lines 47084+ (do_GET routes start here)

**New Component/Module:**

1. React component: Create `frontend/src/components/NewComponent.tsx`
2. Styles: Add to component or `frontend/src/index.css`
3. Hooks: If stateful, create `frontend/src/hooks/useNewFeature.ts`
4. API calls: Use `frontend/src/lib/api.ts` wrapper
5. Integration: Import and use in Layout or routed view

**New Workflow:**

1. Register: Call `_wf_register("workflow_id", "name", "desc", interval="1h", interval_s=3600)`
2. Implementation: Create `def _workflow_execute():` function
3. Registration call: Add in the workflow registration block (line 241+)
4. Triggering: System checks `_run_if_due()` automatically

**New Database Table:**

1. Schema: Add `CREATE TABLE` statement in `_db_init()` (line 330)
2. Queries: Create helper functions like `_table_insert()`, `_table_query()`
3. Migrations: Add `ALTER TABLE` blocks for existing installs
4. Location: `porter.py` line 330-900 (all table definitions here)

**New Persona/Agent Template:**

1. Template definition: Add to `AGENT_TEMPLATES` dict (line 7000+)
2. Fields: name, category, description, soul, mission, appearance_spec, archetype, communication_style
3. Registration: Include in AGENT_TEMPLATES at startup
4. Example: Look at security_engineer template (line 7457+)

**Utilities/Helpers:**

1. Shared logic: Create in `porter.py` as `_prefixed_utility_name()`
2. Frontend utilities: Create in `frontend/src/lib/` (e.g., formatters, validators)
3. Hooks (React): Create in `frontend/src/hooks/` following useXxx pattern

## Special Directories

**memory/ (Persistent State):**
- Purpose: Long-lived structured data for Porter's understanding
- Generated: Partially (decisions created by Porter, indexed by human)
- Committed: Yes, to git for reproducibility
- Organization: Scoped by type (people/, projects/) and function (decisions/, compliance/)

**chat/ (Message Archives):**
- Purpose: Chat history by session
- Generated: Yes, at runtime per conversation
- Committed: No (git-ignored typically)
- Organization: By chat_id directory

**runtime/ (Temporary Runtime State):**
- Purpose: Session state, logs, usage metrics
- Generated: Yes, at runtime
- Committed: No
- Subdirectories: logs/, usage/
- Path: `{PORTER_DATA_DIR}/runtime/`

**backend/src/ (Legacy/Reference):**
- Purpose: Shows intended Fastify structure (not actively used)
- Generated: No
- Committed: Yes (for architectural reference)
- Status: Maps to porter.py routes; can be regenerated separately

---

*Structure analysis: 2026-03-20*
