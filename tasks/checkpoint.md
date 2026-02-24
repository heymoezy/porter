# Checkpoint
project: porter
task: P0.5 Locations Model v2 + P1 Agent Usage Tracker
status: in_progress
step: 1 of 8
completed: []
next_action: Implement P0.5 backend — nodes migration, _load_serve_dirs, /api/nodes GET+POST
modified_files:
  - /home/lobster/documents/porter/porter.py
notes: |
  P0.5 (BLOCKER first):
  - Config migration: locations → nodes[0].mounts
  - _load_serve_dirs reads from nodes[*].mounts (fallback to legacy locations)
  - GET /api/nodes: full node tree with mount stats
  - POST /api/nodes: add_node/delete_node/add_mount/update_mount/delete_mount
  - GET /api/locations: backward compat, derives from nodes
  - Sidebar: node-grouped tree (_renderSidebarNodes)
  - Settings: "Nodes & Mounts" tab, renderNodes(), loadNodes()

  P1 (Agent Usage Tracker):
  - Storage: runtime/usage/<agent_id>.json
  - POST /agent-usage/snapshot, GET /agent-usage/current, POST /agent-usage/parse
  - UI: new "Usage" settings tab with countdown + threshold pills

  Version bump: 0.8.0
  Security: all new endpoints auth-gated; mount paths validated via existing safe_resolve
