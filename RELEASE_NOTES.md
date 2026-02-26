# Porter Release Notes

## v0.12.79 (2026-02-26)

- Configure now expands to a full-pane Assistants workspace mode (dedicated right-side working area).
- Non-workspace controls are hidden while configuring to maximize editing focus and usable space.
- Closing workspace cleanly restores the normal Assistants panel.

---

## v0.12.78 (2026-02-26)

- Configure workspace now enters a cleaner dedicated mode by hiding global Assistants controls while editing.
- Closing workspace restores normal Assistants controls cleanly.
- Connectivity check modal text updated for transparency about current signal source vs upcoming true handshake test.

---

## v0.12.77 (2026-02-26)

- Fixed Configure flow: opening Configure now enters a dedicated Agent Workspace mode instead of appearing to do nothing.
- Workspace now hides assistant cards while active and restores them on Close.
- File navigator now auto-opens the first allowlisted file for immediate editing context.

---

## v0.12.76 (2026-02-26)

- Assistants: moved **Include internal/test assistants** toggle out of expandable card into a simple top-right inline control above cards.
- Cleanup: removed obsolete test agents from configuration (`Test Concurrency Agent`, `Conc Test Agent`, `Conc Test 2`).

---

## v0.12.75 (2026-02-26)

- Assistants: added per-card **Configure** action opening a full Agent Workspace panel.
- New Agent Workspace allows editing allowlisted config markdown files (`SOUL.md`, `USER.md`, `AGENTS.md`, `TOOLS.md`, `MEMORY.md`, `HEARTBEAT.md`, `memory/*.md`).
- Added authenticated workspace read/write APIs with path allowlisting.
- Added save auditing for workspace config writes and sensitive-file save confirmation flow.

---

## v0.12.74 (2026-02-26)

- Assistants: changed **Revoke** to **Disconnect** for clearer, friendlier UX language.
- Updated disconnect modal copy to reduce fear and explain reconnection path.
- Fixed rotate/disconnect modal handlers to execute properly.

---

## v0.12.73 (2026-02-26)

- Assistants: added per-card **Test** button to verify whether an assistant is actively connected.
- Added backend test action (`/api/agents` with `action=test_connection`) using recent heartbeat with usage-telemetry fallback.
- Test results are shown in a clear modal with connection state and last heartbeat timestamp when available.

---

## v0.12.72 (2026-02-26)

### Assistants Redesign
- Renamed Agents module to Assistants with a calmer, less technical presentation.
- Replaced default internal/test toggle row with disclosure-style "Show all assistants" control.
- Added masked-by-default API key rows with per-assistant eye toggle (show/hide) and copy action.
- Moved destructive actions to in-product modals for clearer, safer confirmations.
- Reduced technical clutter in default cards (advanced IDs/details now tucked behind disclosure).

### Trust + UX Improvements
- Maintained usage bars/risk states while simplifying on-card language for non-technical operators.
- Continued release governance discipline: version bump + changelog + release notes synced in one release.

---

## v0.12.71 (2026-02-26)

### UX + Operations
- Locations: added Devices header controls with mesh status, last-updated timestamp, and manual refresh action.
- Files: free-space/item context moved into a persistent bottom footer outside the scrollable file list.
- Agents: default view now prioritizes production agents and hides internal/test entries unless explicitly toggled.

### Usage + Guardrails
- Unified usage telemetry directly in each agent card.
- Added low-capacity progress bars, risk states, and per-card refresh action.
- Fixed usage null/0 handling and corrected remaining-capacity semantics.
- Added global + per-agent low-capacity warning thresholds that actively drive risk coloring.

### Operator Configuration
- Reworked technical controls into user-friendly language for setup/routing/memory/risk/approval.
- Added persistent operator preference controls in Agents module and save/refresh behavior via `/api/preferences`.

---

## v0.12.70 (2026-02-26)

- PEP/1 Phase 0 complete:
  - iPhone connect flow switched to client-first browser access guidance.
  - Non-iOS connect flow reframed to capability-first language.
  - SSH probe errors normalized into structured envelope (`code`, `message`, `retryable`).
  - Retry-aware SSH failure modal behavior.
  - Node connectivity state now tri-state (`online`, `relay`, `offline`).
  - 15s frontend request timeout enforcement to prevent hanging spinners.

---

## Notes
- These release notes are additive and intended for operator-facing tracking.
- For detailed historical entries, see in-app "What's new" changelog in `porter.py`.
