# Checkpoint
project: Porter
task: v0.25.2+ — Critical Fixes, Bridge Control, Governance
status: in_progress
step: 1 of 4
completed:
  - [ ] Patch A: Fix completed tasks visibility (v0.25.2)
  - [ ] Patch B: Governance rules + Gemini guardrails (v0.25.2)
  - [ ] Patch C: Cross-agent dialogue + Bridge Control (v0.25.3)
  - [ ] Patch D: Extensions live detection (v0.25.4)
next_action: Build and apply Patch A — fix JS status filter + DB migration
modified_files:
  - /home/lobster/documents/porter/porter.py
  - /home/lobster/documents/porter/porter_config.json
  - /home/lobster/CLAUDE.md
  - ~/.gemini/GEMINI.md
notes: |
  Key line numbers (verified via grep):
  - JS filter: line 8163 — needs 'done','completed' added
  - Second filter: line 12445 — same fix
  - canCancel/canDelete: lines 12408-12409 — same fix
  - _projDoneOpen: line 8017 — accordion default closed
  - _tregShowDone: line 12331 — default false
  - _treg_load(): line 1949 — add status normalization
  - _db_init(): line 136 — add agent_messages table
  - dispatch_agent(): line 15118 — wire to agent_messages
  - _emit_event(): line 15374 — wire to dispatch
  - Version strings: line 2, 5087, 6164, 15333, 16712, 19551
  - Valid statuses backend: line 19025
  - Chat route selector: line 5156, populateChatRoutes: line 9265
  - Orch module: line 5221, ends around 5265
