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

## Sprint 6 — NEXT: Tranche G1: Porter task registry (backend + task board UI)

**Goal:** Porter becomes the durable, cross-session, cross-agent source of truth for all task state. No task exists only inside one agent's session memory.

**Why this is before D2 (project UI):** Without a persistent task system, every agent session is stateless and isolated. The project UI (D2) will be built on top of the task registry — tasks belong to projects, projects surface tasks. Build the foundation first.

**Plan:**

*Part A — Persistent task registry:*
1. Task model: `{ id, title, description, status, priority, project_id, tags[], assigned_agent_id, created_by, created_at, updated_at, result, session_id }`.
2. Status lifecycle: `pending → assigned → in_progress → complete | failed | cancelled`.
3. Persist to `runtime/tasks/<id>.json` (one file per task). On startup: load all into `_tasks` dict.
4. `save_task(task)` helper — writes to disk atomically (write to `.tmp`, rename).
5. `_tasks` dict in memory; protected by `_threading.Lock()`.

*Part B — /api/tasks endpoint:*
6. `GET /api/tasks` — list with optional filters: `?status=`, `?project_id=`, `?assigned_to=`, `?tag=`.
7. `POST /api/tasks` — actions: `create`, `update_status`, `assign`, `complete`, `cancel`, `add_result`.
8. `GET /api/tasks/<id>` — single task detail.
9. Auth: all task endpoints require session auth (same as other /api/* endpoints).

*Part C — Task board UI (Porter sidebar):*
10. New "Tasks" nav item in sidebar.
11. Kanban-style board: columns for `pending`, `in_progress`, `complete`.
12. Each card: title, project badge, assigned agent badge, priority indicator, age.
13. Click to expand: full description, result, history.
14. Create task form: title, description, project selector, priority, tags.
15. Filter bar: by project, by agent, by status.

**Version:** v0.14.1 (backend) → v0.14.2 (UI)

**Acceptance:** Any agent can POST to /api/tasks to create a task; task persists across Porter restarts; task board shows live state.

---

## Sprint 7 — Tranche G2: Task routing engine + cross-agent dispatch

**Goal:** Porter actively routes tasks to the best available agent. Any client — Claude Code, openclaw, Gemini — submits a task to Porter; Porter decides who handles it.

**Plan:**

*Part A — Routing logic:*
1. Task `tags[]` matched against agent `capabilities[]` from /api/pep/nodes.
2. Priority order: prefer online agents → prefer agents with most specific capability match → prefer least loaded (fewest in_progress tasks).
3. `route_task(task_id)` function: returns best agent_id or None if no match.
4. Auto-routing: on `create`, if `assigned_agent_id` is omitted, call `route_task()` and assign automatically.
5. Manual override: `assign` action in /api/tasks sets assigned_agent_id explicitly.

*Part B — Agent work queue:*
6. `GET /api/tasks?assigned_to=<agent_id>&status=pending` — agents poll this to find their queue.
7. `POST /api/tasks` action `claim`: agent atomically claims a pending task (status → in_progress, locked to that agent).
8. `POST /api/tasks` action `add_result`: agent writes outcome; status → complete or failed.

*Part C — Cross-client intake:*
9. Agents authenticated via PEP/1 session token can POST to /api/tasks without a browser session.
10. Porter UI: "Submit task" form accessible to logged-in operator with agent selection dropdown or auto-route.
11. Webhook stub: POST /api/tasks/intake — unauthenticated endpoint protected by a static intake token (set in config). Allows external clients (openclaw, Gemini) to submit tasks without a full session.

*Part D — Dispatch via PEP/1:*
12. When a task is assigned to an online PEP/1 agent, Porter can actively push it: POST /pep/v1/agent/<id>/task with task payload.
13. Agent acknowledges; Porter marks status → in_progress.
14. Fallback: if agent doesn't ack within 30s, revert to pending and re-route.

**Version:** v0.14.3 (routing) → v0.14.4 (dispatch)

**Acceptance:** Submit a task from Claude Code via /api/tasks; Porter routes to a registered PEP/1 agent; agent claims it; result is visible in task board.

---

## Sprint 8 — Tranche D2: Project scoping UI

**Goal:** Make scope impact visible in Configure workspace. Built on top of the project registry (D1) and task registry (G1/G2).

**Plan:**
1. Configure navigator grouping:
   - "Global Shared" section (global workspace files)
   - "Project: <name>" section (project-scoped files)
   - "Agent-Specific" section (agent overrides for current project)
2. Source badge per file row: colored chip showing Global / Project / Agent.
3. Sticky scope legend in workspace header: "You are editing: [scope]".
4. Save confirmation includes scope: "Save to Project file?" etc.
5. Actions: Promote to global / Reset to inherited / Copy to agent override.
6. Projects panel: show task count per project (pending / in_progress) sourced from task registry.

**Version:** v0.15.x

**Acceptance:** User can always tell what scope they're editing; save confirms scope; project panel shows live task counts.

---

## Sprint 9 — Tranche E1: Real agent connectivity test

**Goal:** Replace heartbeat inference with a true hello↔ack roundtrip.

**Plan:**
1. Hub generates a short-lived challenge token (16 bytes, 30s TTL, stored in runtime/).
2. Hub sends challenge via POST /pep/v1/agent/<id>/ping with token.
3. Agent reflects token in response within timeout.
4. Modal shows: latency in ms, success/failure reason, agent version.
5. Remove (preview) qualifier from "Connectivity check" once live.

**Version:** v0.16.x

**Acceptance:** Connectivity check reflects real agent response, not heartbeat age.

---

## Sprint 10 — Tranche F: Working scheduler

**Goal:** Schedules actually execute jobs. Integrates with task registry — scheduled jobs create tasks.

**Plan:**
1. Background daemon thread starts with server, checks schedules every 60s.
2. Cron expression parser (stdlib only): support @daily, @hourly, HH:MM daily, and basic "every Nm" intervals.
3. Job execution: POST to agent's configured endpoint, or create a task in the task registry for agent pickup.
4. Job state persisted: runtime/schedules/<schedule_id>/runs/<timestamp>.json.
5. UI: last-run status, next-run time, run history log (last 10 runs) per schedule card.
6. Remove PREVIEW badge from Schedules module.

**Version:** v0.17.x

**Acceptance:** A scheduled job fires at the correct time, creates a task (or calls an agent directly), and its result is visible in UI.

---

## Phase B (Monolith split) — DEFERRED

Splitting porter.py into modules is the right long-term move but is the highest-risk operation we can do. It will happen after all features in Sprints 1–10 are stable and the task registry is proven in production.

Deferral conditions:
- All Sprints 1–10 done and verified stable.
- The split will be one module at a time (one sprint per module).

---

## Gaps identified (flagged, not yet scheduled)

1. **OpenTelemetry/Prometheus**: Full OTel requires pip packages we can't install without
   approval. Sprint 4 uses stdlib approximation. Will need explicit pip approval to go further.

2. **ymc.capital/ inside porter/**: This directory appears to be in the wrong place —
   CLAUDE.md says it should be at /home/lobster/documents/ymc.capital/ (sibling to porter/).
   Not moving without user confirmation.

3. **Session memory flush**: No deterministic session flush pipeline. Now that Sprint 5 D1
   (project registry) and Sprint 6 G1 (task registry) are scoped, the flush pipeline can be
   designed: on session end, agent updates task status in Porter + flushes context to
   project MEMORY.md. Schedule after G2 is shipped.

4. **v0.12.85 changelog dedup**: porter.py still has 6 changelog entries all labeled v0.12.85
   (from early sessions). Minor cosmetic issue, can fix opportunistically.

5. **CLAUDE.md references rollout-plan.md**: The file is now in .trash/. CLAUDE.md should
   be updated to reference MASTER_EXECUTION_PLAN.md instead.

6. **checkpoint.md deprecation path**: Once the task registry (G1) is live, checkpoint.md
   becomes redundant. Tasks replace checkpoints as the durable record. Migrate gracefully —
   import any in_progress checkpoint.md files into the task registry on first boot after G1
   ships. Then deprecate checkpoint.md format.
