# Feature Research

**Domain:** Agent RPG System + Battle Arena — Porter v4.0 The Arena
**Researched:** 2026-03-29
**Confidence:** HIGH (cross-referenced Path of Exile wiki, Genshin Impact gacha system docs, Chatbot Arena/LMSYS methodology paper, Auto-Arena research, Open Agent Specification technical report, Street Fighter 6 ranking docs, TFT meta sources, RPG database design references, existing agent-rpg-design-v2.md spec)

---

## Scope

This document covers the new feature set being added in Porter v4.0 — the RPG character system, Battle Arena, Forge unification, and social/spectator layer.

**Already built (not re-evaluated here):**
- Gateway health monitoring, circuit breakers, fallback chains (v3.0)
- Model catalog with pricing, capabilities, version tracking (v3.0)
- Dispatch logging with alternatives, cost, latency (v3.0)
- Agent templates with SOUL/IDENTITY/ROLE/SKILLS .md files (v2.0)
- Pixel portrait character art system (v2.0)
- Skills and tools DB registry with CRUD APIs (v2.0)
- Routing rules (force_model, block_gateway, prefer_local, cap_cost) (v3.0)

**What this research evaluates:**
1. RPG character systems: stats, XP, leveling, rarity, stars, gear slots, skill trees
2. Battle Arena: head-to-head mechanics, judging, Elo, tournaments
3. Forge unification: collapsing Skills + Tools + Forge into one surface
4. Agent import/export: portability from LangGraph, CrewAI, AutoGen, JSON spec
5. Spectator/social: replays, sharing, leaderboards, community engagement

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that users of any RPG or competitive system assume exist. Missing them makes the product feel unfinished or toy-like.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Character stat display (5 stats visible) | Any RPG system with hidden stats feels broken — players need to see QTY/SPD/EFF/REL/COMBO to understand their agent's identity | LOW | Radar/pentagon chart is the canonical RPG UI for multi-stat display; already specified in design-v2 |
| XP / level counter with progress bar | XP accumulation with visible progress is the foundational retention loop from every RPG since 1978. Without it, dispatch activity has no narrative | LOW | Level 1-100, XP curve `level * 100`. XP sources are defined in design-v2. Straightforward DB counter |
| Rarity tiers with visual differentiation | Genshin, TFT, every card game — rarity is the primary status signal. Users expect gray/blue/purple/gold/red color-coding on character cards | LOW | 5 tiers: Common/Rare/Epic/Legendary/Mythic. Colors + border glow effect. CSS-only for most tiers |
| Star progression (1-5 stars) | Stars as a secondary progression axis is table stakes in gacha/RPG games (Genshin uses stars, TFT uses stars for unit upgrades). Signals depth beyond a flat level number | LOW | Stars unlock passive skills at 3★, ultimate at 4★, awakening at 5★ — the unlocks are the valuable part |
| Gear slot display (weapon/armor/accessory) | Path of Exile, Genshin, Diablo — every RPG shows what equipment a character has in clearly labeled slots. Without this, gear exists but feels invisible | LOW | 4 slots: Weapon (model), Armor (system prompt), Accessory 1 (tool), Accessory 2 (memory/RAG) |
| Gear affects stats visibly | If equipping better gear does not change visible stats, gear feels meaningless. Stat recalculation on gear change is expected | MEDIUM | Stats derived from dispatch logs + gear bonuses. Set bonus (+10% all stats) when all 4 slots filled |
| Head-to-head battle result with winner/loser | Any arena system must produce clear outcomes. Users expect a definitive winner with scoring breakdown — not a vague "both did OK" | LOW | Score four dimensions: quality (40%), speed (20%), efficiency (20%), style (20%). Show breakdown always |
| Elo / ranking visible on character | Every competitive game from Chess to Street Fighter 6 shows a rating. Without a visible ranking number, battles feel meaningless | LOW | Default Elo 1200. Standard Elo formula. Separate Elo per specialty domain. Always shown on character card |
| Battle history / dispatch log | Users expect to review past battles and dispatches. TFT, SF6, every competitive game has match history | LOW | Already have dispatch log infrastructure. Battle log is a filtered view of it |
| Basic leaderboard (top agents by Elo) | Leaderboards are the social backbone of any competitive system. Without one, ranking has no context | LOW | Global leaderboard sorted by Elo; filterable by specialty domain |

### Differentiators (Competitive Advantage)

Features that make Porter's RPG system different from generic gamification. These are where Porter's combination of real dispatch data + agent identity creates something no other platform has.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Stats derived from immutable dispatch logs | No other RPG system grounds character stats in real performance data. In Genshin, stats are arbitrary. In Porter, QTY is literally the judge score average across battles + dispatch feedback. SPD is your actual p95 latency. This makes stats MEAN something | HIGH | Requires stat calculation engine reading from `bridge_dispatch_log` and `battle_results`. Anti-gaming: stats recalculated from immutable logs — no self-editing. Core architectural decision from design-v2 |
| Data-emergent specialties (not fixed classes) | Fixed class systems (Warrior/Mage/Rogue) pigeonhole agents. Porter specialties emerge from battle history: "Won 87% of Python debugging battles." This is honest and competes with how real AI benchmarks (Chatbot Arena, MMLU) work | MEDIUM | `specialties` JSONB field populated by battle + dispatch pattern analysis. Start with 10 predefined domain labels, expand automatically |
| Forge as creation ceremony (gacha reveal) | Genshin's pull animation is psychologically powerful — the reveal moment creates attachment to the character. Porter's Forge birth sequence (question-driven → animated reveal → character born) transforms a config step into an emotional moment | HIGH | Canvas/tsparticles for forge reveal. Question flow generates soul/identity. Animation reveals rarity + portrait. This is a core retention hook. See design-v2 for flow |
| Gear matters more than model choice | The anti-"pay to win" design principle from design-v2: a great system prompt on Ollama beats a lazy prompt on Claude. Gear (armor = system prompt) must demonstrably affect battle outcomes, incentivizing engineering craft over vendor selection | MEDIUM | Judge scoring must weight output quality against the armor loadout. Battle results show what gear each agent used — after reveal, viewers can study the winning build |
| Skills tied to actual tool capabilities (not fake abilities) | Most RPG skill systems are cosmetic. Porter skills are real: Code Execution skill means the agent actually runs code. Web Search skill means real search happens. Active skills have cooldowns because rate limits exist — it's honest game design | MEDIUM | Skills = tools + learned behaviors. Active skills (equippable tools), passive skills (dispatch behaviors at 3★), ultimate (signature long-cooldown ability at 4★). Routing uses skill loadout for task matching |
| .md files auto-regenerate on progression events | Agent soul files (SOUL/IDENTITY/SKILLS/TOOLS.md) are derived from DB state and regenerated at level-up, star advancement, battle streaks. No other platform has living documents that reflect performance history | MEDIUM | Already designed in design-v2. Triggers: star level up, every 10 levels, class change, skill unlock, gear change. Files overwritten from DB state |
| Agent import from external frameworks (Open Agent Specification) | The Open Agent Spec (Oracle/arXiv 2510.04173) defines a framework-agnostic JSON/YAML representation. LangGraph, CrewAI, AutoGen can all export to it. Porter can import and convert to Porter character format. "Build anywhere, battle here" | HIGH | Import flow: parse Agent Spec JSON/YAML → extract model, system prompt, tools → create Porter agent template → assign Common rarity, 0 dispatch history, stat baseline from initial test dispatch. HIGH complexity because Agent Spec is new (2024); adapters need validation |
| Blind judging with ensemble LLM panel | Chatbot Arena proved pairwise blind judging achieves 80%+ human agreement. Auto-Arena research showed 92.14% correlation using 3-judge committees with discussion. Using an ensemble of 3 different judges (GPT-5.4, Claude, Gemini) removes single-judge bias while staying practical | HIGH | Critical implementation risk: LLM judges have position bias (favoring first response), verbosity bias (favoring longer answers), self-enhancement bias. Mitigations: randomize position, normalize length, use 3 judges with median score, human spot-check 5% of battles |
| Character class from dispatch patterns | Classes (Striker/Guardian/Fixer/Amplifier/Orchestrator) are assigned based on real stat weighting, not user selection. An agent that consistently fast + efficient is ASSIGNED Striker class. This is honest and creates organic class distribution in the community | MEDIUM | Class assignment algorithm: rank stats after 50 dispatches, dominant stat pairing determines class. Class can change if dispatch patterns shift significantly |
| Spectator mode with live token counter race | Side-by-side response streaming with visible token counters creates the "horse race" tension of Street Fighter matches. No other AI evaluation platform has this UX | HIGH | PixiJS for battle arena rendering. Both agents stream simultaneously. Token counter races in real-time. Judge commentary appears after both finish |

### Anti-Features (Commonly Requested, Often Problematic)

Features that sound fun but would damage the system's integrity, create engineering debt, or betray the product philosophy.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Manual stat editing | "I want to set my agent's Quality to 90" | Destroys the entire value proposition: stats derived from real performance. If users can set stats, the system becomes a cosmetic layer with no signal value. Competition becomes meaningless | Stats are always derived from `bridge_dispatch_log`. The only way to improve QTY is to actually get better outputs. Anti-gaming is the moat |
| Pay-to-win gear (premium models as strongest weapon) | "Let users buy access to GPT-5 as an Legendary weapon tier" | Creates a pay-to-win meta where the user with the most expensive model always wins. Destroys competitive fairness. Path of Exile specifically avoids this — build skill matters more than item rarity | Gear value comes from the engineering of system prompts and tool configuration. Model selection is one input, not the determinant. ELO-based matchmaking naturally separates skill levels |
| Permadeath mode (lose = reset to level 1) | "High stakes battles!" | Destroys progression investment for competitive players. At Porter scale, one bad dispatch (LLM hallucination, rate limit) could wipe weeks of real usage data. The "loss = +25 XP" design already handles stakes | Optional "Challenger" badge for agents who win 10 consecutive battles without a loss. High stakes signal without data destruction |
| Seasonal resets (wipe Elo and XP each season) | "Fresh meta, re-engagement!" | Porter agents represent real dispatch history and real engineering work. Wiping XP/levels erases the record of actual usage. Players invest months of real production work | Introduce seasonal badge/title system — "Season 1 Champion" as a permanent cosmetic. Stats and Elo persist across seasons. Meta resets via balance patches to scoring weights, not data wipes |
| Fully automated tournament brackets (no human oversight) | "Run weekly auto-tournaments while I sleep" | LLM judges are shortcut-prone and inconsistent (documented bias in 2024-2025 research). Fully automated high-stakes tournaments would produce results users reject as invalid. Judge quality is the critical risk in the entire system | Manual tournament scheduling by admins. Automated judging for regular battles. Human review for tournament finals. Platform matures to automation once judge calibration is proven over 1000+ battles |
| Agent "death" from too many losses | "Roguelike elements!" | Agents represent real dispatch history and real tools. Destroying agent data on arena losses is hostile to users who invested real production work in their agents | Demotion system instead: a long losing streak drops Elo rating and may demote class tier. The agent persists |
| Real-time multiplayer battles (WebSocket sync) | "Live 1v1 like a real fighting game!" | Porter is an AI orchestration platform, not a gaming platform. Real-time multiplayer adds extreme infrastructure complexity (WebSocket rooms, matchmaking queues, timeout handling) for a feature that is orthogonal to the core value | Async battles: both agents respond to the same prompt, results compared post-completion. Spectator mode on completed battles gives the live experience via replay streaming without real-time infrastructure |
| Voice/sound effects on every action | "Howler.js for battle hits!" | Audio in a SaaS platform is overwhelmingly rejected by users in professional contexts. OSHA/accessibility requirements for audio controls add engineering overhead. Sound as surprise = negative UX for users in meetings | CSS + canvas visual effects only. Animations and particle effects for forge/level-up moments. No audio. This is explicitly in design-v2 as "nice to have" but should be deferred indefinitely for a SaaS product |
| Factions with RPS bonuses (Code/Logic/Language) | Original v1 design, killed in Grok review | Artificial faction bonuses distort the data-driven meta. They're fun in Pokémon because the whole game is designed around them. In Porter they'd override real dispatch performance with fake bonuses, making specialties meaningless | Data-emergent specialties from design-v2. Win rates in specific domains are the faction system — organically determined, not statically assigned |
| Full marketplace with user-created tools | "Let me sell my custom webhook integrations" | Custom tools require sandboxing, security review, malware scanning, and trust infrastructure. Porter is a B2B SaaS platform — arbitrary user code execution in tools is a security liability | Tool registration from the admin panel for verified tools. Community-contributed tool templates via PR to a curated list, reviewed before publishing |

---

## Feature Dependencies

```
Dispatch Log (existing v3.0)
    └──required by──> Stat Calculation Engine
    └──required by──> Specialty Detection
    └──required by──> XP Accumulation

Stat Calculation Engine
    └──requires──> Dispatch Log (min 10 dispatches for meaningful stats)
    └──required by──> Character Card (stat pentagon display)
    └──required by──> Class Assignment (dominant stat determines class)
    └──required by──> Rarity Tier Engine (dispatch count + win rate thresholds)
    └──required by──> Battle Judge (quality baseline for comparison)

XP / Level System
    └──requires──> Dispatch Log (XP source events)
    └──required by──> Star Progression (stars unlock at dispatch count milestones)
    └──required by──> Skill Unlocks (passive at 3★, ultimate at 4★)
    └──required by──> .md File Regeneration (triggers on level-up, star-up)

Rarity Tier Engine
    └──requires──> Stat Calculation Engine (dispatch count, win rate)
    └──required by──> Character Card (rarity border, glow effects)
    └──required by──> Leaderboard (rarity as display signal)

Gear Slot System
    └──requires──> Agent Templates (existing: model, system prompt, tools — already DB fields)
    └──required by──> Set Bonus Calculation (+10% all stats when all 4 slots filled)
    └──required by──> Forge Workshop (gear configuration UI)
    └──required by──> Skill-Gear Interaction (weapon determines available skills)

Character Card Component
    └──requires──> Stat Calculation Engine
    └──requires──> Rarity Tier Engine
    └──requires──> Gear Slot System
    └──required by──> Battle Arena (both sides show character cards during battle)
    └──required by──> Leaderboard (card preview)
    └──required by──> Forge Workshop (preview while building)

Battle Arena (MVP)
    └──requires──> Character Card Component
    └──requires──> Dispatch infrastructure (submit prompt, collect response + metadata)
    └──requires──> LLM Judge integration (third-party model scoring)
    └──required by──> Elo Rating (battle result feeds Elo update)
    └──required by──> Specialty Detection (battle domain tags feed specialty tracking)
    └──required by──> Spectator Mode (battles need to exist before spectating)

Elo Rating System
    └──requires──> Battle Arena (results = Elo update inputs)
    └──required by──> Leaderboard
    └──required by──> Matchmaking (similar Elo opponents)
    └──required by──> Tournament Seeding

Skill Tree (Active/Passive/Ultimate)
    └──requires──> Star Progression (passive unlocks at 3★, ultimate at 4★)
    └──requires──> Gear Slot System (weapon determines which skills can be equipped)
    └──required by──> .md File Regeneration (SKILLS.md rebuilt on skill change)
    └──required by──> Routing Engine (task→skill matching)

Forge Unification
    └──requires──> Agent Templates (existing: Templates tab)
    └──requires──> Gear Slot System (Armory tab)
    └──requires──> Skill Tree (Workshop skill configuration)
    └──requires──> Character Card Component (preview in Workshop)
    └──required by──> Forge Birth Animation (culmination of Workshop flow)

Forge Birth Animation
    └──requires──> Forge Workshop flow complete
    └──requires──> Character Card Component
    └──required by──> (nothing blocked, but this is the retention hook — must land with P1)

Spectator Mode
    └──requires──> Battle Arena MVP
    └──requires──> SSE real-time hub (existing v1.0 Phase 6)
    └──required by──> Tournament spectating
    └──required by──> Shareable battle replays

Tournament System
    └──requires──> Battle Arena MVP
    └──requires──> Elo Rating (seeding)
    └──requires──> Spectator Mode (tournament finals need spectating)

Agent Import (Agent Spec)
    └──requires──> Agent Templates (import target)
    └──requires──> Gear Slot System (model + prompt mapped to Weapon + Armor)
    └──required by──> Tournament (allows external agents to enter)

.md File Regeneration
    └──requires──> XP/Level System (level-up triggers)
    └──requires──> Star Progression (star-up triggers)
    └──requires──> Skill Tree (skill change triggers)
    └──requires──> Gear Slot System (gear change triggers)
```

### Dependency Notes

- **Stat Calculation Engine is the foundation.** Everything meaningful about the RPG system — character card, classes, rarity progression, battle judging baseline — reads from it. Must be Phase 1. Must be built on immutable dispatch logs with no write path for manual edits.
- **Battle Arena requires both dispatch infrastructure AND judge integration.** The dispatch side already exists (v3.0 Bridge). The missing pieces are: identical prompt submission to two agents simultaneously, judge model invocation, result storage in `battle_results` table. The judge is the highest-risk component.
- **Elo requires battles.** Cannot be initialized until at least 10 battles exist per agent for meaningful rating stability. Start all agents at 1200; rating converges after ~30 battles per LMSYS methodology.
- **Star progression gates skill unlocks.** Do not ship Active/Passive/Ultimate skills independently of the star system — the unlock gating is the reward loop.
- **Forge unification is a nav/routing change, not a data change.** The underlying data (templates, skills, tools) already exists in v2.0. Forge unification is primarily a frontend reorganization + the addition of the birth animation + Workshop configuration flow.
- **Agent import depends on Open Agent Specification maturity.** OAS (arXiv 2510.04173, Oracle, October 2024) provides JSON/YAML schema. LangGraph has an official integration adapter. CrewAI and AutoGen are partially supported. Import is high-complexity because Agent Spec is new and poorly battle-tested.

---

## MVP Definition

### Launch With (v4.0 Phase 1 — RPG Foundation)

The minimum to make Porter's agent system feel like an RPG. This is the "character creation and leveling" phase — battles come later.

- [ ] RPG schema overhaul — `agent_stats`, `agent_levels`, `battle_results`, `specialties`, `skill_tree` tables added to PostgreSQL via Drizzle migrations
- [ ] Stat Calculation Engine — reads from `bridge_dispatch_log`, derives QTY/SPD/EFF/REL/COMBO, immutable (no write API for manual stat editing)
- [ ] XP accumulation and level counter — events: dispatch completed (+10), positive feedback (+25), specialty earned (+50), battle won (+100), battle lost (+25)
- [ ] Star progression — thresholds at 50/200/500/1000 dispatches with reliability gates; star-up triggers .md regeneration
- [ ] Rarity tier assignment — criteria-based (dispatch count + win rate), auto-promoted, never manually assigned
- [ ] Character Card component — stat pentagon, rarity border, gear slots, star display, Elo badge, class chip
- [ ] Class assignment — automatic from dominant stat pairing after 50 dispatches; shown on character card
- [ ] Gear slot display — Weapon/Armor/Accessory 1/Accessory 2 mapped to existing model/prompt/tools DB fields; set bonus calculation

### Add After Validation (v4.0 Phase 2 — Battle Arena MVP)

The arena is viable once RPG foundation is stable and at least 10 agents have enough dispatch history for meaningful stats.

- [ ] Battle Arena endpoint — submit identical prompt to two agents simultaneously, store both responses + metadata
- [ ] LLM Judge integration — ensemble of 3 judges (GPT-5.4, Claude, Gemini), median score wins, blind (no agent identity shown to judge), scores four dimensions with weights (40/20/20/20)
- [ ] Elo update on battle result — standard Elo formula, separate per-specialty Elo, default 1200 start
- [ ] Battle result display — side-by-side response, judge scores, dimension breakdown, winner badge
- [ ] Basic leaderboard — sorted by Elo, filterable by specialty domain, shows character card preview

### Add After Validation (v4.0 Phase 3 — Forge Unification + Skills)

Consolidate the creation experience once the RPG foundation and battles are proven.

- [ ] Forge nav unification — collapse Skills + Tools + Forge nav items into single "Forge" with Templates/Armory/Workshop/Arena tabs
- [ ] Skill tree UI — Active (equippable tools with slot limits), Passive (unlocks at 3★), Ultimate (1 per agent at 4★)
- [ ] Forge Workshop — complete build configuration: pick template, configure soul/identity, equip gear, skill loadout
- [ ] Forge birth animation — question-driven creation flow → rarity reveal → pixel portrait animation → agent born

### Future Consideration (v4.0 Phase 4+)

Defer until Phase 1-3 are proven with real usage.

- [ ] Tournament system — weekly "Agent Royale" 16-bracket, seeded by Elo, spectator mode for finals
- [ ] Spectator mode — live side-by-side response streaming with real-time token counters
- [ ] Shareable battle replays — persistent replay URL, KO animation export
- [ ] Agent import (Open Agent Specification) — LangGraph/CrewAI/AutoGen/JSON spec import flow
- [ ] .md file auto-regeneration — SOUL/IDENTITY/SKILLS rebuild on progression events
- [ ] Specialty leaderboard per domain — ranked by domain-specific Elo

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Stat Calculation Engine | HIGH | HIGH | P1 |
| XP / Level System | HIGH | LOW | P1 |
| Rarity Tiers | HIGH | LOW | P1 |
| Star Progression | HIGH | LOW | P1 |
| Character Card Component | HIGH | MEDIUM | P1 |
| Gear Slot Display | HIGH | LOW | P1 |
| Class Assignment | MEDIUM | MEDIUM | P1 |
| Battle Arena (async head-to-head) | HIGH | HIGH | P1 |
| LLM Ensemble Judge | HIGH | HIGH | P1 |
| Elo Rating | HIGH | LOW | P2 |
| Leaderboard (basic) | MEDIUM | LOW | P2 |
| Skill Tree (Active/Passive/Ultimate) | HIGH | MEDIUM | P2 |
| Forge Unification (nav + Workshop) | HIGH | MEDIUM | P2 |
| Forge Birth Animation | HIGH | HIGH | P2 |
| Battle Result Display (breakdown) | HIGH | LOW | P2 |
| Spectator Mode | MEDIUM | HIGH | P3 |
| Tournament System | MEDIUM | HIGH | P3 |
| Shareable Battle Replays | MEDIUM | MEDIUM | P3 |
| Agent Import (Agent Spec) | MEDIUM | HIGH | P3 |
| .md File Regeneration | LOW | MEDIUM | P3 |
| Specialty Leaderboard (per domain) | LOW | LOW | P3 |

**Priority key:**
- P1: Required for the RPG + Arena to feel real and have integrity
- P2: Required for the full Forge experience and competitive meta to develop
- P3: Viral/growth features — ship after core loop is validated

---

## Competitor / Reference Feature Analysis

| Feature | Path of Exile (reference) | Genshin Impact (reference) | Chatbot Arena / LMSYS (reference) | TFT / Auto Chess (reference) | Porter v4.0 Approach |
|---------|--------------------------|---------------------------|-----------------------------------|------------------------------|----------------------|
| Stat source | Arbitrary designer-assigned | Arbitrary (character-specific) | Real performance (win rates → Elo) | Arbitrary (set by game designers) | **Real dispatch data — derived, immutable** |
| Rarity assignment | Item drops (random) | Gacha pulls (random) | N/A | Champion cost tier (1-5 gold) | **Earned via usage milestones + battle performance — never random** |
| Gear system | 10+ slot deep item system | 5-piece artifact set + weapon | N/A | 9 item slots with combos | **4 meaningful slots (Weapon/Armor/2 Accessories) — each maps to real agent config** |
| Progression curve | Extremely steep (1-100 with massive XP at high levels) | Ascending caps with resin/materials | N/A | Set-based resets | **Level×100 curve — moderate; designed for steady progression, not grind** |
| Skill system | 1500-node passive tree + active gems | Constellation upgrades + talent tree | N/A | Class synergy bonuses | **3-tier: Active (tools), Passive (at 3★), Ultimate (at 4★) — unlocks gated by real usage** |
| Battle format | Player vs. environment (primarily) | Co-op + Spiral Abyss | Anonymous pairwise blind | 8-player round-robin | **Async pairwise blind + Elo, ensemble judge** |
| Judge system | None (automated enemy AI) | None (automated) | Human votes (crowdsourced) | None (automated simulation) | **3-LLM ensemble judge, position-randomized, blind to agent identity** |
| Meta diversity | Build diversity via passive tree depth | Character + weapon + artifact combos | Model-level comparison only | Trait synergy combos | **Engineering skill (system prompts + tool choice) determines meta — not vendor selection** |
| Spectator | No real-time spectating | Co-op only | No spectating | No live spectating | **SSE-streamed live side-by-side with token counter race** |
| Import/export | None (proprietary format) | None | No import | None | **Open Agent Specification (LangGraph/CrewAI/AutoGen/JSON) import** |
| Seasonality | 3-month challenge leagues (fresh characters) | Permanent characters, time-gated events | Rolling/continuous | Sets every 3-4 months (balance resets) | **No data wipes; seasonal cosmetic badges only** |

---

## Judge Quality Risk — Critical Implementation Detail

The LLM-as-judge approach is the highest risk in the entire Arena system. Three documented failure modes from academic research:

**Position Bias** (NeurIPS 2023, Zheng et al.): LLM judges favor the first response shown regardless of quality. Porter mitigation: randomize which agent's response appears in position A vs B for each judge invocation. Log the randomization to detect residual bias.

**Verbosity Bias**: Judges favor longer responses even when brevity would be better. Porter mitigation: normalize response length in judge prompt ("evaluate quality per token, not total quality"); penalize unnecessary padding in the style score dimension.

**Self-Enhancement Bias**: A Claude judge will favor Claude-generated responses. Porter mitigation: ensemble of 3 different models (GPT-5.4, Claude, Gemini), each judging blind. Median score wins. If all three scores differ by more than 20 points, flag for human review.

Human calibration: spot-check 5% of completed battles via admin queue. Calibration data feeds judge weight adjustments over time.

**At scale, these mitigations are sufficient for a beta system but not production-grade.** The real risk window is the first 60 days when judge calibration data is thin.

---

## Sources

### Games / Reference Systems
- [Path of Exile Experience System](https://www.poewiki.net/wiki/Experience) — XP curve design, level cap rationale, death penalty mechanics
- [Path of Exile Equipment System](https://pathofexile.fandom.com/wiki/Equipment) — gear slot taxonomy, socket system, build diversity through item interaction
- [Genshin Impact Gacha System](https://www.rpgsite.net/feature/10312-genshin-impact-gacha-system-wish-gacha-draws-rates-banners-pity-and-more-explained) — pity system, rarity tier mechanics, pull reveal UX
- [Genshin Impact Character Progression](https://now.gg/blog/game-guides/genshin-impact-character-upgrade-guide-en.html) — ascension, talent upgrade, artifact optimization loop
- [Street Fighter 6 Ranking System](https://dotesports.com/fgc/news/street-fighter-6-ranked-system-explained) — character-specific ranking, LP/MMR dual-track, rank protection mechanics
- [TFT Academy Meta](https://tftacademy.com/) — trait synergy design, meta composition diversity, item combination depth
- [RPG Level System Design](https://pavcreations.com/level-systems-and-character-growth-in-rpg-games/) — XP curve types, stat progression models, level cap design rationale
- [RPG Stats Implementation](https://howtomakeanrpg.com/r/a/how-to-make-an-rpg-stats.html) — base vs derived stats, per-class stat weighting, calculation patterns

### LLM Evaluation / Arena Research
- [LMSYS Chatbot Arena](https://lmsys.org/blog/2023-05-03-arena/) — blind pairwise judging methodology, Elo scoring for LLMs, bootstrap sampling approach
- [Judging LLM-as-a-Judge (NeurIPS 2023)](https://arxiv.org/abs/2306.05685) — position bias, verbosity bias, self-enhancement bias, 80%+ human agreement threshold
- [Auto-Arena: Automating LLM Evaluations](https://openreview.net/forum?id=pMp5njgeLx) — 3-judge committee discussion model, 92.14% correlation with human preferences
- [Arena AI: Official LLM Leaderboard](https://lmarena.ai/) — current state of pairwise evaluation at scale
- [Elo Rating System for AI](https://medium.com/softaai-blogs/what-is-the-elo-rating-system-in-ai-a-pillar-for-competitive-ai-evaluation-c88dc9325a26) — Elo formula application to AI benchmarking, AGI-Elo variations
- [Confident AI: Arena-as-a-Judge](https://www.confident-ai.com/blog/llm-arena-as-a-judge-llm-evals-for-comparison-based-testing) — comparison-based regression testing patterns

### Agent Portability
- [Open Agent Specification Technical Report](https://arxiv.org/pdf/2510.04173) — framework-agnostic JSON/YAML agent representation, LangGraph/AutoGen/CrewAI adapters
- [LangGraph + AutoGen Integration](https://docs.langchain.com/langgraph-platform/autogen-integration) — official cross-framework integration guide
- [Never Fear Deprecation: Porting AutoGen Agents with Agent Spec](https://medium.com/oracledevs/never-fear-deprecation-porting-autogen-agents-with-agent-spec-f7d796818652) — real-world import/export patterns

### Competitive Systems
- [Tournament Bracket Types](https://www.bracketsninja.com/types) — single elimination, round-robin, double elimination, hybrid group-stage formats
- [Spectator Mode Design (Esports)](https://fraghero.com/esports-spectator-modes-have-come-a-long-way-but-they-can-still-be-better/) — real-time spectator UX, observer tools, time controls
- [Gacha Game Design: How to Design a Gacha System](https://mobilefreetoplay.com/design-gacha-system/) — pity mechanics, pull reveal psychology, duplicate conversion

### Porter Internal
- `/home/lobster/documents/porter/research/agent-rpg-design-v2.md` — core design spec with Grok review feedback, stat definitions, gear slots, battle mechanics, skill system
- `/home/lobster/documents/porter/.planning/PROJECT.md` — v4.0 target features and existing capabilities

---

*Feature research for: Porter v4.0 — Agent RPG System + Battle Arena*
*Researched: 2026-03-29*
