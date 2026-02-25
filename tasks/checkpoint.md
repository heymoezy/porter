# Checkpoint
project: porter
task: Porter v0.12.0 — Locations/Connectivity IA reframe
status: completed
step: 12 of 12
completed:
  - [x] Commit 1 — CSS additions (module-nav, module-panel, badge-*, ov-metric, sched-card, tool-card, audit-row)
  - [x] Commit 2 — HTML restructure (sidebar → module-nav with 10 items, 8 module panels, settings as module-panel)
  - [x] Commit 3 — JS module system (switchModule, openSettings/closeSettings/switchSettingsTab backward compat, loadOverview/loadSchedules/loadTools/loadAudit, init updated, ESC handler updated)
  - [x] Commit 4 — Python backend (GET/POST /api/overview /api/schedules /api/tools, cron helpers, agent clarity fields, DEFAULT_TOOL_POLICY)
  - [x] Commit 5 — Version bump v0.10.0 → v0.11.0 (docstring, footer, startup print, CHANGELOG entry)
  - [x] Gemini Fixes — Fix cron loop, broken step syntax, switchModule state loss, global theme toggle, and agent usage loading.
  - [x] Gemini Agent — Add Gemini CLI as a registered 'writer' agent.
  - [x] Version Bump — v0.11.0 → v0.11.5 for patch fixes.
  - [x] v0.11.6 polish — profile layout readability, Files/settings navigation coherence, disk footer moved into Files secondary rail.
  - [x] v0.11.7 UX correction — locations moved out of primary nav and into dedicated Files secondary rail.
  - [x] v0.11.8 clarity fix — breadcrumb root now shows full mounted path instead of ~/root-id.
  - [x] v0.11.9 nav reorder — Locations moved above Files; flow now Locations → Files → Agents → Tasks → Schedules → Policies.
  - [x] v0.11.9 changelog continuity — restored missing v0.11.2–v0.11.8 release entries.
  - [x] v0.11.10 Tailscale clarity — expose VPS Public IP and Tailscale IP; replace ambiguous "This device" label.
  - [x] v0.11.11 Settings overlay fix — all primary nav modules now close Settings and navigate as expected.
  - [x] v0.12.0 IA reframe — moved Tailscale/Connectivity from Settings into Locations module and added redirect for legacy entry.
next_action: n/a — all v0.12.0 requested UX updates complete.
modified_files:
  - /home/lobster/documents/porter/porter.py
  - /home/lobster/documents/porter/tasks/checkpoint.md
  - /home/lobster/documents/porter/CONTRIBUTING.md
notes: |
  Porter v0.11.6 implements the latest UX requests:
  1. Profile fields are stacked as Full name, preferred name, and email address.
  2. Password + confirmation are stacked on separate lines to avoid cramped UI in small windows.
  3. Settings now closes when entering Files from primary nav or location navigation.
  4. Files location choices + disk/item status are presented in the secondary location rail.
  5. Main-nav "What's new" remains removed; release notes stay in Settings footer entry.
  6. Changelog restored from earliest versions and extended with v0.11.6 notes.
