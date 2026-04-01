# Roadmap: Porter

## Milestones

- ✅ **v1.0 Foundation + Core Platform** — Phases 1-7 (shipped 2026-03-21)
- ✅ **v2.0 Backend Ready** — Phases 8-15 (shipped 2026-03-24)
- ✅ **v3.0 Porter Bridge** — Phases 16-23 (shipped 2026-03-25) — AI gateway, model intelligence, smart routing
- 🚧 **v4.0 The Arena** — Phases 24-30 (active) — Agent RPG system, battle arena, forge unification, intelligence loop

## Phases

<details>
<summary>v1.0 Foundation + Core Platform (Phases 1-7) — SHIPPED 2026-03-21</summary>

| Phase | Name | Key Deliverables |
|-------|------|------------------|
| 1 | Foundation | CSS variable architecture, exception handling, SQLite pooling, project migration, Fastify baseline, boot sequence |
| 2 | Memory V2 | 4-layer memory (directives/concepts/episodes/signals), Cortex removal (194KB deleted), noise filter, real-time feed |
| 3 | Route Migration | Lean system prompts, Fastify /api/v1/* for auth/projects/agents, React login/register, design tokens |
| 4 | Agent Autonomy | Scheduler (2s tick), AI router, event triggers, activity log, ephemeral agents, feature flags |
| 5 | Guided Wizard | Conversational project creation, auto agent assignment, project dashboard, GSD plan mode |
| 6 | Real-Time Transparency | SSE singleton, 6 pollers killed, agent activity feed, health panel, decision log |
| 7 | External Connections | Credential encryption, GitHub/email/calendar/WhatsApp integrations, OAuth flows, external dispatcher |

30/30 requirements complete. 35 Playwright tests green. Version v0.34.23.

</details>

<details>
<summary>v2.0 Backend Ready (Phases 8-15) — SHIPPED 2026-03-24</summary>

- [x] Phase 8: API Foundation — Consistent envelopes, error codes, trace IDs, OpenAPI spec (2026-03-21)
- [x] Phase 9: Streaming Chat — Token-by-token SSE from all AI backends, mid-stream cancellation (2026-03-22)
- [x] Phase 10: Collaborative Sessions — Invite by email, per-project roles, RBAC enforcement (2026-03-22)
- [x] Phase 11: Unified Chat & CRM Schema — Single conversation model, multi-value CRM, file associations (2026-03-22)
- [x] Phase 12: CRM Intelligence & Agent Templates — AI contact analysis, 103 agent templates, one-call instantiation (2026-03-22)
- [x] Phase 13: Autonomous Learning — Web/GitHub/Reddit knowledge acquisition, concept storage with source attribution (2026-03-22)
- [x] Phase 13.05: PostgreSQL Migration — SQLite to PostgreSQL 16 + pgvector, all schemas/queries/FTS ported (2026-03-24)
- [x] Phase 13.1: Memory V3 State Engine — Structured directives/notes, tiered injection, consolidation, agent self-edit (2026-03-24)
- [x] Phase 15: Skills & Tools Architecture — DB registry, CRUD APIs, junction tables, visibility controls, forge integration (2026-03-24)
- ~~Phase 14: Billing Enforcement — Deferred to future milestone~~

38/41 requirements complete (3 billing deferred). See milestones/v2.0-ROADMAP.md for full details.

</details>

<details>
<summary>v3.0 Porter Bridge (Phases 16-23) — SHIPPED 2026-03-25</summary>

- [x] Phase 16: Gateway Foundation — DB schema, adapter interface, config migration, auto-detection, key masking (2026-03-25)
- [x] Phase 17: Provider Adapters — Concrete adapters for all backends + unified stream normalizer (2026-03-25)
- [x] Phase 18: Resilience Layer — Background health probes, circuit breakers, retry/backoff, N-backend fallback (2026-03-25)
- [x] Phase 19: Model Catalog — Models table, auto-population, capability metadata, version tracking, cost tracking (2026-03-25)
- [x] Phase 20: Smart Routing Engine — DB-driven model selection, routing rules, decision logging, concurrency, session context (2026-03-25)
- [x] Phase 21: First-Run Setup — Gateway detection endpoint, guided setup API, zero-config path, OpenClaw integration (2026-03-25)
- [x] Phase 22: Bridge Admin Surface — 7 admin API endpoints, SSE events, design system components, agent-ready layout (2026-03-25)
- [x] Phase 23: Integration & Multi-Tenant — Brain/Recall integration, per-user keys, workspace overrides, usage attribution (2026-03-25)

46/46 requirements complete. Version v3.3.2.

</details>

---

### v4.0 The Arena (Active)

**Milestone Goal:** Transform Porter's agent system into an RPG character framework where agents have real stats derived from dispatch data, level up through usage, equip tools like gear, and battle each other head-to-head. Unify Forge + Skills + Tools into one page. Close the Bridge intelligence loop (Bridge → Intelligence → Recall → routing). Stats mean something because they come from real usage — never from designer fiat.

- [x] **Phase 24: Schema Migration** — 7 new tables + 2 ALTERs for the entire RPG + Arena data model (completed 2026-04-01)
- [x] **Phase 25: RPG Engine** — Stat calculation from dispatch logs, XP/level/star/rarity progression, .md regeneration (completed 2026-04-01)
- [x] **Phase 26: Forge Unification** — Nav merge, 4-tab shell, skills/supports system with live success rates (completed 2026-04-01)
- [ ] **Phase 27: Character Sheet UI** — Pentagon stat chart, rarity borders, vitals bars, passive tree, gear display
- [ ] **Phase 28: Battle Arena** — Head-to-head battles, ensemble judge, Elo ratings, pre-launch calibration
- [ ] **Phase 29: Session Registry + Message Bus** — Per-session token accounting, context pressure detection, envelope protocol
- [ ] **Phase 30: Intelligence Loop + Bridge Operator** — Pattern extraction, Recall promotion, Vigil live surfaces

## Phase Details

### Phase 24: Schema Migration
**Goal**: Every table and column the RPG, Arena, Session, and Intelligence systems depend on exists in PostgreSQL — all downstream service code can be written against a stable, typed Drizzle schema
**Depends on**: Phase 23 (v3.0 complete)
**Requirements**: SCH-01, SCH-02, SCH-03, SCH-04, SCH-05, SCH-06, SCH-07
**Success Criteria** (what must be TRUE):
  1. `agent_templates` table has RPG columns (shell, intelligence, supports, equipment_slots, passive_tree, level, xp, star_level, rarity, elo_rating, specialties) without breaking existing rows
  2. `agent_battles` table exists and accepts a battle record with agent_a, agent_b, prompt, scores JSONB, winner, elo_delta, judge_results, and created_at
  3. `agent_bonds`, `battle_replays`, `session_registry`, `msg_bus_events`, and `intelligence_patterns` tables all exist with correct FK constraints and indexes
  4. Agent skills junction table has success_rate_30d, total_uses, and last_used columns
  5. Drizzle migration runs cleanly on the live database with zero downtime and all 35 Playwright tests still pass
**Plans**: 2 plans
Plans:
- [x] 24-01-PLAN.md — Raw SQL migration (migrate-rpg-v1.ts) + index.ts wiring
- [x] 24-02-PLAN.md — Drizzle schema.ts type definitions for all new tables

### Phase 25: RPG Engine
**Goal**: Agent stats are live, accurate, and permanently tied to real dispatch history — every agent has a computable level, star rating, rarity class, and 5-stat profile derived from immutable logs, and progression events trigger automatic .md file regeneration
**Depends on**: Phase 24
**Requirements**: RPG-01, RPG-02, RPG-03, RPG-04, RPG-05, RPG-06, RPG-07, MD-01, MD-02, MD-03, MD-04, MD-05
**Success Criteria** (what must be TRUE):
  1. Calling the RPG engine for an agent with dispatch history returns a populated `agent_rpg_stats` cache row with all 5 stats (QTY/SPD/EFF/REL/COMBO) derived from `bridge_dispatch_log` — no manual values exist anywhere in the codebase
  2. An agent that completes 50 dispatches advances from level 1 toward level 5 with XP accumulating at the correct per-event rates (dispatch +10, feedback +25, specialty +50, battle won +100)
  3. Star progression gates work: reaching 2-star requires 50 dispatches, 3-star requires 200 dispatches AND avg reliability >= 85% — attempting to force star-up via direct DB write has no effect because stats are recomputed from logs
  4. When an agent levels up or gains a star, SOUL.md, IDENTITY.md, SKILLS.md, and TOOLS.md are overwritten from DB state within the same transaction — .md files always reflect current DB truth
  5. The stat cache is rebuilt asynchronously via the existing scheduler — character card API reads cache only, never performs live log aggregation
**Plans**: 3 plans
Plans:
- [x] 25-01-PLAN.md — rpg-engine.ts core service: stat calculation SQL, XP/level/star/rarity/specialty logic (2026-04-01)
- [ ] 25-02-PLAN.md — regenerateMdFiles() + admin API routes (GET/POST rpg-stats endpoints)
- [ ] 25-03-PLAN.md — routing-engine.ts logDispatch hook + scheduler background recalculation job

### Phase 26: Forge Unification
**Goal**: Skills, Tools, and Forge are one nav item with four coherent tabs — users build, equip, and configure agents in a single place instead of navigating three separate sections
**Depends on**: Phase 24
**Requirements**: FRG-01, FRG-02, FRG-03, FRG-04, FRG-05, FRG-06, FRG-07, SKL-01, SKL-02, SKL-03, SKL-04, SKL-05
**Success Criteria** (what must be TRUE):
  1. The admin nav has a single "Forge" item — "Skills" and "Tools" nav items are gone, all their content is accessible within Forge's tabs
  2. Forge shows four tabs: Templates, Armory, Workshop, Arena — each tab loads its content independently
  3. Workshop tab displays an agent's active skills with live 30-day success rate next to each skill name, and skill slot count increases visibly as agent level rises
  4. Supports display an exact prompt diff and a measured battle impact score — not placeholder text
  5. Forging a new agent from a template shows the birth animation sequence (grayscale → color → particle burst) and ends with the agent appearing in the agent list
**Plans**: 3 plans
Plans:
- [ ] 26-01-PLAN.md — Backend: GET /api/admin/templates/:id/workshop endpoint with skills + success_rate_30d + supports JSONB
- [ ] 26-02-PLAN.md — Frontend: Sidebar nav merge (3 items → 1) + 4-tab Forge shell + Armory tab absorbs skills/tools
- [ ] 26-03-PLAN.md — Frontend: Full Workshop tab with live skill rates + supports diff + birth animation grayscale-to-color

### Phase 27: Character Sheet UI
**Goal**: Every agent has a full character sheet users can read like a game card — stats, gear, vitals, passive tree, rarity, and star level are visible, accurate, and update in real time
**Depends on**: Phase 25, Phase 26
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, VIT-01, VIT-02, VIT-03
**Success Criteria** (what must be TRUE):
  1. An agent's character card displays all sections without empty states: Shell, Intelligence, Skills, Supports, Equipment, Passive Tree, Vitals, Level/XP bar, 5-stat pentagon, rarity badge, star rating
  2. The stat pentagon (recharts RadarChart) renders correctly for all 5 stats at any value range — an agent with all stats at 0 shows an empty pentagon, not a crash
  3. The three vitals bars (Tokens, Health, Focus) are color-coded and update live via SSE — a new dispatch visibly changes the Health bar within 5 seconds
  4. Rarity border animations render correctly for all 5 tiers: Common (gray), Rare (blue glow), Epic (purple pulse), Legendary (gold animated), Mythic (red particles)
  5. Star display shows current stars filled, the next star unfilled with a progress arc, and the exact dispatch/battle count needed to unlock the next tier
**Plans**: 3 plans
Plans:
- [ ] 27-01-PLAN.md — recharts install + rarity CSS keyframes + CharacterCard component (pentagon, stars, rarity border, shell/intelligence/skills/supports/equipment sections)
- [ ] 27-02-PLAN.md — VitalsBar component (Tokens/Health/Focus with real data) + PassiveTreeView (8-node grid)
- [ ] 27-03-PLAN.md — Wire into agent-detail.tsx SHEET tab + build + ship + human verify

### Phase 28: Battle Arena
**Goal**: Any two agents can fight head-to-head on the same prompt, judged blindly by an ensemble of 3 models, with Elo ratings that mean something because judge bias is structurally prevented from day one
**Depends on**: Phase 27
**Requirements**: BTL-01, BTL-02, BTL-03, BTL-04, BTL-05, BTL-06, BTL-07, BTL-08, BTL-09
**Success Criteria** (what must be TRUE):
  1. Starting a battle sends the identical prompt to both agents simultaneously via the existing routing engine — both responses arrive and are stored before any judgment begins
  2. Three judge model calls run with A/B positions independently randomized per call — the battle record stores which agent occupied position A for each judge, enabling post-hoc bias auditing
  3. Elo ratings update correctly after every battle: winner gains rating proportional to opponent strength, loser loses proportionally, and provisional badge disappears after 30 battles
  4. Post-battle report shows a full character sheet diff — which stats changed, by how much, with the judge score breakdown (quality 40% / speed 20% / efficiency 20% / style 20%) visible per dimension
  5. Free tier enforcement stops a user who has used 5 battles today before any API call fires — the rate limit check is the first thing the battle endpoint does
  6. A pre-launch calibration run of 50 same-prompt battles shows positional win-rate delta below 10% — battles are not enabled for all users until this threshold is met
**Plans**: TBD

### Phase 29: Session Registry + Message Bus
**Goal**: Every AI dispatch session is tracked with token counts and context pressure, and inter-gateway messages are recorded as a structured audit log — the infrastructure the intelligence loop needs to detect meaningful patterns
**Depends on**: Phase 24
**Requirements**: SES-01, SES-02, SES-03, MSG-01, MSG-02
**Success Criteria** (what must be TRUE):
  1. Every dispatch session has a row in `session_registry` with per-session token count, context window percentage, and session age — queryable by session ID
  2. When a session crosses 80% context pressure, an event fires within one scheduler tick (2 seconds) — the event is visible in the admin Bridge operator view
  3. Session rotation creates a Recall summary of the outgoing session and carries it into the new session context — conversation continuity survives the rotation
  4. Inter-gateway messages are written to `msg_bus_events` with a structured envelope (type, source gateway, target gateway, correlation ID, payload) — cross-model handoffs are traceable by correlation ID
**Plans**: TBD

### Phase 30: Intelligence Loop + Bridge Operator
**Goal**: Battle and dispatch patterns feed back into routing decisions through Memory V2 concepts, and Vigil sees all of it live — the system gets measurably smarter with every battle and session
**Depends on**: Phase 28, Phase 29
**Requirements**: INT-01, INT-02, INT-03, INT-04, BRG-01, BRG-02, BRG-03, BRG-04
**Success Criteria** (what must be TRUE):
  1. The intelligence background job (runs every 6 hours) extracts at least 4 pattern types from dispatch + battle data: latency trends, model strength by task type, failure clusters, and combo chain wins
  2. High-confidence patterns (confidence score >= 0.8) are automatically promoted to Memory V2 `concepts` table — a routing decision made after promotion references the learned concept in its reasoning log
  3. The routing engine reads learned gateway preferences from concepts — an agent that has won 10 battles using Claude produces routing decisions that prefer Claude for that agent's specialty task type
  4. Vigil's admin tab shows live session state, message bus activity, and intelligence patterns as a single unified feed — no page refresh needed to see new events
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 24 → 25 → 26 (parallel with 25) → 27 → 28 → 29 (parallel with 28) → 30.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7 | v1.0 | - | Complete | 2026-03-21 |
| 8-15 | v2.0 | - | Complete | 2026-03-24 |
| 16-23 | v3.0 | - | Complete | 2026-03-25 |
| 24. Schema Migration | v4.0 | 2/2 | Complete | 2026-04-01 |
| 25. RPG Engine | 3/3 | Complete   | 2026-04-01 | - |
| 26. Forge Unification | 3/3 | Complete   | 2026-04-01 | - |
| 27. Character Sheet UI | 1/3 | In Progress|  | - |
| 28. Battle Arena | v4.0 | 0/TBD | Not started | - |
| 29. Session Registry + Message Bus | v4.0 | 0/TBD | Not started | - |
| 30. Intelligence Loop + Bridge Operator | v4.0 | 0/TBD | Not started | - |
