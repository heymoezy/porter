# Stack Research

**Domain:** Agent RPG System + Battle Arena — Porter v4.0 The Arena
**Researched:** 2026-03-29
**Confidence:** HIGH (library versions verified via npm/official sources; existing stack read from live package.json files)

---

## Scope: What This Document Covers

This is the **v4.0 addendum** to the existing STACK.md chain. Prior versions covered:
- v3.0 (2026-03-25): circuit breakers (opossum), dispatch queues (p-queue), CLI binary detection (which), bridge_gateways / bridge_models schema
- v2.0 (2026-03-21): streaming chat, OpenAPI, rate limiting, CRM, collaborative sessions, agent templates
- v1.0 (2026-03-20): scheduling, SSE, GitHub/email/calendar, WhatsApp, strangler-fig migration

**Do not re-research anything in those prior sections.** The confirmed working stack includes all of those libraries. This document covers only what is NEW for v4.0 RPG capabilities.

### Confirmed Existing Stack (Do Not Change)

| Already Installed | Version | Location |
|---|---|---|
| react | 19.2.4 | admin/frontend |
| react-router | 7.13.1 | admin/frontend |
| tailwindcss | 4.2.1 | admin/frontend |
| shadcn / radix-ui | 4.1.0 / 1.4.3 | admin/frontend |
| @tanstack/react-query | 5.91.3 | admin/frontend |
| motion (framer-motion) | 12.38.0 | NOT YET INSTALLED — add for v4.0 |
| fastify | 5.7.4 | backend |
| drizzle-orm | 0.45.1 | backend |
| pg | 8.20.0 | backend |
| opossum | 9.0.0 | backend |
| p-queue | 9.1.0 | backend |

---

## New Libraries Needed for v4.0

### Radar / Pentagon Chart: `recharts`

**What the feature needs:** The agent character card must display 5 RPG stats (QTY, SPD, EFF, REL, COMBO) as a pentagon/radar chart. This is the central visual element of every agent card — it must render correctly at small sizes (card view), medium sizes (detail panel), and large sizes (battle arena scoreboard). It needs smooth animation when stats update.

**Recommended library:** `recharts` v3.

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| recharts | 3.8.1 | RadarChart + radar polygon for 5-stat pentagon | React-native (not a D3 wrapper with a React facade); TypeScript generics on `dataKey` catch stat name typos at compile time; React 19 fully supported in v3 (confirmed); RadarChart component renders as SVG, no Canvas — GPU-free and CPU-light for the 2vCPU VPS; built-in animation on data changes via `isAnimationActive` prop |

**Why recharts over alternatives:**
- **D3.js direct:** D3 requires imperative DOM manipulation, fighting React's rendering model. Custom pentagon with D3 = 200+ lines of SVG math. Recharts wraps this in 15 lines.
- **Victory / Nivo:** Both are fine but heavier bundle sizes. Recharts is already a popular choice in the Porter ecosystem context (shadcn examples link to it); adding it stays consistent with the design system orientation.
- **Hand-coded SVG pentagon:** Viable for a static chart but stat animations, hover tooltips, and responsiveness become manual work. Recharts handles all three.

**RadarChart integration pattern:**
```typescript
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from 'recharts';

const stats = [
  { stat: 'QTY', value: agent.statQuality },
  { stat: 'SPD', value: agent.statSpeed },
  { stat: 'EFF', value: agent.statEfficiency },
  { stat: 'REL', value: agent.statReliability },
  { stat: 'COMBO', value: agent.statCombo },
];

<ResponsiveContainer width="100%" height={200}>
  <RadarChart data={stats}>
    <PolarGrid />
    <PolarAngleAxis dataKey="stat" />
    <Radar dataKey="value" fill={rarityColor} fillOpacity={0.4} stroke={rarityColor} isAnimationActive />
  </RadarChart>
</ResponsiveContainer>
```

**Install location:** `admin/frontend` only. Stats are display-only on frontend; calculation lives in backend.

---

### Animations / Game-Feel: `motion` (formerly framer-motion)

**What the feature needs:** Level-up sequences, rarity border pulses, forge gacha reveal animation, battle KO sequence, XP bar fill animation, star unlock celebration. These must feel like a mobile game, not a webpage. Spring physics, sequence orchestration, and enter/exit animations are all required.

**Recommended library:** `motion` v12.

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| motion | 12.38.0 | Spring animations, layout transitions, sequence orchestration for game-feel events | React 19 native support confirmed in v12 (the library was rebuilt to support React 19 concurrent rendering); hybrid engine runs animations via Web Animations API for 120fps; spring physics for KO screen bounce and level-up pop; `animate()` imperative API for sequencing forge reveal steps; `AnimatePresence` for star unlock modal enter/exit; 7KB gzip |

**Import pattern (v12 package name change):**
```typescript
// New package: import from 'motion/react' not 'framer-motion'
import { motion, AnimatePresence, useAnimate } from 'motion/react';
```

**Why motion over alternatives:**
- **CSS keyframes in Tailwind v4:** Tailwind v4's `@theme` block can define custom keyframes (e.g., `@keyframes rarity-pulse`). This is the right approach for passive border glows (always-on CSS). But for event-driven sequences (forge reveal triggers a 4-step animation cascade), Tailwind keyframes alone have no orchestration — you need JS control. Use both: Tailwind for idle/passive effects, motion for triggered events.
- **React Spring:** Similar capability but motion has better React 19 support and a larger ecosystem. motion is the de-facto standard for React game-feel in 2026.
- **GreenSock (GSAP):** GSAP is excellent but has a proprietary license for commercial use. Porter is SaaS — licensing risk is not worth it when motion covers the same ground.

**Key patterns for RPG use:**

*Level-up sequence:*
```typescript
const [scope, animate] = useAnimate();
async function playLevelUp() {
  await animate(scope.current, { scale: 1.2 }, { duration: 0.15 });
  await animate('.xp-bar', { scaleX: 1 }, { duration: 0.8, ease: 'easeOut' });
  await animate('.level-badge', { scale: [0, 1.3, 1] }, { duration: 0.4 });
}
```

*Rarity border idle pulse (CSS via Tailwind — NOT motion):*
```css
/* in app.css */
@keyframes rarity-legendary {
  0%, 100% { box-shadow: 0 0 8px 2px gold; }
  50% { box-shadow: 0 0 20px 6px gold; }
}
```

**Install location:** `admin/frontend` only.

---

### Particle Effects: `@tsparticles/react` + `@tsparticles/engine`

**What the feature needs:** Forge gacha reveal — the moment an agent is born, particles explode from the card. Mythic rarity should have persistent particle effects around the border. Battle victory screen should have confetti/burst.

**Recommended library:** `@tsparticles/react` v3 + `@tsparticles/engine`.

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| @tsparticles/react | 3.0.0 | React wrapper for particle effects | Official tsParticles React component; Canvas-based so zero DOM overhead; supports confetti, explosions, and ambient particle fields; TypeScript-first; lazy-loadable so forge page pays the cost, not every page |
| @tsparticles/engine | 3.x | Core engine (peer dep of @tsparticles/react) | Separate from the React wrapper; allows tree-shaking of unused particle shapes |

**Why tsparticles over PixiJS for particles:**
- tsparticles is purpose-built for particle effects. PixiJS is a full 2D rendering engine.
- For forge reveal and battle burst, tsparticles is 20KB. PixiJS is 400KB+.
- tsparticles configs are JSON-declarative — easy to swap effect presets per rarity tier.

**Usage pattern:**
```typescript
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadFull } from 'tsparticles'; // or loadSlim for minimal

// Lazy-init engine once per app lifecycle
await initParticlesEngine(async (engine) => {
  await loadFull(engine);
});

// Forge reveal burst — triggered on agent birth
<Particles options={legendaryBurstConfig} />
```

**Install location:** `admin/frontend` only.

---

### Battle Arena Rendering: `@pixi/react` + `pixi.js`

**What the feature needs:** Spectator mode for live battles — two agents generating tokens simultaneously, with live token counters, a judge commentary stream, and dramatic KO animation when a winner is declared. This is the "Arena" tab in Forge. It needs 60fps smooth animation of streaming text, progress bars racing in real-time, and a stage backdrop.

**Recommended library:** `@pixi/react` v8 + `pixi.js` v8.

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| @pixi/react | 8.0.5 | React JSX bindings for PixiJS canvas | Built from ground up for React 19 and PixiJS v8; new JSX pragma maps all PixiJS objects to `<pixi.Sprite>` etc.; WebGL-accelerated canvas |
| pixi.js | 8.x | 2D rendering engine (peer dep) | WebGL rendering = 60fps token counter animations even under real-time SSE load; GPU-composited canvas so the rest of the React tree is not affected |

**Important scope constraint:** PixiJS is ONLY for the Arena battle view. It is not for the character card, stat pentagon, or any list/table UI. Using PixiJS outside the arena is over-engineering.

**Why PixiJS for arena specifically:**
- The battle view has two simultaneously streaming text blocks (agent A vs agent B responses), token counters incrementing in real-time from SSE events, and a judge score reveal. All of this is data-driven animation at high frequency (~10-30 events/second).
- DOM-based animation at this frequency causes layout reflow jank even with motion. PixiJS moves this to a WebGL canvas that is composited by the GPU separately from the React DOM.
- `@pixi/react` v8 is the first version designed specifically for React 19's concurrent rendering model — previous versions had reconciler conflicts.

**Fallback if PixiJS is too complex for Phase 1 of Arena:** Use `<canvas>` + `requestAnimationFrame` manually for the token counter race. Defer full PixiJS integration to a later phase. The arena still works — it just won't have as much visual polish.

**Install location:** `admin/frontend` only.

---

### Sound Effects: `use-sound` (backed by howler.js)

**What the feature needs:** Battle hit sounds, level-up chime, forge hammer strike, gacha reveal fanfare, rarity unlock jingle. All are short one-shot sound effects triggered by user interactions or game events.

**Recommended library:** `use-sound` v5.

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| use-sound | 5.0.0 | React hook for triggering sound effects | ~1KB gzip bundle impact (defers to howler async); API is `const [play] = useSound('/sounds/level-up.mp3')` then `play()` on event; howler.js handles Web Audio API with HTML5 Audio fallback; sprite support for bundling all game sounds into one file (reduces HTTP requests) |
| howler | 2.2.4 | Peer dep pulled in by use-sound | Not imported directly — use-sound wraps it |

**Why use-sound over direct howler.js:**
- use-sound is a React-idiomatic hook. howler.js is imperative. In a React 19 codebase, the hook approach avoids useEffect cleanup races.
- use-sound loads audio asynchronously after the component mounts — no blocking page load.
- `use-sound` v5.0.0 has TypeScript types bundled.

**Why sound should be optional (important constraint):**
Sound must be off by default and only enabled via a user preference toggle. Many users are in office environments. Implement a global `soundEnabled` zustand store slice. `use-sound` supports `{ soundEnabled }` option natively.

**Sound asset requirement:** All game sounds must be self-hosted in `admin/frontend/public/sounds/`. No CDN dependencies. Use a single sprite file for efficiency (howler.js supports this).

**Install location:** `admin/frontend` only.

---

### Elo Rating Engine: Custom Implementation (No External Package)

**What the feature needs:** Calculate Elo rating changes after each battle. Standard 1200 default, per-specialty-domain Elo tracking, and K-factor scaling (higher K for new agents to allow faster rating adjustment).

**Recommendation:** Write 20 lines of TypeScript in the backend. Do not add an npm package.

**Rationale:**
- The Elo formula is 4 lines of math. No npm package is justified for this.
- Available npm packages (`elo-rating`, `@studimax/elo`, `elo-rating-system`) all implement the same formula with no added value for Porter's use case.
- Custom implementation lets the team tune K-factor per star level (new agents converge faster to their true rating), add per-specialty domain Elo (each agent has separate ratings for python-debug, research, etc.), and extend with confidence intervals later.

**Implementation (put in `backend/src/services/elo.ts`):**
```typescript
// Standard Elo with configurable K-factor
export function calculateElo(
  ratingA: number,
  ratingB: number,
  outcome: 'A' | 'B' | 'draw',
  kFactor = 32
): { newA: number; newB: number; delta: number } {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const scoreA = outcome === 'A' ? 1 : outcome === 'draw' ? 0.5 : 0;
  const delta = Math.round(kFactor * (scoreA - expectedA));
  return {
    newA: ratingA + delta,
    newB: ratingB - delta,
    delta,
  };
}

// K-factor by star level — new agents adjust faster
export function kFactorForStars(stars: number): number {
  return stars <= 2 ? 40 : stars === 3 ? 32 : 24;
}
```

**Install location:** Backend only. No frontend npm package.

---

### Agent Import Parser: Custom Implementation (No External Package)

**What the feature needs:** Import agents from LangGraph JSON config, CrewAI YAML/JSON, AutoGen JSON, and a Porter-native JSON spec. Extract: name, role, system prompt, tool list, model preference.

**Recommendation:** Write a `services/agent-importer.ts` with format-specific parsers. Do not add schema validation packages beyond Zod (already installed).

**Rationale:**
- LangGraph, CrewAI, and AutoGen all have different, evolving config formats. No npm package tracks these reliably.
- The import feature is a **best-effort mapping** into Porter's agent schema, not a full bidirectional sync. Porter extracts what it can and presents a prefilled forge form. The user completes the rest.
- Zod 4.3.6 is already installed — use it for parsing/validating the inbound JSON, not a separate schema library.

**Import target fields per format:**

| Source Format | Fields Porter Extracts | Porter Maps To |
|---|---|---|
| LangGraph JSON (`langgraph.json`) | `name`, `system_prompt`, `tools[]` | agent name, system prompt (armor slot), tool list |
| CrewAI YAML/JSON | `role`, `goal`, `backstory`, `tools[]`, `llm` | agent name, system prompt, tool list, model preference |
| AutoGen JSON | `name`, `system_message`, `description` | agent name, system prompt |
| Porter JSON (`porter-agent.json`) | All RPG fields | Direct import into agent_templates |

**A2A Protocol note:** The Agent2Agent (A2A) protocol defines an `AgentCard` JSON at `/.well-known/agent-card.json`. Porter should both expose its own agents via A2A AgentCard format and accept import from external A2A-compliant agents. This is the most future-proof interoperability target. Build the Porter export format to match A2A AgentCard schema from the start.

**Install location:** Backend only. No new npm dependencies.

---

### CSS Animations for Rarity Borders: Tailwind v4 `@theme` Keyframes

**What the feature needs:** Always-on animated borders for Epic (pulsing purple glow), Legendary (animated gold border), and Mythic (particle effects). These are passive CSS effects that are always running on agent cards, not triggered events.

**Recommendation:** Define custom keyframes directly in the Tailwind v4 CSS file using the `@theme` block. No additional library.

**Tailwind v4 pattern:**
```css
/* app/app.css */
@theme {
  --animate-rarity-epic: rarity-epic 2s ease-in-out infinite;
  --animate-rarity-legendary: rarity-legendary 1.5s ease-in-out infinite;
  --animate-rarity-mythic: rarity-mythic 3s linear infinite;
}

@keyframes rarity-epic {
  0%, 100% { box-shadow: 0 0 8px 2px rgb(168 85 247 / 0.6); }
  50% { box-shadow: 0 0 20px 6px rgb(168 85 247 / 1); }
}

@keyframes rarity-legendary {
  0% { box-shadow: 0 0 10px 3px rgb(234 179 8 / 0.7); border-color: rgb(234 179 8); }
  50% { box-shadow: 0 0 25px 8px rgb(234 179 8 / 1); border-color: rgb(253 224 71); }
  100% { box-shadow: 0 0 10px 3px rgb(234 179 8 / 0.7); border-color: rgb(234 179 8); }
}
```

Then in component:
```typescript
const rarityClass = {
  common: 'border-zinc-500',
  rare: 'border-blue-500',
  epic: 'border-purple-500 animate-rarity-epic',
  legendary: 'border-yellow-500 animate-rarity-legendary',
  mythic: 'border-red-500 animate-rarity-mythic',
}[agent.rarity];
```

**Why Tailwind keyframes instead of motion for this:** Passive always-on animations must not trigger React re-renders. CSS animations run entirely in the browser's compositor thread. motion's `animate()` runs on the JS thread. For 50 agent cards on a page, CSS is the only option that stays performant.

---

### Backend Schema Additions: Drizzle + PostgreSQL (No New Libraries)

All RPG schema changes use existing Drizzle ORM + PostgreSQL 16 infrastructure. New tables use `integer().generatedAlwaysAsIdentity()` per established project patterns.

**New tables required (no new npm deps):**

| Table | Purpose |
|---|---|
| `agent_battles` | Battle records: agent IDs, prompt, judge scores, winner, Elo delta |
| `agent_elo_ratings` | Per-agent per-specialty Elo ratings (separate from base Elo) |
| `agent_xp_events` | Immutable XP event log: source, amount, timestamp (feeds level calc) |
| `agent_specialties` | Emergent specialty tracking: domain, win_rate, battle_count |
| `battle_judge_scores` | Individual judge votes (3 judges per battle for ensemble) |

**RPG fields added to `agent_templates`:**

```typescript
// New columns on existing agent_templates table
statQuality: integer('stat_quality').default(0),
statSpeed: integer('stat_speed').default(0),
statEfficiency: integer('stat_efficiency').default(0),
statReliability: integer('stat_reliability').default(0),
statCombo: integer('stat_combo').default(0),
rarity: text('rarity').default('common'),   // common|rare|epic|legendary|mythic
stars: integer('stars').default(0),          // 0-5
level: integer('level').default(1),          // 1-100
xpTotal: integer('xp_total').default(0),
eloBase: integer('elo_base').default(1200),
characterClass: text('character_class'),      // striker|guardian|fixer|amplifier|orchestrator
gearWeapon: text('gear_weapon'),             // gateway ID
gearArmor: text('gear_armor'),              // system prompt variant ID
gearAccessory1: text('gear_accessory_1'),   // primary tool ID
gearAccessory2: text('gear_accessory_2'),   // RAG/memory pipeline ID
specialties: jsonb('specialties').default(sql`'[]'::jsonb`),
statsLastCalculatedAt: doublePrecision('stats_last_calculated_at'),
```

**Stat calculation engine:** Derived from `dispatch_log` table (already exists). No new libraries. Runs as a scheduled job (toad-scheduler, already installed) and on-demand via `POST /api/v1/agents/:id/recalculate-stats`. Stats are read-only via API — no manual overrides.

---

## Installation

```bash
# Frontend — admin/frontend
cd /home/lobster/documents/porter/admin/frontend

# Radar/pentagon chart
npm install recharts

# Spring animations + game-feel sequences
npm install motion

# Particle effects for forge reveal + battle burst
npm install @tsparticles/react @tsparticles/engine tsparticles

# Battle arena WebGL renderer (install but phase the implementation)
npm install @pixi/react pixi.js

# Sound effects (React hook wrapping howler.js)
npm install use-sound
npm install -D @types/howler
```

```bash
# Backend — NO new npm packages needed for v4.0
# Elo: custom 20-line implementation in backend/src/services/elo.ts
# Agent import: custom parsers in backend/src/services/agent-importer.ts
# All new tables via Drizzle schema additions + drizzle-kit push
```

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| D3.js | Imperative DOM manipulation fights React rendering; 200+ lines for a pentagon chart | recharts (wraps D3 declaratively) |
| GSAP (GreenSock) | Commercial license required for SaaS; licensing risk not justified | motion v12 (MIT licensed) |
| react-spring | Same capability as motion, but motion has better React 19 support and larger community in 2026 | motion v12 |
| LiteLLM / LangServe | For agent import, Porter needs the agent definition, not the runtime. These are server-side runtimes, not importers | Custom agent-importer.ts parser |
| Victory / Nivo charts | Heavier bundles than recharts for the same RadarChart; recharts has cleaner React 19 TypeScript generics | recharts 3.8.1 |
| External Elo npm package | The formula is 4 lines; all available packages add zero value over writing it directly | Custom elo.ts (20 lines) |
| chart.js / react-chartjs-2 | Canvas-based (recharts is SVG, which is lighter for this scale); less ergonomic TypeScript types | recharts |
| PixiJS for non-arena surfaces | PixiJS is 400KB+; using it for character cards or stat charts is gross over-engineering | recharts + motion for non-arena surfaces |
| react-particles (old package) | Deprecated in favor of @tsparticles/react; old package no longer maintained | @tsparticles/react v3 |
| Three.js / R3F | 3D rendering is not in scope for v4.0; would consume the VPS RAM budget | PixiJS for 2D arena; defer 3D |
| Redux | Existing stack uses Zustand; adding Redux for RPG state creates two state systems | Extend Zustand store with rpg slice |
| BullMQ / Redis for battle queue | Single-server VPS; p-queue (already installed) is sufficient for battle job queue | p-queue (already installed) |

---

## Alternatives Considered

| Recommended | Alternative | Why Alternative Was Rejected |
|-------------|-------------|-------------------------------|
| recharts (RadarChart) | Hand-coded SVG pentagon | SVG path math is non-trivial; no built-in responsive sizing or animation; recharts handles all three in 15 lines |
| recharts (RadarChart) | Victory charts | Similar bundle size but recharts has better React 19 TypeScript generics in v3; both are valid choices but recharts is more widely adopted in shadcn ecosystem |
| motion v12 | CSS-only animations | CSS cannot orchestrate multi-step sequences (level-up cascade, forge reveal); CSS handles passive rarity borders only |
| @tsparticles/react | Manual Canvas 2D particles | tsparticles provides declarative JSON configs for different rarity burst presets; writing particle physics from scratch is 3+ days |
| @pixi/react v8 | DOM-based battle arena | SSE at 10-30 events/second causes React DOM jank; WebGL compositor is the only path to smooth token counters |
| Custom Elo implementation | elo-rating npm package | Formula is 4 lines; package adds no value; custom allows K-factor tuning per star level |
| Tailwind v4 keyframes | motion for rarity borders | Passive always-on animations must not re-render React components; CSS compositor is the only performant approach for 50 cards on screen |
| A2A AgentCard format | Proprietary Porter export format | A2A is the emerging 2026 standard; LangGraph + CrewAI + Azure are all adopting it; building to this format now avoids a migration later |

---

## Version Compatibility

| Package | Version | React 19 Compatible | Notes |
|---------|---------|---------------------|-------|
| recharts | 3.8.1 | YES | v3 added React 19 support; TypeScript generics on dataKey |
| motion | 12.38.0 | YES | v12 built for React 19 concurrent rendering; import from `motion/react` not `framer-motion` |
| @tsparticles/react | 3.0.0 | UNVERIFIED | Last published ~April 2024; React 19 compatibility not confirmed. If issues arise, use canvas 2D fallback for particle effects |
| @pixi/react | 8.0.5 | YES | v8 designed exclusively for React 19; new JSX pragma |
| pixi.js | 8.x | YES | Peer dep of @pixi/react v8 |
| use-sound | 5.0.0 | LIKELY | Last updated ~1 year ago; no explicit React 19 confirmation. Fallback: use howler.js directly with a ref |
| @types/howler | latest | N/A | Dev dep for TypeScript types |

---

## Integration Points with Existing Stack

| New Capability | Attaches To | Integration Notes |
|---|---|---|
| Stat pentagon (recharts) | admin/frontend agent detail + card components | `ResponsiveContainer` wraps `RadarChart`; data fed from React Query `useAgent()` hook that hits `GET /api/v1/agents/:id` |
| Animations (motion) | admin/frontend Forge, battle result, character card | `AnimatePresence` wraps modal/toast entries; `useAnimate()` for level-up sequence; motion does NOT touch backend |
| Particles (@tsparticles) | admin/frontend Forge birth screen only | Lazy-loaded on demand — not imported in global bundle; triggered by `forgeBirth` event from SSE |
| Arena renderer (PixiJS) | admin/frontend Arena tab inside Forge page | Isolated `<ArenaCanvas />` component; consumes SSE stream `battle:token` events; no interaction with React DOM outside canvas bounds |
| Sound (use-sound) | admin/frontend global + per-component | Global `soundEnabled` flag in Zustand store; per-component: `const [playLevelUp] = useSound('/sounds/level-up.mp3', { soundEnabled })` |
| Elo engine | backend/src/services/elo.ts | Called from battle resolution endpoint `POST /api/v1/battles/:id/resolve`; updates `agent_elo_ratings` table; emits `battle:resolved` SSE event |
| Agent importer | backend/src/services/agent-importer.ts | Called from `POST /api/v1/agents/import`; returns prefilled agent template JSON for the Forge Workshop form; does not create agent automatically |
| RPG stat recalculation | backend/src/services/rpg-stats.ts | Scheduled daily via toad-scheduler (already installed); also triggered on-demand; reads `dispatch_log`, writes to `agent_templates` RPG columns |
| Rarity CSS animations | admin/frontend app.css via Tailwind v4 @theme | Utility classes like `animate-rarity-legendary` applied to card border; zero JS runtime cost |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| recharts v3.8.1 + React 19 | HIGH | npm confirmed v3.8.1 (March 2026); React 19 support issue closed as resolved in v3 |
| motion v12.38.0 + React 19 | HIGH | npm confirmed v12.38.0 (March 2026); React 19 concurrent rendering support explicit in v12 release notes |
| @pixi/react v8.0.5 + React 19 | HIGH | npm confirmed v8.0.5 (Dec 2025); PixiJS docs state "designed exclusively for React 19" |
| use-sound v5 + React 19 | MEDIUM | Latest version 5.0.0, last updated ~1 year ago. No explicit React 19 confirmation. Likely works but flag for testing. Fallback: howler.js with useRef |
| @tsparticles/react v3.0.0 + React 19 | MEDIUM | v3.0.0 published ~April 2024; no recent maintenance activity. React 19 compatibility not confirmed. Flag for testing. Fallback: canvas 2D particles |
| Custom Elo implementation | HIGH | Standard formula; no external state; 20-line implementation with no risk surface |
| Custom agent import parsers | HIGH | LangGraph/CrewAI/AutoGen formats are documented; Zod validates inbound JSON; A2A AgentCard format is published spec |
| Tailwind v4 @theme keyframes | HIGH | Tailwind v4 CSS-first config is confirmed; @theme block for custom keyframes is documented |
| RPG schema (Drizzle + PostgreSQL) | HIGH | Follows established project patterns; all field types confirmed in existing schema.ts |

---

## Sources

- [recharts npm](https://www.npmjs.com/package/recharts) — v3.8.1 confirmed, HIGH confidence
- [recharts React 19 issue](https://github.com/recharts/recharts/issues/4558) — React 19 support confirmed in v3, HIGH confidence
- [motion npm](https://www.npmjs.com/package/motion) — v12.38.0 confirmed March 2026, HIGH confidence
- [motion React 19 docs](https://motion.dev/docs/react) — React 19 concurrent rendering support, HIGH confidence
- [@pixi/react npm](https://www.npmjs.com/package/@pixi/react) — v8.0.5, React 19 exclusive design, HIGH confidence
- [PixiJS React v8 announcement](https://pixijs.com/blog/pixi-react-v8-live) — "designed exclusively for React 19", HIGH confidence
- [use-sound npm](https://www.npmjs.com/package/use-sound) — v5.0.0, last published ~1 year ago, MEDIUM confidence for React 19
- [howler.js npm](https://www.npmjs.com/package/howler) — v2.2.4, last published 3 years ago, stable, HIGH confidence
- [@tsparticles/react npm](https://www.npmjs.com/package/@tsparticles/react) — v3.0.0, last published ~April 2024, MEDIUM confidence for React 19
- [A2A Protocol Specification](https://a2a-protocol.org/latest/specification/) — AgentCard JSON schema for agent export format, HIGH confidence
- [Tailwind CSS v4 animation docs](https://tailwindcss.com/docs/animation) — @theme keyframes pattern, HIGH confidence
- [LangGraph A2A integration docs](https://docs.langchain.com/langgraph-platform/autogen-integration) — agent interop context, MEDIUM confidence
- admin/frontend/package.json — confirmed existing deps (react 19.2.4, tailwindcss 4.2.1, shadcn 4.1.0), HIGH confidence
- backend/package.json — confirmed existing deps (opossum, p-queue, fastify 5.7.4), HIGH confidence
- research/agent-rpg-design-v2.md — visual stack requirements (PixiJS, tsparticles, Howler.js), read directly

---

*Stack research for: Porter v4.0 The Arena — Agent RPG System, Battle Arena, Forge Unification (addendum to v3.0 STACK.md)*
*Researched: 2026-03-29*
