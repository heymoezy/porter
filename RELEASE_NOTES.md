# Porter Release Notes

## v0.14.16 (2026-02-28)

**Orchestration tab + Locations cards + Files polish**

- **Orchestration tab:** Agents tab renamed and rebuilt as a visual flow diagram — Connected Agents → Porter Hub → Models. Full-width SVG connectors with arrows aligned to each card column.
- **Agent cards:** Green status dots, model inference from agent type, live data (usage bars, status, last seen, provider service badges). Config slide-out panel with role, connection info, API key, concurrency, config files.
- **Porter hub:** Feature pills showing active capabilities (Prompt cleanup, Model routing, Task dispatch) and upcoming sprint features (Shared memory, Task registry, Scheduler).
- **Locations tab:** Converted from table grid to card-based layout. Pencil icon for nickname editing, removed delete buttons (devices come/go with Tailscale). Removed redundant Tailscale connectivity accordion.
- **Files tab:** Delete button restored on home view entries with smooth fade-out animation. Rounded corners on device headers, mount entries, and file entries.
- **Config files fix:** CLAUDE.md path validation fixed — files in the explicit allow-list no longer rejected.
- **Extensions:** Ollama moved back (runtime tool). All tabs get standardized intro sentences.

---

## v0.14.15 (2026-02-28)

**Agents tab redesign + Extensions cleanup**

- **Single scrollable Agents view:** Removed Fleet/Jobs/Models sub-tabs. Agents tab is now a single page with two sections: AI Infrastructure and Registered Agents.
- **AI Infrastructure section:** Compact 2-col grid showing Ollama, OpenClaw, and Gemini CLI with live status dots, version/endpoint info, feature list, and reverse-mapping ("Used by: agent_name").
- **Model attribution block:** Each agent card now shows a structured MODEL / via / infrastructure badge block linking agent → model → provider.
- **Dead UI removed:** Create Agent form, Fleet Lifecycle Policy UI, Jobs placeholder, and Models sub-tab all removed. Backend agent CRUD, fleet endpoint, and workspace overlay untouched.
- **Extensions cleanup:** AI providers (Ollama, OpenClaw, Gemini CLI) moved to Agents tab. wkhtmltopdf and FFmpeg removed (not installed). Playwright added (v1.58.2 — browser automation, E2E testing). Final list: Node.js, Puppeteer, Playwright, D2, Git.
- **New `/api/ai-providers` endpoint:** Returns AI provider check results. `/api/capabilities` now returns non-AI tools only.
- **Dead JS removed:** `switchAgentTab`, `loadAgentJobs`, `loadAgentModels`, `openCreateAgent` (module), `createAgent2`, `copyAgentKey2`, `loadAgentFleet`, `saveAgentFleetPolicy`, `renderOperatorConfigSummary`, `loadOperatorConfig`.

---

## v0.14.14 (2026-02-28)

**Files home view + header alignment**

- **Auto-expand first mount:** Files tab now opens with the first mount (Documents) already expanded, showing contents inline with breadcrumb ("Files > Documents") and toolbar buttons (New folder, Upload). No more blank collapsed view.
- **Removed column header from home view:** The NAME/SIZE/MODIFIED list-header no longer appears in the home view — the fhome-entry grid handles its own layout with size and date columns.
- **Search input removed:** Removed non-functional search input from Files toolbar. Null-safe guards added to `navigate()`, `openSearch()`, and `clearSearch()` for the removed elements.
- **Footer isolation:** `file-results-footer` (disk space bar) now properly hidden when switching away from Files tab — no longer leaks into Extensions or other tabs.
- **Header height consistency:** All module headers use `min-height:46px` for uniform height across all tabs.

---

## v0.14.13 (2026-02-28)

**UI consistency pass + Playwright QA infrastructure**

- **Header underline on all tabs:** Every module header (`Command Center`, `Agents`, `Projects`, `Locations`, `Extensions`) now has a `border-bottom` matching the Files toolbar line. Consistent visual structure across the entire app.
- **Files tab cleanup:** Merged title into toolbar (removed extra div), restored content buffer below header line, hidden stale list-header on home view, fixed searchCountBar rendering as empty bar.
- **Search input fix:** No longer wiped on every keystroke when no directory is loaded.
- **Startup message:** Console output now shows correct version (was stuck at v0.14.4).
- **Playwright test suite:** 32 automated regression tests covering auth, tab headers, spurious element visibility, search interaction, CSS consistency (padding, backgrounds, variables), Projects structure, Locations labels, tab switching, and screenshot baselines. Run with `cd tests && npx playwright test`.

---

## v0.14.4 (2026-02-27)

**Sprint 6 — Tranche G1d: Tasks folded into Projects accordion**

- **No separate Tasks nav item:** Removed. Tasks now live inside the Projects panel.
- **Projects accordion:** Project = directory row (expandable). Tasks = rows inside. Identical visual language to the Files tab — familiar at a glance.
- **Inline task rows per project:** Each expanded project shows its pending/active tasks with priority dot, title, status pill, and actions (Start, Done, Cancel, Delete).
- **Done count badge:** Collapsed done-task count shown on the project row without cluttering the view.
- **Inbox section:** Tasks with no project assigned surface in an Inbox at the bottom.
- **Legacy projects section:** Projects from `projects.md` (the old Sprint P1 system) appear with an "Add to registry" migration button.
- **`+ New project` button:** Replaces the old Refresh button in the Projects header. Opens a create-project modal.
- **Create task from project context:** `+ Task` button on each project row pre-fills the project field in the create modal.

---

## v0.14.3 (2026-02-27)

**Sprint 6 — Tranche G1c: Tasks UX redesign**

- **Row layout:** Tasks are now compact rows, not heavy cards. Scannable at a glance.
- **No tabs, no instruction text:** Single unified view. Project filter + status pills live in the header bar — the content area is just the list.
- **Sections:** Pending / Active / Done. Done is collapsed by default — click to expand. Doesn't pollute the view when the queue is healthy.
- **Actions always visible:** ▶ Start (pending), ✓ Done, × Cancel, 🗑 Delete. Right-aligned per row. No hover required.
- **Priority dots:** Urgent (red), High (orange), Normal (indigo), Low (grey) — no text label needed.
- **Project name stored on task:** Tasks are self-contained — project name is denormalized at create time so it displays correctly even if a project is later renamed.
- **Create modal redesigned:** Project is the second field (defaults to active project). Priority is a pill selector, not a dropdown. Enter key submits.
- **Removed legacy execution/lease monitor tab:** The `runtime/leases/` system was empty and never used. Gone.

---

## v0.14.2 (2026-02-27)

**Sprint 6 — Tranche G1: Porter task registry (backend + UI)**

- **Tasks nav item:** Tasks is now a first-class destination in the Porter sidebar.
- **Work Queue tab:** Persistent task registry backed by `runtime/task-registry/<id>.json`. Tasks survive Porter restarts and agent session boundaries — this is the source of truth, not session memory.
- **Task model:** `id`, `title`, `description`, `status` (pending → in_progress → complete / failed / cancelled), `priority` (urgent / high / normal / low), `project_id`, `tags[]`, `assigned_agent_id`, `created_by`, `created_at`, `updated_at`, `result`.
- **`GET /api/task-registry`:** List with filters: `status`, `project_id`, `assigned_to`, `tag`. Sorted by priority then age.
- **`GET /api/task-registry/<id>`:** Single task detail.
- **`POST /api/task-registry`:** Actions: `create`, `update_status`, `assign`, `complete`, `fail`, `cancel`, `add_result`, `claim`, `delete`.
- **UI:** Filter bar (All / Pending / In Progress / Done), project dropdown, priority colour dots, create task modal (title, description, priority, project, tags).
- **Execution tab:** Existing PEP/1 lease monitor retained as a separate tab.

---

## v0.14.1 (2026-02-27)

**Sprint 6 — Tranche G1a: Persistent task registry backend**

- `TASKS_REGISTRY_DIR`, `_treg` globals, `_treg_load()` / `_treg_save()` helpers.
- Full `GET` and `POST /api/task-registry` endpoints.

---

## v0.14.0 (2026-02-27)

**Sprint 5 — Tranche D1: Project scoping backend**

- **Project registry:** `porter_config.json` now tracks a `projects[]` array and `active_project_id`. Both are initialised on first load (idempotent).
- **Workspace scaffold:** `scaffold_project_dir(id, name)` creates `AGENT_WORKSPACE_DIR/projects/<id>/` containing `PROJECT.md`, `MEMORY.md`, and `settings.json`. Idempotent — safe to call repeatedly.
- **Memory resolver:** `resolve_project_memory(project_id, agent_id, filename)` walks the 3-layer scope stack — agent override → project → global workspace root — and returns `{path, content, source_layer}`. Returns `source_layer: None` if not found at any layer.
- **`GET /api/projects`:** Returns `{projects: [...], active_project_id}`. Each project entry includes `workspace_path` and `workspace_exists`.
- **`POST /api/projects`:** Actions: `create` (generates UUID, scaffolds workspace), `set_active` (sets or clears `active_project_id`), `delete` (removes from registry, clears active if matched), `resolve` (calls memory resolver, returns `{path, content, source_layer}`).

---

## v0.13.9 (2026-02-27)

**Files — device nickname respected in home view**

- Fixed: the Files home view was showing the raw hostname (`srv1379868`) for the local device even when a nickname had been set in Locations. Now uses the nickname (e.g. `VPS`) consistently.

---

## v0.13.8 (2026-02-27)

**Sprint 4 UI — Circuit breaker state visible in Files + Locations**

- When a remote node's PEP/1 circuit breaker opens (high error rate), an orange pulsing **⚡ degraded** badge appears on that node's row in both the Files home view and the Locations panel.
- Badge shows a tooltip: "High error rate — circuit open. Resets in ~Xs" with a live countdown.
- Badge disappears automatically when the circuit closes (60s cooldown). No noise when everything is healthy.
- `/api/pep/nodes` now includes per-node `circuit` object: `state`, `resets_in_s`, `reqs_1m`, `errs_1m`.

---

## v0.13.7 (2026-02-27)

**Sprint 4 — Tranche C2: Loop safeguards + audit provenance**

- **Hop counter:** PEP/1 proxy requests now carry `X-Hop-Count`; requests that have been forwarded more than 10 times are rejected with `HOP_LIMIT_EXCEEDED` (non-retryable). The counter is incremented and forwarded on every proxy hop.
- **Circuit breaker:** Per-agent circuit breaker tracks error rate over a 60s window. If ≥3 requests with >30% failure rate: circuit opens, subsequent requests return `CIRCUIT_OPEN` (retryable=true, 503). Auto-resets after 60s cooldown.
- **Audit provenance:** All PEP/1 audit entries now carry `session_id` (12-char SHA-256 prefix of the session token), `scope_source` (`pep_session` or `pep_agent`), and `chain_ref` (the request's correlation ID). `project_id` field reserved for Sprint 5.
- **Metrics endpoint:** `GET /metrics` returns PEP/1 operational metrics in Prometheus text format: `porter_pep_requests_total`, `porter_pep_errors_total`, `porter_pep_latency_seconds` (p50/p95/p99), and `porter_pep_circuit_state` per agent.

---

## v0.13.6 (2026-02-27)

**Files — clean mount row labels**

- Mount rows (documents, websites, uploads) now show only the label — the full system path (`/home/lobster/documents`) and the dead-space active-path column have been removed.
- Grid simplified from 4 columns to 3; layout is tighter and less noisy.

---

## v0.13.5 (2026-02-27)

**Files — inline accordion expand + startup flash fix**

- Clicking a mount (documents, websites, uploads) now expands it in place — files and folders appear as inline rows beneath the mount row without leaving the home view.
- Sub-folders expand further inline; breadcrumb shows the current depth (`Files › documents › porter`). Clicking `Files` in the breadcrumb collapses back to home.
- Files open the existing preview panel; no full-screen navigation required for browsing.
- Fixed: Porter no longer briefly shows the Files toolbar/listing on startup before the Command Center loads.

---

## v0.13.4 (2026-02-27)

**Files — unified listing view**

- No more secondary panel. Device tree and file browser share the same content pane.
- Opening Files shows your VPS as a collapsible group header (auto-expanded) with documents, uploads, and websites as folder rows beneath it — just like a familiar directory tree.
- Additional connected locations appear as further collapsible device groups below.
- Clicking a mount folder navigates into it; the breadcrumb gains a `Files` home link at the left.
- Clicking `Files` in the breadcrumb returns to the device tree view.
- Offline remote devices are dimmed; all show an online/relay/offline status indicator.

---

## v0.13.3 (2026-02-27)

**Files — collapsible device tree sidebar**

- VPS appears as the top-level node (auto-expanded on first open); remote Tailscale locations appear below, collapsed by default.
- Each mount (documents, websites, uploads) is a child entry under its device — click to browse, active mount highlighted in orange.
- Expand/collapse any device node by clicking its row. Online/offline status dot shown for remote nodes; offline nodes are dimmed.
- Tree updates active highlight as you navigate within a root.

---

## v0.13.2 (2026-02-27)

**Files location picker**

- Secondary nav replaced with a proper location picker rendered in the content area when no root is selected.
- Picker shows device name and each configured mount as a card. Clicking a card opens that location.
- Connected remote locations (Tailscale/PEP) appear in the picker only after they've been set up in Locations.
- Breadcrumb simplified: shows root label + path parts when inside a root; empty when at the picker screen.
- Toolbar New Folder / Upload buttons hidden on the picker screen, restored when browsing a root.

---

## v0.13.1 (2026-02-27)

**Projects dashboard + UI overhaul**

*Projects & task management:*
- **Projects nav item** added — live view of all projects, models, and tasks without touching the filesystem.
- Project cards show inline sprint backlog and active checkpoint tasks with task count badge.
- Task lifecycle actions (pause / complete / set next action) write back to `checkpoint.md` on disk.
- **Rename project** button — writes back to `projects.md` via `POST /api/projects-dashboard`.
- New `GET /api/projects-dashboard` and `POST /api/checkpoint` endpoints.

*Navigation & layout:*
- Agents moved to #2 slot in sidebar (directly below Command Center).
- Tasks nav item removed — agent jobs now live in Agents > Jobs sub-tab.
- Policies nav hidden until backend routing is implemented.
- Agent role labels: viewer → Observer, writer → Standard, operator → Trusted.
- Agents sub-tabs: Fleet / Jobs / Models. Model registry moved into Agents > Models.

*Command Center / Extensions:*
- Command Center replaced with a "coming soon" placeholder — live metrics deferred until platform is stable.
- Agent defaults config panel removed from Fleet tab (not yet functional).
- Capability cards now 2-column grid; version strings get a leading `v` when they start with a digit.
- `_cap_check_bin` now probes `~/.local/bin` and `~/.npm-global/bin` — fixes D2 detection.

*Files:*
- **Secondary nav panel removed.** Root switcher (documents / uploads / websites) now inline pills in the breadcrumb toolbar. Content area uses full width.
- **Escape key fixed** — no longer jumps to Files from other modules.

*Locations:*
- Tailscale connectivity section collapsed into a `<details>` element; location list promoted to top.

*Environment & PEP/1 (carried forward from previous pre-release work):*
- All hardcoded paths eliminated; `PORTER_DATA_DIR` env var drives all data paths (default: `~/.porter/`).
- Capability registry detects 9 tools at startup; `/api/capabilities` endpoint; Extensions module in UI.
- PEP/1 error envelope: all `/pep/v1/*` endpoints return `{ ok, code, message, retryable, correlation_id }`.
- Idempotency key support on PEP mutating ops (`register`, `write`, `mkdir`, `delete`), 24h TTL.

---

## v0.12.100 (2026-02-27)

**Tranche A2 — Schedules UI removed (trust-first)**

- Schedules nav item and module panel removed from the UI entirely.
- Rationale: no UI for unproven features. Schedules will be reintroduced in Sprint 8 (Tranche F) once end-to-end execution is validated and reliable.
- Backend scheduler daemon (execution engine, run history API) is retained in the codebase for Sprint 8.

---

## v0.12.99 (2026-02-27)

**Tranche A2 — Schedule execution engine (backend only)**

- Background daemon thread starts with the server and checks all enabled schedules every 60 seconds.
- HTTP-target schedules fire via POST webhook (10s timeout) with job metadata in the request body.
- Non-URL targets queue an internal task record (no shell execution — safe by design).
- Job state (`last_run_at`, `last_run_ok`, `run_count`) persisted back to `porter_config.json` after each run.
- Run history saved to `runtime/schedule_runs/<schedule_id>/<timestamp>.json`.
- New `/api/schedule-runs?schedule_id=<id>` endpoint returns run history.

---

## v0.12.98 (2026-02-27)

**Tranche A1 — Trust UI enforcement**

- Agent "Test" button renamed to "Connectivity check" — honestly reflects heartbeat/telemetry inference, not true hello↔ack roundtrip.
- Schedules module now shows a **PREVIEW** badge; description updated to clarify auto-trigger reliability is still being hardened.
- Memory sharing "Project-based sharing" option is now disabled with a v0.13 coming-soon note — project scoping is not yet live.
- Directory: archived old plan files (commercialisation.md, implementation-plan.md, old sprint plans, phase1 brief, portal.db).

---

## v0.12.97 (2026-02-26)

- Agent role badge replaced with an inline dropdown — change roles directly from the card (viewer / writer / operator / admin).
- Roles now have descriptive tooltips explaining each permission level.
- Added `set_role` backend action to `/api/agents` for immediate persistence.

---

## v0.12.96 (2026-02-26)

- openclaw/Codex agent cards now show auth token profile name and expiry countdown (from usage snapshot).
- Fixed openclaw usage parse: "X% left" format now correctly maps to consumed %, fixing inverted usage bar.
- Usage parse extended to extract "expires in Xd" → `auth_expires_at` and profile name from `openclaw models status` output.

---

## v0.12.95 (2026-02-26)

- Agent cards now display the configured model ID (e.g. `openai-codex/gpt-5.3-codex`).
- Gemini agent cards show static rate limit summary: 60 req/min · 1,000 req/day.

---

## v0.12.94 (2026-02-26)

- Agent Workspace file list is now agent-family aware: Claude/Gemini/OpenClaw each see relevant files only.
- Removed cross-family config noise so each agent type sees a clean, relevant file set.

---

## v0.12.93 (2026-02-26)

- PEP/1 Phase 1: Hub registers remote agents via one-time token (`POST /pep/v1/agent/register`).
- PEP/1 Phase 1: Heartbeat endpoint keeps agent online state current (`POST /pep/v1/agent/heartbeat`).
- PEP/1 Phase 1: Hub proxies fs.list/read/stat/write/mkdir/delete to remote agent over Tailscale.
- New `porter-agent.py` (stdlib-only) for remote machines — register, heartbeat, filesystem serve.
- Locations: Install PEP/1 Agent button generates one-time token and shows copyable install command.

---

## v0.12.92 (2026-02-26)

- Agent card action buttons redesigned into a clean 2×2 action grid.
- Reduced button size and improved spacing to remove visual clutter in card headers.

---

## v0.12.91 (2026-02-26)

- Agent Workspace now shows configuration files by selected agent family: Claude, Gemini, and OpenClaw/Codex each get relevant file sets.
- Removed cross-family config noise (e.g., Claude no longer shows OpenClaw core files by default).
- Updated scoped read/write allowlists to enforce agent-context relevance.

---

## v0.12.90 (2026-02-26)

- Improved Agent card actions layout: Configure/Test/Rotate key/Disconnect now render as a structured 2x2 action grid.
- Reduced visual clutter with tighter button sizing and cleaner alignment.

---

## v0.12.89 (2026-02-26)

- Fixed dropdown/input text clipping in Agents defaults controls by adjusting field sizing and typography.
- Added explicit "what is active now" impact text so users can see which defaults currently affect behavior.
- Clarified defaults behavior to reduce confusion while broader integrations are being rolled out.

---

## v0.12.88 (2026-02-26)

- Redesigned Agents defaults controls to a compact summary + **Edit defaults** disclosure pattern.
- Reduced top-panel footprint so Agent cards remain the primary focus.
- Added live defaults summary indicators (preset, capacity alert, external approval) for fast understanding.

---

## v0.12.87 (2026-02-26)

- Restored module title to **Agents**.
- Agent cards now display in a two-column layout and are sorted alphabetically by name.
- Global defaults panel compacted for a cleaner, less wasteful layout.

---

## v0.12.86 (2026-02-26)

- Agent Workspace controls panel now changes by selected file (purpose + editing guidance).
- Added markdown quality score (0-100) with visual bar for `.md` files only.
- Guidance panel updates live while switching files and editing markdown.

---

## v0.12.85 (2026-02-26)

- Fixed invalid-path errors when opening assistant-relevant external auth files (Claude/Qwen path validation).
- Left file navigation now highlights the currently open file for clear editing context.
- Added inline Find box in Agent Workspace header for quick text search within the current file.

---

## v0.12.84 (2026-02-26)

- Agent Workspace file navigator now shows files relevant to the selected assistant only (no cross-agent file spillover).
- Selected-assistant scoping applied to `state/agents/<agentId>/agent/auth-profiles.json` and `models.json`.
- Provider-specific external auth files now appear conditionally by assistant type (Codex/OpenClaw, Claude, Qwen) using documented path conventions.

---

## v0.12.83 (2026-02-26)

- Fixed Agent Workspace file navigation: selecting a file now reliably switches editor content.
- Added unsaved-change switch flow with explicit save-first/discard prompts.
- Expanded config coverage to include `credentials/oauth.json` and external `~/.codex/auth.json` when available.

---

## v0.12.82 (2026-02-26)

- Fixed Escape key in Assistants Configure mode: it now closes workspace and returns to Assistants list (no jump to Files).

---

## v0.12.81 (2026-02-26)

- Agent Workspace editor now fills vertical pane space to the bottom for full-screen style editing.
- Disabled right-side textarea resize to prevent layout breakage and horizontal drift.
- Center editor column constrained with responsive sizing for maximum usable editing area.

---

## v0.12.80 (2026-02-26)

- Agent Workspace: fixed file switching behavior and added unsaved-change prompt (save vs abandon flow).
- Agent Workspace: extended file navigator to include key OpenClaw JSON configs (`openclaw.json`, device/cron/identity JSON) and per-agent `auth-profiles.json` + `models.json` when present.
- Configure workspace now supports both markdown workspace files and major OpenClaw state/config files in one allowlisted editor.

---

## v0.12.79 (2026-02-26)

- Configure now expands to a full-pane Assistants workspace mode (dedicated right-side working area).
- Non-workspace controls are hidden while configuring to maximize editing focus and usable space.
- Closing workspace cleanly restores the normal Assistants panel.

---

## v0.12.78 (2026-02-26)

- Configure workspace now enters a cleaner dedicated mode by hiding global Assistants controls while editing.
- Closing workspace restores normal Assistants controls cleanly.
- Connectivity check modal text updated for transparency about current signal source vs upcoming true handshake test.

---

## v0.12.77 (2026-02-26)

- Fixed Configure flow: opening Configure now enters a dedicated Agent Workspace mode instead of appearing to do nothing.
- Workspace now hides assistant cards while active and restores them on Close.
- File navigator now auto-opens the first allowlisted file for immediate editing context.

---

## v0.12.76 (2026-02-26)

- Assistants: moved **Include internal/test assistants** toggle out of expandable card into a simple top-right inline control above cards.
- Cleanup: removed obsolete test agents from configuration (`Test Concurrency Agent`, `Conc Test Agent`, `Conc Test 2`).

---

## v0.12.75 (2026-02-26)

- Assistants: added per-card **Configure** action opening a full Agent Workspace panel.
- New Agent Workspace allows editing allowlisted config markdown files (`SOUL.md`, `USER.md`, `AGENTS.md`, `TOOLS.md`, `MEMORY.md`, `HEARTBEAT.md`, `memory/*.md`).
- Added authenticated workspace read/write APIs with path allowlisting.
- Added save auditing for workspace config writes and sensitive-file save confirmation flow.

---

## v0.12.74 (2026-02-26)

- Assistants: changed **Revoke** to **Disconnect** for clearer, friendlier UX language.
- Updated disconnect modal copy to reduce fear and explain reconnection path.
- Fixed rotate/disconnect modal handlers to execute properly.

---

## v0.12.73 (2026-02-26)

- Assistants: added per-card **Test** button to verify whether an assistant is actively connected.
- Added backend test action (`/api/agents` with `action=test_connection`) using recent heartbeat with usage-telemetry fallback.
- Test results are shown in a clear modal with connection state and last heartbeat timestamp when available.

---

## v0.12.72 (2026-02-26)

### Assistants Redesign
- Renamed Agents module to Assistants with a calmer, less technical presentation.
- Replaced default internal/test toggle row with disclosure-style "Show all assistants" control.
- Added masked-by-default API key rows with per-assistant eye toggle (show/hide) and copy action.
- Moved destructive actions to in-product modals for clearer, safer confirmations.
- Reduced technical clutter in default cards (advanced IDs/details now tucked behind disclosure).

### Trust + UX Improvements
- Maintained usage bars/risk states while simplifying on-card language for non-technical operators.
- Continued release governance discipline: version bump + changelog + release notes synced in one release.

---

## v0.12.71 (2026-02-26)

### UX + Operations
- Locations: added Devices header controls with mesh status, last-updated timestamp, and manual refresh action.
- Files: free-space/item context moved into a persistent bottom footer outside the scrollable file list.
- Agents: default view now prioritizes production agents and hides internal/test entries unless explicitly toggled.

### Usage + Guardrails
- Unified usage telemetry directly in each agent card.
- Added low-capacity progress bars, risk states, and per-card refresh action.
- Fixed usage null/0 handling and corrected remaining-capacity semantics.
- Added global + per-agent low-capacity warning thresholds that actively drive risk coloring.

### Operator Configuration
- Reworked technical controls into user-friendly language for setup/routing/memory/risk/approval.
- Added persistent operator preference controls in Agents module and save/refresh behavior via `/api/preferences`.

---

## v0.12.70 (2026-02-26)

- PEP/1 Phase 0 complete:
  - iPhone connect flow switched to client-first browser access guidance.
  - Non-iOS connect flow reframed to capability-first language.
  - SSH probe errors normalized into structured envelope (`code`, `message`, `retryable`).
  - Retry-aware SSH failure modal behavior.
  - Node connectivity state now tri-state (`online`, `relay`, `offline`).
  - 15s frontend request timeout enforcement to prevent hanging spinners.

---

## Notes
- These release notes are additive and intended for operator-facing tracking.
- For detailed historical entries, see in-app "What's new" changelog in `porter.py`.
