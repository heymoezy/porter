# Porter Release Notes

## v0.30.47 (2026-03-10)

- Agents now boot with a locked built-in `Porter` master orchestrator instead of exposing `Lobster` as the public boss persona.
- Porter is now `orchestrator-only`: he cannot be selected as a worker target, and his core prompt, skills, files, and config are no longer editable from the normal Agents UI.
- `Crypto Squad` is removed from the public team surface, while legacy internal dev personas are hidden from normal persona and squad listings.
- Worker and squad creation remain available, but the UI now frames them as Porter-managed workers rather than peer agents.

## v0.30.46 (2026-03-10)

- Models runtime tags now use clearer operator wording with hover tooltips instead of implementation-heavy labels like internal JSON/test-path jargon.
- Backend config modals are now schema-driven per runtime, so CLI-backed providers only show settings that Porter actually uses.
- OpenClaw model-control messaging is softer and more accurate: Porter-selected models are shown as advisory without exposing raw agent-pinning language.
- Models/runtime copy is now environment-scoped so the UI still makes sense for future hosted Porter and connector-based user runtimes.

## v0.30.45 (2026-03-10)

**Bridge V2 Scheduler And Unified Models Control Plane**

- Porter Bridge now enforces per-backend and per-model concurrency limits with queue admission and wait-time tracking, so parallel agent work stops stampeding the same backend lane
- Shared dispatches and Models connectivity tests now persist structured benchmark history, and routing uses that data plus live scheduler pressure to prefer faster, less-contended backends
- Models cards now show benchmark summaries, live queue pressure, and honest bridge-control semantics, including explicit notice when a backend does not honor exact model selection
- Chat streaming now uses the same bridge scheduler semantics as persona/orchestration dispatch, aligning Porter's model traffic under one control plane instead of split execution paths

---

## v0.30.25 (2026-03-09)

**Squad-Aware Orchestration Routing**

- Orchestration executor selection now applies squad `dispatch_policy` instead of treating squads as display-only metadata
- `leader_first`, `backend_specialist`, and `balanced` squad policies now influence which assigned persona gets the work inside a project lane
- This makes squad structure affect real autonomous routing instead of only enriching prompts after the route was already chosen

---

## v0.30.24 (2026-03-09)

**Project-Aware Watchdog Recovery**

- Watchdog reboot of stalled orchestration steps now reselects executors through the same project-aware selector instead of doing a blind backend swap
- Recovered steps now keep `project_id`, `task_id`, and any reassigned persona identity attached to the reboot event and Mission Control logging
- This keeps failure recovery inside the project lane so autonomous work does not lose squad/project context during a stall

---

## v0.30.23 (2026-03-09)

**Project-Aware Coordination Bridge**

- Coordination Bridge runs now inherit active project and task context automatically instead of behaving like generic prompt fanout
- Coordination prompts now get the same project brief, decision log, task state, recent activity, and Cortex memory injection used by project-aware persona dispatch
- `coordination:start`, `coordination:result`, and `coordination:complete` events plus API responses now carry `project_id` and `task_id`, keeping live bridge activity tied to the project lane

---

## v0.30.22 (2026-03-09)

**Project-Lane Orchestration**

- Orchestration executor selection now prefers personas assigned to the active project or task instead of choosing a generic backend first and hoping project context survives
- Project-backed orchestration steps now always carry project brief, decision log, task state, recent project activity, and Cortex context even when a step falls back to direct backend dispatch
- Failed orchestration steps now reassign through the same project-aware selector, so retries stay inside the project lane instead of degrading into generic backend swaps

---

## v0.30.19 (2026-03-09)

**Project-Aware Orchestration Context**

- Orchestration runs now inherit active project and task context, prefer personas assigned to the active project, and pass project/task identity through persona execution
- Runtime orchestration cards now show project/task chips so autonomous runs stay tied to Porter’s real project lane instead of floating as generic jobs
- This closes a core autonomy gap where the orchestration engine could execute outside project-aware dispatch and Cortex scoping

---

## v0.30.18 (2026-03-09)

**Capability-Scored Orchestration Engine**

- Porter now plans orchestration goals into executable DAG steps, scores each backend by capability fit, and dispatches steps to the best available model instead of relying on loose keyword routing
- Added persistent orchestration state with `orchestration_runs`, `orchestration_steps`, and `orchestration_events`, plus Runtime controls for creating runs, viewing progress, drilling into details, and cancelling active work
- Independent orchestration steps can execute in parallel, failed steps can be reassigned to a better backend, and the Runtime lane now shows both orchestration progress and coordination ledger state together

---

## v0.30.17 (2026-03-09)

**Live Coordination And Orchestration Panels**

- Runtime now includes live Coordination Bridge and Orchestration Engine panels showing active claims, conflict alerts, recent coordination results, and recent orchestration runs
- Filled in the missing orchestration UI functions and fixed the orchestration runs API query parsing so the new runtime lane is real instead of a dead shell
- This makes Porter Bridge orchestration inspectable from the operator view instead of relying on invisible background state

---

## v0.30.16 (2026-03-09)

**Live Coordination Visibility**

- Overview, Projects, Runtime, and orchestration surfaces now react to live `coordination:*` SSE events instead of ignoring bridge-native coordination work
- System tab now keeps its own runtime SSE refresh path and correctly refreshes against `system-module`, so workflow/runtime cards stay in the loop
- This closes a visibility gap where coordinated work could happen through Porter Bridge without updating the operator surfaces watching it

---

## v0.30.15 (2026-03-09)

**Parallel Bridge Coordination Runs**

- Coordination runs now fan out across selected backends in parallel through Porter Bridge instead of walking them one at a time
- Added `coordination:start`, `coordination:result`, and `coordination:complete` SSE events plus Mission Control entries so multi-model runs are visible live
- This makes the coordination runner behave like a real bridge orchestrator instead of a serialized loop

---

## v0.30.14 (2026-03-09)

**Coordination SSE Compatibility Fix**

- Restored an SSE compatibility wrapper for the new coordination ledger so claim, progress, handoff, and release events emit correctly through Porter’s shared event bus
- Fixes the live runtime `NameError` that was breaking coordination claims immediately after the ledger feature landed
- Keeps the newer coordination layer compatible with the existing event hub instead of introducing a second broadcast path

---

## v0.30.13 (2026-03-09)

**Event-Driven Overview Refresh**

- Overview persona and quest-log refresh now follow live cortex and bridge SSE events instead of depending on a blind 30-second loop
- Kept a lighter 60-second fallback refresh while Overview is active, with timer teardown when leaving the tab
- This reduces idle homepage churn while keeping agent and squad state visibly current during autonomous work

---

## v0.30.12 (2026-03-09)

**SSE Orchestration Hub Refresh**

- The orchestration hub now refreshes from live bridge SSE events instead of polling `/api/admin/delegations` and `/api/admin/health` every 15 seconds
- Kept a much lighter 60-second fallback refresh, and the hub tears down its poller and SSE subscription when leaving Agents
- This cuts repeat admin polling while keeping live routing and squad activity visible

---

## v0.30.11 (2026-03-09)

**Live Project Activity Refresh**

- Projects overview activity now refreshes from live bridge SSE events instead of staying stale until you reopen the project
- Added a light 30-second fallback refresh while the project overview is open, with teardown when leaving Projects
- This keeps autonomous project work visible in real time without reintroducing another tight polling loop

---

## v0.30.9 (2026-03-09)

**SSE Runtime Activity Refresh**

- Runtime gateway activity now refreshes from live bridge SSE events instead of a tight 5-second polling loop, cutting repeat load on the dispatch log path
- Kept a light 30-second fallback poll so the activity feed still self-heals if events are missed
- This preserves visible cross-gateway runtime activity while spending much less time polling for it

---

## v0.30.8 (2026-03-09)

**Faster Live Models Bootstrap**

- Models bootstrap and snapshot now use short server-side caches keyed by config and CLI fingerprints, so opening the tab no longer forces the same heavy runtime introspection every time
- Removed the dead browser-side Models snapshot/bootstrap reuse branch, keeping Models live-truth only while simplifying the client load path
- Runtime metadata now caches server-side for one minute and invalidates on config or binary changes, cutting repeated CLI help/version work without hiding upgrades behind stale browser state

---

## v0.30.7 (2026-03-09)

**Unified Project Activity Stream**

- Projects overview now shows a real recent activity stream merged from `trace_steps` and `agent_messages`, so project work is visible without tab-hopping
- Added a lightweight `/api/projects/<id>/activity` endpoint backed by live trace and dispatch data instead of synthetic summaries
- This makes autonomous project work legible while reusing the indexed data paths already added for speed

---

## v0.30.6 (2026-03-09)

**Backend Circuit Breaker Routing**

- Dispatch now tracks consecutive backend failures and opens a short circuit-breaker window after repeated failures, so Porter routes around bad gateways automatically
- The breaker counts both thrown exceptions and returned `ok:false` backend failures, closing a real control-plane blind spot in bridge dispatch
- This improves autonomy and speed together by stopping Porter from wasting time on obviously failing backends

---

## v0.30.5 (2026-03-09)

**Project-Aware Routing + Dispatch Feed Indexing**

- Smart routing now respects project and task context when a dispatch belongs to an assigned project, so fallback no longer ignores the project operating lane
- Hot `agent_messages` query paths now have `created_at` and `(to_agent, created_at)` indexes, making runtime gateway activity and recent dispatch views cheaper under load
- This keeps autonomous project work visible and faster without reintroducing stale cache shortcuts

---

## v0.30.4 (2026-03-09)

**Runtime Gateway Activity**

- Runtime now shows a unified Gateway Activity feed backed by real `agent_messages` dispatch data across all associated backends
- Gateway activity rows now carry persona, project, and task identity so autonomous work is visible in operational context instead of as anonymous backend traffic
- The admin dispatch-log API now returns project, task, persona, and backend error metadata, making Porter’s operator view usable for supervision and diagnosis

---

## v0.30.3 (2026-03-09)

**Project-Aware Persona Dispatch**

- Persona dispatch can now resolve an active project and task, inject project brief, decisions, tasks, and recent activity into the dispatch context, and persist project identity into trace data
- Task-targeted persona dispatches now update task ownership and completion state automatically, making project work executable through Porter instead of decorative
- Cortex extraction now defaults to project scope when a persona dispatch belongs to a project, so project learning accumulates in project memory by default

---

## v0.30.2 (2026-03-09)

**Models Grid Persistence Fix**

- Removed the legacy `withLoadTimeout('models-grid', ...)` wrapper that could replace the entire Models grid with a retry block after 10 seconds
- Models load failures now stay on the top loading rail instead of blanking the grid, preserving any already-rendered cards
- This restores the rule that nothing should ever wipe the whole Models grid during refresh or timeout handling

---

## v0.30.1 (2026-03-09)

**Faster Staged Models Hydration**

- Models bootstrap is now structure-only and no longer runs activity aggregation on the critical first-paint path
- Bootstrap and full snapshot start in parallel, so Porter can render whichever live payload lands first instead of blocking on sequential hydration
- Backend status checks are deferred until after first paint, keeping gateway probes off the initial render path

---

## v0.30.0 (2026-03-09)

**Faster Live Models Bootstrap**

- Models bootstrap is fast again without falling back to stale browser truth: first paint uses fresh lightweight provider and model data, then the full live snapshot hydrates afterward
- Non-lightweight provider probing now runs in parallel instead of sequentially, reducing server-side wait on Models endpoints
- Control-plane truth remains live, but preliminary loading no longer pays the full dynamic catalog cost up front

---

## v0.29.99 (2026-03-09)

**Models No-Cache Control Plane**

- Models no longer uses browser `sessionStorage` for backend truth
- Models bootstrap and snapshot now force fresh capability checks and invalidate CLI-derived caches when binary fingerprints change
- Added a new Porter global rule: control-plane surfaces must prefer live runtime truth over cached browser or stale bootstrap state

---

## v0.29.97 (2026-03-09)

**Models Grid No-Blank Guarantee**

- Models loading no longer writes skeleton cards into the grid at all; only the top loading rail changes during refresh
- This guarantees background loads cannot blank or replace the visible grid once real cards have rendered
- The Models grid DOM is now reserved for real card renders and the explicit empty-state only

---

## v0.29.96 (2026-03-09)

**Models Single-Flight Rendering**

- Models loading is now single-flight, so duplicate `loadModels()` calls cannot replace an already-rendered grid with skeletons or bootstrap state
- Once the Models grid has rendered in a visit, later loads refresh in the background without clearing cards
- Stale async bootstrap and snapshot responses are ignored if a newer Models load started afterward

---

## v0.29.95 (2026-03-09)

**Models Grid Persistence Guarantee**

- Once Models cards are on screen, same-visit background refreshes no longer apply a second snapshot DOM update
- Cached snapshot loads now refresh cache and versions in the background without replacing the visible grid
- This hardens the invariant that the Models grid never disappears after a successful render

---

## v0.29.94 (2026-03-09)

**Models Response Refresh Removal**

- Removed the post-response Models activity fetch so ordinary backend responses no longer trigger any hidden Models-tab refresh path
- Models now rely on existing SSE updates and explicit reloads instead of background activity polling after each response
- This removes the last automatic Models refresh source caused by unrelated backend traffic

---

## v0.29.93 (2026-03-09)

**Models Grid Churn Removal**

- Removed the post-response full Models grid rerender that was still rebuilding cards after backend activity completed
- Models activity refresh now updates state without calling `_renderModelCards()` on every response event
- Structural hydrate comparison is also stricter now, so live snapshots only rebuild cards when provider or model shape truly changed

---

## v0.29.92 (2026-03-09)

**Models Structural Hydrate Stability**

- Models live hydration now compares a structural signature before redrawing cards, so stable snapshots stop causing visible reloads
- Cached bootstrap and snapshot renders now preserve the existing grid when only versions or backend status changed
- Models load path keeps the fast seeded render and only rebuilds card DOM when provider, model, or runtime structure actually changes

---

## v0.29.91 (2026-03-09)

**Models Repaint Fix**

- Fixed Models cached-load repaint churn so the tab no longer redraws through bootstrap after seeding from a cached snapshot
- Cached snapshot renders now stay on screen until the live snapshot arrives, reducing the visible double-load effect
- Bootstrap fetch is skipped when a recent cached snapshot already seeded the tab

---

## v0.29.90 (2026-03-09)

**Models Fast-Path Caching + Partial Hydration**

- Models tab now reuses the last good bootstrap and snapshot from session storage so repeat visits render immediately before the network round-trip finishes
- Bootstrap and snapshot activity payloads stop querying recent-run history that the card grid does not use, reducing first-load database work
- Model activity slide-outs lazily hydrate recent runs only when opened, preserving detail without penalizing initial card render

---

## v0.29.89 (2026-03-09)

**Animated Staged Models Loading**

- Models tab now shows an animated staged loading rail instead of appearing stalled during bootstrap and snapshot hydration
- Bootstrap load paints skeleton cards immediately, then preserves the first card render while live catalogs hydrate in the background
- Models load states now distinguish fast cached runtime bootstrap from slower live catalog hydration so the page feels responsive even when backends are slow

---

## v0.29.88 (2026-03-09)

**Backend Runtime Profiles + Gemini Auth-Aware Testing**

- Backend runtime profiles now capture documented CLI capabilities instead of scattering per-backend assumptions
- Gemini runtime detects OAuth vs API-key control mode and normalizes model testing accordingly
- Gemini and Claude tests now prefer documented headless and structured-output flags when supported by the installed CLI
- Gemini tests now detect CLI OAuth re-authorization prompts explicitly instead of misclassifying them as generic model failures
- Models snapshot/bootstrap now carry runtime metadata so UI and tests can share the same backend truth
- Gemini capability checks no longer spawn `gemini --version` at startup, and Gemini version bootstrap now reuses cached capability state correctly

---

## v0.29.87 (2026-03-09)

**Models Snapshot Loading + Faster Controlled Test-All**

- Models tab now loads from a unified snapshot payload instead of composing multiple API calls on first render
- Models tab now paints from a lightweight bootstrap payload first, then hydrates the full snapshot in the background
- Cached version state is rendered immediately from the snapshot, then refreshed in the background
- `Test All` now runs with controlled concurrency across different backends instead of full serialization
- Test scheduling prevents multiple tests from hammering the same backend at once
- Providers, activity, and available-model payloads now share backend helpers instead of duplicating logic in route handlers
- Gemini startup load no longer spawns `gemini --version` during capability checks, and Models version bootstrap now reuses cached Gemini capability state correctly

---

## v0.29.86 (2026-03-09)

**Models Probe Truthfulness + OpenClaw Restart-Loop Diagnosis**

- Installed-version checks now prefer the real user-local CLI path instead of stale system shims
- Models cards no longer render `Version unknown` / `Latest unknown` when Porter still lacks a verified answer
- Version probes can be force-refreshed on Models load so recent CLI upgrades show up immediately
- OpenClaw diagnosis now inspects the runtime logfile and surfaces service-restart loops and recent auth-token mismatches explicitly
- Ollama and Codex latest-version checks are more robust, reducing disappearing update labels
- OpenClaw card repair warnings moved to the bottom rail and gateway-only clutter was removed from the middle of the card
- OpenClaw config now uses `Gateway Token` with a visible input instead of masking typed characters
- Shared client-side request errors and timeouts now emit Mission Control log entries from the common `api()` path
- `Test All` now runs as a queued sequence instead of blasting every backend concurrently
- OpenClaw model tests now parse the current CLI JSON result format instead of failing on successful runs
- OpenClaw supervisor-conflict diagnosis is now tied to active restart evidence, not just the existence of two service files
- Models page loading is resilient to partial API failures instead of blanking the entire tab when one request stalls
- OpenClaw status now separates bridge health from agent execution health, and transient `1006`/timeout agent runs are classified as flaky instead of gateway-down
- OpenClaw repair actions now show concrete fix steps instead of always routing to generic config

---

## v0.29.85 (2026-03-09)

**Models Card Cleanup**

- Models cards no longer show stale `latest` metadata as if it were a valid downgrade/update target
- OpenClaw duplicate model rows are deduped on canonical model keys
- Gateway state is separated from request-activity state so cards stop showing contradictory labels like `Idle` and `Running`
- Repair commands stay in the repair/config flow instead of cluttering the card body

---

## v0.29.84 (2026-03-09)

**OpenClaw Pairing-State Diagnosis**

- OpenClaw runtime diagnosis now detects paired devices with a down gateway and surfaces reconnect-loop repair guidance
- More OpenClaw call paths now use shared config/state helpers instead of legacy top-level `authToken` / `gatewayPort` assumptions
- OpenClaw cards now show paired/pending counts and clearer follow-up hints when gateway state is stale

---

## v0.29.83 (2026-03-09)

**Gateway Version Labels + Repair UX**

- Gateway cards now show `Installed` plus `Latest`, `Latest <version>`, or `Latest unknown` instead of a bare version string
- OpenClaw install and repair commands are corrected to use `npm i -g openclaw`
- Gateway repair state is separated from passive status chips so actions are easier to see and less visually messy
- OpenClaw reinstall alone does not mark the gateway healthy; Porter now keeps surfacing runtime issues like gateway-down and Node-runtime problems

---

## v0.29.82 (2026-03-09)

**Models Status Design + OpenClaw Recovery**

- Models cards now use compact status chips, cleaner spacing, and colored health dots instead of leaving large dead areas
- OpenClaw gateway runtime details are rendered as structured chips rather than a noisy sentence embedded in the card
- OpenClaw config now supports a reset-to-discovered path and shows effective runtime settings plus diagnosis in the config modal
- Synthetic model IDs are filtered out of dynamic discovery, and Gemini preview model tests get a larger timeout budget

---

## v0.29.81 (2026-03-09)

**Dynamic Model Catalogs + Runtime Split**

- Claude, Gemini, and OpenClaw model catalogs now resolve from live runtime state instead of Porter-shipped static lists
- Runtime-discovered model IDs are preserved so newer model versions do not disappear behind stale labels
- Models tab is narrowed to backend health, config, selection, and testing; session/extraction state is moved out of the tab
- `System` is relabeled as `Runtime` and now temporarily hosts session/extraction status until that workflow is merged into Cortex

---

## v0.29.80 (2026-03-09)

**Models Test Reliability + OpenClaw Diagnosis**

- `Test All` now covers model cards that do not expose an `Auto` row, so single-model backends like Ollama are no longer skipped
- Per-model test badges persist across model-card refreshes instead of disappearing after other backend responses land
- OpenClaw failures now attach runtime diagnosis from gateway/doctor checks, making gateway-down and embedded-timeout scenarios explicit
- Repair hints are sharper for broken OpenClaw runtime states instead of showing only generic timeout failures

---

## v0.29.79 (2026-03-09)

**Models Control Plane Hardening**

- Models tab frontend failures now POST structured errors into Mission Control instead of failing silently
- Mission Log preserves extra frontend metadata like `source`, `stack`, `backend`, and `model`
- `POST /api/models/test`, `POST /api/models/test-all`, and gateway actions now emit structured model-domain log events
- CLI version parsing is more robust across OpenClaw, Claude, Gemini, and Codex output formats
- OpenClaw model-test failures now return operator-facing repair guidance, including reinstall direction when the CLI looks broken

---

## v0.25.48 (2026-03-02)

**Fix: All panels showing at once**

- Removed duplicate `.chat-input-area {` CSS selector (line ~5105) that left an unclosed brace
- This swallowed all subsequent CSS rules — `.module-panel { display:none }` never applied
- Every tab, settings page, wizard, and panel rendered simultaneously on page load
- Root cause: the v0.25.42-v0.25.46 Memory Tab overhaul introduced a duplicate selector line

---

## v0.25.47 (2026-03-02)

**Fix: Async ReferenceError**

- Removed dangling `async` keyword (bare keyword left behind from deleted function) that caused `Uncaught ReferenceError: async is not defined` on every page load
- This was flooding Mission Control logs with `frontend.error` events every few seconds and triggering the `frontend_error_spike` alert rule

---

## v0.25.46 (2026-03-02)

**Memory Tab Redesign + Nav Grouping + Chat Fixes**

Based on Moe's design feedback, this release strips the Memory tab down to essentials:

### Memory Tab v6
- **How Memory Works** — collapsible flow diagram explaining Sessions → Flush → MEMORY.md ↔ projects.md
- **Compact silo rows** — one row per agent with status dot, file count, size, gear icon
- **Config panel editing** — click ⚙ to open side panel with file browser, editor, quick-add
- **Coordination files rail** — shows shared files like projects.md
- **Session summary card** — per-agent counts with stale session warnings and educational context
- **Removed:** avatar icons, memory map SVG, shared plane hub, split-pane editor, timeline, stat cards, quality badges, diff overlay

### Nav Grouping
- Added "Tools & Config" section header in sidebar
- Extensions, Skills, Logs, Settings grouped under it
- Projects, Workflows, Locations, Files in main section

### Chat Fixes
- History button now visible on welcome screen
- Light mode input fix: replaced hardcoded rgba(255,255,255,...) with CSS variables
- Input box, placeholder text, and borders now theme-aware

---

## v0.25.42–v0.25.45 (2026-03-02)

**Memory Tab Overhaul — 25 Improvements across 4 Patches**

### Patch 1: Agent Identity Cards (v0.25.42)
- Per-agent identity cards with avatar, name, role label, online/offline status dot
- Files grouped by agent (instructions + persistent memory sections)
- Live health integration via provider probes
- Collapse/expand with localStorage persistence
- Role editor: click agent card to edit role description
- Per-agent stats: file count, total size, session count

### Patch 2: Memory Editing Experience (v0.25.43)
- Split-pane editor: file tree on left, editor on right
- Markdown syntax highlighting (headers, bold, code, lists, links)
- Unsaved changes dot indicator in file tree
- Memory quality score per file (Good/Fair/Stale)
- Diff preview before saving memory edits
- Quick-add memory entry button per agent

### Patch 3: Session Management & Flush (v0.25.44)
- Session search: real-time text filtering
- Bulk Flush: flush all pending sessions at once
- Gemini CLI session support (detect + display + flush)
- Flush history log in SQLite with UI
- Session age badges: green (<1h), yellow (1-24h), red (>24h)
- Auto-flush suggestion banner for stale sessions

### Patch 4: Visual Polish & Cross-Model (v0.25.45)
- Header redesign with total memory size, agent count, last activity
- Animated transitions: smooth expand/collapse, fade-in content
- Keyboard shortcuts: Ctrl+S save, Esc close, / focus search
- Cross-model memory map: SVG diagram of agents and shared files
- Memory timeline: horizontal timeline of recent changes
- Export/Import: download all memory as markdown, import back
- Empty state onboarding guidance

### New Backend Endpoints
- `GET /api/memory/agent-status` — live agent health probes
- `GET /api/memory/flush-history` — recent flush operations
- `GET /api/memory/export` — export all memory files

### New SQLite Table
- `flush_history` — tracks all flush operations (timestamp, agent, destination, bytes)

---

## v0.25.40 (2026-03-02)

**Mission Control v2 — Tabbed UI, Bug Reports, Frontend Error Capture**

### Tabbed Right Panel
- Detail / Incidents / Report tabs replace old detail pane
- Single-view layout: flex column fills viewport, no page-level scroll

### Report Bug UI
- "Report Bug" button in MC header (red accent)
- Report tab: textarea + severity selector + Submit
- Dispatches to agent squad, streams analysis via SSE `log:bugreport`

### Frontend Error Capture
- `window.onerror` + `unhandledrejection` auto-POST to `/api/logs/client-error`
- Errors appear as `frontend.error` events in Mission Control timeline

### New Preset Filters (4)
- File Ops (`domain:file`), Chat (`domain:chat`), Schedule (`domain:schedule`), Frontend (`domain:frontend`)

### Incidents Enhancements
- Remediation status badge on incidents (Auto-remediated)
- Retry Fix button triggers manual `POST /api/logs/remediate`
- SSE handlers: `log:incident`, `log:remediation`, `log:bugreport` update UI in real-time

---

## v0.25.39 (2026-03-02)

**Provider Registry + Chain Dispatch — AI-to-AI Communication**

### Provider Registry
- 5 probe functions (`_probe_openclaw`, `_probe_ollama`, `_probe_claude`, `_probe_gemini`, `_probe_codex`) with 15s TTL cache
- `PROVIDER_REGISTRY` dict: dispatch, probe, type, label per backend (replaces flat `AGENT_DISPATCHERS`)
- `GET /api/providers` — real-time health status for all 5 backends

### Fallback Chain
- `_resolve_with_fallback()`: if preferred backend is down, auto-walk fallback chain
- Configurable `preferences.fallback_chain` (default: openclaw → gemini → claude → codex → ollama)
- Mission Control logs `route.decision`, `route.fallback`, `route.no_backend` events

### Server-Side Chain Dispatch
- `_run_chain()`: multi-step pipeline — probe → dispatch → pipe output to next step
- `POST /api/bridge/chain` — fire chains in background thread, returns `chain_id`
- `GET /api/bridge/chains` — aggregates chain runs with step counts, tokens, duration, status
- `agent_messages` table gains `chain_id TEXT` + `step_num INTEGER` columns (auto-migrated)
- SSE events: `chain:start`, `chain:step`, `chain:complete`, `chain:error`
- Stops on first step failure

### Chain Builder UI
- New section in Workflows tab: add/remove steps with backend selector + prompt template
- Placeholder substitution: `{input}` = original input, `{previous}` = last step output
- Chain runs list with status dots, duration, token counts
- "Run Chain" button fires `POST /api/bridge/chain`

### Fixes
- Fixed Mission Control CSS bleed: `#admin-module` no longer forces `display:flex` on hidden tabs
- Fixed stale version in `/api/admin/health` (was `0.22.1`) and `/api/version` (was `0.25.35`)

---

## v0.25.38 (2026-03-02)

**Mission Control v2 — Auto-Remediation, Bug Reports, Expanded Instrumentation**

### Auto-Remediation Engine
- Incidents auto-dispatch to agent squad (openclaw for bridge/code, gemini for analysis)
- Gathers context: last 5 events from same domain + system metrics
- Builds remediation prompt with incident details, dispatches via `dispatch_agent()`
- Tracks run_id in `log_incidents.run_refs`, emits `log:remediation` SSE events
- Manual retry via `POST /api/logs/remediate`

### Bug Report System
- `POST /api/logs/report` — submit bug description + severity, auto-captures recent events
- Dispatches to agent squad in background thread
- SSE `log:bugreport` events stream analysis status + response back to UI
- Report tab in right panel with textarea, severity selector, live status

### Client Error Capture
- `POST /api/logs/client-error` — accepts frontend JS errors (message, source, stack)
- `window.onerror` + `unhandledrejection` handlers auto-POST to endpoint
- Emits `frontend.error` events into Mission Control pipeline

### Expanded Instrumentation
- **File ops** (8 handlers): upload, delete, rename, mkdir, move, copy, write, zip emit `file.*` events
- **Chat streaming**: `chat.stream.start`, `chat.stream.complete`, `chat.stream.error` with duration/chars
- **Scheduler**: `schedule.fire`, `schedule.complete`, `schedule.fail` with job details

### New Alert Rules (4)
- `file_error_spike`: 5+ file errors in 120s
- `chat_error_spike`: 3+ chat errors in 120s
- `schedule_failure_spike`: 3+ schedule failures in 300s
- `frontend_error_spike`: 10+ frontend JS errors in 120s

### UI Overhaul
- **Single-view layout**: no page-level scroll, flex column fills viewport
- **Tabbed right panel**: Detail / Incidents / Report tabs replace old detail pane
- **Compact cards**: smaller padding (6px 10px) + 16px values for density
- **4 new presets**: File Ops, Chat, Schedule, Frontend
- **Report Bug button** in header (red accent)
- Incidents view shows remediation status badge + Retry Fix button

### New API Endpoints (3)
- `POST /api/logs/report` — submit bug report
- `POST /api/logs/client-error` — capture frontend JS errors
- `POST /api/logs/remediate` — manual retry auto-remediation

### New SSE Event Types (2)
- `log:remediation` — {incident_id, run_id, status, response}
- `log:bugreport` — {report_id, status, response, backend}

---

## v0.25.37 (2026-03-02)

**Mission Control Log System — Structured Observability**

### Event Pipeline
- `MissionLog` singleton: async queue + background consumer thread, JSONL writer + SQLite index
- Separate log database (`runtime/logs/log_index.db`) — avoids bloating porter.db
- Hourly JSONL file rotation, 24h retention, 1.5GB disk cap with automatic purge
- Thread-local `trace_id` propagation for request correlation
- Automatic redaction of Bearer tokens, passwords, API keys, cookies

### Instrumentation
- API requests: `api.request.start`/`api.request.end` with trace correlation
- Bridge dispatch: `bridge.dispatch`, `bridge.complete`, `bridge.fail` with run_id + duration
- Routing: `route.decision` with backend choice
- Auth: `auth.login.ok`, `auth.login.fail`, `auth.unauthorized`

### Alert Engine
- Rolling-window anomaly detection per backend
- Bridge failure spike (3+ in 2m), auth failure spike (5+ in 2m), timeout burst (5+ in 5m)
- Auto-creates incidents with dedup, SSE broadcast on `log:incident`

### API Endpoints (6 new)
- `GET /api/logs/query` — paginated, filtered event query (severity, domain, trace, backend, text)
- `GET /api/logs/trace?id=` — all events for a trace_id (waterfall view)
- `GET /api/logs/incidents?state=` — incident list
- `GET /api/logs/metrics` — event rate, error rate, disk usage, dropped count
- `GET /api/logs/event?ref=` — full event by file reference
- `POST /api/logs/incidents/<id>/ack` — acknowledge/resolve incident

### Mission Control UI (replaces Logs tab)
- Real-time event timeline with severity badges, domain tags, correlation chips, latency
- 5 summary cards: incidents, errors, timeouts, bridge failures, total events
- Debug Focus / Live Tail toggle modes
- Query filter bar with key:value syntax + 4 preset buttons
- Detail panel with trace waterfall view
- SSE live stream via `/api/events` (log:event type)
- Export current events as JSON

---

## v0.25.36 (2026-03-02)

**Bridge Service Auth — M2M Dispatch + Result Retrieval**

### Auth Upgrade
- `POST /api/bridge/dispatch`, `GET /api/bridge/runs`, `POST /api/agent/invoke` now accept Bearer tokens via `auth_check_cap()` (was session-only `auth_check()`)
- OpenClaw (role: operator) can now call all bridge endpoints with its API key

### New Endpoint
- `GET /api/bridge/run?id=<run_id>` — single-run lookup for polling dispatch results

### Enhanced Filtering
- `GET /api/bridge/runs` supports `?since=<unix_ts>`, `?status=complete,failed`, `?limit=N` query params

### Security
- Regenerated OpenClaw API key (scrypt hash)

---

## v0.24.3 (planned)

**Branding + Onboarding Governance Alignment**

- Updated Porter tagline from **File Manager** to **Mission Control** in key UI surfaces
- Replaced ambiguous bell glyph with explicit **Alerts** label in header notifications control
- Added Sprint planning scope to include ACP runtime onboarding + autonomy controls for first-time users

---

## v0.23.0 (2026-03-01)

**Quality, Polish & Intelligence**

### Smart Routing
- **Porter auto-selects model** based on message content
- Code/technical → OpenClaw (GPT-5.4 Codex), quick factual → Gemini (fast)
- Word-boundary matching prevents false positives

### Notifications & Persistence
- **Notification center** — bell icon shows delegations, tasks, events with timestamps
- **Chat persistence** — messages survive page reloads (localStorage)
- **Delegation log** — Admin tab tracks all agent bridge calls

### Quality
- BrokenPipeError silently suppressed (cleaner logs)
- Admin health CPU no longer blocks with sleep(0.1)
- Proper error handling across all API endpoints

---

## v0.22.6 (2026-03-01)

**Chat Commands + Keyboard Shortcuts + Admin Polish**

Major UX overhaul across multiple subsystems:

### Chat Experience
- **Built-in commands:** `/help`, `/clear`, `/status`, `/models`, `/version` — handled locally
- **Slash autocomplete:** Type `/` to see all available commands with descriptions
- **@model autocomplete:** Type `@` to see available backends (OpenClaw, Gemini, Ollama)
- **Arrow key navigation:** Up/Down to browse suggestions, Enter/Tab to select, Escape to dismiss
- Unknown `/commands` still route to OpenClaw as skill invokes

### Memory Tab v3
- **Educational three-layer view** with labeled flow arrows
- **Layer descriptions** explain WHY each layer matters
- **SHARED MEMORY PLANE** hub with coordination description
- **Model color indicators** on cards (amber=Claude, emerald=OpenClaw, blue=Gemini)
- **Flow arrow labels:** "guides memory", "supplies context", "logs outcomes"
- **Session stats bar:** Total sessions, size, message count, model breakdown
- **Instruction/memory separation:** OpenClaw's SOUL.md, USER.md, AGENTS.md correctly in Instructions layer

### Admin Dashboard
- **Quick stats row:** Version, uptime, services, CPU, memory at a glance
- **Porter Rules** section now visible (HTML container was missing)
- **Delegation log:** Tracks all agent bridge calls with backend, duration, prompt preview

### Quality of Life
- **Auto-reload:** Browser polls `/api/version` every 30s, refreshes on server restart
- **Keyboard shortcuts:** Ctrl+K (chat), 1-9 (tabs), ? (help overlay)
- **Task registry fix:** Sort crash on string `created_at` values

---

## v0.21.2 (2026-02-28)

**Porter Rules**

- **Default governance rules** loaded on first run (12 rules across 4 categories)
- **CRUD via `/api/rules`** — add, remove, update rules through Admin tab
- **Category badges:** Architecture, UX, Engineering, Governance — color-coded
- **Shortened verbose text** across the UI (brief is better)

---

## v0.21.1 (2026-02-28)

**Public Landing Page**

- Unauthenticated visitors see a consumer-facing marketing page instead of login redirect
- Modern dark design: hero, feature grid (6 cards), architecture diagram, stats section
- SEO meta tags for discoverability
- Authenticated users see the full app as before

---

## v0.21.0 (2026-02-28)

**Chat Experience Upgrade — CLI Feel**

- **Markdown rendering:** Code blocks with syntax-aware styling, bold, italic, headers, lists, links
- **Copy button** on every code block (hover to reveal, click to clipboard)
- **Thinking indicator:** Animated dots while waiting for model response
- **Stop button:** Cancel streaming mid-response (also Escape key)
- **Multi-turn context:** Conversation history sent to backend (last 5 exchanges)
- **Model badge:** Each assistant message shows which model responded (color-coded)
- **Performance:** Only updates last message during streaming (no full DOM rebuild per token)
- **CLI auto-sensing:** Health endpoint detects Gemini CLI, OpenClaw CLI, Claude CLI, GitHub CLI, Docker, Node.js, Python — with version numbers
- **Fixed:** `_ur` undefined error in service health checks

---

## v0.20.1 (2026-02-28)

**Agnostic Agent Bridge**

- **`POST /api/agent/invoke`:** One endpoint, many backends. Send `{message, backend: "openclaw|gemini|ollama"}`
- **Unified dispatcher:** `AGENT_DISPATCHERS` dict maps backend name → Python function. Adding new backends = adding one function
- **Gemini CLI bridge:** `gemini -p "..." -o json -y` returns structured JSON (response, stats, tokens)
- **Ollama bridge:** HTTP API to `127.0.0.1:11434/api/generate` with non-streaming mode
- **@backend prefix:** Type `@gemini`, `@openclaw`, or `@ollama` in chat to target a specific model
- **Legacy compat:** `/api/skill/invoke` now routes through the same dispatcher
- **Normalized response:** All backends return `{ok, text, backend, model, duration_ms, tokens}`

---

## v0.20.0 (2026-02-28)

**OpenClaw Skill Bridge**

- **`POST /api/skill/invoke`:** Invokes OpenClaw agent via subprocess (`openclaw agent --agent main --message "..." --json`)
- **Chat /commands:** Type `/skill-name` in chat to invoke OpenClaw skills directly
- **Skill results:** Displayed inline with execution metadata (model, duration, tokens)
- **PATH resolution:** Finds `openclaw` binary via `shutil.which` + fallback to `~/.npm-global/bin`

---

## v0.19.0 (2026-02-28)

**Chat Routing + Nav Regression Tests**

- **Route selector:** General / Project / Automation — messages auto-route to project context
- **Project context injection:** Selected project's description prepended to prompts
- **Nav regression tests:** 2 new Playwright tests (all tabs render, no JS errors on switch) — 34 total
- **Fixed:** Duplicate Chat Routing block from double-matched replacement (2,965 bytes removed)

---

## v0.18.2 (2026-02-28)

**Chat Auto-Select Model**

- Chat auto-selects best available model (OpenClaw preferred over Ollama)
- No "Select model..." placeholder — model selector is for override only
- Checks `/api/admin/health` for OpenClaw availability

---

## v0.18.1 (2026-02-28)

**Legacy Cleanup + Animated Arrows**

- Removed 94 lines of dead code: `loadOverview`, `renderOverview`, `.ov-metric` CSS, `_overviewPollTimer`
- Bidirectional animated flow arrows: `@keyframes flow-pulse` + `@keyframes flow-dash`
- Net: 3,862 bytes removed

---

## v0.18.0 (2026-02-28)

**Admin Tab + Chat HTML Fix**

- **Chat fix:** Chat HTML was never injected (silent patch failure from v0.17.x). Fixed — all chat elements now render.
- **Admin tab:** System health dashboard with CPU, memory, disk, uptime from `/proc/*`
- **Service checks:** Ollama, OpenClaw Gateway, SQLite — status and details
- **Log viewer:** Reads from `journalctl` with level filter and auto-refresh toggle
- **Config summary:** Shows all Porter configuration in tabular format
- **Nav icon:** Shield SVG for Admin tab

---

## v0.17.2 (2026-02-28)

**Context Injection**

- Attach files to chat conversations — content injected into prompts
- File picker with extension filtering (19 text types)
- Context bar shows attached files as removable chips
- Content truncated to 8000 chars per file

---

## v0.17.1 (2026-02-28)

**Flush Wizard**

- Preview before writing session learnings to memory
- Shows summary, destination file, size impact
- Custom summary editing before commit

---

## v0.17.0 (2026-02-28)

**Chat Engine**

- SSE streaming for real-time token display
- Multi-model support: Ollama (streaming) + OpenClaw Gateway (single-shot)
- Chat history: save, load, delete conversations
- Auto-resizing textarea with Enter-to-send

---

## v0.16.0–v0.16.2 (2026-02-28)

**Phase 0: Security + Infrastructure**

- `ThreadingHTTPServer` for concurrent request handling
- CORS headers with configurable origins
- Rate limiting on login (5 attempts, 5 min lockout)
- `scrypt` password hashing (migrating from SHA-256)
- Structured logging across 73 except blocks
- SQLite session store replacing in-memory dict

---

## v0.15.2 (2026-02-28)

**Gap: Skills CRUD**

- **Installed/All filter toggle:** Default view shows only installed skills; toggle reveals all 50 available skills.
- **Remove skill:** Button with confirm dialog removes skill from OpenClaw sandbox or manual skills directory.
- **Create manual skill:** Form to create a new SKILL.md with name, description, emoji, and requirements.
- **Backend:** `POST /api/openclaw/skills` with actions: `remove`, `create`.
- **Install status detection:** Fixed — now reads OpenClaw `resolvedSkills` instead of guessing from binary availability (7 installed, not 17). GET handler crash fixed (duplicate POST handler in `do_GET`). Create form redesigned with elegant layout + cancel button.

**Gap: v0.12.85 changelog dedup**

- Renumbered 6 duplicate v0.12.85 changelog entries to v0.12.85–v0.12.90. Each entry now has a unique version.

**Gap: Session memory flush pipeline**

- **Extensions tab:** New session logs viewer shows OpenClaw sessions (11 detected).
- **Flush to memory:** Button extracts learnings from session logs and appends to `session_flushes.md`.

**Gap: Local model detection in Orchestration**

- **CLI detection:** Detects Codex CLI, Claude CLI, Gemini CLI, and Ollama models at startup.
- **Orchestration Models section:** Detected models appear as "detected" cards with dashed borders.
- **Expanded PATH search:** Covers `~/.local/bin`, `~/.npm-global/bin`, and systemd service paths for reliable detection.

**Gap: Live capability scan on refresh**

- **All Refresh buttons** now re-run capability detection (30s TTL cache).
- New CLIs and models detected within 30 seconds of installation.

**Gap: checkpoint.md deprecation**

- **Startup migration:** Porter marks `checkpoint.md` as DEPRECATED on first boot.
- **Task registry** is now the sole source of truth for task state.

**Gap: Direct model calling (Quick Prompt)**

- **Command Center:** Quick Prompt UI — select an Ollama model or OpenClaw Gateway, type a prompt, get a response inline.
- **Backend:** `POST /api/prompt` sends prompt to selected model and streams response.

---

## v0.15.1 (2026-02-28)

**Sprint 11: Real Agent Connectivity Test**

- **Actual HTTP roundtrip** replaces heartbeat inference for agent connectivity testing.
- **Connectivity modal redesigned:** Shows latency (ms), agent version, endpoint URL, heartbeat status in a clean grid layout.
- **OpenClaw agents:** Tested via HTTP ping to gateway (127.0.0.1:18789). Even 401/403 counts as "alive."
- **CLI agents (Claude, Gemini):** Tested via binary version check (`--version`).
- **Ollama:** Tested via `/api/tags` endpoint.
- **Retest button** in modal for quick re-ping without closing.
- **Button renamed** from "Connectivity check" to "Test connection."

---

## v0.15.0 (2026-02-28)

**Sprint 10: OpenClaw Bridge — Skill & Automation Visibility**

- **New Workflows tab:** Browse 50+ OpenClaw skills in a searchable card grid with emoji, description, and documentation links.
- **Automations section:** Shows OpenClaw cron jobs and recent run history (currently empty — configurable via OpenClaw).
- **Backend:** New `/api/openclaw/skills` and `/api/openclaw/cron` endpoints read directly from OpenClaw's sandbox directories.
- **Nav reorder:** Command Center → Orchestration → Extensions → Projects → Workflows → Locations → Files.
- **Skills moved out of Extensions:** Skills belong in Workflows, not Extensions. Extensions now shows Integrations + Tools only.
- **Fix:** Early Sprints task (sort_order=0) correctly appears at bottom of completed list — JS nullish coalescing fix.
- **Project start date corrected to Feb 18, 2026.**

---

## v0.14.22 (2026-02-28)

**Bug Fix + Extensions Cleanup**

- **Fix:** Early Sprints task (sort_order=0) now correctly appears at bottom of completed list. Root cause: JavaScript `||` operator treats `0` as falsy — changed to `??` (nullish coalescing).
- **Extensions tab:** Removed Skills section. Skills will be part of a future Workflows/Automations feature — not an extension.
- **Extensions tab:** Now shows two sections: Integrations + Tools.

---

## v0.14.21 (2026-02-28)

**Sprint 9: Hardcoding Elimination Pass**

- **Final hardcoding audit:** Systematic review of all paths, hosts, ports, and machine-specific assumptions in porter.py.
- **Fixed:** `is_writable()` was the last hardcoded reference — replaced `/home/lobster` with `os.getuid()` for portable ownership checks.
- **Audit confirmed:** 12+ path/host/port configurations already properly env-driven from Sprint P0. All critical paths derive from `PORTER_DATA_DIR`. HOST auto-detected. PORT respects env var. `DEFAULT_MOUNTS` empty on first run.
- **Startup self-check:** `_validate_no_hardcoding()` validates no hardcoded user paths at runtime.
- Zero functional `/home/lobster` references remain in porter.py.

---

## v0.14.20 (2026-02-28)

**Sprint 8: Integration Visibility**

- **Extensions tab redesigned:** Two-section dashboard — Integrations (OpenClaw services) and Tools (local binaries).
- **OpenClaw integration cards:** Gateway status, auth profile cards with expiry countdown, model provider display, webhook/hook status, session count.
- **Backend:** New `/api/integrations` endpoint reads OpenClaw skills, sessions, auth profiles, hooks, and model providers directly from disk.
- **Project metrics aggregation:** Token usage and time spent now summed from task registry (not project config). Always-visible summary row: Started date, total Tokens, total Time, task completion ratio.
- **Project start date fixed:** Reflects actual project start (Feb 23, 2026), not config entry creation date.

---

## v0.14.19 (2026-02-28)

**Sprint 7 Hotfix: Projects Tab Quality + Metrics**

- **Completed list reversed:** Most recently completed sprint shows first.
- **Early Sprints task:** Pre-sprint foundation work (v0.1–v0.12.69, 81 releases) tracked with estimated metrics.
- **Task ordering:** Sprint P0 = sort_order 1, Sprint 1 = 2, etc. Interim tasks slot between sprints.
- **"queued" label:** "pending" status renamed to "queued" in UI pills and filter tabs.
- **Token/time metrics:** Historical estimates populated on all completed tasks based on release notes density.
- **Rebuild button:** Pending tasks show a Rebuild button to reset task metadata.
- **Reload button:** Re-reads config and task registry from disk (new `/api/reload` endpoint).
- **"Updated X ago" indicator:** 5-second tick timer shows refresh freshness in Projects header.
- **Button sizing overhaul:** `.btn-sm`, `.btn-xs`, `.proj-status-toggle` sizes increased. 38 inline style overrides removed.
- **Active pill fix:** No longer clipped by `overflow:hidden` on project name.
- **Timezone setting:** Searchable datalist with UTC offset labels, sorted by offset.
- **Status pill hidden:** Completed tasks no longer show redundant "complete" pill in Completed accordion.

---

## v0.14.18 (2026-02-28)

**Projects: Memory File Chain + Type System + Config Editor**

- **Memory file chain viewer:** Each project card now shows its 6 canonical files (PROJECT.md, MEMORY.md, SPRINT_PLAN.md, tasks/checkpoint.md, tasks/lessons.md, settings.json) with green check / gray circle status icons, file sizes, and "modified X ago" timestamps. Collapsible section with exists count badge (e.g. "3/6").
- **Project type system:** Projects are now typed as `manual` (sprint-based, user-driven) or `autonomous` (agent-driven). Manual projects show an indigo badge and sprint progress bar. Autonomous projects show an amber badge with no progress bar.
- **Config slide-out panel:** Gear icon on each project card opens the config panel with editable name, type dropdown, memory isolation dropdown, status, created date, and save/delete actions.
- **Context menu:** "Settings" option added to project right-click dropdown.
- **Backend:** New `GET /api/projects/{id}/files` endpoint returns file chain metadata. New `update` action on `POST /api/projects` edits name, type, and memory_isolation — persists to both porter_config.json and workspace settings.json.

---

## v0.14.17 (2026-02-28)

**Usage Dashboard — auto-refresh from OpenClaw + Claude**

- **Auto-refresh on tab load:** Opening the Orchestration tab now triggers a live usage refresh for all registered agents. Claude agents probe the Anthropic API rate-limit headers; OpenClaw agents query session context utilization via the CLI. No manual paste needed.
- **Improved no-data states:** Agent cards show contextual placeholders: "Checking usage…" during refresh, "No usage data yet" for refreshable agents without data, "Check provider dashboard" for Gemini (no API). Stale data (>24h) shows "updated X ago" note.
- **Preferred model:** New dropdown in Settings → Policies → Orchestration Controls. Selecting a preferred model adds a subtle "preferred" badge to matching agent and model cards on the Orchestration tab. Informational only — actual routing is handled by your orchestrator.
- **Backend:** New `/agent-usage/auto-refresh` endpoint for batch refresh. New `_refresh_openclaw_usage()` reads `openclaw sessions --json` for context window utilization.

---

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

- Agent cards now display the configured model ID (e.g. `openai-codex/gpt-5.4`).
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
