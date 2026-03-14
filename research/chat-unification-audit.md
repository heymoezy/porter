# Chat Unification Audit — GPT-5.4 Findings (2026-03-14)

## Source
GPT-5.4 audited the global Porter chat path only. Findings verified against porter.py v0.31.58.

## The Problem
Three separate chat systems with different behavior, context models, and capabilities:
1. **Legacy main chat** — route/project selector, slash commands, text-based context injection
2. **Popup chat** — lightweight floating overlay, single `chat_id=porter-global`, no session model
3. **Project chat** — most coherent, sends `project_id` + `persona_name=Porter`, has action execution

## Findings

### F1: Global chat is one shared thread
Popup path hardcodes `chat_id=porter-global`. Reuses one long-lived session across all tabs/modules/projects.

### F2: Context injection is plain text, not structured
Main chat adds strings like "User is currently on the X screen" but doesn't rebind the session to current project/tab. Model gets narrative hints, not real context ownership.

### F3: Tab switching doesn't reset chat context
`switchModule()` changes `_currentModule` but doesn't clear/update `_chatProject`, `_chatRoute`, or `_chatRouteContext`. Previous project context bleeds into unrelated screens.

### F4: Global chat can't act like project chat
Project chat passes `project_id` and `persona_name=Porter` which activates project action prompting and server-side action execution. Global chat sends neither — structurally weaker even when user is inside a project.

### F5: Three chat systems
Legacy main chat, popup chat, and project chat all behave differently. Project chat is the most coherent. This fragmentation is why chat feels inconsistent.

### F6: Legacy slash/operator commands
Old Porter-building-Porter affordances (`/health`, `/models`, `/projects`, `gws`) pollute the product role.

### F7: Popup chat has no session model
No history picker, no delete/new session, no per-context thread separation, no artifact handling parity. Effectively a floating scratchpad.

### F8: History mixes contexts
Sessions API is generic but the chat surface mixes project-linked, persona-linked, and general chats. Hard to reason about.

## Product Recommendation (GPT-5.4)

**Target architecture:**
- **Projects** = main operating surface (deep work)
- **Agents** = cast/identity surface
- **Global chat** = lightweight Porter command console (quick ask, navigate, create, handoff)

**Key changes:**
1. Demote global chat to command bar, not conversational lane
2. Context-bound sessions (global, project:<id>, agent:<id>, etc.)
3. Structured context params replace text injection
4. Unified chat transport + session model + context adapters
5. Aggressive handoff (global → project/agent chat)
6. Kill legacy slash commands from product chat
7. Visible context chips showing where chat is bound
8. Popup = ephemeral quick-ask with "Continue in Project" handoff

## Status
- [x] Audit complete (GPT-5.4, 2026-03-14)
- [ ] Implementation plan
- [ ] Execution
