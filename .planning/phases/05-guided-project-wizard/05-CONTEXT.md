# Phase 5: Guided Project Wizard - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

User describes a project goal in plain language inside Porter's chat. Porter detects project intent, asks 0-2 adaptive follow-ups with structured options, proposes an agent team + plan as a rich inline card, and upon approval creates a real project with milestones, tasks, and assigned agents. Work starts immediately. The project dashboard shows real-time progress via SSE, agent status, activity feed with rich event cards, and contextual coaching for next steps. Chat has a toggleable GSD plan mode that mirrors the full GSD flow (discuss → research → plan → execute) with agents doing all work and Porter orchestrating.

</domain>

<decisions>
## Implementation Decisions

### Wizard Entry & Intent Detection
- Wizard lives **inside the main chat** — no modal, no separate page, no floating overlay
- Porter auto-detects project-like messages ("I need a website for my bakery") — no special command required
- Intent detection learns over time: per-user patterns AND system-level patterns across all users
- False positive handling: Claude's discretion on best UX — soft confirmation with graceful fallback to regular chat
- Structured selectable options (like GSD) for follow-up questions — not free-text

### Adaptive Questioning
- 0-2 follow-ups depending on goal clarity (GSD-inspired approach)
- Clear goal → propose immediately with zero questions
- Vague goal → 1-2 structured clarifying questions with clickable options
- Never more than 2 follow-ups — max 3 total turns including initial goal

### Proposal Card (Rich Inline)
- Rich inline card embedded in chat stream (like Claude artifacts)
- Shows: project name, proposed agents (pixel portraits + role), 3-5 milestones as visual timeline, estimated scope indicator
- Prominent "Approve & Start" button
- Team + plan overview in one glance — not just team or just plan

### Chat-Based Refinement
- User tweaks proposal conversationally: "swap the writer for a researcher", "add a deadline"
- Porter updates the proposal card in-place
- No form editing, no edit mode — negotiation through conversation
- If user doesn't like it, they describe what's wrong and Porter regenerates

### Agent Selection & Assignment
- Template matching + Porter reasoning: analyze goal → map to project type → select from 70 agent templates based on role fit
- Porter explains WHY each agent was chosen in the proposal
- Successful project completions improve future agent matching (learning loop)
- Agents are project-scoped (ephemeral) during the project
- At project completion, Porter asks: "Keep this agent or retire it? (You can always bring them back.)" — decision deferred to end, not upfront

### Post-Approval Experience — ALIVE ON ALL SURFACES
- Stay in chat with live updates: "Writer is drafting the homepage copy", "Designer is picking a color palette"
- Project cards show activity — even animation, not just text
- Detailed project view has full activity feed
- No dead screens, no empty states, no static views anywhere

### Project Dashboard
- **Activity-first** — live feed dominates: what agents are doing NOW, just finished, what's next
- **Rich event cards** in activity feed: agent portrait + action + result preview (snippet/thumbnail), clickable for full output, time-grouped ("Just now", "Earlier today")
- **Progress visualization** — Claude's discretion, but MUST be consistent across the entire site (holistic design, not isolated features; CSS pass across everything if needed)
- **Agent display** — Claude's discretion on cutting-edge approach, must feel alive
- **Real-time updates via SSE push** — uses existing SSE infrastructure, instant updates when agents complete work
- **Contextual coaching for next steps** — dynamic, state-aware suggestions like "Review Writer's draft" or "Approve Designer's logo" (extends DO THIS NEXT pattern from v0.31.36)

### GSD Plan Mode
- Visual mode indicator + toggle in chat header: "Free chat" or "GSD Plan" chip/badge
- Click to switch modes; mode persists per project until toggled off
- GSD mode mirrors full GSD flow: question → research → plan → execute — native in Porter's chat
- **Porter NEVER executes directly** — always the orchestrator, delegates everything to agents
- **Fully autonomous** — runs without approval gates unless Porter detects it would need to guess or is uncertain
- When uncertain, Porter asks a specific targeted question with selectable numbered options (1, 2, 3, 4) — GSD-style structured choices
- GSD mode scoping: Claude's discretion

### Token Budget
- Interactive wizard system prompts hard-capped at 2,000 tokens (from Phase 3 circuit breaker decision)
- Lean prompt: agent identity + project context + available resources only

### Voice Output
- **Deferred entirely** — both KittenTTS and 2-way voice pushed to future release
- WhatsApp integration (CONN-04, Phase 7) is higher priority than voice

### Claude's Discretion
- Multi-project handling (parallel wizard sessions)
- Intent detection false positive UX (soft confirmation approach)
- Progress visualization design (must be site-wide consistent)
- Agent display pattern on dashboard (cutting-edge, alive)
- GSD mode scoping (project-only vs everywhere)
- Proposal card animation and styling details
- Activity feed animation patterns

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Patterns
- `backend/src/services/scheduler.ts` — Job queue with 2s polling, 3-attempt retry, activity logging
- `backend/src/services/ai-router.ts` — Smart model routing with fallback chain, context compression
- `backend/src/services/event-triggers.ts` — Event trigger system with dedup, activity logging
- `backend/src/routes/v1/projects.ts` — Existing project CRUD API (extend, don't replace)
- `backend/src/routes/v1/jobs.ts` — Job queue endpoints
- `backend/src/db/schema.ts` — Projects, personas, agent_jobs, agent_activity tables

### Frontend
- `frontend/src/modules/chat/ChatView.tsx` — Chat view where wizard lives
- `frontend/src/store/app.ts` — Zustand state management (extend for wizard/GSD mode state)

### Agent Templates
- `personas/` — 70 agent archetypes across 10 categories for template matching

### Prior Phase Decisions
- `.planning/phases/03-route-migration/03-CONTEXT.md` — System prompt revolution (lean prompts, 2K cap, awareness toggle)
- `.planning/phases/01-foundation/01-CONTEXT.md` — CSS variables, theming, design system decisions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Job queue (scheduler.ts)**: Fully operational with polling, retry, activity logging — reuse for wizard-generated tasks
- **AI router (ai-router.ts)**: Smart model selection + fallback — reuse for proposal generation and agent dispatch
- **Event triggers (event-triggers.ts)**: Activity logging + dedup — add wizard-proposal trigger type
- **SSE infrastructure**: Existing streaming from chat — extend for dashboard live updates
- **PROJECT_TYPE_TEMPLATES (porter.py)**: 8 project types with workstreams and quality gates — use for type detection
- **Agent templates (personas/)**: 70 archetypes with SOUL.md + ROLE_CARD.md — use for template matching

### Established Patterns
- **API pattern**: Zod validation → UUID → DB insert → response envelope ({ok, data} or {ok, error})
- **Dispatch pattern**: Route message → probe backends → select model → compress context → call CLI bridge
- **Activity pattern**: logActivity(agentId, jobId, projectId, eventType, summary, detail) → agent_activity table
- **State management**: Zustand store with actions + persistence

### Integration Points
- **Chat dispatch**: Add project intent detection before regular message routing
- **Project API**: Extend with POST /api/v1/projects/wizard endpoint
- **Job queue**: Queue initial agent jobs after project approval
- **SSE events**: Add project:activity, project:progress event types for dashboard

</code_context>

<specifics>
## Specific Ideas

- "Wizard needs to feel familiar like how GSD prompts you, how you talk to ChatGPT or Claude — don't give me an old style wizard, it has to be something never been done before"
- "ALIVE ON ALL SURFACES!" — project cards show activity, detailed view has activity, chat has live updates, no dead screens anywhere
- Structured selectable options (1, 2, 3, 4) like GSD's AskUserQuestion for all user interactions — wizard questions AND GSD mode uncertainty stops
- "Porter never does anything directly — porter is the orchestrator, always. He never gets caught in the weeds"
- "Whatever you decide should be very consistent across the entire site — do not design features in isolation. If you need to rebuild the entire system and take another pass thru CSS, do it"
- Agent retirement decision deferred to project completion: "Keep this agent or retire it? (You can always bring them back.)"
- Fully autonomous GSD mode — only stops if Porter would need to guess or detects uncertainty

</specifics>

<deferred>
## Deferred Ideas

- **Public project URLs** — `<projectname>.askporter.app` with Porter branding on public pages. Marketing flywheel like Polsia.com does for customers. Future phase.
- **browser-use integration** — github.com/browser-use/browser-use Python library for AI agents to control web browsers. Powerful for research/content agents. Future connections/tooling phase.
- **2-way voice** — KittenTTS + voice input. Separate release down the road. WhatsApp integration (CONN-04, Phase 7) is higher priority.
- **Dark mode adjustment** — current dark palette (#171d28) feels too dark. Quick CSS fix outside Phase 5 scope.

</deferred>

---

*Phase: 05-guided-project-wizard*
*Context gathered: 2026-03-21*
