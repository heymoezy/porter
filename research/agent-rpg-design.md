# Porter Agent RPG System — Design Document

## Concept

Redesign Porter's agent template system to work like video game RPG characters. Agents have stats calculated from real performance data, level up through usage, equip tools like gear, and can battle each other head-to-head.

## Core Stats (6 primary attributes, 0-100 scale)

| Stat | Name | AI Meaning | Calculated From |
|------|------|-----------|-----------------|
| ATK | Output Quality | How good are the responses | Task completion scores, human feedback, automated eval |
| DEF | Error Resilience | How well it handles failures | `100 - (failed_dispatches / total * 100)` |
| HP | Context Stamina | Usefulness deep into long sessions | Context window utilization efficiency |
| SPD | Response Speed | How fast it responds | Inverse of p95 latency |
| INT | Reasoning Depth | Performance on complex vs simple tasks | Complex task success rate delta |
| LCK | Token Efficiency | Output quality per token spent | Quality-to-token ratio |

## Skills System

- **Active Skills**: Tool invocations (code exec, web search, file edit). Have cooldowns.
- **Passive Skills**: Always-on behaviors (auto-recall, context awareness). Unlock at 3★.
- **Ultimate Skill**: Signature move unique to this agent. Unlocks at 4★.
- **Skill Slots**: Start at 4, increase with star level.

## Gear / Equipment (4 slots)

| Slot | AI Equivalent | Effect |
|------|--------------|--------|
| Weapon | Primary model backend (claude-opus, gpt-5.4, etc.) | Determines base ATK + INT |
| Armor | System prompt hardening (guardrails, boundaries) | Determines DEF |
| Accessory 1 | Primary tool (code execution, etc.) | +stat bonuses |
| Accessory 2 | Secondary tool (web search, etc.) | +stat bonuses |
| Set Bonus | All slots filled | +10 all stats |

## Rarity (auto-calculated, not editable)

| Rarity | Color | Criteria |
|--------|-------|----------|
| Common | Gray | Fresh template, never forged |
| Rare | Blue | Forged with customized soul + identity |
| Epic | Purple | 50+ dispatches, has Recall concepts |
| Legendary | Gold | 500+ dispatches, top 10% success rate |
| Mythic | Red | 5000+ dispatches, custom-trained behavior |

## Star System (1-5★)

| Stars | Requirement | Unlock |
|-------|-------------|--------|
| ★ | Agent forged (born) | Base stats active |
| ★★ | 50 dispatches | +1 skill slot |
| ★★★ | 200 dispatches + 90% success | Passive skill unlocked |
| ★★★★ | 500 dispatches + 10 Recall concepts | Ultimate skill unlocked |
| ★★★★★ | 1000 dispatches + top performer | Awakening eligible |

## XP / Leveling

| Source | XP |
|--------|-----|
| Dispatch completed | +10 |
| Positive feedback | +25 |
| New Recall concept learned | +50 |
| Battle won | +100 |
| Failed dispatch | +2 |

Level 1-100. XP needed: `level * 100`.

## Character Classes

| Class | RPG Equivalent | AI Specialization |
|-------|---------------|-------------------|
| Guardian | Tank | Error handling, retry, resilience |
| Striker | DPS | Fast, high-output throughput |
| Fixer | Healer | Debugging, error correction, code review |
| Amplifier | Support | Research, context gathering, prep work |
| Orchestrator | Controller | Routing, delegation, task decomposition |

## Factions (rock-paper-scissors)

- **Code** > Logic > Language > Code
- Code specialists get +20% on code tasks
- Language specialists get +20% on content tasks
- Logic specialists get +20% on analysis tasks

## Battle Arena (Street Fighter Mode)

Same prompt → both agents respond → blind judge scores:
- Output quality (40%)
- Speed (20%)
- Token efficiency (20%)
- Style points (20%)

Elo rating system (default 1200). Winner +100 XP, loser +25 XP.

## Bonds / Synergies

Agents that co-dispatch build bonds:
- Acquaintance (10 co-dispatches): Shared Recall
- Partner (50): +5% stats when paired
- Bonded (200): Unique combo skill

## .md File System (DERIVED, not source-of-truth)

Files are generated from DB state, not manually edited:
- SOUL.md — regenerated at each star level
- IDENTITY.md — grows with level progression
- ROLE_CARD.md — class-locked at birth
- SKILLS.md — reflects actual skill state from DB
- TOOLS.md — reflects equipped gear from DB
- HEARTBEAT.md — pulse cycle for persistent agents

Anti-gaming: stats recalculated from immutable dispatch_log. .md files overwritten on every dispatch. No self-rating. Battle judging is blind third-party.

## Visual Stack

- React + Tailwind (existing)
- SVG radar charts for stats
- CSS animations for level-ups
- PixiJS for battle arena (later)
- Pixel portraits with rarity-colored borders

## Open Questions

1. Should stats be template-level or instance-level? (Template = base stats, Instance = actual stats?)
2. How does gear swapping work UX-wise? Drag-and-drop?
3. Should there be a marketplace where users trade/share agent configurations?
4. How do we handle agents that use multiple models? (weapon = primary, but they can switch mid-task)
5. What's the awakening system after 5★?
6. Should factions be tied to the model backend or the agent's specialization?
7. How does this work for one-shot agents that don't persist? Do they still earn XP?
8. Battle Arena: should it be real-time (both respond simultaneously) or turn-based?
9. How do we prevent the meta from becoming "everyone uses the same optimal build"?
10. What happens when a model backend gets deprecated? Does the agent lose stats?
