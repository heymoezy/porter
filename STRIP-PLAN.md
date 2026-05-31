# Porter Lean-Backbone Strip — Execution Plan (v6.28.0)

Goal: remove the agent-hub "theater" (Forge, RPG, evolution, intelligence-loop,
contact-analyzer, learner, watchers) WITHOUT breaking the sacred consumer surfaces
(bridge/agent-message, chat/stream, recall/docs/*, intellect/*, health) or the core
value (Memory V2, Recall, Dreams, Intellect).

CODE-ONLY. Do NOT drop any DB tables. personas/agent_templates/skills/persona_skills/
template_skills/template_tools/skill_feedback_events stay as shells — consumer paths
read them gracefully when empty.

## STEP 1 — Surgery in hot paths (MUST precede deletions; build must stay green)

1a. backend/src/services/bridge/routing-engine.ts
    - remove `import { awardXP } from '../rpg-engine.js'`
    - remove the `awardXP(...)` call (fire-and-forget). KEEP the persona_skills
      times_selected write (writes to a kept table).

1b. backend/src/services/intellect/workflow-engine.ts
    - remove `import { runSkillEvolution }`
    - remove the `skill_evolve` action type + its handler branch
    - remove any seeded `skill_evolve` workflow registration in this file

1c. backend/src/services/scheduler.ts
    - remove imports: recalculateStats/runRpgRecalculation, extractIntelligencePatterns,
      analyzeSkillEvolution, and the dynamic imports of contact-analyzer + learner
    - remove tick calls: RPG recalc, intelligence patterns, skill evolution, watcher runs
    - remove bootstrapContactAnalysis() + bootstrapLearning() definitions + their start() calls
    - remove the `contact_analysis` and `learning_session` job handler blocks
    - KEEP: health probe, empirical rates, local usage, context pressure, gateway refresh,
      memory validation, scheduled workflows (every_30m/6h/24h/week), dispatch scoring,
      silo cadence (dreams), invite_drip

## STEP 2 — Delete theater service files
- backend/src/services/rpg-engine.ts
- backend/src/services/forge.ts
- backend/src/services/admin/forge.ts
- backend/src/services/evolution-analyzer.ts
- backend/src/services/intelligence-loop.ts
- backend/src/services/contact-analyzer.ts
- backend/src/services/learner.ts
- backend/src/services/watcher-service.ts
- backend/src/services/intellect/skill-evolver.ts

## STEP 3 — Delete theater admin routes + unmount from routes/admin/index.ts
- routes/admin/agents.ts, forge.ts, templates.ts, decisions.ts, evolution.ts, calendar.ts
- routes/admin/battles.ts, forge-runs.ts (already unmounted — delete files)

## STEP 4 — Admin SPA: remove theater tabs/routes
- admin/frontend/app/routes.ts: remove forge, agents/:id, templates/:id, evolution, decisions, calendar
- delete the corresponding route component files
- remove their nav items from sidebar.tsx + top-bar.tsx
- DO NOT touch: dashboard, bridge, recall, dreams, intelligence, sessions, msg-bus,
  routing, env-tools, system, settings, email, approvals, skill-feedback, learnings,
  tools, skills, files, changelog, architecture, design-system

## STEP 5 — Version + verify
- bump 6.27.0 -> 6.28.0 in: backend/package.json, backend/src/index.ts (version: '...'),
  backend/src/routes/v1/health.ts (porter_version: '...')
- `cd backend && npx tsc --noEmit` => 0 errors
- `cd admin/frontend && npx react-router build` => success
- restart, `curl /health` => 6.28.0

NOTE: leave decomposition.ts + approvals.ts + mail untouched (INVESTIGATE-FURTHER —
ambiguous, not confirmed theater). This is a strip, not a gamble.
