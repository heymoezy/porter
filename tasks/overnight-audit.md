# Overnight Audit Plan — v0.29.43 → v0.30.x
Target: Comprehensive quality pass, bug fixes, feature completion

## Phase 1: Deep Audit (Research)
Tab-by-tab review of every feature, identify bugs and incomplete work.

### Tabs to audit:
1. **Chat** — message rendering, model selection, agent dispatch, squad leader context, history, streaming
2. **Agents** — squad grouping, card rendering, slide-out panel, skills, identity files, leader badges
3. **Memory** — silos, flow diagram, config editing, session management, extraction, flush
4. **Projects** — cards, detail view, tabs, agent assignment, workflow attachment, files tab
5. **Workflows** — automation list, build workflow, cron jobs, dispatch
6. **Locations** — mount management, path display
7. **Files** — grid/list toggle, breadcrumbs, color icons, upload, preview
8. **Models** — provider list, status, ranking
9. **Extensions** — capability detection, install links, Kraken
10. **Skills** — OpenClaw skill browser, per-agent skills, squad skills
11. **Logs** — MissionLog viewer, alert engine

## Phase 2: Fix & Improve
- Bug fixes found during audit
- Memory extraction completion (Moe mentioned it's incomplete)
- Design improvements (consult GPT-5.4)
- System dialogs remaining (any more confirm/prompt calls)

## Phase 3: Polish
- Consistent styling
- Loading states
- Error handling
- Empty states

## Priorities:
- P0: Bugs that break functionality
- P1: Incomplete features Moe asked for
- P2: Design/UX improvements
- P3: Nice-to-haves
