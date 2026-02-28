# Porter Strategic Roadmap
**Date:** 2026-02-28
**Author:** Claude Opus 4.6 (synthesized from 6 research agents + codebase audit + market analysis)
**For:** Moe
**Status:** Draft — awaiting Moe's review

---

## Where We Are (Honest Assessment)

Porter is a **15,000-line single Python file** (725KB) with 99 API endpoints, 279 JS functions, and zero external dependencies. It serves its entire UI as an embedded HTML string. It works, but only for one user on one VPS accessed through an SSH tunnel.

**What works well:** File management, project dashboard, skill browser, agent connectivity testing, memory file reading/editing, session listing, capability detection, environment portability.

**What doesn't work:** Orchestration tab is a museum (you can look but not touch). Memory tab is a display case with a broken [edit] button. Command Center is empty. No chat interface. No help system. No admin dashboard. No public URL. No multi-user. No billing. Single-threaded HTTP server. 735KB uncompressed payload on every page load. 106 bare `except Exception` blocks swallowing errors.

**The hard truth:** We've been building features on a prototype that should have been rewritten at v0.10. Every new feature makes the rewrite harder. But rewriting now without users means rewriting blind. We need to **ship to real users first, then rewrite.**

---

## Strategic Pushback (Where I Disagree With the Task List)

### 1. Don't rewrite to Node.js yet

The research says Fastify + React + Tailwind + SQLite is the right target stack. But a full rewrite before product-market fit is a classic startup mistake. We'd spend 6-8 weeks rebuilding what we have, with zero new capabilities.

**Counter-proposal:** Extract the frontend FIRST (3-4 weeks). Keep Python as a JSON API server. Build a proper React + Tailwind frontend that talks to the existing Python backend. This gives us:
- Modern, maintainable frontend
- Code splitting (no more 735KB payload)
- Component library (shadcn/ui)
- TypeScript safety
- The Python backend still works fine as an API server

Replace the Python backend with Fastify LATER — after we have users and know what the real performance bottlenecks are.

### 2. Don't build billing before you have users

Moe listed billing as item #8. I'd push it to the end. You need:
1. A public URL (so people can see Porter)
2. A landing page (so people understand what Porter is)
3. Real users (so you learn what they'll pay for)
4. THEN billing

The monetization model is clear (AGPL open core + cloud tier), but the billing infrastructure can wait until 100+ users. Before that, it's premature engineering.

### 3. Orchestration and Memory MUST be differentiated

Right now both tabs show model cards with file viewers. That's duplicate functionality. The fix isn't to add more to each — it's to draw a clear line:

**Orchestration = WHO works for you.** Models, agents, routing, execution. This is the plumbing. "Send this task to Claude, route that request to Ollama."

**Memory = WHAT they know.** Knowledge, context, learning. This is the brain. "Here's what Claude remembers. Here's what's shared across all models. Here's what was learned today."

Currently, the Orchestration config panel lets you edit CLAUDE.md, SOUL.md, etc. The Memory tab ALSO lets you view/edit those same files. Pick ONE place for file editing. I'd put it in Memory (that's where knowledge lives) and remove the file editor from Orchestration. Orchestration should be about routing and connectivity, not file editing.

### 4. The name "Porter" has a namespace problem

Three other developer tools are already called "Porter" (a CNAB package manager, a cloud PaaS, and a Kubernetes deployer). SEO for "porter dev tool" is crowded. This matters when we go public. We should either:
- Keep "Porter" but use a distinctive domain (porterfiles.dev, useporter.app)
- Rebrand entirely (more disruptive but cleans the slate)

Don't decide now — decide after alpha launch when we see how users talk about the product.

---

## The Flush Problem (Moe's Concern: "What Does This Actually Do?")

Moe is right — "Flush to long-term memory" is opaque. The user doesn't know:
- What's in the session
- What will be extracted
- Where it will be written
- Whether they want to do it
- Whether it's reversible

### What Flush Currently Does
Reads a session JSONL file, extracts the first user message, message count, token count, tool usage, and writes a markdown summary block to `session_flushes.md`. It's a simple metadata dump — not an intelligent extraction.

### What Flush SHOULD Do (The Wizard)
1. **Preview first.** Show the user what will be extracted BEFORE writing anything. Render a preview card: "This session had 332 messages, discussed Porter memory architecture, and used 4 tools. Here's what would be saved: [editable summary]"
2. **Let the user edit.** The extracted summary should be editable before committing. Maybe the user wants to add context or remove irrelevant parts.
3. **Choose destination.** Where should it go? session_flushes.md? A specific project's MEMORY.md? The user decides.
4. **Confirm impact.** "This will append 150 bytes to session_flushes.md (currently 2.3 KB). [Commit] [Cancel]"
5. **Make it reversible.** Show a "Last flush" undo button for 30 seconds after committing.

This is the "Memory Wizard" concept. It applies to other operations too:
- **Consolidate memory:** "Your MEMORY.md is 5.6 KB with 40 entries. 12 are outdated. Review and prune?" [Show entries with delete checkboxes]
- **Sync across models:** "Claude learned X in session 42. Share this with OpenClaw? [Preview what would be written to SOUL.md]"
- **Archive old sessions:** "15 sessions older than 7 days. Archive to cold storage? [Select which to keep]"

### Where SOUL.md Fits

SOUL.md is OpenClaw's identity file — it defines who the agent IS. In Porter's memory hierarchy:

| File | Owner | Purpose | Layer |
|------|-------|---------|-------|
| CLAUDE.md | User | Briefing doc for Claude Code | Instructions |
| SOUL.md | User | Identity doc for OpenClaw | Instructions |
| USER.md | User | User preferences for OpenClaw | Instructions |
| AGENTS.md | User | Agent definitions for OpenClaw | Instructions |
| GEMINI.md | User | Combined instructions+memory for Gemini | Instructions + Memory |
| MEMORY.md (Claude) | Claude auto-writes | Learned patterns, preferences | Learned Memory |
| MEMORY.md (OpenClaw) | OpenClaw auto-writes | Learned patterns, preferences | Learned Memory |
| projects.md | User + models | Project registry | Shared Plane |
| session_flushes.md | Porter (via flush) | Extracted session learnings | Shared Plane |

SOUL.md belongs in the **Instructions** layer — it's what the user TELLS the model to be, not what the model LEARNED. The Memory tab should show it clearly in Layer 1 (Instructions) under OpenClaw, alongside USER.md and AGENTS.md.

---

## Tab Architecture (Proposed Consolidation)

### Current State (11 modules, 3 hidden)
CC | Orchestration | Memory | Extensions | Projects | Workflows | Locations | Files + (Policies | Tools | Activity hidden)

### Problem
- Command Center is empty
- Orchestration and Memory overlap (both show model cards + file editors)
- Extensions and Workflows could be one thing
- 8 visible tabs is too many for alpha

### Proposed State (6 modules)
**AI** | **Projects** | **Files** | **Locations** | **Settings** | **Admin**

Where:
- **AI** = Merged Orchestration + Memory + Chat. Sub-tabs: Models (routing/connectivity), Memory (knowledge layers), Chat (talk to models). This is Porter's core value.
- **Projects** = Current Projects + Workflows. Sub-tabs: Dashboard, Workflows, Skills.
- **Files** = Current Files (unchanged — it's solid).
- **Locations** = Current Locations (unchanged — it's solid).
- **Settings** = Current Settings + Extensions. Sub-tabs: Profile, Integrations, Tools, Preferences, Release Notes.
- **Admin** = New. System health, logs, usage analytics, config management.

This cuts from 8 visible tabs to 6 and eliminates the Orchestration/Memory overlap by merging them under "AI" with clear sub-tabs.

**Note:** This is a proposal, not a mandate. If Moe prefers to keep them separate, the fix is simpler: remove model cards from Memory (it becomes pure knowledge view), remove file editors from Orchestration (it becomes pure routing view).

---

## Known Bugs to Fix (Before New Features)

1. **Memory [edit] button race condition.** The `setTimeout(toggleMemFileEdit, 200)` on file rows causes it to jump to a random session instead of opening the editor. Fix: remove the setTimeout hack, use proper click handler separation.

2. **Orchestration SVG still shows Qwen on second row.** Even with the count cap, the 4th model card wraps below the flow arrows. Fix: either hide Ollama from the model grid (it's shown in Extensions already) or use a 4-column grid.

3. **Single-threaded HTTP server.** One slow AI prompt blocks all other requests. Fix: switch from `HTTPServer` to `ThreadingHTTPServer` (one-line change).

4. **No CORS restrictions.** `Access-Control-Allow-Origin: *` on all JSON responses. Fix: restrict to same-origin.

5. **No login rate limiting.** Fix: add 5-attempt lockout with exponential backoff.

6. **106 bare `except Exception` blocks.** Many swallow errors silently. Fix: add logging to all catch blocks (use stdlib `logging` module).

---

## Phased Roadmap

### Phase 0: Foundation Fixes (1-2 sessions)
_Ship quality, not features._

- [ ] Fix Memory [edit] button bug
- [ ] Fix threading (`ThreadingHTTPServer`)
- [ ] Fix CORS (restrict to same-origin)
- [ ] Add login rate limiting
- [ ] Add structured logging (stdlib `logging`)
- [ ] Resolve Orch/Memory overlap (either merge or differentiate — Moe decides)
- [ ] Hash passwords with `hashlib.scrypt()` instead of SHA-256
- [ ] Persist sessions to SQLite (`sqlite3` is stdlib)

### Phase 1: Chat Engine (2-3 sessions)
_The #1 missing feature. Users need to TALK to their AI through Porter._

- [ ] SSE streaming endpoint (`/api/chat/stream`) — stdlib Python, no deps
- [ ] Chat UI panel (vanilla JS, embedded in existing SPA)
- [ ] Multi-model selector (Ollama, OpenClaw gateway, Claude API if key provided)
- [ ] Context injection: select files from Files tab, they become chat context
- [ ] Chat history persistence (JSON files in `PORTER_DATA_DIR/chat/`)
- [ ] Flush wizard v1: preview what will be extracted before committing

### Phase 2: Go Public (1-2 sessions)
_Get a URL. Get users. Learn._

- [ ] Buy domain (porterfiles.dev or similar — Moe decides)
- [ ] Install Caddy (single binary, automatic TLS, 3-line config)
- [ ] Cloudflare DNS (free tier, hides origin IP)
- [ ] Security hardening: scrypt passwords, persistent sessions, rate limiting, CSRF
- [ ] Basic landing page (static HTML, served by Caddy — NOT a full marketing site yet)
- [ ] Open GitHub repository (AGPL-3.0 license)
- [ ] README.md with install instructions

### Phase 3: Help & Admin (1-2 sessions)
_Make it usable by someone who isn't Moe._

- [ ] Guided tour (Driver.js — 5KB, zero deps, CDN-loaded)
- [ ] Per-tab contextual help tooltips
- [ ] Admin tab: system health, service status, disk/memory usage
- [ ] Admin tab: log viewer with search/filter
- [ ] Admin tab: config editor (replaces manual JSON editing)

### Phase 4: Frontend Extraction (3-4 sessions)
_The first step of the rewrite. Keep Python backend, build proper frontend._

- [ ] Extract HTML/CSS/JS from porter.py into separate files
- [ ] Set up React + Tailwind + shadcn/ui project (pnpm + Vite)
- [ ] Build components for each module (AI, Projects, Files, etc.)
- [ ] Connect to existing Python API endpoints
- [ ] Code splitting (lazy-load each tab)
- [ ] TypeScript for type safety
- [ ] Dark/light theme via Tailwind CSS variables

### Phase 5: Backend Migration (3-4 sessions)
_Replace Python with Fastify. Add SQLite._

- [ ] Set up Fastify + better-sqlite3 + Drizzle ORM
- [ ] Migrate endpoints in batches (auth first, then files, then AI, then admin)
- [ ] WebSocket support for real-time updates
- [ ] Multi-user support (registration, sessions, RBAC)
- [ ] Proper error handling with JSON Schema validation

### Phase 6: Monetization (after 100+ users)
_Now you know what people will pay for._

- [ ] Pricing page on website
- [ ] Stripe/LemonSqueezy integration
- [ ] Free tier (self-hosted, all features)
- [ ] Pro tier (cloud-hosted, automatic updates, backup)
- [ ] Team tier (multi-user, RBAC, SSO, audit log)
- [ ] Usage tracking (per-model API call proxying)

### Phase 7: Marketing Engine (after public launch)
_Drive adoption._

- [ ] Consumer website (Astro SSG — home, features, pricing, docs, blog)
- [ ] r/selfhosted + r/LocalLLaMA posts
- [ ] Publish Porter as MCP server (biggest distribution channel)
- [ ] Hacker News Show HN
- [ ] Product Hunt launch
- [ ] Blog content: "Zero Dependencies AI Orchestration" angle
- [ ] GitHub README with screenshots, demo GIF, quick start

---

## Market Context (Key Findings)

### Closest Competitor: Dify
Open-source AI app platform. Apache 2.0. Visual workflow builder + model management + RAG + agents. Cloud pricing: free → $59/mo → $159/mo → enterprise. Docker-based, team-focused.

**Porter's differentiation:** Single-file / zero-dependency / self-hosted-first / personal AI infrastructure (not team workflows). Porter is for the individual developer who uses Claude + GPT + Gemini + Ollama and wants one place to manage it all.

### Market Size
- AI developer tools: $7.37B (2025) → $24B (2030)
- AI agents: $7.84B (2025) → $52.6B (2030)
- Cursor alone: $1.2B ARR, $29.3B valuation

### Licensing Recommendation
**AGPL-3.0** — real open-source license, protects against cloud competitors forking Porter, aligns with self-hosted-first philosophy. Same model as Grafana.

### Monetization Model
Open core: free self-hosted (AGPL) + cloud tier ($15-25/mo) + team tier ($40-60/user/mo) + enterprise (custom).

---

## OpenClaw Skills — What We Can Leverage

50 skills audited, 36 Linux-compatible. Key ones for Porter:

| Porter Feature | Useful Skills |
|---|---|
| Chat Engine | gemini, oracle, coding-agent, summarize |
| Marketing | gog (Gmail), openai-image-gen — **NO Reddit/Twitter skills exist (gap)** |
| Admin | healthcheck, session-logs, model-usage, tmux, github |
| Workflows | gh-issues, coding-agent, gog, notion, trello, slack, discord |
| Help | summarize, clawhub, gemini, oracle |

**Key gap:** No social media posting skills. Reddit marketing would need a custom skill or manual posting.

---

## Can OpenClaw and Gemini Help With Strategy?

**OpenClaw (Codex):** Yes — it's good at structured analysis, QA, and governance. It should review this roadmap, challenge the prioritization, and identify risks. Its role is "the other brain in the room."

**Gemini:** Yes — it's good at broad research, competitive analysis, and creative brainstorming. It should research specific topics (domain availability, pricing comps, user personas) when we need depth.

**Porter itself:** Not yet. The Quick Prompt in Command Center is basic — no streaming, no context injection. Once the Chat Engine exists (Phase 1), Porter becomes a strategy tool too.

**Recommendation:** Before tomorrow's session, have OpenClaw review this roadmap and the research files. Let it poke holes. Two brains are better than one.

---

## Decision Points for Moe

These need your input before we proceed:

1. **Orch/Memory: Merge into "AI" tab, or keep separate with clear boundaries?**
2. **Domain name: What should the public URL be?** (porterfiles.dev? useporter.app? something else?)
3. **Open source timing: Launch GitHub repo now, or after frontend extraction?**
4. **Phase order: Chat first (Phase 1), or go public first (Phase 2)?**
5. **Rewrite scope: Frontend-only extraction first, or full Node.js rewrite?**
6. **Budget: How much API spend per session is acceptable?** (This determines how aggressively we parallelize with subagents)
7. **Timeline: What's the target date for first public URL?**

---

## Research Files (Full Details)

All research documents are in /tmp/ and will be lost on reboot. Key findings are synthesized above, but for deep-dives:

- `/tmp/research_architecture.md` — Full stack comparison (862 lines)
- `/tmp/research_codebase_audit.md` — Every endpoint, every feature, every bug
- `/tmp/research_market.md` — Competitors, pricing, positioning (543 lines)
- `/tmp/research_deployment.md` — Domain, Caddy, hosting, multi-user
- `/tmp/research_skills_audit.md` — All 50 OpenClaw skills mapped to Porter features
- `/tmp/research_chat_help_admin.md` — Chat engine, help system, admin panel research

**Action:** Copy these to `/home/lobster/documents/porter/research/` before the VPS reboots if you want to preserve them.
