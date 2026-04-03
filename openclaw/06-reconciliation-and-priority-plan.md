# Porter Unified Plan
## Reconciliation of Core App, Retail Site, Dockmaster, and Agent-Memory Integrations

> **HISTORICAL DOCUMENT** — Written during the porter.py era. porter.py, portal.py, and dockmaster are all deleted. Porter is now a Fastify monorepo at `/home/lobster/projects/porter/`. This doc is for historical context only.

## Why this exists
Porter already has meaningful functionality across:
- core file manager (`porter.py`)
- retail/commercial portal (`/home/websites/porter/portal.py`)
- admin surface (`/dockmaster/*`)

But roadmap docs and implementation docs are currently split and partially inconsistent. This plan reconciles what exists with what should be built next.

Goal: **do not break current Porter file workflows**, while adding OpenClaw and Claude Code memory sync as additive premium capabilities.

---

## Current-state audit (what is real today)

## 1) Core Porter app (`/home/lobster/documents/porter/porter.py`)
Implemented:
- Multi-root browser (`vps-home`, `uploads`, `websites`)
- Upload/download, rename/delete, mkdir, move/copy, zip export
- Search, preview, inline edit, keyboard shortcuts, selection toolbar
- Local auth/settings scaffold exists

Gaps:
- Root locations are hardcoded in `SERVE_DIRS`
- No connector abstraction for non-local sources
- No GitHub/OpenClaw/Claude integration
- No durable task checkpoint runtime

## 2) Retail-facing Porter portal (`/home/websites/porter/portal.py`)
Implemented:
- Marketing pages with signup/login/dashboard
- Stripe checkout + billing portal + webhook handlers
- session auth and DB-backed users

Gaps:
- copy/positioning needs rewrite to include "Porter Memory" narrative
- environment/security hardening required (secrets currently inline placeholders)
- no productized "connectors" UX

## 3) Dockmaster admin (`/dockmaster/*` in portal.py)
Implemented:
- admin login/session
- dashboard, user list, user detail, plan/state visibility

Gaps:
- no connector-level analytics
- no memory sync observability
- no interrupted-task/recovery visibility

---

## Product direction (confirmed)
1. Keep Porter core behavior intact.
2. Memory features are optional add-ons, not replacement.
3. OpenClaw + Claude Code should stay in sync through Porter-backed checkpoints and pointers.
4. API limit interruption must not lose work.

---

## Priority framework
Use this order for execution:

## Priority 0 — Reliability foundation (must-have first)
- Durable checkpointing runtime (`runtime/checkpoints`, `runtime/drafts`, `runtime/leases`)
- Resume protocol (recover from API limit interruption)
- Atomic finalize promotion

Reason: without this, agent memory features are unreliable and trust is lost.

## Priority 1 — Memory connector minimum viable product
- `POST /memory/search`
- `GET /memory/fetch`
- `POST /memory/upsert`
- `POST /memory/pointer`
- pointer schema + validation + provenance metadata

Reason: enables token-efficient recall while keeping `MEMORY.md` compact.

## Priority 2 — OpenClaw and Claude synchronization
- shared task IDs across both agents
- checkpoint handoff protocol
- "resume from last checkpoint" flow
- pointer write policy on major milestone completion

Reason: seamless switching between agents during rate limits.

## Priority 3 — Retail portal alignment
- website messaging rewrite (files first, memory optional premium)
- account onboarding for connectors
- settings page for enabling OpenClaw/Claude integrations

Reason: commercial clarity and activation.

## Priority 4 — Dockmaster observability
- connector health cards
- interrupted/resumed task metrics
- pointer growth and memory quality stats

Reason: operations and support at scale.

---

## Feature backlog by stream

## Stream A — Core runtime and APIs
- [ ] runtime checkpoint API set (`/runtime/checkpoint`, `/runtime/heartbeat`, `/runtime/recover`, `/runtime/finalize`)
- [ ] memory API set (`/memory/search`, `/memory/fetch`, `/memory/upsert`, `/memory/pointer`)
- [ ] pointer schema validation
- [ ] deterministic resume engine

## Stream B — OpenClaw integration
- [ ] tool wrappers for Porter memory endpoints
- [ ] policy: significant events write to Porter; local memory stores pointers only
- [ ] session-close checkpoint write

## Stream C — Claude Code integration
- [ ] task bootstrap reads Porter pointers before edits
- [ ] periodic mid-task checkpoints
- [ ] finalization writes canonical doc + pointer update

## Stream D — Retail website and onboarding
- [ ] rewrite homepage copy to include Porter Memory
- [ ] add connectors section and onboarding wizard copy
- [ ] add "why this matters" narrative (context continuity + token efficiency)

## Stream E — Dockmaster admin
- [ ] new dashboard blocks: connector status, interrupted tasks, recovery success rate
- [ ] user-level memory usage and pointer count

---

## Suggested execution sequence (2-week sprint)

### Week 1
1. Implement durable checkpoint runtime
2. Implement memory API endpoints + schema
3. Add OpenClaw connector prototype (search/fetch/upsert)

### Week 2
4. Add Claude Code checkpoint loop and resume flow
5. Add retail copy rewrite and connector onboarding settings
6. Add Dockmaster observability panel for checkpoint state

---

## Clear instruction to Claude Code (intent)
We are doing this to solve three concrete user problems:
1. Context is fragmented across devices and tools.
2. Agent memory files become bloated and expensive.
3. API-limit interruptions lose work mid-task.

Implementation objective:
- Keep existing Porter file workflows unchanged.
- Add optional memory and checkpoint modules.
- Ensure OpenClaw and Claude can hand off work seamlessly via Porter.

Non-negotiables:
- no breaking change to current file management behavior
- provenance on all memory pointers
- durable mid-task persistence every <=30 seconds
- deterministic resume after interruption

---

## Acceptance criteria
- Interruption during long write can resume without data loss.
- OpenClaw and Claude can continue same task using shared checkpoint state.
- `MEMORY.md` remains compact while deep context stays in Porter docs.
- Retail website and onboarding clearly explain files core + memory add-on.
- Dockmaster exposes status of memory/checkpoint systems.

---

## Decision log (current)
- Porter core remains file-first and unchanged.
- Memory is an additive premium-capable layer.
- OpenClaw and Claude integration is strategic, not experimental.
- Reliability under API limits is priority before UI polish.
