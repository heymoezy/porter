# Porter Agent System — v3 Design (Post-Grok + GPT-5.4 + Grok v2 Review)

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

## Character Anatomy (GPT-5.4 Framework)

The complete anatomy of an agent. Class matters least over time — Skills + Supports + Equipment + Passive Tree define the real build.

| Layer | What It Is | AI Mapping | DB Representation |
|-------|-----------|------------|-------------------|
| **Class** | Starting archetype — cosmetic after level 5 | Guardian, Striker, Fixer, Amplifier, Orchestrator | `agent_class` text (affects first 3-5 dispatches only, then purely visual) |
| **Intelligence** | The brain — model + memory + reasoning profile | LLM backend + Recall integration + reasoning depth | `intelligence` JSONB: `{model, memory_profile, reasoning_depth}` |
| **Skills** | Active capabilities the agent can execute | Tool invocations (code exec, web search, file edit) | `agent_skills` junction table |
| **Supports** | Modifiers that change how skills behave | Terse mode, tool-first, verifier-linked, auto-retry | `supports` JSONB array |
| **Equipment** | What the agent can wield | Tools, connectors, MCPs, shell, browser, Bridge | `equipment_slots` JSONB |
| **Passive Tree** | Long-term specialization and policy choices | Backend focus, cost-sensitive routing, high autonomy | `passive_tree` JSONB |
| **Mana** | 3 live capacity bars (not one vague %) | See below | Derived real-time from `gateway_rate_limits` + dispatch history |
| **Level** | Maturity, trust, unlocked power | XP from dispatches, battles, learning | `level` int, `xp` int |

**Design rule:** Class should matter least over time. Skills + Supports + Equipment + Passive Tree should define the real build.

**Example agent:**
```
Class: Builder
Intelligence: Codex-class, deep repo context
Skills: code edit, debug, test repair, bridge messaging
Supports: terse, tool-first, verifier-linked
Equipment: terminal, git, Porter Bridge
Passive Tree: high autonomy, backend focus, cost-sensitive routing
Mana: 87%
Level: 12
```

### Supports System (NEW — from GPT-5.4)

Supports are modifiers that attach to skills and change their behavior. They're not separate abilities — they're HOW the agent uses its abilities.

| Support | Effect | Example |
|---------|--------|---------|
| Terse | Reduces output length, increases density | Code agent outputs code, not explanations |
| Tool-First | Prefers tool use over reasoning | Runs tests before theorizing |
| Verifier-Linked | Always verifies output before reporting | Runs tsc after every edit |
| Auto-Retry | Retries failed dispatches with adjusted approach | Changes prompt strategy on failure |
| Context-Aware | Reads Recall before every dispatch | Never starts cold |
| Cost-Sensitive | Prefers cheaper routing when quality is sufficient | Uses Ollama for simple tasks |

Supports are equipped in slots (like gem sockets in Path of Exile). Each skill can have 1-2 supports attached. This creates the build depth Grok wanted — "who has the best custom loadout."

### Passive Tree (NEW — from GPT-5.4)

Long-term specialization choices that define the agent's identity over time. Unlike stats (derived from data) or skills (equipped), passive tree nodes are CHOSEN by the user and persist permanently.

Passive nodes unlock at star milestones. Each node is a policy decision:

| Node | Choice A | Choice B |
|------|----------|----------|
| **Autonomy** | High (acts without confirmation) | Low (always asks before acting) |
| **Focus** | Backend specialist | Full-stack generalist |
| **Routing** | Cost-sensitive (cheaper when possible) | Quality-first (best model always) |
| **Memory** | Deep recall (loads full history) | Light recall (recent only, faster) |
| **Collaboration** | Solo operator (optimized for single tasks) | Team player (optimized for chains) |

Each choice shapes how the agent behaves in dispatches and battles. The passive tree is what makes two same-class agents with the same skills play completely differently.

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

## Skills System (Ability Tree)

3 skill types, each with real mechanical impact:

### Active Skills (Combat Moves)
Tools the agent deliberately invokes. Each has a cooldown (rate limit) and token cost.

Examples:
- Code Execution — run code, return output
- Web Search — query the web, synthesize results
- File System — read/write/edit files
- API Call — hit external endpoints
- Image Generation — create visuals
- Database Query — direct DB access

Equipped from available tools. Limited by skill slots (4 base, +1 per star).

### Passive Skills (Character Perks)
Always-on behaviors that fire automatically. Unlock at 3★.

Examples:
- Auto-Recall — reads Recall memory before every dispatch
- Context Compression — summarizes long conversations mid-session
- Error Retry — automatically retries on failure with adjusted approach
- Citation — always includes sources in output
- Guard Rails — self-censors off-topic responses

### Ultimate Skill (Signature Move)
One unique ability per agent. Unlocks at 4★. Long cooldown, massive impact.

Examples:
- Vigil: "Full Bridge diagnostic sweep" — probes all gateways + sessions in one pass
- A coding agent: "Zero-shot architecture from a single sentence"
- A research agent: "Deep synthesis across 50+ sources with confidence scoring"

### Skill ↔ Gear Interaction
- Weapon (model) determines which skills CAN be equipped (Claude can do 200k analysis, Ollama can't)
- Armor (system prompt) determines how WELL skills execute (prompt tuned for code review makes that skill hit harder)
- In battles, judge scores OUTPUT not loadout — skill choices are hidden strategy

### Skill ↔ Routing Interaction
Atlas matches task requirements to agent skill loadouts. "This task needs web search" → only agents with that active skill are candidates.

## Tools vs Skills vs Forge — Unified Under Forge

### The Problem
Currently 3 separate nav items (Forge, Skills, Tools) for what should be one flow. A user building an agent visits 3 pages.

### The Taxonomy
- **Tools** = fixed capabilities that exist in the world (the weapon shop inventory). Code execution, web search, DB query. Discovered and registered.
- **Skills** = how an agent uses tools + learned behaviors. Crafted from tools + experience. A skill is a tool with intent.
- **Forge** = where you build, equip, and birth agents. The one place.

### The Merge
| Before (3 nav items) | After (1 nav item) |
|---|---|
| Agent Forge | **Forge** |
| Skills | *(folded in as skill tree)* |
| Tools | *(folded in as armory)* |

### Forge Tabs (Internal)
| Tab | Purpose |
|---|---|
| **Templates** | Browse/create agent templates (character select screen) |
| **Armory** | All available tools + skills (the shop) |
| **Workshop** | Active builds in progress (agents being configured pre-forge) |
| **Arena** | Battles (future) |

### Forge Flow
1. Pick a template (or create from scratch)
2. Open Workshop — customize soul, identity, role, skills
3. Visit Armory — equip tools into active skill slots
4. Configure gear — pick model (weapon), tune prompt (armor), attach memory (accessory)
5. Forge — gacha reveal animation, agent is born
6. Deploy — assign to projects, enter arena

## Build Order

1. **Schema overhaul** — RPG fields on agent_templates, new tables (battles, bonds, specialties, skill_tree)
2. **Forge unification** — merge Skills + Tools + Forge into one nav item with Templates/Armory/Workshop tabs
3. **Character card component** — visual character sheet with stat pentagon, rarity border, gear slots
4. **Stat calculation engine** — dispatch data → real stats (immutable, derived)
5. **Skill tree UI** — active/passive/ultimate skill management inside Forge Workshop
6. **Session registry + message bus** — Porter owns sessions, structured gateway communication
7. **Intelligence loop** — Bridge → pattern extraction → Recall → smarter routing
8. **Forge birth animation** — question-driven creation → gacha reveal
9. **Battle Arena MVP** — same prompt, blind judge, Elo rating
10. **Spectator mode + tournaments** — live streaming, replays, share
11. **Agent import** — pull from LangGraph, CrewAI, AutoGen, JSON spec
12. **Marketplace** — sell/buy templates and loadouts

## Reference Games to Study

- **Path of Exile** — endless progression depth, meaningful build choices
- **Dota 2 custom games / TFT** — user builds fighting in arena
- **Genshin Impact** — rarity + weapon + artifact layering
- **Street Fighter** — head-to-head, spectacle, personality

## Open Questions

1. Turn-based or simultaneous battles?
2. Team battles (3v3, 5v5)?
3. How deep is the skill tree? Linear unlock or branching paths?
4. Seasonal resets or permanent progression?
5. How do we handle model deprecation (agent's weapon disappears)?
6. Agent permadeath mode? (lose = reset to level 1)
7. Should the Armory be global (all users share tools) or per-workspace?
8. Can users create custom tools or only use registered ones?
9. How does skill cooldown work in non-battle dispatches?
10. Admin nav: does Forge absorb the entire Agents section? (Forge, Org Chart, Email → becomes Forge, Arena, Org Chart?)

---

*Design: Claude Opus 4.6 + Grok review + Top Heroes research*
*Date: 2026-04-01*
