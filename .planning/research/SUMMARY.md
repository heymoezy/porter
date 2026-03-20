# Project Research Summary

**Project:** Porter — AI Orchestration SaaS Platform
**Domain:** Multi-agent orchestration platform, collaborative, non-technical users
**Researched:** 2026-03-20
**Confidence:** HIGH (stack + architecture grounded in existing codebase; features cross-referenced against 6 competitors; pitfalls directly from codebase analysis)

## Executive Summary

Porter is a mature prototype (v0.33.28) that needs to evolve from a single-user AI chat tool into an autonomous multi-agent platform for non-technical users. The recommended approach is a phased migration using the Strangler Fig pattern: a Fastify backend runs alongside the Python monolith, intercepts routes feature-by-feature, and eventually replaces porter.py entirely. No big-bang rewrite. The frontend never knows which backend is serving it. 35 Playwright tests stay green throughout.

The highest-priority product bet is the guided project creation wizard — a conversational flow where Porter proposes agents, builds a plan, and starts work from a plain-language description. No competitor has nailed this for non-technical users. Lindy is the closest but more constrained; Relevance AI requires technical knowledge. If Porter ships one thing in the next milestone, it is this. Everything else — agent autonomy, collaborative sessions, WhatsApp — layers on top of it. Critically, Memory V2 must be completed and Cortex fully removed before the wizard can deliver coherent agent context.

The key risks are structural, not technical. The codebase has 683 broad exception catches that make silent agent failures the default outcome. Two memory systems (Cortex + Memory V2) are coexisting and polluting each other. Global mutable state (`_config`, `_sessions`, `_wf_registry`) makes it impossible to safely run concurrent agent workers. SQLite connection pooling is absent. These are not optional cleanups — they are prerequisites for agent autonomy. Building scheduling on top of the current codebase will produce agents that silently do nothing and are impossible to debug.

## Key Findings

### Recommended Stack

Porter's existing stack (Fastify 5, Drizzle ORM, better-sqlite3, React 19, React Query, Zustand, Tailwind 4) is sound and should not be replaced. The gap is in libraries for new capabilities. Three additions are needed immediately: `@fastify/schedule` + `toad-scheduler` for agent scheduling (no Redis dependency), `octokit` + `@fastify/oauth2` for GitHub integration, and `nodemailer` + `imapflow` for mail. Google Calendar uses `googleapis`. WhatsApp uses the Meta Cloud API directly via fetch — the official SDK is Alpha (0.0.5) and not suitable for production.

Do NOT use BullMQ (requires Redis, unacceptable overhead on 2 vCPU VPS), whatsapp-web.js (ToS violation, number ban risk), or Socket.IO (unnecessary abstraction, @fastify/websocket is already installed).

**Core technologies:**
- Fastify 5 + TypeScript: HTTP routing layer — replaces Python route by route via proxy fallback
- Drizzle ORM + better-sqlite3: Type-safe SQLite — synchronous API, WAL mode, single connection instance
- @fastify/schedule + toad-scheduler: In-process agent job scheduling — no Redis, fits 2 vCPU constraint
- @fastify/websocket (already installed): Collaborative session presence only — not for AI streaming
- SSE (existing pattern): AI response streaming — kept separate from WebSocket by design
- octokit + @fastify/oauth2: GitHub integration — official SDK, handles token refresh automatically
- nodemailer + imapflow: Outbound + inbound mail — from same ecosystem, both support OAuth2
- googleapis: Google Calendar integration — handles token refresh and pagination automatically

### Expected Features

Research cross-referenced Porter against Relevance AI, Lindy, n8n, CrewAI, AutoGen, and Langflow. The competitive gap Porter can own is non-technical user guidance: conversational project setup, readable transparency, role-based collaboration. The anti-features to avoid are visual workflow canvases (overwhelming for non-technical users), per-message billing (creates anxiety), and agent-to-agent debate loops (noise that users cannot interpret).

**Must have (table stakes) — users expect these before trusting the product:**
- Guided project creation wizard — conversational flow; competitors use blank-canvas builders that fail non-technical users
- Agent activity log (user-readable) — "here is what your agent did today"; trust requires visibility
- Memory V2 completion — eliminates signal noise; gates persistent agents and transparency dashboard
- Email notifications for agent completions — closes the async loop; SendGrid key exists, not wired
- Agent autonomy basics — scheduled check-in that runs work on interval; moves Porter from chatbot to worker

**Should have (differentiators after validation):**
- WhatsApp bidirectional bridge — no major no-code AI platform does this natively; enormous non-US reach
- Collaborative sessions — shared workspace with real-time context; rare among competitors
- Transparency dashboard — reasoning traces visible to non-technical users; builds trust at scale
- Ephemeral project-scoped agents — create a specialist agent, auto-retire when done; no cleanup burden
- Porter as true orchestrator — assigns tasks, recovers from failure; currently Porter is a model router

**Defer to v2+:**
- SaaS billing — explicitly deferred until core product-market fit
- Mobile native app — responsive web serves mobile needs now
- Integration marketplace (400+ connectors) — depth over breadth wins for the target user
- LLM fine-tuning — 95% of users never use it; per-agent directives provide equivalent customization
- Visual workflow canvas — signals developer tool positioning, incompatible with non-technical user target

### Architecture Approach

The target architecture is a Fastify TypeScript backend (`backend/src/`) structured as plugins (auth, realtime, proxy), routes (one file per domain boundary), and services (pure business logic). porter.py runs on :8877 as a shrinking proxy target. Both share porter.db via WAL mode with a single Drizzle connection instance. The proxy plugin is registered last in Fastify — any unimplemented route falls through to porter.py transparently.

The most critical data migration is projects out of porter_config.json into a proper SQLite table. This is the root cause of slow startup, no query capability, and the dual-state fragility. It unblocks everything else.

**Major components:**
1. Fastify backend (:3001) — Auth, routes, scheduler, SSE hub, WebSocket hub; grows to own all routes
2. `agent_jobs` table + `services/scheduler.ts` — In-process polling loop (2s interval), atomic status transitions, prevents double-pickup
3. SSE hub (`Map<roomId, Set<sender>>`) — Unidirectional push to browsers; zero polling; agent progress, chat events, memory changes
4. `@fastify/http-proxy` (last plugin) — Transparent fallback to porter.py for unimplemented routes
5. `services/ai-router.ts` — Single owner of openclaw dispatch; never called directly from routes
6. `services/memory.ts` — Memory V2 operations; directives/concepts/episodes/signals injection at dispatch time

### Critical Pitfalls

1. **Distributed monolith during migration** — Fastify and porter.py writing to the same tables without a data ownership contract creates split-brain. Migrate by vertical slice: one complete feature end-to-end before the next. A table is owned by exactly one backend at all times. Use a `DUAL_WRITE_PROJECTS = true` feature flag during handoff periods.

2. **683 broad exception catches making agent failures invisible** — When scheduled agents throw exceptions, they get swallowed and agents appear to "succeed" with no output. Fix is not to remove try/except but to add `log.exception()` inside every catch. The 4 bare `except: pass` statements (lines 197-198, 221, 224) must be eliminated immediately — they catch SystemExit and KeyboardInterrupt too.

3. **Two memory systems running simultaneously** — Cortex still writes signals while Memory V2 tries to promote/dismiss them, polluting the signal queue from day one. On a 2 vCPU VPS, both consolidation loops doing full table scans simultaneously causes lock contention. Set a hard cutover event: Memory V2 is the only active system from its completion phase onward. Cortex removal must be a verifiable deliverable (grep returns zero results).

4. **SQLite concurrency under concurrent agent workers** — WAL mode + 5-second timeout is acceptable for human-paced chat. It is not acceptable for 3+ concurrent agent workers writing simultaneously. Connection pooling via `threading.local()`, 30-second timeout, and exponential backoff on `OperationalError: database is locked` must be in place before agent scheduling is added.

5. **No feature flags for autonomous features** — Agent scheduling can cause irreversible side effects (files written, messages sent externally). Without a feature flag, the only rollback is git revert + restart, which drops in-flight sessions and leaves agent runs in partial state. Every autonomous feature needs a config-level kill switch before it ships.

## Implications for Roadmap

Based on combined research, the dependency graph dictates a specific phase order. Phase 1 is not optional prep — it unblocks every subsequent phase.

### Phase 1: Tech Debt and Infrastructure Foundation

**Rationale:** The codebase has structural issues that make agent autonomy impossible to build safely. The 683 broad exception catches make failures invisible. SQLite connection pooling is absent. Global mutable state prevents agent isolation. Projects in JSON config blocks collaborative sessions. These must be fixed before any autonomous feature is built, not alongside them.

**Delivers:**
- Bare `except: pass` statements eliminated; all exception paths emit structured mlog
- SQLite connection pooling with threading.local() and 30s timeout
- Projects migrated from porter_config.json to SQLite table (Drizzle schema + one-time migration script)
- Fastify backend infrastructure layer: db/client.ts, plugins/auth.ts, plugins/proxy.ts, config.ts
- Cortex disabled; Memory V2 set as the only active memory system
- Feature flag config skeleton for all upcoming autonomous features

**Addresses:** Pitfalls 2, 4, 5 (silent failures, SQLite concurrency, global mutable state); Architecture Phase prerequisite + Phase 1

**Avoids:** Building agent scheduling on a foundation where failures are invisible and concurrent writes cause lock errors

---

### Phase 2: Memory V2 Completion

**Rationale:** Memory V2 is explicitly identified as a dependency blocker for the guided project wizard, persistent agents, and the transparency dashboard. Building these features on a partially-migrated memory system means signal noise degrades agent quality from launch. Completing Memory V2 here — as a discrete phase with a verifiable done state — makes every subsequent phase more effective.

**Delivers:**
- Memory V2 fully functional: directives/concepts/episodes/signals operational
- Cortex code fully deleted (lines 1551-2156, 1860-1908, 2041-2060 etc.) — grep for cortex write paths returns zero results
- Memory injection into Fastify agent dispatch context
- Noise filtering verified: no "user logged in" or "file uploaded" signals in V2 queue
- Batched consolidation (not full table scan) — avoids memory consolidation blocking DB writes

**Addresses:** Pitfall 3 (two memory systems coexisting), FEATURES.md P1 dependency

**Avoids:** Guided project wizard shipping with polluted agent context that degrades response quality from day one

---

### Phase 3: Core Route Migration (Auth + Projects + Agents)

**Rationale:** The guided project wizard requires projects in the DB (not config JSON), agents queryable via Fastify routes, and a functional auth layer in Fastify. This phase migrates the three most critical route domains — auth, projects, agents — from porter.py to Fastify using vertical slices with dual-write during handoff. All 35 Playwright tests must pass throughout.

**Delivers:**
- Fastify owns: /login, /logout, /api/me, /api/projects/*, /api/agents/*
- Projects fully in SQLite with proper foreign keys to tasks, members, milestones, artifacts
- Dual-write period with DUAL_WRITE_PROJECTS flag; disable after porter.py project routes removed
- Agent jobs table in schema; agent CRUD endpoints in Fastify
- porter.py proxy surface measurably reduced; no route handled by both backends simultaneously

**Uses:** Drizzle ORM, @fastify/http-proxy (proxy plugin), Fastify session middleware from Phase 1

**Implements:** Architecture Phase 1 (core domain routes) — see ARCHITECTURE.md Build Order

---

### Phase 4: Agent Autonomy and Scheduling

**Rationale:** With the foundation clean (Phase 1), memory coherent (Phase 2), and routes in Fastify (Phase 3), agent scheduling can be built correctly. The in-process scheduler using @fastify/schedule + toad-scheduler matches the VPS constraint. The agent_jobs table pattern (atomic UPDATE...RETURNING prevents double-pickup) is the correct pattern. Feature flags must gate all autonomous behavior from day one of this phase.

**Delivers:**
- `agent_jobs` table + `services/scheduler.ts` polling loop (2s interval, LIMIT 5 concurrency)
- Atomic job pickup: UPDATE status='running' WHERE status='pending' AND id=? (prevents double-pickup)
- `services/ai-router.ts`: model selection, openclaw dispatch, streaming response
- `services/chat-actions.ts`: side effect processor (create tasks, update memory, emit SSE events)
- User-readable agent activity log: per-agent feed of what ran, when, and what resulted
- Email notifications for agent completions (SendGrid key wired into notifications service)
- Feature flags active: agent_scheduling, guided_project_wizard gated off until stable

**Uses:** @fastify/schedule, toad-scheduler, nodemailer (outbound notifications)

**Avoids:** Pitfall 4 (SQLite concurrency — fixed in Phase 1), Pitfall 5 (global state — fixed in Phase 1), Pitfall 7 (no feature flags — introduced here)

---

### Phase 5: Guided Project Creation Wizard

**Rationale:** This is Porter's North Star feature and the primary competitive differentiator. It requires everything from Phases 1-4: clean memory context (Phase 2), projects in DB (Phase 3), agent scheduling that can kick off work immediately (Phase 4). The wizard is a conversational flow — 3 questions maximum for initial setup, Porter proposes the rest. Token budget cap (2,000 tokens system context for interactive calls) must be enforced before building this — embedding token bloat permanently is Pitfall 6.

**Delivers:**
- Conversational wizard: describe goal → Porter proposes agents and plan → user approves → work starts
- Maximum 3 questions before Porter proposes; remaining detail filled by agent
- Token budget cap enforced: interactive calls hard-capped at 2,000 tokens system context
- Transparency layer: wizard shows plan being built in real-time (SSE events from Phase 6 prep)
- Ephemeral project-scoped agents: create specialist, auto-retire when project completes
- Verified done: wizard produces real project with milestones, tasks, and agent assignment (not just a record with empty fields)

**Uses:** Memory V2 (Phase 2), agent_jobs scheduler (Phase 4), SSE events (anticipates Phase 6)

**Avoids:** Pitfall 6 (token bloat — token budget enforced before wizard is built, not after)

---

### Phase 6: Real-Time Layer and Collaborative Sessions

**Rationale:** With autonomous agents running (Phase 4) and the wizard shipping (Phase 5), collaborative sessions become the next value layer. Real-time push via SSE hub eliminates polling overhead (critical on 2 vCPU VPS). WebSocket is reserved for collaborative cursor presence only — not AI streaming.

**Delivers:**
- SSE hub: `Map<projectId, Set<sender>>` in plugins/realtime.ts; zero polling
- /api/events SSE endpoint; React Query invalidates on events (replaces all 2s polling)
- Collaborative session membership: project_members table, invite flow, role display
- Per-session role badge and permission summary visible to invited users (avoids collaborative UX pitfall)
- Tenant isolation verified: invited user's session cannot access other workspaces

**Uses:** @fastify/websocket (already installed), @fastify/sse-v2

**Avoids:** Anti-Pattern 3 (polling instead of SSE), Pitfall re: collaborative session lacking permission clarity

---

### Phase 7: External Connections (GitHub, Mail, Calendar, WhatsApp)

**Rationale:** External integrations are independent of the core product and have no blockers after Phase 6 is stable. GitHub and calendar deepen project value. WhatsApp is the highest-reach differentiator for non-US markets and has no competitor parity. Build each connection as a vertical slice; none depend on the others.

**Delivers:**
- GitHub: @fastify/oauth2 flow, token stored in workspace_connections, octokit for API calls
- Mail: nodemailer (outbound), imapflow (inbound IMAP IDLE), OAuth2 — no raw password storage
- Calendar: googleapis, Google Calendar read/write, token refresh automatic
- WhatsApp: Meta Cloud API via fetch (no SDK — official SDK is Alpha 0.0.5), webhook receiver route, message deduplication, per-agent phone number mapping
- Per-project connection overrides: project-level credentials override workspace defaults
- All external calls queued to background workers — never blocking HTTP handler path

**Uses:** octokit, @fastify/oauth2, nodemailer, imapflow, googleapis

**Avoids:** Integration gotchas: synchronous external API calls in HTTP handler, WhatsApp message deduplication failure, OAuth tokens stored in config instead of DB

---

### Phase Ordering Rationale

The order is dictated by dependency, not desirability:

- **Tech debt before features:** Silent failures and SQLite lock errors make autonomous agents impossible to trust. These are prerequisites, not optional improvements.
- **Memory V2 before wizard:** Memory V2 quality gates agent context quality. Shipping the wizard on Cortex-polluted signals means the product's flagship feature underperforms from launch.
- **Route migration before scheduling:** The scheduler needs to write to tables that Fastify owns. Building scheduling in Fastify before projects are in the DB creates the distributed monolith anti-pattern.
- **Scheduling before wizard:** The wizard needs to hand off work to agents immediately. That requires a functioning scheduler.
- **Real-time before collaboration:** Collaborative sessions depend on SSE push — polling under collaborative load would saturate the 2 vCPU VPS.
- **External integrations last:** These are independent, high-value additions. They should not block the core autonomous workflow.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 5 (Guided Wizard):** Conversational wizard UX patterns, prompt design for 3-question max flows, agent proposal formatting — needs research into conversational AI onboarding patterns
- **Phase 7 (WhatsApp):** Meta Cloud API WABA setup, phone number provisioning via Twilio vs. direct WABA, webhook signature validation — operational complexity warrants dedicated research

Phases with standard patterns (skip research-phase):
- **Phase 1 (Tech Debt):** Python exception handling, SQLite threading.local() pooling, Drizzle schema migrations — all well-documented; no novel patterns
- **Phase 3 (Route Migration):** Strangler Fig via @fastify/http-proxy is a documented pattern with official references; vertical slice migration is standard
- **Phase 6 (SSE Hub):** SSE implementation in Fastify is well-documented; Map-based room pattern is standard

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via npm registry; alternatives considered with documented trade-offs; existing stack confirmed working |
| Features | MEDIUM-HIGH | Cross-referenced 6 competitors; competitive positioning is inferential but consistent across sources |
| Architecture | HIGH | Based on existing codebase analysis + established Strangler Fig pattern; Fastify 5 + Drizzle documented thoroughly |
| Pitfalls | HIGH | Grounded in direct codebase inspection (CONCERNS.md, line numbers cited); external sources confirm patterns |

**Overall confidence:** HIGH

### Gaps to Address

- **Guided wizard UX design:** Research identified the pattern (conversational, 3 questions max) but the specific prompt engineering for Porter's wizard turns needs implementation-time work. Flag for Phase 5 planning.
- **WhatsApp WABA provisioning:** The Meta Cloud API is confirmed as the correct path but the operational steps for provisioning a WABA and mapping agent-specific phone numbers via Twilio are not fully resolved. Flag for Phase 7 planning.
- **Token budget enforcement mechanism:** Research confirms the 2,000-token cap for interactive calls and the value of Anthropic prefix caching, but the specific implementation (how prompts are truncated, cache key structure) needs design during Phase 5.
- **YMC Capital hardcoded references:** PITFALLS.md flags YMC Capital hardcoded in prompts as a tech debt item. This undermines the product-not-internal-tool direction. Should be addressed in Phase 1 alongside other hardcoding violations.
- **PostgreSQL migration threshold:** Research sets the trigger as >50 concurrent write requests/second or multi-instance deployment. No firm timeline yet — depends on growth. Revisit when WAL checkpoint appears in logs.

## Sources

### Primary (HIGH confidence)
- `/home/lobster/documents/porter/.planning/codebase/CONCERNS.md` — direct codebase analysis, pitfall line numbers
- `/home/lobster/documents/porter/.planning/codebase/ARCHITECTURE.md` — existing architecture documentation
- npmjs.com registry — all package versions verified: @fastify/schedule@6.0.0, toad-scheduler@3.1.0, octokit@5.0.5, nodemailer@8.0.3, imapflow@1.2.16, googleapis@171.4.0, @fastify/oauth2@8.2.0
- Strangler Fig Pattern — AWS Prescriptive Guidance: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/strangler-fig.html
- Drizzle ORM SQLite documentation: https://orm.drizzle.team/docs/get-started-sqlite
- PEP 760 – No More Bare Excepts: https://peps.python.org/pep-0760/

### Secondary (MEDIUM confidence)
- Relevance AI, Lindy, n8n, CrewAI, AutoGen, Langflow competitor feature analysis — cross-referenced 2026
- WhatsApp Business API 2026 guide (wati.io) — confirms Meta Cloud API as correct path, on-premise deprecated July 2025
- LLM Token Optimization: Cut Costs & Latency in 2026 (Redis blog) — prefix caching guidance
- SSE vs WebSocket for AI streaming (dev.to) — confirms SSE preference for unidirectional
- better-sqlite3 vs libSQL benchmark (sqg.dev) — single benchmark, consistent with documentation claims

### Tertiary (LOW confidence)
- Individual medium/community posts on Fastify + Drizzle patterns — consistent with official docs but not independently authoritative

---
*Research completed: 2026-03-20*
*Ready for roadmap: yes*
