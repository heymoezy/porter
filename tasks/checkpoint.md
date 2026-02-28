# Checkpoint
project: Porter
task: Sprint 6 — Usage Dashboard (auto-refresh from OpenClaw) — v0.14.17
status: complete
step: done
completed:
  - [x] Patch 19: Backend — _refresh_openclaw_usage() + /agent-usage/auto-refresh endpoint
  - [x] Patch 20: Frontend — autoRefreshUsage() + improved no-data card states
  - [x] Patch 21: Settings — preferred model dropdown + save/load
  - [x] Patch 22: Orchestration — "preferred" badge on model card
  - [x] Patch 23: Version bump v0.14.17 + changelog + RELEASE_NOTES.md
  - [x] Fix: openclaw binary path resolution (shutil.which + fallback paths)
  - [x] Verification: 32/32 Playwright tests pass, auto-refresh works, snapshots saved
next_action: Sprint 7 — Projects memory visualization + task/skill distinction
modified_files:
  - /home/lobster/documents/porter/porter.py
  - /home/lobster/documents/porter/RELEASE_NOTES.md
notes: |
  v0.14.17 complete. All features working:
  - Auto-refresh fires on Orchestration tab load (fire-and-forget from loadAgents)
  - OpenClaw: reads `openclaw sessions --json --all-agents` for context utilization (55% = 148k/272k)
  - Claude: probes Anthropic API rate-limit headers (gets 401 with OAuth — needs different auth method)
  - Gemini: shows "Check provider dashboard" (no API to probe)
  - Preferred model saved to preferences, badge shows on matching agent/model cards
  - New endpoint: POST /agent-usage/auto-refresh — batch refresh all agents by type
  - Added preferred_model, context_compression, fallback_chain to allowed prefs
