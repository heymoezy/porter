# Porter Checkpoint
# CANONICAL — all gateways read this file. Do not create per-gateway checkpoints.
# Location: /home/lobster/projects/porter/CHECKPOINT.md

project: porter
version: v6.2.0
updated: 2026-04-04
updated_by: claude-opus-4.6

## Architecture

Single monorepo (heymoezy/porter). One Fastify process on :3001. API metering business model.
3 pillars: Bridge (hub), Forge (factory), Recall (shared brain).
5 gateways: Claude CLI, OpenClaw, Ollama, Codex CLI, Gemini CLI.
**Port 5175 is DEAD. Everything on :3001.**

## Milestone v6.2 — Platform Intelligence Surface — COMPLETE

Inspired by Claude Code CLI teardown (command system, tool orchestration, cost tracking, lifecycle hooks, UI patterns). 8 new admin pages exposing hidden database surfaces:

### New Pages (v6.2.0)
1. **Costs** `/costs` — Cost analytics from bridge_dispatch_log (by gateway, model, agent, project, daily chart, recent dispatches)
2. **Battle Arena** `/battles` — Agent vs agent matches, leaderboard (elo), bonds (combo scores)
3. **Decisions** `/decisions` — Agent decision log (routing, delegation, model selection reasoning)
4. **Sessions** `/sessions` — Active session registry (token budgets, context sizes, routing)
5. **Message Bus** `/msg-bus` — Agent-to-agent communication events (intent, latency, status)
6. **Env Tools** `/env-tools` — Detected environment tools (health, versions, capabilities)
7. **Learnings** `/learnings` — Session-extracted knowledge (by source, backend)
8. **Skill Evolution** — Merged into Skills page as tabs (Studio | Proposals | History)

### Holistic Connections
- All pages cross-linked: agent names → /agents/:id, gateways → /bridge, skills → /skills
- Bridge page links to /costs and /sessions
- System page links to /sessions, /msg-bus, /decisions
- Forge page links to /battles and skill evolution
- Billing page links to /costs for detailed analytics
- Dashboard shows real dispatch feed + real projects (removed 50+ lines of fake seed data)

### Consolidation
- Evolution page merged into Skills (3 tabs: Studio | Proposals | History)
- /evolution redirects to /skills (backwards compat)
- Deleted dead files: skills-redirect.tsx, tools-redirect.tsx
- Removed Evolution from sidebar nav (consolidated into Skills)

### Navigation Structure (v6.2.0)
- Dashboard
- Projects: Projects
- Business: Customers, Revenue, **Costs** (NEW)
- Agents: Forge, Org Chart, Email, **Battle Arena** (NEW)
- Ops: Bridge, Recall, **Message Bus** (NEW), **Sessions** (NEW), **Decisions** (NEW), Mail Ops, Watchers, Approvals, Decomposition, Intelligence, System
- Dev: **Env Tools** (NEW), **Learnings** (NEW), Design System, Architecture

## Previous Milestones
- v6.0-v6.1: Orchestration Platform (8 phases: gateway registry, session intelligence, task decomposition, inter-agent messaging, job queue, control plane, project monitoring, project substrate)
- Mail system: 13 tranches complete (full SMTP via Stalwart)

## Queued Work
1. Claude Code-inspired: lifecycle hook system, concurrent tool execution, notification folding
2. Dashboard: replace hardcoded revenue/customer curves with real billing data
3. Agent status animations (shimmer/pulse for active workers)
4. Stall detection for workers
