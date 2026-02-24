# Checkpoint
project: porter
task: P0.5 Locations Model v2 + P1 Agent Usage Tracker
status: complete
step: 8 of 8
completed:
  - [x] P0.5 backend — load_config migration, _load_serve_dirs, /api/nodes GET+POST
  - [x] P0.5 backward compat — /api/locations derives from nodes
  - [x] P1 backend — /agent-usage/snapshot, /agent-usage/current, /agent-usage/parse
  - [x] Frontend — _renderSidebarNodes, renderNodes, node CRUD JS
  - [x] Frontend — Usage tab JS (loadUsage, renderUsage, parseUsageRaw, snapshot form)
  - [x] Settings HTML — Nodes & Mounts tab, Usage tab
  - [x] Bug fix — GET /agent-usage/current was in do_POST, moved to do_GET
  - [x] Changelog v0.8.0 added, compile clean, service running, API tests pass
  - [x] Committed: e2c6c58
next_action: n/a — complete. Next sprint: P2 Task Operations Panel
modified_files:
  - /home/lobster/documents/porter/porter.py
notes: |
  All tests passed:
  - Auth gate: /api/nodes + /agent-usage/current → 401 without cookie ✓
  - GET /api/nodes: node tree with mount stats ✓
  - POST /api/nodes add_mount + delete_mount round-trip ✓
  - GET /api/locations backward compat (flat view, node_id field added) ✓
  - POST /agent-usage/snapshot → 200, stored to runtime/usage/<id>.json ✓
  - GET /agent-usage/current → enriched per-agent snapshots ✓
  - POST /agent-usage/parse: 75% → degraded, 100% → exhausted, reset parsed ✓
  - Missing agent_id → 400 ✓

  Config migration verified: porter_config.json now has nodes[] with srv1379868
  local node containing vps-home and websites mounts.

  Next: P2 Task Operations Panel (running tasks, pause/resume/cancel, concurrency limits)
