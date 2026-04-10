# Porter Checkpoint
# CANONICAL — all gateways read this file. Do not create per-gateway checkpoints.
# Location: /home/lobster/projects/porter/CHECKPOINT.md

project: porter
version: v6.5.0
updated: 2026-04-10
updated_by: codex-gpt-5.4

## Architecture

Single monorepo (heymoezy/porter). One Fastify process on :3001. API metering business model.
3 pillars: Bridge (hub), Forge (factory), Recall (shared brain).
5 gateways: Claude CLI, OpenClaw, Ollama, Codex CLI, Gemini CLI.
**Port 5175 is DEAD. Everything on :3001.**

## v6.3.0 — Complete Data Surface Coverage

Every database table now has a corresponding admin UI page. Zero hidden data.

### All Admin Pages (13 new in v6.2-6.3)
1. `/costs` — Cost analytics (by gateway/model/agent/project, daily chart, dispatches)
2. `/battles` — Battle Arena (matches, leaderboard, agent bonds)
3. `/decisions` — Decision Log (agent reasoning, alternatives)
4. `/sessions` — Session Registry (token budgets, context sizes)
5. `/msg-bus` — Message Bus (agent-to-agent comms)
6. `/env-tools` — Environment Tools (detected capabilities)
7. `/learnings` — Session Learnings (extracted knowledge)
8. `/calendar` — Calendar Events (Google Calendar sync)
9. `/forge-runs` — Forge Pipeline (station runs, quality scores, costs)
10. `/routing` — Routing History (decisions, feedback scores, confidence)
11. `/customer-scores` — Customer Scoring (health/churn/LTV/viral)
12. `/skill-feedback` — Skill Feedback (positive/negative/correction tracking)
13. Skills page gained Proposals + History tabs (evolution merged in)

### Holistic Connections
- All pages cross-linked (agents→detail, gateways→bridge, skills→skills, users→detail)
- Bridge links to costs + sessions
- System links to sessions + msg-bus + decisions
- Forge links to battles + evolution + pipeline
- Billing links to costs
- Dashboard shows real dispatch feed + real projects (all seed data removed)

### Navigation Structure (v6.3.0)
- Dashboard
- Projects: Projects
- Business: Customers, Scores, Revenue, Costs, Calendar
- Agents: Forge, Pipeline, Org Chart, Email, Battle Arena, Skill Feedback
- Ops: Bridge, Routing, Recall, Message Bus, Sessions, Decisions, Mail Ops, Watchers, Approvals, Decomposition, Intelligence, System
- Dev: Env Tools, Learnings, Design System, Architecture

### Consolidation Done
- Evolution merged into Skills (3 tabs: Studio | Proposals | History)
- Dead redirect files deleted (skills-redirect, tools-redirect)
- Fake seed data removed from dashboard (50+ lines)

## Previous Work
- v6.0-v6.1: Orchestration Platform (8 phases)
- Mail system: 13 tranches (full SMTP via Stalwart)

## Email/JMAP Wiring (2026-04-06)

Fully functional webmail backed by Stalwart JMAP:
- DKIM DNS record live (default._domainkey.askporter.app)
- SPF + DKIM + DMARC all configured
- New `jmap-client.ts` — typed JMAP HTTP client for Stalwart
- All mail read endpoints (folders, threads, messages) wired to JMAP
- Message actions (read, archive, trash, delete) via JMAP Email/set
- Sending: nodemailer for simple, JMAP EmailSubmission for attachments
- Attachment upload/download via Stalwart blob API
- Frontend: file picker in compose, attachment chips, download links
- 12 mailboxes operational (porter, postmaster, anvil, atlas, etc.)

Key detail: Stalwart requires `Host: mail.askporter.app` header for JMAP routing.

## Porter Intellect — Phase 1 SHIPPED (2026-04-09)

**What Porter IS:** Not a UI, not an admin panel. Porter is the invisible intelligence
that sits behind every CLI session, watches, learns, validates memory, and evolves.
The admin is for observability. Real product = the autonomous brain.

**Three Pillars:**
- **Brain** = what Porter knows (memory: directives, concepts, project notes, agent notes, episodes)
- **Bridge** = how Porter acts (routing + dispatch + protocol selection — already partial)
- **Intellect** = how Porter gets smarter (NEW — analysis, validation, pruning, evolution)

**Phase 1 Complete — Foundation:**
- Schema: episodes, memory_references, intellect_events, workflows tables
- Memory extensions: references_json, verified_at, supersedes_id on all memory tables
- Fixed 3 stale /documents/ paths in existing memory
- **File Watcher** (chokidar, in-process): watches /home/lobster/projects recursively,
  debounced 500ms, ignores node_modules/.git/build. On delete → marks refs broken.
  On add → fuzzy-match auto-fix of broken refs.
- **Memory Validator**: extracts file paths from memory content via regex, registers
  in memory_references, validates against filesystem every 30 min. Auto-corrects
  renamed files via recursive search (depth 3). UNIQUE constraint prevents dupes.
- **Intellect API** (/api/v1/intellect/*):
  - GET /context?project=X — scoped memory for CLI injection (markdown)
  - GET /events — recent Intellect decisions
  - GET /stream — SSE live stream
  - POST /validate — manual trigger
  - GET /stats — ref counts + event counts + episodes
- **Session Hook Fixed** (~/.claude/hooks/porter-session-start.js): queries Intellect
  API directly, detects project from cwd, no more stale paths.
- **UI**: Intellect section on Intelligence page (/intelligence in sidebar under Ops)
  — stats cards, live event stream (polls every 5s), manual validate button.

**Key files:**
- backend/src/services/intellect/file-watcher.ts
- backend/src/services/intellect/memory-validator.ts
- backend/src/routes/v1/intellect.ts
- backend/src/db/migrate-intellect-v1.ts
- admin/frontend/app/routes/intelligence.tsx (added Porter Intellect section at top)
- ~/.claude/hooks/porter-session-start.js

**MIPT Research Insight (critical for Phase 2+):**
Protocol choice explains 44% of quality variation. Model choice only 14%.
Sequential protocol (agents see predecessor outputs, choose own roles) beats all.
Pre-assigned roles HURT performance with capable models. Kill fixed-role personas
(Vigil, Compass, etc.) as coordination model. 3-ingredient recipe: mission + protocol
+ capable model. Porter's job = choose the right PROTOCOL per task. Agent memory
tracks emergent patterns, not assigned identities.

## Porter Intellect — Phase 2 SHIPPED (2026-04-09)

**Learning layer live. Porter now learns from every CLI session.**

- **Correction Detector** (intellect/correction-detector.ts): pattern-matches user
  messages ("never", "don't", "always", "stop", "wrong", "instead"). Noise filter
  rejects questions. Creates directive candidates (status='candidate', priority=60).
  Similarity dedupe (shared significant words ≥70%) reinforces existing candidates
  with +10 priority instead of duplicating.
- **Session Analyzer** (intellect/session-analyzer.ts): creates episodes from
  bridge_dispatch_log + intellect_events. Synthesizes summary (project, dispatch
  count, duration, top tools, corrections, files changed). Idempotent per session.
  sweepStaleSessions() catches sessions that ended without a SessionEnd hook.
- **Memory Promoter** (intellect/memory-promoter.ts): promotes candidates at
  priority ≥ 80 (= 2 reinforcements) to status='active' with verified_at timestamp.
  Archives unreinforced candidates older than 14 days.
- **Dispatch Scorer** (intellect/dispatch-scorer.ts): heuristic outcome scoring
  for unscored dispatches. Latency + token ratio + correction proximity (−1.0 if
  a correction fired within 90s after the dispatch). Warms routing-confidence
  cache after each pass. Ran clean on first pass: 500 scored (482/8/10).
- **Workflow Engine** (intellect/workflow-engine.ts): minimal event-driven runner.
  Reads workflows table, fires on emitEvent() or runScheduledWorkflows(tag).
  6 built-in workflows seeded at startup: session_analyze, sweep_stale_sessions,
  memory_validate, memory_promote, dispatch_score, correction→promote.
- **Phase 2 API endpoints** (/api/v1/intellect):
  - POST /correction — submit user message for detection
  - POST /session-end — create episode + emit session.end event
  - POST /promote — run memory promoter manually
  - POST /score-dispatches — run dispatch scorer manually
  - GET /candidates — list pending directive candidates
  - POST /candidates/:id/accept — manual promotion (priority=90, status=active)
  - POST /candidates/:id/reject — archive candidate
  - GET /episodes — recent episodes (optional project filter)
- **New CLI hooks** in ~/.claude/settings.json:
  - UserPromptSubmit → porter-user-prompt.js → POST /correction
  - SessionEnd → porter-session-end.js → POST /session-end
- **Intelligence UI**: Intellect section extended with
  - 6-cell stats row (refs/valid/broken/directives/candidates/episodes)
  - Directive candidates list (accept/dismiss inline, Run promoter button)
  - Recent episodes list
  - Event stream recognizes new event types (correction_detected/reinforced,
    directive_promoted/archived, episode_created, dispatch_scored, workflow_ran/failed)

**Verified end-to-end (2026-04-09):**
1. POST correction → candidate created (priority 60)
2. Reinforcement POST → priority bumped to 70
3. Reinforcement POST → priority 80 → correction.detected event →
   memory_promote workflow fired → candidate promoted to active in one loop
4. dispatch-scorer ran: 500 dispatches scored, routing-confidence cache refreshed

**Phase 3 NEXT — Autonomy:**

## Porter Intellect — Phase 3 SHIPPED (2026-04-10)

**Autonomy layer live. Porter prunes itself, watches itself, mines its own patterns.**

**Phase 2 fixes landed first:**
- Correction detector tightened: rejects any message with `?` anywhere, rejects
  first-person discussion ("let's", "I want to", "should we"), max length
  dropped 600→280 chars, weak modals (`must`/`have to`/`need to`/`always`)
  only accepted in messages ≤160 chars. Verified: the false-positive ymc.capital
  question that previously slipped through is now correctly rejected.
- Validator fuzzy match constrained: noise dirs (admin, build, dist, archive,
  vendor, node_modules, etc.) excluded. Multiple-match cases marked
  `reference_ambiguous` instead of guessing wrong. The validator no longer
  auto-corrects `tasks/checkpoint.md` → wrong `admin/tasks/checkpoint.md`.
- Validator now propagates corrected paths back into source memory `content`
  via parameterized REPLACE update on whitelisted tables. Verified end-to-end:
  moved a file → ref auto-fixed → directive content rewritten in same pass.

**New Phase 3 services:**
- **memory-pruner.ts**: daily cleanup. Archives unused concepts (use_count=0,
  age >30d). Dedupes near-duplicate active directives via Jaccard similarity
  ≥0.85 (newer wins, older becomes superseded). Deletes superseded memories
  >7d. Compacts JSONB payloads on episodes >30d. Catches /documents/ stale
  pattern regressions. Cleans dead memory_references.
- **self-monitor.ts**: 6 health signals computed from existing tables — no
  state stored. Corrections trend (last 7d vs prev 7d, classified
  improving/flat/rising), memory hit rate, validator accuracy ratio,
  workflow health roster (per-workflow last_run + failures), promotion
  velocity, episode coverage. GET /health returns flat snapshot.
- **pattern-miner.ts**: greedy Jaccard clustering on active directives within
  same scope. Theme tokens = words appearing in ≥half of cluster members.
  Project topic extraction from project-scoped directives. Tool affinity
  parsed from episode summaries (per-project tool histograms).

**Phase 3 API endpoints:**
- POST /prune          — run memory pruner manually
- GET  /health         — Intellect self-monitor snapshot
- GET  /patterns       — pattern miner output (themes + topics + tool affinity)

**Workflow engine grew to 9 seeded workflows** (Phase 1+2: 6, Phase 3: 3):
- Prune stale memory daily         (every_24h)
- Self-monitor Intellect health    (every_6h)
- Mine memory for patterns         (every_24h)

Scheduler now has an `every_24h` tag (43200 ticks × 2s).

## Session Notes (2026-04-10)

- Verified from Disney investor relations and SEC materials: Justin Warbrooke is a real Disney executive and is listed as Executive Vice President and Head of Corporate Development.
- Verified scope: Disney identifies Warbrooke as the executive responsible for M&A strategy and execution, including acquisitions, divestitures, and joint ventures.
- Verified adjacent leadership change: Benjamin Swinburne became Executive Vice President of Investor Relations and Corporate Strategy on January 30, 2026.

**UI extensions** on Intelligence page Intellect section:
- Self-Monitor card with 4 stat tiles + 14-day correction sparkline +
  workflow health roster (colored dots: healthy/idle/failing)
- Theme clusters card (groups of similar directives, click to drill in)
- Project topics card (per-project directive counts + top tokens)
- New event types in stream: pruner_swept, self_monitor_snapshot, patterns_mined

**Verified end-to-end (2026-04-10):**
1. Fix 1: false-positive ymc.capital long question → `question_or_discussion`
   (rejected). Real correction "never commit secrets to git" → new candidate.
2. Fix 2: validator no longer auto-corrects into `admin/`. Stale references
   correctly marked `broken` for human review.
3. Fix 3: moved file → ref auto-fixed AND directive content REPLACE'd in one
   validator pass.
4. Phase 3 endpoints all return data from real DB state.
5. 9 workflows seeded; pruner first run reported zero work needed (correct,
   no candidates aged out yet).

**Phase 4 — Dashboard overhaul (LAST):**
Replace static dashboard with living intelligence view.

**Plan file:** /home/lobster/.claude/plans/rosy-frolicking-hedgehog.md

## v6.4.0 — Operational Porter (2026-04-10)

### Completed Today
- Phase 3 Intellect shipped (pruner, self-monitor, pattern miner, 3 Phase 2 fixes)
- Holistic integration pass: Intellect signals surfaced across Dashboard, System,
  Bridge, Sessions, Routing, Decisions (6 pages total)
- **Episodes now inject into every session** — fixed bug where 22 real episodes
  were invisible (scope query mismatch). Both Bridge dispatch (Tier 5 in
  buildMemoryContext) and session hook (/context endpoint) now include episodes.
- **Skill recommendations in context** — session hook now includes top 2 skill
  recommendations matched to recent episode tool patterns (e.g., heavy Bash/Edit
  usage → recommends Backend Developer + DevOps Engineer skills)
- 9 seeded workflows (6 Phase 2 + 3 Phase 3), all running autonomously

### Operational Status
| System | State | Key Metric |
|--------|-------|-----------|
| Skills | 207 synced, well-written. Skill-evolver updates quality tiers from telemetry every 24h | Recommendations in session hook + Bridge dispatch: ✅ |
| Tools | 23 tools tracked, 21 detected. Auto-scan every 6h via tool-detector workflow | Tool availability injected into dispatch + session context |
| Forge | 107 templates. Pipeline OPERATIONAL. 10 agents forged from templates with skills + email | Station 1 fixed: direct DB persona creation + Stalwart mailbox provisioning |
| Bridge | All 5 adapters working. 10-step dispatch with 6-tier memory injection | Cross-gateway context: only Claude CLI has hooks |
| Intellect | Phase 1-3 + evolution complete. 12 autonomous workflows. 4 external subscriptions | Self-monitoring: 98% validator accuracy, 21 tools detected |

### In-Progress Operational Roadmap (research/operational-roadmap.md)
**Phase A: Skills** — DONE (207 skills, recommendations work, evolution loop wired)
**Phase B: Tools** — DONE (23 tools, 21 detected, auto-scan every 6h, injected into context)
**Phase C: Forge Activation** — DONE (10 agents born: Backend Dev, Frontend Dev, DevOps, Security, QA, Fullstack, Product Manager, Growth Strategist, Competitive Intelligence, Technical Writer. All with @askporter.app email.)
**Phase D: Cross-Gateway** — DONE (Bridge dispatch already injects full context; only Claude CLI has hooks but all gateways get memory+skills+episodes+tools via Bridge)
**Phase E: Autonomous Evolution** — DONE (skill evolution, tool detection, subscription manager all wired. 12 autonomous workflows. 4 external subscriptions ingesting release/news data into concepts.)
**Phase F: Marketing** — TODO (landing page, demo, positioning)
**Phase G: Revenue** — TODO (Stripe integration, tiered metering)

### Key Architecture Facts for Forge
- 9 existing personas: porter-core, forge-quill/sage/anvil, bridge-vigil/ledger/atlas,
  projects-curator, skills-curator
- agent_templates table: 107 rows with system_prompt, soul_text, skills[], tools[]
- Forging = create persona from template + assign skills from persona_skills + create
  Stalwart mailbox + register in Bridge routing
- MIPT insight: don't assign fixed roles. Let agents self-specialize per task via
  Sequential protocol. Porter chooses protocol, not agent role.

## Queued Work (from pre-Intellect era — lower priority now)
1. Lifecycle hook system (Pre/PostDispatch events for automation)
2. Concurrent tool execution for workers
3. Notification folding + priority queue
4. Agent status shimmer/pulse animations
5. Replace hardcoded revenue curves with real billing data
