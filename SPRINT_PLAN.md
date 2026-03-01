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

## Sprint 7 — COMPLETE: Projects: Memory Visualization (v0.14.18, 2026-02-28)

**Goal:** Make the project knowledge system visible. Show users how Porter tracks project state through .md files.

**What was done:**
- Memory file chain viewer: 6 canonical files per project with exist/missing icons, sizes, ages
- Collapsible file chain section with exists count badge (e.g. "3/6")
- Project type system: manual (indigo, sprint progress) vs autonomous (amber, no progress bar)
- Config slide-out panel via gear icon: name, type, memory isolation, save/delete
- Backend: GET /api/projects/{id}/files, POST update action
- Settings option in project context menu

---

## Sprint 8 — Integration visibility (read from OpenClaw) ✅

**Goal:** Surface what external services OpenClaw already connects to. Porter displays — OpenClaw owns the connections.

**Scope:**

1. ✅ **Integrations panel** in Extensions tab: reads OpenClaw's skill registry, auth profiles, hooks, sessions, and model providers from disk.
2. ✅ **Per-agent capabilities:** Skills displayed in 3-column grid showing all registered agent skills (coding-agent, gemini, gog, weather, etc.).
3. ✅ **Connection status:** Green/red indicator per integration with auth expiry countdown.
4. ✅ **No connector building.** Porter reads only — OpenClaw owns the connections.

**Version:** v0.14.20

**Completed:** 2026-02-28

**Acceptance:** Extensions tab shows OpenClaw integrations (gateway, auth profiles, model providers, hooks, sessions) with status badges. Skills grid shows agent capabilities.

---

## Sprint 9 — Hardcoding elimination pass ✅

**Goal:** Systematic removal of all remaining hardcoded paths, hosts, ports, and machine-specific assumptions. Porter must work from zero on any machine.

**Scope:**

1. ✅ Audited every `/home/lobster/` reference — only 1 real violation found (is_writable), fixed.
2. ✅ `DEFAULT_MOUNTS` — already empty on first run (fixed in Sprint P0).
3. ✅ `CONFIG_PATH`, `RUNTIME_DIR`, `AVATAR_DIR`, `MEMORY_DIR` — all derive from `PORTER_DATA_DIR` (fixed in Sprint P0).
4. ✅ `HOST` — auto-detected via `PORTER_HOST` env var or external IP lookup (fixed in Sprint P0).
5. ✅ All agent workspace paths — respect `PORTER_AGENT_WORKSPACE` / `PORTER_OPENCLAW_STATE` env vars.
6. Tailscale references — already abstracted to "network transport" in Locations module.
7. ✅ `is_writable()` — replaced hardcoded `/home/lobster` with `os.getuid()`.

**Version:** v0.14.21

**Completed:** 2026-02-28

**Acceptance:** `grep '/home/lobster' porter.py` returns only changelog text (no functional code). Porter starts cleanly on any machine.

---

## Sprint 10 — COMPLETE: OpenClaw bridge: task & skill visibility (v0.15.0, 2026-02-28)

**Goal:** Read OpenClaw's task state, cron jobs, and skill registry. Display in Porter UI. Don't duplicate the backend.

**What was done:**

1. ✅ **Skill browser:** New Workflows tab with searchable card grid of 50+ OpenClaw skills. Each card shows emoji, name, description (from SKILL.md frontmatter), and docs link.
2. ✅ **Cron viewer:** Automations section reads `~/.openclaw/cron/jobs.json`. Displays jobs with schedule and recent runs. Currently empty — ready when cron jobs are configured.
3. ✅ **API bridge:** `GET /api/openclaw/skills`, `GET /api/openclaw/cron` — read-only from OpenClaw sandbox dirs.
4. ✅ **Nav reorder:** CC → Orchestration → Extensions → Projects → Workflows → Locations → Files.
5. ✅ **Skills removed from Extensions** — they belong in Workflows.
6. ✅ **Fix:** sort_order=0 falsy bug (JS `||` → `??`).

**Version:** v0.15.0

---

## Sprint 11 — COMPLETE: Real agent connectivity test (v0.15.1, 2026-02-28)

**Goal:** Replace heartbeat inference with true roundtrip ping.

**What was done:**

1. ✅ **HTTP roundtrip ping:** `_ping_agent()` backend function sends actual HTTP requests to agent endpoints. Measures latency with monotonic clock.
2. ✅ **Multi-protocol support:** OpenClaw via gateway HTTP, CLI agents (Claude/Gemini) via binary `--version`, Ollama via `/api/tags`.
3. ✅ **Modal redesigned:** Grid layout showing Status, Latency (ms), Version, Endpoint, Heartbeat. Retest button.
4. ✅ **Smart alive detection:** HTTP 401/403 counts as alive (endpoint reachable, auth is separate concern).
5. ✅ **Button renamed** from "Connectivity check" to "Test connection."

**Version:** v0.15.1

---

## Gap: Skills CRUD — COMPLETE (v0.15.2, 2026-02-28)

**What was done:**

- Installed/All filter toggle (default: installed only, toggle shows all 50).
- Remove skill with confirm dialog (OpenClaw sandbox or manual skills dir).
- Create manual skill form (name, description, emoji, requirements → SKILL.md).
- Backend: `POST /api/openclaw/skills` with `remove` and `create` actions.
- Install status detection fixed: reads OpenClaw `resolvedSkills` (7 installed, not 17). GET handler crash fixed. Create form redesigned.

---

## Gap: v0.12.85 changelog dedup — COMPLETE (v0.15.2, 2026-02-28)

**What was done:**

- 6 duplicate v0.12.85 changelog entries renumbered to v0.12.85–v0.12.90.

---

## Gap: Session memory flush — COMPLETE (v0.15.2, 2026-02-28)

**What was done:**

- Extensions tab shows OpenClaw session logs (11 sessions detected).
- "Flush to memory" button extracts learnings and appends to `session_flushes.md`.

---

## Gap: Local model detection — COMPLETE (v0.15.2, 2026-02-28)

**What was done:**

- Detects Codex CLI, Claude CLI, Gemini CLI, and Ollama models.
- Detected models appear as "detected" cards with dashed borders in Orchestration Models section.
- Expanded PATH search covers systemd service paths for reliable detection.

---

## Gap: Live capability scan on refresh — COMPLETE (v0.15.2, 2026-02-28)

**What was done:**

- All Refresh buttons re-run capability detection (30s TTL cache).
- New CLIs/models detected within 30 seconds of installation.

---

## Gap: checkpoint.md deprecation — COMPLETE (v0.15.2, 2026-02-28)

**What was done:**

- Startup migration marks checkpoint.md as DEPRECATED.
- Task registry is sole source of truth for task state.

---

## Gap: Direct model calling (Quick Prompt) — COMPLETE (v0.15.2, 2026-02-28)

**What was done:**

- Quick Prompt in Command Center: select Ollama model or OpenClaw Gateway, type prompt, get response inline.
- Backend: `POST /api/prompt` sends prompt to selected model and returns response.

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
   - ACP runtime setup (install/enable acpx plugin, configure default + allowed ACP agents, verify ACP health)
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

## Sprint 13 — ACP autonomy controls (SCHEDULED for next release)

**Goal:** Eliminate repetitive Claude/Gemini approval prompts by making approval behavior explicit and configurable inside Porter.

**Scope (release task):**

1. **Approval policy in UI:** Add Settings → Orchestration → "Agent Approval Policy" with default `auto-approve non-destructive` and explicit stop conditions.
2. **Policy propagation:** Persist policy in `porter_config.json` and apply to ACP task dispatch prompts/instructions for Claude/Gemini/Codex.
3. **Pending-approval visibility:** Add a compact panel showing pending approval requests by agent/session with quick actions (Approve safe / Escalate / Deny).
4. **Safety guardrails:** Enforce denylist for destructive/system-level actions regardless of agent prompt behavior.
5. **Trust UX:** Show current policy badge in chat/orchestration views (e.g., `Auto-safe approvals ON`).

**Version target:** v0.23.4

**Acceptance:** Routine shell work proceeds without per-step prompts; high-risk actions still require explicit human confirmation; policy state is visible and auditable.

---

## Gaps identified (flagged, not yet scheduled)

1. **OpenTelemetry/Prometheus**: Needs pip approval for full OTel.

2. **ymc.capital/ inside porter/**: Should be sibling directory. Not moving without user confirmation.

3. ~~**v0.12.85 changelog dedup**~~: DONE (v0.15.2).

4. ~~**Local model detection**~~: DONE (v0.15.2). Ollama + CLI models detected and shown in Orchestration.

5. ~~**Direct model calling**~~: DONE (v0.15.2). Quick Prompt in Command Center.

6. ~~**checkpoint.md deprecation**~~: DONE (v0.15.2). Task registry is sole source of truth.

7. **Workflow creation tool**: Create OpenClaw workflows from Porter UI. Not yet implemented.
