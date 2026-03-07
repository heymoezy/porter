# Checkpoint — DEPRECATED
# This file is no longer the source of truth for task state.
# All tasks are now tracked in runtime/task-registry/*.json
# This file is kept for historical reference only.
# Last migrated: 2026-03-01 11:09:47 UTC
#
# Checkpoint
project: Porter
task: v0.25.8 — Chat Dispatch, Model Ranking, Logs Tab, UX Cleanup
status: complete
step: 7 of 7
completed:
  - [x] Fix A: Remove ? help buttons from tab headers
  - [x] Fix C: Files tab right pane (inspected — rendering logic functional)
  - [x] Merge Bridge Control dispatch into Chat tab + fix input to bottom
  - [x] Model ranking (1-4) + routing mode toggle
  - [x] Remove "Used by" from model cards + change to "Default model"
  - [x] Workflows cron run display improvement + version bump
  - [x] Admin tab → Logs (removed Health, Services, Config, Quick Stats, Rules)
next_action: v0.25.9 — Memory tab overhaul (card consistency, file editor, shared architecture)
modified_files:
  - /home/lobster/documents/porter/porter.py
  - /home/lobster/documents/projects.md
  - /home/lobster/.claude/projects/-home-lobster/memory/MEMORY.md
notes: |
  v0.25.8 shipped. Moe changed plan mid-flight:
  - Kept "Chat" label (not "Bridge Control") but merged dispatch bar into Chat
  - Admin tab → "Logs" — removed Health, Services, Config (redundant/useless)
  - Rules to be moved to Projects tab in future sprint (project-specific rules)
