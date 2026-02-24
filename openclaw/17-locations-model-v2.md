# Locations Model v2 (Founder Logic)

## Problem with current model
Current UX treats locations like direct folders too early, which is confusing.

The user mental model is:
1. choose machine/location first
2. then choose one or more paths under that machine

Not:
- add arbitrary paths without clear machine context.

---

## Correct model
## Layer 1: Nodes (machines)
Top-level entities should be machines/nodes, for example:
- `srv1379868` (this VPS)
- `mac-mini-1` (future)
- other trusted Tailscale peers

`Documents` is a path, not a location node.

## Layer 2: Mount paths per node
After selecting a node, user adds one or more mounted paths:
- `/home/lobster/documents`
- `/home/websites`
- `/home/lobster/.openclaw/workspace`

Each mount has:
- label
- path
- read/write flag
- visibility in sidebar

---

## Tailscale behavior
When Tailscale is connected:
1. auto-discover peers via `tailscale status --json`
2. auto-populate Node list
3. user selects a node
4. user configures paths for that node manually

Important:
- auto-load nodes, not filesystem paths
- path selection remains explicit (security and clarity)

---

## UI flow v2
1. Settings -> Locations -> Add Node
2. Node Type:
   - This VPS (local)
   - Tailscale peer
   - Manual SSH
3. Select node
4. Add mount paths under node
5. Test path access
6. Save mounts

Sidebar should show:
- Nodes (collapsible)
- Under each node: mounted paths

Example:
- srv1379868
  - Documents
  - Websites
- mac-mini-1
  - Projects
  - Repos

---

## Why this is better
- matches user expectation
- scales naturally to multi-machine setup
- keeps security explicit
- avoids path confusion

---

## Requirements for Claude
1. Replace location-first path model with node-first model.
2. Rename current "Locations" concept to "Nodes & Mounts" in data model and UI.
3. Migrate existing locations into default local node `srv1379868`.
4. Keep backward compatibility and migrate automatically.
5. Tailscale discovery populates peer nodes only; no path auto-mounting.
6. Add clear empty states and helper text.
