# Porter Operational Roadmap — From "Demo" to "Autonomous Brain"

## Vision Recap

Porter is the invisible brain behind CLI sessions. Users don't interact with Porter directly — they use their CLIs (Claude, GPT-5.4, Codex, Gemini, Ollama) and Porter automatically makes every session smarter by injecting the right skills, knowledge, and context based on what's being worked on.

The admin UI exists solely for observability — watching Porter learn, accepting/rejecting directive candidates, monitoring agent health.

## Current State (v6.3.0, 2026-04-10)

### Working
- **Intellect** (Phases 1-3): File watcher, memory validator, correction detector, session analyzer, memory promoter, dispatch scorer, memory pruner, self-monitor, pattern miner. 9 autonomous workflows. 22 real episodes. 98% validator accuracy. 96% episode coverage.
- **Bridge**: 5 gateway adapters (Claude CLI, OpenClaw/GPT-5.4, Codex CLI, Gemini CLI, Ollama). Routing engine with rules, confidence scoring, dispatch logging.
- **Memory V3**: Directives (17 active), concepts, episodes, project_notes, agent_notes. Scoped injection pipeline.
- **Admin UI**: 20+ pages. Intellect integrated across Dashboard, System, Bridge, Sessions, Routing, Decisions.

### Partially Built
- **Skills**: 209 on disk, 207 in DB. Most are auto-generated templates from a batch rewrite — need quality review. Injection into dispatches: unclear.
- **Tools**: 12 environment tools detected. Detection runs at startup. No tool-to-agent assignment. No auto-update.
- **Forge**: 107 agent templates in DB. UI exists. Pipeline UI exists. But no agent has been "born" — all are planned/draft. Forge doesn't actually create working agents that dispatch through Bridge.
- **Agent emails**: Only porter@ and noreply@ exist. Agents have no individual email addresses.

### Not Built
- Cross-gateway context injection (only Claude CLI has session hooks)
- Autonomous agent evolution (Forge → Bridge → Intellect → Forge loop)
- Agent information subscriptions (RSS, email, webhooks)
- Marketing strategy
- Revenue/monetization system
- Auto-updating tools/skills

## Phases

### Phase A: Skills Overhaul (RESEARCH PENDING)
**Goal:** Every skill is substantive, properly structured, and ready for injection.

Current state: 209 skills on disk. Likely most are templated boilerplate from a batch generation pass. Need to:
1. Audit every skill — categorize as good/templated/empty
2. Define the "skill spec" — what makes a skill complete (prompt.md, SKILL.md, meta/skill.json with proper fields)
3. Identify the 20-30 "core skills" that matter most for CLI enhancement
4. Rewrite core skills from scratch with real prompts, examples, QA checklists
5. Archive/delete skills that are pure template filler
6. Ensure skills sync to DB and are queryable by agents

### Phase B: Tools Research + Overhaul (RESEARCH PENDING)
**Goal:** Porter detects, manages, and offers the best tools for every task.

Current state: 12 env tools detected. Need to:
1. Research what "tools" should mean for Porter — MCP servers? CLI binaries? API integrations?
2. Build a proper tool registry with categories (code, search, docs, build, deploy, etc.)
3. Auto-detect available tools across all gateways (not just the local VPS)
4. Match tools to skills and agents — "this agent can use these tools"
5. Auto-update: periodic check for new versions, install updates if approved

### Phase C: Forge Activation — Birth the Agents
**Goal:** Forge creates actual working agents from templates, assigns skills + tools, wires them to Bridge.

1. Define "forging" — what it actually means to create a working agent instance
2. Agent instance = template + assigned skills + assigned tools + system prompt + email
3. Create Stalwart mailboxes for key agents (not all 107 — start with ~10 core)
4. Wire forged agents into Bridge routing — "this agent handles this type of task"
5. Agent startup: on first forge, agent gets a soul file, role card, initial skills
6. Test: dispatch a task → Bridge routes to forged agent → agent uses skills/tools → result scored

### Phase D: Cross-Gateway Context Injection
**Goal:** Every CLI session across all 5 gateways benefits from Porter's knowledge.

Currently only Claude CLI has hooks. Need to:
1. OpenClaw/GPT-5.4: system prompt injection via the Bridge dispatch call
2. Codex CLI: subprocess adapter already exists — inject context via system prompt
3. Gemini CLI: same approach as Codex
4. Ollama: system prompt injection in the Ollama API call
5. Universal: Bridge pre-processes every dispatch to include relevant directives, skills, and context before forwarding to gateway

### Phase E: Autonomous Evolution Loop
**Goal:** Porter improves itself without human intervention.

1. Agent subscriptions: agents subscribe to RSS feeds, newsletters, release notes
2. Forge feedback loop: Intellect watches agent outcomes → updates agent profiles
3. Skill evolution: frequently-used skills get refined, unused skills get archived
4. Tool evolution: periodic capability scan, auto-detect new tools
5. Routing evolution: dispatch scoring → routing rule auto-generation
6. Self-monitoring dashboard: corrections decreasing = Porter getting smarter

### Phase F: Marketing Strategy
**Goal:** Position Porter in the market.

1. Define the pitch: "Make every AI CLI session smarter — automatically"
2. Landing page at askporter.app
3. Demo: before/after showing same task with and without Porter
4. Target audience: developers using multiple AI CLIs
5. Distribution: CLI plugin, npm package, or system service
6. Viral loop: shared team knowledge grows with every user

### Phase G: Revenue/Monetization
**Goal:** Porter sustains itself.

1. API metering model (already declared in architecture)
2. Tiers: free (limited dispatches/month), pro (unlimited + team memory), enterprise
3. Payment integration (Stripe)
4. Usage tracking (dispatches, tokens, active agents)
5. Admin billing page (already exists but needs real data)

---

## Execution Priority

1. **Phase A** (Skills) + **Phase B** (Tools) — run in parallel
2. **Phase C** (Forge) — depends on A+B
3. **Phase D** (Cross-gateway injection) — can start in parallel with C
4. **Phase E** (Evolution) — depends on C+D
5. **Phase F** (Marketing) + **Phase G** (Revenue) — after E

---

## Status: RESEARCHING

4 parallel research agents auditing: Skills, Tools, Forge, Bridge+Injection.
Roadmap will be refined when research completes.
