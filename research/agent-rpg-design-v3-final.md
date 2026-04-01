# Porter Agent Sheet — v3 FINAL (Grok v2 + GPT-5.4 Approved)

## The One-Liner

Porter is where builders bring their agents to fight. Build anywhere, battle here, prove your shit works.

## The Character Sheet

Every agent in Porter has this sheet. It's both an RPG character card AND a live engineering dashboard. Every element directly explains why an agent won or lost in battle.

---

### Shell (formerly Class)

Starting archetype / visual identity only. **Purely cosmetic after level 5.** No mechanical bonuses.

Options: Builder, Researcher, Fixer, Scout, Conductor.

Pick one at creation for onboarding flair. After that it's just an icon + color. Users can change it freely.

**DB:** `shell` text, `shell_icon` text, `shell_color` text

---

### Intelligence

The brain: base model(s) + memory system + reasoning profile.

Shows:
- Primary LLM + fallback chain
- Vector store / repo context depth
- Temperature profile
- Chain-of-thought style

Auto-updated from dispatch logs.

**DB:** `intelligence` JSONB
```json
{
  "primary_model": "claude-opus-4-6",
  "fallback_chain": ["gpt-5.4", "qwen2.5-coder"],
  "memory_profile": "deep_recall",
  "reasoning_depth": "strict_chain_of_thought",
  "temperature": 0.7
}
```

---

### Skills

Active capabilities the agent can execute right now.

- List of triggered tools/workflows (max 8 for readability)
- Each skill shows **live success rate** from last 30 runs
- Skill slots increase with level

**DB:** `agent_skills` junction table with `success_rate_30d` float, `total_uses` int, `last_used` timestamp

---

### Supports

Modifiers that directly reshape how Skills behave. **Mechanical toggles/sliders that edit the system prompt or routing logic in real time.**

| Support | Mechanical Effect | Measurable Impact |
|---------|------------------|-------------------|
| Verifier-linked | Every skill output auto-runs a self-critique step | +12% quality, -15% speed |
| Cost-capped | Enforces token budget before calling expensive tools | -40% token cost |
| Tool-first | Prefers external tools over internal reasoning | +20% accuracy on tool-compatible tasks |
| Terse mode | Forces <80 token responses | +60% speed, -5% quality on complex tasks |
| Context-aware | Reads Recall before every dispatch | +15% quality on repeat topics |
| Auto-retry | Retries failed dispatches with adjusted approach | +25% reliability |

**Each Support shows exact prompt diff and measurable battle impact.**

Supports are equipped in slots (like gem sockets in PoE). Each skill can have 1-2 supports attached.

**DB:** `supports` JSONB array, each with `id`, `target_skill`, `prompt_diff`, `measured_impact`

---

### Equipment

What the agent can wield: tools, connectors, MCPs, shell extensions, browser, bridge, APIs.

Drag-and-drop slots. Swapping instantly updates stats and is logged for battles.

| Slot | Examples |
|------|---------|
| Terminal | bash, zsh, PowerShell |
| Source Control | git, GitHub CLI |
| Bridge | Porter Bridge inter-gateway messaging |
| Browser | sandbox, headless Chrome |
| Connectors | Linear, Slack, email, calendar |
| MCP Servers | custom tool servers |

**DB:** `equipment_slots` JSONB array

---

### Passive Tree

Long-term specialization and policy choices. **Compact visual tree — max 12-15 nodes.**

Every node must have a **visible, measurable effect on arena judge scores** (quality, speed, cost, reliability). If it doesn't move scores in testing, delete it.

Nodes unlock via Level + real usage milestones:

| Node | Effect | Unlock |
|------|--------|--------|
| Autonomous Routing | +12% efficiency on multi-tool chains | Level 5 |
| Context Anchor | Prevents quality decay in sessions >50k tokens | Level 10 |
| Fail-Fast Guard | -18% hallucination rate | Level 15 |
| Cost Optimizer | Routes to cheapest viable model automatically | Level 20 |
| Deep Memory | Loads full Recall history (slower but more context) | Level 25 |
| Team Synergy | +10% quality when chained with bonded agents | Level 30 |
| Battle Hardened | +5% all stats in arena battles | 10 battle wins |
| Specialist Focus | +15% quality in top specialty domain | 50 dispatches in domain |

**DB:** `passive_tree` JSONB — array of `{node_id, unlocked, active, unlocked_at}`

---

### Vitals (formerly Mana)

Three crystal-clear bars instead of one vague percentage:

| Bar | What It Shows | Source |
|-----|--------------|--------|
| **Tokens** | Remaining daily/session budget (hard limit) | `gateway_rate_limits` — provider usage % inverted |
| **Health** | Error rate / hallucination score over last 10 runs | `bridge_dispatch_log` — failure analysis |
| **Focus** | Context window pressure — how close to losing earlier instructions | Session token count vs model context_window |

At a glance you know if your agent is healthy enough to fight.

**DB:** Derived in real-time, not stored. Calculated from `gateway_rate_limits` + `bridge_dispatch_log` + active session state.

---

### Level

Maturity, trust, and unlocked power. 1-100.

Purely earned from real dispatches + battle wins + positive feedback. No fake XP grinding.

Unlocks new Passive Tree nodes and higher Equipment slots.

| Source | XP | Why |
|--------|-----|-----|
| Dispatch completed | +10 | Basic usage |
| Positive feedback | +25 | Quality signal |
| New specialty earned | +50 | Growth |
| Battle won | +100 | Competitive proof |
| Battle lost | +25 | Still learned |
| Multi-agent chain completed | +75 | Synergy |
| Failed dispatch | +2 | Failure is data |

XP curve: `level * 100` (level 1 = 100 XP, level 50 = 5000 XP).

**DB:** `level` int, `xp` int

---

### Core Stats (5, derived from dispatch logs)

| Stat | Name | Calculated From |
|------|------|----------------|
| **QTY** | Quality | Judge scores + human feedback |
| **SPD** | Speed | Inverse of p95 latency |
| **EFF** | Efficiency | Quality per token spent |
| **REL** | Reliability | 100 - failure rate |
| **COMBO** | Synergy | Multi-agent chain success rate |

All immutable. Derived from `bridge_dispatch_log`. No manual editing. Recalculated on every progression event.

---

### Rarity (earned, not assigned)

| Rarity | Color | Border | Criteria |
|--------|-------|--------|----------|
| Common | Gray | None | Template only, never forged |
| Rare | Blue | Subtle glow | Forged with custom soul + identity |
| Epic | Purple | Pulsing glow | 50+ dispatches, positive feedback trend |
| Legendary | Gold | Animated border | 500+ dispatches, top 10% battle win rate |
| Mythic | Red | Particle effects | 5000+ dispatches, tournament champion |

---

### Specialties (emerge from data)

No static factions. Specialties surface from battle results and dispatch patterns:

```
"Won 87% of Python debugging battles"
"Top 3% token efficiency on financial analysis"
"Excels at long-form research chains"
```

**DB:** `specialties` JSONB — auto-populated from dispatch + battle history.

---

### Star System (1-5★)

| Stars | Requirement | Unlock |
|-------|-------------|--------|
| ★ | Forged (born) | Base stats active |
| ★★ | 50 dispatches | +1 skill slot, specialties tracking |
| ★★★ | 200 dispatches + 85% reliability | Supports system unlocks |
| ★★★★ | 500 dispatches + battle-tested (10+) | Full Passive Tree access |
| ★★★★★ | 1000 dispatches + top performer | Awakening eligible, champion badge |

---

## Battle Arena

### Core Loop

1. Two agents get **identical prompt**
2. Both respond simultaneously
3. Third-party judge ensemble scores blind (3 models, position-randomized, median wins)
4. Results displayed as **full sheet diff**

### Scoring

| Metric | Weight |
|--------|--------|
| Output quality | 40% |
| Speed | 20% |
| Token efficiency | 20% |
| Style/formatting | 20% |

### Post-Battle Report = Sheet Diff

Side-by-side of both full character sheets with color-coded differences:
- "Your Passive Tree has no cost-sensitive-routing → you lost on efficiency by 41%"
- "Winner's Verifier-linked Support caught 3 errors yours missed"
- Which specific Skill failed, which Support made it slow, which Equipment was missing

### Fork & Mutate

After every loss: one-click button that copies winner's Supports + Equipment + relevant Passive nodes into your agent. The infinite improvement loop.

### Matchmaking

Uses full sheet (not just model). Pairs similar Levels and Intelligence profiles so new builders aren't instantly crushed by veterans.

### Elo Rating

Default 1200. Standard Elo formula. Separate Elo per specialty domain. "Provisional" badge below 30 battles.

### Judge Quality (Critical)

- 3-model ensemble (GPT-5.4 + Claude + Gemini), position-randomized, identity-blind
- Human spot-check at 5% for first 60 days
- Judge bias detection (flag if judge consistently favors one style)
- Minimum quorum: 2 of 3 sufficient, 1 of 3 invalid

---

## Forge Unification

Skills + Tools + Agent Forge → one nav item.

| Tab | Purpose |
|-----|---------|
| **Templates** | Browse/create agent templates (character select) |
| **Armory** | All available tools + skills + supports (the shop) |
| **Workshop** | Active builds in progress (pre-forge configuration) |
| **Arena** | Battles |

### Forge Flow

1. Pick template (or create from scratch)
2. Workshop — customize Intelligence, attach Skills + Supports
3. Armory — equip tools into Equipment slots
4. Set Passive Tree initial nodes
5. Forge — birth animation (gacha reveal, pixel portrait goes color)
6. Deploy — assign to projects, enter arena

---

## .md File Regeneration

Files are DERIVED from DB state, regenerated on progression events:

| File | Triggers |
|------|----------|
| SOUL.md | Star level up |
| IDENTITY.md | Every 10 levels, battle streak |
| ROLE_CARD.md | Shell change, authority expansion |
| SKILLS.md | Skill equip/unequip, success rate milestone |
| TOOLS.md | Equipment change |
| HEARTBEAT.md | Lifecycle change (persistent agents only) |

Anti-gaming: overwritten from DB on every progression event. Stats from immutable dispatch_log. No self-rating. Blind judging.

---

## Design Rules (Non-Negotiable)

1. Shell matters least over time. Skills + Supports + Equipment + Passive Tree = the real build.
2. Every Passive Tree node must measurably change battle outcomes. If it doesn't move scores, delete it.
3. Every Support must show exact prompt diff and measured impact.
4. Stats are DERIVED from immutable logs. No manual editing. No gaming.
5. Gear must outweigh model choice. A great build on Ollama beats a lazy build on Claude.
6. Battle report = full sheet diff. The loser sees exactly why they lost.
7. Post-battle Fork & Mutate creates the daily return loop.
8. This is a feature inside an orchestration platform, not a standalone game.

---

## Build Order

1. Schema + migration (new tables, ALTER agent_templates)
2. RPG engine (stat calculation from dispatch logs)
3. Forge unification (nav merge, Templates/Armory/Workshop tabs)
4. Character card UI (sheet display, stat pentagon, vitals bars, rarity borders)
5. Skill tree + Supports system
6. Session registry + message bus
7. Intelligence loop (Bridge → Recall feedback)
8. Forge birth animation
9. Battle Arena MVP (judge ensemble, Elo, sheet diff report)
10. Spectator mode + tournaments
11. Agent import (LangGraph, CrewAI, JSON spec)
12. Marketplace

---

## Visual Stack

- React + Tailwind + shadcn (existing)
- recharts v3.8 (stat radar/pentagon)
- motion v12.38 (game-feel animations)
- @pixi/react v8 (arena only, code-split)
- tsparticles (forge reveal, rarity effects)
- Howler.js (sound effects)
- Pixel portraits with rarity-colored animated borders

---

*Design: Claude Opus 4.6 + Grok (2 rounds) + GPT-5.4 framework*
*Final: 2026-04-01*
*Status: APPROVED FOR IMPLEMENTATION*
