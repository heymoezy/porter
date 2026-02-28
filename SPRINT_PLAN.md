# Porter Sprint Plan
Date: 2026-02-27
Status: Active — single source of truth for implementation sequencing
Governed by: CLAUDE_SLOW_ROLLOUT_MASTER_INSTRUCTIONS.md + MASTER_EXECUTION_PLAN.md

---

## Guiding principles

1. One tranche per Claude session. Stop, report, and hand off cleanly.
2. Never implement outside current tranche scope.
3. Every tranche: version bump + in-app changelog + RELEASE_NOTES.md update.
4. If something's broken, hide it or label it preview. No misleading controls.
5. porter.py is >512KB — Edit tool silently fails. Always use Python scripts to patch.
6. **Porter is environment-agnostic.** No hardcoded paths, hosts, ports, or machine assumptions.
7. **Capability-gated features.** Any feature requiring an external tool must check availability and degrade gracefully.
8. **Porter is the task broker.** All task state lives in Porter, not in agent session memory. Agents are stateless workers; Porter is the source of truth.

---

## Sprint 1 — COMPLETE (v0.12.98, 2026-02-27)

**What we did:**
- Renamed "Test" → "Connectivity check" on agent cards (heartbeat-based, not true roundtrip).
- Added PREVIEW badge to Schedules module header + honest description.
- Disabled "Project-based sharing" memory option with v0.13 coming-soon note.
- Archived old/superseded docs: commercialisation.md, implementation-plan.md, old sprint plans,
  phase1 brief, portal.db, render-architecture-pdf.js.
- Backfilled RELEASE_NOTES.md for v0.12.92–97.

---

## Sprint 2 — COMPLETE: Tranche A2: Schedules truth hardening (v0.12.99, 2026-02-27)

**Goal:** Either make schedule execution actually work, or hide the controls.

**What was done:**
- Run the scheduler loop in a background daemon thread on server start.
- Job state model: queued → running → success/failed.
- Persist last-run timestamp and result to runtime/schedules/<id>.json.
- Show last-run status on each schedule card.

---

## Sprint 3 — COMPLETE: Tranche C1: PEP/1 error envelope + correlation IDs (v0.13.0-alpha.1, 2026-02-27)

**Goal:** All PEP/1 endpoints return a stable, consistent error format.

**What was done:**
- Error envelope: { ok, code, message, retryable, correlation_id }.
- All /pep/v1/* endpoints wrapped to emit this envelope on error.
- correlation_id (uuid4) generated per request, propagated through response.
- correlation_id added to audit log entries for PEP paths.
- Idempotency key support on mutating PEP ops (register, write, mkdir, delete).

---

## Sprint P0 — COMPLETE: Environment Abstraction + Capability Registry (v0.13.0-alpha.2, 2026-02-27)

**Goal:** Make Porter genuinely deployable by a first-time user on any machine.

**What was done:**
- Hardcoded paths replaced with paths derived from PORTER_DATA_DIR env var.
- AGENT_WORKSPACE_DIR, OPENCLAW_STATE_DIR detected at runtime, not assumed.
- HOST auto-detects public IP on first use.
- PORT configurable via PORTER_PORT env var.
- CAPABILITIES dict with check_fn per capability (ollama, openclaw, gemini_cli, puppeteer, d2, wkhtmltopdf, ffmpeg, python3, git).
- /api/capabilities GET endpoint.
- Capabilities panel in UI: green ✓ / gray ○ / red ✗ with install hints.
- First-run wizard: data directory, first mount, capability scan, operator password.

---

## Sprint 3.5/P1 — COMPLETE: Tranche P1: Project + Task + Model Operations Dashboard (v0.13.1, 2026-02-27)

**Goal:** Operational visibility into all projects, model assignments, and running tasks — directly inside Porter.

**What was done:**
- Projects nav item added; renders projects.md as live dashboard.
- Task panel per project: checkpoint status, next_action for in_progress tasks.
- Task lifecycle actions: mark paused, mark complete, edit next_action.
- Health indicator: red if task is in_progress with no known active session.
- Model registry panel: each model as a card with memory file health check.
- Sync check: flags if a model's memory file doesn't reference projects.md.
- Add/remove/archive model via form.
- Cross-model task view: flat list of all in_progress checkpoints.

---

## Sprint 3.6 — COMPLETE: UI Polish Round (v0.13.2–v0.13.6, 2026-02-27)

**What was done:**
- v0.13.2 — Files: secondary nav panel removed; location picker rendered as cards.
- v0.13.3 — Files: collapsible device tree sidebar with online/offline indicators.
- v0.13.4 — Files: sidebar consolidated into listing area; device rows as group headers.
- v0.13.5 — Files: mounts expand inline (accordion); breadcrumb tracks depth.
- v0.13.6 — Files: mount rows show label only; grid simplified.

Also fixed: Escape key scope, Agents nav slot, Command Center placeholder, versioning scheme.

---

## Sprint 4 — COMPLETE: Tranche C2: Loop safeguards + audit provenance (v0.13.7–v0.13.9, 2026-02-27)

**What was done:**
- Hop counter: X-Hop-Count header, reject > 10 hops (HOP_LIMIT_EXCEEDED).
- Circuit breaker: per-agent error rate > 30% in 60s opens circuit (CIRCUIT_OPEN, retryable).
- Audit provenance: session_id, scope_source, chain_ref on all PEP audit entries.
- /metrics endpoint in Prometheus text format.
- UI: pulsing orange "⚡ degraded" badge on node rows when circuit open (v0.13.8).
- Files home: device nickname respected (v0.13.9).

---

## Sprint 5 — COMPLETE: Tranche D1: Project scoping backend (v0.14.0, 2026-02-27)

**What was done:**
- Project registry in porter_config.json: projects[], active_project_id.
- scaffold_project_dir(): creates PROJECT.md, MEMORY.md, settings.json per project. Idempotent.
- resolve_project_memory(): 3-layer resolver — agent override → project → global. Returns {path, content, source_layer}.
- GET /api/projects: list with workspace_path + workspace_exists.
- POST /api/projects: create (UUID + scaffold), set_active, delete, resolve.

---

## Sprint 5.5 — COMPLETE: Orchestration tab redesign (v0.14.16, 2026-02-28)

**Goal:** Replace the flat Agents tab with a flow visualization showing how work moves through Porter.

**What was done:**
- Agents tab renamed to Orchestration — visual pipeline: Connected Agents → Porter Hub → Models
- Full-width SVG connectors with per-column arrow alignment (preserveAspectRatio="none")
- Config slide-out panel on gear click — role, connection, API key, usage, concurrency, config files
- Model inference from agent type when model_id is empty
- Live data on agent cards — usage bars, status, last seen, provider service badges
- Porter hub with feature pills (active: Prompt cleanup, Model routing, Task dispatch; future: Shared memory, Task registry, Scheduler)
- Locations: converted from table to card layout, pencil-edit nicknames, removed Tailscale accordion
- Files: delete restored on home view with smooth animation, rounded corners throughout
- Config files: CLAUDE.md path validation fixed
- Ollama moved to Extensions; all tabs get intro sentences

---

## Sprint 6 — NEXT: Usage data pipeline for orchestration

**Goal:** Show real usage availability for each model/agent on the Orchestration screen. Currently the usage bars exist but have no data — usage snapshots must be captured automatically.

**Scope (small + focused):**

1. Auto-capture usage on agent load: when Porter loads agents on startup or refresh, query each agent's usage endpoint and store a snapshot.
2. For Claude: parse the usage data from the API dashboard format (% consumed, reset window).
3. For OpenClaw/Codex: parse usage from the openclaw gateway status endpoint.
4. For Gemini CLI: parse from gemini CLI status if available, otherwise badge "no data".
5. Store snapshots to `runtime/usage/<agent_id>.json` with timestamp.
6. Orchestration cards: usage bars populate from latest snapshot on render. Show "No usage data" gracefully when unavailable.
7. Model preference configuration: add a "Preferred model for coding" dropdown in Settings → Orchestration. Default empty (no preference). This is the first step toward user-configurable model routing.

**Version:** v0.14.17

**Acceptance:** Orchestration tab shows real usage percentages for at least one agent. Model preference setting exists in config.

---

## Sprint 7 — Projects: memory visualization + task/skill distinction

**Goal:** Make the project knowledge system visible and distinguish between manual projects and autonomous tasks.

**Scope:**

1. **Memory file viewer:** In each project card, show the .md file chain that captures project state: `SPRINT_PLAN.md`, `checkpoint.md`, `MEMORY.md`, `lessons.md`. Visual indicator showing which files exist, last modified, size.
2. **Projects vs autonomous tasks:** Add a `type` field to projects: `manual` (user-driven, sprint-based) or `autonomous` (agent-driven, runs by itself). Different visual treatment — manual projects show sprint progress, autonomous tasks show run history.
3. **Task ↔ skill correlation:** Surface the relationship between registered tasks and agent skills/capabilities. When a task maps to a known skill, badge it.
4. **Config exposure:** Any project config currently hardcoded in .md files should be editable through the Projects UI — no more "edit the markdown file manually."

**Version:** v0.14.18

**Acceptance:** Projects tab visually shows the .md file chain per project. Manual vs autonomous projects are visually distinct.

---

## Sprint 8 — Integrations: email + external service connectors

**Goal:** Expose external service connections (like email read access) in the Porter UI and make them configurable per user.

**Scope:**

1. **Integrations section** in Settings or as a sub-panel: list connected external services (email, calendar, etc.).
2. **Email connector config:** Store email access credentials/tokens in porter_config.json under `integrations.email`. Show connection status.
3. **OpenClaw email bridge:** Surface the existing read-only email access that OpenClaw has. Show it as a connected integration with scope (read-only) and account identifier.
4. **Integration cards on Orchestration:** Optional — show connected integrations as a fourth section below Models, or as badges on the agent that has access.

**Version:** v0.14.19

**Acceptance:** Email integration visible in Settings with connection status. User can see what external access each agent has.

---

## Sprint 9 — Hardcoding elimination pass

**Goal:** Systematic removal of all remaining hardcoded paths, hosts, ports, and machine-specific assumptions. Porter must work from zero on any machine.

**Scope:**

1. Audit every `/home/lobster/` reference in porter.py — replace with config-derived or env-derived paths.
2. `DEFAULT_MOUNTS` → empty on first run, populated via first-run wizard.
3. `CONFIG_PATH`, `RUNTIME_DIR`, `AVATAR_DIR`, `MEMORY_DIR` → derive from `PORTER_DATA_DIR` or XDG defaults.
4. `HOST` → auto-detect or configure, never hardcode a specific IP.
5. All agent workspace paths → optional/detected, not assumed.
6. Test: fresh install simulation — rename config, start Porter, verify first-run wizard works.

**Version:** v0.14.20

**Acceptance:** `grep -r 'lobster' porter.py` returns zero hits. Porter starts cleanly with no pre-existing config.

---

## Sprint 10 — Task registry backend

**Goal:** Persistent cross-session task state. Porter is the source of truth, not agent memory.

**Scope:**

1. Task model: `{ id, title, description, status, priority, project_id, tags[], assigned_agent_id, created_by, created_at, updated_at, result }`.
2. Status lifecycle: `pending → assigned → in_progress → complete | failed | cancelled`.
3. Persist to `runtime/tasks/<id>.json`. Load on startup.
4. `GET /api/tasks` with filters. `POST /api/tasks` with CRUD actions.
5. Wire into Projects UI — tasks appear under their project.

**Version:** v0.15.0

**Acceptance:** Tasks persist across Porter restarts. API is functional.

---

## Sprint 11 — Task routing + dispatch

**Goal:** Porter routes tasks to the best available agent automatically.

**Scope:**

1. Routing logic: match task tags to agent capabilities, prefer online + least loaded.
2. Agent work queue: agents poll for assigned tasks, claim atomically.
3. Cross-client intake: PEP/1 agents can submit tasks without browser session.
4. Dispatch: push tasks to online agents, fallback to queue if no ack.

**Version:** v0.15.1

**Acceptance:** Submit task → Porter routes → agent claims → result visible.

---

## Sprint 12 — Real agent connectivity test

**Goal:** Replace heartbeat inference with true roundtrip ping.

**Scope:**

1. Challenge-response: hub sends token, agent reflects, hub measures latency.
2. Modal shows: latency ms, success/failure, agent version.
3. Remove "preview" qualifier from connectivity check.

**Version:** v0.15.2

**Acceptance:** Connectivity check reflects real agent response.

---

## Sprint 13 — Working scheduler

**Goal:** Scheduled jobs actually execute and create tasks in the registry.

**Scope:**

1. Cron expression parser (stdlib only).
2. Job execution: create task or call agent directly.
3. Run history persisted. UI: last run, next run, history log.
4. Remove PREVIEW badge.

**Version:** v0.16.0

**Acceptance:** Scheduled job fires, creates task, result visible.

---

## Phase B (Monolith split) — DEFERRED

Splitting porter.py into modules after all features are stable. One module per sprint.

---

## Gaps identified (flagged, not yet scheduled)

1. **OpenTelemetry/Prometheus**: Needs pip approval for full OTel.

2. **ymc.capital/ inside porter/**: Should be sibling directory. Not moving without user confirmation.

3. **Session memory flush**: Agent updates task status + flushes context to MEMORY.md on session end. Design after task registry ships.

4. **v0.12.85 changelog dedup**: 6 entries all labeled v0.12.85. Cosmetic fix.

5. **Local model detection**: Ollama models should appear in Orchestration as callable models (not just as an Extension). Requires model registry that combines agent-linked models + locally detected models.

6. **Direct model calling**: Models not linked to an agent should be callable directly from Porter. Requires a lightweight inference proxy or CLI wrapper.

7. **checkpoint.md deprecation**: Once task registry is live, migrate in_progress checkpoints to tasks on first boot.
