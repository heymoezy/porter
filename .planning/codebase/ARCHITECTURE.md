# Architecture

**Analysis Date:** 2026-03-20

## Pattern Overview

**Overall:** Monolithic + Hybrid Web Application

**Key Characteristics:**
- Single Python entry point (`porter.py`) serving both HTTP requests and background workflows
- Embedded React frontend (built as static SPA, served from Python)
- SQLite as persistent data store with WAL journal mode
- Multi-threaded HTTP server with handler dispatch to route handlers
- Background workflow registry for system tasks (context hygiene, orchestration, etc.)
- Configuration-driven runtime behavior (no hardcoding of paths/credentials)

## Layers

**HTTP Handler Layer:**
- Purpose: Route incoming HTTP requests to appropriate business logic
- Location: `porter.py` lines 46919+ (Handler class inheriting BaseHTTPRequestHandler)
- Contains: `do_GET()` and `do_POST()` methods, auth middleware, response formatting
- Depends on: Python stdlib http.server, session management, config
- Used by: All external API consumers (browser frontend, agents, external APIs)

**Business Logic Layer:**
- Purpose: Implement domain operations (projects, personas, tasks, memory, orchestration)
- Location: `porter.py` utility functions (prefixed with `_`, e.g., `_project_by_id()`, `_mem_insert()`, `_smart_route()`)
- Contains: Project management, persona dispatch, memory operations, chat logic
- Depends on: Database connections, config, workflow registry
- Used by: HTTP handlers, background workflows

**Data Persistence Layer:**
- Purpose: Manage SQLite database schema and queries
- Location: `porter.py` lines 324+ (_db_init, _db_conn)
- Contains: SQLite schema definitions (23+ tables), row factories, connection pooling
- Depends on: SQLite3 stdlib
- Used by: All business logic that reads/writes state

**Frontend Layer:**
- Purpose: User interface for Porter orchestrator
- Location: `frontend/src/` (React + TypeScript)
- Contains: React components, Zustand store, API client wrapper
- Depends on: React, React Query, Zustand
- Used by: Browser clients

**Configuration Layer:**
- Purpose: Manage runtime configuration and preferences
- Location: `porter_config.json` (via `PORTER_DATA_DIR`)
- Contains: User accounts, projects, preferences, workflow intervals
- Depends on: Filesystem, JSON serialization
- Used by: All layers on startup

**Workflow Registry:**
- Purpose: Manage system background tasks
- Location: `porter.py` lines 130-277 (workflow registration and execution)
- Contains: 7 system workflows (context hygiene, capability checks, heartbeat, etc.)
- Depends on: Threading, config, business logic functions
- Used by: Background thread that checks intervals and triggers workflows

## Data Flow

**User Authentication & Session:**

1. User submits credentials to `/login` (HTML form)
2. Handler validates against users table (or legacy config username)
3. Session token generated and stored in `sessions` table
4. Session cookie set in response (`porter_session=<token>`)
5. Subsequent requests validated via `get_session()` middleware

**Chat Message Processing:**

1. User submits message via frontend POST to `/api/chat` (async)
2. Handler parses message, retrieves persona/project context
3. Memory injection: `_mem_inject_for_dispatch()` pulls relevant memories
4. Router selection: `_smart_route()` selects backend (claude/gemini/qwen)
5. Backend call made via openclaw gateway (http://127.0.0.1:18789)
6. Response streamed back, stored in `chat_messages` table
7. Memory extraction: `_mem_extract_signals()` distills learned facts
8. Chat actions processed: `_execute_chat_actions()` interprets response for side effects

**Project Context Assembly:**

1. Request arrives with project_id
2. `_project_by_id()` loads project config from `_config["projects"]`
3. `_project_knowledge_brief()` assembles brief from: artifacts, members, notes, tasks
4. `_build_project_dispatch_context()` enriches with persona assignments, memory
5. Returned as JSON dict for handler response or backend context injection

**State Management:**

- **Configuration:** `_config` dict loaded from JSON at startup, refreshed on edits
- **Session State:** `_sessions` dict updated on login/activity, persisted to DB
- **Runtime Memory:** `_wf_registry` holds workflow execution stats (in-memory + persisted)
- **Database:** SQLite WAL mode for concurrent reads; PRAGMA journal_mode=WAL

## Key Abstractions

**Persona (Agent Identity):**
- Purpose: Represents a worker/agent with skills, constraints, communication style
- Examples: `AGENT_TEMPLATES` dict (lines 7000+), stored in `personas` table
- Pattern: Dict with keys: name, category, description, soul, mission, appearance_spec, appearance_style

**Memory System (Cortex → State Engine):**
- Purpose: Manages learned facts, directives, extracted signals
- Examples: `_mem_insert()`, `_mem_search()`, `_mem_promote()`
- Pattern: Transition from cortex (retired) to directives + concepts (State Engine)
- Scopes: global, project, persona, task

**Project (Workspace Container):**
- Purpose: Grouping for work, teams, context, artifacts
- Examples: `_project_by_id()`, Projects stored in `_config["projects"]` and `project_content` table
- Pattern: Dict with keys: id, name, type, collaborators, milestones, tasks, artifacts

**Workflow (Background Task):**
- Purpose: Recurring system operation
- Examples: context_hygiene, capability_checks, memory_extraction
- Pattern: Registered with `_wf_register()`, interval-driven via `_run_if_due()`

**Bridge/Route (Backend Selection):**
- Purpose: Abstract AI backend selection (claude/gemini/qwen)
- Examples: `_smart_route()`, `_ranked_route()`, benchmark scoring
- Pattern: Score-based selection with fallback hierarchy

## Entry Points

**HTTP Server:**
- Location: `porter.py` main block (bottom of file)
- Triggers: Startup via systemd unit (`systemctl --user start porter`)
- Responsibilities: Listen on port 8877, accept connections, dispatch to Handler

**Handler.do_GET():**
- Location: `porter.py` line 47084
- Triggers: HTTP GET request
- Responsibilities: Route to appropriate API/view, auth check, response formatting

**Handler.do_POST():**
- Location: `porter.py` line 50885
- Triggers: HTTP POST request
- Responsibilities: Parse JSON body, validate auth, call business logic, stream or JSON response

**Frontend Entry:**
- Location: `frontend/src/main.tsx`
- Triggers: Browser load of `/`
- Responsibilities: Mount React app, set up Zustand store, establish session via `/api/me`

**Workflow Runner:**
- Location: Background thread spawned at startup
- Triggers: Every 0.1s checks if any workflow interval is due
- Responsibilities: Call `_run_if_due()` for each registered workflow

## Error Handling

**Strategy:** Graceful degradation with structured logging

**Patterns:**

- **Auth Failures:** Return 401 JSON or redirect to /login; log via mlog.emit()
- **Invalid Input:** Return 400 JSON with error message; validate before business logic
- **Backend Unavailable:** Return error response, record in workflow stats, badge feature as unavailable
- **Database Errors:** Catch, log, return 500 with generic message (no data leaks)
- **Memory Errors:** Caught silently, logged, system continues (non-blocking)
- **File Operations:** Wrapped in try/except; safe_resolve() prevents path traversal

**Logging:**
- Structured logging via `mlog.emit(severity, category, code, message, extra=dict)`
- Categories: "auth", "system", "ai", "orchestration", etc.
- Persisted to SQLite `logs` table (via background indexer)
- Queryable via `/api/logs/query` endpoint

## Cross-Cutting Concerns

**Logging:**
- Method: `mlog.emit()` for structured logs, `log.info/debug/warning()` for debug logs
- Correlation: Trace ID generated per request, injected into all downstream calls
- Retention: 7 days (configurable via `hygiene_log_retention_days`)

**Validation:**
- Path traversal: `safe_resolve()` validates all file paths
- Permissions: `is_writable()` checks ownership before write operations
- JSON: `json.JSONDecodeError` caught and returned as 400
- Auth: Session token validated on every protected endpoint via `auth_check()`

**Authentication:**
- Method: Session cookie (porter_session token)
- Storage: SQLite `sessions` table with expiry, IP tracking, user agent
- Brute force protection: `_LOGIN_MAX_ATTEMPTS` with exponential lockout
- Roles: platform_admin > admin > operator > viewer (RBAC)

**Background Processing:**
- Architecture: Single background thread checking intervals every 0.1s
- Workflow state: Tracked in `_wf_registry` and persisted to `workflow_stats` table
- Error recovery: Failed workflows recorded with retry hints in history
- Concurrency: `_wf_lock` threading.Lock prevents race conditions on registry

---

*Architecture analysis: 2026-03-20*
