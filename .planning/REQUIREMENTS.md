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
| TRC-01 | Phase 48.2 | Pending (48.2-01) |
| TRC-02 | Phase 48.2 | Pending (48.2-03) |
| TRC-03 | Phase 48.2 | Pending (48.2-03) |
| TRC-04 | Phase 48.2 | Pending (48.2-02) |
| TRC-05 | Phase 48.2 | Pending (48.2-02) |
| TRC-06 | Phase 48.2 | Pending (48.2-01, 48.2-04) |
| TRC-07 | Phase 48.2 | Pending (48.2-02, 48.2-04) |
| TRC-08 | Phase 48.2 | Pending (48.2-03) |

**Coverage:**
- v6.0 requirements: 43 total (35 prior + 8 TRC for Phase 48.2)
- Mapped to phases: 43
- Unmapped: 0

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-02 — traceability populated by roadmapper*
