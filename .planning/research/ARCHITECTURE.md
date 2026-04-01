# Architecture Research

**Domain:** Porter v4.0 — Agent RPG System + Battle Arena
**Researched:** 2026-03-29
**Confidence:** HIGH (all findings from direct source-code inspection of backend/src/)

---

## System Overview

The RPG system layers on top of the existing Porter architecture without breaking it. Every new
table, service, and route is additive. The dispatch log (`bridge_dispatch_log`) is the single
immutable source of truth: stats are always derived from it, never hand-entered.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          API Layer  (:3001)                                      │
│                                                                                  │
│  Existing                          New v4.0                                      │
│  ┌──────────────┐  ┌────────────┐  ┌────────────┐  ┌─────────────┐  ┌─────────┐ │
│  │/api/v1/chat  │  │/api/v1/    │  │/api/v1/    │  │/api/v1/     │  │/api/v1/ │ │
│  │/api/v1/agent │  │templates   │  │rpg/*       │  │battles/*    │  │sessions │ │
│  │/api/bridge/* │  │/admin/forge│  │            │  │             │  │         │ │
│  └──────┬───────┘  └─────┬──────┘  └─────┬──────┘  └──────┬──────┘  └────┬────┘ │
└─────────┼────────────────┼───────────────┼────────────────┼───────────────┼──────┘
          │                │               │                │               │
┌─────────┼────────────────┼───────────────┼────────────────┼───────────────┼──────┐
│         │      SERVICE LAYER             │                │               │      │
│         │                │               ▼                ▼               ▼      │
│         │          ┌─────┴──────┐  ┌──────────────┐  ┌──────────────┐           │
│         │          │ forge.ts   │  │ rpg-engine   │  │battle-       │           │
│         │          │ (MODIFIED) │  │ .ts (NEW)    │  │ orchestrator │           │
│         │          └─────┬──────┘  └──────┬───────┘  │ .ts (NEW)   │           │
│         │                │                │          └──────┬───────┘           │
│         │                │                │                 │                   │
│  ┌──────▼────────────────▼────────────────▼─────────────────▼────────────────┐  │
│  │                    routing-engine.ts (EXISTING — unchanged)                │  │
│  │              Handles dispatch, logging, circuit-breakers, fallback         │  │
│  └─────────────────────────────────┬──────────────────────────────────────────┘  │
└────────────────────────────────────┼───────────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────────────┐
│                      DATA LAYER (PostgreSQL 16)                                  │
│                                                                                  │
│  Existing (immutable)              New v4.0 tables                               │
│  ┌────────────────┐  ┌────────┐   ┌───────────────┐  ┌──────────┐  ┌─────────┐  │
│  │bridge_dispatch │  │agent_  │   │agent_rpg_stats│  │battles   │  │battle_  │  │
│  │_log            │  │templ-  │   │(derived cache)│  │          │  │rounds   │  │
│  │(read-only for  │  │ates    │   │               │  │          │  │         │  │
│  │ stat engine)   │  │(ALTER) │   └───────────────┘  └──────────┘  └─────────┘  │
│  └────────────────┘  └────────┘   ┌───────────────┐  ┌──────────┐  ┌─────────┐  │
│  ┌────────────────┐               │agent_bonds     │  │battle_   │  │session_ │  │
│  │personas        │               │               │  │judgments │  │registry │  │
│  │(ALTER)         │               └───────────────┘  └──────────┘  └─────────┘  │
│  └────────────────┘               ┌───────────────┐  ┌──────────┐               │
│                                   │intelligence_  │  │msg_bus_  │               │
│                                   │patterns       │  │events    │               │
│                                   └───────────────┘  └──────────┘               │
└──────────────────────────────────────────────────────────────────────────────────┘
                                     │
                              SSE broadcasts
                         (existing sse-hub.ts)
```

---

## Component Boundaries

### Existing Components — Modified

| Component | Current Role | Change for v4.0 |
|-----------|-------------|-----------------|
| `backend/src/db/schema.ts` | Drizzle schema, all tables | ADD: 6 new table definitions |
| `backend/src/db/migrate-*.ts` | Migration pattern | ADD: `migrate-rpg-v1.ts` (new migration file) |
| `agent_templates` table | 92 rows, template metadata | ALTER: add RPG columns (rarity, stars, xp, level, class, gear slots, elo) |
| `personas` table | Active agent instances | ALTER: add `rpg_stats_id` FK, `agent_template_id` back-ref |
| `backend/src/services/forge.ts` | 3-station assembly line | EXTEND: add birth event that triggers initial stat calculation; emit `rpg:born` SSE |
| `backend/src/routes/v1/admin/forge.ts` | Admin forge CRUD | EXTEND: expose new Forge tabs (Templates/Armory/Workshop) unified under single nav |
| `backend/src/services/sse-hub.ts` | Broadcast events | EXTEND: new event namespaces `rpg:*`, `battle:*`, `session:*` |

### New Components — Created

| Component | Location | Purpose |
|-----------|----------|---------|
| `rpg-engine.ts` | `backend/src/services/rpg-engine.ts` | Stat calculation from dispatch_log; XP+level math; rarity thresholds; .md file regeneration triggers |
| `battle-orchestrator.ts` | `backend/src/services/battle-orchestrator.ts` | Parallel dispatch to 2 agents with same prompt; judge dispatch; Elo update; result recording |
| `session-registry.ts` | `backend/src/services/session-registry.ts` | Porter-owned session tracking with per-session token/context window accounting |
| `msg-bus.ts` | `backend/src/services/msg-bus.ts` | Structured inter-gateway envelope store; extends existing AgentMessage type |
| `intelligence-loop.ts` | `backend/src/services/intelligence-loop.ts` | Reads dispatch patterns from bridge_dispatch_log; extracts routing concepts; writes to concepts table |
| `/api/v1/rpg.ts` | `backend/src/routes/v1/rpg.ts` | Agent stat reads, leaderboard, rarity/class queries |
| `/api/v1/battles.ts` | `backend/src/routes/v1/battles.ts` | Battle CRUD: start, status, replay, leaderboard |
| `/api/v1/sessions.ts` | `backend/src/routes/v1/sessions.ts` | Session registry CRUD; token accounting per session |
| `migrate-rpg-v1.ts` | `backend/src/db/migrate-rpg-v1.ts` | DDL for all 6 new tables + ALTER existing |

---

## New Database Tables

### 1. `agent_rpg_stats` — Derived stat cache

```sql
CREATE TABLE agent_rpg_stats (
  id              TEXT PRIMARY KEY,
  template_id     TEXT NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
  -- 5 core stats, 0-100
  quality         DOUBLE PRECISION DEFAULT 0,
  speed           DOUBLE PRECISION DEFAULT 0,
  efficiency      DOUBLE PRECISION DEFAULT 0,
  reliability     DOUBLE PRECISION DEFAULT 0,
  combo           DOUBLE PRECISION DEFAULT 0,
  -- progression
  xp              INTEGER DEFAULT 0,
  level           INTEGER DEFAULT 1,
  stars           INTEGER DEFAULT 1,        -- 1-5
  rarity          TEXT DEFAULT 'common',    -- common|rare|epic|legendary|mythic
  agent_class     TEXT DEFAULT 'striker',   -- striker|guardian|fixer|amplifier|orchestrator
  elo             INTEGER DEFAULT 1200,
  -- gear slots (FKs to skills/tools tables)
  weapon_model    TEXT,                     -- FK to models.id
  armor_prompt_id TEXT,                     -- FK to agent_templates.id or custom text
  accessory1_tool TEXT,                     -- FK to tools.id
  accessory2_tool TEXT,                     -- FK to tools.id
  set_bonus_active INTEGER DEFAULT 0,
  -- computed metadata
  specialties     JSONB DEFAULT '[]',       -- [{domain, win_rate, battles}]
  dispatch_count  INTEGER DEFAULT 0,
  battle_count    INTEGER DEFAULT 0,
  last_computed   DOUBLE PRECISION,
  created_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
);
```

**Relationship:** `agent_templates.id` 1:1 `agent_rpg_stats.template_id`

This is a derived cache, not the source of truth. It is always recomputable from
`bridge_dispatch_log` + `battles` + `battle_judgments`. The `rpg-engine.ts` service owns
writes to this table. Routes only read it.

### 2. `battles` — Battle records

```sql
CREATE TABLE battles (
  id              TEXT PRIMARY KEY,
  challenger_id   TEXT NOT NULL,            -- agent_templates.id
  defender_id     TEXT NOT NULL,            -- agent_templates.id
  prompt          TEXT NOT NULL,
  domain          TEXT DEFAULT 'general',   -- specialty domain tag
  status          TEXT DEFAULT 'pending',   -- pending|running|judging|complete|failed
  winner_id       TEXT,                     -- agent_templates.id or null for draw
  judge_model     TEXT,                     -- which model judged
  judge_scores    JSONB DEFAULT '{}',       -- {quality:0-10, speed:0-10, efficiency:0-10, style:0-10}
  challenger_elo_before INTEGER,
  defender_elo_before   INTEGER,
  challenger_elo_after  INTEGER,
  defender_elo_after    INTEGER,
  challenger_dispatch_id TEXT,              -- bridge_dispatch_log.id
  defender_dispatch_id   TEXT,             -- bridge_dispatch_log.id
  judge_dispatch_id      TEXT,             -- bridge_dispatch_log.id for the judge call
  initiated_by    TEXT,                     -- username
  spectators      JSONB DEFAULT '[]',
  replay_data     JSONB DEFAULT '{}',
  created_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
  completed_at    DOUBLE PRECISION
);
```

### 3. `battle_rounds` — Per-round detail for turn-based battles

```sql
CREATE TABLE battle_rounds (
  id              TEXT PRIMARY KEY,
  battle_id       TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  round_num       INTEGER NOT NULL,
  challenger_response TEXT,
  defender_response   TEXT,
  challenger_tokens   INTEGER,
  defender_tokens     INTEGER,
  challenger_latency_ms INTEGER,
  defender_latency_ms   INTEGER,
  round_winner    TEXT,                     -- 'challenger'|'defender'|'draw'
  created_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
);
```

### 4. `battle_judgments` — Judge scoring detail

```sql
CREATE TABLE battle_judgments (
  id              TEXT PRIMARY KEY,
  battle_id       TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  judge_model     TEXT NOT NULL,
  quality_score   DOUBLE PRECISION,         -- 1-10
  speed_score     DOUBLE PRECISION,
  efficiency_score DOUBLE PRECISION,
  style_score     DOUBLE PRECISION,
  rationale       TEXT,
  verdict         TEXT,                     -- 'challenger'|'defender'|'draw'
  confidence      DOUBLE PRECISION,
  raw_response    TEXT,
  created_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
);
```

### 5. `agent_bonds` — COMBO stat: agent pair affinity tracking

```sql
CREATE TABLE agent_bonds (
  id              TEXT PRIMARY KEY,
  agent_a_id      TEXT NOT NULL,            -- agent_templates.id
  agent_b_id      TEXT NOT NULL,            -- agent_templates.id
  chain_count     INTEGER DEFAULT 0,        -- times worked in same multi-agent workflow
  success_count   INTEGER DEFAULT 0,
  combo_score     DOUBLE PRECISION DEFAULT 0,
  last_chained    DOUBLE PRECISION,
  created_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
  UNIQUE (agent_a_id, agent_b_id)
);
```

**Used by:** `rpg-engine.ts` to derive the COMBO stat; queries `bridge_dispatch_log` for
rows with both agents present in the same `correlation_id`.

### 6. `session_registry` — Porter-owned session tracking

```sql
CREATE TABLE session_registry (
  id              TEXT PRIMARY KEY,
  chat_id         TEXT,                     -- FK to chats.id if applicable
  agent_id        TEXT,                     -- which agent owns this session
  username        TEXT,
  gateway_type    TEXT,
  model_name      TEXT,
  token_budget    INTEGER DEFAULT 0,
  tokens_used     INTEGER DEFAULT 0,
  context_msgs    INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'active',    -- active|expired|closed
  metadata        JSONB DEFAULT '{}',
  created_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
  last_active_at  DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
  closed_at       DOUBLE PRECISION
);
```

### 7. `msg_bus_events` — Structured inter-gateway message log

```sql
CREATE TABLE msg_bus_events (
  id              TEXT PRIMARY KEY,
  correlation_id  TEXT,
  source_agent    TEXT,
  source_gateway  TEXT,
  target_agent    TEXT,
  target_gateway  TEXT,
  intent          TEXT,                     -- request|response|ack|error
  payload         JSONB DEFAULT '{}',
  response_payload JSONB,
  hop_count       INTEGER DEFAULT 0,
  latency_ms      INTEGER,
  dispatch_log_id TEXT,                     -- bridge_dispatch_log.id
  status          TEXT DEFAULT 'pending',   -- pending|delivered|failed
  created_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
  delivered_at    DOUBLE PRECISION
);
```

This extends the existing `AgentMessage` type in `bridge/types.ts` with persistence.
Currently `agent_messages` table exists but is marked legacy. `msg_bus_events` replaces it
with the structured envelope schema.

### 8. `intelligence_patterns` — Dispatch signal log (Intelligence Loop)

```sql
CREATE TABLE intelligence_patterns (
  id              TEXT PRIMARY KEY,
  pattern_type    TEXT NOT NULL,            -- gateway_preference|cost_spike|model_failure|combo_chain
  gateway_type    TEXT,
  agent_id        TEXT,
  summary         TEXT NOT NULL,
  evidence        JSONB DEFAULT '[]',       -- array of dispatch_log.id references
  confidence      INTEGER DEFAULT 50,
  promoted_to_concept_id TEXT,             -- concepts.id if elevated
  status          TEXT DEFAULT 'raw',      -- raw|reviewed|promoted|dismissed
  created_at      DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
  reviewed_at     DOUBLE PRECISION
);
```

### Existing Table Alterations

**`agent_templates` — Add RPG columns:**
```sql
ALTER TABLE agent_templates ADD COLUMN rarity TEXT DEFAULT 'common';
ALTER TABLE agent_templates ADD COLUMN stars INTEGER DEFAULT 1;
ALTER TABLE agent_templates ADD COLUMN xp INTEGER DEFAULT 0;
ALTER TABLE agent_templates ADD COLUMN level INTEGER DEFAULT 1;
ALTER TABLE agent_templates ADD COLUMN agent_class TEXT DEFAULT 'striker';
ALTER TABLE agent_templates ADD COLUMN elo INTEGER DEFAULT 1200;
ALTER TABLE agent_templates ADD COLUMN rpg_enabled INTEGER DEFAULT 0;
```

**`personas` — Add RPG cross-reference:**
```sql
ALTER TABLE personas ADD COLUMN rpg_stats_id TEXT;  -- FK to agent_rpg_stats.id
```

---

## Service Architecture

### rpg-engine.ts — Stat Calculation Engine

This service is the core of the RPG system. It reads `bridge_dispatch_log` and derives all
5 stats. It is the ONLY writer to `agent_rpg_stats`. Routes never write stats directly.

```typescript
// Public interface
interface RpgEngine {
  computeStats(templateId: string): Promise<AgentRpgStats>;
  recomputeAll(): Promise<void>;           // background job
  awardXp(templateId: string, source: XpSource, amount: number): Promise<void>;
  checkProgressionEvents(templateId: string): Promise<ProgressionEvent[]>;
  regenerateMdFiles(templateId: string, event: ProgressionEvent): Promise<void>;
}
```

**Stat derivation logic:**

| Stat | Query |
|------|-------|
| SPD | `SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) FROM bridge_dispatch_log WHERE agent_id = $1` → invert to 0-100 scale |
| REL | `SELECT 100 - (COUNT(*) FILTER(WHERE response IS NULL OR status='error') * 100.0 / COUNT(*)) FROM bridge_dispatch_log WHERE agent_id = $1` |
| EFF | `SELECT AVG(output_tokens * 1.0 / NULLIF(input_tokens,0)) * quality_weight FROM bridge_dispatch_log WHERE agent_id = $1` (requires battle judgment quality scores joined in) |
| QTY | `SELECT AVG(quality_score) FROM battle_judgments bj JOIN battles b ON bj.battle_id = b.id WHERE b.challenger_id = $1 OR b.defender_id = $1` |
| COMBO | `SELECT (success_count * 1.0 / NULLIF(chain_count,0)) * 100 FROM agent_bonds WHERE agent_a_id = $1 OR agent_b_id = $1` aggregated |

SPD, REL, EFF can be computed from dispatch log alone. QTY requires at least one battle.
COMBO requires multi-agent dispatch correlation. Agents with no battles start QTY at 50.

**XP sources and amounts are defined as constants, not stored in the schema.** The audit
trail is the dispatch_log and battles table — not a separate XP ledger.

**Progression events that trigger .md regeneration:**
```
star_up      → regenerate SOUL.md + IDENTITY.md
level_10x    → regenerate IDENTITY.md
class_change → regenerate ROLE_CARD.md
skill_unlock → regenerate SKILLS.md
gear_change  → regenerate TOOLS.md
battle_win   → append to HEARTBEAT.md
```

### battle-orchestrator.ts — Battle Engine

```typescript
interface BattleOrchestrator {
  startBattle(challengerId: string, defenderId: string, prompt: string, domain?: string): Promise<string>; // battle ID
  runBattle(battleId: string): Promise<BattleResult>;
  judgeBattle(battleId: string): Promise<void>;
  updateElo(battleId: string): Promise<void>;
}
```

**Battle execution flow:**
```
startBattle() → INSERT INTO battles (status='pending')
     ↓
runBattle()
  → parallel dispatch via routing-engine.ts for BOTH agents (same prompt)
  → bridge_dispatch_log records challenger_dispatch_id + defender_dispatch_id
  → SSE broadcast: battle:round_complete
     ↓
judgeBattle()
  → dispatch to judge model (ensemble: 3 different models, median wins)
  → INSERT INTO battle_judgments (3 rows, one per judge)
  → compute final scores (median of 3 judges)
  → UPDATE battles SET winner_id, judge_scores, status='complete'
     ↓
updateElo()
  → standard Elo formula (K=32 default)
  → UPDATE agent_templates SET elo, stars (if threshold crossed)
  → rpg-engine.awardXp() for both agents
  → SSE broadcast: battle:complete, rpg:xp_gained
```

**Critical design: battle dispatches use the existing `routingEngine.dispatch()`.** The
battle orchestrator passes `agentId` in the RoutingContext so dispatch is attributed to the
correct agent in `bridge_dispatch_log`. This is how battle results feed back into stats.

### session-registry.ts — Session Tracking

Porter currently tracks HTTP sessions (auth cookies) in the `sessions` table. This new
service tracks AI dispatch sessions — a logical grouping of related dispatches across a
conversation or workflow run.

```typescript
interface SessionRegistry {
  openSession(chatId: string, agentId?: string, budget?: number): Promise<string>;
  recordDispatch(sessionId: string, dispatchLogId: string, tokens: number): Promise<void>;
  closeSession(sessionId: string): Promise<SessionSummary>;
  getSession(sessionId: string): Promise<SessionRow>;
}
```

The `session_registry` table supplements (not replaces) `session_routing_context`. The
existing table tracks which model was used per message. The new table tracks aggregate
resource consumption per logical session.

### intelligence-loop.ts — Pattern Extraction

This service runs as a background job (via the existing `scheduler.ts`) on a configurable
interval (default: every 6 hours).

```typescript
interface IntelligenceLoop {
  extractPatterns(): Promise<IntelligencePattern[]>;
  reviewPatterns(): Promise<void>;        // promote high-confidence patterns to concepts
  pruneStale(): Promise<void>;
}
```

**Pattern types extracted:**
```
gateway_preference  → "agent X dispatches to OpenClaw 87% of the time"
cost_spike         → "average cost per dispatch increased 40% this week"
model_failure      → "Ollama failure rate spiked to 23% in last 24h"
combo_chain        → "agents A+B have 91% success when chained on research tasks"
```

High-confidence patterns (>= 75) are promoted to `concepts` table via the existing
Memory V2 concepts schema. This closes the intelligence loop: Bridge dispatch data →
extracted patterns → Memory concepts → injected into future system prompts → smarter routing.

### msg-bus.ts — Message Bus

Thin persistence layer over the existing `bridge/types.ts` AgentMessage interface. When
`POST /api/v1/bridge/agent-message` is called, the routing engine dispatches and returns.
The msg-bus service now persists the envelope to `msg_bus_events` before dispatch for
auditability and correlation tracking.

**This is NOT a queue.** Dispatch remains synchronous. The table is an audit log.

```typescript
interface MsgBus {
  record(msg: AgentMessage, dispatchLogId: string, result: BridgeDispatchResult): Promise<void>;
  getByCorrelation(correlationId: string): Promise<MsgBusEvent[]>;
}
```

---

## Data Flow Diagrams

### Flow 1: Dispatch → Stats Update

```
User/Agent dispatches via /api/v1/chat or /api/bridge/dispatch
         ↓
routing-engine.ts selects gateway, executes, logs to bridge_dispatch_log
         ↓
SSE: bridge:dispatch_complete {agentId, latencyMs, tokens}
         ↓
rpg-engine.ts subscribes to bridge:dispatch_complete events
         ↓
  [if dispatch_count milestone hit: 50, 200, 500, 1000]
         ↓
rpg-engine.computeStats(templateId)
  queries bridge_dispatch_log for SPD, REL, EFF
  queries battle_judgments for QTY
  queries agent_bonds for COMBO
         ↓
UPDATE agent_rpg_stats SET ...
         ↓
rpg-engine.checkProgressionEvents()
  → star_up? level_up? class_change?
         ↓
rpg-engine.regenerateMdFiles() if progression occurred
         ↓
SSE: rpg:stats_updated {templateId, newStats, progressionEvent?}
         ↓
Frontend: update character card, animate level-up if progression
```

### Flow 2: Battle → Elo → Leaderboard

```
POST /api/v1/battles/start {challengerId, defenderId, prompt}
         ↓
battle-orchestrator.startBattle()
  INSERT battles (status='pending')
         ↓
battle-orchestrator.runBattle()
  parallel: routingEngine.dispatch(ctx={agentId: challenger}, prompt)
            routingEngine.dispatch(ctx={agentId: defender}, prompt)
  → both log to bridge_dispatch_log (stat-eligible dispatches)
  → INSERT battle_rounds
  SSE: battle:running {battleId}
         ↓
battle-orchestrator.judgeBattle()
  dispatch to 3 judge models (ensemble)
  → INSERT battle_judgments (3 rows)
  compute median scores
  → UPDATE battles SET winner_id, judge_scores, status='complete'
  SSE: battle:complete {battleId, winnerId, scores}
         ↓
battle-orchestrator.updateElo()
  Elo formula → UPDATE agent_templates SET elo
  rpg-engine.awardXp(winner, 'battle_win', 100)
  rpg-engine.awardXp(loser, 'battle_lost', 25)
         ↓
rpg-engine.checkProgressionEvents() for both agents
         ↓
GET /api/v1/battles/leaderboard
  SELECT t.id, t.name, t.elo, r.stars, r.rarity, r.level
  FROM agent_templates t JOIN agent_rpg_stats r ON r.template_id = t.id
  ORDER BY t.elo DESC
```

### Flow 3: Intelligence Loop → Routing Concepts

```
scheduler.ts triggers intelligence-loop every 6h
         ↓
intelligence-loop.extractPatterns()
  queries bridge_dispatch_log (last 7 days)
  pattern: gateway_preference
    SELECT gateway_type, COUNT(*) as dispatches, agent_id
    GROUP BY gateway_type, agent_id
    HAVING COUNT(*) > 10
  pattern: cost_spike
    compare 7-day rolling avg vs previous 7-day avg
  pattern: combo_chain
    JOIN on correlation_id to find co-dispatches
         ↓
INSERT intelligence_patterns (status='raw')
         ↓
intelligence-loop.reviewPatterns()
  WHERE confidence >= 75 AND status='raw'
  → INSERT concepts (scope='workspace', sourceType='agent', content=summary)
  → UPDATE intelligence_patterns SET status='promoted', promoted_to_concept_id
         ↓
Next dispatch: memory-injection.ts reads concepts table
  → pattern injected into system prompt
  → routing engine has awareness of historical patterns
```

### Flow 4: Forge Birth → Initial RPG Profile

```
Forge station 3 completes (Outfitter)
  UPDATE forge_pipeline SET status='complete'
         ↓
forge.ts emits SSE: forge:agent_born {templateId, agentId}
         ↓
rpg-engine.ts handles forge:agent_born
  INSERT agent_rpg_stats (template_id=templateId, rarity='common', stars=1)
  UPDATE agent_templates SET rpg_enabled=1, rarity='common', stars=1
         ↓
rpg-engine.regenerateMdFiles(templateId, 'born')
  → rewrites SOUL.md, IDENTITY.md with RPG context
         ↓
SSE: rpg:agent_born {templateId, stats}
         ↓
Frontend: character card appears for new agent
```

---

## Recommended Project Structure

New files only — existing structure unchanged.

```
backend/src/
├── db/
│   ├── schema.ts                    MODIFY — add 7 new table definitions
│   └── migrate-rpg-v1.ts            NEW    — all DDL for v4.0
│
├── services/
│   ├── rpg-engine.ts                NEW    — stat calculation, XP, progression
│   ├── battle-orchestrator.ts       NEW    — battle execution + judging
│   ├── session-registry.ts          NEW    — session-level token tracking
│   ├── msg-bus.ts                   NEW    — message envelope persistence
│   ├── intelligence-loop.ts         NEW    — pattern extraction + concept promotion
│   └── forge.ts                     MODIFY — emit rpg:born on station 3 complete
│
└── routes/v1/
    ├── rpg.ts                       NEW    — agent stats, leaderboard, rarity queries
    ├── battles.ts                   NEW    — battle CRUD, spectator, replay
    ├── sessions.ts                  NEW    — session registry API
    └── admin/
        └── forge.ts                 MODIFY — unified Forge tabs in admin surface
```

---

## Build Order Dependencies

The dependency chain determines phase order. Each phase below cannot start until its
dependencies are complete.

```
Phase 1: Schema + Migration
  (no dependencies — pure DDL)
  ALTER agent_templates, ALTER personas
  CREATE agent_rpg_stats, battles, battle_rounds, battle_judgments
  CREATE agent_bonds, session_registry, msg_bus_events, intelligence_patterns
  → Unblocks: everything

Phase 2: RPG Engine (stat calculation)
  Depends on: Phase 1 (agent_rpg_stats table)
  Depends on: existing bridge_dispatch_log (already exists)
  → rpg-engine.ts: computeStats(), awardXp(), checkProgressionEvents()
  → Unblocks: Phase 3 (character card needs stats to display)
               Phase 5 (battle needs XP awards)

Phase 3: Forge Unification (nav + UI merge)
  Depends on: Phase 1 (schema — rpg_enabled flag on templates)
  Depends on: Phase 2 (stats available for display in Workshop tab)
  → Merge Skills + Tools + Forge nav items into one
  → Add Templates/Armory/Workshop/Arena tabs to forge route
  → Unblocks: Phase 4 (skill tree UI lives inside Workshop tab)

Phase 4: Skill Tree + Character Card APIs
  Depends on: Phase 2 (stat APIs)
  Depends on: Phase 3 (Workshop tab shell)
  → /api/v1/rpg routes: stats, class, gear, skills
  → character card data API (pentagon stats, rarity, gear slots)
  → Unblocks: Phase 5 (battle needs character cards to show combatants)

Phase 5: Battle Arena MVP
  Depends on: Phase 1 (battles table)
  Depends on: Phase 2 (XP awards post-battle)
  Depends on: Phase 4 (agent stats for Elo display)
  → battle-orchestrator.ts: runBattle(), judgeBattle(), updateElo()
  → /api/v1/battles routes: start, status, result, leaderboard
  → Unblocks: Phase 6 (spectator needs running battles)

Phase 6: Session Registry + Message Bus
  Depends on: Phase 1 (session_registry, msg_bus_events tables)
  Depends on: existing routing-engine.ts (msg-bus wraps dispatch)
  → session-registry.ts + sessions route
  → msg-bus.ts wraps /api/v1/bridge/agent-message
  → Unblocks: Phase 7 (intelligence loop reads session patterns)

Phase 7: Intelligence Loop
  Depends on: Phase 1 (intelligence_patterns table)
  Depends on: Phase 5 (battle data enriches patterns)
  Depends on: Phase 6 (session data enriches patterns)
  Depends on: existing concepts table (promotion target)
  → intelligence-loop.ts: extractPatterns(), reviewPatterns()
  → No new routes — background job only
```

**Critical path:** Phase 1 → Phase 2 → Phase 5 (battle) is the minimum viable arc.
Phase 3 (Forge unification) and Phase 4 (character card) are parallel with Phase 5
but depend on Phase 2 completing first.

---

## Integration Points with Existing Bridge Infrastructure

### routing-engine.ts — Read-only integration

The battle orchestrator calls `routingEngine.dispatch()` and `routingEngine.selectStreamWithFallback()` exactly as existing chat routes do. No modifications to routing-engine. The only new behavior: `BattleOrchestrator` passes `agentId` in `RoutingContext` so that battle dispatches are correctly attributed to the competing agent in `bridge_dispatch_log`.

### sse-hub.ts — New event namespaces

Existing `broadcast(event, data)` signature is unchanged. New event names added:

| Event | When | Payload |
|-------|------|---------|
| `rpg:stats_updated` | After stat recompute | `{templateId, quality, speed, efficiency, reliability, combo, level, stars}` |
| `rpg:agent_born` | After forge station 3 | `{templateId, rarity, stars}` |
| `rpg:xp_gained` | After XP award | `{templateId, amount, source, newTotal, newLevel}` |
| `rpg:star_up` | After star threshold crossed | `{templateId, newStars}` |
| `battle:running` | Battle dispatches started | `{battleId, challengerId, defenderId}` |
| `battle:round_complete` | Each round completes | `{battleId, roundNum, challengerTokens, defenderTokens}` |
| `battle:judging` | Judge model dispatching | `{battleId}` |
| `battle:complete` | Final result ready | `{battleId, winnerId, challengerElo, defenderElo}` |
| `session:opened` | Session registry entry created | `{sessionId, agentId, chatId}` |
| `session:closed` | Session closed | `{sessionId, tokensUsed, duration}` |

### memory-injection.ts — Downstream consumer

No modification. The intelligence loop writes to `concepts` table using the existing schema.
`memory-injection.ts` already queries concepts for injection — it will automatically pick up
bridge patterns once they are promoted.

### forge.ts — Minimal modification

One addition: after station 3 (Outfitter) marks a pipeline item complete, emit
`rpg:agent_born` via `sse-hub.broadcast()`. The RPG engine subscribes to this event and
initializes the agent's stat record. This keeps RPG concerns out of the forge service.

### scheduler.ts — Register new job

Register `intelligence-loop.extractPatterns()` as a cron job. The existing scheduler accepts
new registrations with no API change required.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Writing Stats Directly from Routes

**What people do:** Battle result endpoint directly UPDATEs `agent_rpg_stats`.

**Why it's wrong:** Stats must be recomputable from immutable dispatch_log + battles.
If routes can write stats directly, the "no gaming" invariant breaks. A bad actor could
POST fabricated stat updates.

**Do this instead:** Routes only write to `battles` and `battle_judgments`. `rpg-engine.ts`
is the only service that writes to `agent_rpg_stats`. It always recomputes from source data.

### Anti-Pattern 2: Battle Dispatch Bypasses Bridge

**What people do:** Battle orchestrator calls adapter directly, skipping routing-engine.

**Why it's wrong:** Battle dispatches won't appear in `bridge_dispatch_log`. Stats engine
can't find them. Circuit breakers don't apply. Rate limiting doesn't apply.

**Do this instead:** `battle-orchestrator.ts` always calls `routingEngine.dispatch()` with
`{agentId}` in context. Battle dispatches are full first-class Bridge dispatches.

### Anti-Pattern 3: Judge Dispatch to Same Model as Combatants

**What people do:** Both agents use Claude. Judge also uses Claude.

**Why it's wrong:** Same model judging its own output — obvious bias.

**Do this instead:** Judge model is selected from a different gateway than the combatants.
`battle-orchestrator.ts` enforces this via `forceGatewayType` exclusions in RoutingContext.
Ensemble of 3 judges from different gateways further mitigates bias.

### Anti-Pattern 4: Session Registry as Auth Sessions

**What people do:** Use `session_registry` for user auth/cookie tracking.

**Why it's wrong:** Auth sessions live in the `sessions` table (existing). The session
registry tracks AI dispatch sessions — resource accounting for a logical workflow run.
Conflating them creates security issues and schema confusion.

**Do this instead:** `session_registry` has no auth concerns. It references `chat_id` as
an optional correlation anchor, not as an auth mechanism.

### Anti-Pattern 5: Intelligence Patterns Written Eagerly

**What people do:** Every dispatch event triggers a pattern check and immediate concept write.

**Why it's wrong:** Noisy. Most single dispatch events aren't meaningful signals. Concepts
table fills with low-value observations, diluting the memory injection quality.

**Do this instead:** Intelligence loop runs on a schedule (6h default). Patterns require
minimum evidence (at least 10 supporting dispatches). Only patterns >= 75 confidence get
promoted to concepts. This is the same noise filtering principle as Memory V2 signals.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 agents, <10 battles/day | Synchronous stat recompute on every progression milestone. No queue needed. |
| 100-1000 agents, 100 battles/day | Move stat recompute to background job (scheduler.ts). Stat reads always from `agent_rpg_stats` cache. Battle dispatch parallelism handled by existing `dispatch-queues.ts`. |
| 1000+ agents, tournament mode | Ensemble judge calls become bottleneck. Add judge dispatch queue. Consider pre-cached Elo rankings materialized view. PostgreSQL can handle this at current VPS scale without separate services. |

**First bottleneck:** Judge dispatch latency. Three judge calls per battle = 3x LLM
round-trips in sequence. Mitigate with parallel judge calls (Promise.all on three judge
dispatches), then take median. This is already the right design — just ensure the
implementation uses parallel, not sequential dispatch.

**Second bottleneck:** Stat recompute query on large dispatch logs. The query
`WHERE agent_id = $1` on `bridge_dispatch_log` must be indexed. Add:
```sql
CREATE INDEX idx_dispatch_log_agent_id ON bridge_dispatch_log(agent_id);
CREATE INDEX idx_dispatch_log_agent_created ON bridge_dispatch_log(agent_id, created_at);
```

---

## Sources

- Direct source inspection: `backend/src/db/schema.ts` (all 967 lines)
- Direct source inspection: `backend/src/services/bridge/types.ts` (all 258 lines)
- Direct source inspection: `backend/src/services/bridge/routing-engine.ts`
- Direct source inspection: `backend/src/services/forge.ts`
- Direct source inspection: `backend/src/services/sse-hub.ts`
- Direct source inspection: `backend/src/services/stream-service.ts`
- Design spec: `research/agent-rpg-design-v2.md`
- Project context: `.planning/PROJECT.md`

---
*Architecture research for: Porter v4.0 Agent RPG System + Battle Arena*
*Researched: 2026-03-29*
*Confidence: HIGH — all findings from source-code inspection, no training-data assumptions*
