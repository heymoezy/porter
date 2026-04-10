# Porter Marketing Strategy

## Positioning

**One-liner:** Porter makes every AI CLI session smarter — automatically.

**Elevator pitch (30s):**
You use Claude, GPT-5, Codex, Gemini, Ollama to build software. Each session starts cold — no memory of what you did yesterday, no rules about your codebase, no awareness of team decisions. Porter sits invisibly between you and your CLIs. It watches, learns corrections, scores quality, and injects the right context into every session. After a week, your CLIs know your codebase rules, your team's decisions, and your preferred patterns. After a month, they stop making the same mistakes. You never "use" Porter — it just makes everything better.

## Target Audience

**Primary:** Software engineers who use 2+ AI CLIs daily
- Heavy Claude Code users who want session continuity
- Teams where multiple developers share codebases with AI
- Developers frustrated by CLIs forgetting context between sessions

**Secondary:** Engineering managers wanting AI governance
- Track what AI agents do across the org
- Ensure consistent coding standards across AI-assisted work
- Audit trail for AI-generated code

## Key Value Props

1. **Session memory that persists** — Porter remembers what happened across sessions. "Yesterday you fixed the auth middleware. Today it knows not to break it again."

2. **Corrections stick** — Say "never use native selects" once. Porter captures it, validates it against similar past corrections, and promotes it to a permanent rule that every future session follows.

3. **Multi-CLI coherence** — Claude, GPT-5, Codex, Gemini, Ollama all share the same brain. A lesson learned in one CLI benefits all others.

4. **Zero setup friction** — Install, configure once, forget. Porter runs in the background. No new UI to learn, no workflow changes.

5. **Your team's AI gets smarter over time** — Every correction, every session, every dispatch feeds back. The system's 12 autonomous workflows continuously improve routing, skills, and memory.

## Competitive Landscape

| Competitor | What they do | Porter's edge |
|------------|-------------|---------------|
| Raw CLIs (Claude, Codex) | Session-by-session, no memory | Porter adds persistent memory + learning |
| Cursor/Windsurf | IDE-integrated AI | Porter is CLI-native, works across ALL tools |
| Custom GPTs/Agents | Pre-configured personas | Porter's personas EVOLVE from real outcomes |
| Team knowledge bases | Static docs | Porter's memory is dynamic — learned from actual usage |

## Monetization Model

**API metering** (already in architecture):
- **Free tier:** 100 dispatches/month, 3 active projects, basic memory
- **Pro ($29/mo):** Unlimited dispatches, unlimited projects, team memory, all gateways
- **Enterprise ($99/mo per seat):** SSO, audit trail, custom agents, priority routing

## Marketing Channels

1. **Product Hunt launch** — "Porter: The invisible brain behind your AI CLIs"
2. **Dev Twitter/X** — Demo videos showing before/after session quality
3. **GitHub README** — Clear install → first value in 5 minutes
4. **HN Show** — Technical deep-dive on the Intellect architecture
5. **Dev blog posts** — "How Porter reduced my correction rate by 60% in 2 weeks"

## Landing Page Structure

```
askporter.app/
├── Hero: "Every AI CLI session, smarter than the last"
│   └── Subtext: "Porter remembers, learns, and evolves — so your CLIs don't start cold"
│   └── CTA: "Get started" → install command
│
├── Problem: "Your CLIs forget everything"
│   └── 3 pain points with icons
│
├── How it works: 3-step visual
│   1. Install Porter (one command)
│   2. Use your CLIs normally (nothing changes)
│   3. Porter learns and improves every session
│
├── Live stats: "Porter has learned X rules, scored Y dispatches, analyzed Z sessions"
│   └── Pull from real /api/v1/intellect/stats endpoint
│
├── Features grid:
│   - Session memory
│   - Correction detection
│   - Multi-CLI support (5 gateways)
│   - 207 built-in skills
│   - 19 AI agents
│   - Auto-evolving quality
│
├── Pricing: Free / Pro / Enterprise
│
├── Footer: GitHub, docs, contact
└──
```

## Implementation Plan

1. Create `/landing.html` — static single-page, no React, fast load
2. Fastify serves it at `/` for unauthenticated visitors
3. Authenticated users redirect to `/dashboard` (admin SPA)
4. Live stats from Intellect API (CORS-safe, read-only)
5. Install command: `npm install -g @porter/cli` (future)

## Current Status

- Domain: askporter.app (live, SSL via Caddy)
- Backend: v6.5.0 running, all APIs operational
- Admin: full SPA at :3001
- No public landing page yet — visitors see admin login
