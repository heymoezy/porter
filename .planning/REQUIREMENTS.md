# Requirements: Porter v6.0 — The Orchestration Platform

**Defined:** 2026-04-03
**Core Value:** Porter is the orchestration platform — you tell Porter what you want, Porter figures out how to get it done across multiple AI models.

## v6.0 Requirements

### Task Decomposition

- [x] **TDE-01**: Complex requests are classified (simple vs multi-step) before dispatch — simple go direct, complex get decomposed
- [x] **TDE-02**: Complex tasks produce a dependency DAG (task_nodes table) with parallel and sequential relationships
- [x] **TDE-03**: DAG executor dispatches ready tasks in parallel, respects dependencies, tracks completion
- [x] **TDE-04**: When a subtask fails, the joiner decides: retry, replan the subtask, or escalate to user
- [x] **TDE-05**: Final synthesis step combines subtask results into a coherent response for the caller

### Inter-Agent Messaging

- [x] **IAM-01**: Agents can dispatch structured work to other agents via the existing /api/v1/bridge/agent-message endpoint
- [x] **IAM-02**: Message chains track correlation IDs, hop counts, and full audit trail via msg_bus_events table
- [x] **IAM-03**: Porter acts as coordinator — all inter-agent messages route through Porter, not peer-to-peer
- [ ] **IAM-04**: Agent responses feed back through the decomposition engine for synthesis

### Autonomous Job Queue

- [x] **AJQ-01**: agent_jobs table stores structured work items with status lifecycle (queued → assigned → running → complete/failed)
- [x] **AJQ-02**: Job assignment engine matches jobs to best available agent based on skills, gateway capabilities, and cost tier
- [x] **AJQ-03**: Porter can self-dispatch jobs (scheduled analysis, health checks, monitoring) without human trigger
- [x] **AJQ-04**: Admin can view job queue, running jobs, completed jobs, and assignment history

### Gateway Capabilities

- [x] **GWC-01**: Each gateway has a capabilities registry (strengths, cost_tier, context_window, tool_support, agentic flag)
- [x] **GWC-02**: Task dispatch selects gateway based on task requirements matched against capabilities
- [x] **GWC-03**: Dynamic tool schema — only send tools that the target gateway actually supports
- [x] **GWC-04**: All 5 gateways (Claude CLI, Codex CLI, Gemini CLI, OpenClaw, Ollama) work through task dispatch with tool execution

### Project Monitoring

- [x] **PMN-01**: project_watchers table stores watcher configs (name, type, schedule, config JSONB, output mode, status)
- [x] **PMN-02**: Watcher types: web_search, email_monitor, rss_feed, custom (freeform prompt)
- [x] **PMN-03**: Watcher results appear in project activity feed with source badge, summary, expandable detail
- [x] **PMN-04**: Important findings trigger notifications (in-feed + optional email)
- [x] **PMN-05**: Admin ops view shows all active watchers across projects with last/next run and resource usage

### Project Substrate

- [x] **PSB-01**: Every project folder has a canonical /_system/ directory with project.md, checkpoint.md, memory.md, decisions.md, tasks.md, agents.md
- [x] **PSB-02**: Default project structure includes /_system/, /intake/, /context/, /work/, /outputs/, /archive/
- [x] **PSB-03**: Upload triggers intelligence ingress: classify, route to correct project location, emit signal, update project context
- [x] **PSB-04**: Atlas agent monitors project structure health and repairs drift

### Session Intelligence

- [x] **SIN-01**: Memory frozen at session start — injected in system prompt, never mutated mid-session
- [x] **SIN-02**: FTS5 cross-session search — agents can query past sessions for relevant context
- [x] **SIN-03**: Dispatch outcome scoring feeds back into routing confidence — Porter learns which gateways work best

### Porter Control Plane

- [x] **PCP-01**: Porter persona enforces delegation doctrine — direct answer vs handoff vs parallel vs escalate
- [x] **PCP-02**: Subagent depth limits (max 2 hops) with tool restrictions on child dispatches
- [x] **PCP-03**: Approval gates for high-risk actions (code mutation, external API calls, file deletion)

### Dream Silos (Phase 48 series)

- [x] **DRM-01**: A `silos` registry table holds per-domain configuration (id, display_name, prompt_path, cadence_seconds, default_model, detect_rules JSONB, enabled). Software silo is seeded with detect_rules covering project_types and file globs
- [x] **DRM-02**: `/api/v1/intellect/context` returns silo-scoped directives (`scope='silo'` rows) in a labeled `## Silo: <name> — Operating Rules` section, separate from global/project/agent directives, never blended
- [x] **DRM-03**: Session-start hook detects the active silo from cwd + cheap content heuristics (file globs, code keywords); returns null when ambiguous so no silo directives inject in mixed/unknown contexts
- [x] **DRM-04**: A `/silo <name>` CLI command persists explicit silo tagging for the active session, overriding heuristic detection; clears with `/silo none`
- [x] **DRM-05**: Seed directives (`source_type='moe-direct'`) are protected — no automated process can delete or modify them; flagged via the existing source_type column

### Transcript Capture (Phase 48.2)

- [x] **TRC-01**: `session_transcript_turns` table exists with `id, session_id, turn_index, role, silo_id, cwd, content, captured_at` columns; UNIQUE(session_id, turn_index) for idempotency; composite indexes on (silo_id, captured_at DESC) and (captured_at) to serve 48.3 read pattern and retention DELETE
- [x] **TRC-02**: `UserPromptSubmit` hook extension writes one user-role row per non-/silo prompt to POST /api/v1/intellect/transcript/turn; fire-and-forget; never blocks the prompt pipeline
- [x] **TRC-03**: NEW `Stop` hook reads `transcript_path` JSONL from a per-session byte-offset bookmark, filters to assistant-only rows (skip attachment/queue-operation/isSidechain), and POSTs each to /api/v1/intellect/transcript/turn
- [x] **TRC-04**: Silo tagged at INSERT time by calling `detectSilos({cwd, sessionId})` from silo-detector.ts; nullable when no silo detected (Porter cwd → 'software', non-code cwd → NULL)
- [x] **TRC-05**: PII filter (`scrubPII` shared helper at `backend/src/services/intellect/pii-scrub.ts`, refactored from learner.ts) applied at INSERT — email/@-handle/phone replaced with `[REDACTED]` before persistence
- [x] **TRC-06**: 30-day hard-delete retention as a daily-scheduled workflow row (`workflows.action_type='transcript_retain'`, trigger_value='every_24h') invoked by `runScheduledWorkflows('every_24h')`; manual `POST /api/v1/intellect/transcript/retention-run` available for ops
- [x] **TRC-07**: Privacy kill switches — per-session `/silo none` override row (silo_id IS NULL) suppresses capture; global config flag `intellect.transcriptCaptureEnabled` (default true, env `INTELLECT_TRANSCRIPT_CAPTURE_ENABLED`) as admin-side belt-and-braces
- [x] **TRC-08**: Idempotency — Stop-hook re-fire on the same JSONL produces zero duplicates via UNIQUE(session_id, turn_index) + INSERT ... ON CONFLICT DO NOTHING; server-assigned turn_index from MAX+1 inside the same transaction

### Software Dream Worker (Phase 48.3)

- [x] **DRW-01**: `memory_proposals` table with locked columns (id, dream_run_id, silo_id, proposal_kind ∈ {merge,supersede,delete,new_directive}, target_directive_ids TEXT[], proposed_content, proposed_metadata jsonb, source_evidence jsonb, sort_order, status ∈ {pending,accepted,rejected,expired}, created_at, expires_at, reviewed_at, reviewed_by) + CHECK constraints on proposal_kind and status + 3 indexes serving the 48.4 read contract: (silo_id, status, created_at DESC), (dream_run_id, sort_order ASC), partial (status, expires_at) WHERE status='pending'
- [x] **DRW-02**: `dream_runs` table (id, silo_id, status ∈ {running,completed,failed}, model_used, triggered_by ∈ {schedule,manual}, triggered_by_user, action_config jsonb, prompt_token_estimate, response_token_estimate, turns_sampled, sessions_sampled, proposals_extracted, duration_ms, error_message, dispatch_id, started_at, completed_at) + CHECK constraints + 2 indexes: (silo_id, started_at DESC) and (status)
- [x] **DRW-03**: Dream prompt template file at `backend/src/services/intellect/dream-prompts/software.md` matching `silos.prompt_path` (seeded by 48.1, file written by 48.3). Contains 5 substitution markers ({{ACTIVE_DIRECTIVE_COUNT}}, {{ACTIVE_DIRECTIVES_BLOCK}}, {{TRANSCRIPT_BLOCK}}, {{TURNS_SAMPLED}}, {{SESSIONS_SAMPLED}}), enumerates the four Refinement Doctrine principles, forbids delete/supersede on `source_type='moe-direct'`, demands strict JSON output (no fence/preamble), includes pre-response self-check checklist
- [ ] **DRW-04**: `dream-worker.ts` runs end-to-end pipeline: sample transcript turns → load active directives → render prompt body via template substitution → dispatch via Bridge with raw passthrough → parse JSON response → validate Zod schema → validate refinement doctrine → pre-flight target-id-exists + sealed-seed checks → assign deterministic sort_order → insert all proposals transactionally (BEGIN/COMMIT/ROLLBACK) → update dream_runs row with stats
- [ ] **DRW-05**: Bridge dispatch via `routingEngine.selectWithFallback` (direct, no HTTP); RoutingContext sets only forceGatewayType='claude_cli' + forceModelName; deliberately OMITS agentId/projectId/skillsUsed/dispatchStrategy. Worker module does NOT call buildMemoryContext, selectSkills, or decideDoctrine — `raw: true` semantics replicated by omission. Hard outer timeout AbortSignal.timeout(180_000). Mock-injection via env var `DREAM_WORKER_MOCK_RESPONSE_PATH` for smoke (production-inert)
- [x] **DRW-06**: Refinement doctrine enforcement at three layers — (1) prompt instruction, (2) `validateRefinementDoctrine()` rejects whole run when active_count > 4 AND proposals contain new_directive AND zero of {merge, supersede, delete}, (3) `assignSortOrder()` forces sort_order < new_directive for refinements within each conceptual_area. Empty proposals.length === 0 is SUCCESS (legitimate quiet week)
- [x] **DRW-07**: Sampling strategy — stratified 40/30/20 by recency (today / 1-2d / 3-7d) + 10% imperative-phrasing force-include + longest-first within stratum; 200KB default byte cap (Sonnet ceiling 800KB, Opus ceiling 2.5MB); per-turn cap 8KB with '... [truncated]' suffix; deterministic (no Math.random); samplingLog written to `dream_runs.action_config.sampling` for reproducibility
- [x] **DRW-08**: Weekly workflow row 'Software dream — weekly consolidation' (trigger_value='every_week', action_type='dream_run', action_config={"silo_id":"software"}); stuck-run sweep workflow 'Sweep stuck dream runs (>30 min)' (every_30m, action_type='dream_runs_stuck_sweep' — UPDATEs status='running' AND started_at < NOW()-1800 to status='failed'); new scheduler tick bucket `every_week = 302400 ticks` (7 days @ 2s/tick) firing `runScheduledWorkflows('every_week')`; skip-recent guard in worker (don't fire if last completed run < 6.5 days ago) and concurrency guard (only one running per silo)
- [ ] **DRW-09**: Manual trigger endpoint `POST /api/v1/intellect/dream-run` accepting `{silo_id?, model_override?, sample_size_override?, dry_run?}`; returns 202 with `{dream_run_id, status, poll_url}`; fires worker via setImmediate so endpoint never blocks; admin-cap guarded; 127.0.0.1-only (Porter port binding posture). Companion `GET /api/v1/intellect/dream-runs/:id` returns the dream_run row for polling
- [ ] **DRW-10**: Failure modes — Bridge timeout (>180s), Bridge error, model returns non-JSON, model returns malformed schema, doctrine violation, target_directive_id not found, sealed-seed targeted by delete/supersede, DB insert error — all flip `dream_runs.status='failed'` with error_message (capped 1KB), leave ZERO `memory_proposals` rows (ROLLBACK on tx error), log `dream_run_failed` intellect_event, re-throw so HTTP caller sees it
- [ ] **DRW-11**: Privacy + audit — worker reads only `WHERE silo_id='software'` so `/silo none` rows are invisible by construction; 5 intellect_event kinds (`dream_run_started`, `dream_run_completed`, `dream_run_failed`, `dream_run_skipped`, `dream_seed_flagged`); audit payloads contain ONLY counts/ids/status — NEVER turn content, NEVER prompt body, NEVER response text
- [x] **DRW-12**: Phase 48.4 read contract — `memory_proposals` indexes (silo_id, status, created_at DESC) and (dream_run_id, sort_order ASC) serve 48.4's list-pending-by-silo + group-by-run queries; partial index (status, expires_at) WHERE status='pending' serves the daily expiry sweep; sort_order guarantees refinement-before-append display ordering in 48.4
- [x] **DRW-13**: Smoke harness `tests/smoke-48.3.sh` covers DRW-01..DRW-12 with mock-injection via `DREAM_WORKER_MOCK_RESPONSE_PATH` + 3 hand-crafted fixtures (doctrine-compliant, malformed JSON, doctrine-violation); idempotent + self-cleaning via throwaway `silo_id='software-smoke-48.3'`; graceful skip for pre-implementation waves; poll-with-timeout for async worker

## v7.0 Requirements (Deferred)

### Self-Improvement
- **SIM-01**: Agent-driven development — agents detect bugs, write patches, ship through verification loop
- **SIM-02**: Pattern mining across dispatch history — auto-tune routing weights
- **SIM-03**: Self-modifying codebase with approval gates and rollback safety

### SaaS Billing
- **BIL-01**: Lemon Squeezy subscription integration
- **BIL-02**: Usage metering per workspace
- **BIL-03**: Plan limit enforcement

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile native app | Web-first, responsive design |
| Self-hosting support | SaaS-only for now |
| Custom model training | Use existing providers via routing |
| Video/voice calling | Chat and messaging only |
| Distributed substrate (multi-machine) | v6.0 is local-first; distributed is v7+ |
| Unsupervised code mutation | Always requires verification loop |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| GWC-01 | Phase 40 | Complete |
| GWC-02 | Phase 40 | Complete |
| GWC-03 | Phase 40 | Complete |
| GWC-04 | Phase 40 | Complete |
| SIN-01 | Phase 41 | Complete |
| SIN-02 | Phase 41 | Complete |
| SIN-03 | Phase 41 | Complete |
| TDE-01 | Phase 42 | Complete |
| TDE-02 | Phase 42 | Complete |
| TDE-03 | Phase 42 | Complete |
| TDE-04 | Phase 42 | Complete |
| TDE-05 | Phase 42 | Complete |
| IAM-01 | Phase 43 | Complete |
| IAM-02 | Phase 43 | Complete |
| IAM-03 | Phase 43 | Complete |
| IAM-04 | Phase 43 | Pending |
| AJQ-01 | Phase 44 | Complete |
| AJQ-02 | Phase 44 | Complete |
| AJQ-03 | Phase 44 | Complete |
| AJQ-04 | Phase 44 | Complete |
| PCP-01 | Phase 45 | Complete |
| PCP-02 | Phase 45 | Complete |
| PCP-03 | Phase 45 | Complete |
| PMN-01 | Phase 46 | Complete |
| PMN-02 | Phase 46 | Complete |
| PMN-03 | Phase 46 | Complete |
| PMN-04 | Phase 46 | Complete |
| PMN-05 | Phase 46 | Complete |
| PSB-01 | Phase 47 | Complete |
| PSB-02 | Phase 47 | Complete |
| PSB-03 | Phase 47 | Complete |
| PSB-04 | Phase 47 | Complete |
| DRM-01 | Phase 48.1 | Complete (48.1-01) |
| DRM-02 | Phase 48.1 | Complete (48.1-02 wired, 48.1-04 live-CLI verified) |
| DRM-03 | Phase 48.1 | Complete (48.1-02 detector, 48.1-04 session-start hook wired + verified) |
| DRM-04 | Phase 48.1 | Complete (48.1-03) |
| DRM-05 | Phase 48.1 | Complete (48.1-01) |
| TRC-01 | Phase 48.2 | Complete (48.2-01) |
| TRC-02 | Phase 48.2 | Complete (48.2-03) |
| TRC-03 | Phase 48.2 | Complete (48.2-03) |
| TRC-04 | Phase 48.2 | Complete (48.2-02) |
| TRC-05 | Phase 48.2 | Complete (48.2-02) |
| TRC-06 | Phase 48.2 | Complete (48.2-01 schema + workflow, 48.2-04 retention-run endpoint) |
| TRC-07 | Phase 48.2 | Complete (48.2-02 /silo-none gate, 48.2-04 global config flag) |
| TRC-08 | Phase 48.2 | Complete (48.2-03) |
| DRW-01 | Phase 48.3 | Pending (48.3-02) |
| DRW-02 | Phase 48.3 | Pending (48.3-02) |
| DRW-03 | Phase 48.3 | Pending (48.3-03) |
| DRW-04 | Phase 48.3 | Pending (48.3-04) |
| DRW-05 | Phase 48.3 | Pending (48.3-04, 48.3-05 live-verify) |
| DRW-06 | Phase 48.3 | Pending (48.3-03 + 48.3-04) |
| DRW-07 | Phase 48.3 | Pending (48.3-03 + 48.3-04) |
| DRW-08 | Phase 48.3 | Pending (48.3-02) |
| DRW-09 | Phase 48.3 | Pending (48.3-05) |
| DRW-10 | Phase 48.3 | Pending (48.3-04) |
| DRW-11 | Phase 48.3 | Pending (48.3-04) |
| DRW-12 | Phase 48.3 | Pending (48.3-02 + 48.3-04) |
| DRW-13 | Phase 48.3 | Pending (48.3-01) |

**Coverage:**
- v6.0 requirements: 56 total (35 prior + 8 TRC for Phase 48.2 + 13 DRW for Phase 48.3)
- Mapped to phases: 56
- Unmapped: 0

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-02 — traceability populated by roadmapper*
