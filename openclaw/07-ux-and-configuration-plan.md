# Porter UX and Configuration Plan
## From backend-first to user-ready product flow

## Problem summary
Current implementation has useful backend capabilities, but user-facing setup is unclear:
- locations feel hardcoded
- agent permissions are not first-class in UI
- onboarding sequence is confusing
- Uploads appears as a top-level location even when users do not want it

This creates cognitive load and weak adoption.

---

## Product principle
Porter should guide users in this order:
1. Connect locations
2. Connect agents
3. Set permissions
4. Start using memory/checkpoint features

Not the other way around.

---

## New information architecture (left sidebar)
Recommended top-level sections:
1. **Locations**
2. **Agents**
3. **Projects** (optional)
4. **Activity**
5. **Settings**

Remove default visible “uploads” as a fixed root.
- Keep upload as an action inside any writable location.
- If needed, “Uploads” can be an optional location users add manually.

---

## Onboarding flow (first run)
### Step 1: Welcome
- Explain Porter in one sentence: files + optional memory layer.

### Step 2: Add first location
Location types shown as cards:
- Local directory
- Remote server (SSH)
- GitHub repository
- Existing Porter memory store (advanced)

### Step 3: Connect first agent
- OpenClaw
- Claude Code
- Other (manual token)

### Step 4: Assign permission profile
Profiles:
- Viewer (read only)
- Contributor (read + write notes/checkpoints)
- Operator (read + write + finalize)
- Admin (full access + settings)

### Step 5: Verify and finish
- test connection
- test write permission
- show “ready” checklist

---

## Settings redesign (tabs)
In Settings, expose everything explicitly in tabs:

## Tab A — Locations
- list current locations
- add/edit/remove location
- test connection button
- set default landing location
- reorder locations

## Tab B — Agents
- list registered agents (name, type, status, last seen)
- create/revoke agent key
- rotate key
- set agent role
- set agent allowed namespaces

## Tab C — Permissions
- matrix view: agent x namespace x capability
- capabilities:
  - read
  - write
  - checkpoint
  - finalize
  - admin

## Tab D — Memory
- hot/warm/cold memory policy
- pointer length limit
- checkpoint frequency
- retention settings

## Tab E — Runtime
- interrupted task handling
- lease timeout defaults
- resume policy (auto/manual)

## Tab F — Security
- auth mode
- session timeout
- ip restrictions (future)
- audit export

---

## Permission model (recommended)
### Roles
- **viewer**: search/fetch only
- **writer**: viewer + upsert + pointer + checkpoint
- **operator**: writer + finalize + lease takeover within scope
- **admin**: full control

### Namespace-scoped control
Permissions should be granted per namespace:
- projects
- compliance
- runtime
- pointers
- decisions

Example:
- Claude Code on Mac mini: writer on `projects/*`, viewer on `compliance/*`
- OpenClaw on VPS: operator on `runtime/*`, writer on `compliance/*`

---

## Why this solves the mess
- removes hidden defaults
- makes agent permissions explicit and auditable
- aligns setup sequence with actual user intent
- keeps advanced features available without forcing complexity early

---

## Prioritized implementation plan
## Phase 1 (UI foundation)
1. Add Settings tabs (Locations, Agents, Permissions)
2. Move uploads from root to action model
3. Add onboarding wizard with required steps

## Phase 2 (agent control)
4. Agent registry UI
5. API key lifecycle (create/revoke/rotate)
6. Role assignment UI

## Phase 3 (policy depth)
7. Namespace permission matrix
8. Runtime and memory policy controls
9. Activity/audit UI improvements

---

## UX copy guidelines (important)
- Avoid technical jargon in primary labels.
- Use helper text under each setting.
- Every destructive action needs a one-line consequence warning.
- Include “Test” buttons wherever configuration can fail.

---

## Definition of done
- A new user can set up first location + first agent in under 5 minutes.
- Users can clearly see and edit agent permissions without editing files.
- Uploads are context-aware actions, not confusing fixed roots.
- No hardcoded-only setup remains for core onboarding.

---

## Build instruction to Claude Code
Implement this plan without breaking existing file workflows.
Prioritize user-facing settings and onboarding before adding more backend endpoints.
