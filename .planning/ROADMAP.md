# Roadmap: Porter

## Milestones

- ✅ **v1.0 Foundation + Core Platform** — Phases 1-7 (shipped 2026-03-21)
- ✅ **v2.0 Backend Ready** — Phases 8-15 (shipped 2026-03-24)
- ✅ **v3.0 Porter Bridge** — Phases 16-23 (shipped 2026-03-25) — AI gateway, model intelligence, smart routing
- ⏸️ **v4.0 The Arena** — Phases 24-30 (6/7 shipped, Phase 28 Battle Arena deferred)
- ✅ **v5.0 Living Skills** — Phases 31-39 (shipped 2026-04-03) — Skills as live behavioral modules, bridge task dispatch
- 🚧 **v6.0 The Orchestration Platform** — Phases 40-47 (active) — Task decomposition, inter-agent messaging, autonomous job queues, project monitoring, project substrate

## Phases

<details>
<summary>v1.0 Foundation + Core Platform (Phases 1-7) — SHIPPED 2026-03-21</summary>

| Phase | Name | Key Deliverables |
|-------|------|------------------|
| 1 | Foundation | CSS variable architecture, exception handling, SQLite pooling, project migration, Fastify baseline, boot sequence |
| 2 | Memory V2 | 4-layer memory (directives/concepts/episodes/signals), Cortex removal (194KB deleted), noise filter, real-time feed |
| 3 | Route Migration | Lean system prompts, Fastify /api/v1/* for auth/projects/agents, React login/register, design tokens |
| 4 | Agent Autonomy | Scheduler (2s tick), AI router, event triggers, activity log, ephemeral agents, feature flags |
| 5 | Guided Wizard | Conversational project creation, auto agent assignment, project dashboard, GSD plan mode |
| 6 | Real-Time Transparency | SSE singleton, 6 pollers killed, agent activity feed, health panel, decision log |
| 7 | External Connections | Credential encryption, GitHub/email/calendar/WhatsApp integrations, OAuth flows, external dispatcher |

30/30 requirements complete. 35 Playwright tests green. Version v0.34.23.

</details>

<details>
<summary>v2.0 Backend Ready (Phases 8-15) — SHIPPED 2026-03-24</summary>

- [x] Phase 8: API Foundation — Consistent envelopes, error codes, trace IDs, OpenAPI spec (2026-03-21)
- [x] Phase 9: Streaming Chat — Token-by-token SSE from all AI backends, mid-stream cancellation (2026-03-22)
- [x] Phase 10: Collaborative Sessions — Invite by email, per-project roles, RBAC enforcement (2026-03-22)
- [x] Phase 11: Unified Chat & CRM Schema — Single conversation model, multi-value CRM, file associations (2026-03-22)
- [x] Phase 12: CRM Intelligence & Agent Templates — AI contact analysis, 103 agent templates, one-call instantiation (2026-03-22)
- [x] Phase 13: Autonomous Learning — Web/GitHub/Reddit knowledge acquisition, concept storage with source attribution (2026-03-22)
- [x] Phase 13.05: PostgreSQL Migration — SQLite to PostgreSQL 16 + pgvector, all schemas/queries/FTS ported (2026-03-24)
- [x] Phase 13.1: Memory V3 State Engine — Structured directives/notes, tiered injection, consolidation, agent self-edit (2026-03-24)
- [x] Phase 15: Skills & Tools Architecture — DB registry, CRUD APIs, junction tables, visibility controls, forge integration (2026-03-24)

38/41 requirements complete (3 billing deferred).

</details>

<details>
<summary>v3.0 Porter Bridge (Phases 16-23) — SHIPPED 2026-03-25</summary>

- [x] Phase 16-23: Gateway foundation, provider adapters, resilience, model catalog, smart routing, first-run setup, bridge admin, integration & multi-tenant

46/46 requirements complete. Version v3.3.2.

</details>

<details>
<summary>v4.0 The Arena (Phases 24-30) — PARTIAL (6/7 shipped)</summary>

- [x] Phase 24: Schema Migration — RPG tables, battle tables, session registry, intelligence patterns
- [x] Phase 25: RPG Engine — Stat calculation, XP/level/star/rarity, .md regeneration
- [x] Phase 26: Forge Unification — Nav merge, 4-tab shell, armory absorbs skills/tools
- [x] Phase 27: Character Sheet UI — Pentagon stats, rarity borders, vitals, passive tree
- [ ] Phase 28: Battle Arena — DEFERRED to v6.0
- [x] Phase 29: Session Registry + Message Bus — Per-session tokens, context pressure, envelope protocol
- [x] Phase 30: Intelligence Loop + Bridge Operator — Pattern extraction, concept promotion, Vigil surfaces

</details>

<details>
<summary>v5.0 Living Skills (Phases 31-39) — SHIPPED 2026-04-03</summary>

- [x] Phase 31: Source of Truth Cleanup — DB assignments canonical, SKILLS.md = generated manifest (completed 2026-04-02)
- [x] Phase 32: Skill Pack Explorer — View/edit real .md files, quality diagnostics (completed 2026-04-02)
- [x] Phase 33: Runtime Skill Selector — Rank skills per task, inject packs, log selection (completed 2026-04-02)
- [x] Phase 34: Feedback Telemetry — Capture signals, effectiveness scoring (completed 2026-04-02)
- [x] Phase 35: Agent Evolution Loop — Recommendations, proposed changes, supervised apply (completed 2026-04-03)
- [x] Phase 36: Skill Quality Scoring — Real quality tiers, audit job (completed 2026-04-03)
- [x] Phase 37: Template Skill UX — Assignment authoring, effectiveness display (completed 2026-04-03)
- [x] Phase 38: Adaptive Agent Context — Smart directive injection, agent self-querying, deep execution, context compression (completed 2026-04-03)
- [x] Phase 39: Bridge Task Dispatch — CLI gateways dispatch real tasks with tool access, lifecycle tracking, SSE streaming, admin visibility (completed 2026-04-03)

30/30 requirements complete. Version v5.2.0.

</details>

### v6.0 The Orchestration Platform (Active)

**Milestone Goal:** Transform Porter from a chat router into a real multi-model orchestration platform. Task decomposition engine turns complex requests into parallel DAGs. Inter-agent messaging enables structured delegation. Autonomous job queues let Porter self-assign work. Gateway capabilities drive intelligent dispatch. Project monitoring watches the world per project. Project substrate gives every project a structured container.

- [x] **Phase 40: Gateway Capability Registry** - Per-gateway strengths, cost tiers, context windows, and tool support stored and queried at dispatch time (completed 2026-04-03)
- [x] **Phase 41: Session Intelligence** - Frozen memory snapshots, cross-session FTS search, and dispatch outcome feedback into routing confidence (completed 2026-04-03)
- [x] **Phase 42: Task Decomposition Engine** - Complex requests classified, decomposed into DAGs, executed in parallel, synthesized into coherent responses (completed 2026-04-03)
- [ ] **Phase 43: Inter-Agent Messaging** - Structured agent-to-agent delegation through Porter coordinator with full audit trail
- [x] **Phase 44: Autonomous Job Queue** - Agent jobs pulled by best-matched agents, Porter self-dispatches scheduled work, admin visibility (completed 2026-04-03)
- [x] **Phase 45: Porter Control Plane** - Porter enforces delegation doctrine, depth limits, and approval gates for high-risk actions (completed 2026-04-03)
- [x] **Phase 46: Project Monitoring** - Per-project watchers (web search, RSS, email, custom) run autonomously and surface findings in activity feed (completed 2026-04-03)
- [ ] **Phase 47: Project Substrate** - Every project has a canonical /_system/ directory, structured intake, intelligence ingress, and Atlas agent

## Phase Details

### Phase 31: Source of Truth Cleanup
**Goal**: template_skills and persona_skills junction tables are the single source of truth for all skill assignments — SKILLS.md is a thin generated manifest, skills_text is deprecated, and no skill data is duplicated across DB columns and files
**Depends on**: Phase 30 (v4.0 complete)
**Requirements**: SOT-01, SOT-02, SOT-03, SOT-04, SOT-05, SOT-06
**Success Criteria** (what must be TRUE):
  1. Running `SELECT COUNT(*) FROM template_skills` returns a number matching the total skill assignments across all 107 templates (migrated from JSONB arrays)
  2. persona_skills references skill IDs (not names) and the existing 17 porter-core rows are migrated to use skill IDs
  3. Instantiating a template creates persona_skills rows from template_skills and generates a thin SKILLS.md manifest (not from skills_text)
  4. The generated SKILLS.md contains only skill IDs, short descriptions, pack paths, and runtime rules — no prose duplication
  5. Modifying a persona's skill assignments via API regenerates its SKILLS.md within the same request
  6. skills_text column is preserved for backwards compatibility but never read during instantiation
**Plans:** 3/3 plans complete

Plans:
- [x] 31-01-PLAN.md — Schema update + migration script (template_skills population, persona_skills.skill_id)
- [x] 31-02-PLAN.md — Instantiation rewrite + forge Station 2 + SKILLS.md manifest generator
- [x] 31-03-PLAN.md — API toggle/delete endpoints + rpg-engine alignment + regeneration triggers

### Phase 32: Skill Pack Explorer
**Goal**: Admin can inspect and edit the actual skill pack files (.md, guides, examples, metadata) from the browser — not just DB metadata fields — with quality diagnostics that reveal scaffold vs real content
**Depends on**: Phase 31
**Requirements**: PKX-01, PKX-02, PKX-03, PKX-04, PKX-05
**Success Criteria** (what must be TRUE):
  1. Clicking a skill in the admin opens a file tree showing all files in that skill's pack directory
  2. Selecting a file shows its content in an editor pane; saving writes back to disk via API
  3. Pack diagnostics badge shows a quality score: file count, non-empty file count, word count, and scaffold detection (generic boilerplate matching)
  4. Template and agent detail pages have a clickable link on each assigned skill that opens the pack explorer for that skill
  5. Missing or empty files are flagged with warnings in the file tree
**Plans:** 4/4 plans complete

Plans:
- [x] 32-00-PLAN.md — Wave 0 test scaffold (Playwright tests for PKX-01 through PKX-05)
- [x] 32-01-PLAN.md — Backend quality diagnostics + PUT file write endpoint
- [x] 32-02-PLAN.md — Frontend pack explorer page (CodeMirror editor, file tree, diagnostics)
- [x] 32-03-PLAN.md — Quality badges + navigation wiring (skills-studio, marketplace, agent-detail)

### Phase 33: Runtime Skill Selector
**Goal**: Porter selects the right skills at dispatch time — gathering assigned skills, ranking them against the task, injecting only the top matches into the prompt, and logging what was used and why
**Depends on**: Phase 31
**Requirements**: RTS-01, RTS-02, RTS-03, RTS-04, RTS-05
**Success Criteria** (what must be TRUE):
  1. A dispatch for an agent with 5 assigned skills selects 0-3 based on task relevance — not all 5
  2. The skill selector uses description, triggers, tags, and historical success rate to rank candidates
  3. Selected skill pack content (prompt.md + SKILL.md) is injected into the dispatch system prompt between memory tiers and gateway instructions
  4. Every dispatch record in bridge_dispatch_log includes a skills_used JSONB column with candidate list, selected list, and scores
  5. An agent with no assigned skills or no relevant skills dispatches normally without skill injection
**Plans:** 2/2 plans complete

Plans:
- [x] 33-01-PLAN.md — Migration (skills_used JSONB) + skill-selector.ts service (scoring, pack reading)
- [x] 33-02-PLAN.md — Chat pipeline wiring + dispatch logging integration

### Phase 34: Feedback Telemetry
**Goal**: Every dispatch outcome produces a structured feedback signal linked to the skills that were used — enabling per-skill effectiveness measurement that actually means something
**Depends on**: Phase 33
**Requirements**: FBK-01, FBK-02, FBK-03, FBK-04, FBK-05
**Success Criteria** (what must be TRUE):
  1. skill_feedback_events table exists with persona_id, skill_id, dispatch_id, event_type (positive/negative/correction/retry/abandon/success), and note columns
  2. Thumbs up/down on a chat response creates feedback events for all skills that were active during that dispatch
  3. Each persona_skill row has live aggregated stats: times_selected, times_completed, positive/negative counts, effectiveness_score (computed from feedback ratio)
  4. Admin can view per-skill effectiveness on skill detail, agent detail, and template detail pages
  5. Effectiveness scores are queryable via API: GET /api/admin/skills/:id/effectiveness and GET /api/admin/agents/:id/skill-effectiveness
**Plans:** 4/4 plans complete

Plans:
- [x] 34-00-PLAN.md — Playwright test scaffold for FBK-01 through FBK-05 (Wave 0)
- [x] 34-01-PLAN.md — Migration (skill_feedback_events + persona_skills counters) + dispatch_id lifecycle + times_selected
- [x] 34-02-PLAN.md — Feedback POST endpoint + chat thumbs-up/down UI
- [x] 34-03-PLAN.md — Admin effectiveness API endpoints + UI on detail pages

### Phase 35: Agent Evolution Loop
**Goal**: Feedback patterns drive concrete skill recommendations that admin can review and approve — closing the loop from "skill was used" to "skill inventory changed because of measured performance"
**Depends on**: Phase 34
**Requirements**: EVO-01, EVO-02, EVO-03, EVO-04, EVO-05
**Success Criteria** (what must be TRUE):
  1. A background job (runs every 6 hours) analyzes feedback patterns per agent and generates recommendations: add skill, remove skill, rewrite prompt, enrich examples
  2. Recommendations are stored in a skill_evolution_proposals table with proposed_change JSONB, reasoning, triggering_feedback_ids, and status (pending/approved/rejected)
  3. Admin UI shows pending proposals with diffs (what would change) and approve/reject buttons
  4. Approving a proposal updates persona_skills, regenerates SKILLS.md, and logs the evolution event
  5. Evolution event log shows timeline of what changed, why, which feedback triggered it, and whether effectiveness improved after the change
**Plans:** 3/3 plans complete

Plans:
- [x] 35-01-PLAN.md — Test scaffold + migration (evolution tables) + analyzer service + scheduler hook
- [x] 35-02-PLAN.md — Admin API endpoints (list/approve/reject proposals) + SKILLS.md regeneration
- [x] 35-03-PLAN.md — Admin UI Evolution tab (proposals list, diff view, approve/reject, event timeline)

### Phase 36: Skill Quality Scoring
**Goal**: Every skill has a measurable quality score that distinguishes scaffold filler from production-ready content — admin can see at a glance which skills are real and which need work
**Depends on**: Phase 34
**Requirements**: QLT-01, QLT-02, QLT-03, QLT-04, QLT-05
**Success Criteria** (what must be TRUE):
  1. Every skill has a quality_score (0-100) computed from: file completeness (20%), content specificity (20%), example count (15%), guide richness (15%), prompt uniqueness (10%), usage frequency (10%), effectiveness score (10%)
  2. Quality tiers are derived from score: scaffold (0-25), baseline (26-50), production (51-75), high-performing (76-100), stale (any score + no usage in 30 days)
  3. Skills table and marketplace show quality tier badges with color coding instead of ready/partial/missing
  4. Admin can filter skills by quality tier in both table and grid views
  5. A quality audit API endpoint scores all skills and returns a report of scaffolds needing enrichment
**Plans:** 3/3 plans complete

### Phase 37: Template Skill UX
**Goal**: Template detail view is the command center for skill configuration — showing what's assigned, why, how effective each skill is, and letting admin author the skill loadout with priorities and auto-detect settings
**Depends on**: Phase 36
**Requirements**: TUX-01, TUX-02, TUX-03, TUX-04, TUX-05
**Success Criteria** (what must be TRUE):
  1. Template detail shows all assigned skills from template_skills with each skill's description, quality tier, and assignment rationale
  2. Admin can add, remove, and reorder skills on a template with drag-and-drop or manual sort
  3. Each skill on a template can be marked mandatory (always selected) or optional (subject to runtime auto-detection)
  4. Template detail shows aggregated skill effectiveness across all agents spawned from that template
  5. A "preview" feature shows which skills would be auto-selected for a sample task prompt
**Plans:** 2/2 plans complete

Plans:
- [x] 37-01-PLAN.md — DB migration (is_mandatory, assignment_rationale) + 5 admin API endpoints (CRUD + preview)
- [x] 37-02-PLAN.md — Frontend TemplateSkillsTab component + agent-detail.tsx wiring

### Phase 38: Adaptive Agent Context
**Goal**: Dispatched agents interact intelligently with Porter's memory and context systems — querying directives/concepts on demand instead of receiving bulk injection, managing deep multi-turn execution without context decay, and compressing tool outputs to maximize effective token budget
**Depends on**: Phase 35, Phase 36
**Requirements**: ACX-01, ACX-02, ACX-03, ACX-04, ACX-05
**Success Criteria** (what must be TRUE):
  1. Agents can execute SQL queries against the concepts and directives tables during dispatch — retrieving task-relevant context on demand instead of receiving all directives in the system prompt
  2. memory-injection.ts selects directives based on task type, active skills, and conversation context — injecting only the relevant subset (measured: avg injected directives < 50% of total active directives)
  3. Bridge supports 50+ turn agent sequences with automatic context summarization — tool call results beyond turn N are compressed to preserve token budget without losing key facts
  4. Verbose tool call results (>500 tokens) are automatically summarized before being appended to conversation history, with full results available via a recall mechanism if needed
  5. Context pressure metrics (tokens used, turns elapsed, compression events) are logged per dispatch in bridge_dispatch_log for observability
**Plans:** 3/3 plans complete

Plans:
- [x] 38-01-PLAN.md — Context-aware directive injection (directive scoring, tags migration, selective Tier 2)
- [x] 38-02-PLAN.md — Deep execution & tool output compression (context-compressor service, 70%/85% triggers)
- [x] 38-03-PLAN.md — Context pressure observability (context_stats JSONB, admin UI charts)

### Phase 39: Bridge Task Dispatch
**Goal**: Bridge can dispatch real tasks to CLI gateways (Codex, Gemini, Claude) where the model has full tool access — reading files, running commands, editing code. Chat dispatch unchanged.
**Depends on**: Phase 38 (v5.0 complete)
**Requirements**: BTD-01, BTD-02, BTD-03, BTD-04, BTD-05
**Success Criteria** (what must be TRUE):
  1. POST /api/v1/tasks/dispatch accepts prompt + cwd + optional gateway, validates cwd against allowlist, returns 202 with task_id
  2. CLI adapters (Claude, Gemini, Codex) execute tasks via TaskExecutor with correct tool-access flags (--bare --dangerously-skip-permissions, --yolo, --dangerously-bypass-approvals-and-sandbox)
  3. Task output streams via SSE events (bridge:task-progress for incremental output, bridge:task-complete for final result)
  4. bridge_tasks table tracks full lifecycle (queued -> running -> complete/failed/cancelled) with output, duration, exit code, gateway used
  5. Admin can view running/completed tasks with output via GET /api/admin/bridge/tasks
**Plans:** 3/3 plans complete

Plans:
- [x] 39-01-PLAN.md — Types + DB schema + migration + TaskExecutor class
- [x] 39-02-PLAN.md — REST API routes (dispatch, poll, cancel, list) + SSE wiring
- [x] 39-03-PLAN.md — Admin bridge panel task visibility endpoints

---

### Phase 40: Gateway Capability Registry
**Goal**: Every gateway has a structured capability record — strengths, cost tier, context window, tool support, agentic flag — so dispatch decisions are driven by what each gateway can actually do, not guess-work
**Depends on**: Phase 39 (v5.0 complete)
**Requirements**: GWC-01, GWC-02, GWC-03, GWC-04
**Success Criteria** (what must be TRUE):
  1. Every gateway (Claude CLI, Codex CLI, Gemini CLI, OpenClaw, Ollama) has a capabilities record with strengths, cost_tier, context_window, tool_support, and agentic flag queryable via API
  2. A task dispatch with explicit requirements (e.g., "needs tool support") routes to a gateway that satisfies those requirements, not just the default gateway
  3. Sending a tool schema to a gateway that does not support tools results in the schema being stripped before the request is sent — verified by observing the outgoing payload
  4. All 5 gateways successfully complete a sample task dispatch with tool execution through the unified task dispatch pathway
**Plans**: 2 plans

Plans:
- [x] 40-01-PLAN.md — Capability registry types, constant map, migration, startup-detector wiring (GWC-01)
- [x] 40-02-PLAN.md — Capability-aware dispatch, tool filtering, CLI allowlists, admin display (GWC-02, GWC-03, GWC-04)

### Phase 41: Session Intelligence
**Goal**: Session memory is frozen at start and never mutated mid-session; agents can search across past sessions; dispatch outcomes feed back into routing confidence so Porter learns which gateways perform best
**Depends on**: Phase 40
**Requirements**: SIN-01, SIN-02, SIN-03
**Success Criteria** (what must be TRUE):
  1. System prompt injected at session start is identical at turn 1 and turn 50 of the same session — no mid-session memory mutations observed
  2. An agent can issue a cross-session search query and receive ranked results from past sessions matching a keyword or topic
  3. After 10 dispatches to a gateway with measurable outcomes, the routing confidence score for that gateway changes — queryable via admin API
**Plans:** 3/3 plans complete

Plans:
- [ ] 41-01-PLAN.md — Migration + frozen memory snapshot service + ai-router wiring (SIN-01)
- [ ] 41-02-PLAN.md — Cross-session FTS search service + REST endpoint (SIN-02)
- [ ] 41-03-PLAN.md — Outcome scoring + routing confidence feedback loop (SIN-03)

### Phase 42: Task Decomposition Engine
**Goal**: Complex requests are classified, broken into a dependency DAG, executed with parallelism where possible, and synthesized back into a single coherent response — the user sees one answer, Porter ran many agents
**Depends on**: Phase 40
**Requirements**: TDE-01, TDE-02, TDE-03, TDE-04, TDE-05
**Success Criteria** (what must be TRUE):
  1. A single-step request dispatches directly without decomposition; a multi-step request produces a task_nodes DAG before any subtask is executed
  2. Two independent subtasks in a DAG execute in parallel — both start before either completes
  3. A subtask that fails triggers the joiner to either retry that node, replan it with a different approach, or surface an escalation to the user — not silently drop the result
  4. Completing all DAG nodes triggers a synthesis step that combines subtask outputs into one coherent response returned to the caller
  5. Admin can inspect any decomposed task: see the full DAG, each node's status, assigned gateway, output, and duration
**Plans:** 4/4 plans complete

Plans:
- [ ] 42-01-PLAN.md — Migration (task_nodes table) + TDE types + task classifier (TDE-01)
- [ ] 42-02-PLAN.md — Task planner (LLM DAG generation + validation) + DAG executor (parallel dispatch) (TDE-02, TDE-03)
- [ ] 42-03-PLAN.md — Task joiner (synthesis + failure handling) + decomposition engine entry point + chat.ts integration (TDE-04, TDE-05)
- [ ] 42-04-PLAN.md — Admin REST endpoints for DAG inspection (TDE-05)

### Phase 43: Inter-Agent Messaging
**Goal**: Agents can formally hand off work to other agents through Porter as the central coordinator — every message has a correlation ID, hop limit, and full audit trail, so delegation is transparent and bounded
**Depends on**: Phase 40
**Requirements**: IAM-01, IAM-02, IAM-03, IAM-04
**Success Criteria** (what must be TRUE):
  1. An agent can dispatch a structured work item to another agent via /api/v1/bridge/agent-message and receive a structured response back
  2. Every inter-agent message chain has a correlation ID visible in the msg_bus_events table along with hop count and full message history
  3. All inter-agent messages pass through Porter as coordinator — direct peer-to-peer routing is blocked and logged as a violation
  4. A subtask response from a delegated agent is automatically fed back into the decomposition engine for inclusion in the final synthesis
**Plans:** 1/2 plans executed

Plans:
- [ ] 43-01-PLAN.md — Agent delegation service + peer-to-peer guard (IAM-01, IAM-02, IAM-03)
- [ ] 43-02-PLAN.md — DAG executor delegation wiring + joiner synthesis integration (IAM-01, IAM-04)

### Phase 44: Autonomous Job Queue
**Goal**: Porter maintains a persistent job queue where structured work items are matched to the best available agent by skills and gateway capabilities — and Porter can self-enqueue jobs without human trigger
**Depends on**: Phase 42, Phase 43
**Requirements**: AJQ-01, AJQ-02, AJQ-03, AJQ-04
**Success Criteria** (what must be TRUE):
  1. agent_jobs table stores work items with full status lifecycle (queued → assigned → running → complete/failed) visible in DB and via API
  2. A job requiring a specific skill routes to an agent that has that skill assigned — a job requiring tool support routes to a gateway that supports tools
  3. Porter self-enqueues a scheduled job (e.g., health check, monitoring sweep) without any human-initiated request — verified by observing a job with source=system in the queue
  4. Admin can view the live job queue, running jobs, completed jobs, and assignment history with gateway, agent, duration, and outcome for each
**Plans:** 2/2 plans complete

Plans:
- [ ] 44-01-PLAN.md — Migration + job-assignment service + scheduler self-scheduling (AJQ-01, AJQ-02, AJQ-03)
- [ ] 44-02-PLAN.md — Admin API endpoints + JobQueuePanel frontend (AJQ-04)

### Phase 45: Porter Control Plane
**Goal**: Porter operates as master orchestrator with enforced boundaries — it decides between direct answer, handoff, parallel execution, or escalation, limits subagent recursion depth, and gates high-risk actions behind approval
**Depends on**: Phase 42, Phase 43
**Requirements**: PCP-01, PCP-02, PCP-03
**Success Criteria** (what must be TRUE):
  1. Porter's persona applies the delegation doctrine on every dispatch — simple requests answer directly, complex requests delegate, ambiguous requests escalate — with the chosen strategy logged per dispatch
  2. A subagent that attempts to spawn another subagent at hop depth 3 is blocked — the request is rejected and the limit violation is recorded in the audit log
  3. A dispatch requesting a high-risk action (code mutation, external API call, file deletion) is paused pending user approval — the action does not execute until the approval event is received
**Plans:** 2/2 plans complete

Plans:
- [ ] 45-01-PLAN.md — Delegation doctrine service + dispatch strategy logging + depth limit enforcement (PCP-01, PCP-02)
- [ ] 45-02-PLAN.md — Approval gates for high-risk actions + REST endpoints + delegation pipeline integration (PCP-03)

### Phase 46: Project Monitoring
**Goal**: Every project can have autonomous watchers — scheduled agents that monitor external sources (web, RSS, email) and surface relevant findings in the project's activity feed without manual polling
**Depends on**: Phase 44
**Requirements**: PMN-01, PMN-02, PMN-03, PMN-04, PMN-05
**Success Criteria** (what must be TRUE):
  1. Admin can create a watcher for a project by specifying type (web_search, rss_feed, email_monitor, custom), schedule, and config — watcher record persists in project_watchers table
  2. All four watcher types execute on schedule and produce structured output — verified by seeing fresh watcher results in the DB after a scheduled run completes
  3. Watcher findings appear in the project activity feed with a source badge (web/rss/email/custom), summary text, and expandable detail — not a raw dump
  4. A finding marked as important triggers a notification visible in the in-app feed, and optionally sends an email if configured
  5. Admin ops view shows all active watchers across all projects with last run time, next run time, and resource usage
**Plans:** 3/3 plans complete

Plans:
- [ ] 46-01-PLAN.md — Migration (project_watchers + watcher_findings) + watcher execution service + scheduler integration (PMN-01, PMN-02)
- [ ] 46-02-PLAN.md — Activity feed integration + notification pipeline + CRUD API (PMN-03, PMN-04)
- [ ] 46-03-PLAN.md — Admin ops panel frontend (PMN-05)

### Phase 47: Project Substrate
**Goal**: Every project folder is a structured container — a canonical /_system/ directory, defined intake and work directories, intelligent file ingress that classifies and routes uploads, and an Atlas agent watching for structural drift
**Depends on**: Phase 46
**Requirements**: PSB-01, PSB-02, PSB-03, PSB-04
**Success Criteria** (what must be TRUE):
  1. Creating a project automatically provisions a /_system/ directory containing project.md, checkpoint.md, memory.md, decisions.md, tasks.md, and agents.md
  2. A new project folder has all canonical directories present: /_system/, /intake/, /context/, /work/, /outputs/, /archive/
  3. Uploading a file to a project triggers the intelligence ingress pipeline: file is classified, moved to the correct directory, a signal is emitted to Memory V2, and the project context document is updated
  4. Atlas agent detects and repairs structural drift — missing directories are recreated, misplaced files are flagged, and the repair is logged in project activity
**Plans:** 2 plans

Plans:
- [ ] 43-01-PLAN.md — Agent delegation service + peer-to-peer guard (IAM-01, IAM-02, IAM-03)
- [ ] 43-02-PLAN.md — DAG executor delegation wiring + joiner synthesis integration (IAM-01, IAM-04)

## Progress

**Execution Order:**
v6.0 phases execute in order: 40 → 41 (can parallel 40) → 42 → 43 (can parallel 42) → 44 → 45 (can parallel 44) → 46 → 47.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7 | v1.0 | - | Complete | 2026-03-21 |
| 8-15 | v2.0 | - | Complete | 2026-03-24 |
| 16-23 | v3.0 | - | Complete | 2026-03-25 |
| 24-30 | v4.0 | 17/17 | Partial (28 deferred) | 2026-04-02 |
| 31. Source of Truth | v5.0 | 3/3 | Complete | 2026-04-02 |
| 32. Skill Pack Explorer | v5.0 | 4/4 | Complete | 2026-04-02 |
| 33. Runtime Skill Selector | v5.0 | 2/2 | Complete | 2026-04-02 |
| 34. Feedback Telemetry | v5.0 | 4/4 | Complete | 2026-04-02 |
| 35. Agent Evolution Loop | v5.0 | 3/3 | Complete | 2026-04-03 |
| 36. Skill Quality Scoring | v5.0 | 3/3 | Complete | 2026-04-03 |
| 37. Template Skill UX | v5.0 | 2/2 | Complete | 2026-04-03 |
| 38. Adaptive Agent Context | v5.0 | 3/3 | Complete | 2026-04-03 |
| 39. Bridge Task Dispatch | v5.0 | 3/3 | Complete | 2026-04-03 |
| 40. Gateway Capability Registry | v6.0 | 2/2 | Complete | 2026-04-03 |
| 41. Session Intelligence | 3/3 | Complete    | 2026-04-03 | - |
| 42. Task Decomposition Engine | 4/4 | Complete    | 2026-04-03 | - |
| 43. Inter-Agent Messaging | 1/2 | In Progress|  | - |
| 44. Autonomous Job Queue | 2/2 | Complete    | 2026-04-03 | - |
| 45. Porter Control Plane | 2/2 | Complete    | 2026-04-03 | - |
| 46. Project Monitoring | 3/3 | Complete   | 2026-04-03 | - |
| 47. Project Substrate | v6.0 | 0/TBD | Not started | - |
