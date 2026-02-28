# Porter IA Reframe v1 — From "File Manager" to "Operations Console"

## Why this change
Current IA still reflects a file-manager-first product, while Porter now includes task orchestration, agent operations, policy controls, scheduling, and runtime governance. Hiding this inside Admin Settings reduces discoverability and creates UX mismatch.

Porter should be positioned and structured as an **operations console** with files as one core module (not the entire product).

---

## Product framing (user-facing)
Use language like:
- "Porter Operations"
- "Control Plane"
- "Agent + Task Orchestration"

Avoid framing that implies this is only a file browser.

---

## Navigation model (top-level left nav)
Promote core workflows to first-class navigation items.

## Proposed top-level nav
1. **Overview**
   - system health
   - active agents/tasks
   - key alerts/limits

2. **Files**
   - file browser and mounts
   - uploads/downloads

3. **Tasks**
   - running/queued/completed
   - pause/resume/cancel
   - task history and diagnostics

4. **Agents**
   - agent inventory and status
   - runtime/model/limits
   - usage and reset countdowns

5. **Locations**
   - machine/location registry
   - paths/mounts under each location
   - connectivity + labels

6. **Schedules**
   - cron jobs and automation
   - next run, last run, outcomes

7. **Policies**
   - presets (cost/balanced/speed/quality/local-first)
   - orchestration controls and limits

8. **Audit**
   - privileged action logs
   - actor/action/target/timestamp trails

9. **Settings** (admin/account-level only)
   - Profile
   - Security (password, 2FA when available)
   - API/secrets access controls
   - workspace/system metadata

---

## Settings scope (strictly reduced)
Settings should no longer be a catch-all.

### Keep in Settings
- Profile/account identity
- Password/security credentials
- Personal/user-level defaults
- Tenant/workspace metadata

### Move out of Settings (to top-level modules)
- Task operations
- Agent management/usage
- Locations management
- Scheduling/cron
- Policy tuning
- Audit exploration

---

## UX principles for this reframe
1. **Operational transparency**
   Users should immediately see what Porter is controlling.

2. **Domain-based IA**
   Group by workflows (Tasks, Agents, Policies), not by implementation backend.

3. **Action proximity**
   Controls should live where users observe the state (e.g., pause task from Tasks page).

4. **Progressive disclosure**
   Basic controls first; advanced options in expandable sections.

5. **Terminology consistency**
   Use one term consistently across nav/cards/forms (e.g., Locations not Nodes & Mounts in UI).

---

## Migration plan (low-risk)
## Phase A — Introduce new nav without removing old entry points
- Add top-level modules.
- Keep old Settings links as temporary aliases with "Moved" hints.

## Phase B — Relocate functionality
- Move UI routes/components to new module pages.
- Keep API surfaces backward compatible.

## Phase C — Remove deprecated placements
- Remove duplicate controls from Settings once telemetry confirms adoption.

---

## Required clarifications in Agents UI (carry-over)
Agent cards must display:
- Runtime location (local/remote node)
- Model source (cloud API/local model)
- Limits (metered/unmetered + reset ETA if metered)

This resolves cloud-vs-local confusion when runtime is local but model is cloud.

---

## Acceptance criteria
1. Primary workflows are accessible from top-level nav in one click.
2. Settings contains only profile/security/admin-account concerns.
3. No hidden critical operational controls in Settings.
4. Existing functionality preserved; no regression in tasks/files/agents flows.
5. URL/route migration includes compatibility redirects where needed.
6. Updated docs/screenshots reflect new IA.

---

## Required implementation deliverables
1. IA map (before/after) + route map
2. grouped commits by module migration
3. changed files list
4. screenshots: new nav + each moved module
5. regression test outputs
6. version bump + changelog + migration notes

---

## Notes for Claude
- Do not redesign visual style from scratch; focus on information architecture and placement.
- Keep scope disciplined: move and clarify first, polish second.
- Preserve backward compatibility while deprecating old navigation paths safely.
