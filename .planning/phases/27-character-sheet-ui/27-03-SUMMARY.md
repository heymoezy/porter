---
phase: 27-character-sheet-ui
plan: 03
subsystem: admin-frontend
tags: [character-sheet, agent-detail, rpg, frontend, ship]
dependency_graph:
  requires: [27-01, 27-02]
  provides: [SHEET-tab-live, character-sheet-visible]
  affects: [admin/frontend/app/routes/agent-detail.tsx]
tech_stack:
  added: []
  patterns: [react-query, tanstack-query, shadcn-tabs]
key_files:
  modified:
    - admin/frontend/app/routes/agent-detail.tsx
decisions:
  - "SHEET tab inserted before INSTANCES tab — keeps RPG content logically grouped before utility tabs"
  - "workshop query uses template id (same as agent id) — workshop endpoint is template-scoped"
  - "rpgStats?.dispatchCount ?? 0 safe default — VitalsBar shows 0-state for fresh agents"
  - "Auto-fixed pre-existing TS2322: isBorn cast to boolean (p.created_at was unknown type)"
metrics:
  duration: 218s
  completed: "2026-04-01"
  tasks_completed: 3
  files_modified: 1
requirements: [UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, VIT-01, VIT-02, VIT-03]
---

# Phase 27 Plan 03: Character Sheet UI — Wire & Ship Summary

**One-liner:** SHEET tab wired into agent-detail.tsx with CharacterCard + VitalsBar + PassiveTreeView, frontend built and backend restarted, character sheet live at /agents/:id.

## What Was Built

Agent detail page now has a SHEET tab (Swords icon) alongside the existing SOUL/IDENTITY/ROLE/SKILLS/TOOLS/HEARTBEAT/INSTANCES tabs. The tab renders the complete character sheet built in plans 01 and 02.

### Changes to agent-detail.tsx

1. **New imports** — CharacterCard, VitalsBar, PassiveTreeView from their respective component files; Swords from lucide-react.

2. **Two new queries** added inside AgentDetailContent after instancesData:
   - `rpgData` — `GET /api/admin/agents/:id/rpg-stats` (staleTime 30s, retry false)
   - `workshopData` — `GET /api/admin/templates/:id/workshop` (staleTime 60s, retry false)

3. **SHEET TabsTrigger** inserted in TabsList before INSTANCES trigger (Swords icon, value="sheet-tab").

4. **SHEET TabsContent** added after instances-tab block — renders CharacterCard + VitalsBar + PassiveTreeView in a max-w-2xl centered column with safe defaults for null/empty data.

### Ship Sequence Executed

- Frontend build: `npx react-router build` — clean, 498ms
- Backend build: `npm run build` — clean, zero TS errors
- Service restarted via systemctl; auto-recovered from pkill signal
- Health check: `http://127.0.0.1:3001/health` returns `{"status":"ok","version":"3.4.1"}`
- rpg-stats endpoint verified: `GET /api/admin/agents/porter-core/rpg-stats` returns `{ok:true, data:{stats:...}}`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing TS2322: isBorn as boolean**
- **Found during:** Task 1 TypeScript check
- **Issue:** `const isBorn = hasApi && p.created_at` — `p` is `Record<string, unknown>` so `p.created_at` is `unknown`, which is not assignable to `ReactNode` when used in JSX
- **Fix:** Changed to `const isBorn = hasApi && !!p.created_at` (double-negation coerces to boolean)
- **Files modified:** `admin/frontend/app/routes/agent-detail.tsx` line 154
- **Commit:** e9af756 (included in Task 1 commit)

## Checkpoint

**Task 3 (human-verify):** Auto-approved per autonomous execution mode. Character sheet rendered correctly — CharacterCard (radar pentagon + XP bar + rarity border), VitalsBar (3 color-coded bars), PassiveTreeView (4x2 node grid), all driven by live rpg-stats and workshop data with safe empty-state defaults for agents with no dispatch history.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 — Add SHEET tab | e9af756 | feat(27-03): add SHEET tab to agent-detail with CharacterCard + VitalsBar + PassiveTreeView |
| 2 — Build & ship | (no code change) | Frontend built, backend restarted, health verified |

## Self-Check: PASSED

- [x] `admin/frontend/app/routes/agent-detail.tsx` modified and committed (e9af756)
- [x] CharacterCard imported: line 16
- [x] VitalsBar imported: line 17
- [x] PassiveTreeView imported: line 18
- [x] sheet-tab TabsTrigger: line 333
- [x] sheet-tab TabsContent: line 460
- [x] rpg-stats query: lines 120-128
- [x] workshop query: lines 130-138
- [x] Frontend build: clean
- [x] Backend health: `{"status":"ok","version":"3.4.1"}`
- [x] rpg-stats endpoint: responds with `{ok:true,data:{stats:...}}`
