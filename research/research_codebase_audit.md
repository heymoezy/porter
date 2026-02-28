# Porter Codebase Audit — v0.15.4
**Audited:** 2026-02-28
**File:** `/home/lobster/documents/porter/porter.py`
**Size:** 735,110 bytes (718 KB) | **14,988 lines**

---

## 1. Code Structure — Section Breakdown

| Section | Line Range | Lines | % of File |
|---------|-----------|-------|-----------|
| **Python: Imports** | 1–23 | 23 | 0.2% |
| **Python: Config, Globals, Constants** | 25–115 | 91 | 0.6% |
| **Python: Backend Logic (functions)** | 119–2661 | 2,543 | 17.0% |
| **HTML: Login Page** (`LOGIN_PAGE`) | 2662–2813 | 152 | 1.0% |
| **HTML+CSS+JS: Main SPA** (`PAGE`) | 2817–11724 | 8,908 | 59.4% |
|   — CSS (inside `<style>`) | 2825–3892 | 1,068 | 7.1% |
|   — HTML body (sidebar + modules) | 3894–4909 | 1,016 | 6.8% |
|   — JavaScript (inside `<script>`) | 4910–11620 | 6,711 | 44.8% |
|     — Changelog array | 4940–5908 | 969 | 6.5% |
|     — JS functions (excl. changelog) | 5909–11619 | 5,711 | 38.1% |
|   — Onboarding Wizard HTML | 11622–11721 | 100 | 0.7% |
| **Python: HTTP Handler class** | 11728–14963 | 3,236 | 21.6% |
| **Python: Server startup** | 14967–14989 | 23 | 0.2% |

### Summary by Language

| Language | Lines | % |
|----------|-------|---|
| Python (backend) | ~5,916 | 39.5% |
| JavaScript | ~6,711 | 44.8% |
| CSS | ~1,068 | 7.1% |
| HTML | ~1,293 | 8.6% |

### Key Counts
- **Python top-level functions:** 85
- **Python classes:** 1 (`Handler`)
- **JavaScript functions:** 279
- **stdlib imports:** 20 (no third-party dependencies)
- **Changelog entries:** 162 versions (v0.1 through v0.15.4)
- **try/except blocks:** 128 (106 are bare `except Exception`)

---

## 2. All API Endpoints

### GET Endpoints (defined in `do_GET`, line 11810)

| # | Method | Path | Description | Line |
|---|--------|------|-------------|------|
| 1 | GET | `/login` | Serve login page HTML | 11814 |
| 2 | GET | `/` | Serve main SPA (auth required) | 11817 |
| 3 | GET | `/api/me` | Current user profile + avatar status | 11822 |
| 4 | GET | `/api/avatar` | Serve user avatar image file | 11838 |
| 5 | GET | `/api/roots` | List available root mount labels | 11856 |
| 6 | GET | `/api/nodes` | List all configured nodes with mounts | 11862 |
| 7 | GET | `/api/locations` | Flat list of locations (compat shim) | 11880 |
| 8 | GET | `/api/tailscale/status` | Tailscale network status JSON | 11900 |
| 9 | GET | `/api/tailscale/peers` | Tailscale peer list | 11900 |
| 10 | GET | `/api/agents` | List registered agents with usage | 11960 |
| 11 | GET | `/api/config/summary` | Server config summary (hostname, IP, etc.) | 11971 |
| 12 | GET | `/api/config/export` | Full config export (sanitized) | 12011 |
| 13 | GET | `/api/reload` | Reload config from disk | 12029 |
| 14 | GET | `/api/preferences` | Get user preferences | 12036 |
| 15 | GET | `/api/list` | Directory listing (root + rel path) | 12040 |
| 16 | GET | `/api/diskinfo` | Disk usage stats for a root | 12050 |
| 17 | GET | `/api/search` | Full-text file name search | 12059 |
| 18 | GET | `/download` | Download a file | 12068 |
| 19 | GET | `/runtime/recover` | Recover checkpoint state | 12090 |
| 20 | GET | `/memory/fetch` | Read a memory file by porter:// URI | 12134 |
| 21 | GET | `/agent-usage/current` | Current agent usage snapshots | 12160 |
| 22 | GET | `/api/tasks` | Task list (legacy checkpoint-based) | 12200 |
| 23 | GET | `/api/agent-fleet` | Fleet lifecycle config | 12260 |
| 24 | GET | `/api/agent/bootstrap` | Agent install script | 12274 |
| 25 | GET | `/api/audit` | Audit log (last 200 entries) | 12299 |
| 26 | GET | `/api/pep/nodes` | PEP node registry with online status | 12324 |
| 27 | GET | `/pep/v1/fs/{node}/...` | PEP filesystem proxy (list/read/stat) | 12349 |
| 28 | GET | `/api/policy/presets` | Routing policy presets | 12446 |
| 29 | GET | `/api/overview` | Dashboard overview data | 12453 |
| 30 | GET | `/api/schedules` | List scheduled jobs | 12494 |
| 31 | GET | `/api/schedule-runs` | Schedule run history | 12508 |
| 32 | GET | `/api/projects` | Project list with tasks | 12522 |
| 33 | GET | `/api/projects/{id}/files` | Project file chain (6 canonical files) | 12542 |
| 34 | GET | `/api/task-registry` | Task registry (all or by ID) | 12552 |
| 35 | GET | `/api/projects-dashboard` | Aggregated project dashboard data | 12584 |
| 36 | GET | `/api/integrations` | OpenClaw integrations summary | 12590 |
| 37 | GET | `/api/openclaw/skills` | List OpenClaw skills | 12597 |
| 38 | GET | `/api/openclaw/cron` | OpenClaw cron jobs | 12603 |
| 39 | GET | `/api/openclaw/sessions` | OpenClaw session summaries | 12609 |
| 40 | GET | `/api/sessions` | All session summaries (Claude + OC) | 12615 |
| 41 | GET | `/api/memory/overview` | Memory health overview | 12625 |
| 42 | GET | `/api/memory/read` | Read a memory file by path | 12631 |
| 43 | GET | `/api/local-models` | Detect local Ollama models | 12643 |
| 44 | GET | `/api/capabilities` | System capability check results | 12649 |
| 45 | GET | `/api/ai-providers` | AI provider status | 12658 |
| 46 | GET | `/api/tools` | Tool registry list | 12666 |
| 47 | GET | `/metrics` | Prometheus-format PEP metrics | 12674 |

### POST Endpoints (defined in `do_POST`, line 12686)

| # | Method | Path | Description | Line |
|---|--------|------|-------------|------|
| 48 | POST | `/login` | Authenticate and set session cookie | 12689 |
| 49 | POST | `/logout` | Destroy session, clear cookie | 12712 |
| 50 | POST | `/api/tailscale/control` | Tailscale connect/disconnect (disabled) | 12728 |
| 51 | POST | `/api/ssh/probe` | SSH connectivity probe to remote node | 12735 |
| 52 | POST | `/api/agent-fleet` | Update fleet config | 12781 |
| 53 | POST | `/api/agent-workspace/read` | Read file from agent workspace | 12832 |
| 54 | POST | `/api/agent-workspace/write` | Write file to agent workspace | 12927 |
| 55 | POST | `/api/profile/update` | Update user profile fields | 13015 |
| 56 | POST | `/api/password/change` | Change user password | 13029 |
| 57 | POST | `/api/avatar/upload` | Upload avatar image | 13047 |
| 58 | POST | `/upload` | Upload file to a location | 13066 |
| 59 | POST | `/api/delete` | Delete a file or folder | 13088 |
| 60 | POST | `/api/rename` | Rename a file or folder | 13106 |
| 61 | POST | `/api/mkdir` | Create a directory | 13127 |
| 62 | POST | `/api/move` | Move a file or folder | 13147 |
| 63 | POST | `/api/copy` | Copy a file or folder | 13172 |
| 64 | POST | `/api/write` | Write/save text content to file | 13207 |
| 65 | POST | `/api/zip` | Create ZIP of selected items | 13223 |
| 66 | POST | `/runtime/checkpoint` | Write checkpoint step | 13253 |
| 67 | POST | `/runtime/heartbeat` | Agent heartbeat with lease | 13303 |
| 68 | POST | `/runtime/finalize` | Finalize a task (atomic promotion) | 13340 |
| 69 | POST | `/memory/search` | Search memory files with scoring | 13382 |
| 70 | POST | `/memory/upsert` | Write memory file by porter:// URI | 13465 |
| 71 | POST | `/memory/pointer` | Create/update a structured pointer | 13486 |
| 72 | POST | `/api/nodes` | Create/update/delete nodes & mounts | 13542 |
| 73 | POST | `/api/locations` | Create/update locations (compat shim) | 13659 |
| 74 | POST | `/api/locations/test` | Test if a path exists and is readable | 13705 |
| 75 | POST | `/agent-usage/snapshot` | Submit manual usage snapshot | 13720 |
| 76 | POST | `/agent-usage/refresh` | Auto-refresh agent usage from API | 13746 |
| 77 | POST | `/agent-usage/auto-refresh` | Batch auto-refresh all agents | 13767 |
| 78 | POST | `/agent-usage/parse` | Parse raw CLI output for usage % | 13795 |
| 79 | POST | `/api/agents` | Create/revoke/rotate agents | 13859 |
| 80 | POST | `/api/agents/rotate-key` | Rotate agent API key | 13967 |
| 81 | POST | `/api/reload` | Server-side config reload | 13982 |
| 82 | POST | `/api/openclaw/skills` | Create/remove skills | 13989 |
| 83 | POST | `/api/openclaw/sessions/flush` | Flush OpenClaw session to memory | 14051 |
| 84 | POST | `/api/memory/flush` | Generic session flush to long-term memory | 14063 |
| 85 | POST | `/api/memory/write` | Write to a memory file by path | 14081 |
| 86 | POST | `/api/prompt` | Send prompt to AI model (Ollama/OC) | 14095 |
| 87 | POST | `/api/preferences` | Save user preferences | 14135 |
| 88 | POST | `/api/permissions/check` | Check agent permission for a capability | 14152 |
| 89 | POST | `/api/tasks` | Create/update/clear tasks | 14175 |
| 90 | POST | `/api/schedules` | CRUD for scheduled jobs | 14277 |
| 91 | POST | `/api/projects` | Create/update/delete/rename projects | 14317 |
| 92 | POST | `/api/task-registry` | Task registry CRUD (create/update/rebuild/delete) | 14415 |
| 93 | POST | `/api/projects-dashboard` | Update project dashboard data | 14603 |
| 94 | POST | `/api/checkpoint` | Update checkpoint file status | 14631 |
| 95 | POST | `/api/tools` | Create/update/delete tools | 14664 |
| 96 | POST | `/api/pep/gen-token` | Generate PEP registration token | 14708 |
| 97 | POST | `/pep/v1/agent/register` | PEP agent self-registration | 14737 |
| 98 | POST | `/pep/v1/agent/heartbeat` | PEP agent heartbeat | 14810 |
| 99 | POST | `/pep/v1/fs/{node}/...` | PEP filesystem proxy (write/mkdir/delete) | 14827 |

**Total: 99 endpoints** (47 GET + 52 POST)

---

## 3. All UI Tabs / Modules

### Main Navigation (sidebar)

| # | Tab ID | Display Name | Features | Status |
|---|--------|-------------|----------|--------|
| 1 | `overview` | **Command Center** | Dashboard placeholder, metrics placeholder | Placeholder — "coming soon" message |
| 2 | `agents` | **Orchestration** | Agent→Porter→Model flow diagram, connected agents grid, model cards, agent workspace editor, config slide-out panel | Working well, visual + functional |
| 3 | `memory` | **Memory** | Three-layer memory view (Instructions→Persistent→Sessions), health bar, session flush, memory file viewer/editor, model filter tabs | Working well (v4 design) |
| 4 | `capabilities` | **Extensions** | Integrations (OpenClaw gateway, auth profiles), Tools (binary detection: Puppeteer, D2, ffmpeg, etc.) | Working, read-only display |
| 5 | `projects` | **Projects** | Project cards with task registry, sprint progress, file chains, metrics aggregation, context menu, config panel | Working well, full CRUD |
| 6 | `workflows` | **Workflows** | Skills browser (50+ OpenClaw skills), searchable card grid, create/remove skills, Automations/cron viewer | Working, CRUD for skills |
| 7 | `locations` | **Locations** | Device cards (local, VPS, Tailscale), mount management, Tailscale peer discovery, PEP status badges, circuit breaker display | Working well |
| 8 | `files` | **Files** | Full file browser, upload, download, preview, edit, rename, delete, copy, move, ZIP, search, breadcrumb nav, drag-drop | Core feature, working well |
| 9 | `policies` | **Policies** | Routing strategy presets, orchestration controls (compression, fallback chain, TTL) | Hidden (`display:none`) |
| 10 | `tools` | **Tools** | Tool registry, tool selection policy (auto/guided/manual), token budgets | Hidden (`display:none`) |
| 11 | `audit` | **Activity** | Operational audit timeline | Hidden (`display:none`) |

### Settings Panel Tabs

| # | Tab ID | Display Name | Features | Status |
|---|--------|-------------|----------|--------|
| 12 | `profile` | **Profile** | Name, email, timezone, avatar upload | Working |
| 13 | `password` | **Password** | Owner-mode password change | Working |
| 14 | `billing` | **Billing** | Stripe placeholder | Placeholder — "coming soon" |
| 15 | `changelog` | **Release Notes** | 162-entry changelog viewer | Working |

### Sub-panels (not tabs but important UI surfaces)

| # | Element | Description | Status |
|---|---------|-------------|--------|
| 16 | Agent Workspace | 3-pane config file editor for connected agents | Working |
| 17 | Config Panel | Slide-out panel for agent/project configuration | Working |
| 18 | Preview Panel | File preview with text editor | Working |
| 19 | Onboarding Wizard | 4-step first-run setup (Location→Agent→Complete) | Working |
| 20 | Tasks module | Task registry with create/filter/status management | Working |

---

## 4. Feature Inventory — What Porter Can DO Today

### File Management
- Browse directories across multiple mounted locations
- Upload files (single and batch, with progress bar)
- Download files (individual and ZIP bundles)
- Create folders
- Rename files and folders
- Delete files and folders (single and bulk)
- Copy files and folders
- Move files and folders (with folder picker)
- Preview: text files (with inline editor), images, PDFs
- Full-text file name search across entire mount
- Disk usage display per mount
- Read-only badge on non-writable paths
- Drag-and-drop upload
- Keyboard shortcuts (/, r, n, u, Backspace, Esc, ?, Delete)
- Sort by name, size, modified date
- Show/hide hidden files toggle

### AI Orchestration
- Agent registration with API keys (CRUD)
- Role-based access control (viewer/writer/operator/admin)
- Agent connectivity testing (HTTP roundtrip, latency measurement)
- Agent key rotation and revocation
- Orchestration flow visualization (Agents→Porter→Models)
- Agent workspace file browser and editor
- AI prompt relay (Ollama and OpenClaw)
- Agent fleet lifecycle management (version, channel, rollout)
- Policy presets for model routing (balanced/cost-first/quality-first/speed-first/local-first)
- Agent usage tracking and reporting (manual + auto-refresh)
- Claude Code usage percentage parsing from CLI output
- OpenClaw usage tracking via gateway API

### Memory Management
- Three-layer memory visualization (Instructions → Persistent → Sessions)
- Memory health bar with per-model breakdown
- Session flush to long-term memory (Claude + OpenClaw)
- Memory file viewer and inline editor
- Memory search with tag filtering and scoring
- Porter URI system (porter:// URIs for file addressing)
- Structured pointer system (JSON with confidence, tags, timestamps)
- Per-project memory isolation paths

### Project Management
- Project CRUD (create, rename, delete, configure)
- Active project designation
- Task registry (create, update, rebuild, delete tasks)
- Sprint progress tracking with completion bars
- Project file chain viewer (6 canonical files with status)
- Task metrics (tokens used, time spent)
- Project metrics aggregation from task registry
- Task status workflow (pending→in_progress→done, plus cancelled)
- Project type system (manual vs autonomous)

### Runtime / Agent Coordination
- Checkpoint system (write-ahead log per task)
- Heartbeat leasing (configurable TTL)
- Task recovery with resumable state
- Atomic finalization (os.replace promotion)
- PEP/1 (Porter Endpoint Protocol) for multi-node filesystem access
- PEP agent registration with temporary tokens
- PEP filesystem proxy (list, read, stat, write, mkdir, delete)
- Circuit breaker for unreliable remote nodes
- Prometheus-format metrics endpoint
- Idempotency key caching (24h TTL)
- Audit logging (JSONL format)

### Workflow / Automation
- OpenClaw skill browser (50+ skills)
- Skill filtering and search
- Manual skill creation (name, description, emoji)
- Skill removal
- Cron job viewer (OpenClaw jobs.json)
- Schedule CRUD with cron expression support
- Background scheduler daemon (60s tick interval)
- Schedule run history and persistence

### Network / Multi-Node
- Local node management
- VPS/remote node management
- Tailscale integration (status, peer discovery, IP display)
- SSH probe for remote connectivity testing
- PEP remote filesystem access with proxy
- Multi-node device cards with online/offline/relay status

### Session / Auth
- Cookie-based session auth (HttpOnly, SameSite=Strict)
- Bearer token auth for API clients
- 30-day session TTL
- Default credentials (admin/porter) with first-run warning
- Password change
- Single-user model (no multi-user yet)

### Configuration
- JSON config file (porter_config.json)
- Environment variable driven (PORTER_DATA_DIR, PORTER_PORT, etc.)
- Config export
- Hot reload from disk
- Onboarding wizard (4-step first-run setup)
- User preferences (theme, density, sort, hidden files, etc.)
- Capability auto-detection at startup (binaries, services)

---

## 5. Technical Debt

### 5.1 Hardcoded Values (Current Status: CLEAN)
The Sprint 9 hardcoding elimination was thorough. Only one instance of `/home/lobster` remains — in a changelog text string (line 4994), which is informational, not operational.

All operational paths derive from:
- `PORTER_DATA_DIR` env var (fallback: `~/.porter/`)
- `PORTER_PORT` env var (fallback: 8877)
- `PORTER_HOST` env var (fallback: auto-detect)
- `PORTER_CONFIG` env var
- `PORTER_AGENT_WORKSPACE` env var (fallback: `~/.openclaw/workspace`)
- `PORTER_OPENCLAW_STATE` env var (fallback: `~/.openclaw`)
- `PORTER_PUBLIC_IP` env var (fallback: external lookup)

### 5.2 Error Handling
- **106 bare `except Exception` blocks** — most swallow errors silently. Many should catch specific exceptions or at least log the error.
- **5 bare `except:` blocks** — even worse, catches SystemExit and KeyboardInterrupt.
- The scheduler loop (`_scheduler_loop`) silently swallows all exceptions.
- PEP proxy errors are logged via metrics but not surfaced to any error log file.

### 5.3 Performance Concerns
- **735 KB served to every browser client.** The entire SPA (CSS + HTML + JS + changelog with 162 entries) is delivered as a single response on every page load.
  - The changelog alone is ~969 lines / ~50 KB of JavaScript.
  - No gzip compression (stdlib HTTPServer does not compress).
  - No caching headers — `Cache-Control: no-store` on everything.
  - No asset fingerprinting or split bundles.
- **`walk_search` does a full `os.walk`** of the entire mount, capped at 200 results. Large mounts will be slow.
- **Single-threaded HTTP server** via `HTTPServer` (not `ThreadingHTTPServer`). Long-running requests (PEP proxy, AI prompt relay, usage refresh) block all other requests.
  - UPDATE: `HTTPServer` is used at line 14977. This is NOT `ThreadingHTTPServer`, meaning one slow request blocks everyone.
- **No connection pooling** for PEP proxy, Ollama, or OpenClaw requests — each creates a new urllib connection.
- **In-memory session store** — all sessions lost on restart.
- **In-memory task registry** — loaded from disk at startup, but race conditions possible under concurrent writes (uses `_treg_lock` threading lock, which is good).

### 5.4 Security Gaps
- **No login rate limiting.** Brute-force password attacks are unrestricted. No lockout, no delay, no CAPTCHA.
- **No CSRF protection.** No CSRF tokens on POST forms. The `SameSite=Strict` cookie mitigates cross-origin attacks but not same-site attacks.
- **No Content-Security-Policy header.** Inline scripts and styles are used extensively — CSP would need to be permissive, but it should still exist.
- **No X-Frame-Options / X-Content-Type-Options headers.** Clickjacking and MIME-sniffing attacks possible.
- **`Access-Control-Allow-Origin: *`** on all JSON responses (line 11738). This allows any website to make authenticated cross-origin requests if cookies leak.
- **Default password `porter`** on first run. While warned in console, there is no forced password change.
- **SHA-256 password hashing** with a single salt. No bcrypt/scrypt/argon2. Fast to brute-force.
- **Sessions are in-memory only.** Server restart logs out all users, and sessions are not cryptographically bound to the client.
- **Agent keys stored as SHA-256 hashes.** Better than plaintext but not ideal — should use bcrypt.
- **No TLS.** Relies entirely on SSH tunnel for encryption. The server itself runs plain HTTP.
- **Multipart parsing** uses the `email` stdlib module — generally safe but not designed for untrusted uploads. No file size limits enforced at the HTTP level.
- **No path traversal protection on PEP filesystem proxy** beyond `_pep_safe_resolve` — which does check `relative_to`, but edge cases with symlinks are not tested.

### 5.5 Features: UI-Only (No Real Backend)
- **Command Center (overview-module):** Shows "Dashboard coming soon" placeholder. Backend `/api/overview` exists but returns minimal data.
- **Billing tab:** Pure placeholder ("Stripe integration placeholder").
- **Tool Selection Policy:** UI for mode/strategy/budgets exists, but no backend enforcement. The policy is saved to config but never consulted during prompt relay.
- **Orchestration Controls:** Context compression, fallback chain, checkpoint interval, lease TTL — saved to config but not enforced by the prompt relay.
- **Policy Presets:** Routing strategy presets are displayed and selectable, but the `/api/prompt` endpoint does not implement model routing based on them.

### 5.6 Features: Backend-Only (No UI)
- **`/metrics`** — Prometheus-format metrics are exposed but no UI dashboard exists to display them.
- **`/api/config/export`** — Config export endpoint exists but no UI download button.
- **Idempotency keys** — The PEP system supports idempotency, but the UI never sends idempotency keys.
- **`/memory/pointer`** — Structured pointer API exists but no UI for managing pointers.
- **`/api/permissions/check`** — Permission check endpoint exists, no UI surface.
- **Schedule run history** — `/api/schedule-runs` backend exists, partially rendered in Automations section.

### 5.7 Architecture Concerns
- **Single-file monolith.** 15K lines in one file with CSS, HTML, JS, and Python. Editing requires caution — the Edit tool fails on files this large.
- **No test framework.** While there are 32 Playwright E2E tests, there are zero unit tests for backend Python logic.
- **Global mutable state everywhere.** `_config`, `_sessions`, `SERVE_DIRS`, `_treg`, `_pep_cb`, `_pep_metrics`, `_capabilities_cache` — all module-level mutable globals.
- **Re-imports inside functions.** At least 40 import statements inside function bodies (e.g., `import urllib.request`, `from datetime import datetime`). These are already imported at the top of the file.
- **No logging framework.** All output goes to `print()`. No log levels, no structured logging, no log rotation.
- **Synchronous HTTP handler.** All network calls (PEP proxy, Ollama, OpenClaw, IP lookup) block the single handler thread.

---

## 6. What's Missing for Alpha

### 6.1 Infrastructure Gaps
| Gap | Impact | Difficulty |
|-----|--------|-----------|
| **No WebSocket / SSE** | No real-time updates. Clients must poll. Task progress, agent status, file changes — all require manual refresh. | Medium |
| **No multi-user support** | Single user only. No user accounts, no user isolation, no per-user permissions. | High |
| **No proper auth** | Cookie-based single-user. No OAuth, no SSO, no 2FA, no API key scoping beyond role. | Medium |
| **No TLS** | Plain HTTP. Relies entirely on SSH tunnel. Cannot be directly exposed to internet. | Low (reverse proxy) |
| **No gzip/compression** | 735 KB uncompressed on every page load. Major issue on slow connections. | Low |
| **Single-threaded** | One slow request blocks all others. No concurrent request handling. | Low (use ThreadingHTTPServer) |
| **No database** | All state in JSON files and in-memory dicts. No transactions, no queries, no indexing. | High |
| **No file size limits** | Uploads have no enforced size cap at HTTP level. | Low |
| **No background task queue** | Scheduler runs inline. AI prompts block. No async job processing. | Medium |

### 6.2 UX Gaps
| Gap | Impact |
|-----|--------|
| **No help system** | No contextual help, no documentation, no tooltips beyond title attributes. |
| **No chat interface** | AI prompt relay exists in backend but no chat UI. The `/api/prompt` endpoint has no frontend consumer. |
| **No mobile responsiveness** | Only 4 `@media` queries, all for grid column adjustments. No mobile layout, no touch gestures, no responsive sidebar. |
| **No proper error pages** | 404 returns `<h1>Not found</h1>`. No styled error pages. |
| **No admin panel** | No server health dashboard, no log viewer, no debug tools. |
| **No loading states** | Most data loads show "Loading..." text. No skeleton screens, no progress indicators for long operations. |
| **No offline support** | No service worker, no cache manifest. Requires constant server connection. |
| **No undo/redo** | File operations (delete, rename, move) are permanent. No trash/recycle bin. |
| **No file versioning** | No git integration, no diff viewer, no version history. |
| **No drag-and-drop reorder** | Can't drag files between folders in the UI (only drag-to-upload works). |
| **No notifications** | No system for alerting the user about completed tasks, agent issues, or schedule results. |
| **No i18n** | English only. No internationalization framework. |

### 6.3 Feature Completeness Gaps
| Gap | Notes |
|-----|-------|
| **Command Center is empty** | The "dashboard" tab shows only a placeholder. No system health, no activity feed, no quick actions. |
| **Billing is empty** | Stripe placeholder only. No payment, no subscription, no usage metering. |
| **Model routing not implemented** | Policy presets exist in UI but `/api/prompt` does not consult them. |
| **No automation builder** | Cron viewer exists but no visual workflow builder for composing skills. |
| **No session memory flush pipeline** | Per MEMORY.md, the flush pipeline from short-term to long-term memory is incomplete for non-Claude models. |
| **Local model detection incomplete** | Ollama detection works, but no detection for llama.cpp, vLLM, or other local runners. |
| **No GitHub integration** | Listed as "coming soon" in the location wizard. No repo browsing, no PR viewer. |
| **No SSH file browsing** | SSH probe exists but no actual remote file browsing over SSH. PEP handles remote access instead. |
| **PEP agent installer not built** | `/api/agent/bootstrap` returns a script but no actual agent binary or installer package. |
| **No file sharing / public links** | No way to share a file with a public URL. |
| **No file type handlers** | Preview supports text/images/PDF only. No markdown rendering, no code highlighting, no spreadsheet view. |

### 6.4 Reliability Gaps
| Gap | Notes |
|-----|-------|
| **No health check endpoint** | No `/healthz` or `/readyz` for monitoring systems. |
| **No graceful shutdown** | `KeyboardInterrupt` is caught but in-flight requests may be dropped. |
| **No crash recovery** | In-memory sessions and metrics lost on restart. |
| **No backup system** | Config file has no automatic backup before writes. |
| **No migration system** | Config migration is ad-hoc in `load_config()`. No versioned migration framework. |
| **No cleanup/GC** | Expired sessions, old idempotency keys, and stale PEP tokens accumulate without cleanup. |

---

## Appendix: File Structure Summary

```
Line     1–    28: Imports, PORT, HOST, AGENT_INSTALL_URL
Line    30–   115: Data dir, public IP, SERVE_DIRS, defaults, capabilities registry
Line   119–   269: Capability checks (binary, HTTP, npx, OpenClaw)
Line   271–   350: Checkpoint → task registry migration
Line   352–   490: Time helpers, projects.md parser, sprint plan parser
Line   491–   575: Project scaffolding, memory resolution, file chain
Line   576–   700: Integrations loader, hardcoding validator
Line   701–   815: Agent ping, connectivity test
Line   816–   968: OpenClaw skill/cron loaders
Line   969–  1053: Local model detection (Ollama)
Line  1054–  1323: Session summary loaders (OpenClaw, Claude)
Line  1325–  1559: Memory path validation, session flush pipeline
Line  1560–  1685: Config/task reload, task registry load/save, project dashboard
Line  1686–  1862: Cron engine, scheduler
Line  1864–  1997: PEP/1 helpers, circuit breaker, metrics, idempotency
Line  1999–  2004: Role capabilities matrix
Line  2008–  2110: Config load/save, serve dirs population
Line  2117–  2283: Usage refresh (Claude, OpenClaw)
Line  2286–  2460: Agent/PEP key hashing, agent lookup, PEP helpers
Line  2460–  2527: Porter URI system, runtime dirs, audit logging
Line  2528–  2660: File operations (safe_resolve, list_dir, walk_search, disk_info)
Line  2662–  2813: LOGIN_PAGE HTML string
Line  2817– 3892: PAGE — CSS section
Line  3894– 4909: PAGE — HTML body (sidebar, modules, settings, overlays, wizard)
Line  4910–11620: PAGE — JavaScript (helpers, state, upload, settings, modules, file browser, wizard)
Line 11622–11724: PAGE — Onboarding wizard HTML + closing tags
Line 11728–14963: Handler class (do_GET, do_POST — all 99 endpoints)
Line 14967–14989: Server startup (__main__)
```
