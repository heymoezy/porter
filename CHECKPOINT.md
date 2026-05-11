# Porter Checkpoint
# CANONICAL — all gateways read this file. Do not create per-gateway checkpoints.
# Location: /home/lobster/projects/porter/CHECKPOINT.md

project: porter
version: v6.12.0
updated: 2026-05-11
updated_by: claude-opus-4.7 (Porter Dreams 3)

## v6.12.0 — Phase 48.1 silo-foundation (2026-05-11)

First phase of the Dream Silos series. Silos are silo-scoped reinforcement-learning
buckets — directives that only apply when the session matches the silo's detect
rules. The "software development" silo seeds the system: when Claude CLI runs
in a code-project cwd, the loaded context now includes a labeled
`## Silo: Software Development — Operating Rules` section with the 5
canonical silo directives (compact=padding, components-only, parallel agents/codex,
porter-backbone, design-system).

**5 plans shipped across 4 waves (all green, SC-1..SC-6 pass):**

- **48.1-01 (schema):** `silos` registry table with software seed row,
  `session_silo_overrides` table, `directive_immutable_moe_direct` trigger
  protecting `source_type='moe-direct'` rows from UPDATE/DELETE
  (`SET LOCAL porter.allow_moe_direct_mutation='true'` bypass for memory-pruner).
- **48.1-02 (detector):** `backend/src/services/intellect/silo-detector.ts` —
  deterministic detection (override → project_type → cwd_markers → null),
  wired into `/api/v1/intellect/context` between System and Project Directives.
  Startup cache warmup on Porter boot.
- **48.1-03 (slash command):** `POST /api/v1/intellect/silo-command` endpoint +
  global `~/.claude/hooks/porter-user-prompt.js` extension intercepts
  `/silo software | none | <bare>`, persists override to `session_silo_overrides`,
  short-circuits the prompt with an echoed confirmation.
- **48.1-04 (session-start hook):** `~/.claude/hooks/porter-session-start.js`
  now reads stdin SessionStart event, extracts `session_id` + `cwd`,
  forwards to /context. Fresh CLI sessions in code cwds receive the silo
  header. Live-verified by Moe.
- **48.1-05 (smoke harness):** `tests/smoke-48.1.sh` — 6 success criteria,
  bash + psql + curl + jq, no node test framework.

**Requirements closed:** DRM-01, DRM-02, DRM-03, DRM-04, DRM-05 (all 5).

**Files of note (in-repo):**
- `backend/src/db/migrate-silos-v1.ts` — idempotent migration
- `backend/src/db/schema.ts` — Drizzle entries for silos + session_silo_overrides
- `backend/src/services/intellect/silo-detector.ts`
- `backend/src/routes/v1/intellect.ts` — /silo-command endpoint + section injection
- `backend/src/index.ts` — migrateSilosV1 registration + cache warmup
- `tests/smoke-48.1.sh`

**Files of note (outside repo, global Claude hooks):**
- `~/.claude/hooks/porter-user-prompt.js` — /silo interception
- `~/.claude/hooks/porter-session-start.js` — stdin payload forwarding

**Commits:** `068bea9 8547903 a334027 b996ceb d3c69a2 ff4566b 10fa0f0` and
metadata commits. Pushed as `172ed29`.

**Known follow-ups:**
- Phase 48.2+ (silo expansion): additional silos beyond software (admin/dataroom,
  legal, finance), per the dream_silos memory. Phase 48.1 is intentionally
  software-only — admin/data-room is a separate silo for later per Moe's
  feedback_dream_silos rule.
- Bridge model-name normalization (carry-over from v6.10.0 known issues).

---

## v6.11.0 — Bridge revival: tabs + summary + live ticker (2026-05-10)

After v6.9.0 stripped the Bridge page to a 77-LOC health bar, three large
components (cost-analytics, model-catalog, dispatch-log) were sitting unused
and the dispatch log was 99% polluted by tool-use observability hooks. This
two-phase fix restores Bridge as a useful surface.

**v6.10.0 — Data Truth (commit `ec9c632`)**
- New table `cli_activity_log` for tool-call observability (intent, tool_name,
  bytes-based fields). Tool calls no longer write to `bridge_dispatch_log`.
- `/api/admin/health/log-external` rewritten to write `cli_activity_log`,
  emits `cli:activity` SSE event.
- `~/.claude/hooks/porter-activity-log.js` updated: reports current model
  (Opus 4.7 via `CLAUDE_MODEL` env or default), uses bytes-based payload.
- Migration `bridge_v8` purged 3,965 legacy `external_cli` rows from
  `bridge_dispatch_log`.
- Claude CLI adapter advertises Opus 4.7 + Haiku 4.5; `model-catalog.ts`
  Haiku 4.5 pricing corrected to $1/$5 per M tokens.
- All 5 models now active in DB with pricing: Opus 4.7 ($15/$75),
  Opus 4.6 ($15/$75), Sonnet 4.6 ($3/$15), Haiku 4.5 ($1/$5),
  Haiku 3.5 ($0.25/$1.25).

**v6.11.0 — Page Pass + Live Motion (commit `29a0f3b`)**
- Bridge page rebuilt with 5 tabs: Status / Dispatches / Costs / Models /
  CLI Activity. Reuses the previously-orphaned components.
- Status tab: gateway pill + 5 metric cards (dispatches 24h/7d, cost 7d,
  avg latency, CLI calls 24h) + LiveDispatchTicker.
- New `cli-activity.tsx` — 24h tool histogram + paginated activity table.
- New `live-dispatch-ticker.tsx` — SSE-driven event feed; pulses on
  `bridge:dispatch`, shows last 12 events (mixed dispatch + CLI).
- New endpoints: `GET /api/admin/bridge/summary` and
  `GET /api/admin/bridge/cli-activity`.
- `cli:activity` events now broadcast on Brain SSE (`/api/events`) so the
  ticker uses one stream for both event types.

**Known follow-ups (not blocking):**
- Real Claude CLI dispatches are logged with `model_name = "Claude CLI"`
  (gateway name) instead of an Anthropic SKU like `claude-opus-4-7`,
  so cost lookups return null. Routing engine needs to translate the
  adapter's effective model into the catalog name on log insert.
- The 3 zero-byte garbage files in `backend/` (`\001\342\322\002@…`)
  are pre-existing and untracked; safe to ignore but should be cleaned.

## Architecture

Single monorepo (heymoezy/porter). One Fastify process on :3001. API metering business model.
3 pillars: Bridge (hub), Forge (factory), Recall (shared brain).
1 gateway: Claude CLI. Scripts (birth-templates) still call OpenClaw directly via HTTP when needed.

## v6.9.0 — Bridge simplified to Claude CLI only

Moe's call: the multi-gateway Bridge was complexity without value. 5 adapters → 1.

**What was removed (~4,100 lines):**
- 4 adapter files: openclaw.ts, ollama.ts, codex-cli.ts, gemini-cli.ts
- http-task-executor.ts (HTTP-based dispatch, only used by deleted adapters)
- routing-confidence.ts (confidence scoring across gateways — moot with 1 gateway)
- routing-rule-consistency.test.ts + usage-collector.test.ts
- 4 DB gateway rows (only `claude_cli` remains)

**What was simplified:**
- routing-engine.ts (1,071 → 565): no fallback chains, no routing rules evaluation, no heuristic scoring. `select()` returns Claude. `selectWithFallback()` dispatches once.
- startup-detector.ts (333 → 152): only detects Claude binary
- usage-collector.ts (919 → 361): only Claude OAuth + rate-limit sniffing
- model-catalog.ts (440 → 361): Claude models only
- task-executor.ts (421 → 289): CLI subprocess only
- agent-delegation.ts (287 → 258): always delegates to Claude
- stream-service.ts (76 → 50): backend param ignored
- dispatch-queues.ts (54 → 33): single queue
- capability-registry.ts: Claude entry only
- types.ts: `GatewayType = 'claude_cli'`

**What still works unchanged:**
- rate-limit-tracker.ts (516) — already per-gateway-id, works with 1
- circuit-breaker-registry.ts (103) — same
- health-probe.ts (184) — adapter-agnostic, probes Claude
- retry.ts (80) — error classification is gateway-agnostic
- stream-normalizer.ts (46) — unchanged
- All dispatch logging (bridge_dispatch_log) — still records every dispatch
- All callers (ai-router.ts, task-decomposition, chat routes) — unchanged API surface

**Phase 4+5 completed (same session):**
- Deleted `routing-rules.tsx` (524 LOC) and `workspace-gateway-overrides.tsx` (225 LOC) from frontend
- Removed their imports from bridge.tsx
- Deleted routing-rules and workspace-config CRUD handlers from all 3 admin bridge route files (470 LOC)
- Frontend rebuilt, bridge page renders clean with single Claude CLI gateway card

**Post-ship fixes:**
- Fixed `/api/admin/bridge/confidence` returning `{}` instead of `[]` — caused bridge page crash (`{}.reduce is not a function` caught by ErrorBoundary as "Content failed to load")
- Added `claude-opus-4-7` and `claude-haiku-4-5` to model catalog + DB (5 models total)
- Replaced 3-agent tab navigation (Vigil/Compass/Ledger) with simple Status/Models/Costs tabs — single gateway doesn't need agent personas
- Removed unused PixelPortrait and useNavigate imports from bridge.tsx

**Total across v6.9.0:** ~5,500 lines removed. Bridge is fully simplified.

**Current state of bridge page:**
- 3 tabs: Status / Models / Costs
- 1 gateway: Claude CLI (active)
- 5 models: claude-opus-4-7, claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5, claude-haiku-3-5
- All dispatch logging, cost analytics, health probes still operational

Commits: `cb13a7d` (backend), `98171ed` (admin cleanup), `ad40f77` (confidence fix), `c8d942f` (models + UI)

## v6.8.1 — Anthropic API gateway removed

Moe flagged that Porter does not connect directly to the Anthropic API — the `anthropic_api` adapter was added speculatively and never had a live use case. Cleaned it out end-to-end.

- Deleted `backend/src/services/bridge/adapters/anthropic-api.ts` (531 lines)
- Dropped `'anthropic_api'` from `GatewayType` union in `types.ts`
- Removed entry from `ADAPTER_MAP` and barrel exports in `adapters/index.ts`
- Removed `anthropic_api` capability record from `capability-registry.ts`
- DB: `DELETE FROM gateways WHERE type='anthropic_api'` (1 row: `anthropic-api-gw`)
- `seed-autonomy-agents.ts`: all 4 autonomy agents (Queuemaster, Vigil, Atlas, Ledger) now `preferredBackend: 'openclaw'`; narrowed type union
- `generate-persona-openclaw.ts` + `birth-templates.ts`: prompt context updated (6 adapters → 5); tooling notes rewritten to route through openclaw for server-side tool execution
- Persona files: `personas/vigil/SYSTEM_PROMPT.md` and `personas/warden/ROLE_CARD.md` cleaned of `anthropic_api` references

**Verified:** tsc clean, `npm run build` clean, health returns `v6.8.1`, DB lists 5 gateway types (claude_cli/codex_cli/gemini_cli/ollama/openclaw), 0 personas/dispatches/routing_rules referenced `anthropic_api` before the delete.

**Known orthogonal issue:** `gateways.status` for `openclaw` row says `unavailable` even though the HTTP probe at :18789 returns up via `/api/v1/health` backends check. Not caused by this cleanup — pre-existing. Worth investigating next.

Commit: `893499c`

## v6.8.0 — Born = components, not instances (DB-enforced)

Fixes the lingering conceptual mess from v6.7.0: the Forge "Born" counter was reading from persona existence instead of template content, letting five impossible states sit in the DB (Quill on thin Storyteller, Anvil on thin Platform Engineer, Sage on thin Training Specialist, Skills Curator on empty KB Manager, Atlas on 0-byte Projects Curator).

**New rule, now impossible to break:**

A template is BORN when all four text fields meet the threshold:
- `system_prompt  ≥ 500` bytes
- `soul_text      ≥ 200` bytes
- `role_card_text ≥ 200` bytes
- `identity_text  ≥  50` bytes

Instances (personas) are snapshots of a born component. An instance cannot exist on a non-born template — the PostgreSQL trigger `personas_template_born_check` (migration `migrate-born-check-v1.ts`) rejects any INSERT or UPDATE of `personas.template_id` that points at a thin template. Error message points the operator at `backend/scripts/birth-templates.ts` so the fix path is obvious.

**5 orphans birthed via OpenClaw** (direct dispatch, bypasses Porter Bridge memory injection to avoid GPT-5.4 hallucinating tool calls):
- `cre-storyteller` (Quill's template) — 6.5KB content
- `eng-platform` (Anvil's template) — 7.3KB
- `sup-training` (Sage's template) — 6.8KB
- `sup-knowledge-base` (Skills Curator's template) — 7.4KB
- `projects-curator-tpl` (Atlas's template) — 6.7KB

Now `Quill/Sage/Anvil/Skills Curator/Atlas` are legitimate snapshots of born components.

**Born counter now reads truth.** `/api/admin/forge` returns `stats.complete: 15` and `bornTemplateIds` lists the 15 templates that actually have substantive content (10 pre-existing + 5 newly-birthed). The remaining 93 templates in the catalog are skeletons — visible in the Forge tab, but marked not-yet-born, and the DB trigger prevents anyone from creating instances on them until they get their own Writer dispatch.

**Semantic overlap audit at `research/template-overlap-audit.md`** — 22 clusters flagged for Moe's review. Zero deletions. Each cluster has my opinion (KEEP / NEEDS_MOE / MERGE) and the reason it was flagged (shared final word in name, or Jaccard similarity on description tokens ≥40%). The 3 non-conforming system-agent IDs (analytics-collector, crm-sweeper, system-maintenance) are called out separately — they're real agents in seed-templates.ts, recommendation KEEP.

**Key files added:**
- `backend/scripts/birth-templates.ts` — canonical "birth a template via OpenClaw" primitive. Targets template IDs by name, looks up the existing instance character name (if any) to keep the soul on the template, writes directly into `agent_templates` (not persona .md files).
- `backend/scripts/audit-template-overlaps.ts` — overlap detector. Same-category-same-last-word clustering plus Jaccard on descriptions. Re-runnable, deterministic.
- `backend/src/db/migrate-born-check-v1.ts` — trigger migration. Idempotent. Guards against existing orphans before creating the trigger (warns in logs rather than failing).
- `research/template-overlap-audit.md` — the audit report output.

**Verification gates — all passed:**
1. SQL born count = 15 ✓
2. `/api/admin/forge` `stats.complete` = 15 ✓
3. `bornTemplateIds` contains the 5 previously-orphan templates ✓
4. `INSERT INTO personas ... template_id='cnt-writer'` → trigger rejects with explicit error ✓
5. Existing orphan personas now validate (UPDATE no-op succeeds) ✓
6. `research/template-overlap-audit.md` exists (22 clusters, 330 lines) ✓
7. `curl /health` returns `v6.8.0` ✓
8. Migration ran at startup: `[migrate-born-check-v1] complete` in logs ✓

**What is NOT in this ship (explicit scope boundary):**
- Birthing the remaining 93 thin templates — not needed right now; they're not blocking. On-demand via `birth-templates.ts <id>`.
- Deleting any templates from the overlap audit — report is input to a conversation, not a fait accompli.
- Rewiring the Forge runWriter() station to generate content via OpenClaw instead of copying existing text — that's a separate architecture fix.
- Renaming the 3 non-conforming-ID system templates — would break internal code references.

**Memory update:** new entry `feedback_born_components.md` carries the four-threshold rule and the trigger enforcement fact so no future session (mine or another model's) can regress.

---


## v6.7.0 — Forge + Gateway tabs autonomous

Four agents launched as real heartbeat-driven instances. The Forge and Gateway admin tabs are now owned by autonomous Porter agents instead of static polling.

**4 templates + 4 instances** (per the components doctrine):
- `tmpl-forge-queuemaster` → `forge-queuemaster` (30s heartbeat) — owns the Forge pipeline
- `tmpl-bridge-vigil` → `bridge-vigil` (30s heartbeat) — gateway health monitor
- `tmpl-bridge-atlas` → `bridge-atlas` (hourly) — routing optimizer
- `tmpl-bridge-ledger` → `bridge-ledger` (hourly) — cost controller

**Personas written by OpenClaw via real Porter Bridge dispatch.** No more "background agent" fiction. Generation script at `backend/scripts/generate-persona-openclaw.ts` is the canonical birth-via-OpenClaw primitive — re-runnable, idempotent, supports `--direct` fallback for the rare case where Porter Bridge memory injection makes GPT-5.4 hallucinate tool use. Each agent's 4 .md files (IDENTITY, SOUL, ROLE_CARD, SYSTEM_PROMPT) total ~7-9KB.

**Job executor at `backend/src/services/job-executor.ts`** — generic heartbeat scanner + dispatcher. Scans `personas WHERE heartbeat_enabled=1` every 5s, computes due time from `agent_templates.heartbeat_interval` or parses `personas.heartbeat_cron` for the two formats Porter uses, inserts `agent_jobs` rows with `source='job-executor'`, then claims them via `SELECT FOR UPDATE SKIP LOCKED` and dispatches through `/api/v1/chat/stream`. Exponential backoff (30s → 90s → 270s) on failure, max 3 attempts, then fails permanently with the error captured.

**Forge service rewired** to attribute every tick to `forge-queuemaster` via SSE event `forge:queuemaster_tick` and an `intelligence_feed` row per tick. Forge tab broken link `/agents/forge-queue-master` → `/agents/forge-queuemaster` fixed in `admin/frontend/app/routes/forge.tsx:418`. Old persona dirs `forge-quill`, `forge-sage`, `forge-anvil` deleted — their station logic is folded into the queuemaster's SOUL.md as Writer/Trainer/Outfitter sub-doctrines.

**Routing rules** scoped per-agent in `routing_rules` (`autonomy-*` IDs) force these dispatches to OpenClaw (anthropic_api will take over once it's healthy).

**Root-cause fixes (no band-aids):**
- `openclaw.ts` adapter: hardcoded `lobster-2026` token removed. Now reads `~/.openclaw/openclaw.json → gateway.auth.token` as the canonical source of truth (respects `OPENCLAW_STATE_DIR`). Falls back to `OPENCLAW_TOKEN` env. No fallback to a hardcoded value — missing token surfaces explicitly via `health()`.
- `openclaw.ts` adapter: removed system-role message injection per Moe's rule "no system prompts to external models". The dispatch protocol override is now a user-role preamble.
- `stream-service.ts` `selectStreamBackend()`: the `backend` parameter was previously cosmetic — it is now translated into `forceGatewayType` on the routing context so explicit gateway choices actually take effect.
- `scheduler.ts` `claimNextJob()`: no longer claims jobs with `source='job-executor'`. Two systems were racing for the same rows; the existing scheduler's `result.response.slice(2000)` path was throwing on every persona tick.
- `rpg-engine.ts` `awardXP()`: now resolves persona instance IDs to template IDs before writing to `agent_rpg_stats`. Was throwing FK violations on every dispatch from a persona that wasn't itself a template ID.
- Two `openclaw-gateway.service` units (user + system) were SIGTERMing each other every ~15s, causing OpenClaw to flap. User unit stopped, system unit (v2026.3.8 at `/etc/systemd/system/`) is the canonical one.

**Verification — all 8 gates passed:**
1. Health: 5/6 gateways active (anthropic_api still unavailable; openclaw recovered)
2. Seed: 4 personas + 4 templates present, heartbeat_enabled=1
3. Files: 16 .md files, 32243 bytes total
4. Dispatch provenance: 7+ openclaw rows in bridge_dispatch_log for our agents
5. Heartbeat firing: bridge-vigil within 107s, forge-queuemaster within 39s
6. Recent jobs: 4/4 completed, zero failures after restart
7. Intelligence feed: forge-queuemaster entries present
8. Forge API: returns running=true cleanly

**v6.6.0 — Anthropic API gateway** (the previous version's work) was committed to code but the version was never bumped in package.json. v6.7.0 carries both that work and the autonomy launch.

---

## v6.6.0 — Anthropic API Gateway (6th adapter)

## v6.6.0 — Anthropic API Gateway (6th adapter)

**New adapter:** `anthropic_api` — direct HTTP adapter for Anthropic Messages API with server-side tool execution.

Unlike CLI adapters, this runs tools IN-PROCESS — no terminal, no approval prompts, no subprocess overhead. The adapter executes an agentic loop: model responds with tool_use → execute server-side → send result → repeat until done.

**Server-side tools (5):**
- `web_search` — Brave Search API (key in porter_config.json)
- `web_fetch` — HTTP GET with HTML→text extraction (50KB cap)
- `read_file` — local filesystem (100KB cap)
- `write_file` — sandboxed to /home/lobster/projects/ and /tmp/
- `bash` — shell execution (30s timeout, destructive commands blocked)

**Key files:**
- `backend/src/services/bridge/adapters/anthropic-api.ts` — full adapter
- `backend/src/services/bridge/adapters/index.ts` — registered in ADAPTER_MAP
- `backend/src/services/bridge/types.ts` — `anthropic_api` added to GatewayType union
- `backend/src/services/bridge/capability-registry.ts` — capability record added

**Database:**
- Gateway row: `anthropic-api-gw` in gateways table
- Routing rules: 4 agent-scoped force_model rules routing research agents to anthropic_api
- Research agent personas: `agent-res-market`, `agent-leg-regulatory`, `agent-biz-vendor`
- Enriched templates: `res-market`, `leg-regulatory`, `biz-vendor` have deep system prompts

**Anthropic API activation:** Set `ANTHROPIC_API_KEY` in env, or add `api_keys.anthropic` to porter_config.json. Also supports Claude Code OAuth tokens from `~/.claude/.credentials.json` as fallback (with auto-refresh). Gateway auto-detects and becomes healthy.

**Claude CLI adapter enhanced (v6.6.0):**
- `--permission-mode auto` + `--allowedTools WebSearch,WebFetch,Read,Write,Edit,Bash,Glob,Grep,Agent` — tools execute without terminal approval
- Timeout increased to 5 min (was 60s) for research tasks
- Parser captures assistant text from tool-execution loops (was missing post-tool output)
- Agent-targeted dispatches bypass delegation doctrine (no more escalate interception)

**Why this matters:** Research agents now run fully autonomously — web search, read sources, save findings to disk — all through Porter Bridge, with full dispatch logging, cost tracking, and memory injection. No human in the loop for tool approval. Dispatching is one curl to `/api/v1/chat/stream` with `agent_id`.
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
**Phase F: Marketing** — DONE (landing page live at askporter.app for unauthenticated visitors, marketing strategy doc, positioning/pricing/channels defined)
**Phase G: Revenue** — DONE (billing routes wired, usage metering by user, plans API with Free/$29 Pro/$99 Enterprise, LemonSqueezy subscription integration, funnel metrics)

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

## 2026-04-12 — Bridge Ledger Persona Authoring

- Reviewed canonical checkpoint and latest git activity before drafting.
- Authored production persona content for `bridge-ledger` / `tmpl-bridge-ledger`:
  `IDENTITY.md`, `SOUL.md`, `ROLE_CARD.md`, `SYSTEM_PROMPT.md`.
- Ledger doctrine locked to SQL-first daily re-aggregation from
  `bridge_dispatch_log` into `token_usage_daily`, immutable historical pricing,
  attribution-gap detection on `input_tokens` / `output_tokens` /
  `estimated_cost_usd`, and `budget_warning` publication to `intelligence_feed`
  when a user exceeds 80% of daily cap.
