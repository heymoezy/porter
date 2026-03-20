# Feature Research

**Domain:** AI orchestration platform (SaaS, multi-agent, non-technical users)
**Researched:** 2026-03-20
**Confidence:** MEDIUM-HIGH (cross-referenced Relevance AI, Lindy, n8n, CrewAI, AutoGen, Langflow)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing = product feels incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Natural language agent creation | Competitors (Lindy, Relevance AI) all use NL-first setup — users expect to describe, not configure | MEDIUM | Porter already has agent templates; needs conversational creation flow on top |
| Pre-built agent templates | Reduces friction for first-time users; every major platform has a template library | LOW | Porter has AGENT_TEMPLATES but they're developer-facing; needs user-facing gallery |
| Chat interface per agent | Primary interaction mode users expect — not a dashboard of settings | LOW | Exists in Porter; needs to remain the primary entry point |
| Agent activity log (what did it do?) | Users need to see what agents did when they weren't watching; trust requires visibility | MEDIUM | Porter has mlog but it's system-level; needs per-agent readable activity feed |
| Project workspace (group work under a heading) | Users think in projects, not workflows; every PM/productivity tool reinforces this mental model | LOW | Exists in Porter; core abstraction is correct |
| File attachments and context | Users expect to give agents documents, images, spreadsheets to work from | LOW | Exists in Porter (upload endpoint + chat_attachments) |
| Email notifications for agent actions | Users are not always in the app; they need push-pull awareness | MEDIUM | SendGrid key exists in Porter but outbound notifications not implemented |
| Invite collaborators to workspace | SaaS is inherently social; solo use is not the growth vector | MEDIUM | Invite system exists; collaborative project sessions are in active development |
| Usage history and search | Users need to find past conversations, outputs, and decisions | MEDIUM | chat_messages table exists; search/history UI needs work |
| Model selection per agent | Power users want to pick which model an agent uses; it affects cost and quality | LOW | Porter already supports this via per-agent backend assignment |
| Mobile-responsive UI | Users access from phones; non-responsive UI signals immaturity | LOW | Currently React but responsiveness should be verified |
| Session security and RBAC | Enterprise users demand this before any procurement discussion; audit trail required | LOW | Fully implemented in Porter (4 roles, session management, audit via mlog) |

### Differentiators (Competitive Advantage)

Features where Porter can compete and win. These align with the stated core value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Guided project creation wizard | Competitors have blank-canvas builders that overwhelm non-technical users. Porter's GSD-like flow (describe goal → agents propose → plan generated → work starts) is genuinely differentiated | HIGH | Core active requirement; the single highest-priority feature to build |
| Autonomous agent scheduling (event-driven + cron) | Agents that check in, take actions, and report back without user prompting — moving from "chat assistant" to "worker" | HIGH | Workflow registry exists; needs to extend to user-defined schedules and triggers |
| Persistent agents with memory across projects | Agents that remember context from past work and bring it to new projects — competitors typically start fresh each session | HIGH | Memory V2 migration is the enabler; must complete before this is useful |
| WhatsApp bidirectional bridge | No major no-code AI platform offers WhatsApp as a first-class channel with two-way agent interaction. Enormous reach for non-technical users in non-US markets | HIGH | Meta Cloud API is the correct infrastructure (on-premise deprecated July 2025); agent-specific phone numbers are achievable via Twilio or WABA |
| Collaborative agent sessions (shared workspace) | Invite teammates to work alongside your agents — not just view results. This is rare; most platforms are single-user agent management | HIGH | Collaborative sessions in active development; real-time shared context is the hard part |
| Unified global chat (agents + projects + external) | Single conversation interface across all contexts — users don't context-switch between "project view" and "chat view" | MEDIUM | Porter popup chat exists; needs unification with per-project and per-agent threads |
| Transparency dashboard (agent reasoning visible) | Non-technical users fear black-box agents. Showing what the agent is doing and why builds trust and reduces abandonment | MEDIUM | Currently only system-level logs; needs a user-readable "what happened" view with reasoning traces |
| Ephemeral project-scoped agents | Create a temporary specialist agent for this project, auto-retire when done. No cleanup burden for the user | MEDIUM | Architecture supports it; needs UI affordance and lifecycle management |
| Per-project external tool connections (override workspace defaults) | Connect GitHub once at workspace level, override per project. Competitors typically require per-workflow setup every time | MEDIUM | Connections infrastructure (3-table model) already built for exactly this pattern |
| Porter as orchestrator (not just router) | Porter decides which agent gets which task, re-routes on failure, ensures completion. Competitors require users to manually assign tasks | HIGH | Currently Porter is a model router; true orchestration (task assignment, failure recovery) needs to be built |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem valuable but create more problems than they solve for Porter's target user.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Visual workflow canvas (drag-and-drop nodes) | Looks powerful; competitors like n8n and Langflow have it | Non-technical users find node canvases overwhelming. Langflow itself lacks RBAC and has poor observability because it optimizes for visual complexity over usability. Canvas is a developer tool masquerading as a user tool | Guided conversational setup (describe it, Porter configures it) |
| Pre-built integration marketplace (500+ connectors) | n8n has 400+, Zapier has 8000+ — users want coverage | Maintaining a large integration surface is a significant ops burden. Most users use 3-5 integrations. A large marketplace signals breadth but ships broken connectors | Depth over breadth: GitHub, Gmail, Calendar, WhatsApp done excellently rather than 400 things done poorly |
| Per-message billing / task-count billing (Zapier model) | Seems granular and fair | Creates anxiety and unpredictable bills for non-technical users. Zapier's model is widely criticized for becoming expensive at scale and discouraging automation | Seat-based or workspace-based billing; hide infrastructure costs inside the subscription |
| Agent-to-agent chat (autonomous multi-agent debate) | AutoGen popularized this; seems intelligent | Most useful for research/code tasks, not business workflows. Generates noise that non-technical users can't interpret. CrewAI found role-based execution (not open debate) is better for business outcomes | Role-based crew execution where Porter assigns tasks sequentially or in parallel — no debate loop visible to user |
| Real-time everything (live-updating dashboards, websocket everywhere) | Looks impressive in demos | Adds complexity, consumes server resources (8GB RAM, 2 vCPU), and creates state-sync bugs. Current SSE implementation is the right level | SSE for chat streams; polling for dashboards; reserve websockets for genuinely interactive features only |
| LLM fine-tuning or model training | Power users ask for this | Out of scope per PROJECT.md and adds significant infrastructure cost. Competitors who added fine-tuning found 95% of users never used it | Model routing and per-agent persona/directive system provides equivalent customization for the target user |
| Self-hosting / open-source mode | Developers want to run it themselves | Porter is a SaaS product. Self-hosting fragments support, dilutes the product roadmap, and creates a free-rider problem. n8n offers self-hosting and it cannibalizes their cloud revenue | SaaS-only; offer data export so privacy-conscious users can audit what is stored |

---

## Feature Dependencies

```
Guided Project Creation Wizard
    └──requires──> Agent Template Gallery (user-facing)
    └──requires──> Porter as Orchestrator (task assignment)
                       └──requires──> Memory V2 Complete (noise-free context)

Agent Autonomy (scheduled/event-driven)
    └──requires──> Workflow Registry (exists)
    └──requires──> Per-Agent Cron/Trigger Config (new)
    └──requires──> Agent Activity Log (user-readable, new)

WhatsApp Bridge
    └──requires──> Meta Cloud API WABA setup (external dependency)
    └──requires──> Bidirectional message routing (new)
    └──requires──> Agent-specific phone number mapping (new)
    └──enhances──> Unified Global Chat

Collaborative Sessions
    └──requires──> Invite System (exists)
    └──requires──> Per-project role overrides (partially exists)
    └──requires──> Real-time shared context (new)

Transparency Dashboard
    └──requires──> Per-agent activity log (new)
    └──requires──> Memory V2 Complete (so signals are meaningful)
    └──enhances──> Guided Project Creation (users see plan being built)

Persistent Agents with Cross-Project Memory
    └──requires──> Memory V2 Complete (blocks everything else)
    └──requires──> Concepts + Episodes layers functional

Unified Global Chat
    └──requires──> Chat interface (exists)
    └──requires──> Project/Agent context switching (partially exists)

Ephemeral Project-Scoped Agents
    └──requires──> Agent lifecycle management (new)
    └──enhances──> Guided Project Creation

Email Notifications
    └──requires──> SendGrid configured (key exists, not wired)
    └──enhances──> Agent Autonomy (user gets alerted when agent completes work)
```

### Dependency Notes

- **Memory V2 is a blocker for several differentiators.** Persistent agents, transparency dashboard, and project-aware context all require the new memory system to be clean and functional. Completing Memory V2 is a force-multiplier.
- **Agent autonomy requires the activity log.** Users will not trust scheduled agents they cannot inspect. Build the log before or in parallel with scheduling.
- **WhatsApp is an independent feature.** It has no dependencies on the core product beyond message routing. Can be built in a separate phase without blocking anything else.
- **Guided project creation is the North Star.** Every other differentiator builds on it or supports it. If Porter ships nothing else, ship this.
- **Visual canvas conflicts with conversational creation.** Building a node canvas signals to the market that Porter is a developer tool, not a non-technical user tool. These positionings are incompatible.

---

## MVP Definition

Porter already has a functional product at v0.33.28. This MVP definition is for the **next milestone layer** — what's needed to validate the autonomous-agent-for-non-technical-users proposition.

### Launch With (this milestone)

- [ ] Guided project creation wizard — conversational flow that proposes agents, builds plan, starts work
- [ ] Agent activity log (user-readable) — "Here is what your agent did today"
- [ ] Memory V2 completion — eliminate signal noise, promote useful concepts, deprecate Cortex
- [ ] Email notifications for agent completions — closes the async work loop
- [ ] Agent autonomy basics — at minimum a scheduled "check-in" that runs work on interval

### Add After Validation (v1.x)

- [ ] WhatsApp bridge — adds a new channel after core workflows are proven
- [ ] Collaborative sessions with real-time shared context — invite teammates once the solo experience works well
- [ ] Transparency dashboard — surfaces reasoning traces once agents are running autonomously and users need visibility
- [ ] Ephemeral project-scoped agents — once persistent agents work, ephemeral ones are a refinement

### Future Consideration (v2+)

- [ ] Outbound webhook system (Porter notifies external services) — useful for enterprise integrations but not core to non-technical user value
- [ ] SaaS billing (subscription management) — explicitly deferred until core works per PROJECT.md
- [ ] Mobile native app — web-first is correct priority now; responsive web serves mobile use

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Guided project creation wizard | HIGH | HIGH | P1 |
| Memory V2 completion | HIGH (enabler) | MEDIUM | P1 |
| Agent activity log | HIGH | MEDIUM | P1 |
| Email notifications | MEDIUM | LOW | P1 |
| Agent autonomy (scheduling) | HIGH | HIGH | P1 |
| WhatsApp bridge | HIGH | HIGH | P2 |
| Collaborative sessions | HIGH | HIGH | P2 |
| Transparency dashboard | MEDIUM | MEDIUM | P2 |
| Ephemeral agents | MEDIUM | MEDIUM | P2 |
| Unified global chat | MEDIUM | MEDIUM | P2 |
| Integration marketplace (depth) | LOW | HIGH | P3 |
| SaaS billing | LOW (for now) | HIGH | P3 |

**Priority key:**
- P1: Must have for this milestone — validates the autonomous-agent proposition
- P2: Should have — adds depth once core is working
- P3: Future — do not build until product-market fit on P1+P2

---

## Competitor Feature Analysis

| Feature | Relevance AI | Lindy | n8n | Porter Approach |
|---------|--------------|-------|-----|-----------------|
| Agent creation UX | Low-code visual builder | NL description → agent | Node canvas (technical) | Conversational wizard (GSD-like flow) — more guided than Lindy, simpler than Relevance AI |
| Multi-agent coordination | Role-based crews, parallel execution | Sequential workflows, limited multi-agent | Agent patterns via LangChain nodes | Porter as orchestrator: assigns, monitors, re-routes — no visible debate loop |
| Memory / context | Per-agent context, limited persistence | Session memory, limited cross-agent | No native memory (stateless flows) | Memory V2 with directives + concepts + episodes — persistent and scoped |
| External integrations | API connectors, no-code | 400+ integrations, API connectors | 400+ native nodes + custom HTTP | Depth over breadth: GitHub, Gmail, Calendar, WhatsApp — done well |
| Transparency / observability | Workflow run logs (technical) | Basic run history | Execution history (technical) | User-readable activity feed + reasoning trace — non-technical first |
| Pricing model | Per-agent-minute usage | Seat-based | Workflow execution count | Seat/workspace-based — no per-message anxiety |
| Collaboration | Shared workspace (limited) | Not a core feature | Shared workflows (technical) | First-class collaborative sessions with per-person roles |
| WhatsApp | No | Via Twilio integration | Via HTTP/API node | Native bridge, agent-specific channels — first-class, not bolted on |
| Target user | Business teams, some technical | Non-technical, small teams | Technical / developer teams | Non-technical users — lower floor, higher trust, more guidance |

---

## Sources

- [Relevance AI features overview 2026](https://www.selecthub.com/p/ai-agent-builder-software/relevance-ai/)
- [Lindy AI feature review 2026](https://www.lindy.ai/blog/ai-agent-platform)
- [CrewAI vs AutoGen vs n8n vs Langflow comparison 2026](https://aiagentbase.app/blog/langgraph-vs-crewai-vs-autogen-vs-n8n-choosing-the-right-ai-framework)
- [n8n AI agent frameworks comparison](https://blog.n8n.io/ai-agent-frameworks/)
- [WhatsApp Business API 2026 guide](https://www.wati.io/en/blog/discovering-whatsapp-business-api/)
- [AI agent audit trail and observability 2026](https://fast.io/resources/ai-agent-audit-trail/)
- [AI agent platform table stakes for SaaS 2026](https://www.vellum.ai/blog/top-13-ai-agent-builder-platforms-for-enterprises)
- [n8n vs Zapier integration anti-patterns](https://hatchworks.com/blog/ai-agents/n8n-vs-zapier/)
- [Multi-agent orchestration collaboration 2026](https://www.codebridge.tech/articles/mastering-multi-agent-orchestration-coordination-is-the-new-scale-frontier)
- [Agentic AI SaaS trends 2026](https://www.saassimply.com/post/the-agentic-era-how-software-slaughter-and-self-driving-workflows-will-change-saas-in-2026)

---

*Feature research for: AI orchestration platform (Porter) — non-technical SaaS users*
*Researched: 2026-03-20*
