# Porter Release Notes

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
