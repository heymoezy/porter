# Phase 1: Foundation - Research

**Researched:** 2026-03-20
**Domain:** Python exception handling, SQLite threading, Drizzle/Fastify proxy baseline, CSS theming, boot provisioning, code deletion
**Confidence:** HIGH (all findings grounded in direct codebase inspection + official documentation)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Embedded HTML Pages:**
- Phase 1: Fix all 1,767 hardcoded colors in porter.py's embedded pages to use CSS variables
- Phase 3: Move LOGIN_PAGE, REGISTER_PAGE, PAGE, ADMIN_PAGE, LANDING_PAGE to React routes
- CSS variable system: Claude decides single source of truth (recommend `:root` as universal, `@theme` reads from it)

**Admin System Deletion:**
- Delete the entire admin/system_admin view — ADMIN_PAGE HTML, /admin/ routes, platform_admin-only endpoints
- Delete the 4-role hierarchy — platform_admin, admin, operator, viewer → replaced with owner + member
- Delete users: system, admin, jacob — only keep moe for now
- Simplify to owner + member roles only — project owner has full control, members have limited access
- ROLE_CAPS dict, auth_check_cap(), admin capability checks all go
- Preserve the DB column for roles (future use) but don't enforce the complex hierarchy

**Landing Page:**
- Marketing page but design last — make it a clean placeholder for now
- Current version has wrong branding, wrong information, wrong colors
- Placeholder should be minimal and not embarrassing — just branding + login button

**Branding & Palette:**
- Current orange (#f7931a) palette is a placeholder — new palette needed
- Claude designs the palette based on product direction (AI orchestration for non-technical users)
- Should "feel amazing" — user likes current dark tones but defers to what works best for users
- Name may change from "Porter" — don't hardcode the name anywhere, make it configurable

**Dark/Light Theming:**
- Currently dark-only, zero light mode code exists
- Follow system preference (prefers-color-scheme) as default
- Existing appearance toggle in main nav stays — switches between light and dark
- Three states: system (default), dark (forced), light (forced)
- All colors must use CSS variables — no hardcoded hex values anywhere
- Claude's discretion on toggle placement and design

**Boot Sequence:**
- Auto-install dependencies with user notification
- Detect → notify → install → configure → verify workflow
- Auto-recover on crash — check logs, reconnect services, resume
- Minimum to run: just Node + SQLite, AI backends configured later
- Structured logging for all system events/errors

**Projects Migration:**
- Move projects from porter_config.json to SQLite table
- Goal: porter_config.json dies completely — everything in DB
- Schema should align with GSD-like project flow
- Env-level config (port, data dir) moves to .env or environment variables, not JSON

**Full UI Tab Audit Scope:**
- All ~50 views audited for: hardcoded colors → CSS variables, dark/light correctness, consistent spacing/fonts/borders, no regressions, responsive behavior
- 8 main nav panels, 7 agent detail tabs, 5 project detail tabs, 3 CRM filters, 6 settings pages, 6 modals/overlays, Login/Register/Landing pages, all embedded HTML in porter.py

### Claude's Discretion
- CSS variable system architecture (`:root` vs `@theme` vs both)
- Exception handling replacement patterns and logging severity model
- SQLite pooling implementation details
- Fastify proxy configuration and route delegation
- Migration strategy timing (one-shot vs dual-write)
- Boot sequence surface (web, CLI, or hybrid)
- New color palette design
- Log tab visibility for end users
- Agent detail tab consolidation
- Project detail tab structure
- Settings page cleanup
- Workflows tab fate

### Deferred Ideas (OUT OF SCOPE)
- "Porter God" platform orchestrator
- Bug reporting + feature request flow from users
- AARRR pirate metrics
- Revenue ladder / billing
- Cloud vs local file storage for multi-user collaboration
- Guided onboarding with a real meaningful first project
- Login with Google (OAuth)
- Auto-create GitHub issues for production crashes
- Log tab visibility decision for end users
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUND-01 | Replace broad exception catches with specific types + structured logging across porter.py | Python exception hierarchy, mlog.emit() API, bare `except: pass` locations (lines 10056-10062), PEP 760 guidance |
| FOUND-02 | Implement SQLite connection pooling with busy_timeout and retry logic for concurrent agent access | threading.local() pooling pattern, sqlite3.connect(timeout=) increase to 30s, OperationalError retry with backoff |
| FOUND-03 | Migrate projects from config JSON to SQLite table with full query capability | Existing Drizzle schema.ts as extension point, porter_config.json["projects"] structure, one-shot migration script pattern |
| FOUND-04 | Remove all deprecated Cortex code and hard cutover to Memory V2 | Cortex locations (lines 1551-2156, 1860-1908, 2041-2060), Memory V2 design doc (porter-memory-v2.md), directive/concept/episode/signal model |
| FOUND-05 | Boot sequence — detect dependencies, install/configure, prompt for credentials, verify, badge unavailable features | Capability detection pattern (_cap_check_*), hardcoding violations list from CLAUDE.md, systemd env var approach |
| UI-01 | CSS audit and consolidation — consistent styling across all Porter views, no regressions | 1,767 hardcoded color locations, existing `:root`/`@theme` dual system, 35 Playwright CSS variable tests |
| UI-02 | Proper dark/light mode implementation — complete, consistent theming with clean toggle | prefers-color-scheme media query, CSS `[data-theme]` attribute approach, three-state toggle pattern |
</phase_requirements>

---

## Summary

Phase 1 is a foundational cleanup phase with zero new features. It addresses seven distinct work streams across the porter.py monolith and the nascent Fastify backend. The codebase has 683 broad exception catches that make silent failures the default, a 5-second SQLite timeout that will cause lock errors under any concurrent load, projects stored in JSON config instead of a queryable database, deprecated Cortex code coexisting with Memory V2, no boot provisioning for fresh installs, and 1,767 hardcoded color values across embedded HTML that block any theming work.

These are not optional cleanups. Every subsequent phase — agent autonomy, memory V2 completion, route migration — depends on this foundation being solid. Silent failures make agent debugging impossible. SQLite lock errors will corrupt scheduled agent runs. JSON-stored projects block collaborative sessions. The CSS debt means dark/light mode cannot be added without touching thousands of hardcoded values.

The work breaks cleanly into six parallel tracks: (1) Python exception audit, (2) SQLite concurrency, (3) projects-to-DB migration, (4) Fastify proxy baseline wiring, (5) CSS audit + dark/light theming, and (6) boot sequence provisioning. Each track is independently deliverable and independently verifiable. The critical ordering constraint is that CSS variable architecture must be decided before the audit sweep begins — the 1,767 colors in porter.py's embedded HTML all need to map to variables defined in a single source of truth.

**Primary recommendation:** Address bare `except: pass` (lines 10056-10062) as the absolute first action — these catch SystemExit and KeyboardInterrupt and mask the most critical failures. Then establish CSS variable single source of truth before touching any HTML.

---

## Standard Stack

### Core (already installed — no new additions needed for this phase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python 3 stdlib | system | exception handling, sqlite3, threading | No pip installs allowed |
| sqlite3 | stdlib | database connection pooling | Already the DB driver |
| threading | stdlib | threading.local() for per-thread connection pool | Standard CPython concurrency primitive |
| Drizzle ORM | 0.45.1 | TypeScript DB schema for projects table | Already in backend/src/db/schema.ts |
| better-sqlite3 | 12.6.2 | Node.js SQLite driver for Drizzle | Already installed |
| Fastify | 5.7.4 | HTTP server with proxy plugin | Already in backend/src/index.ts |
| @fastify/http-proxy | (see note) | Proxy unknown routes to porter.py | Standard Fastify proxy approach |
| TailwindCSS | 4.2.1 | Utility CSS with @theme variable system | Already in frontend |

**Note on @fastify/http-proxy:** Must verify version compatibility with Fastify 5. The existing backend already has @fastify/cors, @fastify/cookie, @fastify/websocket, @fastify/static — proxy is the missing piece.

**Installation (new addition only):**
```bash
cd /home/lobster/documents/porter/backend && npm install @fastify/http-proxy
```

Verify current version:
```bash
npm view @fastify/http-proxy version
```

### No New Libraries Required

This phase is entirely about fixing existing code. All tooling is already present. Resist any temptation to add new dependencies for this phase.

---

## Architecture Patterns

### Pattern 1: Python Exception Handling Reform

**What:** Replace broad `except Exception:` and bare `except: pass` with specific exception types + `mlog.emit()` calls.

**Critical locations (highest priority first):**
- Lines 10056-10062: Four consecutive `except: pass` blocks — these swallow SystemExit and KeyboardInterrupt. Fix these first.
- 683 `except Exception:` patterns distributed throughout porter.py
- Connection leak pattern: `_db_conn()` calls without `try/finally` (lines 189-196, 567-609)

**mlog.emit() signature (from porter.py line 9443):**
```python
# Source: porter.py line 9443 (verified)
mlog.emit(severity, domain, event_type, message, **kwargs)
# severity: "info" | "warn" | "error"
# domain: "system" | "auth" | "ai" | "db" | "routing" etc.
# event_type: "exception.swallowed" | "db.error" | etc.
# kwargs: trace_id, run_id, session_id, backend, duration_ms, status, extra={}
```

**Replacement pattern for non-critical operations:**
```python
# Before (swallows everything including SystemExit):
except: pass

# After (specific type, logged, non-critical path continues):
except Exception as e:
    mlog.emit("warn", "system", "exception.swallowed",
              f"Non-critical operation failed: {e}", extra={"exc": str(e)})
```

**Replacement pattern for database operations:**
```python
# Before:
conn = _db_conn()
conn.execute(...)
conn.commit()
conn.close()

# After (context manager pattern):
conn = _db_conn()
try:
    conn.execute(...)
    conn.commit()
except sqlite3.OperationalError as e:
    mlog.emit("error", "db", "db.locked", str(e))
    raise
finally:
    conn.close()
```

**Severity policy:**
- `mlog.emit("error", ...)` — operation failed, user-visible impact possible
- `mlog.emit("warn", ...)` — recoverable, degraded functionality
- `mlog.emit("info", ...)` — state change, expected path
- `log.debug(...)` — best-effort skips, internal state (do not escalate these)

**Important:** porter.py is ~900KB. The Edit tool silently fails on it. ALL patches must use Python scripts at `/tmp/patch_*.py`.

### Pattern 2: SQLite Connection Pooling

**What:** Replace the single `_db_conn()` call (creating a new connection per operation, timeout=5) with a `threading.local()`-based pool that reuses per-thread connections with a 30-second timeout.

**Current state (porter.py line 324):**
```python
def _db_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=5)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn
```

**Target pattern:**
```python
# Source: Python stdlib threading.local() pattern
_thread_local = threading.local()

def _db_conn() -> sqlite3.Connection:
    if not getattr(_thread_local, 'conn', None):
        conn = sqlite3.connect(str(DB_PATH), timeout=30)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=30000")  # 30s in milliseconds
        conn.row_factory = sqlite3.Row
        _thread_local.conn = conn
    return _thread_local.conn
```

**Retry wrapper for OperationalError (database locked):**
```python
import time as _time
import random as _random

def _db_retry(fn, max_attempts=5):
    """Retry fn() on sqlite3.OperationalError with exponential backoff."""
    for attempt in range(max_attempts):
        try:
            return fn()
        except sqlite3.OperationalError as e:
            if "locked" not in str(e).lower() or attempt == max_attempts - 1:
                raise
            wait = (2 ** attempt) * 0.1 + _random.uniform(0, 0.05)
            mlog.emit("warn", "db", "db.retry",
                      f"DB locked, retry {attempt+1}/{max_attempts} in {wait:.2f}s")
            _time.sleep(wait)
```

**Note:** threading.local() is already used in porter.py for `_CORTEX_EXTRACT_GUARD` (line 1562) and `_request_ctx` (line 9166) — this pattern is established in the codebase.

### Pattern 3: Projects-to-DB Migration

**What:** Add a `projects` table to the Drizzle schema, write a one-time migration that reads `porter_config.json["projects"]`, inserts into SQLite, then removes projects from the JSON file.

**Existing schema pattern** (from `backend/src/db/schema.ts` — use this as the extension model):
```typescript
// Source: backend/src/db/schema.ts (verified)
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug'),
  type: text('type').default('custom'),          // website|app|research|content|design|ops|custom
  status: text('status').default('active'),       // active|paused|completed|archived
  description: text('description'),
  ownerId: text('owner_id').notNull(),            // username of owner
  milestones: text('milestones'),                 // JSON array
  artifacts: text('artifacts'),                   // JSON array
  links: text('links'),                           // JSON array
  metadata: text('metadata'),                     // JSON blob for extensibility
  createdAt: real('created_at').default(sql`(strftime('%s','now'))`),
  updatedAt: real('updated_at').default(sql`(strftime('%s','now'))`),
});
```

**Migration strategy: one-shot with atomic cutover**
- Read `_config["projects"]` at startup
- If projects table is empty AND config has projects, run migration
- Insert all projects into SQLite
- Remove `projects` key from porter_config.json
- Log result via mlog
- Guard with a migration flag in the DB (a `schema_migrations` table entry) to prevent re-run

**porter_config.json project structure** (from ARCHITECTURE.md):
```python
# Source: ARCHITECTURE.md + porter.py load_config()
# Each project dict has: id, name, type, collaborators, milestones, tasks, artifacts
# Additional fields from projects-v2: status, links, metadata
```

**Python-side addition** to `_db_init()` for the projects table:
```python
conn.execute("""
    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT,
        type TEXT DEFAULT 'custom',
        status TEXT DEFAULT 'active',
        description TEXT,
        owner_id TEXT NOT NULL,
        milestones TEXT,
        artifacts TEXT,
        links TEXT,
        metadata TEXT,
        created_at REAL DEFAULT (strftime('%s','now')),
        updated_at REAL DEFAULT (strftime('%s','now'))
    )
""")
```

### Pattern 4: Fastify Proxy Baseline

**What:** Wire the existing `backend/src/index.ts` to (a) connect to the shared `porter.db` via Drizzle, (b) add a proxy plugin as the last registered plugin so all unknown routes fall through to porter.py on port 8877.

**Current state:** `backend/src/index.ts` has route registrations but no database connection and no proxy. It starts on port 3001, bound to `0.0.0.0` — this needs to change to `127.0.0.1`.

**Proxy plugin pattern (last plugin = fallback):**
```typescript
// Source: @fastify/http-proxy documentation pattern
// Registered LAST so all other routes take priority
fastify.register(httpProxy, {
  upstream: 'http://127.0.0.1:8877',
  // Do not strip prefix — pass path through unchanged
  rewriteRequestHeaders: (req, headers) => headers,
});
```

**db/client.ts pattern:**
```typescript
// Source: Drizzle ORM SQLite documentation
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const sqlite = new Database(process.env.PORTER_DB_PATH || `${process.env.HOME}/.porter/porter.db`);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 30000');

export const db = drizzle(sqlite, { schema });
```

**config.ts pattern:**
```typescript
// All config from env vars, no hardcoded paths
export const config = {
  port: parseInt(process.env.PORTER_BACKEND_PORT || '3001'),
  host: process.env.PORTER_BACKEND_HOST || '127.0.0.1',  // never 0.0.0.0
  porterPyUrl: process.env.PORTER_PY_URL || 'http://127.0.0.1:8877',
  dbPath: process.env.PORTER_DB_PATH || `${process.env.HOME}/.porter/porter.db`,
};
```

**Feature flag skeleton:**
```typescript
// config.ts addition — all future autonomous features gated here
export const featureFlags = {
  agentScheduling: process.env.FEATURE_AGENT_SCHEDULING === 'true',
  guidedWizard: process.env.FEATURE_GUIDED_WIZARD === 'true',
  // Add more flags as phases ship
};
```

### Pattern 5: CSS Variable Single Source of Truth

**What:** Establish `:root` as universal source of truth. `@theme` reads from `:root` variables. Embedded HTML in porter.py uses the same `--variable` names. This means changing a color in `:root` propagates everywhere.

**Current state:** `frontend/src/index.css` has both `@theme` (Tailwind 4) and `:root` blocks with duplicate values (verified — 45 lines). The embedded HTML in porter.py uses hardcoded hex values (`#1A1A1A`, `#0F0F0F`, etc.) — 1,767 instances.

**Target architecture:**
```css
/* Source: frontend/src/index.css (extend this file) */

/* 1. SINGLE SOURCE: :root defines all tokens for ALL contexts */
:root {
  /* Dark mode defaults (current palette is dark-first) */
  --bg: #0F0F0F;
  --surface: #1A1A1A;
  --raised: #242424;
  --border: #2E2E2E;
  --border2: #363636;
  --text: #F0F0F0;
  --text2: #C0C0C0;
  --text3: #909090;
  --accent: /* NEW PALETTE — Claude's discretion */;
  --accent-d: /* NEW PALETTE — Claude's discretion */;
  --danger: #dc2626;
  --success: #16a34a;
  --radius: 8px;
  --sidebar: 220px;
}

/* 2. Light mode overrides (new — currently no light mode exists) */
[data-theme="light"],
:root.light {
  --bg: #FFFFFF;
  --surface: #F5F5F5;
  --raised: #EBEBEB;
  --border: #DDDDDD;
  --border2: #CCCCCC;
  --text: #111111;
  --text2: #444444;
  --text3: #777777;
  /* accent, danger, success stay same or adjust for contrast */
}

/* 3. System preference (default behavior before user overrides) */
@media (prefers-color-scheme: light) {
  :root:not([data-theme]) {
    --bg: #FFFFFF;
    /* ... same as [data-theme="light"] */
  }
}

/* 4. Tailwind @theme reads FROM :root — no duplication */
@theme {
  --color-accent: var(--accent);
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-raised: var(--raised);
  --color-border: var(--border);
  --color-text: var(--text);
  --color-text2: var(--text2);
  --color-text3: var(--text3);
  --radius-porter: var(--radius);
}
```

**Three-state toggle implementation:**
```typescript
// Theme state: 'system' | 'dark' | 'light'
// Stored in localStorage as 'porter_theme'
// Applied as data-theme attribute on <html>

function applyTheme(preference: 'system' | 'dark' | 'light') {
  const root = document.documentElement;
  if (preference === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', preference);
  }
  localStorage.setItem('porter_theme', preference);
}
```

**Embedded HTML color replacement strategy:**
- All 1,767 hardcoded colors in porter.py map to `var(--token-name)` equivalents
- The embedded pages use `<style>` blocks — add `@import` of a shared CSS resource OR inline the `:root` variables in each page's `<style>` block
- Since embedded pages are served from porter.py, they cannot import from `/v2/` (React frontend path)
- Practical approach: Inline a minimal `:root { ... }` variable block at the top of each embedded page's `<style>` tag, then replace all `#hex` with `var(--token)`

### Pattern 6: Boot Sequence Provisioning

**What:** On startup, porter.py detects required dependencies, reports status, auto-installs what it can (Node.js modules via npm), prompts for credentials it cannot auto-obtain, then badges unavailable features in the UI.

**Existing pattern to extend** (from ARCHITECTURE.md — porter.py already does capability detection):
```python
# Source: porter.py _cap_check_*() functions — already present
# Pattern: probe service → set capability flag → badge feature if unavailable
# _detect_local_models() probes Ollama on startup
# _load_openclaw_skills() checks openclaw
```

**Target boot sequence:**
```python
def _boot_sequence():
    """Detect → notify → install → configure → verify → badge."""
    results = {}

    # 1. Required: Node.js
    results['node'] = _check_node()

    # 2. Required: porter.db writable (SQLite)
    results['db'] = _check_db()

    # 3. Optional: Ollama (local models)
    results['ollama'] = _check_ollama()

    # 4. Optional: OpenClaw gateway
    results['openclaw'] = _check_openclaw()

    # 5. Hardcoding violations: default to env vars, not hardcoded paths
    _resolve_path_config()   # replace DEFAULT_MOUNTS, CONFIG_PATH, etc.
    _resolve_host_config()   # HOST from env or detection, not hardcoded IP

    # 6. Store results for UI badging
    _capabilities_cache.update(results)

    # Log summary
    missing = [k for k, v in results.items() if not v.get('ok')]
    if missing:
        mlog.emit("warn", "system", "boot.degraded",
                  f"Missing capabilities: {missing}")
    else:
        mlog.emit("info", "system", "boot.ok", "All capabilities verified")
```

**Hardcoding violations to fix in boot sequence** (from CLAUDE.md violations list):
- `DEFAULT_MOUNTS` — must be empty on first run, populated from config
- `CONFIG_PATH`, `RUNTIME_DIR`, `AVATAR_DIR`, `MEMORY_DIR` — derive from `PORTER_DATA_DIR` or XDG
- `AGENT_WORKSPACE_DIR`, `OPENCLAW_STATE_DIR` — optional/detected
- `HOST = "76.13.190.52"` — auto-detect or read from env
- `PORT = 8877` — respect `PORTER_PORT` env var

### Pattern 7: Admin System Deletion

**What:** Delete ADMIN_PAGE, /admin/ routes, ROLE_CAPS dict, `auth_check_cap()`, all platform_admin checks. Simplify user model to owner + member.

**Key deletion targets** (from codebase analysis):
- `ROLE_CAPS` dict at line 7361 — delete entirely
- `auth_check_cap()` function — delete, replace callers with simple session check
- `/admin/` route handler — delete
- `ADMIN_PAGE` HTML constant (line 46916+) — delete (~1000+ lines)
- `platform_admin` role checks throughout embedded JS (lines 20746, 20853, 23704, 24319, 38375 and others)
- Users `system`, `admin`, `jacob` — delete from DB on startup if present
- 4 hidden nav tabs (Policies, Tool Registry duplicate, Audit, Platform link) — remove from nav HTML
- 4 dead settings pages (Agents, Tasks, Policy — keep Profile, Password, Changelog)

**Role preservation strategy:**
- Keep `role` column in `users` table (future use)
- Set all remaining users to `operator` role on cutover
- Remove all role-enforcement code — access control simplifies to "is authenticated"
- Add owner tracking at project level instead of platform level

### Recommended Project Structure (no changes to layout — work within existing)

```
porter/
├── porter.py                    # All Python patches via /tmp/patch_*.py scripts
├── backend/src/
│   ├── index.ts                 # ADD: proxy plugin (last), fix host to 127.0.0.1
│   ├── config.ts                # NEW: env-driven config + feature flags
│   ├── db/
│   │   ├── client.ts            # NEW: Drizzle db instance, WAL + busy_timeout
│   │   └── schema.ts            # EXTEND: add projects table
│   └── plugins/
│       ├── proxy.ts             # NEW: @fastify/http-proxy to porter.py
│       └── auth.ts              # NEW: session validation middleware
└── frontend/src/
    └── index.css                # EXTEND: dark/light theme variables, @theme alignment
```

### Anti-Patterns to Avoid

- **"Incremental" exception audit without a script:** Manually editing 683 locations in a 900KB file will produce regressions. Write a Python script that systematically finds and replaces patterns.
- **Editing porter.py with the Edit tool:** The Edit tool silently fails on files >500KB. Use `/tmp/patch_*.py` scripts exclusively.
- **Dual @theme + :root with different values:** The current duplication is the source of future drift. Any approach that maintains two independent value sets will diverge again.
- **Projects migration with dual-write complexity:** Given projects only exist in one place (porter_config.json), a one-shot migration is safer than dual-write. Dual-write is needed when both backends actively write — here only porter.py writes projects currently.
- **Adding new features during CSS audit:** The CSS audit is a pure cleanup. No new UI elements. No refactoring component structure. Change colors to variables only.
- **Changing test credentials:** Tests use `moe` / `porter`. The admin deletion plan removes `admin` / `porter` as a user — tests already use `moe`, so the 35 tests remain valid.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-thread DB connections | Custom connection manager class | `threading.local()` stdlib | Standard CPython pattern, no overhead |
| Proxy fallback routing | Custom HTTP relay in porter.py | `@fastify/http-proxy` | Handles headers, streaming, error codes correctly |
| Theme storage | Custom cookie/DB preference | `localStorage` + `data-theme` attribute | Standard browser pattern, instant without server round-trip |
| CSS color tokenization | Build-time tool to scan/replace | Direct Python script at /tmp/ to find/replace | One-time operation, simpler than tooling |
| Feature flag system | Redis/database-backed flags | Environment variables + config.ts constants | No overhead, restart to change, appropriate for this scale |

**Key insight:** Every "custom" solution in this phase trades correctness for code. The stdlib and existing Fastify ecosystem already solve these problems correctly.

---

## Common Pitfalls

### Pitfall 1: Bare `except:` Catches SystemExit and KeyboardInterrupt
**What goes wrong:** `except: pass` (not `except Exception: pass`) catches ALL exceptions including `SystemExit`, `KeyboardInterrupt`, and `GeneratorExit`. These four lines (10056-10062) prevent clean shutdown and can make porter.py unkillable.
**Why it happens:** Python 2 legacy habit. Python 3 has a clean exception hierarchy where `Exception` does not include system exceptions.
**How to avoid:** Replace ALL bare `except:` with `except Exception:`. Then add `mlog.emit("warn", ...)` inside.
**Warning signs:** If `kill <pid>` doesn't cleanly stop porter.py, a bare `except:` is the culprit.

### Pitfall 2: threading.local() Connection Not Closed Between Requests
**What goes wrong:** A per-thread connection that is reused can hold a transaction open if an exception interrupts execution. Subsequent requests on that thread see stale transaction state.
**Why it happens:** threading.local() reuses connections but doesn't reset between request boundaries.
**How to avoid:** Ensure all database operations complete (commit or rollback) before returning. Never leave an implicit transaction open. The `try/finally conn.close()` anti-pattern would fix this but loses pooling benefit — instead use explicit `conn.commit()` or `conn.rollback()` in all error paths.
**Warning signs:** "cannot start a transaction within a transaction" errors in logs.

### Pitfall 3: CSS Variable in porter.py Embedded HTML Not Applied
**What goes wrong:** The embedded HTML pages in porter.py are served directly (not via the React frontend). They have their own `<style>` blocks. If you define `--bg` in `frontend/src/index.css` but the embedded page has `background: #1A1A1A`, the variable won't apply to that page.
**Why it happens:** The embedded pages are rendered as standalone HTML, not inside the React app's CSS scope.
**How to avoid:** Each embedded page must either (a) inline the `:root { ... }` variable definitions in its own `<style>` block, or (b) load a shared CSS file served by porter.py. Option (a) is simpler for Phase 1.
**Warning signs:** Light mode toggle changes the React app but not the login page.

### Pitfall 4: Projects Migration Runs More Than Once
**What goes wrong:** If the migration check is "projects table is empty", a user who deletes all their projects will trigger migration again and find nothing in porter_config.json (already removed), resulting in an error or silently empty state.
**Why it happens:** Incomplete migration state tracking.
**How to avoid:** Use a `schema_migrations` table with a unique row for `migrate_projects_from_json_v1`. Check for this row, not for empty projects table.
**Warning signs:** Migration log entry appears at every startup.

### Pitfall 5: @fastify/http-proxy Version Incompatibility with Fastify 5
**What goes wrong:** Fastify 5 has breaking changes from Fastify 4. Some proxy plugin versions are not compatible.
**Why it happens:** Fastify 5 is relatively recent (the existing backend already uses 5.7.4).
**How to avoid:** Verify `@fastify/http-proxy` supports Fastify 5 before installing. Check `peerDependencies` in the package.
**Warning signs:** "Plugin not compatible with Fastify version" error at startup.

### Pitfall 6: Hardcoded Colors Inside JavaScript String Templates
**What goes wrong:** Some hardcoded colors in porter.py are inside JavaScript string templates (e.g., `f"background-color: #1A1A1A"` inside an f-string that generates inline style attributes). These won't be caught by a simple regex for `#hex`.
**Why it happens:** The embedded HTML mixes Python string interpolation with CSS-in-HTML and inline styles.
**How to avoid:** Search for both `#[0-9a-fA-F]{3,6}` AND `rgb(` AND `rgba(` patterns. Inline styles in HTML attributes (`style="color: #..."`) are separate from `<style>` block declarations.
**Warning signs:** After the audit sweep, run the regex again and find remaining hits.

### Pitfall 7: Deleting admin Users Breaks Playwright Tests
**What goes wrong:** If the admin deletion script removes users while tests are running, or if a test depends on an `admin` user existing (even to verify it's gone), tests will fail.
**Why it happens:** Tests in `ui-regression.spec.js` authenticate as `moe` / `porter` (already verified safe), but the test file `test_p0_p1.py` may reference admin credentials.
**How to avoid:** Verify test credentials before deleting users. `test_p0_p1.py` line 13 uses `admin` / `porter` — update this file too if admin is being deleted, or check whether `test_p0_p1.py` is in the active Playwright suite.
**Warning signs:** Tests fail immediately after admin deletion.

---

## Code Examples

### Exception Audit Script (run via /tmp/patch_exception_audit.py)

```python
# Source: Python re stdlib + porter.py structure (verified pattern)
# Run as: python3 /tmp/patch_exception_audit.py
import re, pathlib

porter = pathlib.Path("/home/lobster/documents/porter/porter.py")
content = porter.read_text()

# Find bare except: pass
bare_pass = [(m.start(), m.group()) for m in
             re.finditer(r'except:\s*pass', content)]
print(f"Bare except: pass — {len(bare_pass)} instances")

# Find except: without pass (catch-and-continue)
bare_catch = [(m.start(), m.group()) for m in
              re.finditer(r'except:\s*\n', content)]
print(f"Bare except: (no pass) — {len(bare_catch)} instances")

# Find broad except Exception: pass
broad_pass = [(m.start(), m.group()) for m in
              re.finditer(r'except Exception.*?:\s*pass', content)]
print(f"Broad except Exception: pass — {len(broad_pass)} instances")
```

### CSS Color Count Verification

```bash
# Count remaining hardcoded hex colors in porter.py
grep -oE '#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}' \
  /home/lobster/documents/porter/porter.py | wc -l

# Count in embedded HTML specifically (between PAGE = """ and """)
# Done via Python script for accuracy
```

### Playwright CSS Variable Test (existing — do not break)

```javascript
// Source: tests/ui-regression.spec.js (verified in codebase)
// These tests check CSS variables are defined
// After Phase 1, all --vars must be defined and light mode must not break these
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact for Phase 1 |
|--------------|------------------|--------------|-------------------|
| `except: pass` everywhere | `except Exception as e: log(e)` | PEP 760 (Python 3.11+) — bare excepts technically still valid but discouraged | Adopt PEP 760 guidance: no bare except, all exceptions logged |
| Per-request DB connection | threading.local() pooled connections | Standard Python pattern pre-dates modern ORMs | Implement for porter.py Python layer |
| Tailwind 3 `@apply` / CSS Modules | Tailwind 4 `@theme` with CSS variables | Tailwind 4 (already using 4.2.1) | `@theme` is the right pattern — align `:root` with it |
| `data-theme` attribute | CSS `color-scheme` + `prefers-color-scheme` | Current best practice 2025-2026 | Use both: `data-theme` for explicit override, media query for system default |
| Hardcoded config in JSON | Environment variables + `.env` | Industry standard since 12-factor app | Move env-level config (port, data dir) to env vars |

**Deprecated/outdated in this codebase:**
- `porter_config.json` as project store: must die in Phase 1
- 4-role RBAC (platform_admin/admin/operator/viewer): deleted in Phase 1
- Cortex memory system: disabled in Phase 1 (full deletion in Phase 2)
- ADMIN_PAGE HTML console: deleted in Phase 1
- `except: pass` pattern: eliminated in Phase 1

---

## Open Questions

1. **What Fastify port does the frontend proxy to?**
   - What we know: porter.py runs on 8877. Fastify currently configured for 3001 in `index.ts`. The frontend (served by porter.py at `/v2/`) makes API calls relative to origin (8877).
   - What's unclear: Does the Phase 1 Fastify baseline need to be reachable from the browser, or just serve as infrastructure groundwork that the proxy plugin handles? If Fastify is on 3001 and porter.py proxies `/v2/*` to Vite's dev output, the browser never hits 3001 directly.
   - Recommendation: Phase 1 Fastify baseline should start on 3001 (or a new port), confirm it starts cleanly and the proxy passes requests to porter.py. No frontend routing changes needed in Phase 1 — that is Phase 3.

2. **How does the CSS variable theme apply to porter.py's embedded pages in dark vs. light mode?**
   - What we know: The embedded pages (LOGIN_PAGE, REGISTER_PAGE, PAGE, LANDING_PAGE, ADMIN_PAGE) are Python string constants serving standalone HTML. They have their own `<style>` blocks. The React frontend's CSS doesn't apply to them.
   - What's unclear: The `data-theme` attribute approach requires JavaScript to apply it to `<html>`. For the login page (served before auth), there is no JavaScript context.
   - Recommendation: For Phase 1, inline both light and dark mode variable sets in each embedded page using the `@media (prefers-color-scheme: light)` CSS media query. The three-state JS toggle (system/dark/light) applies after the React app loads. Pre-auth pages (login, register, landing) use system preference only.

3. **Should porter.py itself call `mlog.exception()` or just `mlog.emit("error", ...)`?**
   - What we know: `mlog.emit()` takes `severity, domain, event_type, message, **kwargs`. There is no `mlog.exception()` shortcut (unlike Python's `logging.exception()` which auto-captures traceback).
   - Recommendation: Call `mlog.emit("error", domain, "exception", str(e), extra={"exc_type": type(e).__name__})`. For the most critical errors, also call `log.exception(e)` (Python stdlib) which writes traceback to stderr — useful during development.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Playwright 1.58.2 |
| Config file | `tests/playwright.config.js` |
| Quick run command | `cd /home/lobster/documents/porter/tests && npx playwright test --grep "CSS variables"` |
| Full suite command | `cd /home/lobster/documents/porter/tests && npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | No `except: pass` patterns remain in porter.py | automated grep | `grep -c "except: pass" /home/lobster/documents/porter/porter.py` (must return 0) | ✅ (grep, not Playwright) |
| FOUND-01 | Exceptions emit to mlog, not silently swallowed | manual review | Review log output during restart | manual-only |
| FOUND-02 | Concurrent DB writes do not produce locked errors | integration test | Run 10 concurrent curl requests to `/api/chat` and check logs | ❌ Wave 0 gap |
| FOUND-03 | Projects load from SQLite, not porter_config.json | automated assertion | `grep -c '"projects"' /home/lobster/documents/porter/porter_config.json` (must return 0) | ✅ (grep, not Playwright) |
| FOUND-03 | Existing projects still visible after migration | e2e | `cd /home/lobster/documents/porter/tests && npx playwright test --grep "Projects"` | ✅ (existing Playwright) |
| FOUND-04 | No cortex code paths active (grep check) | automated grep | `grep -c "cortex_enabled\|_cortex_extract\|cortex_consolidate" porter.py` (must return 0) | ✅ (grep, not Playwright) |
| FOUND-05 | Porter starts on a machine with only Node + SQLite | manual smoke | Fresh data dir, start porter.py, verify boot sequence log | manual-only |
| UI-01 | All --css-vars defined, no missing variable errors | e2e | `cd /home/lobster/documents/porter/tests && npx playwright test --grep "CSS"` | ✅ (existing Playwright) |
| UI-01 | 0 hardcoded hex colors remain in porter.py | automated grep | `grep -cE '#[0-9a-fA-F]{6}\|#[0-9a-fA-F]{3}' porter.py` (must return 0) | ✅ (grep, not Playwright) |
| UI-02 | Light mode renders correctly — no invisible text | e2e (manual) | Set `data-theme="light"` in browser DevTools, visual inspection | ❌ Wave 0 gap |
| UI-02 | Dark mode renders correctly — all existing tests pass | e2e | Full Playwright suite | ✅ (existing Playwright) |

### Sampling Rate

- **Per task commit:** `cd /home/lobster/documents/porter/tests && npx playwright test` (full 35 tests, ~2 min)
- **Per wave merge:** Full suite green + grep checks return 0
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/concurrency.sh` — bash script that fires 10 concurrent curl requests and checks for "database is locked" in logs; covers FOUND-02
- [ ] Light mode visual smoke — no automated test exists; manual inspection required post-implementation; flag for Phase 1 verification criteria

---

## Sources

### Primary (HIGH confidence)
- `/home/lobster/documents/porter/porter.py` lines 324-328 — `_db_conn()` actual implementation
- `/home/lobster/documents/porter/porter.py` lines 9443-9468 — `mlog.emit()` actual API
- `/home/lobster/documents/porter/porter.py` lines 10056-10062 — bare `except: pass` locations
- `/home/lobster/documents/porter/porter.py` lines 7361+ — `ROLE_CAPS` dict location
- `/home/lobster/documents/porter/porter.py` line 1562 — `threading.local()` already in use
- `/home/lobster/documents/porter/backend/src/db/schema.ts` — Drizzle schema extension point
- `/home/lobster/documents/porter/frontend/src/index.css` — current 45-line CSS with @theme + :root
- `/home/lobster/documents/porter/.planning/codebase/CONCERNS.md` — all pitfall line numbers
- `/home/lobster/documents/porter/.planning/codebase/ARCHITECTURE.md` — data flow, patterns
- `/home/lobster/documents/porter/CLAUDE.md` — hardcoding violations, porter.py edit constraints
- PEP 760 — No More Bare Excepts: https://peps.python.org/pep-0760/
- Drizzle ORM SQLite docs: https://orm.drizzle.team/docs/get-started-sqlite

### Secondary (MEDIUM confidence)
- `/home/lobster/documents/porter/research/porter-memory-v2.md` — Memory V2 design for FOUND-04 context
- `/home/lobster/documents/porter/research/projects-v2-plan.md` — projects schema guidance
- `/home/lobster/documents/porter/.planning/research/SUMMARY.md` — pitfall synthesis

### Tertiary (LOW confidence)
- CSS `prefers-color-scheme` + `data-theme` pattern — industry convention, cross-referenced with MDN; specific implementation details may vary

---

## Metadata

**Confidence breakdown:**
- Exception handling (FOUND-01): HIGH — bare except locations confirmed, mlog API verified from source
- SQLite pooling (FOUND-02): HIGH — threading.local already used in porter.py, sqlite3 docs confirmed
- Projects migration (FOUND-03): HIGH — config structure known, Drizzle schema extension pattern clear
- Cortex deletion (FOUND-04): HIGH — line ranges confirmed in CONCERNS.md
- Boot sequence (FOUND-05): MEDIUM — pattern clear from existing _cap_check_*() functions, exact hardcoding fix scope requires codebase scan
- CSS audit (UI-01): HIGH — 1,767 count confirmed, strategy grounded in existing CSS structure
- Dark/light theming (UI-02): HIGH — standard CSS pattern, three-state toggle well-established

**Research date:** 2026-03-20
**Valid until:** 2026-04-19 (30 days; stack is stable, no fast-moving dependencies)
