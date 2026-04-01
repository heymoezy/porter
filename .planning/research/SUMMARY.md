# Project Research Summary

**Project:** Porter v4.0 — The Arena
**Domain:** Agent RPG System + Battle Arena
**Researched:** 2026-03-29
**Confidence:** HIGH

## Executive Summary

Porter v4.0 adds an RPG gamification layer on top of the existing Bridge dispatch infrastructure, transforming agent templates into competitive characters with real performance-derived stats, gear slots, and an Elo-rated battle arena. The central design insight is that stats must be immutably derived from the existing `bridge_dispatch_log` — no manual editing, no fake numbers. This single architectural decision both prevents gaming and creates a genuine differentiator: Porter stats mean something because they reflect real usage, not designer fiat. The entire v4.0 build is additive; the existing routing engine, dispatch pipeline, and memory system require zero modification to their interfaces.

The recommended approach is a strict phase sequence driven by data dependencies. The stat calculation engine (`rpg-engine.ts`) must be built before character cards, battles, or leaderboards — everything downstream reads from its derived cache. Battles require the stat engine for XP awards and the existing dispatch infrastructure for execution. Forge unification and the skill tree UI are parallel work that converges at the Battle Arena phase. The PixiJS-powered spectator mode, tournament brackets, and agent import are explicitly Phase 4+ features; shipping them before the RPG foundation is validated would be premature.

The most significant risks are judge bias corrupting Elo ratings (positional and self-enhancement bias are empirically documented at 5-15% systematic distortion), compute runaway from uncapped battle costs (5 LLM calls per battle at $0.01-0.08 each), and the toy problem where users grind trivial dispatches for XP rather than doing real work. All three risks have concrete mitigations that must be built into the Battle Arena MVP — they cannot be retrofitted after launch without invalidating historical rating data.

---

## Key Findings

### Recommended Stack

The stack is almost entirely the existing Porter infrastructure. No new backend npm packages are required — the Elo formula is a custom 20-line TypeScript implementation and agent import parsers use Zod (already installed). The frontend adds five libraries for visual game-feel: `recharts` (radar/pentagon chart for stats), `motion` v12 (spring animations and forge reveal sequences), `@tsparticles/react` (forge birth particle burst), `@pixi/react` + `pixi.js` v8 (WebGL battle arena canvas), and `use-sound` (optional sound effects, off by default).

**Core technologies:**
- `recharts` 3.8.1 — SVG pentagon stat chart; React 19 confirmed; 15-line integration via RadarChart
- `motion` 12.38.0 — forge reveal sequences and level-up animations; import from `motion/react` not `framer-motion`
- `@pixi/react` 8.0.5 + `pixi.js` 8.x — WebGL arena canvas ONLY; not for character cards or list UI
- `@tsparticles/react` 3.0.0 — forge birth particle burst; MEDIUM React 19 confidence; canvas 2D fallback documented
- `use-sound` 5.0.0 — off by default; MEDIUM React 19 confidence; howler.js direct as fallback
- Tailwind v4 `@theme` keyframes — passive rarity border glows; CSS compositor thread, zero React render cost
- Custom `elo.ts` (20 lines) — K-factor tunable per star level (40 provisional, 32 standard, 24 veteran); no package
- Drizzle + PostgreSQL — 7 new tables + 2 existing table ALTERs via `migrate-rpg-v1.ts`; no new ORM

**Critical version flag:** `@tsparticles/react` and `use-sound` have MEDIUM React 19 confidence. Test early in Phase 8 (Forge Animation). Both have documented fallbacks.

### Expected Features

**Must have (table stakes — P1, RPG Foundation):**
- 5-stat character card (QTY/SPD/EFF/REL/COMBO) with radar/pentagon chart display
- XP accumulation and level counter (1-100) with visible progress bar
- Rarity tiers (Common/Rare/Epic/Legendary/Mythic) with CSS border glow animations
- Star progression (1-5) gated by dispatch milestones and reliability thresholds
- Gear slot display (Weapon/Armor/Accessory 1/Accessory 2) mapped to real agent config
- Class assignment (Striker/Guardian/Fixer/Amplifier/Orchestrator) from dominant stat after 50 dispatches
- Elo rating displayed on character card (provisional badge until 10 battles)
- Battle result display with judge score breakdown by dimension

**Should have (differentiators — P2, Battle Arena + Forge):**
- Stats immutably derived from dispatch logs — no manual edit path (anti-gaming moat)
- Ensemble LLM judge: 3 judges, position-randomized, blind to agent identity
- Forge birth animation (gacha reveal with particles and spring animation sequences)
- Skill tree (Active tools equippable, Passive unlocks at 3-star, Ultimate at 4-star)
- Forge nav unification (collapse Skills + Tools + Forge into single nav item)
- Data-emergent specialties from battle history (not fixed class bonuses)
- .md file auto-regeneration on progression events (star-up, level milestone, class change)

**Defer to Phase 4+:**
- Spectator mode with live SSE token counter race (PixiJS arena)
- Tournament system (weekly bracket, seeded by Elo)
- Shareable battle replays with persistent URLs
- Agent import from LangGraph/CrewAI/AutoGen via Open Agent Specification
- Specialty leaderboard per domain

**Anti-features — never build:**
- Manual stat editing (destroys the core value proposition)
- Pay-to-win gear (premium model = guaranteed win)
- Seasonal Elo or XP resets (agents represent real dispatch history)
- Fully automated tournament brackets without human oversight
- Real-time multiplayer WebSocket battles (async achieves same UX at fraction of complexity)

### Architecture Approach

The RPG system is a clean additive layer over the existing Bridge. Every new component reads from `bridge_dispatch_log` (immutable, never touched) and writes to a derived cache (`agent_rpg_stats`). The routing engine, dispatch pipeline, memory injection, and SSE hub require zero interface changes — they gain new event namespaces (`rpg:*`, `battle:*`, `session:*`) but nothing else is modified. Battle dispatches go through the existing `routingEngine.dispatch()` so they appear in `bridge_dispatch_log` and feed back into stats automatically. The architecture research confirmed all integration points via direct source-code inspection of `backend/src/`.

**Major components:**
1. `rpg-engine.ts` — sole writer to `agent_rpg_stats`; derives all 5 stats from dispatch_log; owns XP, level, star, rarity, class progression; triggers .md regeneration on progression events
2. `battle-orchestrator.ts` — parallel dispatches both agents with identical prompt via existing Bridge; calls 3-judge ensemble; updates Elo; emits `battle:complete` SSE
3. `session-registry.ts` — AI dispatch session tracking with per-session token accounting; supplements auth sessions, does not replace them
4. `intelligence-loop.ts` — background job extracting gateway/cost/combo patterns from dispatch data; promotes high-confidence signals to Memory V2 `concepts` table (closes the bridge → memory → routing intelligence loop)
5. `msg-bus.ts` — audit log persistence over existing AgentMessage interface; NOT a queue; records for correlation tracking only

**Critical invariant:** `rpg-engine.ts` is the ONLY writer to `agent_rpg_stats`. Routes are read-only. This must be enforced by having no direct stat UPDATE paths in any route handler — enforcing it prevents gaming and ensures stats are always recomputable from immutable source data.

### Critical Pitfalls

1. **LLM judge positional bias corrupts Elo** — position A wins 5-15% more often systematically (ACL 2025, multiple papers). Mitigation: randomize A/B assignment per judge call (3 separate calls), store `position_a_agent` in battle record for auditability. Must be in MVP — cannot retrofit without invalidating historical Elo.

2. **Compute runaway from uncapped battles** — 5 LLM calls per battle; 100 battles/day = $5-40/day judge costs alone. Mitigation: tier-based daily caps (Free=5, Pro=50) enforced before the first dispatch fires; Ollama as default judge for free tier; battle queue (one per user at a time) prevents concurrent VPS overload.

3. **Stale meta — one model dominates** — if Weapon (model) determines win rate more than Armor (system prompt), the arena becomes a vendor advertisement and engagement collapses. Mitigation: pre-launch calibration tournament (same prompt, all models); judge rubric weighted toward prompt compliance over prose quality; Claude vs Ollama win-rate gap must be <30% before public launch.

4. **Stat snapshot performance bottleneck** — live derivation of 5 stats from `bridge_dispatch_log` per character card request becomes 250 table scans for a 50-agent Forge page. Breaks above 100 dispatches per agent. Mitigation: `agent_rpg_stats` materialized cache rebuilt async via existing scheduler; character card API reads cache only, never raw logs. Must be designed in Phase 2, not added when performance issues appear.

5. **XP grinding (toy problem / Goodhart's Law)** — users dispatch trivial one-word prompts for +10 XP each, inflating stats and breaking the "stats mean something" value prop. Mitigation: quality-gated XP (quality signals worth 3-5x raw dispatch count); 2-star threshold requires `avg_quality_score > 7.0` not just dispatch count; admin dashboard flags grinding patterns.

---

## Implications for Roadmap

Based on research, the build order is determined by hard data dependencies. The critical path is: Schema → RPG Engine → Battle Arena MVP. Forge unification and character card UI are parallel tracks that converge at the Battle Arena phase.

### Phase 1: Schema + Migration Foundation
**Rationale:** Pure DDL, no dependencies. All 9 phases depend on these tables existing. Ship first, unblocks all parallel work.
**Delivers:** 7 new tables (`agent_rpg_stats`, `battles`, `battle_rounds`, `battle_judgments`, `agent_bonds`, `session_registry`, `msg_bus_events`, `intelligence_patterns`) + ALTER 2 existing (`agent_templates`, `personas`). `migrate-rpg-v1.ts` file. `schema.ts` Drizzle definitions.
**Avoids:** Schema changes mid-service-development cause type errors and migration ordering conflicts.

### Phase 2: RPG Engine (Stat Calculation + Progression)
**Rationale:** The entire RPG display layer depends on stats being available. Character cards show empty pentagonswithout it. Battles cannot award XP without it. Build before any UI work.
**Delivers:** `rpg-engine.ts` with computeStats, awardXp, checkProgressionEvents, regenerateMdFiles; async stat recalculation triggered on dispatch milestones via existing scheduler; materialized `agent_rpg_stats` cache.
**Implements:** SPD/REL/EFF from dispatch_log immediately; QTY after first battle; COMBO after multi-agent correlation.
**Avoids:** Pitfall 4 (performance) — snapshot cache is a Phase 2 design decision, not a later fix.

### Phase 3: Forge Unification (Nav + Workshop Tab Shell)
**Rationale:** Parallel with Phase 2 once schema exists. Frontend nav merge is independent of stat calculation. Unblocks skill tree UI and Workshop configuration.
**Delivers:** Single "Forge" nav item replacing Skills + Tools + Forge; Templates/Armory/Workshop/Arena tab shell; `rpg_enabled` toggle on agent templates.
**Avoids:** Building skill tree UI before the Workshop tab container exists.

### Phase 4: Character Card + Skill Tree APIs
**Rationale:** Display layer over Phase 2 stats. Must precede Battle Arena because the Arena tab shows combatant character cards during battle.
**Delivers:** `/api/v1/rpg` routes (stats, class, gear, leaderboard endpoint); recharts pentagon component; Tailwind v4 rarity CSS animations; gear slot display; skill tree UI in Workshop tab.
**Uses:** recharts 3.8.1, Tailwind v4 `@theme` keyframes.
**Avoids:** UX pitfall — provisional Elo badge shown until 10 battles; gear complexity hidden behind expert mode default.

### Phase 5: Battle Arena MVP
**Rationale:** Payoff of the RPG foundation. Requires all prior phases. The judge architecture must be correct from the first battle because retroactive Elo recalibration is expensive.
**Delivers:** `battle-orchestrator.ts`; `/api/v1/battles` routes (start, status, result, leaderboard); ensemble 3-judge judging with position randomization; Elo update on completion; side-by-side battle result display with dimension breakdown.
**Uses:** Custom `elo.ts` (20 lines, K-factor by star level); existing `routingEngine.dispatch()`.
**Avoids:** Pitfall 1 (judge bias) — position randomization and ensemble judging mandatory in MVP. Pitfall 2 (compute runaway) — tier caps enforced before any dispatch fires. Run pre-launch calibration tournament (Pitfall 3) before enabling battles for all users.

### Phase 6: Session Registry + Message Bus
**Rationale:** Infrastructure for per-session token accounting. Required before intelligence loop can extract meaningful session-level patterns. Can be built in parallel with Phase 5.
**Delivers:** `session-registry.ts`; `msg-bus.ts` wrapping existing agent-message dispatch; `/api/v1/sessions` routes; per-session token budget tracking.

### Phase 7: Intelligence Loop
**Rationale:** Closes the feedback loop. Needs battle data (Phase 5) and session data (Phase 6) to detect meaningful patterns. Produces concepts that improve routing — highest long-term leverage of any v4.0 feature.
**Delivers:** `intelligence-loop.ts` background job (every 6h via existing scheduler); `intelligence_patterns` table; auto-promotion of high-confidence patterns to Memory V2 `concepts`; gateway_preference, cost_spike, model_failure, combo_chain pattern types.

### Phase 8: Forge Birth Animation + Visual Polish
**Rationale:** Retention hook. Functional dependency on Forge Workshop (Phase 3) and character card (Phase 4) being complete. High user value but blocks nothing else — correctly deferred until core loop is working.
**Delivers:** motion v12 level-up and star-up sequences; @tsparticles forge birth particle burst; question-driven creation flow → rarity reveal → character born animation.
**Uses:** motion 12.38.0, @tsparticles/react 3.0.0.
**Research flag:** Verify @tsparticles React 19 compatibility here before building — documented fallback available.

### Phase 9+: Spectator, Tournaments, Agent Import
**Rationale:** Growth and viral features. Explicitly deferred until Phase 5 battle loop is validated with real usage data. Each is independent and can be sequenced based on user demand signals.
**Delivers:** PixiJS spectator mode with live SSE token counter race; tournament bracket system (manual admin scheduling); LangGraph/CrewAI/AutoGen agent import via Open Agent Specification.
**Research flag:** Both PixiJS arena integration and OAS agent import warrant `/gsd:research-phase` — see below.

### Phase Ordering Rationale

- Schema is non-negotiable first — all service code imports Drizzle table references that must exist.
- RPG engine before all UI because character card, leaderboard, and battle all read from `agent_rpg_stats`.
- Forge unification (Phase 3) is parallel with RPG engine because it is a frontend routing change with no stat dependency.
- Battle Arena (Phase 5) requires character card APIs (Phase 4) because the Arena tab renders combatant cards.
- Intelligence loop is last among backend services because it benefits from battle data richness — running it before Phase 5 produces only gateway preference patterns, not combo or quality insights.
- Animation phase (Phase 8) is deliberately late — it layers delight on a working system rather than building polish before function.
- Spectator and tournaments are post-validation because they add extreme complexity (WebGL, SSE fan-out, bracket scheduling) before the core loop is proven.

### Research Flags

Phases likely needing `/gsd:research-phase` during planning:
- **Phase 9 (Spectator Mode):** `@pixi/react` v8 + React 19 reconciler is new (December 2025). SSE fan-out architecture for concurrent spectators on the 2 vCPU VPS needs specific load analysis.
- **Phase 9 (Agent Import):** Open Agent Specification (arXiv 2510.04173, October 2024) is new and poorly battle-tested. LangGraph has an official adapter; CrewAI and AutoGen are partial. Real framework export files need to be tested against the import parser before building the UI.
- **Phase 5 (Judge Calibration):** Define specific pass/fail thresholds for the pre-launch calibration tournament — what win-rate positional delta is acceptable, minimum battle sample size, recovery protocol if calibration fails.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Schema):** Drizzle + PostgreSQL DDL follows established project patterns. Full schema defined in ARCHITECTURE.md.
- **Phase 2 (RPG Engine):** Stat derivation is standard SQL aggregation (PERCENTILE_CONT, rolling averages). All queries defined in ARCHITECTURE.md.
- **Phase 4 (Character Card):** recharts RadarChart integration is a 15-line pattern. Tailwind v4 keyframes are documented.
- **Phase 6 (Session Registry):** Session tracking is a well-understood pattern; table schema fully specified.
- **Phase 7 (Intelligence Loop):** All pattern queries and Memory V2 promotion logic are defined. Implements existing scheduler API.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core libraries version-confirmed via npm. Two MEDIUM flags (@tsparticles/react, use-sound) both have documented fallbacks. PixiJS v8 + React 19 confirmed. |
| Features | HIGH | Cross-referenced with Path of Exile, Genshin, Chatbot Arena, Auto-Arena, LMSYS methodology. Feature priorities validated against existing agent-rpg-design-v2.md spec (Grok-reviewed). |
| Architecture | HIGH | All findings from direct source-code inspection of backend/src/. Build order dependencies confirmed against actual file structure and existing service interfaces. |
| Pitfalls | HIGH | Grounded in peer-reviewed research: ACL 2025 position bias, ICML 2025 vote-rigging, NeurIPS 2023 verbosity bias, Gartner gamification failure. All mitigations are specific and implementable in MVP. |

**Overall confidence:** HIGH

### Gaps to Address

- **Judge calibration thresholds:** Research defines failure modes but not a specific pass/fail metric for pre-launch calibration. Define during Phase 5 planning: suggest 50 same-prompt calibration battles, positional win-rate delta must be <10%.
- **@tsparticles React 19 compatibility:** Unconfirmed. Test at the start of Phase 8 — if React 19 reconciler warnings appear, switch to documented canvas 2D fallback.
- **Open Agent Specification field mapping:** OAS is October 2024 and LangGraph/CrewAI real-world exports haven't been tested. Frame import as "best-effort mapping" with user-completion UI, not guaranteed fidelity. Test against sample framework exports during Phase 9 planning.
- **VPS memory budget under WebGL:** 2 vCPU / 8GB RAM has not been load-tested with PixiJS WebGL canvas + SSE fan-out simultaneously. Flag as Phase 9 risk; consider spectator connection cap (suggested: 20 per active battle).

---

## Sources

### Primary (HIGH confidence)
- `backend/src/db/schema.ts` — confirmed existing table structure and Drizzle patterns (direct read)
- `backend/package.json` + `admin/frontend/package.json` — confirmed installed dependencies and versions (direct read)
- `research/agent-rpg-design-v2.md` — core design spec, Grok-reviewed
- [recharts npm](https://www.npmjs.com/package/recharts) — v3.8.1 confirmed, React 19 support issue closed
- [motion npm](https://www.npmjs.com/package/motion) — v12.38.0 confirmed March 2026, React 19 concurrent rendering explicit
- [@pixi/react npm](https://www.npmjs.com/package/@pixi/react) — v8.0.5, "designed exclusively for React 19"
- [Judging LLM-as-a-Judge (NeurIPS 2023)](https://arxiv.org/abs/2306.05685) — position bias, verbosity bias, self-enhancement bias quantified
- [Judging the Judges: Position Bias (ACL 2025)](https://aclanthology.org/2025.ijcnlp-long.18/) — systematic positional bias, varies across judges and tasks
- [Self-Preference Bias in LLM-as-a-Judge](https://arxiv.org/html/2410.21819v1) — 5-7% systematic self-enhancement
- [Improving Model Ranking by Vote Rigging (ICML 2025)](https://arxiv.org/abs/2501.17858) — Elo manipulation with hundreds of strategic battles
- [Auto-Arena: 3-Judge Committee](https://openreview.net/forum?id=pMp5njgeLx) — 92.14% human preference correlation
- [LMSYS Chatbot Arena](https://lmsys.org/blog/2023-05-03-arena/) — blind pairwise Elo methodology
- [Tailwind CSS v4 animation docs](https://tailwindcss.com/docs/animation) — @theme keyframes confirmed

### Secondary (MEDIUM confidence)
- [use-sound npm](https://www.npmjs.com/package/use-sound) — v5.0.0, React 19 unconfirmed
- [@tsparticles/react npm](https://www.npmjs.com/package/@tsparticles/react) — v3.0.0, React 19 unconfirmed
- [Open Agent Specification (arXiv 2510.04173)](https://arxiv.org/pdf/2510.04173) — agent portability format, October 2024
- [LangGraph A2A integration](https://docs.langchain.com/langgraph-platform/autogen-integration) — official cross-framework adapter
- [Gartner gamification failure analysis](https://centrical.com/resources/will-80-of-gamification-projects-fail/) — 80% failure, Goodhart's Law patterns

### Tertiary (LOW confidence)
- [Elo manipulation patterns](https://tonysheng.substack.com/p/elo-rating-systems-and-how-to-manipulate) — sandbagging and cherry-picking mechanics (community source; consistent with ICML 2025 academic findings)

---
*Research completed: 2026-03-29*
*Ready for roadmap: yes*
