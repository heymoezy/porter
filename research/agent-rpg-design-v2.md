# Porter Agent System — v2 Design (Post-Grok Review)

## The One-Liner

Porter is where builders bring their agents to fight. Build anywhere, battle here, prove your shit works.

## What Changed from v1

- Killed forced factions (Code/Logic/Language RPS) — replaced with data-driven specialties
- Simplified stats from 6 to 5 — added COMBO (multi-agent chaining), dropped HP, renamed LCK→EFF
- Reframed from "gamify vendor models" to "battle-test custom agents"
- Arena is the killer feature, not a side game
- Gear (prompt + tools + routing) must be more powerful than base model choice

---

## Core Stats (5 attributes, 0-100)

| Stat | Name | What It Measures | Calculated From |
|------|------|-----------------|-----------------|
| **QTY** | Quality | How good are the outputs | Judge scores from battles + human feedback on dispatches |
| **SPD** | Speed | How fast it responds | Inverse of p95 latency across dispatches |
| **EFF** | Efficiency | Output quality per token spent | Quality-to-token ratio (better answers with fewer tokens) |
| **REL** | Reliability | How often it fails or hallucinates | `100 - (failed_dispatches / total * 100)` + hallucination detection |
| **COMBO** | Synergy | How well it chains with other agents | Success rate in multi-agent workflows vs solo |

All derived from immutable dispatch logs. No manual editing. No gaming.

## Specialties (Replace Factions)

No static buckets. Specialties emerge from battle results:

```
"Won 87% of Python debugging battles"
"Top 3% token efficiency on financial analysis"
"Excels at long-form research chains"
```

Field: `specialties` JSONB — auto-populated from dispatch + battle history.
Example: `[{"domain": "python-debug", "win_rate": 0.87, "battles": 142}, {"domain": "research", "win_rate": 0.71, "battles": 89}]`

No faction bonuses. Data decides the meta.

## Gear / Equipment (4 slots)

Gear must be MORE impactful than the base model. This is how you prevent "everyone picks Claude and wins."

| Slot | What It Is | Why It Matters More Than The Model |
|------|-----------|-----------------------------------|
| **Weapon** | Primary LLM backend | Base capability — but a bad prompt on Claude loses to a great prompt on Ollama |
| **Armor** | System prompt + guardrails | Defines personality, constraints, output format. THIS is where the skill is |
| **Accessory 1** | Primary tool (code exec, web search, etc.) | Extends capabilities beyond raw LLM |
| **Accessory 2** | Memory/RAG pipeline | Context injection, Recall integration, knowledge base |
| **Set Bonus** | All slots filled + routing logic defined | +10% all stats. The "full build" bonus |

The meta should be: **who has the best engineering**, not who picked the best vendor.

## Rarity (earned, not assigned)

| Rarity | Color | Border Effect | Criteria |
|--------|-------|--------------|----------|
| Common | Gray | None | Template only, never forged |
| Rare | Blue | Subtle glow | Forged with custom soul + identity |
| Epic | Purple | Pulsing glow | 50+ dispatches, positive feedback trend |
| Legendary | Gold | Animated border | 500+ dispatches, top 10% win rate in battles |
| Mythic | Red | Particle effects | 5000+ dispatches, tournament champion, custom-trained |

## Star System (1-5★)

| Stars | Requirement | Unlock |
|-------|-------------|--------|
| ★ | Forged (born) | Base stats active |
| ★★ | 50 dispatches | +1 skill slot, specialties start tracking |
| ★★★ | 200 dispatches + 85% reliability | Passive abilities unlock |
| ★★★★ | 500 dispatches + battle-tested (10+ battles) | Ultimate ability unlock |
| ★★★★★ | 1000 dispatches + top performer | Awakening eligible, champion badge |

## XP / Leveling

| Source | XP | Why |
|--------|-----|-----|
| Dispatch completed | +10 | Basic usage |
| Positive feedback | +25 | Quality signal |
| New specialty earned | +50 | Skill growth |
| Battle won | +100 | Competitive proof |
| Battle lost | +25 | Still learned |
| Multi-agent chain completed | +75 | COMBO growth |
| Failed dispatch | +2 | Failure is data |

Level 1-100. XP curve: `level * 100`.

## Character Classes

| Class | What They Excel At | Stat Weighting |
|-------|-------------------|----------------|
| **Striker** | Fast, high-output throughput | SPD + EFF weighted |
| **Guardian** | Error handling, retry, resilience | REL weighted |
| **Fixer** | Debugging, correction, review | QTY + REL weighted |
| **Amplifier** | Research, context, prep work | COMBO weighted |
| **Orchestrator** | Routing, delegation, decomposition | COMBO + SPD weighted |

## Battle Arena

### The Core Loop

1. Two agents get **identical prompt**
2. Both respond (simultaneously or turn-based option)
3. Third-party judge scores blind
4. Results displayed with full breakdown

### Scoring

| Metric | Weight | How |
|--------|--------|-----|
| Output quality | 40% | Judge rates 1-10 |
| Speed | 20% | Faster = higher |
| Token efficiency | 20% | Same quality, fewer tokens = higher |
| Style points | 20% | Personality, formatting, creativity |

### Elo System

Default 1200. Standard Elo formula. Separate Elo per specialty domain.

### What Makes It Viral

- **Agent import**: one-click pull from LangGraph, CrewAI, AutoGen, JSON spec
- **Blind tournaments**: weekly "Agent Royale" — top 16 bracket, champion badge
- **Spectator mode**: live side-by-side streaming, token counters racing, judge commentary
- **Remix button**: after a loss, fork the winner's loadout and improve it
- **Shareable clips**: battle replay with KO animation, one-click share
- **Daily/weekly challenges**: "optimize for research tasks — reward is new accessory"

### Judge Quality (Critical Risk)

At scale, LLM judges are biased and inconsistent.

Mitigations:
- Ensemble judging (3 different models score, median wins)
- Human spot-check calibration (random 5% of battles reviewed by humans)
- Judge bias detection (if judge consistently favors one style, flag it)
- Community override (viewers vote, 10% weight for chaos/engagement)

## .md File System

Files are DERIVED from DB state, regenerated on progression events:

| File | What Triggers Regeneration |
|------|--------------------------|
| SOUL.md | Star level up, major milestone |
| IDENTITY.md | Level up (every 10 levels), battle streak |
| ROLE_CARD.md | Class change, authority expansion |
| SKILLS.md | Skill unlock, gear change |
| TOOLS.md | Tool equip/unequip |
| HEARTBEAT.md | Lifecycle change (persistent agents only) |

Anti-gaming: files overwritten from DB on every progression event. Stats recalculated from immutable dispatch_log. No self-rating. Blind battle judging.

## Business Model

Not a standalone game. Competitive multiplayer layer on orchestration platform.

| Tier | Price | What You Get |
|------|-------|-------------|
| Free | $0 | 10 agents, 5 battles/day, public arena |
| Pro | $20-40/mo | Unlimited battles, private arenas, replays, team mode |
| Marketplace | 30% cut | Sell/buy agent templates, tool packs, winning loadouts |
| Enterprise | Custom | White-label arenas, internal tournaments, audit logs |

RPG progression is the retention layer. You come for the orchestration, you stay for the arena.

## Visual Stack

- React + Tailwind (existing)
- SVG radar charts for 5-stat pentagon
- CSS animations for level-ups, rarity borders
- Canvas/tsparticles for forge reveal + battle effects
- PixiJS for battle arena (live side-by-side streaming)
- Howler.js for sound (battle hits, level chimes, forge hammer)
- Pixel portraits with rarity-colored animated borders

## Build Order

1. **Schema** — add RPG fields to agent_templates + new tables (battles, bonds, specialties)
2. **Character card component** — the visual character sheet with stat pentagon
3. **Stat calculation engine** — dispatch data → real stats (immutable, derived)
4. **Forge overhaul** — question-driven creation → gacha reveal animation
5. **Battle Arena MVP** — same prompt, blind judge, Elo rating
6. **Spectator mode** — live streaming, replays, share
7. **Agent import** — pull from external frameworks
8. **Marketplace** — sell/buy templates and loadouts

## Reference Games to Study

- **Path of Exile** — endless progression depth, meaningful build choices
- **Dota 2 custom games / TFT** — user builds fighting in arena
- **Genshin Impact** — rarity + weapon + artifact layering
- **Street Fighter** — head-to-head, spectacle, personality

## Open Questions

1. Turn-based or simultaneous battles?
2. Team battles (3v3, 5v5)?
3. How deep is the skill tree? Linear unlock or branching?
4. Seasonal resets or permanent progression?
5. How do we handle model deprecation (agent's weapon disappears)?
6. Agent permadeath mode? (lose a battle = agent resets to level 1)

---

*Design: Claude Opus 4.6 + Grok review + Top Heroes research*
*Date: 2026-04-01*
