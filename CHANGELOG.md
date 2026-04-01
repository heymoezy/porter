## v4.0.1 (2026-04-01)

**Forge page fixes + template card polish**

- Forge station agents renamed: Quill (Soul Writer), Sage (Skill Trainer), Anvil (Gear Outfitter), Warden (Queue Keeper)
- Removed broken links to nonexistent forge agent templates
- Template cards: description wraps instead of truncating, category shown as badge
- Porter card only appears in "all" filter (not every category)
- SHEET tab: fixed crash from wrong capacity API shape (VitalsBar expected flat limits, API returns nested models.limits)
- SHEET tab: graceful empty state for unborn agents

## v4.0.0 (2026-04-01)

**The Arena — Agent RPG System + Bridge Intelligence**

Porter agents become RPG characters with real stats, progression, and an intelligence loop that makes routing smarter over time. Forge unified into one page. 6 phases shipped.

### RPG Engine
- 5 core stats (Quality, Speed, Efficiency, Reliability, Combo) derived from real dispatch data
- XP from dispatches, feedback, battles, multi-agent chains
- Level 1-100, star progression 1-5★, rarity system (Common → Mythic)
- Specialties auto-detected from usage patterns
- 49 unit tests for all stat formulas
- Background recalculation every 5 minutes

### Agent Identity Files
- SOUL.md, IDENTITY.md, SKILLS.md, TOOLS.md auto-regenerated from DB on progression events
- Files are derived output, not editable source — anti-gaming by design

### Forge Unification
- Skills + Tools + Agent Forge merged into single "Forge" nav item
- 4 tabs: Templates (catalog), Armory (tools + skills), Workshop (build screen), Arena (coming soon)
- Birth animation: pixel portrait grayscale → color with particle sparks
- Workshop shows live skill success rates and support modifiers

### Character Sheet
- Full character card with stat pentagon (recharts RadarChart)
- 3 vitals bars: Mana (token budget), Reliability (error rate), Focus (context pressure)
- Rarity-colored borders: gray, blue glow, purple pulse, gold shimmer, red particles
- Star display with SVG progress arc
- Passive tree: 8-node specialization grid

### Session Registry + Message Bus
- Porter tracks every dispatch session with token count and context window %
- Context pressure warning at 80%, auto-rotation at 95%
- Session rotation writes Recall concept summarizing closed session
- Structured message envelope for inter-gateway communication
- Every agent-message logged to msg_bus_events with correlation IDs

### Intelligence Loop
- Background job extracts 4 pattern types from dispatch history (latency, model strengths, failures, cost)
- High-confidence patterns (≥80%) auto-promoted to Recall concepts
- Routing engine reads learned concepts before selecting gateways
- Vigil's operator activity shows sessions, messages, and intelligence patterns live

### Bridge Improvements
- All 4 gateways respond through Bridge (session hook bypass with PORTER_BRIDGE_DISPATCH)
- OpenClaw auth token fix (reads OPENCLAW_TOKEN env)
- CLI health probe timeout increased 5s → 10s (prevents false offline)
- 3 Bridge agents profiled: Vigil (Bridge Operator), Atlas (Route Optimizer), Ledger (Cost Controller)

### Admin Cleanup
- Agent templates rationalized: 104 → 92 (12 duplicates removed)
- Template IDs cleaned to plain slugs (bridge-operator, not sys-bridge-operator)
- Agent lifecycle types: persistent (heartbeat), event-driven, one-shot
- Template detail page rebuilt: SOUL/IDENTITY/ROLE/SKILLS/TOOLS/HEARTBEAT + INSTANCES tabs
- CLAUDE.md updated with mechanical overrides for verification, context management, edit safety

### Schema
- 8 new PostgreSQL tables: agent_rpg_stats, battles, battle_rounds, battle_judgments, agent_bonds, session_registry, msg_bus_events, intelligence_patterns
- 14 RPG columns on agent_templates, 3 performance columns on template_skills
- 17 indexes across all new tables

## v3.4.2 (2026-03-31)

**Gemini usage collection overhaul**

- Real Gemini quota from Google Cloud Code API (remainingFraction)
- Hourly usage estimated from Porter dispatch logs (50 req/hour baseline)

## v3.4.1 (2026-03-31)

**Bridge UX polish**

- Merged Model Scout + Route Analyst into "Models & Routing" tab (4 tabs → 3)
- Admin UI served at root / (removed /admin/ prefix)
- Operator activity card height fixed
- Ollama: 0% used with ∞ No limit
- OpenClaw usage from `openclaw status --usage` (real provider quota)

## v3.4.0 (2026-03-31)

**Usage collection overhaul + gateway sniffer**

- Codex JSONL rate-limit parsing for real usage %
- Claude OAuth auto-refresh (tokens no longer go stale)
- Gateway activity sniffer (session transitions via SSE)
- Bridge nav badge for pending updates
- Manual capacity refresh endpoint

## v3.3.2 (2026-03-29)

- BRIDGE.md canonical location, stream request naming fix, version alignment

## v3.3.1 (2026-03-29)

**Bridge operator goes live**

- Real Claude usage from Anthropic rate-limit headers (1 Haiku call)
- Local CLI usage collector (Claude JSONL + Codex SQLite)
- Operator activity log with health, circuits, capacity alerts
- Gateway card UX: restart, pause, inline config, usage bars

## v3.3.0 (2026-03-29)

**Port merge — one Fastify, one port**

- Brain (:3001) absorbs Admin (:5175) — single process
- Admin routes, SSE, auth plugin all merged
- Unified changelog

## v3.2.0 (2026-03-29)

**Monorepo merge + system prompt pipeline**

- Brain + Admin merged into single repo
- Directives from DB injected into every dispatch
- SessionStart hooks for all CLIs
- Gateway hooks detection on Bridge cards

## v3.0.0 (2026-03-25)

**Porter Bridge — AI Gateway & Model Intelligence (v3.0 milestone)**

8 phases (16-23), 46 requirements. Gateway registry, 5 provider adapters, circuit breakers, health probes, smart routing, model catalog, cost tracking, admin APIs, first-run setup, Memory V3 signals.

## v2.0.0 (2026-03-24)

**Backend Ready (v2.0 milestone)**

9 phases (8-15). API standardization, streaming chat, collaborative sessions, unified chat + CRM, 103 agent templates, PostgreSQL migration, Memory V3 state engine, skills & tools registry.

## v1.0.0 (2026-03-21)

**Foundation + Core Platform (v1.0 milestone)**

7 phases (1-7), 30 requirements. CSS architecture, Memory V2, route migration, agent autonomy, guided wizard, real-time transparency, external connections.
