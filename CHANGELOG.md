## v6.14.0 — 2026-05-12 — Bridge claude_cli context isolation (Tom unblock)

**Fixed**
- `claude_cli` Bridge adapter now spawns `claude` with `cwd=/tmp/porter-bridge-sandbox` and `--setting-sources project` so the subprocess does NOT inherit Porter's operating context (CLAUDE.md auto-discovery, `~/.claude/` hooks, auto-memory). Cross-app consumers — notably YMC Tom — go from 60–160s/turn (Porter voice bleeding into Tom's persona) back to ~5s/turn (generic Claude, OAuth preserved).
- Smoke: `claude -p` from sandbox cwd with `--setting-sources project` → "I'm Claude, an AI coding assistant made by Anthropic" in 5.5s. Previously: 12s with "Loaded Porter. Last work: 48.2-02…".

**Changed**
- `/home/lobster/CLAUDE.md` trimmed 196 → 56 lines (2.4KB). Porter-specific bloat moved out; only cross-project essentials remain (session-start, project layout, Bridge URL, coordination rules, hard rules).
- `Porter/CLAUDE.md` trimmed 110 → 57 lines (2.5KB). Repositioned Porter as background services platform (Bridge / Intelligence / Memory). Product-UI flavor removed.

**Files**
- `backend/src/services/bridge/adapters/claude-cli.ts` — SANDBOX_CWD const + `cwd` in both `dispatch()` and `stream()` spawns + `--setting-sources project` arg
- `/home/lobster/CLAUDE.md`, `/home/lobster/projects/Porter/CLAUDE.md` — trimmed

## v6.1.0 (2026-05-11)

- feat(48.2-04): add POST /transcript/retention-run manual trigger (TRC-06)
- feat(48.2-04): add intellect.transcriptCaptureEnabled global kill switch (TRC-07)
- docs(48.2-03): complete hook-wiring plan (UserPromptSubmit ext + NEW Stop hook + TRC-08 dedup)
- fix(48.2-03): add content+timestamp dedup to insertTurn for TRC-08 idempotency
- docs(48.2-02): complete capture endpoint + shared PII scrub plan
- feat(48.2-02): add POST /api/v1/intellect/transcript/turn endpoint
- feat(48.2-02): add insertTurn capture orchestrator (TRC-04/05/07)
- refactor(48.2-02): extract scrubPII to shared intellect/pii-scrub.ts
- docs(48.2-01): complete session_transcript_turns schema plan
- docs(48.2-05): complete Wave-0 smoke harness plan
- feat(48.2-01): add transcript-retention service + transcript_retain workflow action
- test(48.2-05): add tests/smoke-48.2.sh covering TRC-01..TRC-08
- feat(48.2-01): register migrateTranscriptsV1 + add Drizzle sessionTranscriptTurns binding
- test(48.2-05): add smoke fixtures for transcript capture
- feat(48.2-01): add migrate-transcripts-v1 (session_transcript_turns + retention workflow seed)
- docs(48.2): research phase transcript capture
- plan(48.2): revise per plan-checker — VALIDATION + retry-on-race + bookmark-per-turn + smoke poll + detach
- plan(48.2): transcript capture — 5 plans for Dream Silos series
- docs(checkpoint): v6.12.0 — Phase 48.1 silo-foundation complete
- docs(phase-48.1): complete silo-foundation execution + VERIFICATION + PROJECT.md evolved
- docs(48.1-04): complete session-start hook plan after live-CLI approval
- chore(48.1-04): update coordination ledger — checkpoint-pending


## v6.13.0 — 2026-05-11 — Phase 48.2 Transcript Capture

**Added**
- `session_transcript_turns` table with silo-tagged turn capture, PII-scrubbed content, 30-day retention (TRC-01, TRC-06)
- `POST /api/v1/intellect/transcript/turn` capture endpoint with silo tagging via `detectSilos` and PII scrub via shared pii-scrub helper (TRC-04, TRC-05)
- `POST /api/v1/intellect/transcript/retention-run` manual retention trigger (TRC-06 end-to-end smoke target; production schedule remains daily via the workflow engine)
- Shared `backend/src/services/intellect/pii-scrub.ts` (refactored from `learner.ts` — single source of truth for PII redaction)
- `backend/src/services/intellect/transcript-capture.ts` `insertTurn` orchestrator with server-assigned `turn_index`, `ON CONFLICT DO NOTHING` idempotency, and content+timestamp dedup pre-check (TRC-08)
- `backend/src/services/intellect/transcript-retention.ts` `runTranscriptRetention` helper
- `transcript_retain` workflow action handler registered in `workflow-engine.ts` (daily via `every_24h` schedule)
- UserPromptSubmit hook (`~/.claude/hooks/porter-user-prompt.js`) now writes user turns to `/transcript/turn` fire-and-forget (TRC-02)
- NEW Stop hook (`~/.claude/hooks/porter-stop.js`) parses `transcript_path` JSONL via byte-offset bookmark + writes assistant turns (TRC-03)
- SessionEnd hook now spawns `porter-stop.js` detached + unref'd as a final belt-and-braces tail-parse (Risk 3 / Anthropic Issue #8564 mitigation)
- `intellect.transcriptCaptureEnabled` config flag (default `true`; env `INTELLECT_TRANSCRIPT_CAPTURE_ENABLED`) as global kill switch (TRC-07)
- `/silo none` per-session override remains the primary privacy kill switch (TRC-07)

**Internal**
- Indexes: `UNIQUE(session_id, turn_index)`, `(silo_id, captured_at DESC)`, `(captured_at)` — serves Plan 48.3 read pattern + retention DELETE
- 32KB content cap with `... [truncated: N chars]` suffix
- Stop hook re-fires are idempotent via UNIQUE constraint + ON CONFLICT DO NOTHING + content+timestamp dedup pre-check (TRC-08)
- Stop hook waits 250ms before reading `transcript_path` to avoid the Anthropic Issue #8564 flush race
- Per-turn bookmark advance (not end-of-file write) so partial-batch failure retries only the failed lines on the next Stop fire
- Hooks remain outside the Porter repo at `/home/lobster/.claude/hooks/` (deliberately uncommitted; reproduced verbatim in each plan SUMMARY for re-deployment)
- `/health` and `/api/v1/health` now both report `v6.13.0`

## v6.1.0 (2026-05-11)

- docs(48.1-03): complete /silo slash-command + backend endpoint plan
- feat(48.1-03): add POST /silo-command endpoint for CLI slash command
- docs(48.1-02): complete silo detection + /context injection plan
- fix(48.1-02): parse data.context from /context JSON before grepping directive bodies
- feat(48.1-02): wire silo-detector into /context + startup cache warmup
- feat(48.1-02): add silo-detector service with deterministic detection
- chore(48.1-01): mark plan 01 done in coordination ledger
- docs(48.1-01): complete silo-foundation schema plan
- fix(48.1-05): accept both 't' and 'true' for enabled bool in SC-1
- docs(48.1-05): complete smoke-harness plan
- feat(48.1-01): register migrateSilosV1 in startup and add Drizzle schema entries
- feat(48.1-01): add migrate-silos-v1 with silos table, session_silo_overrides, and moe-direct immutability trigger
- test(48.1-05): add Phase 48.1 smoke harness for SC-1..SC-6
- plan(48.1): silo foundation — verified plans for Dream Silos series
- docs(48.1): add validation strategy
- docs(48.1): research phase silo foundation
- docs(48.1): generate context from dreams pipeline spec
- docs(checkpoint): v6.11.0 — bridge revival summary
- feat(bridge): v6.11.0 — restore tabs, summary metrics, live ticker
- fix(bridge): v6.10.0 — separate CLI tool observability from real dispatches
- refactor(bridge): strip page to health bar + dispatch log (1,405 → 77 LOC)
- fix(bridge): model rows are display-only, not toggle buttons
- docs(checkpoint): v6.9.0 final — bridge simplification complete
- fix(bridge): add Opus 4.7 + Haiku 4.5, remove agent tabs from bridge page
- fix(bridge): confidence endpoint returns [] not {} — fixes bridge page crash
- docs(checkpoint): v6.9.0 complete — all 5 phases done
- refactor(bridge): remove routing-rules + workspace-overrides (Phase 4+5)
- docs(checkpoint): v6.9.0 — Bridge simplified to Claude CLI only


## v6.12.0 — 2026-05-11 — Phase 48.1 Silo Foundation

**Added**
- `silos` registry table with software seed row (DRM-01)
- `session_silo_overrides` table for per-CLI-session silo override (DRM-04)
- `directive_immutable_moe_direct` Postgres trigger protecting moe-direct directives (DRM-05)
- `silo-detector` service: deterministic silo detection from cwd + project type + cwd_markers (DRM-03)
- `/api/v1/intellect/context` now injects `## Silo: <name> — Operating Rules` section between system and project directives (DRM-02)
- `POST /api/v1/intellect/silo-command` endpoint for `/silo software` / `/silo none` / `/silo` (status)
- UserPromptSubmit hook intercepts `/silo` slash commands and emits `decision:block` JSON
- SessionStart hook reads stdin payload and forwards `session_id` + `cwd` to /context

**Internal**
- In-process silos cache warmed at startup, reloadable via `reloadSiloCache()`
- Bypass for moe-direct mutation: `SET LOCAL porter.allow_moe_direct_mutation = 'true'` per-tx
- `/health` and `/api/v1/health` now both report `v6.12.0` (porter_version field on v1/health bumped from stale `6.9.0`)

## v6.1.0 (2026-04-15)

- chore(release): v6.8.0 — Born model correction + DB trigger enforcement
- feat(forge): template-overlap audit — 22 clusters surfaced for review
- feat(db): born-check trigger on personas — impossible state is now impossible
- feat(forge): birth-templates.ts — canonical template-birth primitive
- fix(forge): Born reads from template content, not persona existence
- fix(autonomy): template=role, instance=character — undo v6.7.0 conflation
- fix(forge): Born counter reflects real personas, not pipeline throughput
- chore(release): v6.7.0 — autonomy launch + bridge openclaw fixes
- feat(autonomy): generic heartbeat job executor + scheduler isolation
- feat(forge): queuemaster ownership of Forge tab
- feat(forge): seed 4 autonomy templates + instances into postgres
- feat(agents): birth 4 autonomy agents via real OpenClaw dispatch
- fix(bridge): openclaw token from canonical config + honor backend override
- feat(agents): enriched persona files from background agent (3-4KB souls)
- fix(bridge): OpenClaw health probe now tests actual dispatch capability
- feat(agents): substantive .md files for 8 operational agents + cleanup


## v6.9.0 (2026-04-17)

- refactor(bridge): Claude CLI only — delete 4 dead adapters, routing-confidence, http-task-executor (~4,000 LOC removed)
- refactor(bridge): simplify routing-engine — no fallback chains, no routing rules eval, no heuristic scoring
- refactor(bridge): simplify startup-detector, usage-collector, model-catalog, task-executor, agent-delegation, dispatch-queues
- refactor(bridge): simplify stream-service — backend param ignored, always Claude CLI
- chore(db): delete non-Claude gateway rows (ollama, openclaw, codex_cli, gemini_cli)
- chore(test): delete routing-rule-consistency + usage-collector tests (dead code)

## v6.8.1 (2026-04-15)

- chore(bridge): remove anthropic_api gateway adapter — Porter doesn't connect directly to Anthropic API
- refactor(bridge): adapter count 6 → 5 (claude_cli, openclaw, ollama, codex_cli, gemini_cli)
- chore(db): delete anthropic-api-gw row; drop anthropic_api from GatewayType union and capability-registry
- chore(seed): autonomy agents now prefer openclaw; persona prompts updated

## v6.1.0 (2026-04-12)

- fix(bridge): enable autonomous tool execution for Porter agent dispatches
- fix(forge): 3 bugs — birth animation loop, empty .md files, broken nav
- fix(skills): proper redesign — compact cards, file info, timestamps, pack explorer link
- feat(bridge): Anthropic API gateway — 6th adapter with server-side tool execution
- feat(skills): complete UX redesign — card grid, detail drawer, tier icons
- docs(checkpoint): all 7 operational phases complete (A-G)
- feat(billing): wire billing routes + add usage metering + plans API
- fix(forge): born agents stay visible in catalogue with green border + date
- feat(agents): enrich research templates with substantive prompts + skills
- feat: marketing landing page at askporter.app
- chore: bump to v6.5.0 — Intellect Phases 1-3, Forge, tools, skills, subscriptions
- docs(checkpoint): Phase E complete — full autonomous evolution loop
- feat(intellect): agent subscription manager — external knowledge ingestion
- docs(checkpoint): v6.4.0 update — tools + skills + evolution complete
- feat(intellect): autonomous skill evolution from dispatch telemetry
- feat(intellect): inject available tools into dispatch + session context
- feat(intellect): tool detector service + expanded registry (23 tools)
- fix(skills): correct skills directory path case (porter → Porter)
- docs(checkpoint): Forge operational — 10 agents born with email
- feat(forge): Station 1 now creates agents directly (no HTTP API call)
- docs(checkpoint): v6.4.0 — operational Porter roadmap + status update
- feat(intellect): skill recommendations in context + episodes in memory injection
- fix(intellect): wire episodes into memory injection + context endpoint
- feat(admin): holistic Intellect integration across 6 admin pages
- feat(intellect): Phase 3 — Autonomy (pruner + self-monitor + pattern miner) plus Phase 2 fixes
- feat(intellect): Phase 2 — Learning layer (corrections → directives, episodes, dispatch scoring)
- docs(checkpoint): Phase 1 Porter Intellect complete, Phase 2 roadmap
- fix(intellect): validate button — handle unique constraint on fuzzy-match auto-fix
- feat(sidebar): add Intellect to Ops nav
- feat(intelligence): add Porter Intellect section to Intelligence page
- fix(intellect): dedupe memory_references with UNIQUE constraint + ON CONFLICT
- feat(intellect): Phase 1.4 — Intellect API with context endpoint + event stream
- feat(intellect): Phase 1.3 — memory validator with reference tracking
- feat(intellect): Phase 1.2 — real-time file watcher with chokidar
- feat(intellect): Phase 1.1 — schema migrations + stale data fix
- feat(email): Porter logo avatar, reply box starts at 2 rows
- fix(email): add min-h-0 to flex chain so messages scroll, reply stays visible
- fix(email): reply box truly fixed at bottom, noreply sorted last
- fix(email): subject inline with messages, reply box fixed at bottom
- feat(email): slide-in animation, per-message reply, smaller reply box
- feat(email): add refresh button next to search in folder tabs
- fix(email): visual distinction for sent emails, smaller subject header
- refactor(email): Gmail-style layout overhaul
- fix(email): restore ChevronDown import used in compose From picker
- refactor(email): mailboxes in left nav, folder tabs on top
- fix(mail-ops): count 'sent' status as successful delivery in success rate
- fix(mail): hard-delete mailboxes from Stalwart + DB, proper confirmation dialog
- fix(mail-admin): fix DNS health check to detect DKIM/DMARC from TXT content
- fix(mail-ops): correct API path prefix from /api/admin/mail to /api/v1/mail-admin
- feat(mail): wire email UI to Stalwart JMAP — fully functional webmail
- docs: update checkpoint for v6.3.0 — complete data surface coverage
- feat(admin): expose remaining 5 hidden surfaces, nothing left hidden (v6.3.0)
- docs: update checkpoint for v6.2.0 platform intelligence surface
- feat(dashboard): replace seed data with real dispatches + projects
- refactor(admin): merge evolution into skills page, cross-link billing → costs
- feat(admin): contextual navigation links between bridge, system, forge pages
- feat(admin): cross-link all pages — agents, gateways, skills, sessions
- feat(dashboard): add real cost metrics to hero bar, prefetch costs data
- fix(health): update hardcoded version to 6.2.0
- feat(admin): expose 8 hidden data surfaces as new admin pages (v6.2.0)
- fix(files): collect all drag entries synchronously before async read
- fix(files): folder drop uses recursive handler, fix scroll on long file lists
- feat(files): support folder drag-and-drop upload with recursive directory reading
- fix(mail): mailbox picker + search in thread list header, remove top bar
- fix(mail): move useState before early return to fix hooks crash
- fix(mail): mailbox picker to top bar with search, fix mailbox switch bug
- fix(mail): improve email UX — mailbox picker on top, search, trash delete, sent redirect
- feat(mail): implement real SMTP sending via Stalwart
- feat(mail): deploy Stalwart mail server, fix auth to Basic, provision all mailboxes
- fix(mail): Gmail-style left sidebar navigation for email page
- feat(mail): add mailbox CRUD management to Mail Ops page
- fix(mail): compact email folders to horizontal tabs, reclaim sidebar space


## v6.5.0 (2026-04-12)

**Porter Intellect + Forge + Operational Brain**

- Intellect Phase 1: file watcher, memory validator, reference tracking, Intellect API
- Intellect Phase 2: correction detector, session analyzer, memory promoter, dispatch scorer, workflow engine (6 workflows)
- Intellect Phase 3: memory pruner, self-monitor (6 health signals), pattern miner, skill evolver, tool detector, subscription manager
- 12 autonomous workflows running on schedule (memory, dispatch, tools, skills, subscriptions, self-monitor)
- Forge pipeline operational: Station 1 writes persona .md files + provisions email, Station 2 assigns skills, Station 3 sets tools/appearance
- 10 agents forged: Backend Dev, Frontend Dev, DevOps, Security, QA, Fullstack, Product Manager, Growth Strategist, Competitive Intelligence, Technical Writer
- 11 agent email addresses at @askporter.app via Stalwart
- 23 tools tracked, 21 detected, auto-scan every 6h
- 207 skills with quality evolution from dispatch telemetry
- 4 external subscriptions (Node.js, Ollama releases, Anthropic news, OpenAI changelog)
- Episodes + skills + tools injected into every CLI session context
- Holistic admin integration: Intellect signals on Dashboard, System, Bridge, Sessions, Routing, Decisions
- Landing page at askporter.app for unauthenticated visitors
- Billing routes wired with usage metering + pricing tiers (Free/Pro/Enterprise)
- Research agent templates enriched with substantive system prompts + web search skills
- Skills UX redesigned: compact cards, file info, timestamps, pack explorer link
- Forge catalogue: born agents visible with green border + birth date

## v6.3.0 (2026-04-09)

**Complete Data Surface Coverage**

- 13 new admin pages (costs, battles, decisions, sessions, msg-bus, env-tools, learnings, calendar, forge-runs, routing, customer-scores, skill-feedback)
- All pages cross-linked (agents, gateways, skills, users)
- Dashboard shows real dispatch feed + real projects (seed data removed)
- Evolution merged into Skills (3 tabs: Studio, Proposals, History)

## v6.2.0 (2026-04-07)

**Admin Consolidation + Email**

- Email/JMAP wiring: Stalwart JMAP client, folder/thread/message endpoints, send via JMAP
- DKIM + SPF + DMARC configured for askporter.app
- Attachment upload/download via Stalwart blob API
- 12 mailboxes operational

## v6.1.0 (2026-04-04)

### Porter Mail Platform — 14 Tranches

Self-hosted email system for @askporter.app with one mailbox per agent.

- 10 new database tables (mail_domains, mailboxes, agent_mailboxes, mail_aliases, mail_threads, mail_messages, mail_deliveries, newsletter_sources, newsletter_subscriptions, mail_learning_events)
- Stalwart mail provider abstraction with admin client
- Domain management with DNS health monitoring
- Mailbox provisioning and agent identity binding (9 agent + 3 system mailboxes)
- Dynamic sender identities replacing hardcoded addresses
- Thread/message storage with RFC threading (In-Reply-To, References)
- Outbound send pipeline with per-recipient delivery tracking
- Inbound processing with dedup, webhook support, and agent job routing
- Admin email page rewritten: mailbox switcher, thread list, compose, reply, archive/trash
- Newsletter source registry with trust levels (trusted/review/untrusted)
- Agent subscriptions with digest delivery mode
- Safe learning pipeline: memory promotion (medium trust) + skill suggestions (pending review)
- Gmail refactored to optional connector/import path (no longer core)
- Legacy IMAP IDLE auto-start removed, old routes deprecated
- Mail Ops admin page: stats, queue, bounces, domain health, mailbox health, newsletter overview

## v6.0.0 (2026-04-04)

### The Orchestration Platform — 8 Phases, 21 Plans, All Verified

**Phase 40: Gateway Capability Registry**
- Per-gateway capabilities JSONB (strengths, cost_tier, context_window, tool_support, agentic)
- Capability-aware dispatch — tool schemas stripped for non-tool gateways
- Startup auto-detection normalizes legacy string arrays to structured JSONB

**Phase 41: Session Intelligence**
- Frozen memory snapshots at session start (immutable through session lifetime)
- Cross-session FTS search via /api/v1/sessions/search
- Dispatch outcome scoring feeds routing confidence per gateway

**Phase 42: Task Decomposition Engine**
- classifyFast heuristic (word count + conjunction detection) — zero-cost, no LLM
- Task planner generates validated DAGs with Kahn's cycle detection
- DAG executor dispatches subtasks in parallel (MAX_CONCURRENT=3)
- Task joiner synthesizes results (4 paths: synthesized/partial/replan/failed)
- Admin REST endpoints for DAG inspection

**Phase 43: Inter-Agent Messaging**
- In-process delegateToAgent() with correlation tracking and msg_bus audit trail
- Peer-to-peer guard blocks direct agent-to-agent routing (Porter-only coordination)
- DAG executor routes assigned agents through delegation service
- Joiner loads delegation audit from msg_bus_events for synthesis context

**Phase 44: Autonomous Job Queue**
- agent_jobs extended with source, required_skill, required_capability, assigned_gateway
- job-assignment.ts matches agents by skill effectiveness, gateways by JSONB capability
- Porter self-enqueues health_sweep (60min) and gateway_check (30min) with dedup
- Admin endpoints + JobQueuePanel on bridge page with React Query auto-refresh

**Phase 45: Porter Control Plane**
- Delegation doctrine: decideDoctrine() classifies every dispatch (direct/delegate/parallel/escalate)
- dispatch_strategy logged on every bridge_dispatch_log row
- Hop depth enforcement: MAX_AGENT_HOPS=3 with depth_violation audit logging
- Approval gates: classifyRisk() detects 5 high-risk action categories, pauses pending approval
- REST endpoints for approval lifecycle (list/get/approve/reject)

**Phase 46: Project Monitoring**
- project_watchers + watcher_findings tables with 4 watcher types (web_search, rss_feed, email_monitor, custom)
- Scheduler polls for due watchers, creates watcher_run jobs with dedup
- Activity feed integration with source badges, expandable detail
- Notification pipeline: SSE for all findings, email for important/critical
- Admin CRUD API (7 endpoints) + WatchersPage ops panel

**Phase 47: Project Substrate**
- provisionProjectStructure creates /_system/ (6 .md files) + 6 canonical dirs on project creation
- Intelligence ingress pipeline: classifyFile (extension-based) + routeFile + memory signal + project.md update
- Atlas structural health agent: 30-minute scans, auto-repairs missing dirs, flags drift, logs to activity feed

## v5.2.0 (2026-04-03)

### Phase 39: Bridge Task Dispatch
- POST /api/v1/tasks/dispatch — dispatch real tasks to CLI gateways with tool access
- TaskExecutor spawns Gemini/Claude/Codex CLIs as subprocesses with file read, bash, code edit
- Per-gateway task queues (concurrency=1), CWD allowlist validation, 1MB output cap
- SSE events: bridge:task-progress (incremental), bridge:task-complete (final)
- bridge_tasks table tracks full lifecycle (queued → running → complete/failed)
- GET /api/v1/tasks/:id poll endpoint, DELETE /:id/cancel with SIGTERM/SIGKILL
- Admin endpoints: GET /api/admin/bridge/tasks (paginated list), GET .../tasks/:id (full detail)
- VERIFIED LIVE: Gemini dispatched, read CHECKPOINT.md, ran curl, returned correct result

## v5.1.0 (2026-04-03)

### Phase 38: Adaptive Agent Context
- Context-aware directive injection — scores directives by task+skill relevance, injects only matches
- Tool output compression — auto-compresses verbose tool results (>500 tokens) before storing in history
- Conversation compression — mild (70%) and aggressive (85%) threshold-triggered summarization
- Context pressure observability — unified context_stats JSONB on every dispatch
- Admin ContextPanel on dispatch detail — token budget bars, directive selection, compression badges
- SessionPressureChart — line chart of context usage vs turn number with compression event markers
- Migration: tags on directives (GIN indexed), context_stats + compression_stats on dispatch log

## v5.0.1 (2026-04-03)

### Fixes
- Port ALL v5.0 skill routes from dead admin backend to Brain :3001 — skills were invisible
- Skill detail, file read/write, effectiveness, proposals all now served by Brain
- Quality scoring ported from admin backend to Brain — audit endpoint, tier computation, DB persistence
- File tree entries now include name, extension, and size — fixes blank sidebar in pack explorer
- CodeMirror editor follows system theme (light/dark) instead of hardcoded dark
- Scrollable file tree sidebar and editor area for long content
- Breadcrumb navigation: Forge > Skills > Skill Name with proper back links
- Skills Curator agent created (Knowledge Base Manager template) for skill library management
- All :5175 port references replaced with :3001 across tests, configs, docs
- All /home/lobster/documents/porter/ paths replaced with /home/lobster/projects/porter/
- Removed 560MB dead code: frontend/, frontend-v2/, diagrams/, docs/, archive/, chat/, portal.db
- Deleted porter-admin and porter-website standalone repos (archived/merged)
- Stale .md files updated: porter.py refs removed, SQLite refs removed, persona deliverables updated
- Version consistency enforced across all package.json files, health endpoint, CLAUDE.md, PROJECT.md

## v5.0.0 (2026-04-03)

### Living Skills Milestone — 7 Phases, 36 Requirements

**Phase 31: Source of Truth Cleanup**
- template_skills and persona_skills junction tables are the canonical source for all skill assignments
- SKILLS.md is a thin generated manifest, skills_text deprecated

**Phase 32: Skill Pack Explorer**
- Full-page pack explorer at /skills/:id/pack with VSCode-style split layout
- CodeMirror 6 editor for .md and .json files with syntax highlighting
- File tree with folder groups, empty file badges, missing file warnings
- Quality diagnostics card with scaffold detection (word count + boilerplate matching)
- Manual save with dirty indicator and navigate-away warning
- SkillQualityBadge component with 4-tier color coding

**Phase 33: Runtime Skill Selector**
- selectSkills() gathers assigned skills from persona_skills at dispatch time
- Keyword scoring ranks candidates by description, triggers, tags, name
- Top 0-3 skill packs injected into dispatch system prompt
- skills_used JSONB logged on every dispatch in bridge_dispatch_log
- Graceful zero-skill fallback — dispatch proceeds normally without injection

**Phase 34: Feedback Telemetry**
- skill_feedback_events table captures per-dispatch effectiveness signals
- Thumbs up/down on chat messages creates feedback events for all active skills
- persona_skills tracks times_selected, times_completed, positive/negative counts, effectiveness_score
- dispatch_id surfaced in SSE done events for feedback linkage
- Admin effectiveness API: per-skill, per-agent, per-template aggregated scores
- SkillEffectivenessBar component on skill detail, agent detail, template detail pages

**Phase 35: Agent Evolution Loop**
- Background analyzer (6-hour interval) scans feedback patterns per agent
- Generates proposals: add_skill, remove_skill, rewrite_prompt, enrich_examples
- skill_evolution_proposals table with JSONB diffs, reasoning, triggering feedback IDs
- Admin UI Evolution tab on Skills page — pending proposals with diffs, approve/reject buttons
- Approval mutates persona_skills, regenerates SKILLS.md, logs evolution event
- History timeline with reasoning, feedback counts, review status

**Phase 36: Skill Quality Scoring**
- quality_score (0-100) computed from 7 weighted components
- Quality tiers: scaffold (0-25), baseline (26-50), production (51-75), high-performing (76-100), stale
- Tier badges replace old pack_status (ready/partial/missing) across all skill surfaces
- Tier filter pills in skills table and marketplace grid views
- Quality audit API endpoint: batch-scores all 207 skills, persists to DB, returns enrichment report

**Phase 37: Template Skill UX**
- Template detail is the command center for skill configuration
- Assigned skills table with quality badges, inline rationale editing, mandatory toggle
- Add/remove skills with searchable dropdown, drag-to-reorder with arrow buttons
- Aggregated effectiveness across all spawned agents from the template
- Preview auto-detection: enter a sample task, see which skills would be selected with scores


## v4.5.0 (2026-04-02)

**Projects + Agent Identity Overhaul**

### Projects System
- `/home/lobster/documents` renamed to `/home/lobster/projects` — each folder is a project
- Every project has `PROJECT.md` + `CHECKPOINT.md` at root
- Projects Curator agent (Atlas) manages the index
- Nav: Projects section moved below Dashboard with FolderOpen icon
- Full path shown in column header, breadcrumb only when in subfolder

### File Manager
- Drag-drop files into folder rows to move them (POST /api/v1/files/move)
- Delete confirmation dialog (replaces inline trash icon)
- New Folder button with inline name input
- Upload limit raised from 10MB to 100MB
- Real upload progress with XHR (actual % bar, not fake pulse)
- Upload path uses refs (immune to re-renders) — files go to correct subfolder
- Multi-file sequential upload with per-file progress rows
- Nav link resets to project root

### Agent Template/Instance Model
- Clear distinction: templates are components, personas are instances
- Instance view shows "Component: [template name]" badge linking to parent
- Template view shows instances below SOUL editor (not separate tab)
- Born = has soul_hash (only Porter is born). All others show as unborn/greyscale
- Instances endpoint added to brain templates route (was missing — instances tab was always empty)
- All 8 personas have correct template_id mappings

### Agent Personas Created
- Vigil → Bridge Operator template
- Compass → Route Optimizer template
- Ledger → Cost Controller template
- Atlas → Projects Curator template (new template)
- Quill → Storyteller, Sage → Training Specialist, Anvil → Platform Engineer

### Other
- Chat panels removed from Forge and Org Chart
- Forge station cards link to templates (not instance IDs)
- Agent detail: Deploy tab removed, SKILLS.md always visible
- Auth: brain accepts both porter_session and porter_admin_session cookies


## v4.4.0 (2026-04-02)

**Skills Marketplace — Discovery + Tags**

- SkillsMarketplace component: card grid view with featured section, tag filters, search
- Tags column added to skills table, all 207 skills tagged (2-4 tags each)
- 8 featured skills seeded (project-architect, prompt-architect, code-implementer, etc.)
- Brain API: search, category/featured/packStatus query filters, allTags summary
- Table/Grid view toggle in SkillsStudio
- Tag editor in SkillEditSheet (add/remove inline)

## v4.3.0 (2026-04-02)

**Skill Import System**

- skill-importer.ts: clone external GitHub repos, scan SKILL.md files, parse frontmatter
- Import API: scan + execute endpoints, proxied through Brain
- SkillImportDialog: 3-step UI (source → preview with checkboxes → results)
- Pre-configured sources: VoltAgent, Anthropic, Supabase + custom URL
- Conflict detection, overwrite support

## v4.2.0 (2026-04-02)

**Skill Catalog Expansion — 207 Skills**

- 170 new skills across 20 categories with complete on-disk packs
- Categories: Engineering, Data & AI, Business, Content, Research, Creative, Design, Domain, Infrastructure, Legal, Support
- Each skill has domain-specific SKILL.md, prompt.md, qa-checklist, examples, metadata
- Idempotent seed script at scripts/seed-skills-expansion.sh

## v4.1.1 (2026-04-02)

**SkillsStudio CRUD UI**

- SkillCreateDialog: name/id/description/category/source form with auto-slug
- SkillEditSheet: full metadata editor, switches, pack status badge, generate/delete
- Pack status column in SkillsStudio table (ready/partial/missing badges)
- "+ New" and "Generate Missing" buttons in header

## v4.1.0 (2026-04-02)

**Skills CRUD API + Pack Generation**

- Brain skills route: POST create, PUT update, DELETE, pack proxy endpoints
- admin-proxy.ts utility for Brain→Admin backend forwarding
- generate-all endpoint for bulk pack generation
- pack_status column added to skills table
- All 37 original skills now have complete on-disk packs

## v4.0.6 (2026-04-01)

**Agent Skills Tab Enrichment**

- Agent detail Skills tab joins skills table for description, category, source
- Skills table with 4 columns instead of 2

## v4.0.5 (2026-04-01)

**Build Tab + RPG Component Redesign**

- Sheet tab renamed to BUILD with Wrench icon
- CharacterCard: larger text, section dividers, equipped-only equipment display
- VitalsBar: icons, taller bars, 50% threshold markers, faster animation
- PassiveTreeView: larger nodes/text, full labels, unlock level display

## v4.0.4 (2026-04-01)

**Full-Featured Files Page**

- Ported from frontend-v2: breadcrumb nav, drag-drop upload, download, rename, delete
- File preview panel (text, image, PDF)
- Compact/comfortable view toggle, search filter

## v4.0.3 (2026-04-01)

**System Page Merge**

- System + Activity + Diagnostics merged into single /system page with 3 sub-tabs
- Redirects from /brain, /activity, /diagnostics for backwards compat

## v4.0.2 (2026-04-01)

**Admin Nav Restructure**

- Intelligence moved from Dev to Ops
- Changelog removed from nav (linked in footer)
- Settings as gear icon next to logout
- Files gets its own nav section

## v4.0.1 (2026-04-01)

**Forge page fixes + template card polish**

- Forge station agents renamed: Quill (Soul Writer), Sage (Skill Trainer), Anvil (Gear Outfitter), Warden (Queue Keeper)
- Removed broken links to nonexistent forge agent templates
- Template cards: description wraps instead of truncating, category shown as badge
- Porter card only appears in "all" filter (not every category)
- SHEET tab: fixed crash from wrong capacity API shape (VitalsBar expected flat limits, API returns nested models.limits)
- SHEET tab: graceful empty state for unborn agents

## v4.0.0 (2026-04-01)

**The Arena — Agent RPG System + Bridge Intelligence**

Porter agents become RPG characters with real stats, progression, and an intelligence loop that makes routing smarter over time. Forge unified into one page. 6 phases shipped.

### RPG Engine
- 5 core stats (Quality, Speed, Efficiency, Reliability, Combo) derived from real dispatch data
- XP from dispatches, feedback, battles, multi-agent chains
- Level 1-100, star progression 1-5★, rarity system (Common → Mythic)
- Specialties auto-detected from usage patterns
- 49 unit tests for all stat formulas
- Background recalculation every 5 minutes

### Agent Identity Files
- SOUL.md, IDENTITY.md, SKILLS.md, TOOLS.md auto-regenerated from DB on progression events
- Files are derived output, not editable source — anti-gaming by design

### Forge Unification
- Skills + Tools + Agent Forge merged into single "Forge" nav item
- 4 tabs: Templates (catalog), Armory (tools + skills), Workshop (build screen), Arena (coming soon)
- Birth animation: pixel portrait grayscale → color with particle sparks
- Workshop shows live skill success rates and support modifiers

### Character Sheet
- Full character card with stat pentagon (recharts RadarChart)
- 3 vitals bars: Mana (token budget), Reliability (error rate), Focus (context pressure)
- Rarity-colored borders: gray, blue glow, purple pulse, gold shimmer, red particles
- Star display with SVG progress arc
- Passive tree: 8-node specialization grid

### Session Registry + Message Bus
- Porter tracks every dispatch session with token count and context window %
- Context pressure warning at 80%, auto-rotation at 95%
- Session rotation writes Recall concept summarizing closed session
- Structured message envelope for inter-gateway communication
- Every agent-message logged to msg_bus_events with correlation IDs

### Intelligence Loop
- Background job extracts 4 pattern types from dispatch history (latency, model strengths, failures, cost)
- High-confidence patterns (≥80%) auto-promoted to Recall concepts
- Routing engine reads learned concepts before selecting gateways
- Vigil's operator activity shows sessions, messages, and intelligence patterns live

### Bridge Improvements
- All 4 gateways respond through Bridge (session hook bypass with PORTER_BRIDGE_DISPATCH)
- OpenClaw auth token fix (reads OPENCLAW_TOKEN env)
- CLI health probe timeout increased 5s → 10s (prevents false offline)
- 3 Bridge agents profiled: Vigil (Bridge Operator), Atlas (Route Optimizer), Ledger (Cost Controller)

### Admin Cleanup
- Agent templates rationalized: 104 → 92 (12 duplicates removed)
- Template IDs cleaned to plain slugs (bridge-operator, not sys-bridge-operator)
- Agent lifecycle types: persistent (heartbeat), event-driven, one-shot
- Template detail page rebuilt: SOUL/IDENTITY/ROLE/SKILLS/TOOLS/HEARTBEAT + INSTANCES tabs
- CLAUDE.md updated with mechanical overrides for verification, context management, edit safety

### Schema
- 8 new PostgreSQL tables: agent_rpg_stats, battles, battle_rounds, battle_judgments, agent_bonds, session_registry, msg_bus_events, intelligence_patterns
- 14 RPG columns on agent_templates, 3 performance columns on template_skills
- 17 indexes across all new tables

## v3.4.2 (2026-03-31)

**Gemini usage collection overhaul**

- Real Gemini quota from Google Cloud Code API (remainingFraction)
- Hourly usage estimated from Porter dispatch logs (50 req/hour baseline)

## v3.4.1 (2026-03-31)

**Bridge UX polish**

- Merged Model Scout + Route Analyst into "Models & Routing" tab (4 tabs → 3)
- Admin UI served at root / (removed /admin/ prefix)
- Operator activity card height fixed
- Ollama: 0% used with ∞ No limit
- OpenClaw usage from `openclaw status --usage` (real provider quota)

## v3.4.0 (2026-03-31)

**Usage collection overhaul + gateway sniffer**

- Codex JSONL rate-limit parsing for real usage %
- Claude OAuth auto-refresh (tokens no longer go stale)
- Gateway activity sniffer (session transitions via SSE)
- Bridge nav badge for pending updates
- Manual capacity refresh endpoint

## v3.3.2 (2026-03-29)

- BRIDGE.md canonical location, stream request naming fix, version alignment

## v3.3.1 (2026-03-29)

**Bridge operator goes live**

- Real Claude usage from Anthropic rate-limit headers (1 Haiku call)
- Local CLI usage collector (Claude JSONL + Codex SQLite)
- Operator activity log with health, circuits, capacity alerts
- Gateway card UX: restart, pause, inline config, usage bars

## v3.3.0 (2026-03-29)

**Port merge — one Fastify, one port**

- Brain (:3001) absorbs Admin (:5175) — single process
- Admin routes, SSE, auth plugin all merged
- Unified changelog

## v3.2.0 (2026-03-29)

**Monorepo merge + system prompt pipeline**

- Brain + Admin merged into single repo
- Directives from DB injected into every dispatch
- SessionStart hooks for all CLIs
- Gateway hooks detection on Bridge cards

## v3.0.0 (2026-03-25)

**Porter Bridge — AI Gateway & Model Intelligence (v3.0 milestone)**

8 phases (16-23), 46 requirements. Gateway registry, 5 provider adapters, circuit breakers, health probes, smart routing, model catalog, cost tracking, admin APIs, first-run setup, Memory V3 signals.

## v2.0.0 (2026-03-24)

**Backend Ready (v2.0 milestone)**

9 phases (8-15). API standardization, streaming chat, collaborative sessions, unified chat + CRM, 103 agent templates, PostgreSQL migration, Memory V3 state engine, skills & tools registry.

## v1.0.0 (2026-03-21)

**Foundation + Core Platform (v1.0 milestone)**

7 phases (1-7), 30 requirements. CSS architecture, Memory V2, route migration, agent autonomy, guided wizard, real-time transparency, external connections.
