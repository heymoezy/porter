# Requirements: Porter v6.0 — The Orchestration Platform

**Defined:** 2026-04-03
**Core Value:** Porter is the orchestration platform — you tell Porter what you want, Porter figures out how to get it done across multiple AI models.

## v6.0 Requirements

### Task Decomposition

- [ ] **TDE-01**: Complex requests are classified (simple vs multi-step) before dispatch — simple go direct, complex get decomposed
- [ ] **TDE-02**: Complex tasks produce a dependency DAG (task_nodes table) with parallel and sequential relationships
- [ ] **TDE-03**: DAG executor dispatches ready tasks in parallel, respects dependencies, tracks completion
- [ ] **TDE-04**: When a subtask fails, the joiner decides: retry, replan the subtask, or escalate to user
- [ ] **TDE-05**: Final synthesis step combines subtask results into a coherent response for the caller

### Inter-Agent Messaging

- [ ] **IAM-01**: Agents can dispatch structured work to other agents via the existing /api/v1/bridge/agent-message endpoint
- [ ] **IAM-02**: Message chains track correlation IDs, hop counts, and full audit trail via msg_bus_events table
- [ ] **IAM-03**: Porter acts as coordinator — all inter-agent messages route through Porter, not peer-to-peer
- [ ] **IAM-04**: Agent responses feed back through the decomposition engine for synthesis

### Autonomous Job Queue

- [ ] **AJQ-01**: agent_jobs table stores structured work items with status lifecycle (queued → assigned → running → complete/failed)
- [ ] **AJQ-02**: Job assignment engine matches jobs to best available agent based on skills, gateway capabilities, and cost tier
- [ ] **AJQ-03**: Porter can self-dispatch jobs (scheduled analysis, health checks, monitoring) without human trigger
- [ ] **AJQ-04**: Admin can view job queue, running jobs, completed jobs, and assignment history

### Gateway Capabilities

- [x] **GWC-01**: Each gateway has a capabilities registry (strengths, cost_tier, context_window, tool_support, agentic flag)
- [x] **GWC-02**: Task dispatch selects gateway based on task requirements matched against capabilities
- [x] **GWC-03**: Dynamic tool schema — only send tools that the target gateway actually supports
- [x] **GWC-04**: All 5 gateways (Claude CLI, Codex CLI, Gemini CLI, OpenClaw, Ollama) work through task dispatch with tool execution

### Project Monitoring

- [ ] **PMN-01**: project_watchers table stores watcher configs (name, type, schedule, config JSONB, output mode, status)
- [ ] **PMN-02**: Watcher types: web_search, email_monitor, rss_feed, custom (freeform prompt)
- [ ] **PMN-03**: Watcher results appear in project activity feed with source badge, summary, expandable detail
- [ ] **PMN-04**: Important findings trigger notifications (in-feed + optional email)
- [ ] **PMN-05**: Admin ops view shows all active watchers across projects with last/next run and resource usage

### Project Substrate

- [ ] **PSB-01**: Every project folder has a canonical /_system/ directory with project.md, checkpoint.md, memory.md, decisions.md, tasks.md, agents.md
- [ ] **PSB-02**: Default project structure includes /_system/, /intake/, /context/, /work/, /outputs/, /archive/
- [ ] **PSB-03**: Upload triggers intelligence ingress: classify, route to correct project location, emit signal, update project context
- [ ] **PSB-04**: Atlas agent monitors project structure health and repairs drift

### Session Intelligence

- [x] **SIN-01**: Memory frozen at session start — injected in system prompt, never mutated mid-session
- [ ] **SIN-02**: FTS5 cross-session search — agents can query past sessions for relevant context
- [ ] **SIN-03**: Dispatch outcome scoring feeds back into routing confidence — Porter learns which gateways work best

### Porter Control Plane

- [ ] **PCP-01**: Porter persona enforces delegation doctrine — direct answer vs handoff vs parallel vs escalate
- [ ] **PCP-02**: Subagent depth limits (max 2 hops) with tool restrictions on child dispatches
- [ ] **PCP-03**: Approval gates for high-risk actions (code mutation, external API calls, file deletion)

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
| SIN-02 | Phase 41 | Pending |
| SIN-03 | Phase 41 | Pending |
| TDE-01 | Phase 42 | Pending |
| TDE-02 | Phase 42 | Pending |
| TDE-03 | Phase 42 | Pending |
| TDE-04 | Phase 42 | Pending |
| TDE-05 | Phase 42 | Pending |
| IAM-01 | Phase 43 | Pending |
| IAM-02 | Phase 43 | Pending |
| IAM-03 | Phase 43 | Pending |
| IAM-04 | Phase 43 | Pending |
| AJQ-01 | Phase 44 | Pending |
| AJQ-02 | Phase 44 | Pending |
| AJQ-03 | Phase 44 | Pending |
| AJQ-04 | Phase 44 | Pending |
| PCP-01 | Phase 45 | Pending |
| PCP-02 | Phase 45 | Pending |
| PCP-03 | Phase 45 | Pending |
| PMN-01 | Phase 46 | Pending |
| PMN-02 | Phase 46 | Pending |
| PMN-03 | Phase 46 | Pending |
| PMN-04 | Phase 46 | Pending |
| PMN-05 | Phase 46 | Pending |
| PSB-01 | Phase 47 | Pending |
| PSB-02 | Phase 47 | Pending |
| PSB-03 | Phase 47 | Pending |
| PSB-04 | Phase 47 | Pending |

**Coverage:**
- v6.0 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-02 — traceability populated by roadmapper*
