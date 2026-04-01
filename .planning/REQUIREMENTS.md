# Requirements: Porter v4.0 — The Arena

**Defined:** 2026-04-01
**Core Value:** Porter is where builders bring their agents to fight. Build anywhere, battle here, prove your shit works.

## v4.0 Requirements

### Schema & Data Model

- [x] **SCH-01**: Agent templates have RPG fields: shell, intelligence, supports, equipment_slots, passive_tree, level, xp, star_level, rarity, elo_rating, specialties
- [x] **SCH-02**: New `agent_battles` table: battle_id, agent_a, agent_b, prompt, scores, winner, elo_delta, judge_results, created_at
- [x] **SCH-03**: New `agent_bonds` table: agent_a, agent_b, bond_level, co_dispatches
- [x] **SCH-04**: New `battle_replays` table: battle_id, agent_responses, judge_reasoning, sheet_diff
- [x] **SCH-05**: Agent skills junction table extended with success_rate_30d, total_uses, last_used
- [x] **SCH-06**: Supports system stored as JSONB with id, target_skill, prompt_diff, measured_impact
- [x] **SCH-07**: Passive tree stored as JSONB array of nodes with unlocked/active state and measured battle impact

### RPG Engine (Stat Calculation)

- [x] **RPG-01**: 5 core stats (QTY/SPD/EFF/REL/COMBO) derived from immutable bridge_dispatch_log
- [x] **RPG-02**: XP system: dispatch (+10), feedback (+25), specialty (+50), battle won (+100), battle lost (+25), chain (+75), failed (+2)
- [x] **RPG-03**: Level 1-100 with XP curve (level * 100)
- [x] **RPG-04**: Star progression: 1★ (forged) → 2★ (50) → 3★ (200+85%REL) → 4★ (500+10battles) → 5★ (1000+top)
- [x] **RPG-05**: Rarity auto-calculated: Common→Rare→Epic→Legendary→Mythic from usage milestones
- [x] **RPG-06**: Specialties auto-populated from dispatch + battle history
- [x] **RPG-07**: Stats recalculated from immutable logs on every progression event

### Vitals (Live Status)

- [ ] **VIT-01**: Tokens bar — remaining daily/session budget
- [ ] **VIT-02**: Health bar — error rate over last 10 dispatches
- [ ] **VIT-03**: Focus bar — context window pressure

### Character Sheet UI

- [ ] **UI-01**: Full character card: Shell, Intelligence, Skills, Supports, Equipment, Passive Tree, Vitals, Level, Stats, Rarity
- [ ] **UI-02**: Stat pentagon (5 stats) using recharts
- [ ] **UI-03**: Vitals as 3 color-coded bars with real-time updates
- [ ] **UI-04**: Rarity borders: gray/blue glow/purple pulse/gold animated/red particles
- [ ] **UI-05**: Star display (1-5★) with progress to next
- [ ] **UI-06**: Passive tree visual — compact node graph

### Skills & Supports

- [x] **SKL-01**: Active skills with live success rate from last 30 runs
- [x] **SKL-02**: Skill slots increase with level (4 base, +1 per star)
- [x] **SKL-03**: Supports as mechanical modifiers with exact prompt diff shown
- [x] **SKL-04**: Each Support shows measurable battle impact
- [x] **SKL-05**: Support slots on skills (1-2 per skill)

### Forge Unification

- [x] **FRG-01**: Skills + Tools + Forge merged into single "Forge" nav item
- [x] **FRG-02**: 4 tabs: Templates, Armory, Workshop, Arena
- [x] **FRG-03**: Templates tab — browse/create templates
- [x] **FRG-04**: Armory tab — tools, skills, supports inventory
- [x] **FRG-05**: Workshop tab — configure builds pre-forge
- [ ] **FRG-06**: Birth animation — grayscale to color with particles
- [x] **FRG-07**: Flow: template → configure → equip → passive nodes → forge → deploy

### Battle Arena

- [ ] **BTL-01**: Head-to-head: identical prompt, simultaneous response
- [ ] **BTL-02**: Blind judge ensemble: 3 models, position-randomized, median wins
- [ ] **BTL-03**: Scoring: quality 40%, speed 20%, efficiency 20%, style 20%
- [ ] **BTL-04**: Elo rating (1200 default, per-specialty, provisional below 30)
- [ ] **BTL-05**: Post-battle report as full sheet diff
- [ ] **BTL-06**: Fork & Mutate — one-click clone winner's build
- [ ] **BTL-07**: Matchmaking by Level + Intelligence profile
- [ ] **BTL-08**: Rate limits enforced (free: 5/day)
- [ ] **BTL-09**: Judge quality: 5% human spot-check, bias detection, 2-of-3 quorum

### Session Registry & Message Bus

- [ ] **SES-01**: Per-session token count, context %, age tracking
- [ ] **SES-02**: Context pressure detection at 80%
- [ ] **SES-03**: Session rotation with Recall summary carry
- [ ] **MSG-01**: Structured message envelope for inter-gateway communication
- [ ] **MSG-02**: Cross-model handoffs

### Intelligence Loop

- [ ] **INT-01**: Dispatch pattern extraction (latency trends, model strengths, failures)
- [ ] **INT-02**: Write patterns to Recall as concepts
- [ ] **INT-03**: Routing reads Recall for learned preferences
- [ ] **INT-04**: Intelligence surfaces on Bridge operator tab

### .md File Regeneration

- [x] **MD-01**: SOUL.md regenerated on star up
- [x] **MD-02**: IDENTITY.md grows on level milestones
- [x] **MD-03**: SKILLS.md reflects actual DB state
- [x] **MD-04**: TOOLS.md reflects equipped gear
- [x] **MD-05**: All .md files overwritten from DB on progression events

### Bridge Operator

- [ ] **BRG-01**: Vigil sees live session state
- [ ] **BRG-02**: Vigil sees message bus activity
- [ ] **BRG-03**: Vigil sees intelligence patterns
- [ ] **BRG-04**: Operator activity shows session + message + intelligence events

## Future (v4.1+)

- Spectator mode, tournaments, replay clips
- Agent import (LangGraph, CrewAI, AutoGen)
- Marketplace (templates, loadouts, 30% cut)
- Team battles, daily challenges, seasonal events

## Out of Scope

| Feature | Reason |
|---------|--------|
| 3D / Unreal | Pixel art + CSS + PixiJS sufficient |
| Static factions | Data-driven specialties replace them |
| Manual stat editing | Anti-gaming — derived from logs |
| Standalone game | Feature inside platform |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCH-01 | Phase 24 | Complete |
| SCH-02 | Phase 24 | Complete |
| SCH-03 | Phase 24 | Complete |
| SCH-04 | Phase 24 | Complete |
| SCH-05 | Phase 24 | Complete |
| SCH-06 | Phase 24 | Complete |
| SCH-07 | Phase 24 | Complete |
| RPG-01 | Phase 25 | Complete |
| RPG-02 | Phase 25 | Complete |
| RPG-03 | Phase 25 | Complete |
| RPG-04 | Phase 25 | Complete |
| RPG-05 | Phase 25 | Complete |
| RPG-06 | Phase 25 | Complete |
| RPG-07 | Phase 25 | Complete |
| MD-01 | Phase 25 | Complete |
| MD-02 | Phase 25 | Complete |
| MD-03 | Phase 25 | Complete |
| MD-04 | Phase 25 | Complete |
| MD-05 | Phase 25 | Complete |
| FRG-01 | Phase 26 | Complete |
| FRG-02 | Phase 26 | Complete |
| FRG-03 | Phase 26 | Complete |
| FRG-04 | Phase 26 | Complete |
| FRG-05 | Phase 26 | Complete |
| FRG-06 | Phase 26 | Pending |
| FRG-07 | Phase 26 | Complete |
| SKL-01 | Phase 26 | Complete |
| SKL-02 | Phase 26 | Complete |
| SKL-03 | Phase 26 | Complete |
| SKL-04 | Phase 26 | Complete |
| SKL-05 | Phase 26 | Complete |
| UI-01 | Phase 27 | Pending |
| UI-02 | Phase 27 | Pending |
| UI-03 | Phase 27 | Pending |
| UI-04 | Phase 27 | Pending |
| UI-05 | Phase 27 | Pending |
| UI-06 | Phase 27 | Pending |
| VIT-01 | Phase 27 | Pending |
| VIT-02 | Phase 27 | Pending |
| VIT-03 | Phase 27 | Pending |
| BTL-01 | Phase 28 | Pending |
| BTL-02 | Phase 28 | Pending |
| BTL-03 | Phase 28 | Pending |
| BTL-04 | Phase 28 | Pending |
| BTL-05 | Phase 28 | Pending |
| BTL-06 | Phase 28 | Pending |
| BTL-07 | Phase 28 | Pending |
| BTL-08 | Phase 28 | Pending |
| BTL-09 | Phase 28 | Pending |
| SES-01 | Phase 29 | Pending |
| SES-02 | Phase 29 | Pending |
| SES-03 | Phase 29 | Pending |
| MSG-01 | Phase 29 | Pending |
| MSG-02 | Phase 29 | Pending |
| INT-01 | Phase 30 | Pending |
| INT-02 | Phase 30 | Pending |
| INT-03 | Phase 30 | Pending |
| INT-04 | Phase 30 | Pending |
| BRG-01 | Phase 30 | Pending |
| BRG-02 | Phase 30 | Pending |
| BRG-03 | Phase 30 | Pending |
| BRG-04 | Phase 30 | Pending |

**Coverage:** 62/62 requirements mapped (100%)

---
*Requirements defined: 2026-04-01*
*Roadmap created: 2026-04-01*
*Design: research/agent-rpg-design-v3-final.md*
