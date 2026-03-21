# Phase 5: Guided Project Wizard — Research

**Researched:** 2026-03-21
**Domain:** Conversational project creation, intent detection, agent proposal engine, real-time dashboard, GSD plan mode — TypeScript/React/Fastify/Porter stack
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Wizard Entry & Intent Detection**
- Wizard lives inside the main chat — no modal, no separate page, no floating overlay
- Porter auto-detects project-like messages ("I need a website for my bakery") — no special command required
- Intent detection learns over time: per-user patterns AND system-level patterns across all users
- False positive handling: Claude's discretion on best UX — soft confirmation with graceful fallback to regular chat
- Structured selectable options (like GSD) for follow-up questions — not free-text

**Adaptive Questioning**
- 0-2 follow-ups depending on goal clarity (GSD-inspired approach)
- Clear goal → propose immediately with zero questions
- Vague goal → 1-2 structured clarifying questions with clickable options
- Never more than 2 follow-ups — max 3 total turns including initial goal

**Proposal Card (Rich Inline)**
- Rich inline card embedded in chat stream (like Claude artifacts)
- Shows: project name, proposed agents (pixel portraits + role), 3-5 milestones as visual timeline, estimated scope indicator
- Prominent "Approve & Start" button
- Team + plan overview in one glance — not just team or just plan

**Chat-Based Refinement**
- User tweaks proposal conversationally: "swap the writer for a researcher", "add a deadline"
- Porter updates the proposal card in-place
- No form editing, no edit mode — negotiation through conversation
- If user doesn't like it, they describe what's wrong and Porter regenerates

**Agent Selection & Assignment**
- Template matching + Porter reasoning: analyze goal → map to project type → select from 70 agent templates based on role fit
- Porter explains WHY each agent was chosen in the proposal
- Successful project completions improve future agent matching (learning loop)
- Agents are project-scoped (ephemeral) during the project
- At project completion, Porter asks: "Keep this agent or retire it? (You can always bring them back.)" — decision deferred to end, not upfront

**Post-Approval Experience — ALIVE ON ALL SURFACES**
- Stay in chat with live updates: "Writer is drafting the homepage copy", "Designer is picking a color palette"
- Project cards show activity — even animation, not just text
- Detailed project view has full activity feed
- No dead screens, no empty states, no static views anywhere

**Project Dashboard**
- Activity-first — live feed dominates: what agents are doing NOW, just finished, what's next
- Rich event cards in activity feed: agent portrait + action + result preview (snippet/thumbnail), clickable for full output, time-grouped ("Just now", "Earlier today")
- Progress visualization — must be consistent across the entire site (holistic design; CSS pass across everything if needed)
- Agent display — cutting-edge approach, must feel alive
- Real-time updates via SSE push — uses existing SSE infrastructure, instant updates when agents complete work
- Contextual coaching for next steps — dynamic, state-aware (extends DO THIS NEXT pattern from v0.31.36)

**GSD Plan Mode**
- Visual mode indicator + toggle in chat header: "Free chat" or "GSD Plan" chip/badge
- Click to switch modes; mode persists per project until toggled off
- GSD mode mirrors full GSD flow: question → research → plan → execute — native in Porter's chat
- Porter NEVER executes directly — always the orchestrator, delegates everything to agents
- Fully autonomous — runs without approval gates unless Porter detects it would need to guess or is uncertain
- When uncertain, Porter asks a specific targeted question with selectable numbered options (1, 2, 3, 4) — GSD-style structured choices

**Token Budget**
- Interactive wizard system prompts hard-capped at 2,000 tokens (from Phase 3 circuit breaker decision)
- Lean prompt: agent identity + project context + available resources only

**Voice Output**
- Deferred entirely — both KittenTTS and 2-way voice pushed to future release

### Claude's Discretion
- Multi-project handling (parallel wizard sessions)
- Intent detection false positive UX (soft confirmation approach)
- Progress visualization design (must be site-wide consistent)
- Agent display pattern on dashboard (cutting-edge, alive)
- GSD mode scoping (project-only vs everywhere)
- Proposal card animation and styling details
- Activity feed animation patterns

### Deferred Ideas (OUT OF SCOPE)
- Public project URLs — `<projectname>.askporter.app`
- browser-use integration — github.com/browser-use/browser-use
- 2-way voice — KittenTTS + voice input
- Dark mode adjustment — CSS fix outside Phase 5 scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROJ-01 | Guided project creation wizard (describe project → Porter proposes agents/plan → approve → work starts) | Intent detection in chat dispatch + wizard state machine in Zustand + `POST /api/v1/projects/wizard` endpoint + proposal card React component |
| PROJ-02 | Auto agent assignment based on project type and requirements | PROJECT_TYPE_TEMPLATES (porter.py) + 70 persona archetypes in `personas/` + Porter reasoning via `ai-router.ts` dispatch |
| PROJ-03 | Project dashboard showing progress, active agents, recent activity, and next steps | SSE infrastructure in porter.py + new `project:activity` SSE event type + React dashboard module + agent_activity table query |
| PROJ-04 | GSD plan mode in chat — toggleable structured planning mode (question → research → requirements → roadmap → execute) vs free chat | Zustand store extension for chat mode state + chat header toggle + GSD flow orchestration via Porter dispatch |
</phase_requirements>

---

## Summary

Phase 5 is Porter's highest-value visible feature — the moment where a user types "I need a bakery website" and Porter responds with an intelligent, actionable proposal. Everything upstream (DB, scheduler, job queue, ephemeral agents, AI router, lean prompts) is already built. Phase 5 wires it into a seamless conversational flow.

The core technical challenge is not any single complex piece but the composition: intent detection inside the existing chat stream, a wizard state machine that persists across turns, an inline proposal card that updates in-place, an approval action that atomically creates project + personas + jobs, and a live dashboard that stays alive via SSE. Each of these has clear predecessors in the codebase — the main work is building the connective tissue.

The biggest risk is design scope: "alive on all surfaces" + "holistic design" + "CSS pass if needed" means this phase could expand into a full UI rebuild. Research recommendation is to define the dashboard and activity feed as new components that use the existing CSS token system (`design-system/tokens.ts`) without rewriting existing views — deliver alive/animated new surfaces, leave existing surfaces untouched unless a specific regression is found.

**Primary recommendation:** Implement the wizard as a state machine inside `ChatView.tsx` (Zustand), route all detection through a new `POST /api/v1/projects/wizard` backend endpoint, use `framer-motion` (already installed) for all inline card animations, and extend the existing `agent_activity` + SSE bus for live dashboard updates. No new dependencies required.

---

## Standard Stack

### Core (already installed — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.0 | UI components | Already in use for ChatView, Sidebar, Layout |
| framer-motion | 12.38.0 | Animations, card transitions, alive feeling | Already installed; `animation` tokens in `design-system/tokens.ts` use it |
| zustand | 5.0.11 | Wizard state machine, GSD mode persistence | Already `useAppStore` in `store/app.ts` — extend, don't replace |
| @tanstack/react-query | 5.90.21 | Data fetching for dashboard polls | Already in App.tsx QueryClientProvider |
| tailwindcss | 4.2.1 | Styling | Already used across all components |
| fastify | 5.7.4 | New wizard endpoint | Already running; new route registered in `routes/v1/index.ts` |
| better-sqlite3 | 12.6.2 | Direct DB access for wizard endpoint | Already in `db/client.ts` |
| drizzle-orm | 0.45.1 | Schema-driven DB operations | Already used in projects.ts, agents.ts |
| zod | 4.3.6 | Wizard endpoint input validation | Already used in all v1 routes |
| lucide-react | 0.575.0 | Icons (Send, BrainCircuit already used in ChatView) | Already imported |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| EventSource (browser API) | native | SSE subscription for dashboard live updates | Dashboard component subscribes to `/api/events` from porter.py |
| react-router-dom | 7.13.1 | Navigation to project dashboard after approval | Already installed; currently unused in Layout but available |

### No New Dependencies Required

All Phase 5 functionality can be delivered with the existing frontend + backend stack. The `framer-motion` library already has the spring animation presets defined in `design-system/tokens.ts` (`animation.spring`, `animation.bouncy`). The SSE infrastructure is alive in porter.py at `/api/events`. The job queue, personas, activity log, and ephemeral agent machinery are operational from Phase 4.

**Installation:** None needed.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending Zustand store | Redux or Context | Zustand is already the store; no reason to introduce another state manager |
| framer-motion for proposal card | CSS animations | framer-motion's AnimatePresence + layout animations give the "alive" feeling with much less code |
| Native EventSource for SSE | Socket.io | Socket.io adds 70KB; SSE is simpler, already used in porter.py |
| Extending existing `/api/v1/projects` | Separate wizard service | Extension is simpler; wizard is a project creation flow, not a separate system |

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
backend/src/
├── routes/v1/
│   └── wizard.ts          # POST /api/v1/projects/wizard (intent, propose, approve)
│
frontend/src/
├── modules/
│   ├── chat/
│   │   ├── ChatView.tsx           # Extend: add wizard state rendering, GSD mode toggle
│   │   ├── WizardCard.tsx         # NEW: inline proposal card (framer-motion)
│   │   ├── WizardQuestion.tsx     # NEW: structured option buttons (1-4)
│   │   └── GSDModeToggle.tsx      # NEW: chat header chip/badge
│   └── projects/
│       ├── ProjectDashboard.tsx   # NEW: activity-first project view
│       ├── ActivityFeed.tsx       # NEW: rich event cards, SSE-driven
│       └── AgentStatusStrip.tsx   # NEW: alive agent display
├── store/
│   └── app.ts                     # Extend: wizardState, gsdMode, activeProjectId
```

### Pattern 1: Wizard State Machine in Zustand

**What:** The wizard progresses through named states stored in Zustand. ChatView renders different UI based on current state. State transitions happen via action calls.

**When to use:** Multi-step conversational flow where each user message advances the state.

**States:**
```
idle → detecting → questioning (0-2 questions) → proposing → refining → approved → executing
```

**Example:**
```typescript
// store/app.ts extension
type WizardState =
  | { stage: 'idle' }
  | { stage: 'questioning'; questionIndex: number; answers: string[] }
  | { stage: 'proposing'; proposal: WizardProposal }
  | { stage: 'refining'; proposal: WizardProposal; turns: number }
  | { stage: 'approved'; projectId: string };

interface WizardProposal {
  projectName: string;
  projectType: string;
  agents: ProposedAgent[];
  milestones: string[];
  scopeLabel: string; // "Small (1-2 weeks)" | "Medium (1 month)" | "Large (2+ months)"
  explanation: string;
}

interface ProposedAgent {
  templateId: string;
  name: string;
  role: string;
  portrait: string; // pixel art sprite reference
  whyChosen: string;
}
```

### Pattern 2: Inline Proposal Card (Claude Artifacts style)

**What:** A rich card rendered inside the chat message stream, not as a modal or sidebar. Uses `framer-motion` for entry animation and in-place update on refinement.

**When to use:** After Porter generates a proposal (0-2 questions answered).

**Key behaviors:**
- `AnimatePresence` + `layoutId` allows card to update in-place when user refines via chat
- "Approve & Start" button calls `POST /api/v1/projects/wizard` with `action: 'approve'`
- Card remains in message history after approval (shows "Project created" state)

**Example:**
```typescript
// modules/chat/WizardCard.tsx
import { motion, AnimatePresence } from 'framer-motion';
import { animation } from '../../design-system/tokens';

export function WizardCard({ proposal, onApprove }: WizardCardProps) {
  return (
    <motion.div
      layoutId="wizard-proposal"
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={animation.spring}
      className="border border-border rounded-xl p-5 bg-surface mt-3"
    >
      {/* Agent portraits strip */}
      {/* Milestone timeline */}
      {/* Approve & Start button */}
    </motion.div>
  );
}
```

### Pattern 3: Wizard Backend Endpoint

**What:** Single `POST /api/v1/projects/wizard` endpoint handles all wizard phases via `action` discriminator. Keeps routing logic server-side.

**Actions:**
- `action: 'detect'` — classify intent, return `{ isProject, clarity, suggestedQuestions }`
- `action: 'propose'` — given answers, return `WizardProposal`
- `action: 'approve'` — atomically create project + personas + initial jobs, return `{ projectId }`

**Example:**
```typescript
// backend/src/routes/v1/wizard.ts
const wizardSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('detect'), message: z.string() }),
  z.object({ action: z.literal('propose'), goal: z.string(), answers: z.array(z.string()) }),
  z.object({ action: z.literal('approve'), proposal: WizardProposalSchema }),
]);

fastify.post('/', { preHandler: [fastify.requireAuth] }, async (req, reply) => {
  const parsed = wizardSchema.safeParse(req.body);
  // ... route to handler based on action
});
```

### Pattern 4: Approval-to-Execution Atomic Transaction

**What:** On `approve`, a single SQLite transaction creates the project, inserts ephemeral personas from templates, and queues initial jobs. No partial state possible.

**Critical:** Must use `sqlite.prepare(...).run()` inside a transaction, NOT multiple separate DB calls that could fail halfway.

**Sequence:**
1. INSERT into `projects` (name, type, milestones as JSON, etc.)
2. For each proposed agent: INSERT into `personas` (is_temporary=1, config includes project_id)
3. For each agent: INSERT into `agent_jobs` (trigger_type='wizard_start', prompt=role-specific kickoff)
4. Emit SSE event `wizard:approved` with project_id for live UI update

**Example:**
```typescript
// Atomic create-on-approve
const approveWizard = sqlite.transaction((proposal: WizardProposal, ownerId: string) => {
  const projectId = crypto.randomUUID();
  // 1. project
  sqlite.prepare(`INSERT INTO projects (...) VALUES (...)`).run({ ... });
  // 2. personas
  for (const agent of proposal.agents) {
    const personaId = crypto.randomUUID();
    sqlite.prepare(`INSERT INTO personas (...) VALUES (...)`).run({ ... });
    // 3. initial job
    sqlite.prepare(`INSERT INTO agent_jobs (...) VALUES (...)`).run({ ... });
  }
  return projectId;
});
```

### Pattern 5: SSE-Driven Live Dashboard

**What:** Project dashboard subscribes to porter.py's `/api/events` SSE bus filtered by `project_id`. New `agent_activity` inserts emit `project:activity` events in real time.

**Key insight:** Porter.py already has an SSE event bus (`/api/events`). The dashboard does NOT need a new polling loop — it subscribes to the existing bus and filters events by project_id. The backend already has `logActivity()` in `scheduler.ts` that writes to `agent_activity`. Adding an SSE emit after each `logActivity` call gives real-time updates for free.

**React pattern:**
```typescript
// modules/projects/ActivityFeed.tsx — SSE subscription hook
function useProjectActivity(projectId: string) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.addEventListener('project:activity', (e) => {
      const data = JSON.parse(e.data);
      if (data.project_id === projectId) {
        setEvents(prev => [data, ...prev].slice(0, 50));
      }
    });
    return () => es.close();
  }, [projectId]);

  return events;
}
```

### Pattern 6: GSD Plan Mode State

**What:** Chat has a per-project mode flag stored in Zustand, persisted to localStorage. When `gsdMode === true`, chat messages are routed through a GSD orchestration flow; otherwise, regular dispatch.

**Key:** Mode is per-project, not global. Switching projects does not inherit another project's mode.

**Zustand shape:**
```typescript
// store/app.ts extension
interface ChatModeState {
  gsdMode: boolean; // active: structured planning | inactive: free chat
  gsdPhase: 'question' | 'research' | 'plan' | 'execute' | null;
  setGsdMode: (mode: boolean) => void;
  advanceGsdPhase: () => void;
}
```

### Anti-Patterns to Avoid

- **Wizard as a separate route/page:** The wizard MUST live inside `ChatView.tsx`. A separate `/wizard` route breaks the chat-native experience.
- **Free-text follow-up questions:** Wizard questions must present numbered selectable options (1, 2, 3, 4). Never raw text inputs for clarification questions.
- **Polling for dashboard updates:** Use SSE subscription, not `setInterval` fetching `/api/v1/agents` or activity endpoints. Polling = dead feeling.
- **Wizard state in component local state:** Must be Zustand — otherwise hot reload, route navigation, and multi-message flows lose state.
- **Separate wizard modal:** Stated as locked decision — never open a modal or drawer. Inline only.
- **Porter executing directly:** In GSD mode, Porter only orchestrates. All execution (writing, coding, research) goes through dispatched agent jobs. Never have Porter produce the artifact itself.
- **Voice output in Phase 5:** Deferred. Any code that references KittenTTS, ONNX, or TTS belongs in a future phase.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Animated proposal card | Custom CSS keyframes | framer-motion AnimatePresence + layoutId | layoutId enables seamless in-place update when proposal is refined — impossible with CSS only |
| Real-time updates | New polling endpoint | Existing SSE bus at `/api/events` | Already operational in porter.py; adding a new poll loop duplicates infrastructure |
| Ephemeral agent creation | Custom persona table logic | Existing `personas.is_temporary + config.project_id` pattern | Phase 4 already defined and tested this pattern — reuse exactly |
| Job queuing | Custom scheduler | Existing `agent_jobs` + `scheduler.ts` | Scheduler polls every 2s and picks up new jobs automatically — just insert the row |
| Token budget enforcement | Token counting middleware | `_build_lean_identity()` circuit breaker in porter.py | Already implemented with 2K cap and minimal fallback — wizard prompt construction must feed through this |
| Project type detection | Keyword matching | Porter LLM + `PROJECT_TYPE_TEMPLATES` dict | Template dict has 7 types (website, app, presentation, research, content, design, ops) with workstreams; LLM maps free-text goal to a type |
| Activity timestamp display | Custom date formatting | Time-relative bucketing: "Just now" / "Earlier today" / date | Simple arithmetic, but must match the "alive" feel — define once, use across all activity surfaces |

**Key insight:** The entire Phase 5 stack (DB, scheduler, jobs, personas, SSE) is already built and operational. Phase 5 is composition, not construction.

---

## Common Pitfalls

### Pitfall 1: Intent Detection False Positive Storm

**What goes wrong:** Porter detects project intent in ordinary chat messages ("can you help me with something?" or "I need to fix a bug"). Every message spawns a wizard flow.

**Why it happens:** Simple keyword matching is too broad. "I need", "help me", "build" all look like project intent.

**How to avoid:** Two-stage detection: (1) lightweight heuristic filter (does message contain goal-like language with a noun and verb?), (2) if heuristic passes, call Porter LLM with a binary classification prompt: "Is this a new project request? YES/NO". Only YES → enter wizard. Use soft confirmation as fallback: "Sounds like a new project — want me to propose a plan? (yes/no)".

**Warning signs:** User messages like "yes" or "ok" triggering wizard state transitions.

### Pitfall 2: Proposal Card In-Place Update Breaking

**What goes wrong:** When the user refines the proposal ("swap the writer"), Porter generates a new proposal object. The card unmounts and remounts instead of updating in place. Feels like a page refresh.

**Why it happens:** React key changes or missing `layoutId` on the framer-motion element cause unmount/remount instead of layout animation.

**How to avoid:** Use a stable `layoutId="wizard-proposal"` on the card. Store the proposal in Zustand (not component state) so it survives re-renders. Pass `layout` prop to all motion children that resize on update.

### Pitfall 3: Atomic Approval Transaction Failure

**What goes wrong:** Project creates successfully, but one of the persona inserts fails. User sees a project in the list with no agents. Work never starts.

**Why it happens:** Multiple sequential DB calls without a transaction. First call succeeds, second throws due to constraint violation or schema mismatch.

**How to avoid:** Wrap all approval DB writes (project + personas + jobs) in `sqlite.transaction()`. If any step throws, all changes roll back. Return error to frontend; wizard stays in `proposing` state.

### Pitfall 4: GSD Mode Ignoring Porter's Orchestrator Role

**What goes wrong:** In GSD mode, Porter directly generates the deliverable (writes the copy, produces the plan document) instead of dispatching to agents. Agents are bypassed.

**Why it happens:** It's easier to have Porter respond directly than to route through job queue. Tempting shortcut.

**How to avoid:** In GSD mode, Porter's responses are always instructions to agents, never the final artifact. Porter creates jobs, announces what agents are doing, and reports results. The `dispatch()` call in `ai-router.ts` must always target a non-Porter persona for GSD execution tasks.

### Pitfall 5: SSE Event Flooding

**What goes wrong:** Dashboard subscribes to `/api/events` and receives ALL events for ALL projects and ALL agents. UI updates on every scheduler tick, not just for the current project.

**Why it happens:** SSE bus is global; client-side filtering is not implemented.

**How to avoid:** Filter events in the React hook by `data.project_id === activeProjectId`. Add `project_id` to all `agent_activity` SSE emissions in porter.py. The 60-second dedup window in `event-triggers.ts` already prevents storm conditions on the server side.

### Pitfall 6: DB Schema Migration Missing New Columns

**What goes wrong:** Plan 05-03 adds `wizard_state` or similar column to projects, but `migrate-05.ts` doesn't run before the backend uses it. Backend crashes on startup.

**Why it happens:** New schema column added to `schema.ts` but no migration script creates it. Drizzle schema and actual DB are out of sync.

**How to avoid:** Every new column requires a `migrate-05.ts` in `backend/src/db/` that uses `schema_migrations` guard pattern from Phase 4. Run migration on server startup before route handlers initialize.

### Pitfall 7: ChatView Becomes a God Component

**What goes wrong:** Wizard, GSD mode toggle, proposal card, activity feed, message list, and input — all merged into a single 800-line `ChatView.tsx`.

**Why it happens:** Phase 5 adds significant new UI to the chat surface. Easy to add inline.

**How to avoid:** Extract to dedicated components from the start: `WizardCard.tsx`, `WizardQuestion.tsx`, `GSDModeToggle.tsx`. `ChatView.tsx` imports them and passes state. Each component is < 150 lines.

---

## Code Examples

Verified patterns from existing codebase:

### Insert Ephemeral Agent (from projects.ts Phase 4 pattern)
```typescript
// Source: backend/src/routes/v1/projects.ts (auto-retire pattern)
// The config JSON carries project_id for ephemeral scoping
sqlite.prepare(`
  INSERT INTO personas (id, name, role, status, is_temporary, config, created_at)
  VALUES (@id, @name, @role, 'idle', 1, @config, unixepoch('now'))
`).run({
  id: crypto.randomUUID(),
  name: agent.name,
  role: agent.role,
  config: JSON.stringify({ project_id: projectId, template_id: agent.templateId }),
});
```

### Queue Initial Agent Job
```typescript
// Source: backend/src/routes/v1/jobs.ts (createJobSchema pattern)
sqlite.prepare(`
  INSERT INTO agent_jobs (id, agent_id, project_id, trigger_type, prompt, status, scheduled_for)
  VALUES (@id, @agentId, @projectId, 'wizard_start', @prompt, 'pending', unixepoch('now'))
`).run({
  id: crypto.randomUUID(),
  agentId: persona.id,
  projectId,
  prompt: `Project "${projectName}" just started. Your role: ${agent.role}. Review the milestones and begin your first task.`,
});
```

### Zustand Store Extension Pattern
```typescript
// Source: frontend/src/store/app.ts (existing extend pattern)
// Add to AppState interface, then add to create() call
interface AppState {
  // ... existing fields ...
  wizardState: WizardStage;
  setWizardState: (state: WizardStage) => void;
  gsdMode: boolean;
  setGsdMode: (mode: boolean) => void;
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
}
```

### SSE Activity Subscription (React hook)
```typescript
// Pattern based on porter.py's /api/events (text/event-stream)
// and existing frontend EventSource usage
function useProjectActivity(projectId: string | null) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  useEffect(() => {
    if (!projectId) return;
    const es = new EventSource('/api/events');
    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.project_id === projectId) {
          setEvents(prev => [data, ...prev].slice(0, 100));
        }
      } catch { /* ignore parse errors */ }
    };
    es.addEventListener('project:activity', handler);
    es.addEventListener('agent:activity', handler);
    return () => { es.removeEventListener('project:activity', handler); es.close(); };
  }, [projectId]);
  return events;
}
```

### Feature Flag Guard (established pattern)
```typescript
// Source: backend/src/config.ts + scheduler.ts pattern
// Add to config.ts featureFlags:
guidedWizard: process.env.FEATURE_GUIDED_WIZARD === 'true',

// In wizard.ts route:
if (!featureFlags.guidedWizard) {
  return reply.code(503).send(err('FEATURE_DISABLED', 'Guided wizard is not enabled'));
}
```
Note: `FEATURE_GUIDED_WIZARD` already exists in `config.ts` (verified in source at line 27).

### Lean Prompt Construction (2K cap, from porter.py)
```python
# Source: porter.py _build_lean_identity() — wizard prompt must follow same pattern
# Wizard context block for Porter dispatch:
# identity_line + awareness_block + guardrails + wizard_context <= 2000 tokens
wizard_context = f"""
Current wizard state: proposing project for "{goal}".
Available project types: website, app, presentation, research, content, design, ops.
Available agent roles (from templates): {', '.join(role_list[:10])}.
Task: Analyze the goal, select appropriate agents, generate 3-5 milestones.
Output: JSON with projectName, projectType, agents (name, role, whyChosen), milestones, scopeLabel.
"""
```

### Activity Log Pattern (from scheduler.ts)
```typescript
// Source: backend/src/services/scheduler.ts logActivity()
// Wizard-start event for activity feed:
logActivity(
  agentId,
  jobId,
  projectId,
  'wizard_start',
  `${agentName} assigned to ${projectName}`,
  JSON.stringify({ templateId: agent.templateId, role: agent.role })
);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Project creation via form fields | Chat-native wizard with intent detection | Phase 5 (new) | Users never see a form; project emerges from conversation |
| Static agent list display | Live activity feed with SSE | Phase 5 (new) | Dashboard shows what agents are doing NOW, not a static list |
| System prompt from file I/O | Lean identity from DB (`_build_lean_identity`) | Phase 3 | Wizard prompts stay under 2K tokens automatically via circuit breaker |
| Ephemeral agents (Phase 4) | Wizard creates them automatically on approval | Phase 5 builds on Phase 4 | No manual agent creation; wizard assigns and scopes agents |
| Manual project creation via chat actions | Guided wizard with proposal card | Phase 5 (new) | 3-turn maximum from goal to running project |

**Deprecated/outdated:**
- `_build_context_suffix()` in porter.py: deprecated (Phase 3), replaced by `_build_lean_identity()`. Wizard prompts must use lean identity pattern.
- `PROJECT_TYPE_TEMPLATES` workstreams: the v0.33.3 changelog shows workstreams were removed from prompt context. Use them for type detection and milestone generation only, not for direct injection into prompts.

---

## Open Questions

1. **How does intent detection learn over time?**
   - What we know: CONTEXT.md says "per-user patterns AND system-level patterns across all users"
   - What's unclear: Is this a memory signal in `agent_activity`/`recall_memories` tables, or a separate intent_patterns table?
   - Recommendation: V1 implementation uses memory signals (`_recall_track_feedback` pattern from Phase 2). True learning loop is a Phase 6 enhancement. Planner should scope Phase 5 intent detection as rule-based + LLM classification (no learning in V1).

2. **Where does the proposal card render in the message list?**
   - What we know: Chat messages are rendered in `ChatView.tsx` as a scrolling list; no existing inline card component exists.
   - What's unclear: Does the proposal card replace a Porter message bubble, or appear below it?
   - Recommendation: Proposal card appears as Porter's message content. Porter message bubble renders `WizardCard` as its content instead of plain text. This keeps it in the conversation flow naturally.

3. **What SSE event does the approval emit to trigger live updates?**
   - What we know: Porter.py has `/api/events` SSE bus; scheduler.ts emits activity events to `agent_activity` table, but does NOT currently push to SSE.
   - What's unclear: Is there an existing path from `logActivity()` → SSE broadcast, or does Phase 5 need to wire this up?
   - Recommendation: Plan 05-03 must add SSE emission after `logActivity()` calls. Porter.py already has `_sse_broadcast()` (seen in grep output); the TypeScript scheduler needs an equivalent. This is a required integration task.

4. **Does the GSD mode state scope to a project or globally?**
   - What we know: CONTEXT.md says "Claude's discretion" on GSD mode scoping.
   - Recommendation: Scope GSD mode per-project. Store `gsdMode` as a map of `{ [projectId]: boolean }` in Zustand. Global GSD mode risks confusing context when multiple projects are open. Persisted in localStorage keyed by project ID.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Playwright (existing, 35 tests) + Python3 stdlib behavioral scripts |
| Config file | tests/playwright.config.js |
| Quick run command | `cd /home/lobster/documents/porter/tests && npx playwright test` |
| Full suite command | `cd /home/lobster/documents/porter/tests && npx playwright test` |
| Estimated runtime | ~90 seconds |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROJ-01 | Wizard endpoint exists and rejects invalid input | integration | `python3 /tmp/test_proj01_wizard_api.py` | Wave 0 |
| PROJ-01 | `detect` action returns `{isProject, clarity}` | integration | `python3 /tmp/test_proj01_detect.py` | Wave 0 |
| PROJ-01 | `approve` action creates project + personas + jobs atomically | integration | `python3 /tmp/test_proj01_approve.py` | Wave 0 |
| PROJ-02 | Agent assignment matches project type (writing → writer, code → developer) | integration | `python3 /tmp/test_proj02_agent_match.py` | Wave 0 |
| PROJ-03 | Activity feed endpoint returns JSON for a project | integration | `python3 /tmp/test_proj03_activity.py` | Wave 0 |
| PROJ-03 | Dashboard route renders without errors (no empty state) | ui | Playwright: `page.goto('/projects/:id')` | Wave 0 |
| PROJ-04 | GSD mode persists per-project in localStorage | ui | Playwright: toggle mode, navigate away, return, assert mode | Wave 0 |
| PROJ-04 | GSD mode routes chat to structured flow, not free dispatch | integration | `python3 /tmp/test_proj04_gsd_mode.py` | Wave 0 |

### Sampling Rate

- **Per task commit:** Verify via curl/Python script against API endpoints
- **Per wave merge:** Run full Playwright suite (35 tests must stay green)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `/tmp/test_proj01_wizard_api.py` — POST /api/v1/projects/wizard endpoint existence + validation
- [ ] `/tmp/test_proj01_detect.py` — detect action classifies project vs non-project messages
- [ ] `/tmp/test_proj01_approve.py` — approve action atomic transaction (project + personas + jobs)
- [ ] `/tmp/test_proj02_agent_match.py` — project type → correct agent roles
- [ ] `/tmp/test_proj03_activity.py` — GET /api/v1/projects/:id/activity returns array
- [ ] `/tmp/test_proj04_gsd_mode.py` — GSD mode flag persists and routes differently

Playwright regression suite (35 tests) covers existing surfaces — no new Playwright tests required for Phase 5 new surfaces (new views are net-new, not regressions).

---

## Sources

### Primary (HIGH confidence)
- Direct source reading: `backend/src/services/scheduler.ts` — job queue, logActivity pattern
- Direct source reading: `backend/src/services/ai-router.ts` — dispatch, compressContext, shouldRouteCheap
- Direct source reading: `backend/src/db/schema.ts` — projects, personas, agentJobs, agentActivity table shapes
- Direct source reading: `backend/src/routes/v1/projects.ts` — project CRUD, ephemeral agent retire pattern
- Direct source reading: `backend/src/routes/v1/jobs.ts` — job creation API, event notify endpoint
- Direct source reading: `backend/src/services/event-triggers.ts` — dedup window, insertTriggerJob pattern
- Direct source reading: `backend/src/config.ts` — featureFlags.guidedWizard already exists
- Direct source reading: `frontend/src/store/app.ts` — Zustand AppState extension pattern
- Direct source reading: `frontend/src/modules/chat/ChatView.tsx` — current chat structure
- Direct source reading: `frontend/src/design-system/tokens.ts` — animation tokens (spring, bouncy, springy)
- Direct source reading: `frontend/package.json` — framer-motion 12.38.0, zustand 5.0.11, react-query 5.x confirmed installed
- Direct source reading: `porter.py` — PROJECT_TYPE_TEMPLATES (7 types), _build_lean_identity (2K circuit breaker), SSE infrastructure at /api/events
- `.planning/phases/05-guided-project-wizard/05-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — accumulated decisions from all prior phases
- Prior phase plans (04-00 through 04-05) — established test script conventions (/tmp/, Python3 stdlib, SKIP/PASS/FAIL pattern)

### Tertiary (LOW confidence)
- framer-motion layoutId for in-place card updates — based on training knowledge of framer-motion API; version 12.x confirmed installed but exact API not verified against Context7

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies verified present in package.json; no new installs needed
- Architecture: HIGH — all patterns derived directly from existing operational code in Phase 3/4 services
- Pitfalls: HIGH — all derived from direct code inspection and Phase 3/4 accumulated decisions in STATE.md
- Validation: HIGH — follows identical pattern to Phase 4 validation (Python3 stdlib, /tmp/, SKIP/PASS/FAIL)

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable stack; framer-motion API could change faster — verify if delayed)
