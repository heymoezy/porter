# PORTER_BUILD_LOG

## Purpose
Single source of truth for implementation progress so any agent session (Claude/Codex/OpenClaw) can recover context fast.

## 2026-02-25 — Rapid architecture and UX iteration

### Strategic decisions locked
- Locations owns topology + naming/governance.
- Files owns path attach/remove and cross-device file operations.
- Tailscale control is safety-gated (no risky disconnect flow in current infra).
- Every release is versioned with release notes/changelog updates.

### Key UX outcomes shipped
- Settings cleaned and split (Profile/Password/Billing), removed confusing connectivity spillover.
- Locations reworked into device-first naming table with nickname flow.
- Online/offline presence restored in Locations.
- Files sidebar improved with truncation/ellipsis and reduced wrap noise.
- Device nickname mapping now reflected in Files labels.

### Path attach status
- Local/server attach flow upgraded to folder picker (no blind typing for self device).
- Remote devices still need non-manual browse adapter (next major step).

### Next major deliverable (in progress)
- Cross-OS Porter Agent/Connector model:
  - Full agent: macOS/Linux/Windows
  - Mobile connector: iOS/Android
- Capability-driven Attach flow:
  - full_agent => live remote browse
  - mobile_connector => scoped picker/import flows

### Why this matters
Porter is not just file browsing; it is the trusted network fabric for connected agents/devices with memory-aware orchestration.


## 2026-02-25 — Release v0.12.59
- Files secondary nav ordering improved (self first, online next, offline last).
- Sidebar action labels compacted for narrow layout readability.
- Deterministic ordering reduces visual jitter between refreshes.
- Verification: py_compile OK, service restarted, listening on 127.0.0.1:8877.
- Risk: low (UI ordering/labels only).

## 2026-02-25 — Release v0.12.60
- Removed Tasks Wizard UI to reduce branching and cognitive load.
- Kept dynamic "Right now" guidance as primary in-context instruction.
- Simplified lane copy (Needs action / In progress / Completed) for faster scan.
- Verification: py_compile OK, service restarted, listening on 127.0.0.1:8877.
- Risk: low (UI simplification only).
