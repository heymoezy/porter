# Porter Sprint Plan
Date: 2026-02-28
Status: Active — single source of truth for implementation sequencing
Governed by: CLAUDE_SLOW_ROLLOUT_MASTER_INSTRUCTIONS.md + MASTER_EXECUTION_PLAN.md

---

## Architecture — Porter's Role

**Porter is the UI and state layer. OpenClaw is the execution engine.**

Porter does NOT rebuild what OpenClaw already provides:
- Model routing → OpenClaw
- Task dispatch → OpenClaw (`gog` orchestrator, `sag` task runner, `coding-agent`)
- Skill registry → OpenClaw (`clawhub`, 50+ installed skills)
- Scheduling/cron → OpenClaw (`~/.openclaw/cron/jobs.json`)
- External integrations → OpenClaw (Gmail hooks, Slack, Discord, Notion skills)

Porter provides what OpenClaw lacks:
- **Web UI / dashboard** — visual layer over all operations
- **File management** — browse, upload, delete across devices
- **Project state visualization** — .md file chain, sprint tracking, memory viewer
- **Configuration UI** — centralized settings across agents and services
- **Network/location management** — device discovery (Tailscale, SSH, VPN — transport-agnostic)
- **Onboarding wizard** — guided first-run setup for new users
- **Operational visibility** — see what's happening across all agents in one place

### Minimum requirements
- **OpenClaw** — execution engine (gateway must be reachable)
- **At least one model** — registered through OpenClaw (Claude, Codex, Gemini, Ollama, etc.)
- **Tailscale is NOT required** — it's one transport option among many (SSH, WireGuard, ZeroTier, direct)

---

## Guiding principles

1. One tranche per Claude session. Stop, report, and hand off cleanly.
2. Never implement outside current tranche scope.
3. Every tranche: version bump + in-app changelog + RELEASE_NOTES.md update.
4. If something's broken, hide it or label it preview. No misleading controls.
5. porter.py is >512KB — Edit tool silently fails. Always use Python scripts to patch.
6. **Porter is environment-agnostic.** No hardcoded paths, hosts, ports, or machine assumptions.
7. **Capability-gated features.** Any feature requiring an external tool must check availability and degrade gracefully.
8. **Don't rebuild OpenClaw.** If OpenClaw already does it, Porter reads from OpenClaw and displays it. Porter is the glass, not the engine.

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

## Sprint 6 — NEXT: Usage dashboard (read from OpenClaw)

**Goal:** Show real usage data on Orchestration cards by reading OpenClaw's existing usage snapshots — not building our own collection pipeline.

**Scope (small + focused):**

1. **Read OpenClaw usage data:** Query OpenClaw gateway status endpoint for each registered agent. Parse usage % and reset window from response.
2. **Cache locally:** Store latest snapshot to `runtime/usage/<agent_id>.json` with timestamp. Refresh on page load, not continuously.
3. **Populate Orchestration cards:** Usage bars on agent and model cards render from cached snapshots. Show "No usage data" gracefully when unavailable.
4. **For non-OpenClaw agents** (Claude direct, Gemini CLI): badge "Manual check" with link to provider dashboard. Don't scrape external dashboards.
5. **Model preference setting:** Add "Preferred model" dropdown in Settings → Orchestration. Stored in porter_config.json. This is informational for now — actual routing is OpenClaw's job.

**Version:** v0.14.17

**Acceptance:** Orchestration tab shows real usage percentages for OpenClaw-connected agents. Non-OpenClaw agents show honest "manual check" badge.

---

## Sprint 7 — Projects: memory visualization

**Goal:** Make the project knowledge system visible. Show users how Porter tracks project state through .md files.

**Scope:**

1. **Memory file viewer:** In each project card, show the .md file chain: `SPRINT_PLAN.md`, `checkpoint.md`, `MEMORY.md`, `lessons.md`. Visual indicator: exists/missing, last modified, size.
2. **Projects vs autonomous tasks:** Add `type` field: `manual` (user-driven, sprint-based) or `autonomous` (agent-driven). Different visual treatment — manual shows sprint progress, autonomous shows run history.
3. **Config exposure:** Project config currently hardcoded in .md files should be editable through the Projects UI.

**Version:** v0.14.18

**Acceptance:** Projects tab visually shows the .md file chain per project. Manual vs autonomous projects are visually distinct.

---

## Sprint 8 — Integration visibility (read from OpenClaw)

**Goal:** Surface what external services OpenClaw already connects to. Porter displays — OpenClaw owns the connections.

**Scope:**

1. **Integrations panel** in Settings: list OpenClaw's connected services by reading its skill registry and config.
2. **Per-agent capabilities:** Show which skills/integrations each agent has access to (email read-only, GitHub, Slack, etc.) with scope labels.
3. **Connection status:** Green/red indicator per integration, sourced from OpenClaw's capability checks.
4. **No connector building.** Porter does not create or manage OAuth tokens, webhooks, or API keys for external services. That's OpenClaw's domain.

**Version:** v0.14.19

**Acceptance:** Settings shows OpenClaw's connected integrations with status. User can see what external access each agent has.

---

## Sprint 9 — Hardcoding elimination pass

**Goal:** Systematic removal of all remaining hardcoded paths, hosts, ports, and machine-specific assumptions. Porter must work from zero on any machine.

**Scope:**

1. Audit every `/home/lobster/` reference in porter.py — replace with config-derived or env-derived paths.
2. `DEFAULT_MOUNTS` → empty on first run, populated via first-run wizard.
3. `CONFIG_PATH`, `RUNTIME_DIR`, `AVATAR_DIR`, `MEMORY_DIR` → derive from `PORTER_DATA_DIR` or XDG defaults.
4. `HOST` → auto-detect or configure, never hardcode a specific IP.
5. All agent workspace paths → optional/detected, not assumed.
6. Tailscale references → abstracted to "network transport" with Tailscale as one detected option.
7. Test: fresh install simulation — rename config, start Porter, verify first-run wizard works.

**Version:** v0.14.20

**Acceptance:** `grep -r 'lobster' porter.py` returns zero hits. Porter starts cleanly with no pre-existing config.

---

## Sprint 10 — OpenClaw bridge: task & skill visibility

**Goal:** Read OpenClaw's task state, cron jobs, and skill registry. Display in Porter UI. Don't duplicate the backend.

**Scope:**

1. **Skill browser:** Read OpenClaw's installed skills (from skill directories). Display as browsable list in Porter with name, description, required capabilities.
2. **Task/cron viewer:** Read `~/.openclaw/cron/jobs.json`. Display scheduled jobs with last run, next run, status.
3. **Skill ↔ project correlation:** When a project's tasks map to known OpenClaw skills, badge them.
4. **API bridge:** `GET /api/openclaw/skills`, `GET /api/openclaw/cron` — thin read-only proxies to OpenClaw state.

**Version:** v0.15.0

**Acceptance:** Porter shows OpenClaw's skills and cron jobs. No duplicate task engine.

---

## Sprint 11 — Real agent connectivity test

**Goal:** Replace heartbeat inference with true roundtrip ping.

**Scope:**

1. Challenge-response: Porter sends token to agent endpoint, agent reflects, Porter measures latency.
2. Modal shows: latency ms, success/failure, agent version.
3. Remove "preview" qualifier from connectivity check.

**Version:** v0.15.1

**Acceptance:** Connectivity check reflects real agent response.

---

## Sprint 12 — Onboarding wizard (FINAL)

**Goal:** Full guided setup experience. New users configure Porter completely before entering the app. Includes tutorial.

**Scope:**

1. **Setup tab** — appears above Command Center in nav. Cannot be dismissed until complete.
2. **Step-by-step flow:**
   - Welcome / what Porter is
   - OpenClaw connection (gateway URL + auth token — validate before proceeding)
   - Model registration (at least one model must be configured)
   - Data directory selection (where Porter stores files)
   - First mount (add at least one file location)
   - Network transport (Tailscale / SSH / none — optional)
   - Capability scan (show what's detected, install hints for missing)
   - Operator password
3. **Tutorial overlay:** Each tab gets a first-visit tooltip explaining what it does. Dismissible, one-time.
4. **Completion gate:** Setup tab shows green checkmarks per step. All required steps must pass before app unlocks.
5. **Re-enterable:** Settings → "Re-run setup wizard" for reconfiguration.

**Version:** v0.16.0

**Acceptance:** Fresh Porter install → user completes wizard → app unlocks with working config. No manual JSON editing required.

---

## Phase B (Monolith split) — DEFERRED

Splitting porter.py into modules after all features are stable. One module per sprint.

---

## Gaps identified (flagged, not yet scheduled)

1. **OpenTelemetry/Prometheus**: Needs pip approval for full OTel.

2. **ymc.capital/ inside porter/**: Should be sibling directory. Not moving without user confirmation.

3. **v0.12.85 changelog dedup**: 6 entries all labeled v0.12.85. Cosmetic fix.

4. **Local model detection**: Ollama models should appear in Orchestration as callable models (not just as an Extension). Requires model registry that combines agent-linked models + locally detected models.

5. **Direct model calling**: Models not linked to an agent should be callable directly from Porter. Requires a lightweight inference proxy or CLI wrapper. May be handled by OpenClaw bridge.

6. **checkpoint.md deprecation**: Once OpenClaw bridge surfaces task state, migrate in_progress checkpoints on first boot.
