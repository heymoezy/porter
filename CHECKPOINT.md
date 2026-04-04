# Porter Checkpoint
# CANONICAL — all gateways read this file. Do not create per-gateway checkpoints.
# Location: /home/lobster/projects/porter/CHECKPOINT.md

project: porter
version: v6.3.0
updated: 2026-04-04
updated_by: claude-opus-4.6

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

## Queued Work
1. Lifecycle hook system (Pre/PostDispatch events for automation)
2. Concurrent tool execution for workers
3. Notification folding + priority queue
4. Agent status shimmer/pulse animations
5. Replace hardcoded revenue curves with real billing data
